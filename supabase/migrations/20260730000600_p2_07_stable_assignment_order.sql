-- P2-07 follow-up: make automatic assignment actually ordered.
--
-- Found by reviewing 20260730000400 rather than by a failing test, because
-- nothing covered it. Both the create command and the quote built their
-- candidate list like this:
--
--   select provider from (
--     select v_requested_barber_id, 0 as priority where ... is not null
--     union all
--     select ordered.provider_user_id, 1 from private.ordered_shop_providers(...)
--   ) as ranked
--   order by ranked.priority
--
-- `ordered_shop_providers` sorts internally, but that ordering does not survive
-- the UNION ALL: sorting a subquery is not a contract in SQL, and `order by
-- priority` alone leaves every fallback candidate tied. Postgres happened to
-- return them in a helpful order on this data, which is exactly why the tests
-- passed. A different plan — a parallel scan, a hash aggregate, a bigger roster
-- — is free to return them in any order.
--
-- Two contract requirements were therefore unenforced. BOOK-02 says `any`
-- selects the provider with the fewest assigned service minutes on the shop's
-- local date, tie-broken by earliest shift start then provider id, and it says
-- that tie-break exists "so retries agree". Neither held: `any` could pick an
-- arbitrary free provider, and two identical requests could disagree.
--
-- The fix is to carry the rank out of the function as a value instead of hoping
-- the sort survives, and to order by (priority, ordinal).

-- The return type gains a column, so this is a drop rather than a replace.
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
  select
    ranked.barber_id,
    (row_number() over (
      order by ranked.assigned_minutes, ranked.shift_start, ranked.barber_id
    ))::integer
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
  ) as ranked;
$$;

revoke all on function private.ordered_shop_providers(uuid, uuid, date, text)
  from public, anon, authenticated, service_role;

-- A permission error must not read as "no availability" ------------------------
-- slot_is_bookable swallowed 42501 alongside the gate's own refusals. Nothing in
-- the gate raises it, so the only way it could appear is a genuine grant or RLS
-- fault — and turning that into a quietly empty day would hide the fault behind
-- a plausible answer. It now propagates.
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
  when sqlstate '22023'
    or sqlstate '23P01'
    or sqlstate 'P4026'
    or sqlstate 'P4027'
    or sqlstate 'P4028'
    or sqlstate 'P4029'
    or sqlstate 'P4030'
    or sqlstate 'P0002'
  then
    bookable := false;
    reason_code := sqlstate;
end;
$$;

revoke all on function private.slot_is_bookable(uuid, uuid, uuid, timestamptz, uuid)
  from public, anon, authenticated, service_role;

-- Create, now ordered ----------------------------------------------------------
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
    -- straight from the balanced order. Ordering by (priority, ordinal) is what
    -- makes the fallback deterministic: see the note at the top of this file.
    for v_candidate in
      select ranked.provider
      from (
        select v_requested_barber_id as provider, 0 as priority, 0 as ordinal
        where v_requested_barber_id is not null
        union all
        select ordered.provider_user_id, 1, ordered.rank_ordinal
        from private.ordered_shop_providers(
          v_lock_shop_id, p_service_id, v_local_date, v_timezone
        ) as ordered
        where ordered.provider_user_id is distinct from v_requested_barber_id
      ) as ranked
      order by ranked.priority, ranked.ordinal
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

-- Quote, now ordered the same way ----------------------------------------------
-- A quote that named a different provider than the claim would go on to assign
-- would be worse than no quote at all, so it has to walk the identical list.
create or replace function public.api_quote_appointment(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_barber_preference public.appointment_barber_preference default 'exact'
)
returns table (
  bookable boolean,
  reason text,
  provider_user_id uuid,
  requested_barber_id uuid,
  substituted boolean,
  service_name text,
  duration_min integer,
  price_cents integer,
  buffer_min integer,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_timezone text;
  v_local_date date;
  v_requested uuid;
  v_candidate uuid;
  v_chosen uuid;
  v_check record;
  v_slot record;
  v_last_reason text;
begin
  if p_service_id is null or p_starts_at is null then
    raise exception using
      errcode = '22023',
      message = 'Service and start time are required.';
  end if;

  if p_barber_preference <> 'any' and p_barber_id is null then
    raise exception using
      errcode = '22023',
      message = 'Exact and preferred quotes must name a barber.';
  end if;

  select service.shop_id into v_shop_id
  from public.services as service
  where service.id = p_service_id;

  if v_shop_id is null then
    raise exception using errcode = 'P0002', message = 'Service not found.';
  end if;

  select shop.timezone into v_timezone
  from public.shops as shop
  where shop.id = v_shop_id;

  if v_timezone is null then
    raise exception using errcode = 'P0002', message = 'Shop not found.';
  end if;

  v_local_date := (p_starts_at at time zone v_timezone)::date;
  v_requested := case when p_barber_preference = 'any' then null else p_barber_id end;

  if p_barber_preference = 'exact' then
    select * into v_check
    from private.slot_is_bookable(p_customer_id, v_requested, p_service_id, p_starts_at, null);
    if v_check.bookable then
      v_chosen := v_requested;
    else
      v_last_reason := private.slot_reason_label(v_check.reason_code);
    end if;
  else
    for v_candidate in
      select ranked.provider
      from (
        select v_requested as provider, 0 as priority, 0 as ordinal
        where v_requested is not null
        union all
        select ordered.provider_user_id, 1, ordered.rank_ordinal
        from private.ordered_shop_providers(
          v_shop_id, p_service_id, v_local_date, v_timezone
        ) as ordered
        where ordered.provider_user_id is distinct from v_requested
      ) as ranked
      order by ranked.priority, ranked.ordinal
    loop
      select * into v_check
      from private.slot_is_bookable(p_customer_id, v_candidate, p_service_id, p_starts_at, null);
      if v_check.bookable then
        v_chosen := v_candidate;
        exit;
      end if;
    end loop;

    -- Exhausting the candidate list is the same outcome the claim reports as
    -- P4033, so the quote must say the same thing. Reporting the last
    -- candidate's own reason — "slot_taken", say — would be a quote and a claim
    -- disagreeing about why, which is the drift this design exists to prevent.
    if v_chosen is null then
      v_last_reason := private.slot_reason_label('P4033');
    end if;
  end if;

  if v_chosen is null then
    return query select
      false,
      coalesce(v_last_reason, 'validation'),
      null::uuid,
      v_requested,
      false,
      null::text,
      null::integer,
      null::integer,
      null::integer,
      p_starts_at,
      null::timestamptz;
    return;
  end if;

  select * into v_slot
  from private.require_bookable_appointment_slot(
    p_customer_id, v_chosen, p_service_id, p_starts_at, null, null
  );

  return query select
    true,
    null::text,
    v_chosen,
    v_requested,
    v_requested is not null and v_chosen <> v_requested,
    v_slot.slot_service_name,
    v_slot.slot_duration_min,
    v_slot.slot_price_cents,
    v_slot.slot_buffer_min,
    p_starts_at,
    v_slot.slot_ends_at;
end;
$$;

revoke all on function public.api_quote_appointment(
  uuid, uuid, uuid, timestamptz, public.appointment_barber_preference
) from public, anon, authenticated;

grant execute on function public.api_quote_appointment(
  uuid, uuid, uuid, timestamptz, public.appointment_barber_preference
) to service_role;
