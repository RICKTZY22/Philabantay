-- P2-07 (slice 4b): the availability engine can see an owner-provider.
--
-- 20260730000800 gave a provider-enabled owner the foreign-key anchor and the
-- lifecycle permissions they need. This migration teaches the three places that
-- decide *when* someone is available: the claim gate, the balanced-assignment
-- order, and the slot projection.
--
-- An owner has no `barber_employment` row and therefore no shift pattern, so
-- their working window is the shop's own opening hours for that date, including
-- any closure or replacement hours. That is the honest reading: the owner is
-- there when the shop is open. It also means the fifteen-minute grid for an
-- owner is anchored to the shop's opening time rather than to a shift start,
-- which is why require_shop_open_window now hands that time back instead of
-- returning void.

-- 1. The open-hours check now reports which block matched --------------------
-- Same rules as before, including that a window must fit inside ONE block so a
-- booking cannot straddle a midday break. The return type changes, so this is a
-- drop rather than a replace.
drop function if exists private.require_shop_open_window(uuid, date, smallint, timestamp without time zone, timestamp without time zone);

create function private.require_shop_open_window(
  p_shop_id uuid,
  p_local_date date,
  p_local_weekday smallint,
  p_local_start timestamp without time zone,
  p_local_end timestamp without time zone
)
returns time without time zone
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closure_found boolean := false;
  v_closed boolean;
  v_replacement_open time without time zone;
  v_replacement_close time without time zone;
  v_open time without time zone;
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

    return v_replacement_open;
  end if;

  select hours.open_time
  into v_open
  from public.shop_operating_hours as hours
  where hours.shop_id = p_shop_id
    and hours.weekday = p_local_weekday
    and not hours.closed
    and p_local_start >= p_local_date + hours.open_time
    and p_local_end <= p_local_date + hours.close_time
  order by hours.open_time
  limit 1;

  if v_open is null then
    raise exception using
      errcode = 'P4028',
      message = 'That time is outside the shop''s opening hours.';
  end if;

  return v_open;
end;
$$;

revoke all on function private.require_shop_open_window(uuid, date, smallint, timestamp without time zone, timestamp without time zone)
  from public, anon, authenticated, service_role;

-- 2. The claim gate accepts an owner-provider ---------------------------------
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
  v_is_owner_provider boolean := false;
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
    -- Not an employed barber. An owner who has switched their own provider
    -- capability on is the other legitimate provider at this shop.
    select true
    into v_is_owner_provider
    from public.owner_provider_profiles as capability
    join public.shops as shop
      on shop.id = capability.shop_id
    join public.users as profile
      on profile.id = capability.owner_id
    where capability.shop_id = v_shop_id
      and capability.owner_id = p_barber_id
      and capability.active
      and capability.accepting_bookings
      and shop.owner_id = capability.owner_id
      and profile.role = 'shop_owner'
      and profile.requested_role = 'shop_owner'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
    for share of capability, shop, profile;

    if not coalesce(v_is_owner_provider, false) then
      raise exception using
        errcode = '22023',
        message = 'The provider is not verified, active at this shop, or accepting bookings.';
    end if;
  end if;

  perform private.require_provider_qualified(v_shop_id, p_service_id, p_barber_id);

  if v_is_owner_provider then
    -- An owner has no shift roster, so the shop's own opening hours are their
    -- working window and the grid anchors to opening time.
    v_effective_start := private.require_shop_open_window(
      v_shop_id, v_local_date, v_local_weekday, v_local_start, v_local_end
    );
  else
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

    -- Shop hours are checked after the provider's own schedule on purpose. When
    -- a time fails both, "outside the barber schedule" is the more actionable
    -- answer, and it keeps the pre-P2-07 error contract for a request that was
    -- already being refused. See D-026.
    perform private.require_shop_open_window(
      v_shop_id, v_local_date, v_local_weekday, v_local_start, v_local_end
    );
  end if;

  -- Availability starts at the effective boundary — a shift, an exception, or
  -- the shop's opening time for an owner — and then advances in 15-minute steps.
  -- This also supports schedules such as 09:05, where 09:05/09:20 are valid but
  -- wall-clock quarter hours are not.
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

-- 3. Balanced assignment considers the owner ----------------------------------
-- Same ordering contract as 20260730000600: fewest assigned minutes on the local
-- date, then earliest start, then provider id so retries agree. An owner's
-- "shift start" is the shop's opening time that weekday.
drop function if exists private.ordered_shop_providers(uuid, uuid, date, text);

create function private.ordered_shop_providers(
  p_shop_id uuid,
  p_service_id uuid,
  p_local_date date,
  p_timezone text
)
returns table (provider_user_id uuid, rank_ordinal integer)
language sql
security definer
set search_path = ''
as $$
  with candidate as (
    select
      employment.barber_id as provider_id,
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
    where employment.shop_id = p_shop_id
      and employment.status = 'active'
      and employment.ended_at is null
      and employment.hired_at <= (now() at time zone p_timezone)::date
      and barber.accepting_bookings
      and profile.role = 'barber'
      and profile.requested_role = 'barber'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed

    union all

    select
      capability.owner_id,
      coalesce((
        select min(hours.open_time)
        from public.shop_operating_hours as hours
        where hours.shop_id = p_shop_id
          and hours.weekday = extract(dow from p_local_date)::smallint
          and not hours.closed
      ), time '23:59')
    from public.owner_provider_profiles as capability
    join public.shops as shop
      on shop.id = capability.shop_id
    join public.users as profile
      on profile.id = capability.owner_id
    where capability.shop_id = p_shop_id
      and capability.active
      and capability.accepting_bookings
      and shop.owner_id = capability.owner_id
      and profile.role = 'shop_owner'
      and profile.requested_role = 'shop_owner'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
  )
  select
    ranked.provider_id,
    (row_number() over (
      order by ranked.assigned_minutes, ranked.shift_start, ranked.provider_id
    ))::integer
  from (
    select
      candidate.provider_id,
      candidate.shift_start,
      coalesce((
        select sum(assigned.booked_duration_min)
        from public.appointments as assigned
        where assigned.barber_id = candidate.provider_id
          and assigned.shop_id = p_shop_id
          and assigned.status in (
            'requested', 'confirmed', 'checked_in', 'in_progress',
            'awaiting_confirmation', 'completed'
          )
          and (assigned.starts_at at time zone p_timezone)::date = p_local_date
      ), 0) as assigned_minutes
    from candidate
    where exists (
      select 1
      from public.service_qualifications as qualification
      where qualification.shop_id = p_shop_id
        and qualification.provider_user_id = candidate.provider_id
        and qualification.service_id = p_service_id
        and qualification.active
    )
  ) as ranked;
$$;

revoke all on function private.ordered_shop_providers(uuid, uuid, date, text)
  from public, anon, authenticated, service_role;

-- 4. The slot projection offers the owner's hours -----------------------------
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

  select policy.shop_timezone, policy.shop_default_buffer_min
  into v_timezone, v_default_buffer_min
  from private.require_bookable_shop(p_shop_id) as policy;

  v_buffer_min := coalesce(v_service_buffer, v_default_buffer_min, 0);
  v_weekday := extract(dow from p_date)::smallint;

  for v_provider in
    -- Employed barbers and, since Q20, the owner if they perform services.
    -- `is_owner` decides where the candidate windows come from below.
    select employment.id as employment_id, employment.barber_id as provider_id, false as is_owner
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

    union all

    select null::uuid, capability.owner_id, true
    from public.owner_provider_profiles as capability
    join public.shops as shop
      on shop.id = capability.shop_id
    join public.users as profile
      on profile.id = capability.owner_id
    join public.service_qualifications as qualification
      on qualification.shop_id = capability.shop_id
     and qualification.provider_user_id = capability.owner_id
     and qualification.service_id = p_service_id
     and qualification.active
    where capability.shop_id = p_shop_id
      and capability.active
      and capability.accepting_bookings
      and shop.owner_id = capability.owner_id
      and profile.role = 'shop_owner'
      and profile.requested_role = 'shop_owner'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
      and (p_barber_id is null or capability.owner_id = p_barber_id)

    order by 2
  loop
    for v_block in
      -- A barber's windows come from their roster: an exception for the date
      -- replaces the weekly pattern entirely, and an unavailable exception
      -- yields nothing, which is how approved absence removes a day. An owner
      -- has no roster, so their windows are the shop's own hours, with a
      -- closure replacing them the same way.
      with shift_override as (
        select
          shift_exception.is_available,
          shift_exception.start_time,
          shift_exception.end_time
        from public.shift_exceptions as shift_exception
        where not v_provider.is_owner
          and shift_exception.employment_id = v_provider.employment_id
          and shift_exception.date = p_date
      ),
      shop_closure as (
        select
          closure.closed,
          closure.replacement_open_time,
          closure.replacement_close_time
        from public.shop_closures as closure
        where v_provider.is_owner
          and closure.shop_id = p_shop_id
          and closure.local_date = p_date
      )
      select shift_override.start_time, shift_override.end_time
      from shift_override
      where shift_override.is_available
      union all
      select pattern.start_time, pattern.end_time
      from public.shift_patterns as pattern
      where not v_provider.is_owner
        and pattern.employment_id = v_provider.employment_id
        and pattern.weekday = v_weekday
        and not exists (select 1 from shift_override)
      union all
      select shop_closure.replacement_open_time, shop_closure.replacement_close_time
      from shop_closure
      where not shop_closure.closed
      union all
      select hours.open_time, hours.close_time
      from public.shop_operating_hours as hours
      where v_provider.is_owner
        and hours.shop_id = p_shop_id
        and hours.weekday = v_weekday
        and not hours.closed
        and not exists (select 1 from shop_closure)
      order by 1
    loop
      v_block_start := (p_date + v_block.start_time) at time zone v_timezone;
      v_block_end := (p_date + v_block.end_time) at time zone v_timezone;
      v_candidate := v_block_start;

      while v_candidate + make_interval(mins => v_duration_min) <= v_block_end loop
        select * into v_check
        from private.slot_is_bookable(
          p_customer_id,
          v_provider.provider_id,
          p_service_id,
          v_candidate,
          null
        );

        if v_check.bookable then
          provider_user_id := v_provider.provider_id;
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
