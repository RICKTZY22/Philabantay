-- P3-02 slice 1: an owner cannot silently replace an exact provider choice.
-- A later proposal/approval command may perform the change only after recording
-- explicit customer consent; the existing owner reassignment command must fail.

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
  select appointment.* into v_preflight
  from public.appointments as appointment
  where appointment.id = p_appointment_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Appointment not found.';
  end if;

  perform private.lock_appointment_capacity(
    v_preflight.shop_id, v_preflight.customer_id,
    v_preflight.barber_id, p_barber_id
  );

  select appointment.* into v_current
  from public.appointments as appointment
  where appointment.id = p_appointment_id
  for update;

  if v_current.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'Appointment changed; refresh before trying again.';
  end if;
  if not exists (
    select 1 from public.shops as shop
    where shop.id = v_current.shop_id and shop.owner_id = p_owner_id
  ) then
    raise exception using errcode = '42501', message = 'Only the shop owner may reassign this appointment.';
  end if;
  if v_current.status not in ('requested', 'confirmed') or v_current.starts_at <= now() then
    raise exception using errcode = '22023', message = 'This appointment can no longer be reassigned.';
  end if;
  if p_barber_id = v_current.barber_id then
    raise exception using errcode = '22023', message = 'The selected barber is already assigned.';
  end if;
  if v_current.barber_preference = 'exact' then
    raise exception using
      errcode = 'P4021',
      message = 'An exact barber choice requires a customer-approved change proposal.';
  end if;

  v_reason := private.require_appointment_reason(p_reason);

  perform private.require_reassignable_appointment_slot(
    v_current.customer_id, p_barber_id, v_current.shop_id,
    v_current.starts_at, v_current.booked_duration_min, v_current.id
  );

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
    v_updated.id, v_updated.shop_id, p_owner_id, 'shop_owner', 'reassigned',
    v_current.status, v_updated.status, v_reason,
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
