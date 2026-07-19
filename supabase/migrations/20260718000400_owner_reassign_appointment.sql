-- Owners may reassign a future active reservation without changing its
-- service/time. Express validates the new barber's shift first; this function
-- repeats ownership, employment, state, and version checks atomically.

create or replace function public.api_reassign_appointment(
  p_appointment_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_barber_id uuid,
  p_reason text
)
returns public.appointments
language plpgsql
set search_path = ''
as $$
declare
  current_row public.appointments%rowtype;
  updated_row public.appointments%rowtype;
  normalized_reason text;
begin
  select * into current_row
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Appointment not found.';
  end if;
  if current_row.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'Appointment changed; refresh before trying again.';
  end if;
  if not exists (
    select 1 from public.shops as shop
    where shop.id = current_row.shop_id and shop.owner_id = p_owner_id
  ) then
    raise exception using errcode = '42501', message = 'Only the shop owner may reassign this appointment.';
  end if;
  if current_row.status not in ('requested', 'confirmed') or current_row.starts_at <= now() then
    raise exception using errcode = '22023', message = 'This appointment can no longer be reassigned.';
  end if;
  if p_barber_id = current_row.barber_id then
    raise exception using errcode = '22023', message = 'The selected barber is already assigned.';
  end if;
  if not private.is_active_barber_for_shop(current_row.shop_id, p_barber_id) then
    raise exception using errcode = '22023', message = 'The new barber must be active at the same shop.';
  end if;

  normalized_reason := private.require_appointment_reason(p_reason);

  update public.appointments
  set barber_id = p_barber_id,
      version = version + 1
  where id = current_row.id
  returning * into updated_row;

  insert into public.appointment_events (
    appointment_id, shop_id, actor_id, actor_role, event_type,
    from_status, to_status, reason, metadata
  ) values (
    updated_row.id,
    updated_row.shop_id,
    p_owner_id,
    'shop_owner',
    'reassigned',
    current_row.status,
    updated_row.status,
    normalized_reason,
    jsonb_build_object(
      'previous_barber_id', current_row.barber_id,
      'new_barber_id', updated_row.barber_id
    )
  );

  return updated_row;
end;
$$;

revoke all on function public.api_reassign_appointment(uuid, integer, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.api_reassign_appointment(uuid, integer, uuid, uuid, text)
  to service_role;
