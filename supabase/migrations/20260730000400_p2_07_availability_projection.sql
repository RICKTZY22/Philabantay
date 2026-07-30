-- P2-07 (slice 3): honest slots, and exact/preferred/any assignment.
--
-- The Express slot projection generated candidates from shift patterns alone. It
-- shared none of the claim gate's other rules, so a customer could be shown a
-- slot at a closed shop, on a closure date, for a service the barber is not
-- qualified for, or with every chair already taken, and only discover the truth
-- on submit. AVAIL-01 requires the opposite: the offered slots must be the
-- bookable ones.
--
-- Rather than reimplement the rules in a second place, this projection generates
-- candidate start times and then asks the real claim gate about each one inside a
-- subtransaction. That costs one savepoint per candidate — roughly fifty for a
-- thirteen-hour day on the fifteen-minute grid — and buys the guarantee that
-- quote and claim can never disagree. Duplicating the predicates would be
-- faster and is exactly how the Express preflight drifted from the RPC in the
-- first place.

-- 1. The gate tolerates an anonymous caller ----------------------------------
-- Public availability has no customer, so there is no customer-overlap input to
-- apply. A null customer skips only that one check.
--
-- This cannot weaken a claim: both api_create_appointment and
-- api_reschedule_appointment_unlocked call private.require_eligible_booking_customer
-- first, and that function raises 42501 for a null or ineligible customer, so a
-- null can never reach the gate from a path that writes a row.
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
  if p_barber_id is null or p_service_id is null or p_starts_at is null then
    raise exception using
      errcode = '22023',
      message = 'Barber, service, and start time are required.';
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
    extract(epoch from (
      v_local_start - (v_local_date + v_effective_start)
    )),
    15 * 60
  ) <> 0 then
    raise exception using
      errcode = '22023',
      message = 'Appointment start time must use the 15-minute booking grid.';
  end if;

  -- Ordered after the shift check so that a time failing both reports the
  -- barber's schedule, which is the more actionable of the two. See the note in
  -- 20260730000200.
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

  if p_customer_id is not null and exists (
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

-- 2. Is one candidate bookable? ----------------------------------------------
-- The gate reports failure by raising, which is right for a claim and wrong for
-- a projection that must examine dozens of candidates. This wrapper converts the
-- raise into a boolean and hands back the SQLSTATE so a caller can explain the
-- refusal instead of guessing.
create or replace function private.slot_is_bookable(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ignore_appointment_id uuid default null,
  out bookable boolean,
  out reason_code text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_bookable_appointment_slot(
    p_customer_id,
    p_barber_id,
    p_service_id,
    p_starts_at,
    p_ignore_appointment_id,
    null
  );
  bookable := true;
  reason_code := null;
exception
  -- Only the gate's own refusals are swallowed. Anything else is a real fault
  -- and must not be reported to a customer as "that slot is busy".
  when sqlstate '22023'
    or sqlstate '23P01'
    or sqlstate 'P4026'
    or sqlstate 'P4027'
    or sqlstate 'P4028'
    or sqlstate 'P4029'
    or sqlstate 'P4030'
    or sqlstate 'P0002'
    or sqlstate '42501'
  then
    bookable := false;
    reason_code := sqlstate;
end;
$$;

revoke all on function private.slot_is_bookable(uuid, uuid, uuid, timestamptz, uuid)
  from public, anon, authenticated, service_role;

-- 3. Bookable slots for one shop, service, and local date --------------------
-- Candidate starts come from each provider's effective shift for the date, on
-- the fifteen-minute grid anchored to the shift start, and then every candidate
-- is confirmed by the gate. Providers are limited up front to those who could
-- possibly qualify, so the expensive per-candidate check runs over a small set.
create or replace function public.api_availability_slots(
  p_shop_id uuid,
  p_service_id uuid,
  p_date date,
  p_customer_id uuid default null,
  p_barber_id uuid default null
)
returns table (
  provider_user_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  buffer_min integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_duration_min integer;
  v_service_shop_id uuid;
  v_buffer_min integer;
  v_default_buffer_min integer;
  v_service_buffer integer;
  v_weekday smallint;
  v_provider record;
  v_block record;
  v_candidate timestamptz;
  v_block_start timestamptz;
  v_block_end timestamptz;
  v_check record;
begin
  if p_shop_id is null or p_service_id is null or p_date is null then
    raise exception using
      errcode = '22023',
      message = 'Shop, service, and date are required.';
  end if;

  select
    service.shop_id,
    service.duration_min,
    service.buffer_min
  into v_service_shop_id, v_duration_min, v_service_buffer
  from public.services as service
  where service.id = p_service_id
    and service.active;

  if v_service_shop_id is null or v_service_shop_id <> p_shop_id then
    raise exception using
      errcode = '22023',
      message = 'The selected service is not active at this shop.';
  end if;

  -- Raises P4027 when the shop is not published, so an unpublished shop returns
  -- an error rather than a silently empty day.
  select policy.shop_timezone, policy.shop_default_buffer_min
  into v_timezone, v_default_buffer_min
  from private.require_bookable_shop(p_shop_id) as policy;

  v_buffer_min := coalesce(v_service_buffer, v_default_buffer_min, 0);
  v_weekday := extract(dow from p_date)::smallint;

  for v_provider in
    select employment.id as employment_id, employment.barber_id
    from public.barber_employment as employment
    join public.barbers as barber
      on barber.id = employment.barber_id
    join public.users as profile
      on profile.id = barber.id
    join public.service_qualifications as qualification
      on qualification.shop_id = employment.shop_id
     and qualification.provider_user_id = employment.barber_id
     and qualification.service_id = p_service_id
     and qualification.active
    where employment.shop_id = p_shop_id
      and employment.status = 'active'
      and employment.ended_at is null
      and employment.hired_at <= (now() at time zone v_timezone)::date
      and barber.accepting_bookings
      and profile.role = 'barber'
      and profile.requested_role = 'barber'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
      and (p_barber_id is null or employment.barber_id = p_barber_id)
    order by employment.barber_id
  loop
    for v_block in
      -- An exception row for the date replaces the weekly pattern entirely, and
      -- an unavailable exception yields no blocks at all, which is how approved
      -- absence removes a day.
      with shift_override as (
        select
          shift_exception.is_available,
          shift_exception.start_time,
          shift_exception.end_time
        from public.shift_exceptions as shift_exception
        where shift_exception.employment_id = v_provider.employment_id
          and shift_exception.date = p_date
      )
      select shift_override.start_time, shift_override.end_time
      from shift_override
      where shift_override.is_available
      union all
      select pattern.start_time, pattern.end_time
      from public.shift_patterns as pattern
      where pattern.employment_id = v_provider.employment_id
        and pattern.weekday = v_weekday
        and not exists (select 1 from shift_override)
      order by 1
    loop
      v_block_start := (p_date + v_block.start_time) at time zone v_timezone;
      v_block_end := (p_date + v_block.end_time) at time zone v_timezone;
      v_candidate := v_block_start;

      while v_candidate + make_interval(mins => v_duration_min) <= v_block_end loop
        select * into v_check
        from private.slot_is_bookable(
          p_customer_id,
          v_provider.barber_id,
          p_service_id,
          v_candidate,
          null
        );

        if v_check.bookable then
          provider_user_id := v_provider.barber_id;
          starts_at := v_candidate;
          ends_at := v_candidate + make_interval(mins => v_duration_min);
          buffer_min := v_buffer_min;
          return next;
        end if;

        v_candidate := v_candidate + interval '15 minutes';
      end loop;
    end loop;
  end loop;
end;
$$;

revoke all on function public.api_availability_slots(uuid, uuid, date, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.api_availability_slots(uuid, uuid, date, uuid, uuid)
  to service_role;

-- 4. Provider assignment for `any` and `preferred` (BOOK-02) -----------------
-- Ordering follows the phase contract: fewest service minutes already assigned
-- on the shop's local date, then the earliest shift start, then the provider id
-- so a retry agrees with the first attempt.
create or replace function private.ordered_shop_providers(
  p_shop_id uuid,
  p_service_id uuid,
  p_local_date date,
  p_timezone text
)
returns table (provider_user_id uuid)
language sql
security definer
set search_path = ''
as $$
  select ranked.barber_id
  from (
    select
      employment.barber_id,
      coalesce((
        select sum(assigned.booked_duration_min)
        from public.appointments as assigned
        where assigned.barber_id = employment.barber_id
          and assigned.shop_id = p_shop_id
          and assigned.status in (
            'requested', 'confirmed', 'checked_in', 'in_progress',
            'awaiting_confirmation', 'completed'
          )
          and (assigned.starts_at at time zone p_timezone)::date = p_local_date
      ), 0) as assigned_minutes,
      coalesce((
        select min(pattern.start_time)
        from public.shift_patterns as pattern
        where pattern.employment_id = employment.id
          and pattern.weekday = extract(dow from p_local_date)::smallint
      ), time '23:59') as shift_start
    from public.barber_employment as employment
    join public.barbers as barber
      on barber.id = employment.barber_id
    join public.users as profile
      on profile.id = barber.id
    join public.service_qualifications as qualification
      on qualification.shop_id = employment.shop_id
     and qualification.provider_user_id = employment.barber_id
     and qualification.service_id = p_service_id
     and qualification.active
    where employment.shop_id = p_shop_id
      and employment.status = 'active'
      and employment.ended_at is null
      and employment.hired_at <= (now() at time zone p_timezone)::date
      and barber.accepting_bookings
      and profile.role = 'barber'
      and profile.requested_role = 'barber'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
  ) as ranked
  order by ranked.assigned_minutes, ranked.shift_start, ranked.barber_id;
$$;

revoke all on function private.ordered_shop_providers(uuid, uuid, date, text)
  from public, anon, authenticated, service_role;

-- 5. Provider lock, taken after resolution -----------------------------------
-- `any` cannot name its provider before the balance query runs, so the shop and
-- customer locks are taken first and the provider lock follows. The documented
-- global order — shop, customer, provider — is preserved either way, so this
-- cannot deadlock against lock_appointment_capacity.
create or replace function private.lock_appointment_shop_and_customer(
  p_shop_id uuid,
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_shop_id is null or p_customer_id is null then
    raise exception using
      errcode = '22023',
      message = 'Shop and customer are required to lock capacity.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment:shop:' || p_shop_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment:customer:' || p_customer_id::text, 0)
  );
end;
$$;

revoke all on function private.lock_appointment_shop_and_customer(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.lock_appointment_provider(
  p_barber_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_barber_id is null then
    raise exception using
      errcode = '22023',
      message = 'Provider is required to lock capacity.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment:barber:' || p_barber_id::text, 0)
  );
end;
$$;

revoke all on function private.lock_appointment_provider(uuid)
  from public, anon, authenticated, service_role;

-- 6. Create with intent ------------------------------------------------------
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
  v_timezone text;
  v_local_date date;
  v_service_name text;
  v_duration_min integer;
  v_price_cents integer;
  v_buffer_min integer;
  v_ends_at timestamptz;
  v_notes text := nullif(btrim(p_notes), '');
  v_assignment_reason text := nullif(btrim(p_assignment_reason), '');
  v_requested_barber_id uuid;
  v_assigned_barber_id uuid;
  v_assignment_source public.appointment_assignment_source;
  v_candidate uuid;
  v_check record;
begin
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Appointment notes cannot exceed 1000 characters.';
  end if;

  if p_barber_preference <> 'any' and p_barber_id is null and p_requested_barber_id is null then
    raise exception using
      errcode = '22023',
      message = 'Exact and preferred bookings must name a barber.';
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

  perform private.lock_appointment_shop_and_customer(v_lock_shop_id, p_customer_id);
  perform private.require_eligible_booking_customer(p_customer_id);

  select shop.timezone into v_timezone
  from public.shops as shop
  where shop.id = v_lock_shop_id;

  if v_timezone is null then
    raise exception using errcode = 'P0002', message = 'Shop not found.';
  end if;
  v_local_date := (p_starts_at at time zone v_timezone)::date;

  if p_barber_preference = 'any' then
    v_requested_barber_id := null;
  else
    v_requested_barber_id := coalesce(p_requested_barber_id, p_barber_id);
  end if;

  if p_barber_preference = 'exact' then
    -- Exact means exact. A refusal is surfaced, never substituted, because the
    -- customer asked for one specific person.
    v_assigned_barber_id := v_requested_barber_id;
    v_assignment_source := p_assignment_source;
  else
    -- Preferred tries the named barber first and then falls back; any starts
    -- straight from the balanced order. Substitution is visible in
    -- assignment_source and assignment_reason, and costs the customer nothing.
    for v_candidate in
      select provider
      from (
        select v_requested_barber_id as provider, 0 as priority
        where v_requested_barber_id is not null
        union all
        select ordered.provider_user_id, 1
        from private.ordered_shop_providers(
          v_lock_shop_id, p_service_id, v_local_date, v_timezone
        ) as ordered
        where ordered.provider_user_id is distinct from v_requested_barber_id
      ) as ranked
      order by ranked.priority
    loop
      select * into v_check
      from private.slot_is_bookable(
        p_customer_id, v_candidate, p_service_id, p_starts_at, null
      );
      if v_check.bookable then
        v_assigned_barber_id := v_candidate;
        exit;
      end if;
    end loop;

    if v_assigned_barber_id is null then
      -- Distinct from P4026: the chairs may well be free and still nobody
      -- qualified is on shift, so "all chairs taken" would be a lie.
      raise exception using
        errcode = 'P4033',
        message = 'No provider at this shop can take that time.';
    end if;

    if v_assigned_barber_id = v_requested_barber_id then
      v_assignment_source := 'customer';
    else
      v_assignment_source := 'automatic';
      v_assignment_reason := coalesce(
        v_assignment_reason,
        case
          when v_requested_barber_id is null
            then 'Assigned automatically from the providers available at that time.'
          else 'Assigned automatically because the requested barber was not available.'
        end
      );
    end if;
  end if;

  perform private.lock_appointment_provider(v_assigned_barber_id);

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
    v_assigned_barber_id,
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
    v_assigned_barber_id,
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
    v_assignment_source,
    v_assignment_reason
  )
  returning * into v_created;

  return v_created;
end;
$$;

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
