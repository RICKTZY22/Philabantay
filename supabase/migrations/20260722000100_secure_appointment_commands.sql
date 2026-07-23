-- P1-04: make appointment creation command-only and appointment history
-- append-only. Browser JWTs retain participant-scoped reads, while the
-- service-role API must use the invariant-checking command below to create a
-- reservation. Existing lifecycle RPCs become SECURITY DEFINER before direct
-- event insertion is removed. Raw service-role appointment UPDATE remains an
-- explicitly tracked follow-up until the worker fixtures use command-only time.

-- Remove both table-level and the legacy column-level mutation grants. The
-- matching permissive policies are dropped too, so a future accidental grant
-- cannot silently reopen the old browser write path.
revoke insert, update, delete on table public.appointments from anon, authenticated;
revoke update (barber_id, service_id, starts_at, status, notes)
  on table public.appointments from authenticated;
drop policy if exists appointments_insert_customer on public.appointments;
drop policy if exists appointments_update_participant on public.appointments;

-- The check-in hash is password-equivalent data. Participant RLS determines
-- which rows a browser JWT may read; column grants additionally ensure that no
-- participant can retrieve the hash and brute-force the six-digit code offline.
revoke select on table public.appointments from anon, authenticated;
grant select (
  id,
  customer_id,
  barber_id,
  shop_id,
  service_id,
  starts_at,
  ends_at,
  status,
  notes,
  created_at,
  updated_at,
  version,
  status_updated_at,
  expires_at,
  checked_in_at,
  actual_started_at,
  actual_finished_at,
  completion_due_at,
  completed_at,
  cancelled_at,
  cancelled_by,
  cancellation_reason,
  no_show_marked_at,
  no_show_marked_by,
  no_show_reason,
  dispute_opened_at,
  dispute_reason,
  booked_service_name,
  booked_duration_min,
  booked_price_cents,
  check_in_code_expires_at
) on table public.appointments to authenticated;

-- All appointment-changing commands share this final customer-capacity guard,
-- including older reschedule/reassign RPCs that do not yet take the creation
-- command's advisory locks.
alter table public.appointments
  add constraint appointments_no_customer_overlap
  exclude using gist (
    customer_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in (
    'requested',
    'confirmed',
    'checked_in',
    'in_progress',
    'awaiting_confirmation'
  ));

-- Even the Express service-role client must not create raw appointment rows.
-- api_create_appointment is SECURITY DEFINER, owned by the migration owner,
-- and is the sole production creation path.
revoke insert, delete, truncate on table public.appointments from service_role;

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
  created_row public.appointments%rowtype;
  appointment_shop_id uuid;
  active_employment_id uuid;
  service_name text;
  service_duration integer;
  service_price integer;
  appointment_end timestamptz;
  local_start timestamp without time zone;
  local_end timestamp without time zone;
  local_date date;
  local_weekday smallint;
  normalized_notes text;
  customer_allowed boolean := false;
  barber_allowed boolean := false;
  exception_found boolean := false;
  exception_available boolean;
  exception_start time without time zone;
  exception_end time without time zone;
  inside_shift boolean := false;
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

  normalized_notes := nullif(btrim(p_notes), '');
  if normalized_notes is not null and char_length(normalized_notes) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Appointment notes cannot exceed 1000 characters.';
  end if;

  -- Booking commands always take these locks in customer-then-barber order.
  -- This makes the overlap check and final insert one serialized decision for
  -- concurrent requests using this command. The exclusion constraint remains
  -- the final provider-overlap guard.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment:customer:' || p_customer_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('appointment:barber:' || p_barber_id::text, 0)
  );

  -- A pending/rejected/suspended professional request cannot inherit customer
  -- booking privileges while its account is in the restricted shell.
  select true
    into customer_allowed
  from public.users as customer
  where customer.id = p_customer_id
    and customer.role = 'customer'
    and customer.onboarding_completed
    and customer.requested_role = 'customer'
    and customer.verification_status = 'not_required'
  for share;

  if coalesce(customer_allowed, false) is not true then
    raise exception using
      errcode = '42501',
      message = 'This customer account cannot create appointments.';
  end if;

  select
    service.shop_id,
    service.name,
    service.duration_min,
    service.price_cents
  into
    appointment_shop_id,
    service_name,
    service_duration,
    service_price
  from public.services as service
  where service.id = p_service_id
    and service.active
  for share;

  if appointment_shop_id is null then
    raise exception using
      errcode = '22023',
      message = 'The selected service is not active.';
  end if;

  select employment.id
    into active_employment_id
  from public.barber_employment as employment
  where employment.barber_id = p_barber_id
    and employment.shop_id = appointment_shop_id
    and employment.status = 'active'
    and employment.ended_at is null
    and employment.hired_at <= (p_starts_at at time zone 'Asia/Manila')::date
  for share;

  if active_employment_id is null then
    raise exception using
      errcode = '22023',
      message = 'The barber is not active at the service shop.';
  end if;

  select true
    into barber_allowed
  from public.barbers as barber
  join public.users as profile on profile.id = barber.id
  where barber.id = p_barber_id
    and barber.accepting_bookings
    and profile.role = 'barber'
    and profile.requested_role = 'barber'
    and profile.verification_status = 'verified'
    and profile.onboarding_completed
  for share of barber, profile;

  if coalesce(barber_allowed, false) is not true then
    raise exception using
      errcode = '22023',
      message = 'The barber is not verified or is not accepting bookings.';
  end if;

  appointment_end := p_starts_at + make_interval(mins => service_duration);

  -- Shop timezone is not modelled yet. Match the existing V1 availability
  -- behavior in Asia/Manila until Phase 2 persists an IANA timezone per shop.
  local_start := p_starts_at at time zone 'Asia/Manila';
  local_end := appointment_end at time zone 'Asia/Manila';
  local_date := local_start::date;
  local_weekday := extract(dow from local_start)::smallint;

  select
    exception.is_available,
    exception.start_time,
    exception.end_time
  into
    exception_available,
    exception_start,
    exception_end
  from public.shift_exceptions as exception
  where exception.employment_id = active_employment_id
    and exception.date = local_date
  for share;
  exception_found := found;

  if exception_found then
    inside_shift := exception_available
      and local_start >= local_date + exception_start
      and local_end <= local_date + exception_end;
  else
    select true
      into inside_shift
    from public.shift_patterns as pattern
    where pattern.employment_id = active_employment_id
      and pattern.weekday = local_weekday
      and local_start >= local_date + pattern.start_time
      and local_end <= local_date + pattern.end_time
    order by pattern.start_time
    limit 1
    for share;
    inside_shift := coalesce(inside_shift, false);
  end if;

  if not inside_shift then
    raise exception using
      errcode = '22023',
      message = 'Selected time is outside the barber schedule.';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.barber_id = p_barber_id
      and appointment.status in (
        'requested',
        'confirmed',
        'checked_in',
        'in_progress',
        'awaiting_confirmation'
      )
      and appointment.starts_at < appointment_end
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
      and appointment.status in (
        'requested',
        'confirmed',
        'checked_in',
        'in_progress',
        'awaiting_confirmation'
      )
      and appointment.starts_at < appointment_end
      and appointment.ends_at > p_starts_at
  ) then
    raise exception using
      errcode = '23P01',
      message = 'The customer already has an appointment at that time.';
  end if;

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
    appointment_shop_id,
    p_service_id,
    p_starts_at,
    appointment_end,
    'requested',
    normalized_notes,
    service_name,
    service_duration,
    service_price
  )
  returning * into created_row;

  return created_row;
end;
$$;

revoke all on function public.api_create_appointment(uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.api_create_appointment(uuid, uuid, uuid, timestamptz, text)
  to service_role;

-- Existing lifecycle commands already repeat actor, ownership, state and
-- optimistic-version checks. Run their writes as the migration owner so the
-- service-role client no longer needs permission to forge history rows.
alter function public.api_transition_appointment(uuid, integer, text, uuid, text, text)
  security definer;
alter function public.api_issue_appointment_check_in_code(uuid, integer, uuid, text)
  security definer;
alter function public.api_reschedule_appointment(uuid, integer, uuid, uuid, uuid, timestamptz, text)
  security definer;
alter function public.api_expire_due_appointments()
  security definer;
alter function public.api_finalize_due_appointments()
  security definer;
alter function public.api_reassign_appointment(uuid, integer, uuid, uuid, text)
  security definer;

-- History is append-only even for privileged application code. The row trigger
-- also blocks cascade deletes; future retention/correction work must add an
-- explicit audited mechanism rather than rewriting this ledger.
create or replace function private.reject_appointment_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Appointment events are append-only.';
end;
$$;

revoke all on function private.reject_appointment_event_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists appointment_events_reject_update_delete
  on public.appointment_events;
create trigger appointment_events_reject_update_delete
  before update or delete on public.appointment_events
  for each row execute function private.reject_appointment_event_mutation();

drop trigger if exists appointment_events_reject_truncate
  on public.appointment_events;
create trigger appointment_events_reject_truncate
  before truncate on public.appointment_events
  for each statement execute function private.reject_appointment_event_mutation();

revoke insert, update, delete, truncate on table public.appointment_events
  from service_role;
grant select on table public.appointment_events to service_role;
