-- P3-01: idempotent booking creation and atomic manual/instant mode selection.
-- The existing P2-07 claim remains the sole availability/assignment authority.

alter table public.users
  add column if not exists manual_approval_until timestamptz;

create table public.booking_create_requests (
  customer_id uuid not null references public.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_payload jsonb not null,
  appointment_id uuid references public.appointments(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint booking_create_requests_pk primary key (customer_id, idempotency_key),
  constraint booking_create_requests_payload_object check (jsonb_typeof(request_payload) = 'object')
);

alter table public.booking_create_requests enable row level security;
revoke all on table public.booking_create_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.booking_create_requests to service_role;

create or replace function public.api_create_booking(
  p_customer_id uuid,
  p_barber_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_notes text,
  p_barber_preference public.appointment_barber_preference,
  p_requested_barber_id uuid,
  p_assignment_source public.appointment_assignment_source,
  p_assignment_reason text,
  p_idempotency_key uuid
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_request public.booking_create_requests%rowtype;
  v_created public.appointments%rowtype;
  v_mode text;
  v_manual_until timestamptz;
begin
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'An idempotency key is required.';
  end if;

  v_payload := jsonb_build_object(
    'barber_id', p_barber_id,
    'service_id', p_service_id,
    'starts_at', p_starts_at,
    'notes', nullif(btrim(p_notes), ''),
    'barber_preference', p_barber_preference,
    'requested_barber_id', p_requested_barber_id
  );

  insert into public.booking_create_requests (
    customer_id, idempotency_key, request_payload
  ) values (
    p_customer_id, p_idempotency_key, v_payload
  )
  on conflict (customer_id, idempotency_key) do nothing;

  select request.* into v_request
  from public.booking_create_requests as request
  where request.customer_id = p_customer_id
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_request.request_payload <> v_payload then
    raise exception using
      errcode = 'P4090',
      message = 'That idempotency key was already used for a different booking.';
  end if;

  if v_request.appointment_id is not null then
    select appointment.* into v_created
    from public.appointments as appointment
    where appointment.id = v_request.appointment_id;
    if found then return v_created; end if;
    raise exception using errcode = 'P0002', message = 'The idempotent booking result no longer exists.';
  end if;

  v_created := public.api_create_appointment(
    p_customer_id,
    p_barber_id,
    p_service_id,
    p_starts_at,
    p_notes,
    p_barber_preference,
    p_requested_barber_id,
    p_assignment_source,
    p_assignment_reason
  );

  select shop.booking_mode, customer.manual_approval_until
  into v_mode, v_manual_until
  from public.shops as shop
  join public.users as customer on customer.id = p_customer_id
  where shop.id = v_created.shop_id;

  if v_mode = 'instant' and (v_manual_until is null or v_manual_until <= now()) then
    update public.appointments
    set status = 'confirmed',
        expires_at = null,
        status_updated_at = now(),
        version = version + 1
    where id = v_created.id
      and status = 'requested'
    returning * into v_created;

    insert into public.appointment_events (
      appointment_id, shop_id, actor_id, actor_role, event_type,
      from_status, to_status, metadata
    ) values (
      v_created.id, v_created.shop_id, null, 'system', 'accepted',
      'requested', 'confirmed', jsonb_build_object('booking_mode', 'instant')
    );
  end if;

  update public.booking_create_requests
  set appointment_id = v_created.id
  where customer_id = p_customer_id
    and idempotency_key = p_idempotency_key;

  return v_created;
end;
$$;

revoke all on function public.api_create_booking(
  uuid, uuid, uuid, timestamptz, text,
  public.appointment_barber_preference, uuid,
  public.appointment_assignment_source, text, uuid
) from public, anon, authenticated;

grant execute on function public.api_create_booking(
  uuid, uuid, uuid, timestamptz, text,
  public.appointment_barber_preference, uuid,
  public.appointment_assignment_source, text, uuid
) to service_role;
