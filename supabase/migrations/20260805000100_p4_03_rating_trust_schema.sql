-- Phase 4 P4-03: rating trust schema.
--
-- Before this migration `POST /ratings` was the only write in the application
-- that did not go through a SECURITY DEFINER command: Express upserted the
-- `ratings` table directly on the service-role client. The eligibility rule was
-- enforced twice (a TypeScript guard and the `ratings_validate` trigger) but
-- nothing owned the decision transactionally, nothing was audited, and the
-- trigger only fired on `UPDATE OF appointment_id, customer_id, barber_id,
-- shop_id` -- so a score or comment edit was completely unguarded, which is
-- exactly where the seven-day edit window has to live.
--
-- This file adds the eligibility record, the review lifecycle columns, public
-- responses, reports, and the immutable rating event log. The commands and the
-- grant revocation live in the next migration.

-- ---------------------------------------------------------------------------
-- 0. Moderator capabilities
-- ---------------------------------------------------------------------------

-- Added here rather than in the commands migration because a new enum value
-- cannot be used in the transaction that creates it. Both values are only ever
-- referenced from plpgsql bodies, which resolve late, so this ordering is safe
-- whether the CLI applies one transaction per file or one for the whole replay.
alter type public.account_capability add value if not exists 'content_moderation';
alter type public.account_capability add value if not exists 'dispute_review';

-- ---------------------------------------------------------------------------
-- 1. Eligibility: the authoritative answer to "may this person rate this visit"
-- ---------------------------------------------------------------------------

create table public.rating_eligibilities (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete cascade,
  -- The *actual* provider, not the requested one. `public.barbers` is the right
  -- anchor because an owner-provider carries a shadow row there since D-028, so
  -- this column and `ratings.barber_id` cannot disagree.
  provider_id uuid not null references public.barbers(id) on delete restrict,
  source text not null check (source in ('appointment', 'walk_in')),
  appointment_id uuid references public.appointments(id) on delete cascade,
  walk_in_id uuid references public.walk_in_entries(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  visit_completed_at timestamptz not null,
  state text not null default 'open' check (state in ('open', 'used', 'void')),
  void_reason text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rating_eligibility_source_shape check (
    (source = 'appointment' and appointment_id is not null and walk_in_id is null)
    or (source = 'walk_in' and walk_in_id is not null and appointment_id is null)
  ),
  constraint rating_eligibility_void_reason check (
    (state = 'void') = (void_reason is not null)
  )
);

-- One completed visit unlocks exactly one eligibility, whichever way it arrives.
create unique index rating_eligibility_appointment_idx
  on public.rating_eligibilities (appointment_id) where appointment_id is not null;
create unique index rating_eligibility_walk_in_idx
  on public.rating_eligibilities (walk_in_id) where walk_in_id is not null;
create index rating_eligibility_customer_idx
  on public.rating_eligibilities (customer_id, state, visit_completed_at desc);
create index rating_eligibility_shop_idx
  on public.rating_eligibilities (shop_id, state, visit_completed_at desc);

create trigger rating_eligibilities_set_updated_at
  before update on public.rating_eligibilities
  for each row execute function private.set_updated_at();

-- Backfill every already-completed visit so history is rateable and so the
-- `not null` constraint added to `ratings.eligibility_id` below can be met.
insert into public.rating_eligibilities (
  shop_id, customer_id, provider_id, source, appointment_id, service_id, visit_completed_at
)
select
  appointment.shop_id,
  appointment.customer_id,
  appointment.barber_id,
  'appointment',
  appointment.id,
  appointment.service_id,
  coalesce(appointment.completed_at, appointment.actual_finished_at, appointment.updated_at)
from public.appointments as appointment
where appointment.status = 'completed'
  and exists (select 1 from public.barbers as b where b.id = appointment.barber_id)
on conflict do nothing;

insert into public.rating_eligibilities (
  shop_id, customer_id, provider_id, source, walk_in_id, service_id, visit_completed_at
)
select
  walk_in.shop_id,
  walk_in.customer_user_id,
  walk_in.assigned_provider_id,
  'walk_in',
  walk_in.id,
  walk_in.service_id,
  coalesce(walk_in.completed_at, walk_in.updated_at)
from public.walk_in_entries as walk_in
where walk_in.queue_status = 'completed'
  and walk_in.customer_user_id is not null
  and walk_in.assigned_provider_id is not null
  and exists (select 1 from public.barbers as b where b.id = walk_in.assigned_provider_id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. The review itself
-- ---------------------------------------------------------------------------

alter table public.ratings
  add column eligibility_id uuid references public.rating_eligibilities(id) on delete restrict,
  add column walk_in_id uuid references public.walk_in_entries(id) on delete cascade,
  add column version integer not null default 1 check (version > 0),
  -- Q15/plan section 2: seven days from the review's own creation. The window is
  -- stored rather than recomputed so an existing review's promise cannot move
  -- when the policy constant changes.
  add column editable_until timestamptz,
  add column edit_count integer not null default 0 check (edit_count >= 0),
  add column locked_at timestamptz,
  -- Moderation hides *text*. It never removes the score: see
  -- `private.recalculate_rating_aggregates` below.
  add column text_state text not null default 'visible' check (text_state in ('visible', 'hidden')),
  add column moderation_state text not null default 'none'
    check (moderation_state in ('none', 'reported', 'hidden', 'restored', 'cleared')),
  -- Q14: first name plus last initial by default, with an anonymous option.
  add column display_mode text not null default 'short_name'
    check (display_mode in ('short_name', 'anonymous'));

-- A walk-in review has no appointment, so the column can no longer be mandatory.
-- The unique constraint stays: Postgres allows repeated nulls in a unique index.
alter table public.ratings alter column appointment_id drop not null;

alter table public.ratings
  add constraint ratings_visit_shape check (
    (appointment_id is not null and walk_in_id is null)
    or (appointment_id is null and walk_in_id is not null)
  );

create unique index ratings_walk_in_idx on public.ratings (walk_in_id) where walk_in_id is not null;

update public.ratings as rating
set eligibility_id = eligibility.id,
    editable_until = rating.created_at + interval '7 days',
    locked_at = case when rating.created_at + interval '7 days' <= now() then rating.created_at + interval '7 days' end
from public.rating_eligibilities as eligibility
where eligibility.appointment_id = rating.appointment_id
  and rating.eligibility_id is null;

-- Any pre-existing rating whose appointment is no longer completed cannot be
-- anchored, and there is no honest eligibility to invent for it.
delete from public.ratings where eligibility_id is null;

alter table public.ratings
  alter column eligibility_id set not null,
  alter column editable_until set not null;
alter table public.ratings add constraint ratings_eligibility_unique unique (eligibility_id);

update public.rating_eligibilities as eligibility
set state = 'used', updated_at = now()
where eligibility.state = 'open'
  and exists (select 1 from public.ratings as r where r.eligibility_id = eligibility.id);

-- The old validator only knew about appointments and only ran when an identity
-- column changed. Replace it with an eligibility check that covers both visit
-- kinds and every column.
create or replace function private.validate_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligibility public.rating_eligibilities%rowtype;
begin
  select * into v_eligibility
  from public.rating_eligibilities
  where id = new.eligibility_id;
  if not found then
    raise exception using errcode = '23514', message = 'A rating requires an eligibility record.';
  end if;
  if v_eligibility.customer_id <> new.customer_id
    or v_eligibility.provider_id <> new.barber_id
    or v_eligibility.shop_id <> new.shop_id
    or v_eligibility.appointment_id is distinct from new.appointment_id
    or v_eligibility.walk_in_id is distinct from new.walk_in_id then
    raise exception using errcode = '23514', message = 'Rating does not match its eligibility record.';
  end if;
  if tg_op = 'INSERT' and v_eligibility.state <> 'open' then
    raise exception using errcode = '23514', message = 'This visit does not currently unlock a rating.';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_rating() from public, anon, authenticated, service_role;

drop trigger if exists ratings_validate on public.ratings;
create trigger ratings_validate
  before insert or update on public.ratings
  for each row execute function private.validate_rating();

-- Browser JWTs could write this table directly. `authenticated` held INSERT and
-- DELETE on `public.ratings`, and `ratings_insert_customer` /
-- `ratings_delete_customer` permitted both for the row's own customer. That made
-- PostgREST a second write path around Express: a customer could post a review
-- with no eligibility bookkeeping, and could DELETE a review they regretted at
-- any time, which defeats the seven-day immutability, the audit, and any public
-- response attached to it. Reads stay; writes become commands only.
drop policy if exists ratings_insert_customer on public.ratings;
drop policy if exists ratings_update_customer on public.ratings;
drop policy if exists ratings_delete_customer on public.ratings;
revoke insert, update, delete, truncate on table public.ratings from anon, authenticated;

-- `private.rating_matches_completed_appointment` is now unreachable: eligibility
-- is the authority and it understands walk-ins, which this helper never did.
drop function if exists private.rating_matches_completed_appointment(uuid, uuid, uuid, uuid);

-- ---------------------------------------------------------------------------
-- 3. One public response per authoring side
-- ---------------------------------------------------------------------------

create table public.rating_responses (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.ratings(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  author_role text not null check (author_role in ('shop_owner', 'barber')),
  body text not null check (char_length(btrim(body)) between 3 and 2000),
  -- Q15: editable for seven days, every version preserved in the audit.
  editable_until timestamptz not null,
  edit_count integer not null default 0 check (edit_count >= 0),
  text_state text not null default 'visible' check (text_state in ('visible', 'hidden')),
  moderation_state text not null default 'none'
    check (moderation_state in ('none', 'reported', 'hidden', 'restored', 'cleared')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index rating_response_one_per_side_idx
  on public.rating_responses (rating_id, author_role);
create index rating_response_shop_idx on public.rating_responses (shop_id, created_at desc);

create trigger rating_responses_set_updated_at
  before update on public.rating_responses
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Reports against review text or a public response
-- ---------------------------------------------------------------------------

create table public.rating_reports (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.ratings(id) on delete cascade,
  response_id uuid references public.rating_responses(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  target text not null check (target in ('review', 'response')),
  reporter_id uuid not null references public.users(id) on delete restrict,
  reporter_role text not null check (reporter_role in ('customer', 'barber', 'shop_owner')),
  reason_category text not null check (reason_category in (
    'abusive', 'spam', 'private_information', 'off_topic', 'not_a_customer', 'other'
  )),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  resolution_reason text check (resolution_reason is null or char_length(btrim(resolution_reason)) between 3 and 1000),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rating_report_target_shape check (
    (target = 'review' and response_id is null)
    or (target = 'response' and response_id is not null)
  ),
  constraint rating_report_resolution_shape check (
    (status = 'open') = (resolved_at is null)
  )
);
-- One open report per reporter per target. `coalesce` gives the review-target
-- rows a stable non-null key so the partial unique index covers both shapes.
create unique index rating_report_one_open_per_reporter_idx
  on public.rating_reports (rating_id, coalesce(response_id, '00000000-0000-0000-0000-000000000000'::uuid), reporter_id)
  where status = 'open';
create index rating_report_queue_idx on public.rating_reports (status, created_at);
create index rating_report_shop_idx on public.rating_reports (shop_id, status, created_at desc);

create trigger rating_reports_set_updated_at
  before update on public.rating_reports
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Immutable rating audit
-- ---------------------------------------------------------------------------

create table public.rating_events (
  id uuid primary key default gen_random_uuid(),
  -- Several events are appended inside one command, and `now()` is the
  -- transaction timestamp, so `created_at` alone cannot order them. An audit
  -- whose order is ambiguous is not much of an audit; this makes it total.
  seq bigint generated always as identity,
  shop_id uuid not null references public.shops(id) on delete cascade,
  eligibility_id uuid references public.rating_eligibilities(id) on delete cascade,
  rating_id uuid references public.ratings(id) on delete cascade,
  response_id uuid references public.rating_responses(id) on delete set null,
  report_id uuid references public.rating_reports(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  actor_role text not null check (actor_role in ('customer', 'barber', 'shop_owner', 'admin', 'system')),
  event_type text not null check (event_type in (
    'eligibility_opened', 'eligibility_voided', 'eligibility_restored',
    'rating_submitted', 'rating_edited', 'rating_locked',
    'response_published', 'response_edited',
    'report_opened', 'report_upheld', 'report_rejected',
    'text_hidden', 'text_restored'
  )),
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index rating_event_rating_idx on public.rating_events (rating_id, seq);
create index rating_event_shop_idx on public.rating_events (shop_id, seq desc);
create index rating_event_report_idx on public.rating_events (report_id, seq);

create trigger rating_events_immutable
  before update or delete on public.rating_events
  for each row execute function private.reject_p3_event_mutation();

-- ---------------------------------------------------------------------------
-- 6. Aggregates: hidden text keeps its score, a voided visit loses it
-- ---------------------------------------------------------------------------

-- A rating counts toward public averages while its eligibility is not `void`.
-- Text moderation is deliberately absent from this predicate, which is what
-- makes "a negative review remains scored after abusive text is hidden" true by
-- construction rather than by convention. Using `state <> 'void'` instead of
-- `state = 'used'` also keeps the result independent of whether the eligibility
-- has been marked used yet inside the submitting transaction.
create or replace function private.recalculate_rating_aggregates(
  p_shop_id uuid,
  p_provider_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_rating numeric;
  v_provider_count integer;
  v_shop_rating numeric;
  v_shop_count integer;
begin
  if p_provider_id is not null then
    select coalesce(round(avg(rating.barber_rating)::numeric, 2), 0), count(*)
    into v_provider_rating, v_provider_count
    from public.ratings as rating
    join public.rating_eligibilities as eligibility on eligibility.id = rating.eligibility_id
    where rating.barber_id = p_provider_id
      and eligibility.state <> 'void';

    update public.barbers
    set rating = v_provider_rating,
        rating_count = v_provider_count,
        updated_at = now()
    where id = p_provider_id;

    -- The owner-provider shadow row is mirrored one way from
    -- `owner_provider_profiles`, so writing only `public.barbers` would be undone
    -- the next time the capability changed. Keep the source of that mirror in
    -- step with the score it is about to copy.
    update public.owner_provider_profiles
    set rating = v_provider_rating,
        rating_count = v_provider_count,
        updated_at = now()
    where owner_id = p_provider_id;
  end if;

  if p_shop_id is not null then
    select coalesce(round(avg(rating.shop_rating)::numeric, 2), 0), count(*)
    into v_shop_rating, v_shop_count
    from public.ratings as rating
    join public.rating_eligibilities as eligibility on eligibility.id = rating.eligibility_id
    where rating.shop_id = p_shop_id
      and eligibility.state <> 'void';

    update public.shops
    set rating = v_shop_rating,
        rating_count = v_shop_count
    where id = p_shop_id;
  end if;
end;
$$;
revoke all on function private.recalculate_rating_aggregates(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function private.refresh_rating_aggregates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    perform private.recalculate_rating_aggregates(old.shop_id, old.barber_id);
  end if;
  if tg_op <> 'DELETE' and (
    tg_op = 'INSERT'
    or new.shop_id is distinct from old.shop_id
    or new.barber_id is distinct from old.barber_id
    or new.barber_rating is distinct from old.barber_rating
    or new.shop_rating is distinct from old.shop_rating
  ) then
    perform private.recalculate_rating_aggregates(new.shop_id, new.barber_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.refresh_rating_aggregates() from public, anon, authenticated, service_role;

-- Voiding or restoring an eligibility changes which scores are public, so the
-- aggregate has to follow eligibility state as well as the ratings table.
create or replace function private.refresh_aggregates_from_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state is distinct from old.state then
    perform private.recalculate_rating_aggregates(new.shop_id, new.provider_id);
  end if;
  return null;
end;
$$;
revoke all on function private.refresh_aggregates_from_eligibility() from public, anon, authenticated, service_role;

create trigger rating_eligibilities_refresh_aggregates
  after update of state on public.rating_eligibilities
  for each row execute function private.refresh_aggregates_from_eligibility();

-- ---------------------------------------------------------------------------
-- 7. Eligibility follows the visit, on every completion path
-- ---------------------------------------------------------------------------

-- Attached to the tables rather than to the commands, so auto-completion, the
-- closeout sweeper, dispute resolution, and manual transitions all agree.
create or replace function private.sync_appointment_rating_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligibility public.rating_eligibilities%rowtype;
begin
  select * into v_eligibility
  from public.rating_eligibilities
  where appointment_id = new.id;

  if new.status = 'completed' then
    if not exists (select 1 from public.barbers as b where b.id = new.barber_id) then
      return null;
    end if;
    if v_eligibility.id is null then
      insert into public.rating_eligibilities (
        shop_id, customer_id, provider_id, source, appointment_id, service_id, visit_completed_at
      )
      values (
        new.shop_id, new.customer_id, new.barber_id, 'appointment', new.id, new.service_id,
        coalesce(new.completed_at, new.actual_finished_at, now())
      )
      returning * into v_eligibility;
      insert into public.rating_events (shop_id, eligibility_id, actor_role, event_type, metadata)
      values (new.shop_id, v_eligibility.id, 'system', 'eligibility_opened',
        jsonb_build_object('source', 'appointment', 'appointment_id', new.id));
    elsif v_eligibility.state = 'void' then
      update public.rating_eligibilities
      set state = case when exists (select 1 from public.ratings as r where r.eligibility_id = v_eligibility.id)
                    then 'used' else 'open' end,
          void_reason = null,
          updated_at = now()
      where id = v_eligibility.id;
      insert into public.rating_events (shop_id, eligibility_id, actor_role, event_type, metadata)
      values (new.shop_id, v_eligibility.id, 'system', 'eligibility_restored',
        jsonb_build_object('from_status', old.status, 'to_status', new.status));
    end if;
  elsif v_eligibility.id is not null and v_eligibility.state <> 'void' then
    -- Disputed, cancelled, or reopened: the visit is no longer a finalized fact,
    -- so it must not unlock a rating and any existing score stops counting.
    update public.rating_eligibilities
    set state = 'void',
        void_reason = 'Visit is no longer a completed fact (' || new.status || ').',
        updated_at = now()
    where id = v_eligibility.id;
    insert into public.rating_events (shop_id, eligibility_id, actor_role, event_type, reason, metadata)
    values (new.shop_id, v_eligibility.id, 'system', 'eligibility_voided',
      'Visit is no longer a completed fact.',
      jsonb_build_object('from_status', old.status, 'to_status', new.status));
  end if;
  return null;
end;
$$;
revoke all on function private.sync_appointment_rating_eligibility() from public, anon, authenticated, service_role;

create trigger appointments_sync_rating_eligibility
  after update of status on public.appointments
  for each row when (new.status is distinct from old.status)
  execute function private.sync_appointment_rating_eligibility();

create or replace function private.sync_walk_in_rating_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligibility public.rating_eligibilities%rowtype;
begin
  select * into v_eligibility
  from public.rating_eligibilities
  where walk_in_id = new.id;

  -- A walk-in unlocks a rating only once it is completed *and* linked to a real
  -- account, and `customer_user_id` is only ever set by
  -- `api_link_walk_in_customer` after a verified guest claim with a matching
  -- phone. An unclaimed walk-in therefore cannot rate anything.
  if new.queue_status = 'completed'
    and new.customer_user_id is not null
    and new.assigned_provider_id is not null
    and exists (select 1 from public.barbers as b where b.id = new.assigned_provider_id)
  then
    if v_eligibility.id is null then
      insert into public.rating_eligibilities (
        shop_id, customer_id, provider_id, source, walk_in_id, service_id, visit_completed_at
      )
      values (
        new.shop_id, new.customer_user_id, new.assigned_provider_id, 'walk_in', new.id, new.service_id,
        coalesce(new.completed_at, now())
      )
      returning * into v_eligibility;
      insert into public.rating_events (shop_id, eligibility_id, actor_role, event_type, metadata)
      values (new.shop_id, v_eligibility.id, 'system', 'eligibility_opened',
        jsonb_build_object('source', 'walk_in', 'walk_in_id', new.id));
    elsif v_eligibility.state = 'void' then
      update public.rating_eligibilities
      set state = case when exists (select 1 from public.ratings as r where r.eligibility_id = v_eligibility.id)
                    then 'used' else 'open' end,
          void_reason = null,
          updated_at = now()
      where id = v_eligibility.id;
      insert into public.rating_events (shop_id, eligibility_id, actor_role, event_type, metadata)
      values (new.shop_id, v_eligibility.id, 'system', 'eligibility_restored',
        jsonb_build_object('walk_in_id', new.id));
    end if;
  elsif v_eligibility.id is not null and v_eligibility.state <> 'void' then
    update public.rating_eligibilities
    set state = 'void',
        void_reason = 'Walk-in visit is no longer a completed linked fact (' || new.queue_status || ').',
        updated_at = now()
    where id = v_eligibility.id;
    insert into public.rating_events (shop_id, eligibility_id, actor_role, event_type, reason, metadata)
    values (new.shop_id, v_eligibility.id, 'system', 'eligibility_voided',
      'Walk-in visit is no longer a completed linked fact.',
      jsonb_build_object('queue_status', new.queue_status));
  end if;
  return null;
end;
$$;
revoke all on function private.sync_walk_in_rating_eligibility() from public, anon, authenticated, service_role;

create trigger walk_ins_sync_rating_eligibility
  after update of queue_status, customer_user_id, assigned_provider_id on public.walk_in_entries
  for each row execute function private.sync_walk_in_rating_eligibility();

-- ---------------------------------------------------------------------------
-- 8. Access: browser JWTs read, only commands write
-- ---------------------------------------------------------------------------

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'rating_eligibilities', 'rating_responses', 'rating_reports', 'rating_events'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon, authenticated', target_table);
    execute format('grant all on table public.%I to service_role', target_table);
  end loop;
end $$;

grant select on public.rating_eligibilities, public.rating_responses to authenticated;
grant select on public.rating_responses to anon;

create policy rating_eligibility_participant_read on public.rating_eligibilities
  for select to authenticated
  using (customer_id = (select auth.uid()) or provider_id = (select auth.uid()) or private.owns_shop(shop_id));

-- A published response is public trust content, exactly like the review it
-- answers, so anonymous discovery may read it while its text is visible.
create policy rating_response_public_read on public.rating_responses
  for select to anon using (text_state = 'visible');
create policy rating_response_read on public.rating_responses
  for select to authenticated
  using (text_state = 'visible' or author_id = (select auth.uid()) or private.owns_shop(shop_id));
