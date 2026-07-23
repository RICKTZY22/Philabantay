-- P1-01/P1-03 follow-up: make create, reschedule, and reassign use the same
-- authoritative slot rules inside Postgres.
--
-- Express still performs fast preflight validation for useful errors, but the
-- database command is the final decision for service state, employment,
-- verification, accepting-bookings, shift coverage, slot grid, and overlap.

create or replace function private.lock_appointment_capacity(
  p_customer_id uuid,
  p_barber_a uuid,
  p_barber_b uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'appointment:customer:' || p_customer_id::text,
      0
    )
  );

  if p_barber_b is null or p_barber_a = p_barber_b then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'appointment:barber:' || p_barber_a::text,
        0
      )
    );
  elsif p_barber_a::text < p_barber_b::text then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'appointment:barber:' || p_barber_a::text,
        0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'appointment:barber:' || p_barber_b::text,
        0
      )
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'appointment:barber:' || p_barber_b::text,
        0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'appointment:barber:' || p_barber_a::text,
        0
      )
    );
  end if;
end;
$$;

create or replace function private.require_eligible_booking_customer(
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.users as customer
  where customer.id = p_customer_id
    and customer.role = 'customer'
    and customer.onboarding_completed
    and customer.requested_role = 'customer'
    and customer.verification_status = 'not_required'
  for share;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'This customer account cannot create or reschedule appointments.';
  end if;
end;
$$;

create or replace function private.require_bookable_appointment_slot(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ignore_appointment_id uuid default null,
  p_required_shop_id uuid default null
)
returns table (
  slot_shop_id uuid,
  slot_employment_id uuid,
  slot_service_name text,
  slot_duration_min integer,
  slot_price_cents integer,
  slot_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_employment_id uuid;
  v_service_name text;
  v_duration_min integer;
  v_price_cents integer;
  v_ends_at timestamptz;
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_local_date date;
  v_local_weekday smallint;
  v_exception_found boolean := false;
  v_exception_available boolean;
  v_exception_start time without time zone;
  v_exception_end time without time zone;
  v_inside_shift boolean := false;
begin
  if p_customer_id is null or p_barber_id is null or p_service_id is null
      or p_starts_at is null then
    raise exception using
      errcode = '22023',
      message = 'Customer, barber, service, and start time are required.';
  end if;

  if not pg_catalog.isfinite(p_starts_at) or p_starts_at <= now() then
    raise exception using
      errcode = '22023',
      message = 'Appointment must have a finite start time in the future.';
  end if;

  v_local_start := p_starts_at at time zone 'Asia/Manila';

  select
    service.shop_id,
    service.name,
    service.duration_min,
    service.price_cents
  into
    v_shop_id,
    v_service_name,
    v_duration_min,
    v_price_cents
  from public.services as service
  where service.id = p_service_id
    and service.active
  for share of service;

  if v_shop_id is null then
    raise exception using
      errcode = '22023',
      message = 'The selected service is not active.';
  end if;

  if p_required_shop_id is not null and v_shop_id <> p_required_shop_id then
    raise exception using
      errcode = '22023',
      message = 'Service must be active at the same shop.';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration_min);
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
    and employment.shop_id = v_shop_id
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
    v_exception_start,
    v_exception_end
  from public.shift_exceptions as exception
  where exception.employment_id = v_employment_id
    and exception.date = v_local_date
  for share of exception;
  v_exception_found := found;

  if v_exception_found then
    v_inside_shift := v_exception_available
      and v_local_start >= v_local_date + v_exception_start
      and v_local_end <= v_local_date + v_exception_end;
  else
    select true, pattern.start_time
    into v_inside_shift, v_exception_start
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

  -- Availability starts at the effective shift/exception boundary and then
  -- advances in 15-minute steps. This also supports schedules such as 09:05,
  -- where 09:05/09:20 are valid but wall-clock quarter hours are not.
  if mod(
    extract(epoch from (
      v_local_start - (v_local_date + v_exception_start)
    )),
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
      and (p_ignore_appointment_id is null or appointment.id <> p_ignore_appointment_id)
      and appointment.status in (
        'requested',
        'confirmed',
        'checked_in',
        'in_progress',
        'awaiting_confirmation'
      )
      and appointment.starts_at < v_ends_at
      and appointment.ends_at > p_starts_at
  ) then
    raise exception using
      errcode = '23P01',
      message = 'That barber appointment slot is already taken.';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.customer_id = p_customer_id
      and (p_ignore_appointment_id is null or appointment.id <> p_ignore_appointment_id)
      and appointment.status in (
        'requested',
        'confirmed',
        'checked_in',
        'in_progress',
        'awaiting_confirmation'
      )
      and appointment.starts_at < v_ends_at
      and appointment.ends_at > p_starts_at
  ) then
    raise exception using
      errcode = '23P01',
      message = 'The customer already has an appointment at that time.';
  end if;

  return query
  select
    v_shop_id,
    v_employment_id,
    v_service_name,
    v_duration_min,
    v_price_cents,
    v_ends_at;
end;
$$;

revoke all on function private.lock_appointment_capacity(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.require_eligible_booking_customer(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.require_bookable_appointment_slot(uuid, uuid, uuid, timestamptz, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.api_create_appointment(
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
declare
  v_created public.appointments%rowtype;
  v_shop_id uuid;
  v_service_name text;
  v_duration_min integer;
  v_price_cents integer;
  v_ends_at timestamptz;
  v_notes text := nullif(btrim(p_notes), '');
begin
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Appointment notes cannot exceed 1000 characters.';
  end if;

  perform private.lock_appointment_capacity(p_customer_id, p_barber_id, null);
  perform private.require_eligible_booking_customer(p_customer_id);

  select
    slot.slot_shop_id,
    slot.slot_service_name,
    slot.slot_duration_min,
    slot.slot_price_cents,
    slot.slot_ends_at
  into
    v_shop_id,
    v_service_name,
    v_duration_min,
    v_price_cents,
    v_ends_at
  from private.require_bookable_appointment_slot(
    p_customer_id,
    p_barber_id,
    p_service_id,
    p_starts_at,
    null,
    null
  ) as slot;

  insert into public.appointments (
    customer_id,
    barber_id,
    shop_id,
    service_id,
    starts_at,
    ends_at,
    status,
    notes,
    booked_service_name,
    booked_duration_min,
    booked_price_cents
  ) values (
    p_customer_id,
    p_barber_id,
    v_shop_id,
    p_service_id,
    p_starts_at,
    v_ends_at,
    'requested',
    v_notes,
    v_service_name,
    v_duration_min,
    v_price_cents
  )
  returning * into v_created;

  return v_created;
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
declare
  v_preflight public.appointments%rowtype;
  v_current public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_service_name text;
  v_duration_min integer;
  v_price_cents integer;
  v_ends_at timestamptz;
  v_notes text := nullif(btrim(p_notes), '');
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
  if v_current.customer_id <> p_customer_id then
    raise exception using errcode = '42501', message = 'Customers may only reschedule their own appointment.';
  end if;
  if v_current.status not in ('requested', 'confirmed') or v_current.starts_at <= now() then
    raise exception using errcode = '22023', message = 'This appointment can no longer be rescheduled.';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception using errcode = '22023', message = 'Appointment notes cannot exceed 1000 characters.';
  end if;

  perform private.require_eligible_booking_customer(p_customer_id);

  select
    slot.slot_service_name,
    slot.slot_duration_min,
    slot.slot_price_cents,
    slot.slot_ends_at
  into
    v_service_name,
    v_duration_min,
    v_price_cents,
    v_ends_at
  from private.require_bookable_appointment_slot(
    p_customer_id,
    p_barber_id,
    p_service_id,
    p_starts_at,
    p_appointment_id,
    v_current.shop_id
  ) as slot;

  update public.appointments
  set barber_id = p_barber_id,
      service_id = p_service_id,
      starts_at = p_starts_at,
      ends_at = v_ends_at,
      booked_service_name = v_service_name,
      booked_duration_min = v_duration_min,
      booked_price_cents = v_price_cents,
      notes = v_notes,
      status = 'requested',
      status_updated_at = now(),
      expires_at = now() + interval '15 minutes',
      checked_in_at = null,
      actual_started_at = null,
      actual_finished_at = null,
      completion_due_at = null,
      completed_at = null,
      cancelled_at = null,
      cancelled_by = null,
      cancellation_reason = null,
      no_show_marked_at = null,
      no_show_marked_by = null,
      no_show_reason = null,
      dispute_opened_at = null,
      dispute_reason = null,
      check_in_code_hash = null,
      check_in_code_expires_at = null,
      version = version + 1
  where id = v_current.id
  returning * into v_updated;

  insert into public.appointment_events (
    appointment_id, shop_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata
  ) values (
    v_updated.id,
    v_updated.shop_id,
    p_customer_id,
    'customer',
    'rescheduled',
    v_current.status,
    v_updated.status,
    jsonb_build_object(
      'previous_barber_id', v_current.barber_id,
      'new_barber_id', v_updated.barber_id,
      'previous_service_id', v_current.service_id,
      'new_service_id', v_updated.service_id,
      'previous_starts_at', v_current.starts_at,
      'new_starts_at', v_updated.starts_at,
      'previous_price_cents', v_current.booked_price_cents,
      'new_price_cents', v_updated.booked_price_cents
    )
  );

  return v_updated;
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
declare
  v_preflight public.appointments%rowtype;
  v_current public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_slot_shop_id uuid;
  v_slot_employment_id uuid;
  v_slot_service_name text;
  v_slot_duration_min integer;
  v_slot_price_cents integer;
  v_slot_ends_at timestamptz;
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

  select
    slot.slot_shop_id,
    slot.slot_employment_id,
    slot.slot_service_name,
    slot.slot_duration_min,
    slot.slot_price_cents,
    slot.slot_ends_at
  into
    v_slot_shop_id,
    v_slot_employment_id,
    v_slot_service_name,
    v_slot_duration_min,
    v_slot_price_cents,
    v_slot_ends_at
  from private.require_bookable_appointment_slot(
    v_current.customer_id,
    p_barber_id,
    v_current.service_id,
    v_current.starts_at,
    v_current.id,
    v_current.shop_id
  ) as slot;

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
      'new_barber_id', v_updated.barber_id
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.api_create_appointment(uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.api_reschedule_appointment(uuid, integer, uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.api_reassign_appointment(uuid, integer, uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.api_create_appointment(uuid, uuid, uuid, timestamptz, text)
  to service_role;
grant execute on function public.api_reschedule_appointment(uuid, integer, uuid, uuid, uuid, timestamptz, text)
  to service_role;
grant execute on function public.api_reassign_appointment(uuid, integer, uuid, uuid, text)
  to service_role;
