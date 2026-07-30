-- P2-07 (slice 3b): the read-only quote behind POST /bookings/quote.
--
-- A quote answers two questions the customer UI needs before it commits: would
-- this slot be accepted, and which provider would actually take it. It runs the
-- same gate as the claim, so a quote that says yes and a claim that says no can
-- only differ because the world changed in between, never because two
-- implementations disagree.
--
-- Deliberately lock-free. Taking the shop advisory lock here would let any
-- anonymous-ish read serialise every booking at a busy shop, and a quote is
-- advisory by nature: the claim re-checks everything under the real locks.

-- Reason codes are translated to the same vocabulary the HTTP layer already
-- uses, so a refusal reads identically whether it arrives as a quote field or as
-- an error response body.
create or replace function private.slot_reason_label(p_sqlstate text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_sqlstate
    when 'P4026' then 'chairs_unavailable'
    when 'P4027' then 'shop_not_bookable'
    when 'P4028' then 'outside_shop_hours'
    when 'P4029' then 'outside_booking_window'
    when 'P4030' then 'provider_not_qualified'
    when 'P4033' then 'no_provider_available'
    when '23P01' then 'slot_taken'
    when '42501' then 'forbidden'
    when 'P0002' then 'not_found'
    else 'validation'
  end;
$$;

revoke all on function private.slot_reason_label(text)
  from public, anon, authenticated, service_role;

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
      select provider
      from (
        select v_requested as provider, 0 as priority
        where v_requested is not null
        union all
        select ordered.provider_user_id, 1
        from private.ordered_shop_providers(
          v_shop_id, p_service_id, v_local_date, v_timezone
        ) as ordered
        where ordered.provider_user_id is distinct from v_requested
      ) as ranked
      order by ranked.priority
    loop
      select * into v_check
      from private.slot_is_bookable(p_customer_id, v_candidate, p_service_id, p_starts_at, null);
      if v_check.bookable then
        v_chosen := v_candidate;
        exit;
      end if;
      -- Keep the last refusal so an all-providers-busy answer still says why.
      v_last_reason := private.slot_reason_label(v_check.reason_code);
    end loop;
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
