-- P1-03: make an active, verified employment the live staff capability.
-- Historical rows stay in place, but a resigned or suspended barber must not
-- retain operational access merely because their UUID remains on old records.

alter table public.barber_employment
  add column ended_by uuid references public.users(id) on delete restrict,
  add column ended_reason text,
  add constraint barber_employment_ended_reason_length
    check (ended_reason is null or char_length(btrim(ended_reason)) between 3 and 1000);

comment on column public.barber_employment.ended_by is
  'Trusted actor that ended this employment through api_end_employment.';
comment on column public.barber_employment.ended_reason is
  'Auditable reason supplied when this employment was ended.';

-- An employment row is insufficient by itself. The barber extension and the
-- current trusted profile must still describe a verified, onboarded barber.
-- Replacing this helper also hardens every existing schedule/conversation/
-- booking trigger or policy that already calls it.
create or replace function private.is_active_barber_for_shop(
  p_shop_id uuid,
  p_barber_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barber_employment as employment
    join public.barbers as barber
      on barber.id = employment.barber_id
    join public.users as profile
      on profile.id = barber.id
    where employment.shop_id = p_shop_id
      and employment.barber_id = coalesce(p_barber_id, (select auth.uid()))
      and employment.status = 'active'
      and employment.ended_at is null
      and employment.hired_at <= (now() at time zone 'Asia/Manila')::date
      and profile.role = 'barber'
      and profile.requested_role = 'barber'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
  );
$$;

create or replace function private.has_active_barber_employment(
  p_barber_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barber_employment as employment
    where employment.barber_id = coalesce(p_barber_id, (select auth.uid()))
      and private.is_active_barber_for_shop(
        employment.shop_id,
        coalesce(p_barber_id, (select auth.uid()))
      )
  );
$$;

revoke all on function private.has_active_barber_employment(uuid)
  from public, anon, authenticated;
grant execute on function private.has_active_barber_employment(uuid)
  to authenticated;

create or replace function private.require_active_employment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.barber_employment as employment
    where employment.id = new.employment_id
      and employment.barber_id = new.barber_id
      and employment.shop_id = new.shop_id
      and private.is_active_barber_for_shop(new.shop_id, new.barber_id)
  ) then
    raise exception using
      errcode = '23514',
      message = 'A current verified employment is required for this staff record.';
  end if;

  return new;
end;
$$;

-- A stored conversation.barber_id is historical routing data, not a permanent
-- membership grant. Customers keep their own thread, owners keep shop scope,
-- and the stored barber participates only while actively employed there.
create or replace function private.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations as conversation
    where conversation.id = p_conversation_id
      and (
        (
          conversation.kind = 'customer_shop'
          and conversation.customer_id = coalesce(p_user_id, (select auth.uid()))
        )
        or private.owns_shop(conversation.shop_id, p_user_id)
        or (
          conversation.barber_id = coalesce(p_user_id, (select auth.uid()))
          and private.is_active_barber_for_shop(
            conversation.shop_id,
            coalesce(p_user_id, (select auth.uid()))
          )
        )
      )
  );
$$;

-- Every write that assigns or re-activates an appointment shares the same
-- barber advisory lock used by appointment creation and employment ending.
-- The row locks after the advisory lock force a fresh committed employment and
-- profile check even if this statement waited for a concurrent termination.
create or replace function private.lock_appointment_barber_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in (
    'requested',
    'confirmed',
    'checked_in',
    'in_progress',
    'awaiting_confirmation'
  ) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'appointment:barber:' || new.barber_id::text,
        0
      )
    );

    perform 1
    from public.barber_employment as employment
    join public.barbers as barber
      on barber.id = employment.barber_id
    join public.users as profile
      on profile.id = barber.id
    where employment.shop_id = new.shop_id
      and employment.barber_id = new.barber_id
      and employment.status = 'active'
      and employment.ended_at is null
      and employment.hired_at <= (new.starts_at at time zone 'Asia/Manila')::date
      and profile.role = 'barber'
      and profile.requested_role = 'barber'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
    for share of employment, barber, profile;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'The assigned barber is not actively verified at this shop.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.lock_appointment_barber_assignment()
  from public, anon, authenticated, service_role;

drop trigger if exists appointments_00_lock_barber_assignment
  on public.appointments;
create trigger appointments_00_lock_barber_assignment
  before insert or update of barber_id, shop_id, service_id, starts_at, status
  on public.appointments
  for each row execute function private.lock_appointment_barber_assignment();

-- Ending employment is command-only and serialized with every appointment
-- assignment. It refuses to commit while any unresolved active visit remains;
-- the owner must first reassign, reschedule, decline, expire, or cancel it.
create or replace function public.api_end_employment(
  p_employment_id uuid,
  p_owner_id uuid,
  p_reason text
)
returns public.barber_employment
language plpgsql
security definer
set search_path = ''
as $$
declare
  employment_barber_id uuid;
  current_employment public.barber_employment%rowtype;
  ended_employment public.barber_employment%rowtype;
  normalized_reason text;
  local_end_date date := (now() at time zone 'Asia/Manila')::date;
begin
  normalized_reason := nullif(btrim(p_reason), '');
  if normalized_reason is null
      or char_length(normalized_reason) < 3
      or char_length(normalized_reason) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Employment end reason must contain 3 to 1000 characters.';
  end if;

  select employment.barber_id
  into employment_barber_id
  from public.barber_employment as employment
  where employment.id = p_employment_id;

  if employment_barber_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Employment record not found.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'appointment:barber:' || employment_barber_id::text,
      0
    )
  );

  select employment.*
  into current_employment
  from public.barber_employment as employment
  where employment.id = p_employment_id
  for update;

  if current_employment.status <> 'active'
      or current_employment.ended_at is not null then
    raise exception using
      errcode = 'P4092',
      message = 'Only an active employment can be ended.';
  end if;

  if not exists (
    select 1
    from public.shops as shop
    where shop.id = current_employment.shop_id
      and shop.owner_id = p_owner_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only the owning shop account may end this employment.';
  end if;

  if exists (
    select 1
    from public.appointments as appointment
    where appointment.shop_id = current_employment.shop_id
      and appointment.barber_id = current_employment.barber_id
      and appointment.status in (
        'requested',
        'confirmed',
        'checked_in',
        'in_progress',
        'awaiting_confirmation'
      )
  ) then
    raise exception using
      errcode = 'P4091',
      message = 'Resolve every active appointment assigned to this barber before ending employment.';
  end if;

  if current_employment.hired_at > local_end_date then
    raise exception using
      errcode = '22023',
      message = 'Employment cannot end before its hire date.';
  end if;

  update public.barber_employment
  set status = 'resigned',
      ended_at = local_end_date,
      ended_by = p_owner_id,
      ended_reason = normalized_reason
  where id = current_employment.id
  returning * into ended_employment;

  update public.barbers
  set shift_status = 'off',
      accepting_bookings = false
  where id = current_employment.barber_id;

  return ended_employment;
end;
$$;

revoke all on function public.api_end_employment(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.api_end_employment(uuid, uuid, text)
  to service_role;

-- Employment mutations are server-command-only. In particular, an owner JWT
-- must not bypass the unresolved-booking precondition with a direct UPDATE or
-- erase historical stints through DELETE.
revoke insert, update, delete on table public.barber_employment
  from authenticated;
revoke update (status, hired_at, ended_at) on table public.barber_employment
  from authenticated;
drop policy if exists barber_employment_insert_owner
  on public.barber_employment;
drop policy if exists barber_employment_update_owner
  on public.barber_employment;
drop policy if exists barber_employment_delete_owner
  on public.barber_employment;

-- Rebuild the policies that previously treated a historical barber_id as
-- permanent access. Existing schedule and message policies inherit the helper
-- replacements above and do not need duplicate definitions here.
drop policy if exists barbers_update_self on public.barbers;
create policy barbers_update_active_self
  on public.barbers for update to authenticated
  using (
    id = (select auth.uid())
    and private.has_active_barber_employment(id)
  )
  with check (
    id = (select auth.uid())
    and private.has_active_barber_employment(id)
  );

drop policy if exists appointments_select_participant
  on public.appointments;
create policy appointments_select_current_participant
  on public.appointments for select to authenticated
  using (
    customer_id = (select auth.uid())
    or private.owns_shop(shop_id)
    or (
      barber_id = (select auth.uid())
      and private.is_active_barber_for_shop(shop_id)
    )
  );

drop policy if exists appointment_events_select_participant
  on public.appointment_events;
create policy appointment_events_select_current_participant
  on public.appointment_events for select to authenticated
  using (
    exists (
      select 1
      from public.appointments as appointment
      where appointment.id = appointment_events.appointment_id
        and (
          appointment.customer_id = (select auth.uid())
          or private.owns_shop(appointment.shop_id)
          or (
            appointment.barber_id = (select auth.uid())
            and private.is_active_barber_for_shop(appointment.shop_id)
          )
        )
    )
  );

drop policy if exists attendance_select_staff
  on public.attendance_records;
create policy attendance_select_current_staff
  on public.attendance_records for select to authenticated
  using (
    private.owns_shop(shop_id)
    or (
      barber_id = (select auth.uid())
      and private.is_active_barber_for_shop(shop_id)
    )
  );

drop policy if exists shift_change_requests_select_staff
  on public.shift_change_requests;
create policy shift_change_requests_select_current_staff
  on public.shift_change_requests for select to authenticated
  using (
    private.owns_shop(shop_id)
    or (
      barber_id = (select auth.uid())
      and private.is_active_barber_for_shop(shop_id)
    )
  );

drop policy if exists staff_notes_select_subject_or_owner
  on public.staff_notes;
create policy staff_notes_select_current_subject_or_owner
  on public.staff_notes for select to authenticated
  using (
    private.owns_shop(shop_id)
    or (
      barber_id = (select auth.uid())
      and private.is_active_barber_for_shop(shop_id)
    )
  );
