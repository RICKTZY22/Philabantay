-- P1-03 follow-up: serialize staff capabilities with employment revocation.
--
-- The Express API uses the service role, so a route-level authorization check
-- and a later table write would otherwise be two independent transactions.
-- Every command below takes the same per-barber advisory lock as
-- api_end_employment, then re-checks the committed employment/profile state
-- before mutating staff-owned data.

create or replace function private.lock_current_employment(
  p_employment_id uuid
)
returns public.barber_employment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barber_id uuid;
  v_employment public.barber_employment%rowtype;
begin
  select employment.barber_id
  into v_barber_id
  from public.barber_employment as employment
  where employment.id = p_employment_id;

  if v_barber_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Employment record not found.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'appointment:barber:' || v_barber_id::text,
      0
    )
  );

  select employment.*
  into v_employment
  from public.barber_employment as employment
  join public.barbers as barber
    on barber.id = employment.barber_id
  join public.users as profile
    on profile.id = barber.id
  where employment.id = p_employment_id
    and employment.status = 'active'
    and employment.ended_at is null
    and employment.hired_at <= (now() at time zone 'Asia/Manila')::date
    and profile.role = 'barber'
    and profile.requested_role = 'barber'
    and profile.verification_status = 'verified'
    and profile.onboarding_completed
  for update of employment;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'A current verified employment is required.';
  end if;

  return v_employment;
end;
$$;

create or replace function private.lock_current_barber_employment(
  p_barber_id uuid,
  p_shop_id uuid default null
)
returns public.barber_employment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employment public.barber_employment%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'appointment:barber:' || p_barber_id::text,
      0
    )
  );

  select employment.*
  into v_employment
  from public.barber_employment as employment
  join public.barbers as barber
    on barber.id = employment.barber_id
  join public.users as profile
    on profile.id = barber.id
  where employment.barber_id = p_barber_id
    and (p_shop_id is null or employment.shop_id = p_shop_id)
    and employment.status = 'active'
    and employment.ended_at is null
    and employment.hired_at <= (now() at time zone 'Asia/Manila')::date
    and profile.role = 'barber'
    and profile.requested_role = 'barber'
    and profile.verification_status = 'verified'
    and profile.onboarding_completed
  order by employment.hired_at desc
  limit 1
  for update of employment;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'A current verified employment is required.';
  end if;

  return v_employment;
end;
$$;

revoke all on function private.lock_current_employment(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_current_barber_employment(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Existing insert/update triggers now share the revocation lock. This protects
-- direct authenticated writes as well as service-role commands.
create or replace function private.require_active_employment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employment public.barber_employment%rowtype;
begin
  select *
  into v_employment
  from private.lock_current_employment(new.employment_id);

  if v_employment.barber_id <> new.barber_id
      or v_employment.shop_id <> new.shop_id then
    raise exception using
      errcode = '23514',
      message = 'Staff record does not match the current employment.';
  end if;

  return new;
end;
$$;

-- Revocation values (off/false) must remain writable by api_end_employment.
-- Enabling either live capability requires a current employment and shares
-- the employment-ending lock.
create or replace function private.lock_barber_capability_enablement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.shift_status = 'on' and new.shift_status is distinct from old.shift_status)
      or (new.accepting_bookings and new.accepting_bookings is distinct from old.accepting_bookings) then
    perform private.lock_current_barber_employment(new.id, null);
  end if;

  return new;
end;
$$;

revoke all on function private.lock_barber_capability_enablement()
  from public, anon, authenticated, service_role;

drop trigger if exists barbers_00_lock_capability_enablement on public.barbers;
create trigger barbers_00_lock_capability_enablement
  before update of shift_status, accepting_bookings on public.barbers
  for each row execute function private.lock_barber_capability_enablement();

create or replace function public.api_set_barber_shift_status(
  p_barber_id uuid,
  p_on boolean
)
returns public.barbers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barber public.barbers%rowtype;
begin
  perform private.lock_current_barber_employment(p_barber_id, null);

  update public.barbers
  set shift_status = case when p_on then 'on'::public.barber_shift_status else 'off'::public.barber_shift_status end
  where id = p_barber_id
  returning * into v_barber;

  return v_barber;
end;
$$;

create or replace function public.api_set_barber_accepting_bookings(
  p_barber_id uuid,
  p_accepting boolean
)
returns public.barbers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barber public.barbers%rowtype;
begin
  perform private.lock_current_barber_employment(p_barber_id, null);

  update public.barbers
  set accepting_bookings = p_accepting
  where id = p_barber_id
  returning * into v_barber;

  return v_barber;
end;
$$;

-- Replace the earlier transaction helper with an employment-aware version.
create or replace function public.api_replace_shift_patterns(
  p_employment_id uuid,
  p_rules jsonb
)
returns setof public.shift_patterns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employment public.barber_employment%rowtype;
begin
  select *
  into v_employment
  from private.lock_current_employment(p_employment_id);

  if jsonb_typeof(p_rules) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'Shift rules must be a JSON array.';
  end if;

  if jsonb_array_length(p_rules) > 28 then
    raise exception using
      errcode = '22023',
      message = 'At most 28 shift rules are allowed.';
  end if;

  delete from public.shift_patterns
  where employment_id = p_employment_id;

  insert into public.shift_patterns (
    employment_id,
    barber_id,
    shop_id,
    weekday,
    start_time,
    end_time
  )
  select
    v_employment.id,
    v_employment.barber_id,
    v_employment.shop_id,
    rule.weekday,
    rule.start_time,
    rule.end_time
  from jsonb_to_recordset(p_rules) as rule(
    weekday smallint,
    start_time time without time zone,
    end_time time without time zone
  );

  return query
  select pattern.*
  from public.shift_patterns as pattern
  where pattern.employment_id = p_employment_id
  order by pattern.weekday, pattern.start_time;
end;
$$;

create or replace function public.api_create_shift_exception(
  p_employment_id uuid,
  p_date date,
  p_is_available boolean,
  p_start_time time without time zone default null,
  p_end_time time without time zone default null,
  p_reason text default null
)
returns public.shift_exceptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employment public.barber_employment%rowtype;
  v_exception public.shift_exceptions%rowtype;
begin
  select *
  into v_employment
  from private.lock_current_employment(p_employment_id);

  insert into public.shift_exceptions (
    employment_id,
    barber_id,
    shop_id,
    date,
    is_available,
    start_time,
    end_time,
    reason
  ) values (
    v_employment.id,
    v_employment.barber_id,
    v_employment.shop_id,
    p_date,
    p_is_available,
    p_start_time,
    p_end_time,
    nullif(btrim(p_reason), '')
  )
  returning * into v_exception;

  return v_exception;
end;
$$;

create or replace function public.api_remove_shift_exception(
  p_exception_id uuid,
  p_barber_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exception public.shift_exceptions%rowtype;
  v_employment public.barber_employment%rowtype;
begin
  select exception.*
  into v_exception
  from public.shift_exceptions as exception
  where exception.id = p_exception_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Shift exception not found.';
  end if;

  select *
  into v_employment
  from private.lock_current_employment(v_exception.employment_id);

  if v_exception.barber_id <> p_barber_id
      or v_employment.barber_id <> p_barber_id then
    raise exception using
      errcode = '42501',
      message = 'You can only remove an exception from your current employment.';
  end if;

  delete from public.shift_exceptions
  where id = p_exception_id;

  return true;
end;
$$;

create or replace function public.api_create_shift_change_request(
  p_employment_id uuid,
  p_date date,
  p_message text
)
returns public.shift_change_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employment public.barber_employment%rowtype;
  v_request public.shift_change_requests%rowtype;
begin
  select *
  into v_employment
  from private.lock_current_employment(p_employment_id);

  insert into public.shift_change_requests (
    employment_id,
    barber_id,
    shop_id,
    date,
    message,
    status
  ) values (
    v_employment.id,
    v_employment.barber_id,
    v_employment.shop_id,
    p_date,
    btrim(p_message),
    'pending'
  )
  returning * into v_request;

  return v_request;
end;
$$;

-- Conversation creation is also serialized with termination. A conversation
-- may remain as history after a barber leaves, but a new one cannot be routed
-- to a former, future, unverified, or suspended staff member.
create or replace function private.validate_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_current_barber_employment(new.barber_id, new.shop_id);

  if new.kind = 'customer_shop' then
    if not exists (
      select 1
      from public.users as profile
      where profile.id = new.customer_id
        and profile.role = 'customer'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Customer conversation requires a customer account.';
    end if;
  elsif not private.owns_shop(new.shop_id, new.customer_id) then
    raise exception using
      errcode = '23514',
      message = 'Staff conversation must be opened by the shop owner.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_message_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
begin
  select conversation.*
  into v_conversation
  from public.conversations as conversation
  where conversation.id = new.conversation_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Conversation not found.';
  end if;

  if new.sender_id = v_conversation.barber_id then
    perform private.lock_current_barber_employment(
      v_conversation.barber_id,
      v_conversation.shop_id
    );
  end if;

  if not private.is_conversation_participant(new.conversation_id, new.sender_id) then
    raise exception using
      errcode = '42501',
      message = 'Message sender is not a current conversation participant.';
  end if;

  return new;
end;
$$;

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
begin
  select conversation.*
  into v_conversation
  from public.conversations as conversation
  where conversation.id = p_conversation_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Conversation not found.';
  end if;

  if p_sender_id = v_conversation.barber_id then
    perform private.lock_current_barber_employment(
      v_conversation.barber_id,
      v_conversation.shop_id
    );
  end if;

  if not private.is_conversation_participant(p_conversation_id, p_sender_id) then
    raise exception using
      errcode = '42501',
      message = 'You are not a current participant in this conversation.';
  end if;

  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception using
      errcode = '22023',
      message = 'Message body must contain 1 to 4000 characters.';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, p_sender_id, v_body)
  returning * into v_message;

  return v_message;
end;
$$;

create or replace function public.api_mark_conversation_read(
  p_conversation_id uuid,
  p_reader_id uuid,
  p_read_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_count integer;
begin
  select conversation.*
  into v_conversation
  from public.conversations as conversation
  where conversation.id = p_conversation_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Conversation not found.';
  end if;

  if p_reader_id = v_conversation.barber_id then
    perform private.lock_current_barber_employment(
      v_conversation.barber_id,
      v_conversation.shop_id
    );
  end if;

  if not private.is_conversation_participant(p_conversation_id, p_reader_id) then
    raise exception using
      errcode = '42501',
      message = 'You are not a current participant in this conversation.';
  end if;

  update public.messages
  set read_at = p_read_at
  where conversation_id = p_conversation_id
    and sender_id <> p_reader_id
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Joining by code is one command, so an employment ending or join-code
-- rotation cannot slip between independent lookup/check/insert requests.
create or replace function public.api_join_shop_by_code(
  p_barber_id uuid,
  p_code text
)
returns public.barber_employment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_employment public.barber_employment%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'appointment:barber:' || p_barber_id::text,
      0
    )
  );

  if not exists (
    select 1
    from public.users as profile
    join public.barbers as barber on barber.id = profile.id
    where profile.id = p_barber_id
      and profile.role = 'barber'
      and profile.requested_role = 'barber'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
  ) then
    raise exception using
      errcode = '42501',
      message = 'A verified and onboarded barber account is required.';
  end if;

  select join_code.shop_id
  into v_shop_id
  from public.shop_join_codes as join_code
  where join_code.code = upper(btrim(p_code))
  for share;

  if v_shop_id is null then
    raise exception using
      errcode = 'P4041',
      message = 'Shop join code is invalid.';
  end if;

  if exists (
    select 1
    from public.barber_employment as employment
    where employment.barber_id = p_barber_id
      and employment.shop_id = v_shop_id
      and employment.status = 'resigned'
  ) then
    raise exception using
      errcode = 'P4093',
      message = 'A former staff member must apply again and receive owner approval before rejoining this shop.';
  end if;

  if exists (
    select 1
    from public.barber_employment as employment
    where employment.barber_id = p_barber_id
      and employment.status = 'active'
      and employment.ended_at is null
  ) then
    raise exception using
      errcode = 'P4094',
      message = 'End the current employment before joining another shop.';
  end if;

  insert into public.barber_employment (
    barber_id,
    shop_id,
    status,
    hired_at
  ) values (
    p_barber_id,
    v_shop_id,
    'active',
    (now() at time zone 'Asia/Manila')::date
  )
  returning * into v_employment;

  return v_employment;
end;
$$;

revoke all on function public.api_set_barber_shift_status(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.api_set_barber_accepting_bookings(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.api_replace_shift_patterns(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.api_create_shift_exception(uuid, date, boolean, time without time zone, time without time zone, text)
  from public, anon, authenticated;
revoke all on function public.api_remove_shift_exception(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_create_shift_change_request(uuid, date, text)
  from public, anon, authenticated;
revoke all on function public.api_send_message(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.api_mark_conversation_read(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.api_join_shop_by_code(uuid, text)
  from public, anon, authenticated;

grant execute on function public.api_set_barber_shift_status(uuid, boolean)
  to service_role;
grant execute on function public.api_set_barber_accepting_bookings(uuid, boolean)
  to service_role;
grant execute on function public.api_replace_shift_patterns(uuid, jsonb)
  to service_role;
grant execute on function public.api_create_shift_exception(uuid, date, boolean, time without time zone, time without time zone, text)
  to service_role;
grant execute on function public.api_remove_shift_exception(uuid, uuid)
  to service_role;
grant execute on function public.api_create_shift_change_request(uuid, date, text)
  to service_role;
grant execute on function public.api_send_message(uuid, uuid, text)
  to service_role;
grant execute on function public.api_mark_conversation_read(uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.api_join_shop_by_code(uuid, text)
  to service_role;
