-- P2-07 (slice 2): one authoritative claim gate that reads every availability
-- input the phase contract lists.
--
-- Before this migration the gate checked service state, employment,
-- verification, accepting-bookings, shift coverage, the 15-minute grid, and
-- provider/customer overlap. It did not check publication, shop operating
-- hours, date closures, service qualification, cleanup buffers, the booking
-- window, or chair capacity. Two bypasses were reproduced live and are quoted
-- in 20260730000100.
--
-- The new inputs land as small private helpers rather than one long body, so the
-- create, reschedule, and reassign paths share exactly the same predicates and
-- cannot drift apart the way the Express preflight and the RPC already had.

-- 1. Capacity lock now covers the shop ----------------------------------------
-- Chair capacity is a shop-wide invariant: two customers booking two different
-- barbers can both pass a per-barber check and still want the same chair. The
-- shop lock is what makes the chair count read stable, so every capacity
-- decision in this file assumes the caller already holds it.
--
-- Lock order is fixed and global — shop, then customer, then barbers in text
-- order — so concurrent commands can never build a cycle. The old three-argument
-- signature is dropped rather than kept alongside, because a 4-arg version with
-- a defaulted last parameter would make every existing 3-arg call ambiguous.
drop function if exists private.lock_appointment_capacity(uuid, uuid, uuid);

create function private.lock_appointment_capacity(
  p_shop_id uuid,
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
  if p_shop_id is null or p_customer_id is null or p_barber_a is null then
    raise exception using
      errcode = '22023',
      message = 'Shop, customer, and provider are required to lock capacity.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment:shop:' || p_shop_id::text, 0)
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment:customer:' || p_customer_id::text, 0)
  );

  if p_barber_b is null or p_barber_a = p_barber_b then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('appointment:barber:' || p_barber_a::text, 0)
    );
  elsif p_barber_a::text < p_barber_b::text then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('appointment:barber:' || p_barber_a::text, 0)
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('appointment:barber:' || p_barber_b::text, 0)
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('appointment:barber:' || p_barber_b::text, 0)
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('appointment:barber:' || p_barber_a::text, 0)
    );
  end if;
end;
$$;

revoke all on function private.lock_appointment_capacity(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- 2. Bookable shop policy -----------------------------------------------------
-- Returns the shop facts the engine needs, and RAISES when the shop is missing
-- or not publicly bookable. It never returns a NULL row: the P2-04 cross-tenant
-- bypass came from a NULL-returning owner lookup feeding a `<>` comparison, and
-- plpgsql treats `if NULL` as false, so a missing row must be an exception.
create or replace function private.require_bookable_shop(
  p_shop_id uuid
)
returns table (
  shop_timezone text,
  shop_chair_count integer,
  shop_default_buffer_min integer,
  shop_min_lead_minutes integer,
  shop_max_advance_days integer,
  shop_booking_mode text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lifecycle public.shop_lifecycle_status;
  v_timezone text;
  v_chair_count integer;
  v_default_buffer_min integer;
  v_min_lead_minutes integer;
  v_max_advance_days integer;
  v_booking_mode text;
begin
  if p_shop_id is null then
    raise exception using errcode = '22023', message = 'Shop is required.';
  end if;

  select
    shop.lifecycle_status,
    shop.timezone,
    shop.chair_count,
    shop.default_buffer_min,
    shop.min_lead_minutes,
    shop.max_advance_days,
    shop.booking_mode
  into
    v_lifecycle,
    v_timezone,
    v_chair_count,
    v_default_buffer_min,
    v_min_lead_minutes,
    v_max_advance_days,
    v_booking_mode
  from public.shops as shop
  where shop.id = p_shop_id
  for share of shop;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Shop not found.';
  end if;

  -- The public catalogue has gated on `published` since P2-01. The booking
  -- command did not, which is how a draft shop stayed bookable by anyone
  -- holding a barber id and a service id.
  if v_lifecycle <> 'published' then
    raise exception using
      errcode = 'P4027',
      message = 'This shop is not currently accepting online bookings.';
  end if;

  return query select
    v_timezone,
    v_chair_count,
    v_default_buffer_min,
    v_min_lead_minutes,
    v_max_advance_days,
    v_booking_mode;
end;
$$;

revoke all on function private.require_bookable_shop(uuid)
  from public, anon, authenticated, service_role;

-- 3. Shop opening hours and date closures -------------------------------------
-- A closure row for the local date replaces the weekly pattern outright: either
-- the shop is shut, or it opens on replacement hours. Otherwise the service
-- window must fit inside ONE weekly block, so a booking can never straddle a
-- midday break by sitting between two blocks.
--
-- Only the service window is tested, not the cleanup buffer. A shop closing at
-- 21:00 can still accept a service that ends at 21:00 and have staff clean up
-- afterwards; requiring the buffer to fit would silently shorten every
-- advertised day by the buffer length.
create or replace function private.require_shop_open_window(
  p_shop_id uuid,
  p_local_date date,
  p_local_weekday smallint,
  p_local_start timestamp without time zone,
  p_local_end timestamp without time zone
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closure_found boolean := false;
  v_closed boolean;
  v_replacement_open time without time zone;
  v_replacement_close time without time zone;
begin
  select
    closure.closed,
    closure.replacement_open_time,
    closure.replacement_close_time
  into
    v_closed,
    v_replacement_open,
    v_replacement_close
  from public.shop_closures as closure
  where closure.shop_id = p_shop_id
    and closure.local_date = p_local_date
  for share of closure;
  v_closure_found := found;

  if v_closure_found then
    if v_closed then
      raise exception using
        errcode = 'P4028',
        message = 'The shop is closed on that date.';
    end if;

    if p_local_start < p_local_date + v_replacement_open
        or p_local_end > p_local_date + v_replacement_close then
      raise exception using
        errcode = 'P4028',
        message = 'That time is outside the shop''s replacement hours for that date.';
    end if;

    return;
  end if;

  if not exists (
    select 1
    from public.shop_operating_hours as hours
    where hours.shop_id = p_shop_id
      and hours.weekday = p_local_weekday
      and not hours.closed
      and p_local_start >= p_local_date + hours.open_time
      and p_local_end <= p_local_date + hours.close_time
  ) then
    raise exception using
      errcode = 'P4028',
      message = 'That time is outside the shop''s opening hours.';
  end if;
end;
$$;

revoke all on function private.require_shop_open_window(uuid, date, smallint, timestamp without time zone, timestamp without time zone)
  from public, anon, authenticated, service_role;

-- 4. Service qualification ----------------------------------------------------
-- P2-05 made the owner the sole authority on who performs which service, then
-- nothing in the booking path consulted the result. 20260730000100 backfills a
-- grant for every pairing an owner had already allowed, so switching this on
-- cannot make a currently-legitimate provider unbookable.
create or replace function private.require_provider_qualified(
  p_shop_id uuid,
  p_service_id uuid,
  p_provider_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.service_qualifications as qualification
    where qualification.shop_id = p_shop_id
      and qualification.service_id = p_service_id
      and qualification.provider_user_id = p_provider_user_id
      and qualification.active
  ) then
    raise exception using
      errcode = 'P4030',
      message = 'That provider is not qualified for this service.';
  end if;
end;
$$;

revoke all on function private.require_provider_qualified(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- 5. Booking window -----------------------------------------------------------
create or replace function private.require_booking_window(
  p_starts_at timestamptz,
  p_timezone text,
  p_local_date date,
  p_min_lead_minutes integer,
  p_max_advance_days integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone p_timezone)::date;
begin
  if p_starts_at < now() + make_interval(mins => p_min_lead_minutes) then
    raise exception using
      errcode = 'P4029',
      message = format(
        'This shop needs at least %s minute(s) of notice for a booking.',
        p_min_lead_minutes
      );
  end if;

  -- A null horizon is "no limit", which is the default. Only an owner who set a
  -- number gets a horizon enforced against them.
  if p_max_advance_days is not null and p_local_date > v_today + p_max_advance_days then
    raise exception using
      errcode = 'P4029',
      message = format(
        'This shop only takes bookings up to %s day(s) ahead.',
        p_max_advance_days
      );
  end if;
end;
$$;

revoke all on function private.require_booking_window(timestamptz, text, date, integer, integer)
  from public, anon, authenticated, service_role;

-- 6. Chair capacity -----------------------------------------------------------
-- Peak concurrency, not a naive overlap count. Counting every appointment that
-- overlaps the candidate would over-refuse: with two chairs, a 09:30-10:15 and a
-- 10:45-11:30 booking both overlap a 10:00-11:00 candidate but never each other,
-- so the real peak is two, not three.
--
-- The count can only rise at the candidate's own start or at an existing
-- appointment's start, so probing those instants finds the true maximum. Cleanup
-- buffers count as occupancy here: a chair being cleaned is not free.
--
-- Correctness depends on the caller holding the shop lock from
-- private.lock_appointment_capacity. Without it two transactions would each read
-- a pre-insert count and both succeed.
create or replace function private.require_chair_capacity(
  p_shop_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_chair_count integer,
  p_ignore_appointment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peak integer;
begin
  with occupied as (
    select
      appointment.starts_at as occupied_start,
      appointment.ends_at
        + make_interval(mins => coalesce(appointment.booked_buffer_min, 0)) as occupied_end
    from public.appointments as appointment
    where appointment.shop_id = p_shop_id
      and (p_ignore_appointment_id is null or appointment.id <> p_ignore_appointment_id)
      and appointment.status in (
        'requested',
        'confirmed',
        'checked_in',
        'in_progress',
        'awaiting_confirmation'
      )
      and appointment.starts_at < p_window_end
      and appointment.ends_at
          + make_interval(mins => coalesce(appointment.booked_buffer_min, 0)) > p_window_start
  ),
  probe as (
    select p_window_start as probe_at
    union
    select occupied.occupied_start
    from occupied
    where occupied.occupied_start > p_window_start
      and occupied.occupied_start < p_window_end
  )
  select coalesce(max(concurrent.active_count), 0)
  into v_peak
  from probe
  cross join lateral (
    select count(*) as active_count
    from occupied
    where occupied.occupied_start <= probe.probe_at
      and occupied.occupied_end > probe.probe_at
  ) as concurrent;

  if v_peak + 1 > p_chair_count then
    raise exception using
      errcode = 'P4026',
      message = format(
        'All %s chair(s) are already taken for that time.',
        p_chair_count
      );
  end if;
end;
$$;

revoke all on function private.require_chair_capacity(uuid, timestamptz, timestamptz, integer, uuid)
  from public, anon, authenticated, service_role;

-- 7. Buffer-aware provider overlap -------------------------------------------
-- The appointments table already carries EXCLUDE constraints for barber and
-- customer overlap, but they compare bare [starts_at, ends_at) ranges and cannot
-- see a cleanup buffer. They stay as the hard floor; this check adds the gap.
create or replace function private.require_provider_gap(
  p_barber_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_ignore_appointment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
      and appointment.starts_at < p_window_end
      and appointment.ends_at
          + make_interval(mins => coalesce(appointment.booked_buffer_min, 0)) > p_window_start
  ) then
    raise exception using
      errcode = '23P01',
      message = 'That barber appointment slot is already taken.';
  end if;
end;
$$;

revoke all on function private.require_provider_gap(uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated, service_role;

-- 8. The claim gate -----------------------------------------------------------
-- Dropped and recreated because the return type gains slot_buffer_min, which
-- the quote projection needs in order to explain a slot without recomputing the
-- buffer itself.
drop function if exists private.require_bookable_appointment_slot(uuid, uuid, uuid, timestamptz, uuid, uuid);

create function private.require_bookable_appointment_slot(
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
  slot_buffer_min integer,
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
  v_service_buffer integer;
  v_buffer_min integer;
  v_ends_at timestamptz;
  v_window_end timestamptz;
  v_timezone text;
  v_chair_count integer;
  v_default_buffer_min integer;
  v_min_lead_minutes integer;
  v_max_advance_days integer;
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

  select
    service.shop_id,
    service.name,
    service.duration_min,
    service.price_cents,
    service.buffer_min
  into
    v_shop_id,
    v_service_name,
    v_duration_min,
    v_price_cents,
    v_service_buffer
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

  -- Raises when the shop is missing or not published.
  select
    policy.shop_timezone,
    policy.shop_chair_count,
    policy.shop_default_buffer_min,
    policy.shop_min_lead_minutes,
    policy.shop_max_advance_days
  into
    v_timezone,
    v_chair_count,
    v_default_buffer_min,
    v_min_lead_minutes,
    v_max_advance_days
  -- booking_mode is returned by the helper for Phase 3's manual/instant
  -- confirmation split. Availability does not consume it, so it is deliberately
  -- not bound here.
  from private.require_bookable_shop(v_shop_id) as policy;

  v_buffer_min := coalesce(v_service_buffer, v_default_buffer_min, 0);
  v_ends_at := p_starts_at + make_interval(mins => v_duration_min);
  v_window_end := v_ends_at + make_interval(mins => v_buffer_min);

  -- Every wall-clock comparison below uses the shop's own timezone rather than a
  -- hardcoded Asia/Manila, so a shop that records a different zone is evaluated
  -- against the hours its owner actually published.
  v_local_start := p_starts_at at time zone v_timezone;
  v_local_end := v_ends_at at time zone v_timezone;
  v_local_date := v_local_start::date;
  v_local_weekday := extract(dow from v_local_start)::smallint;

  perform private.require_booking_window(
    p_starts_at,
    v_timezone,
    v_local_date,
    v_min_lead_minutes,
    v_max_advance_days
  );

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
    and employment.hired_at <= (now() at time zone v_timezone)::date
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

  perform private.require_provider_qualified(v_shop_id, p_service_id, p_barber_id);

  -- Shift coverage. An exception row for the date replaces the weekly pattern,
  -- and an exception with is_available = false is how P2-06 records approved
  -- absence, so leave participates here without a separate table.
  select
    shift_exception.is_available,
    shift_exception.start_time,
    shift_exception.end_time
  into
    v_exception_available,
    v_effective_start,
    v_exception_end
  from public.shift_exceptions as shift_exception
  where shift_exception.employment_id = v_employment_id
    and shift_exception.date = v_local_date
  for share of shift_exception;
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

  -- Availability starts at the effective shift/exception boundary and then
  -- advances in 15-minute steps. This also supports schedules such as 09:05,
  -- where 09:05/09:20 are valid but wall-clock quarter hours are not.
  if mod(
    extract(epoch from (
      v_local_start - (v_local_date + v_effective_start)
    )),
    15 * 60
  ) <> 0 then
    raise exception using
      errcode = '22023',
      message = 'Appointment start time must use the 15-minute booking grid.';
  end if;

  -- Shop hours are checked after the provider's own schedule on purpose. When a
  -- time fails both, "outside the barber schedule" is the more actionable answer,
  -- and it keeps the pre-P2-07 error contract for a request that was already
  -- being refused. Hours are only decisive when they are narrower than the
  -- shift, which is exactly the case the regression covers.
  perform private.require_shop_open_window(
    v_shop_id,
    v_local_date,
    v_local_weekday,
    v_local_start,
    v_local_end
  );

  perform private.require_provider_gap(
    p_barber_id,
    p_starts_at,
    v_window_end,
    p_ignore_appointment_id
  );

  -- The customer's own overlap is deliberately unbuffered. A buffer protects a
  -- chair and a provider between visits; it is not a constraint on where the
  -- customer may be afterwards.
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

  perform private.require_chair_capacity(
    v_shop_id,
    p_starts_at,
    v_window_end,
    v_chair_count,
    p_ignore_appointment_id
  );

  return query
  select
    v_shop_id,
    v_employment_id,
    v_service_name,
    v_duration_min,
    v_price_cents,
    v_buffer_min,
    v_ends_at;
end;
$$;

revoke all on function private.require_bookable_appointment_slot(uuid, uuid, uuid, timestamptz, uuid, uuid)
  from public, anon, authenticated, service_role;

-- 9. Reassignment gate --------------------------------------------------------
-- Reassignment changes only WHO performs an appointment that already exists, so
-- it re-checks provider facts and adds the qualification requirement, but it
-- deliberately does not re-check publication, opening hours, the booking window,
-- or chair capacity. Those describe whether the booking should have been taken;
-- re-testing them here would trap an owner who suspends the shop or edits next
-- week's hours and then needs to move today's bookings to another barber.
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
  v_service_id uuid;
  v_ends_at timestamptz;
  v_window_end timestamptz;
  v_buffer_min integer;
  v_timezone text;
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

  select
    appointment.service_id,
    coalesce(appointment.booked_buffer_min, 0)
  into
    v_service_id,
    v_buffer_min
  from public.appointments as appointment
  where appointment.id = p_ignore_appointment_id
  for share of appointment;

  if v_service_id is null then
    raise exception using errcode = 'P0002', message = 'Appointment not found.';
  end if;

  select shop.timezone
  into v_timezone
  from public.shops as shop
  where shop.id = p_shop_id
  for share of shop;

  if v_timezone is null then
    raise exception using errcode = 'P0002', message = 'Shop not found.';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);
  v_window_end := v_ends_at + make_interval(mins => v_buffer_min);
  v_local_start := p_starts_at at time zone v_timezone;
  v_local_end := v_ends_at at time zone v_timezone;
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
    and employment.hired_at <= (now() at time zone v_timezone)::date
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

  perform private.require_provider_qualified(p_shop_id, v_service_id, p_barber_id);

  select
    shift_exception.is_available,
    shift_exception.start_time,
    shift_exception.end_time
  into
    v_exception_available,
    v_effective_start,
    v_exception_end
  from public.shift_exceptions as shift_exception
  where shift_exception.employment_id = v_employment_id
    and shift_exception.date = v_local_date
  for share of shift_exception;
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

  perform private.require_provider_gap(
    p_barber_id,
    p_starts_at,
    v_window_end,
    p_ignore_appointment_id
  );

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

-- 10. Commands pass the shop through the capacity lock ------------------------
-- Creating resolves the shop from the service before locking. That lookup is
-- unlocked, which is safe because services never move between shops and every
-- authoritative read still happens after the lock is held; if the service does
-- not exist, the gate below rejects the request anyway.
create or replace function public.api_create_appointment(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_notes text default null,
  p_barber_preference public.appointment_barber_preference default 'exact',
  p_requested_barber_id uuid default null,
  p_assignment_source public.appointment_assignment_source default 'customer',
  p_assignment_reason text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created public.appointments%rowtype;
  v_shop_id uuid;
  v_lock_shop_id uuid;
  v_service_name text;
  v_duration_min integer;
  v_price_cents integer;
  v_buffer_min integer;
  v_ends_at timestamptz;
  v_notes text := nullif(btrim(p_notes), '');
  v_assignment_reason text := nullif(btrim(p_assignment_reason), '');
  v_requested_barber_id uuid;
begin
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Appointment notes cannot exceed 1000 characters.';
  end if;

  -- `any` is the only intent without a named provider; the other two always
  -- record who the customer asked for, even when a substitute is assigned.
  if p_barber_preference = 'any' then
    v_requested_barber_id := null;
  else
    v_requested_barber_id := coalesce(p_requested_barber_id, p_barber_id);
  end if;

  select service.shop_id
  into v_lock_shop_id
  from public.services as service
  where service.id = p_service_id;

  if v_lock_shop_id is null then
    raise exception using
      errcode = '22023',
      message = 'The selected service does not exist.';
  end if;

  perform private.lock_appointment_capacity(
    v_lock_shop_id,
    p_customer_id,
    p_barber_id,
    null
  );
  perform private.require_eligible_booking_customer(p_customer_id);

  select
    slot.slot_shop_id,
    slot.slot_service_name,
    slot.slot_duration_min,
    slot.slot_price_cents,
    slot.slot_buffer_min,
    slot.slot_ends_at
  into
    v_shop_id,
    v_service_name,
    v_duration_min,
    v_price_cents,
    v_buffer_min,
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
    booked_price_cents,
    booked_buffer_min,
    barber_preference,
    requested_barber_id,
    assignment_source,
    assignment_reason
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
    v_price_cents,
    v_buffer_min,
    p_barber_preference,
    v_requested_barber_id,
    p_assignment_source,
    v_assignment_reason
  )
  returning * into v_created;

  return v_created;
end;
$$;

create or replace function public.api_reschedule_appointment_unlocked(
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
  v_buffer_min integer;
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
    v_preflight.shop_id,
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
    slot.slot_buffer_min,
    slot.slot_ends_at
  into
    v_service_name,
    v_duration_min,
    v_price_cents,
    v_buffer_min,
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
      booked_buffer_min = v_buffer_min,
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

  -- Unchanged from 20260722000600. Only booked_buffer_min was added above.
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
    v_preflight.shop_id,
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

  -- An owner-driven substitution is recorded as such, so a `preferred` customer
  -- can still see who they asked for alongside who they got. Everything else
  -- here is unchanged from 20260722000700, including the immutable event.
  update public.appointments
  set barber_id = p_barber_id,
      assignment_source = 'owner',
      assignment_reason = v_reason,
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

-- 11. Grants ------------------------------------------------------------------
-- api_create_appointment gained parameters, so the old five-argument signature
-- is a distinct function that must go. Dropping it also removes its ACL, which
-- is why no matching revoke is issued.
drop function if exists public.api_create_appointment(uuid, uuid, uuid, timestamptz, text);

revoke all on function public.api_create_appointment(
  uuid, uuid, uuid, timestamptz, text,
  public.appointment_barber_preference, uuid,
  public.appointment_assignment_source, text
) from public, anon, authenticated;

grant execute on function public.api_create_appointment(
  uuid, uuid, uuid, timestamptz, text,
  public.appointment_barber_preference, uuid,
  public.appointment_assignment_source, text
) to service_role;

revoke all on function public.api_reschedule_appointment_unlocked(uuid, integer, uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.api_reassign_appointment_unlocked(uuid, integer, uuid, uuid, text)
  from public, anon, authenticated, service_role;
