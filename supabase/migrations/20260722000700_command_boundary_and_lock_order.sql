-- P1-01/P1-03 adversarial hardening.
--
-- 1. Professional commands lock the profile/barber rows they use for
--    verification so suspension and command execution have a linear order.
-- 2. Appointment lifecycle, reschedule, and reassignment commands share one
--    per-appointment command lock before taking capacity or row locks.
-- 3. Reassignment validates the immutable booking snapshot rather than the
--    mutable current service record.
-- 4. Staff/chat writes that now have Express command endpoints cannot be
--    performed directly with an authenticated browser JWT.

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
  for update of employment, barber, profile;

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
  for update of employment, barber, profile;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'A current verified employment is required.';
  end if;

  return v_employment;
end;
$$;

-- Employment creation must make the same verification decision while holding
-- both the per-barber command lock and the profile rows. This is the final
-- guard for join-code and owner-approval commands.
create or replace function private.validate_barber_employment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'appointment:barber:' || new.barber_id::text,
      0
    )
  );

  perform 1
  from public.users as profile
  join public.barbers as barber
    on barber.id = profile.id
  where profile.id = new.barber_id
    and profile.role = 'barber'
    and profile.requested_role = 'barber'
    and profile.verification_status = 'verified'
    and profile.onboarding_completed
  for update of profile, barber;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Employment requires a verified and onboarded barber profile.';
  end if;

  return new;
end;
$$;

revoke all on function private.lock_current_employment(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_current_barber_employment(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.validate_barber_employment()
  from public, anon, authenticated, service_role;

-- These mutations are Express-command-only. SELECT remains available through
-- the existing RLS policies, and the service-role API keeps its table grants.
revoke update (shift_status, accepting_bookings) on table public.barbers
  from authenticated;
revoke insert, update, delete on table public.shift_patterns
  from authenticated;
revoke insert, update, delete on table public.shift_exceptions
  from authenticated;
revoke insert on table public.shift_change_requests
  from authenticated;
revoke insert on table public.messages
  from authenticated;
revoke update (read_at) on table public.messages
  from authenticated;
revoke insert on table public.barber_applications
  from authenticated;
revoke update (status) on table public.barber_applications
  from authenticated;

drop policy if exists shift_patterns_insert_staff on public.shift_patterns;
drop policy if exists shift_patterns_update_staff on public.shift_patterns;
drop policy if exists shift_patterns_delete_staff on public.shift_patterns;
drop policy if exists shift_exceptions_insert_staff on public.shift_exceptions;
drop policy if exists shift_exceptions_update_staff on public.shift_exceptions;
drop policy if exists shift_exceptions_delete_staff on public.shift_exceptions;
drop policy if exists shift_change_requests_insert_barber on public.shift_change_requests;
drop policy if exists messages_insert_sender on public.messages;
drop policy if exists messages_mark_received_read on public.messages;
drop policy if exists barber_applications_insert_barber on public.barber_applications;
drop policy if exists barber_applications_update_owner on public.barber_applications;

create or replace function private.lock_appointment_command(
  p_appointment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_appointment_id is null then
    raise exception using
      errcode = '22023',
      message = 'Appointment id is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'appointment:command:' || p_appointment_id::text,
      0
    )
  );
end;
$$;

revoke all on function private.lock_appointment_command(uuid)
  from public, anon, authenticated, service_role;

-- Preserve the already-reviewed command bodies as private implementation
-- functions. Stable public wrappers acquire the global command lock first.
alter function public.api_transition_appointment(uuid, integer, text, uuid, text, text)
  rename to api_transition_appointment_unlocked;
alter function public.api_reschedule_appointment(uuid, integer, uuid, uuid, uuid, timestamptz, text)
  rename to api_reschedule_appointment_unlocked;
alter function public.api_reassign_appointment(uuid, integer, uuid, uuid, text)
  rename to api_reassign_appointment_unlocked;

revoke all on function public.api_transition_appointment_unlocked(uuid, integer, text, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.api_reschedule_appointment_unlocked(uuid, integer, uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.api_reassign_appointment_unlocked(uuid, integer, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.require_reassignable_appointment_slot(
  p_customer_id uuid,
  p_barber_id uuid,
  p_shop_id uuid,
  p_starts_at timestamptz,
  p_duration_min integer,
  p_ignore_appointment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employment_id uuid;
  v_ends_at timestamptz;
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_local_date date;
  v_local_weekday smallint;
  v_exception_found boolean := false;
  v_exception_available boolean;
  v_effective_start time without time zone;
  v_exception_end time without time zone;
  v_inside_shift boolean := false;
begin
  if p_customer_id is null or p_barber_id is null or p_shop_id is null
      or p_starts_at is null or p_duration_min is null then
    raise exception using errcode = '22023', message = 'Reassignment slot data is incomplete.';
  end if;
  if not pg_catalog.isfinite(p_starts_at) or p_starts_at <= now()
      or p_duration_min < 5 or p_duration_min > 480 then
    raise exception using errcode = '22023', message = 'The existing booking slot is invalid.';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);
  v_local_start := p_starts_at at time zone 'Asia/Manila';
  v_local_end := v_ends_at at time zone 'Asia/Manila';
  v_local_date := v_local_start::date;
  v_local_weekday := extract(dow from v_local_start)::smallint;

  select employment.id
  into v_employment_id
  from public.barber_employment as employment
  join public.barbers as barber
    on barber.id = employment.barber_id
  join public.users as profile
    on profile.id = barber.id
  where employment.barber_id = p_barber_id
    and employment.shop_id = p_shop_id
    and employment.status = 'active'
    and employment.ended_at is null
    and employment.hired_at <= (now() at time zone 'Asia/Manila')::date
    and barber.accepting_bookings
    and profile.role = 'barber'
    and profile.requested_role = 'barber'
    and profile.verification_status = 'verified'
    and profile.onboarding_completed
  for share of employment, barber, profile;

  if v_employment_id is null then
    raise exception using
      errcode = '22023',
      message = 'The barber is not verified, active at this shop, or accepting bookings.';
  end if;

  select
    exception.is_available,
    exception.start_time,
    exception.end_time
  into
    v_exception_available,
    v_effective_start,
    v_exception_end
  from public.shift_exceptions as exception
  where exception.employment_id = v_employment_id
    and exception.date = v_local_date
  for share of exception;
  v_exception_found := found;

  if v_exception_found then
    v_inside_shift := v_exception_available
      and v_local_start >= v_local_date + v_effective_start
      and v_local_end <= v_local_date + v_exception_end;
  else
    select true, pattern.start_time
    into v_inside_shift, v_effective_start
    from public.shift_patterns as pattern
    where pattern.employment_id = v_employment_id
      and pattern.weekday = v_local_weekday
      and v_local_start >= v_local_date + pattern.start_time
      and v_local_end <= v_local_date + pattern.end_time
    order by pattern.start_time
    limit 1
    for share of pattern;
    v_inside_shift := coalesce(v_inside_shift, false);
  end if;

  if not v_inside_shift then
    raise exception using
      errcode = '22023',
      message = 'Selected time is outside the barber schedule.';
  end if;

  if mod(
    extract(epoch from (v_local_start - (v_local_date + v_effective_start))),
    15 * 60
  ) <> 0 then
    raise exception using
      errcode = '22023',
      message = 'Appointment start time must use the 15-minute booking grid.';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.barber_id = p_barber_id
      and appointment.id <> p_ignore_appointment_id
      and appointment.status in (
        'requested', 'confirmed', 'checked_in', 'in_progress', 'awaiting_confirmation'
      )
      and appointment.starts_at < v_ends_at
      and appointment.ends_at > p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'That barber appointment slot is already taken.';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.customer_id = p_customer_id
      and appointment.id <> p_ignore_appointment_id
      and appointment.status in (
        'requested', 'confirmed', 'checked_in', 'in_progress', 'awaiting_confirmation'
      )
      and appointment.starts_at < v_ends_at
      and appointment.ends_at > p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'The customer already has an appointment at that time.';
  end if;
end;
$$;

revoke all on function private.require_reassignable_appointment_slot(uuid, uuid, uuid, timestamptz, integer, uuid)
  from public, anon, authenticated, service_role;

-- This implementation intentionally does not read services.active, price, or
-- duration. An accepted booking keeps the immutable snapshot bought by the
-- customer; only the assigned professional changes.
create or replace function public.api_reassign_appointment_unlocked(
  p_appointment_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_barber_id uuid,
  p_reason text
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preflight public.appointments%rowtype;
  v_current public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_reason text;
begin
  select appointment.*
  into v_preflight
  from public.appointments as appointment
  where appointment.id = p_appointment_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Appointment not found.';
  end if;

  perform private.lock_appointment_capacity(
    v_preflight.customer_id,
    v_preflight.barber_id,
    p_barber_id
  );

  select appointment.*
  into v_current
  from public.appointments as appointment
  where appointment.id = p_appointment_id
  for update;

  if v_current.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'Appointment changed; refresh before trying again.';
  end if;
  if not exists (
    select 1
    from public.shops as shop
    where shop.id = v_current.shop_id
      and shop.owner_id = p_owner_id
  ) then
    raise exception using errcode = '42501', message = 'Only the shop owner may reassign this appointment.';
  end if;
  if v_current.status not in ('requested', 'confirmed') or v_current.starts_at <= now() then
    raise exception using errcode = '22023', message = 'This appointment can no longer be reassigned.';
  end if;
  if p_barber_id = v_current.barber_id then
    raise exception using errcode = '22023', message = 'The selected barber is already assigned.';
  end if;

  v_reason := private.require_appointment_reason(p_reason);

  perform private.require_reassignable_appointment_slot(
    v_current.customer_id,
    p_barber_id,
    v_current.shop_id,
    v_current.starts_at,
    v_current.booked_duration_min,
    v_current.id
  );

  update public.appointments
  set barber_id = p_barber_id,
      version = version + 1
  where id = v_current.id
  returning * into v_updated;

  insert into public.appointment_events (
    appointment_id, shop_id, actor_id, actor_role, event_type,
    from_status, to_status, reason, metadata
  ) values (
    v_updated.id,
    v_updated.shop_id,
    p_owner_id,
    'shop_owner',
    'reassigned',
    v_current.status,
    v_updated.status,
    v_reason,
    jsonb_build_object(
      'previous_barber_id', v_current.barber_id,
      'new_barber_id', v_updated.barber_id,
      'booked_duration_min', v_current.booked_duration_min,
      'booked_price_cents', v_current.booked_price_cents
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.api_reassign_appointment_unlocked(uuid, integer, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.api_transition_appointment(
  p_appointment_id uuid,
  p_expected_version integer,
  p_action text,
  p_actor_id uuid default null,
  p_reason text default null,
  p_check_in_code text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_appointment_command(p_appointment_id);
  return public.api_transition_appointment_unlocked(
    p_appointment_id,
    p_expected_version,
    p_action,
    p_actor_id,
    p_reason,
    p_check_in_code
  );
end;
$$;

create or replace function public.api_reschedule_appointment(
  p_appointment_id uuid,
  p_expected_version integer,
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_notes text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_appointment_command(p_appointment_id);
  return public.api_reschedule_appointment_unlocked(
    p_appointment_id,
    p_expected_version,
    p_customer_id,
    p_barber_id,
    p_service_id,
    p_starts_at,
    p_notes
  );
end;
$$;

create or replace function public.api_reassign_appointment(
  p_appointment_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_barber_id uuid,
  p_reason text
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_appointment_command(p_appointment_id);
  return public.api_reassign_appointment_unlocked(
    p_appointment_id,
    p_expected_version,
    p_owner_id,
    p_barber_id,
    p_reason
  );
end;
$$;

revoke all on function public.api_transition_appointment(uuid, integer, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.api_reschedule_appointment(uuid, integer, uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.api_reassign_appointment(uuid, integer, uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.api_transition_appointment(uuid, integer, text, uuid, text, text)
  to service_role;
grant execute on function public.api_reschedule_appointment(uuid, integer, uuid, uuid, uuid, timestamptz, text)
  to service_role;
grant execute on function public.api_reassign_appointment(uuid, integer, uuid, uuid, text)
  to service_role;
