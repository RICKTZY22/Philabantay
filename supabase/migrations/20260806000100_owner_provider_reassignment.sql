-- Owner-providers can be reassigned to, and can be reassigned away from.
--
-- Q20/D-028 made a provider-enabled owner a first-class provider: the claim gate
-- (`private.require_bookable_appointment_slot`), the assignment lock, and the
-- availability projection all read `public.owner_provider_profiles`. Reassignment
-- uses a *different* gate, and that one was never extended, so it resolved a
-- provider only through `public.barber_employment` and raised
--   22023 'The barber is not verified, active at this shop, or accepting bookings.'
-- for an owner who is a perfectly bookable provider at their own shop.
--
-- The effect: a customer could book an owner-provider directly, but an owner
-- could never move a booking to themselves, and a booking already assigned to
-- them could not be moved away without first tripping the same refusal.
--
-- This mirrors the two branches the claim gate already uses, including the part
-- that is easy to get wrong: an owner has no shift roster, so the shop's own
-- opening hours are their working window and the 15-minute grid anchors to
-- opening time rather than to a shift start. Everything else about the function
-- is unchanged, including the deliberate omission of shop-hours, chair-capacity
-- and booking-window re-checks, which is correct because reassignment changes
-- only `barber_id` and passes the existing `starts_at` through.

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
  v_is_owner_provider boolean := false;
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
    -- Same second branch as the claim gate: an owner who switched their own
    -- provider capability on is the other legitimate provider at this shop.
    select true
    into v_is_owner_provider
    from public.owner_provider_profiles as capability
    join public.shops as shop
      on shop.id = capability.shop_id
    join public.users as profile
      on profile.id = capability.owner_id
    where capability.shop_id = p_shop_id
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

  perform private.require_provider_qualified(p_shop_id, v_service_id, p_barber_id);

  if v_is_owner_provider then
    -- No shift roster exists for an owner, so the shop's opening hours are the
    -- working window and the grid anchors to opening time.
    v_effective_start := private.require_shop_open_window(
      p_shop_id, v_local_date, v_local_weekday, v_local_start, v_local_end
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
