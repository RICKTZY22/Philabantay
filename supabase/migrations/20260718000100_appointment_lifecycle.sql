-- Trustworthy appointment lifecycle, transaction snapshots, optimistic
-- concurrency, and immutable event history. All lifecycle command functions
-- are service-role only; Express performs the first authorization layer and
-- these functions repeat actor/ownership/state checks atomically.

drop trigger if exists appointments_enforce_direct_update on public.appointments;
alter table public.appointments drop constraint if exists appointments_no_barber_overlap;
alter table public.appointments alter column status drop default;

create type public.appointment_status_v2 as enum (
  'requested',
  'confirmed',
  'checked_in',
  'in_progress',
  'awaiting_confirmation',
  'declined',
  'expired',
  'cancelled',
  'completed',
  'customer_no_show',
  'disputed'
);

alter table public.appointments
  alter column status type public.appointment_status_v2
  using (
    case status::text
      when 'pending' then 'requested'
      when 'no_show' then 'customer_no_show'
      else status::text
    end
  )::public.appointment_status_v2;

drop type public.appointment_status;
alter type public.appointment_status_v2 rename to appointment_status;

alter table public.appointments
  alter column status set default 'requested',
  add column version integer not null default 1,
  add column status_updated_at timestamptz not null default now(),
  add column expires_at timestamptz,
  add column checked_in_at timestamptz,
  add column actual_started_at timestamptz,
  add column actual_finished_at timestamptz,
  add column completion_due_at timestamptz,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.users(id) on delete restrict,
  add column cancellation_reason text,
  add column no_show_marked_at timestamptz,
  add column no_show_marked_by uuid references public.users(id) on delete restrict,
  add column no_show_reason text,
  add column dispute_opened_at timestamptz,
  add column dispute_reason text,
  add column booked_service_name text,
  add column booked_duration_min integer,
  add column booked_price_cents integer,
  add column check_in_code_hash text,
  add column check_in_code_expires_at timestamptz;

update public.appointments as appointment
set booked_service_name = service.name,
    booked_duration_min = service.duration_min,
    booked_price_cents = service.price_cents,
    expires_at = case
      when appointment.status = 'requested' then appointment.created_at + interval '15 minutes'
      else null
    end,
    completed_at = case
      when appointment.status = 'completed' then coalesce(appointment.updated_at, appointment.ends_at)
      else null
    end
from public.services as service
where service.id = appointment.service_id
  and service.shop_id = appointment.shop_id;

alter table public.appointments
  alter column booked_service_name set not null,
  alter column booked_duration_min set not null,
  alter column booked_price_cents set not null,
  add constraint appointments_version_positive check (version >= 1),
  add constraint appointments_snapshot_name check (char_length(btrim(booked_service_name)) between 1 and 120),
  add constraint appointments_snapshot_duration check (booked_duration_min between 5 and 480),
  add constraint appointments_snapshot_price check (booked_price_cents >= 0),
  add constraint appointments_cancellation_reason check (
    cancellation_reason is null or char_length(btrim(cancellation_reason)) between 3 and 1000
  ),
  add constraint appointments_no_show_reason check (
    no_show_reason is null or char_length(btrim(no_show_reason)) between 3 and 1000
  ),
  add constraint appointments_dispute_reason check (
    dispute_reason is null or char_length(btrim(dispute_reason)) between 3 and 1000
  ),
  add constraint appointments_actual_time_order check (
    actual_finished_at is null
    or (actual_started_at is not null and actual_started_at <= actual_finished_at)
  ),
  add constraint appointments_no_barber_overlap
    exclude using gist (
      barber_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status in (
      'requested',
      'confirmed',
      'checked_in',
      'in_progress',
      'awaiting_confirmation'
    ));

create index appointments_expiration_idx
  on public.appointments (expires_at)
  where status = 'requested';

create index appointments_completion_due_idx
  on public.appointments (completion_due_at)
  where status = 'awaiting_confirmation';

create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_id uuid references public.users(id) on delete restrict,
  actor_role text not null,
  event_type text not null,
  from_status public.appointment_status,
  to_status public.appointment_status not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint appointment_events_actor_role check (
    actor_role in ('customer', 'barber', 'shop_owner', 'admin', 'system')
  ),
  constraint appointment_events_type check (
    event_type in (
      'created',
      'accepted',
      'declined',
      'checked_in',
      'started',
      'finished',
      'completion_confirmed',
      'auto_completed',
      'cancelled',
      'customer_no_show',
      'disputed',
      'dispute_resolved',
      'expired',
      'rescheduled',
      'reassigned',
      'check_in_code_issued'
    )
  ),
  constraint appointment_events_reason_length check (
    reason is null or char_length(btrim(reason)) between 3 and 1000
  ),
  constraint appointment_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index appointment_events_appointment_created_idx
  on public.appointment_events (appointment_id, created_at, id);

create index appointment_events_shop_created_idx
  on public.appointment_events (shop_id, created_at desc);

insert into public.appointment_events (
  appointment_id,
  shop_id,
  actor_id,
  actor_role,
  event_type,
  from_status,
  to_status,
  metadata,
  created_at
)
select
  appointment.id,
  appointment.shop_id,
  appointment.customer_id,
  'customer',
  'created',
  null,
  appointment.status,
  jsonb_build_object('backfilled', true),
  appointment.created_at
from public.appointments as appointment;

create or replace function private.prepare_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_name text;
  service_duration integer;
  service_price integer;
  service_is_active boolean;
  actor_id uuid := (select auth.uid());
begin
  select s.name, s.duration_min, s.price_cents, s.active
    into service_name, service_duration, service_price, service_is_active
  from public.services as s
  where s.id = new.service_id
    and s.shop_id = new.shop_id;

  if service_duration is null then
    raise exception using
      errcode = '23503',
      message = 'Service does not belong to the appointment shop.';
  end if;

  if (tg_op = 'INSERT'
      or new.service_id is distinct from old.service_id
      or new.shop_id is distinct from old.shop_id)
    and not service_is_active then
    raise exception using
      errcode = '23514',
      message = 'Inactive services cannot be booked.';
  end if;

  if not private.is_active_barber_for_shop(new.shop_id, new.barber_id) then
    raise exception using
      errcode = '23514',
      message = 'Barber is not active at the appointment shop.';
  end if;

  if new.starts_at <= now() and tg_op = 'INSERT' then
    raise exception using
      errcode = '23514',
      message = 'Appointment must start in the future.';
  end if;

  if tg_op = 'INSERT' and actor_id is not null then
    new.customer_id := actor_id;
    new.status := 'requested';
  end if;

  if tg_op = 'INSERT'
      or new.service_id is distinct from old.service_id
      or new.shop_id is distinct from old.shop_id then
    new.booked_service_name := service_name;
    new.booked_duration_min := service_duration;
    new.booked_price_cents := service_price;
  end if;

  new.ends_at := new.starts_at + make_interval(mins => new.booked_duration_min);
  if tg_op = 'INSERT' and new.status = 'requested' then
    new.expires_at := coalesce(new.expires_at, now() + interval '15 minutes');
  end if;
  return new;
end;
$$;

create or replace function private.record_appointment_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.appointment_events (
    appointment_id,
    shop_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    metadata,
    created_at
  ) values (
    new.id,
    new.shop_id,
    new.customer_id,
    'customer',
    'created',
    null,
    new.status,
    '{}'::jsonb,
    new.created_at
  );
  return new;
end;
$$;

drop trigger if exists appointments_record_created on public.appointments;
create trigger appointments_record_created
  after insert on public.appointments
  for each row execute function private.record_appointment_created();

-- Direct authenticated appointment updates are removed. The service-role API
-- command functions below are the only write path for lifecycle mutations.
revoke update (barber_id, service_id, starts_at, status, notes)
  on table public.appointments from authenticated;

create or replace function private.appointment_actor_role(p_actor_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role::text
  from public.users as u
  where u.id = p_actor_id;
$$;

create or replace function private.require_appointment_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := btrim(coalesce(p_reason, ''));
begin
  if char_length(normalized) < 3 or char_length(normalized) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'A reason between 3 and 1000 characters is required.';
  end if;
  return normalized;
end;
$$;

revoke all on function private.appointment_actor_role(uuid) from public, anon, authenticated;
revoke all on function private.require_appointment_reason(text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.appointment_actor_role(uuid) to service_role;
grant execute on function private.require_appointment_reason(text) to service_role;
grant execute on function private.is_active_barber_for_shop(uuid, uuid) to service_role;

create or replace function public.api_transition_appointment(
  p_appointment_id uuid,
  p_expected_version integer,
  p_action text,
  p_actor_id uuid default null,
  p_reason text default null,
  p_check_in_code text default null
)
returns public.appointments
language plpgsql
set search_path = ''
as $$
declare
  current_row public.appointments%rowtype;
  updated_row public.appointments%rowtype;
  next_status public.appointment_status;
  event_name text;
  actor_role text;
  normalized_reason text;
  transition_time timestamptz := now();
  owns_shop boolean := false;
  assigned_barber boolean := false;
  is_customer boolean := false;
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

  if p_actor_id is null then
    actor_role := 'system';
  else
    actor_role := private.appointment_actor_role(p_actor_id);
    if actor_role is null then
      raise exception using errcode = '42501', message = 'Appointment actor is invalid.';
    end if;
    is_customer := current_row.customer_id = p_actor_id;
    assigned_barber := current_row.barber_id = p_actor_id
      and private.is_active_barber_for_shop(current_row.shop_id, p_actor_id);
    select exists (
      select 1 from public.shops as shop
      where shop.id = current_row.shop_id and shop.owner_id = p_actor_id
    ) into owns_shop;
  end if;

  case p_action
    when 'accept' then
      if not owns_shop or current_row.status <> 'requested' then
        raise exception using errcode = '42501', message = 'Only the shop owner may accept a requested appointment.';
      end if;
      if current_row.expires_at is not null and current_row.expires_at <= transition_time then
        raise exception using errcode = '22023', message = 'This reservation request has expired.';
      end if;
      next_status := 'confirmed';
      event_name := 'accepted';

    when 'decline' then
      if not owns_shop or current_row.status <> 'requested' then
        raise exception using errcode = '42501', message = 'Only the shop owner may decline a requested appointment.';
      end if;
      normalized_reason := private.require_appointment_reason(p_reason);
      next_status := 'declined';
      event_name := 'declined';

    when 'expire' then
      if p_actor_id is not null or current_row.status <> 'requested'
          or current_row.expires_at is null or current_row.expires_at > transition_time then
        raise exception using errcode = '22023', message = 'Appointment is not eligible for expiration.';
      end if;
      next_status := 'expired';
      event_name := 'expired';

    when 'check_in' then
      if current_row.status <> 'confirmed' then
        raise exception using errcode = '22023', message = 'Only confirmed appointments can check in.';
      end if;
      if transition_time < current_row.starts_at - interval '30 minutes'
          or transition_time > current_row.ends_at then
        raise exception using errcode = '22023', message = 'Customer check-in is outside the allowed time window.';
      end if;
      if is_customer then
        if current_row.check_in_code_hash is null
            or current_row.check_in_code_expires_at is null
            or current_row.check_in_code_expires_at < transition_time
            or p_check_in_code is null
            or extensions.crypt(p_check_in_code, current_row.check_in_code_hash) <> current_row.check_in_code_hash then
          raise exception using errcode = '22023', message = 'Check-in code is invalid or expired.';
        end if;
      elsif owns_shop then
        normalized_reason := private.require_appointment_reason(p_reason);
      else
        raise exception using errcode = '42501', message = 'Only the customer or shop owner may check in this appointment.';
      end if;
      next_status := 'checked_in';
      event_name := 'checked_in';

    when 'start' then
      if not assigned_barber or current_row.status <> 'checked_in' then
        raise exception using errcode = '42501', message = 'Only the assigned barber may start a checked-in appointment.';
      end if;
      if transition_time < current_row.starts_at - interval '30 minutes' then
        raise exception using errcode = '22023', message = 'The appointment cannot start this early.';
      end if;
      next_status := 'in_progress';
      event_name := 'started';

    when 'finish' then
      if not assigned_barber or current_row.status <> 'in_progress'
          or current_row.actual_started_at is null then
        raise exception using errcode = '42501', message = 'Only the assigned barber may finish an in-progress appointment.';
      end if;
      next_status := 'awaiting_confirmation';
      event_name := 'finished';

    when 'confirm_completion' then
      if not is_customer or current_row.status <> 'awaiting_confirmation' then
        raise exception using errcode = '42501', message = 'Only the customer may confirm this completed service.';
      end if;
      next_status := 'completed';
      event_name := 'completion_confirmed';

    when 'auto_complete' then
      if p_actor_id is not null or current_row.status <> 'awaiting_confirmation'
          or current_row.completion_due_at is null or current_row.completion_due_at > transition_time then
        raise exception using errcode = '22023', message = 'Appointment is not eligible for automatic completion.';
      end if;
      next_status := 'completed';
      event_name := 'auto_completed';

    when 'cancel' then
      if not (is_customer or assigned_barber or owns_shop)
          or current_row.status not in ('requested', 'confirmed') then
        raise exception using errcode = '42501', message = 'This actor cannot cancel the appointment in its current state.';
      end if;
      if current_row.starts_at <= transition_time then
        raise exception using errcode = '22023', message = 'An appointment that has started cannot be cancelled.';
      end if;
      normalized_reason := private.require_appointment_reason(p_reason);
      next_status := 'cancelled';
      event_name := 'cancelled';

    when 'mark_customer_no_show' then
      if not assigned_barber or current_row.status <> 'confirmed' then
        raise exception using errcode = '42501', message = 'Only the assigned barber may mark this customer no-show.';
      end if;
      if transition_time < current_row.starts_at + interval '15 minutes' then
        raise exception using errcode = '22023', message = 'The customer no-show grace period has not passed.';
      end if;
      normalized_reason := private.require_appointment_reason(p_reason);
      next_status := 'customer_no_show';
      event_name := 'customer_no_show';

    when 'dispute' then
      if not is_customer or current_row.status <> 'awaiting_confirmation' then
        raise exception using errcode = '42501', message = 'Only the customer may dispute a service awaiting confirmation.';
      end if;
      normalized_reason := private.require_appointment_reason(p_reason);
      next_status := 'disputed';
      event_name := 'disputed';

    when 'resolve_complete' then
      if not owns_shop or current_row.status <> 'disputed' then
        raise exception using errcode = '42501', message = 'Only the shop owner may resolve this dispute.';
      end if;
      normalized_reason := private.require_appointment_reason(p_reason);
      next_status := 'completed';
      event_name := 'dispute_resolved';

    when 'resolve_cancel' then
      if not owns_shop or current_row.status <> 'disputed' then
        raise exception using errcode = '42501', message = 'Only the shop owner may resolve this dispute.';
      end if;
      normalized_reason := private.require_appointment_reason(p_reason);
      next_status := 'cancelled';
      event_name := 'dispute_resolved';

    else
      raise exception using errcode = '22023', message = 'Unknown appointment action.';
  end case;

  update public.appointments
  set status = next_status,
      status_updated_at = transition_time,
      version = version + 1,
      expires_at = case when next_status = 'requested' then expires_at else null end,
      checked_in_at = case when p_action = 'check_in' then transition_time else checked_in_at end,
      actual_started_at = case when p_action = 'start' then transition_time else actual_started_at end,
      actual_finished_at = case when p_action = 'finish' then transition_time else actual_finished_at end,
      completion_due_at = case
        when p_action = 'finish' then transition_time + interval '120 minutes'
        when next_status in ('completed', 'cancelled') then null
        else completion_due_at
      end,
      completed_at = case when next_status = 'completed' then transition_time else completed_at end,
      cancelled_at = case when next_status = 'cancelled' then transition_time else cancelled_at end,
      cancelled_by = case when next_status = 'cancelled' then p_actor_id else cancelled_by end,
      cancellation_reason = case when next_status = 'cancelled' then normalized_reason else cancellation_reason end,
      no_show_marked_at = case when next_status = 'customer_no_show' then transition_time else no_show_marked_at end,
      no_show_marked_by = case when next_status = 'customer_no_show' then p_actor_id else no_show_marked_by end,
      no_show_reason = case when next_status = 'customer_no_show' then normalized_reason else no_show_reason end,
      dispute_opened_at = case when next_status = 'disputed' then transition_time else dispute_opened_at end,
      dispute_reason = case when next_status = 'disputed' then normalized_reason else dispute_reason end,
      check_in_code_hash = case when p_action = 'check_in' then null else check_in_code_hash end,
      check_in_code_expires_at = case when p_action = 'check_in' then null else check_in_code_expires_at end
  where id = current_row.id
  returning * into updated_row;

  insert into public.appointment_events (
    appointment_id,
    shop_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    reason,
    metadata
  ) values (
    updated_row.id,
    updated_row.shop_id,
    p_actor_id,
    actor_role,
    event_name,
    current_row.status,
    updated_row.status,
    normalized_reason,
    '{}'::jsonb
  );

  return updated_row;
end;
$$;

create or replace function public.api_issue_appointment_check_in_code(
  p_appointment_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_code text
)
returns public.appointments
language plpgsql
set search_path = ''
as $$
declare
  current_row public.appointments%rowtype;
  updated_row public.appointments%rowtype;
  actor_role text;
  owns_shop boolean;
  assigned_barber boolean;
begin
  if p_code !~ '^\d{6}$' then
    raise exception using errcode = '22023', message = 'Check-in code must contain 6 digits.';
  end if;

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
  if current_row.status <> 'confirmed' then
    raise exception using errcode = '22023', message = 'Check-in codes are available only for confirmed appointments.';
  end if;

  actor_role := private.appointment_actor_role(p_actor_id);
  select exists (
    select 1 from public.shops as shop
    where shop.id = current_row.shop_id and shop.owner_id = p_actor_id
  ) into owns_shop;
  assigned_barber := current_row.barber_id = p_actor_id
    and private.is_active_barber_for_shop(current_row.shop_id, p_actor_id);
  if not (owns_shop or assigned_barber) then
    raise exception using errcode = '42501', message = 'Only assigned shop staff may issue a check-in code.';
  end if;

  update public.appointments
  set check_in_code_hash = extensions.crypt(p_code, extensions.gen_salt('bf')),
      check_in_code_expires_at = least(ends_at, now() + interval '30 minutes'),
      version = version + 1
  where id = current_row.id
  returning * into updated_row;

  insert into public.appointment_events (
    appointment_id, shop_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata
  ) values (
    updated_row.id, updated_row.shop_id, p_actor_id, actor_role,
    'check_in_code_issued', current_row.status, updated_row.status,
    jsonb_build_object('expires_at', updated_row.check_in_code_expires_at)
  );

  return updated_row;
end;
$$;

create or replace function public.api_reschedule_appointment(
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
set search_path = ''
as $$
declare
  current_row public.appointments%rowtype;
  updated_row public.appointments%rowtype;
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
  if current_row.customer_id <> p_customer_id then
    raise exception using errcode = '42501', message = 'Customers may only reschedule their own appointment.';
  end if;
  if current_row.status not in ('requested', 'confirmed') or current_row.starts_at <= now() then
    raise exception using errcode = '22023', message = 'This appointment can no longer be rescheduled.';
  end if;
  if p_starts_at <= now() then
    raise exception using errcode = '22023', message = 'Appointment must start in the future.';
  end if;
  if not exists (
    select 1 from public.services as service
    where service.id = p_service_id and service.shop_id = current_row.shop_id and service.active
  ) then
    raise exception using errcode = '22023', message = 'Service must be active at the same shop.';
  end if;
  if not private.is_active_barber_for_shop(current_row.shop_id, p_barber_id) then
    raise exception using errcode = '22023', message = 'Barber must be active at the same shop.';
  end if;

  update public.appointments
  set barber_id = p_barber_id,
      service_id = p_service_id,
      starts_at = p_starts_at,
      notes = nullif(btrim(p_notes), ''),
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
  where id = current_row.id
  returning * into updated_row;

  insert into public.appointment_events (
    appointment_id, shop_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata
  ) values (
    updated_row.id,
    updated_row.shop_id,
    p_customer_id,
    'customer',
    'rescheduled',
    current_row.status,
    updated_row.status,
    jsonb_build_object(
      'previous_barber_id', current_row.barber_id,
      'new_barber_id', updated_row.barber_id,
      'previous_service_id', current_row.service_id,
      'new_service_id', updated_row.service_id,
      'previous_starts_at', current_row.starts_at,
      'new_starts_at', updated_row.starts_at
    )
  );

  return updated_row;
end;
$$;

create or replace function public.api_expire_due_appointments()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  candidate public.appointments%rowtype;
  changed_count integer := 0;
begin
  for candidate in
    select * from public.appointments
    where status = 'requested' and expires_at <= now()
    order by expires_at
    for update skip locked
  loop
    perform public.api_transition_appointment(candidate.id, candidate.version, 'expire', null, null, null);
    changed_count := changed_count + 1;
  end loop;
  return changed_count;
end;
$$;

create or replace function public.api_finalize_due_appointments()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  candidate public.appointments%rowtype;
  changed_count integer := 0;
begin
  for candidate in
    select * from public.appointments
    where status = 'awaiting_confirmation' and completion_due_at <= now()
    order by completion_due_at
    for update skip locked
  loop
    perform public.api_transition_appointment(candidate.id, candidate.version, 'auto_complete', null, null, null);
    changed_count := changed_count + 1;
  end loop;
  return changed_count;
end;
$$;

alter table public.appointment_events enable row level security;
revoke all on table public.appointment_events from anon, authenticated;
grant select on table public.appointment_events to authenticated;

create policy appointment_events_select_participant
  on public.appointment_events for select to authenticated
  using (
    exists (
      select 1
      from public.appointments as appointment
      where appointment.id = appointment_events.appointment_id
        and (
          appointment.customer_id = (select auth.uid())
          or appointment.barber_id = (select auth.uid())
          or private.owns_shop(appointment.shop_id)
        )
    )
  );

create policy owner_verification_lock
  on public.appointment_events as restrictive for all to authenticated
  using ((select private.current_user_has_operational_access()))
  with check ((select private.current_user_has_operational_access()));

grant select, insert, update, delete on table public.appointment_events to service_role;

revoke all on function public.api_transition_appointment(uuid, integer, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.api_issue_appointment_check_in_code(uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.api_reschedule_appointment(uuid, integer, uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.api_expire_due_appointments() from public, anon, authenticated;
revoke all on function public.api_finalize_due_appointments() from public, anon, authenticated;

grant execute on function public.api_transition_appointment(uuid, integer, text, uuid, text, text) to service_role;
grant execute on function public.api_issue_appointment_check_in_code(uuid, integer, uuid, text) to service_role;
grant execute on function public.api_reschedule_appointment(uuid, integer, uuid, uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.api_expire_due_appointments() to service_role;
grant execute on function public.api_finalize_due_appointments() to service_role;
