-- Phase 4 P4-01: conversation membership, context, blocking, limits, retention.
--
-- Measured before writing this: `requireConversationAccess` and
-- `private.is_conversation_participant` already recheck active employment on the
-- barber branch, so a former or suspended barber is already refused, including on
-- a guessed conversation id. That half of the packet was real, and the
-- regressions in `apps/api/test/phase4-messaging.integration.test.ts` pin it
-- rather than rebuild it.
--
-- What was actually missing: conversation creation was the last write in
-- `chat.ts` that used a direct `.insert()` on the service-role client, there was
-- no context beyond `kind`, no block or report, no send rate limit, no cursor
-- pagination, and no retention rule at all.

-- Context. A customer-shop thread that grew out of one booking should say so, and
-- the reader should not have to guess from message text.
alter table public.conversations
  add column appointment_id uuid references public.appointments(id) on delete set null,
  add column archived_at timestamptz,
  add column archive_reason text check (archive_reason is null or char_length(btrim(archive_reason)) between 3 and 500);

create index conversation_appointment_idx on public.conversations (appointment_id)
  where appointment_id is not null;
-- Cursor pagination reads newest-first within one conversation.
create index message_conversation_cursor_idx on public.messages (conversation_id, created_at desc, id desc);

/**
 * Blocking suppresses direct messages between two people and nothing else.
 * Booking, security, and other required notices travel through
 * `notification_outbox`, which this table deliberately does not touch: a customer
 * who blocks a shop still has to be told their appointment moved.
 */
create table public.conversation_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint conversation_block_not_self check (blocker_id <> blocked_id)
);
create index conversation_block_blocked_idx on public.conversation_blocks (blocked_id);

create table public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reporter_id uuid not null references public.users(id) on delete restrict,
  reason_category text not null check (reason_category in (
    'abusive', 'spam', 'scam', 'private_information', 'off_platform_payment', 'other'
  )),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);
create unique index conversation_report_one_open_idx
  on public.conversation_reports (conversation_id, reporter_id) where status = 'open';

do $$
declare
  target_table text;
begin
  foreach target_table in array array['conversation_blocks', 'conversation_reports'] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon, authenticated', target_table);
    execute format('grant all on table public.%I to service_role', target_table);
  end loop;
end $$;

grant select on public.conversation_blocks to authenticated;
create policy conversation_block_self_read on public.conversation_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Conversation creation becomes a command
-- ---------------------------------------------------------------------------

create or replace function private.lock_conversation_command(p_shop_id uuid, p_peer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('conversation:' || p_shop_id::text || ':' || coalesce(p_peer_id::text, ''), 0)
  );
end;
$$;
revoke all on function private.lock_conversation_command(uuid, uuid) from public, anon, authenticated, service_role;

/**
 * Idempotent by construction: one customer-shop thread per pair. Express used to
 * check for an existing row and then insert, which is a race with itself; the
 * advisory lock plus the existing-row read inside one transaction is not.
 */
create or replace function public.api_open_customer_conversation(
  p_customer_id uuid,
  p_shop_id uuid,
  p_appointment_id uuid default null,
  p_barber_id uuid default null
)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_barber_id uuid;
begin
  perform private.lock_conversation_command(p_shop_id, p_customer_id);

  -- Validated before either branch, deliberately. Doing this only on the
  -- create path let a caller attach any existing appointment id to a thread they
  -- already owned, and made a non-existent id surface as a raw foreign-key
  -- violation instead of a refusal that says what is wrong.
  if p_appointment_id is not null and not exists (
    select 1 from public.appointments
    where id = p_appointment_id and customer_id = p_customer_id and shop_id = p_shop_id
  ) then
    raise exception using errcode = '42501', message = 'That booking is not yours at this shop.';
  end if;

  select * into v_conversation
  from public.conversations
  where kind = 'customer_shop' and customer_id = p_customer_id and shop_id = p_shop_id;
  if found then
    -- Attaching context to an existing thread is allowed and is not a new thread.
    if p_appointment_id is not null and v_conversation.appointment_id is null then
      update public.conversations set appointment_id = p_appointment_id
      where id = v_conversation.id returning * into v_conversation;
    end if;
    return v_conversation;
  end if;

  -- A shop with nobody who can answer is not a conversation, it is a dead end.
  -- `p_barber_id` lets a customer reach the provider they actually booked with
  -- instead of whoever was hired first; without it the historical
  -- first-by-hire-date behaviour is preserved exactly.
  select employment.barber_id into v_barber_id
  from public.barber_employment as employment
  join public.users as profile on profile.id = employment.barber_id
  where employment.shop_id = p_shop_id
    and employment.status = 'active'
    and employment.ended_at is null
    and profile.role = 'barber'
    and profile.requested_role = 'barber'
    and profile.verification_status = 'verified'
    and profile.onboarding_completed
    and (p_barber_id is null or employment.barber_id = p_barber_id)
  order by employment.hired_at
  limit 1;
  if v_barber_id is null then
    raise exception using errcode = 'P4021',
      message = case
        when p_barber_id is null then 'This shop has no active verified barber to receive messages.'
        else 'That barber is not active at this shop.'
      end;
  end if;

  insert into public.conversations (kind, customer_id, shop_id, barber_id, appointment_id)
  values ('customer_shop', p_customer_id, p_shop_id, v_barber_id, p_appointment_id)
  returning * into v_conversation;
  return v_conversation;
end;
$$;

create or replace function public.api_open_staff_conversation(
  p_owner_id uuid,
  p_barber_id uuid
)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_conversation public.conversations%rowtype;
begin
  select id into v_shop_id from public.shops where owner_id = p_owner_id;
  if v_shop_id is null then
    raise exception using errcode = 'P0002', message = 'Owner shop not found.';
  end if;
  perform private.lock_conversation_command(v_shop_id, p_barber_id);
  -- Active employment is the membership rule, checked here as well as in Express
  -- and again in `private.is_conversation_participant` on every send.
  if not private.is_active_barber_for_shop(v_shop_id, p_barber_id) then
    raise exception using errcode = '42501', message = 'Barber is not active in your shop.';
  end if;

  select * into v_conversation
  from public.conversations
  where kind = 'staff' and customer_id = p_owner_id and shop_id = v_shop_id and barber_id = p_barber_id;
  if found then return v_conversation; end if;

  insert into public.conversations (kind, customer_id, shop_id, barber_id)
  values ('staff', p_owner_id, v_shop_id, p_barber_id)
  returning * into v_conversation;
  return v_conversation;
end;
$$;

-- ---------------------------------------------------------------------------
-- Send: blocking and rate limits, enforced where they cannot be skipped
-- ---------------------------------------------------------------------------

create or replace function public.api_send_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
  v_body text := btrim(p_body);
  v_peer_id uuid;
  v_recent integer;
begin
  select conversation.* into v_conversation
  from public.conversations as conversation
  where conversation.id = p_conversation_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Conversation not found.';
  end if;

  if p_sender_id = v_conversation.barber_id then
    perform private.lock_current_barber_employment(v_conversation.barber_id, v_conversation.shop_id);
  end if;

  -- Unchanged from the original command, and still the authority: a former or
  -- suspended barber fails here even if every layer above it were bypassed.
  if not private.is_conversation_participant(p_conversation_id, p_sender_id) then
    raise exception using errcode = '42501',
      message = 'You are not a current participant in this conversation.';
  end if;

  if v_conversation.archived_at is not null then
    raise exception using errcode = 'P4021', message = 'This conversation is archived and read-only.';
  end if;

  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception using errcode = '22023', message = 'Message body must contain 1 to 4000 characters.';
  end if;

  -- The other side of this thread, for the block check.
  v_peer_id := case
    when p_sender_id = v_conversation.customer_id then v_conversation.barber_id
    else v_conversation.customer_id
  end;
  if exists (
    select 1 from public.conversation_blocks
    where (blocker_id = v_peer_id and blocked_id = p_sender_id)
       or (blocker_id = p_sender_id and blocked_id = v_peer_id)
  ) then
    raise exception using errcode = 'P4036',
      message = 'Direct messages are blocked between these accounts. Required booking notices still arrive.';
  end if;

  -- Send rate limit. Enforced in the command, not in Express, because Express is
  -- a guard and a limit that can be skipped by calling the RPC is not a limit.
  select count(*) into v_recent
  from public.messages
  where conversation_id = p_conversation_id
    and sender_id = p_sender_id
    and created_at > now() - interval '1 minute';
  if v_recent >= 20 then
    raise exception using errcode = 'P4037',
      message = 'Too many messages in a short time. Please wait a moment.';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, p_sender_id, v_body)
  returning * into v_message;
  return v_message;
end;
$$;

create or replace function public.api_set_conversation_block(
  p_blocker_id uuid,
  p_blocked_id uuid,
  p_blocked boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_blocker_id = p_blocked_id then
    raise exception using errcode = '22023', message = 'You cannot block your own account.';
  end if;
  -- Only somebody you actually share a conversation with can be blocked, so this
  -- cannot be used to probe for the existence of arbitrary accounts.
  if not exists (
    select 1 from public.conversations
    where (customer_id = p_blocker_id and barber_id = p_blocked_id)
       or (barber_id = p_blocker_id and customer_id = p_blocked_id)
  ) then
    raise exception using errcode = '42501', message = 'You have no conversation with that account.';
  end if;

  if p_blocked then
    insert into public.conversation_blocks (blocker_id, blocked_id, reason)
    values (p_blocker_id, p_blocked_id, nullif(btrim(coalesce(p_reason, '')), ''))
    on conflict (blocker_id, blocked_id) do update set reason = excluded.reason;
  else
    delete from public.conversation_blocks where blocker_id = p_blocker_id and blocked_id = p_blocked_id;
  end if;
  return p_blocked;
end;
$$;

create or replace function public.api_report_conversation(
  p_conversation_id uuid,
  p_message_id uuid,
  p_reporter_id uuid,
  p_reason_category text,
  p_reason text
)
returns public.conversation_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.conversation_reports%rowtype;
begin
  if not private.is_conversation_participant(p_conversation_id, p_reporter_id) then
    raise exception using errcode = '42501', message = 'You are not a participant in this conversation.';
  end if;
  if p_reason_category not in ('abusive', 'spam', 'scam', 'private_information', 'off_platform_payment', 'other') then
    raise exception using errcode = '22023', message = 'Unknown report category.';
  end if;
  if p_message_id is not null and not exists (
    select 1 from public.messages where id = p_message_id and conversation_id = p_conversation_id
  ) then
    raise exception using errcode = 'P0002', message = 'That message is not in this conversation.';
  end if;

  insert into public.conversation_reports (conversation_id, message_id, reporter_id, reason_category, reason)
  values (p_conversation_id, p_message_id, p_reporter_id, p_reason_category, btrim(p_reason))
  returning * into v_report;
  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention: two years by default (plan section 3)
-- ---------------------------------------------------------------------------

/**
 * Deletes message bodies past the retention window and archives the conversation
 * shell, so a thread's existence and participants survive for operational history
 * while its content does not outlive its stated retention.
 */
create or replace function public.api_purge_expired_messages(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purged integer;
begin
  with expired as (
    select id from public.messages
    where created_at < now() - interval '2 years'
    order by created_at
    limit greatest(p_limit, 1)
  )
  delete from public.messages where id in (select id from expired);
  get diagnostics v_purged = row_count;

  -- A conversation with nothing left inside it and no activity for two years is
  -- archived rather than deleted: employment and dispute history may still point
  -- at it, and losing the participants would break that trail.
  update public.conversations
  set archived_at = now(),
      archive_reason = 'Message retention window of two years elapsed.'
  where archived_at is null
    and last_message_at is not null
    and last_message_at < now() - interval '2 years'
    and not exists (select 1 from public.messages where conversation_id = conversations.id);
  return v_purged;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'public.api_open_customer_conversation(uuid, uuid, uuid, uuid)',
    'public.api_open_staff_conversation(uuid, uuid)',
    'public.api_send_message(uuid, uuid, text)',
    'public.api_set_conversation_block(uuid, uuid, boolean, text)',
    'public.api_report_conversation(uuid, uuid, uuid, text, text)',
    'public.api_purge_expired_messages(integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', target);
    execute format('grant execute on function %s to service_role', target);
  end loop;
end $$;

-- Express no longer writes `conversations` directly. `messages` keeps no write
-- grant either; both go through the commands above.
revoke insert, update, delete, truncate on table public.conversations from service_role;
revoke insert, update, delete, truncate on table public.conversation_blocks from service_role;
revoke insert, update, delete, truncate on table public.conversation_reports from service_role;

-- Two more write paths that would have walked around the new controls, both found
-- by measuring grants rather than by reading code:
--
-- 1. `authenticated` held INSERT on `conversations` with a permissive policy, so a
--    browser JWT could open a thread through PostgREST without Express. The policy
--    checked participation, so this was never privilege escalation, but it was a
--    second creation path that skipped the idempotency lock and the
--    no-verified-barber refusal.
-- 2. `service_role` held INSERT/UPDATE/DELETE on `messages`. A block and a send
--    rate limit that live inside `api_send_message` are not limits at all if a
--    caller can insert the row itself, so those grants had to go with them.
drop policy if exists conversations_insert_participant on public.conversations;
revoke insert, update, delete, truncate on table public.conversations from anon, authenticated;
revoke insert, update, delete, truncate on table public.messages from anon, authenticated, service_role;
