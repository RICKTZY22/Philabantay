-- P2-07 (slice 4): let a shop owner actually be booked.
--
-- Q20, answered by the product owner on 2026-07-30: use a shadow `barbers` row
-- as the foreign-key anchor, mirrored one way from `owner_provider_profiles`, so
-- there stays exactly one writable source for the owner's provider state. The
-- alternative — repointing `appointments` and thirteen other tables at a new
-- provider identity — is the tidier end state and remains available later as a
-- pure refactor with no behavioural change.
--
-- The gap this closes was reproduced live before the fix. A shop whose only
-- provider is its owner publishes, appears in the public catalogue, and then
-- refuses every customer: availability returned `200` with zero slots and a
-- booking returned `409 no_provider_available`. Booking the owner by name
-- returned `400 "The barber is not verified, active at this shop, or accepting
-- bookings."` The engine never consulted `owner_provider_profiles` at all, so
-- enabling the capability in Shop Setup changed nothing. That is a common shape
-- for a Philippine barbershop, not an edge case.
--
-- What this migration does NOT do: it does not widen
-- `private.is_active_barber_for_shop`. That predicate has around twenty-five
-- call sites, most of them RLS policies on attendance, shift tables, staff
-- notes, and messages, and making it true for an owner would hand them
-- employee-shaped access on surfaces where "staff member" is the intended
-- meaning. A separate predicate is introduced and used only where the question
-- is genuinely "may this person perform the service".

-- 1. May this person perform services at this shop? --------------------------
-- True for an employed, verified barber, or for a verified owner who has
-- switched their own provider capability on. Deliberately distinct from
-- is_active_barber_for_shop, which answers "is this person staff".
--
-- Note what this does NOT check: `accepting_bookings`. That toggle governs
-- whether *new* bookings may be taken, and the claim gate tests it separately.
-- Folding it in here would mean a provider who pauses new bookings could no
-- longer start or finish the visits already on their books, which is backwards.
-- The barber branch has always behaved this way; the owner branch matches it.
create or replace function private.is_bookable_provider_for_shop(
  p_shop_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_active_barber_for_shop(p_shop_id, p_user_id)
    or exists (
      select 1
      from public.owner_provider_profiles as capability
      join public.shops as shop
        on shop.id = capability.shop_id
      join public.users as profile
        on profile.id = capability.owner_id
      where capability.shop_id = p_shop_id
        and capability.owner_id = coalesce(p_user_id, (select auth.uid()))
        and capability.active
        -- Ownership is re-derived from shops rather than trusted from the
        -- capability row, so a stale profile cannot outlive a shop transfer.
        and shop.owner_id = capability.owner_id
        and profile.role = 'shop_owner'
        and profile.requested_role = 'shop_owner'
        and profile.verification_status = 'verified'
        and profile.onboarding_completed
    );
$$;

revoke all on function private.is_bookable_provider_for_shop(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.is_bookable_provider_for_shop(uuid, uuid)
  to authenticated, service_role;

-- 2. The shadow barbers row ---------------------------------------------------
-- appointments.barber_id references barbers(id), as do twelve other tables, so
-- an owner needs a row there before they can hold a booking at all. The row is a
-- foreign-key anchor and nothing else: every field it shares with
-- owner_provider_profiles is mirrored one way, from the capability profile into
-- the shadow, so the capability profile stays the only place the value is
-- authored. Reading barbers for an owner is always safe; writing it is not, and
-- nothing does.
--
-- Owners do not leak into the barber catalogue: that query filters
-- users.role = 'barber', and an owner's role is 'shop_owner'.
-- The assignment lock on `appointments` re-verifies employment on every write
-- that touches the assigned provider, holding the same per-barber advisory lock
-- the booking commands use so an employment cannot end underneath a live visit.
-- It only knew about employed barbers, so an owner-provider booking failed with
--
--   23514  The assigned barber is not actively verified at this shop.
--
-- The owner branch keeps the identical shape: same advisory lock, same FOR SHARE
-- on the rows the decision rests on, so ending a capability races against an
-- assignment exactly the way ending an employment already does. Ownership is
-- re-derived from `shops` rather than trusted from the capability row.
create or replace function private.lock_appointment_barber_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean := false;
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
    v_ok := found;

    if not v_ok then
      perform 1
      from public.owner_provider_profiles as capability
      join public.shops as shop
        on shop.id = capability.shop_id
      join public.users as profile
        on profile.id = capability.owner_id
      where capability.shop_id = new.shop_id
        and capability.owner_id = new.barber_id
        and capability.active
        and shop.owner_id = capability.owner_id
        and profile.role = 'shop_owner'
        and profile.requested_role = 'shop_owner'
        and profile.verification_status = 'verified'
        and profile.onboarding_completed
      for share of capability, shop, profile;
      v_ok := found;
    end if;

    if not v_ok then
      raise exception using
        errcode = '23514',
        message = 'The assigned provider is not actively verified at this shop.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.lock_appointment_barber_assignment()
  from public, anon, authenticated, service_role;

-- The pre-existing guard on `barbers` refuses to switch `accepting_bookings` or
-- `shift_status` on without a current verified employment, which is exactly
-- right for a barber and wrong for an owner-provider: an owner has no employment
-- and never will. Without this the mirror below fails with
--
--   42501  A current verified employment is required.
--
-- and the owner's capability cannot be enabled at all. The invariant is not
-- weakened, only completed: an owner-provider's authority to be bookable is an
-- active capability row for a shop they actually own, which the capability
-- command has already established and which is re-derived here rather than
-- trusted.
create or replace function private.lock_barber_capability_enablement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.shift_status = 'on' and new.shift_status is distinct from old.shift_status)
      or (new.accepting_bookings and new.accepting_bookings is distinct from old.accepting_bookings) then
    if not exists (
      select 1
      from public.owner_provider_profiles as capability
      join public.shops as shop
        on shop.id = capability.shop_id
      where capability.owner_id = new.id
        and capability.active
        and shop.owner_id = capability.owner_id
    ) then
      perform private.lock_current_barber_employment(new.id, null);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.lock_barber_capability_enablement()
  from public, anon, authenticated, service_role;

create or replace function private.sync_owner_provider_shadow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active then
    insert into public.barbers (id, accepting_bookings, rating, rating_count)
    values (new.owner_id, new.accepting_bookings, new.rating, new.rating_count)
    on conflict (id) do update
      set accepting_bookings = excluded.accepting_bookings,
          rating = excluded.rating,
          rating_count = excluded.rating_count,
          updated_at = now();
  else
    -- Capability withdrawn. The row stays, because appointments and ratings may
    -- reference it, but it stops accepting anything.
    update public.barbers
      set accepting_bookings = false,
          updated_at = now()
      where id = new.owner_id;
  end if;
  return null;
end;
$$;

revoke all on function private.sync_owner_provider_shadow()
  from public, anon, authenticated, service_role;

create trigger owner_provider_profiles_sync_shadow
  after insert or update of active, accepting_bookings, rating, rating_count
  on public.owner_provider_profiles
  for each row
  execute function private.sync_owner_provider_shadow();

-- Backfill for any capability enabled before the trigger existed.
insert into public.barbers (id, accepting_bookings, rating, rating_count)
select capability.owner_id, capability.accepting_bookings, capability.rating, capability.rating_count
from public.owner_provider_profiles as capability
where capability.active
on conflict (id) do update
  set accepting_bookings = excluded.accepting_bookings,
      rating = excluded.rating,
      rating_count = excluded.rating_count,
      updated_at = now();

-- 3. Lifecycle functions use the provider predicate ---------------------------
-- Bodies below are the live definitions read straight out of the database with
-- exactly one call swapped from is_active_barber_for_shop to
-- is_bookable_provider_for_shop. Nothing else in them changes. They are
-- reproduced rather than edited in place because a forward migration cannot
-- patch a single line of an existing function.
--
-- prepare_appointment gates the INSERT, api_transition_appointment_unlocked
-- decides who may start and finish a visit, and
-- api_issue_appointment_check_in_code decides who may hand out the code. All
-- three mean "the person performing the service", so all three now accept an
-- owner-provider.


CREATE OR REPLACE FUNCTION private.prepare_appointment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  service_name text;
  service_duration integer;
  service_price integer;
  service_is_active boolean;
  service_buffer integer;
  shop_buffer integer;
  actor_id uuid := (select auth.uid());
begin
  select s.name, s.duration_min, s.price_cents, s.active, s.buffer_min
    into service_name, service_duration, service_price, service_is_active, service_buffer
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

  if not private.is_bookable_provider_for_shop(new.shop_id, new.barber_id) then
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
    select shop.default_buffer_min
      into shop_buffer
    from public.shops as shop
    where shop.id = new.shop_id;

    new.booked_service_name := service_name;
    new.booked_duration_min := service_duration;
    new.booked_price_cents := service_price;
    new.booked_buffer_min := coalesce(service_buffer, shop_buffer, 0);
  end if;

  -- The buffer deliberately does NOT extend ends_at. An appointment ends when
  -- the service ends; the buffer is cleanup time that the engine adds on top
  -- when it tests for conflicts.
  new.ends_at := new.starts_at + make_interval(mins => new.booked_duration_min);
  if tg_op = 'INSERT' and new.status = 'requested' then
    new.expires_at := coalesce(new.expires_at, now() + interval '15 minutes');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.api_transition_appointment_unlocked(p_appointment_id uuid, p_expected_version integer, p_action text, p_actor_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_check_in_code text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and private.is_bookable_provider_for_shop(current_row.shop_id, p_actor_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.api_issue_appointment_check_in_code(p_appointment_id uuid, p_expected_version integer, p_actor_id uuid, p_code text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and private.is_bookable_provider_for_shop(current_row.shop_id, p_actor_id);
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
$function$;
