-- Phase 3 versioned consent, disruption, no-show review, and transactional
-- operational notifications.

create or replace function private.require_p3_shop_staff(
  p_shop_id uuid,
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select profile.role::text into v_role
  from public.users as profile
  where profile.id = p_actor_id;

  if v_role = 'shop_owner' and exists (
    select 1 from public.shops where id = p_shop_id and owner_id = p_actor_id
  ) then
    return v_role;
  end if;
  if v_role = 'barber' and private.is_active_barber_for_shop(p_shop_id, p_actor_id) then
    return v_role;
  end if;
  raise exception using errcode = '42501', message = 'Current shop staff access is required.';
end;
$$;
revoke all on function private.require_p3_shop_staff(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function private.enqueue_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_outbox_id uuid;
  v_title text := initcap(replace(new.event_type, '_', ' '));
begin
  for v_recipient in
    select distinct recipient_id
    from (
      select appointment.customer_id as recipient_id
      from public.appointments as appointment where appointment.id = new.appointment_id
      union all
      select appointment.barber_id
      from public.appointments as appointment where appointment.id = new.appointment_id
      union all
      select shop.owner_id
      from public.shops as shop where shop.id = new.shop_id
    ) recipients
    where recipient_id is not null and recipient_id is distinct from new.actor_id
  loop
    insert into public.notification_outbox (
      recipient_id, shop_id, appointment_id, event_key, title, body, payload,
      required_operational, status
    ) values (
      v_recipient, new.shop_id, new.appointment_id,
      'appointment:' || new.id::text || ':' || v_recipient::text,
      v_title,
      coalesce(new.reason, 'Your appointment has an operational update.'),
      jsonb_build_object('event_id', new.id, 'event_type', new.event_type,
        'appointment_id', new.appointment_id),
      true, 'pending'
    )
    on conflict (recipient_id, event_key) do nothing
    returning id into v_outbox_id;

    if v_outbox_id is not null then
      insert into public.in_app_notifications (outbox_id, recipient_id, title, body, payload)
      values (
        v_outbox_id, v_recipient, v_title,
        coalesce(new.reason, 'Your appointment has an operational update.'),
        jsonb_build_object('event_id', new.id, 'event_type', new.event_type,
          'appointment_id', new.appointment_id)
      );
    end if;
    v_outbox_id := null;
  end loop;
  return new;
end;
$$;
revoke all on function private.enqueue_appointment_event() from public, anon, authenticated;
drop trigger if exists appointment_events_enqueue_notifications on public.appointment_events;
create trigger appointment_events_enqueue_notifications
  after insert on public.appointment_events
  for each row execute function private.enqueue_appointment_event();

create or replace function public.api_create_appointment_change_proposal(
  p_appointment_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_service_id uuid,
  p_provider_id uuid,
  p_starts_at timestamptz,
  p_reason text,
  p_expires_at timestamptz
)
returns public.appointment_change_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_proposal public.appointment_change_proposals%rowtype;
  v_role text;
  v_service public.services%rowtype;
  v_reason text := private.require_appointment_reason(p_reason);
begin
  perform private.lock_appointment_command(p_appointment_id);
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Appointment not found.'; end if;
  if v_appointment.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'Appointment changed; refresh before trying again.';
  end if;
  if v_appointment.status not in ('requested', 'confirmed', 'checked_in', 'in_progress') then
    raise exception using errcode = 'P4021', message = 'This appointment cannot receive a change proposal.';
  end if;

  v_role := private.require_p3_shop_staff(v_appointment.shop_id, p_actor_id);
  if v_role = 'barber' and v_appointment.barber_id <> p_actor_id then
    raise exception using errcode = '42501', message = 'Only the assigned provider may propose this change.';
  end if;
  if exists (select 1 from public.appointment_change_proposals where appointment_id = p_appointment_id and status = 'pending') then
    raise exception using errcode = 'P4021', message = 'Respond to the existing proposal before creating another.';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception using errcode = '22023', message = 'Proposal expiry must be within the next seven days.';
  end if;

  select * into v_service from public.services
  where id = coalesce(p_service_id, v_appointment.service_id)
    and shop_id = v_appointment.shop_id and active;
  if not found then raise exception using errcode = 'P4021', message = 'The proposed service is not active at this shop.'; end if;
  perform private.require_provider_qualified(
    v_appointment.shop_id,
    v_service.id,
    coalesce(p_provider_id, v_appointment.barber_id)
  );

  if v_appointment.status in ('checked_in', 'in_progress') and (
    coalesce(p_provider_id, v_appointment.barber_id) <> v_appointment.barber_id
    or coalesce(p_starts_at, v_appointment.starts_at) <> v_appointment.starts_at
  ) then
    raise exception using errcode = 'P4021', message = 'An active visit may change service facts, but not provider or start time.';
  end if;

  insert into public.appointment_change_proposals (
    appointment_id, shop_id, proposed_by, proposed_by_role, reason,
    original_service_id, original_provider_id, original_starts_at,
    original_service_name, original_duration_min, original_price_cents,
    proposed_service_id, proposed_provider_id, proposed_starts_at,
    proposed_service_name, proposed_duration_min, proposed_price_cents,
    proposed_buffer_min, expires_at
  ) values (
    v_appointment.id, v_appointment.shop_id, p_actor_id, v_role, v_reason,
    v_appointment.service_id, v_appointment.barber_id, v_appointment.starts_at,
    v_appointment.booked_service_name, v_appointment.booked_duration_min,
    v_appointment.booked_price_cents,
    v_service.id, coalesce(p_provider_id, v_appointment.barber_id),
    coalesce(p_starts_at, v_appointment.starts_at), v_service.name,
    v_service.duration_min, v_service.price_cents,
    coalesce(v_service.buffer_min, 0), p_expires_at
  ) returning * into v_proposal;

  update public.appointments set version = version + 1 where id = v_appointment.id;
  insert into public.appointment_events (
    appointment_id, shop_id, actor_id, actor_role, event_type,
    from_status, to_status, reason, metadata
  ) values (
    v_appointment.id, v_appointment.shop_id, p_actor_id, v_role,
    'change_proposed', v_appointment.status, v_appointment.status, v_reason,
    jsonb_build_object('proposal_id', v_proposal.id,
      'proposed_service_id', v_proposal.proposed_service_id,
      'proposed_provider_id', v_proposal.proposed_provider_id,
      'proposed_starts_at', v_proposal.proposed_starts_at,
      'proposed_duration_min', v_proposal.proposed_duration_min,
      'proposed_price_cents', v_proposal.proposed_price_cents)
  );
  return v_proposal;
end;
$$;

create or replace function public.api_respond_appointment_change_proposal(
  p_proposal_id uuid,
  p_expected_proposal_version integer,
  p_expected_appointment_version integer,
  p_customer_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.appointment_change_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.appointment_change_proposals%rowtype;
  v_appointment public.appointments%rowtype;
  v_reason text;
  v_error text;
begin
  select * into v_proposal from public.appointment_change_proposals where id = p_proposal_id;
  if not found then raise exception using errcode = 'P0002', message = 'Change proposal not found.'; end if;
  perform private.lock_appointment_command(v_proposal.appointment_id);
  perform private.lock_appointment_capacity(
    v_proposal.shop_id, p_customer_id, v_proposal.original_provider_id,
    v_proposal.proposed_provider_id
  );
  select * into v_proposal from public.appointment_change_proposals where id = p_proposal_id for update;
  select * into v_appointment from public.appointments where id = v_proposal.appointment_id for update;

  if v_appointment.customer_id <> p_customer_id then
    raise exception using errcode = '42501', message = 'Only the appointment customer may respond.';
  end if;
  if v_proposal.version <> p_expected_proposal_version or v_appointment.version <> p_expected_appointment_version then
    raise exception using errcode = 'P4090', message = 'The proposal or appointment changed; refresh before responding.';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception using errcode = 'P4021', message = 'This proposal already has a response.';
  end if;
  if v_proposal.expires_at <= now() then
    update public.appointment_change_proposals
      set status = 'expired', responded_at = now(), updated_at = now(), version = version + 1
      where id = v_proposal.id returning * into v_proposal;
    raise exception using errcode = 'P4021', message = 'This proposal has expired.';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'Decision must be approve or reject.';
  end if;
  v_reason := case when p_reason is null then null else private.require_appointment_reason(p_reason) end;

  if p_decision = 'reject' then
    update public.appointment_change_proposals
      set status = 'rejected', response_reason = v_reason, responded_at = now(),
          updated_at = now(), version = version + 1
      where id = v_proposal.id returning * into v_proposal;
    update public.appointments set version = version + 1 where id = v_appointment.id;
    insert into public.appointment_events (
      appointment_id, shop_id, actor_id, actor_role, event_type,
      from_status, to_status, reason, metadata
    ) values (
      v_appointment.id, v_appointment.shop_id, p_customer_id, 'customer',
      'change_rejected', v_appointment.status, v_appointment.status, v_reason,
      jsonb_build_object('proposal_id', v_proposal.id)
    );
    return v_proposal;
  end if;

  begin
    if v_appointment.status in ('requested', 'confirmed') then
      perform * from private.require_bookable_appointment_slot(
        v_appointment.customer_id, v_proposal.proposed_provider_id,
        v_proposal.proposed_service_id, v_proposal.proposed_starts_at,
        v_appointment.id, v_appointment.shop_id
      );
    elsif v_appointment.status in ('checked_in', 'in_progress') then
      perform private.require_provider_gap(
        v_proposal.proposed_provider_id, v_proposal.proposed_starts_at,
        v_proposal.proposed_starts_at + make_interval(mins => v_proposal.proposed_duration_min + v_proposal.proposed_buffer_min),
        v_appointment.id
      );
    else
      raise exception using errcode = 'P4021', message = 'The visit can no longer be changed.';
    end if;
  exception
    when exclusion_violation
      or check_violation
      or sqlstate '22023'
      or sqlstate 'P4026'
      or sqlstate 'P4027'
      or sqlstate 'P4028'
      or sqlstate 'P4029'
      or sqlstate 'P4030'
      or sqlstate 'P4033'
  then
    v_error := sqlerrm;
    update public.appointment_change_proposals
      set status = 'conflict', response_reason = left(v_error, 1000), responded_at = now(),
          updated_at = now(), version = version + 1
      where id = v_proposal.id returning * into v_proposal;
    update public.appointments set version = version + 1 where id = v_appointment.id;
    insert into public.appointment_attention_items (
      appointment_id, shop_id, kind, reason
    ) values (v_appointment.id, v_appointment.shop_id, 'change_conflict', left(v_error, 1000))
    on conflict do nothing;
    insert into public.appointment_events (
      appointment_id, shop_id, actor_id, actor_role, event_type,
      from_status, to_status, reason, metadata
    ) values (
      v_appointment.id, v_appointment.shop_id, p_customer_id, 'customer',
      'change_conflict', v_appointment.status, v_appointment.status,
      left(v_error, 1000), jsonb_build_object('proposal_id', v_proposal.id)
    );
    return v_proposal;
  end;

  update public.appointments
  set service_id = v_proposal.proposed_service_id,
      barber_id = v_proposal.proposed_provider_id,
      starts_at = v_proposal.proposed_starts_at,
      ends_at = v_proposal.proposed_starts_at + make_interval(mins => v_proposal.proposed_duration_min),
      booked_service_name = v_proposal.proposed_service_name,
      booked_duration_min = v_proposal.proposed_duration_min,
      booked_price_cents = v_proposal.proposed_price_cents,
      booked_buffer_min = v_proposal.proposed_buffer_min,
      assignment_source = case when barber_id is distinct from v_proposal.proposed_provider_id then 'owner' else assignment_source end,
      assignment_reason = case when barber_id is distinct from v_proposal.proposed_provider_id then v_proposal.reason else assignment_reason end,
      version = version + 1
  where id = v_appointment.id;
  update public.appointment_change_proposals
    set status = 'approved', response_reason = v_reason, responded_at = now(),
        updated_at = now(), version = version + 1
    where id = v_proposal.id returning * into v_proposal;
  insert into public.appointment_events (
    appointment_id, shop_id, actor_id, actor_role, event_type,
    from_status, to_status, reason, metadata
  ) values (
    v_appointment.id, v_appointment.shop_id, p_customer_id, 'customer',
    'change_approved', v_appointment.status, v_appointment.status, v_reason,
    jsonb_build_object('proposal_id', v_proposal.id,
      'original_service_id', v_proposal.original_service_id,
      'proposed_service_id', v_proposal.proposed_service_id,
      'original_provider_id', v_proposal.original_provider_id,
      'proposed_provider_id', v_proposal.proposed_provider_id,
      'original_starts_at', v_proposal.original_starts_at,
      'proposed_starts_at', v_proposal.proposed_starts_at)
  );
  return v_proposal;
end;
$$;

create or replace function public.api_report_appointment_delay(
  p_appointment_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_category text,
  p_estimate_minutes integer,
  p_reason text
)
returns public.appointment_delays
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_delay public.appointment_delays%rowtype;
  v_role text;
  v_reason text := private.require_appointment_reason(p_reason);
begin
  perform private.lock_appointment_command(p_appointment_id);
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Appointment not found.'; end if;
  if v_appointment.version <> p_expected_version then raise exception using errcode = 'P4090', message = 'Appointment changed; refresh before trying again.'; end if;
  if v_appointment.status not in ('confirmed', 'checked_in', 'in_progress') then raise exception using errcode = 'P4021', message = 'Delay reporting is not available in this state.'; end if;
  v_role := private.require_p3_shop_staff(v_appointment.shop_id, p_actor_id);
  if v_role = 'barber' and v_appointment.barber_id <> p_actor_id then raise exception using errcode = '42501', message = 'Only the assigned provider may report this delay.'; end if;
  if p_category not in ('provider_late', 'shop_delay', 'previous_service', 'other') or p_estimate_minutes not between 5 and 240 then raise exception using errcode = '22023', message = 'Delay category or estimate is invalid.'; end if;
  insert into public.appointment_delays (appointment_id, shop_id, reported_by, category, estimate_minutes, reason)
  values (v_appointment.id, v_appointment.shop_id, p_actor_id, p_category, p_estimate_minutes, v_reason)
  returning * into v_delay;
  update public.appointments set version = version + 1 where id = v_appointment.id;
  insert into public.appointment_events (appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata)
  values (v_appointment.id, v_appointment.shop_id, p_actor_id, v_role, 'delay_reported', v_appointment.status, v_appointment.status, v_reason,
    jsonb_build_object('delay_id', v_delay.id, 'category', p_category, 'estimate_minutes', p_estimate_minutes));
  return v_delay;
end;
$$;

create or replace function private.capture_shop_closure_disruption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_appointment public.appointments%rowtype;
  v_count integer := 0;
  v_alternatives jsonb;
begin
  if not new.closed then return new; end if;
  insert into public.disruption_batches (shop_id, source_type, source_id, local_date)
  values (new.shop_id, 'closure', new.id, new.local_date)
  returning id into v_batch_id;
  for v_appointment in
    select appointment.* from public.appointments as appointment
    join public.shops as shop on shop.id = appointment.shop_id
    where appointment.shop_id = new.shop_id
      and (appointment.starts_at at time zone shop.timezone)::date = new.local_date
      and appointment.status in ('requested', 'confirmed')
  loop
    v_count := v_count + 1;
    begin
      select coalesce(jsonb_agg(to_jsonb(candidate)), '[]'::jsonb) into v_alternatives
      from (
        select slot.provider_user_id, slot.starts_at, slot.ends_at
        from (
          select * from public.api_availability_slots(new.shop_id, v_appointment.service_id, new.local_date + 1, v_appointment.customer_id,
            case when v_appointment.barber_preference = 'exact' then v_appointment.requested_barber_id else null end)
          union all
          select * from public.api_availability_slots(new.shop_id, v_appointment.service_id, new.local_date + 2, v_appointment.customer_id,
            case when v_appointment.barber_preference = 'exact' then v_appointment.requested_barber_id else null end)
        ) slot order by slot.starts_at limit 5
      ) candidate;
    exception when others then
      v_alternatives := '[]'::jsonb;
    end;
    insert into public.appointment_attention_items (appointment_id, shop_id, disruption_batch_id, kind, reason, suggested_alternatives)
    values (v_appointment.id, new.shop_id, v_batch_id, 'disruption', 'Shop closure requires a customer-approved alternative or cancellation.', v_alternatives);
    insert into public.appointment_events (appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata)
    values (v_appointment.id, new.shop_id, null, 'system', 'disruption_reported', v_appointment.status, v_appointment.status,
      'Shop closure affects this appointment.', jsonb_build_object('batch_id', v_batch_id, 'closure_id', new.id));
  end loop;
  update public.disruption_batches set affected_count = v_count where id = v_batch_id;
  return new;
end;
$$;
revoke all on function private.capture_shop_closure_disruption() from public, anon, authenticated;
drop trigger if exists shop_closures_capture_disruption on public.shop_closures;
create trigger shop_closures_capture_disruption
  after insert or update of closed, local_date on public.shop_closures
  for each row when (new.closed) execute function private.capture_shop_closure_disruption();

create or replace function private.capture_operational_disruption(
  p_shop_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_local_date date,
  p_service_id uuid,
  p_provider_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_batch_id uuid; v_appointment public.appointments%rowtype; v_count integer := 0; v_timezone text;
begin
  select timezone into v_timezone from public.shops where id = p_shop_id;
  insert into public.disruption_batches (shop_id, source_type, source_id, local_date)
  values (p_shop_id, p_source_type, p_source_id, p_local_date) returning id into v_batch_id;
  for v_appointment in select * from public.appointments appointment
    where appointment.shop_id = p_shop_id and appointment.status in ('requested', 'confirmed')
      and appointment.starts_at > now()
      and (p_local_date is null or (appointment.starts_at at time zone v_timezone)::date = p_local_date)
      and (p_service_id is null or appointment.service_id = p_service_id)
      and (p_provider_id is null or appointment.barber_id = p_provider_id)
  loop
    v_count := v_count + 1;
    insert into public.appointment_attention_items (appointment_id, shop_id, disruption_batch_id, kind, reason)
    values (v_appointment.id, p_shop_id, v_batch_id, 'disruption', p_reason);
    insert into public.appointment_events (appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata)
    values (v_appointment.id, p_shop_id, null, 'system', 'disruption_reported', v_appointment.status, v_appointment.status,
      p_reason, jsonb_build_object('batch_id', v_batch_id, 'source_type', p_source_type, 'source_id', p_source_id));
  end loop;
  update public.disruption_batches set affected_count = v_count where id = v_batch_id;
  return v_batch_id;
end;
$$;
revoke all on function private.capture_operational_disruption(uuid, text, uuid, date, uuid, uuid, text) from public, anon, authenticated, service_role;

create or replace function private.capture_service_disruption()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active then
    perform private.capture_operational_disruption(new.shop_id, 'service_deactivation', new.id, null, new.id, null,
      'Service deactivation requires a customer-approved alternative or cancellation.');
  end if;
  return new;
end; $$;
create or replace function private.capture_employment_disruption()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and old.ended_at is null and (new.status <> 'active' or new.ended_at is not null) then
    perform private.capture_operational_disruption(new.shop_id, 'employment_end', new.id, null, null, new.barber_id,
      'Employment change requires a customer-approved provider alternative or cancellation.');
  end if;
  return new;
end; $$;
create or replace function private.capture_absence_disruption()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_employment public.barber_employment%rowtype;
begin
  if not new.is_available then
    select * into v_employment from public.barber_employment where id = new.employment_id;
    if found then perform private.capture_operational_disruption(v_employment.shop_id, 'provider_absence', new.id, new.date, null, v_employment.barber_id,
      'Provider absence requires a customer-approved alternative or cancellation.'); end if;
  end if;
  return new;
end; $$;
revoke all on function private.capture_service_disruption(), private.capture_employment_disruption(), private.capture_absence_disruption() from public, anon, authenticated;
create trigger services_capture_disruption after update of active on public.services
  for each row execute function private.capture_service_disruption();
create trigger employment_capture_disruption after update of status, ended_at on public.barber_employment
  for each row execute function private.capture_employment_disruption();
create trigger shift_exceptions_capture_disruption after insert or update of is_available on public.shift_exceptions
  for each row execute function private.capture_absence_disruption();

create or replace function private.recalculate_customer_booking_restriction(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_latest timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p3:customer-strikes:' || p_customer_id::text, 0));
  select count(*), max(upheld.created_at) into v_count, v_latest
  from public.customer_strike_events as upheld
  where upheld.customer_id = p_customer_id and upheld.event_type = 'upheld'
    and upheld.created_at >= now() - interval '90 days'
    and not exists (
      select 1 from public.customer_strike_events as reversal
      where reversal.appointment_id = upheld.appointment_id
        and reversal.event_type in ('waived', 'corrected')
        and reversal.created_at > upheld.created_at
    );
  update public.users set manual_approval_until = case
    when v_count >= 3 then greatest(coalesce(manual_approval_until, '-infinity'::timestamptz), v_latest + interval '30 days')
    else null
  end where id = p_customer_id;
end;
$$;
revoke all on function private.recalculate_customer_booking_restriction(uuid) from public, anon, authenticated, service_role;

create or replace function public.api_mark_customer_no_show(
  p_appointment_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_reason text
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.appointments%rowtype;
  v_updated public.appointments%rowtype;
  v_role text;
  v_reason text := private.require_appointment_reason(p_reason);
begin
  perform private.lock_appointment_command(p_appointment_id);
  select * into v_current from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Appointment not found.'; end if;
  if v_current.version <> p_expected_version then raise exception using errcode = 'P4090', message = 'Appointment changed; refresh before trying again.'; end if;
  v_role := private.require_p3_shop_staff(v_current.shop_id, p_actor_id);
  if v_role = 'barber' and v_current.barber_id <> p_actor_id then raise exception using errcode = '42501', message = 'Only the assigned provider may mark this no-show.'; end if;
  if v_current.status <> 'confirmed' then raise exception using errcode = 'P4021', message = 'Only a confirmed appointment can be marked no-show.'; end if;
  if now() < v_current.starts_at + interval '15 minutes' then raise exception using errcode = 'P4021', message = 'The 15-minute no-show grace period has not passed.'; end if;
  update public.appointments set status = 'customer_no_show', status_updated_at = now(),
    no_show_marked_at = now(), no_show_marked_by = p_actor_id, no_show_reason = v_reason,
    no_show_appeal_deadline = now() + interval '7 days', expires_at = null, version = version + 1
  where id = v_current.id returning * into v_updated;
  insert into public.appointment_events (appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata)
  values (v_current.id, v_current.shop_id, p_actor_id, v_role, 'customer_no_show', v_current.status, 'customer_no_show', v_reason,
    jsonb_build_object('appeal_deadline', v_updated.no_show_appeal_deadline));
  return v_updated;
end;
$$;

create or replace function public.api_create_no_show_appeal(
  p_appointment_id uuid,
  p_customer_id uuid,
  p_reason text,
  p_evidence_note text default null
)
returns public.no_show_appeals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_appeal public.no_show_appeals%rowtype;
begin
  perform private.lock_appointment_command(p_appointment_id);
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Appointment not found.'; end if;
  if v_appointment.customer_id <> p_customer_id then raise exception using errcode = '42501', message = 'Customers may only appeal their own no-show.'; end if;
  if v_appointment.status <> 'customer_no_show' or v_appointment.no_show_appeal_deadline <= now() then raise exception using errcode = 'P4021', message = 'The no-show is not open for appeal.'; end if;
  insert into public.no_show_appeals (appointment_id, shop_id, customer_id, reason, evidence_note, expires_at)
  values (v_appointment.id, v_appointment.shop_id, p_customer_id,
    private.require_appointment_reason(p_reason), nullif(btrim(p_evidence_note), ''), v_appointment.no_show_appeal_deadline)
  returning * into v_appeal;
  update public.appointments set version = version + 1 where id = v_appointment.id;
  insert into public.appointment_events (appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata)
  values (v_appointment.id, v_appointment.shop_id, p_customer_id, 'customer', 'no_show_appealed', v_appointment.status, v_appointment.status,
    v_appeal.reason, jsonb_build_object('appeal_id', v_appeal.id));
  return v_appeal;
end;
$$;

create or replace function public.api_resolve_no_show_appeal(
  p_appeal_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_resolution text,
  p_reason text
)
returns public.no_show_appeals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appeal public.no_show_appeals%rowtype;
  v_appointment public.appointments%rowtype;
  v_reason text := private.require_appointment_reason(p_reason);
begin
  select * into v_appeal from public.no_show_appeals where id = p_appeal_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'No-show appeal not found.'; end if;
  perform private.lock_appointment_command(v_appeal.appointment_id);
  select * into v_appointment from public.appointments where id = v_appeal.appointment_id for update;
  if not exists (select 1 from public.shops where id = v_appeal.shop_id and owner_id = p_owner_id) then raise exception using errcode = '42501', message = 'Only the shop owner may resolve this appeal.'; end if;
  if v_appeal.version <> p_expected_version then raise exception using errcode = 'P4090', message = 'The appeal changed; refresh before trying again.'; end if;
  if v_appeal.status <> 'pending' then raise exception using errcode = 'P4021', message = 'This appeal is already resolved.'; end if;
  if p_resolution not in ('accepted', 'upheld') then raise exception using errcode = '22023', message = 'Resolution must be accepted or upheld.'; end if;
  update public.no_show_appeals set status = p_resolution, owner_reason = v_reason,
    resolved_at = now(), updated_at = now(), version = version + 1
  where id = v_appeal.id returning * into v_appeal;
  if p_resolution = 'upheld' then
    insert into public.customer_strike_events (customer_id, appointment_id, appeal_id, event_type, actor_id, reason)
    values (v_appeal.customer_id, v_appeal.appointment_id, v_appeal.id, 'upheld', p_owner_id, v_reason)
    on conflict do nothing;
  end if;
  update public.appointments set version = version + 1 where id = v_appointment.id;
  insert into public.appointment_events (appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata)
  values (v_appointment.id, v_appointment.shop_id, p_owner_id, 'shop_owner', 'no_show_appeal_resolved', v_appointment.status, v_appointment.status,
    v_reason, jsonb_build_object('appeal_id', v_appeal.id, 'resolution', p_resolution));
  perform private.recalculate_customer_booking_restriction(v_appeal.customer_id);
  return v_appeal;
end;
$$;

create or replace function public.api_waive_customer_strike(
  p_appointment_id uuid,
  p_owner_id uuid,
  p_reason text
)
returns public.customer_strike_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_event public.customer_strike_events%rowtype;
begin
  perform private.lock_appointment_command(p_appointment_id);
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Appointment not found.'; end if;
  if not exists (select 1 from public.shops where id = v_appointment.shop_id and owner_id = p_owner_id) then raise exception using errcode = '42501', message = 'Only the shop owner may waive this strike.'; end if;
  if not exists (select 1 from public.customer_strike_events where appointment_id = p_appointment_id and event_type = 'upheld')
    or exists (select 1 from public.customer_strike_events where appointment_id = p_appointment_id and event_type in ('waived', 'corrected')) then
    raise exception using errcode = 'P4021', message = 'There is no active strike to waive.';
  end if;
  insert into public.customer_strike_events (customer_id, appointment_id, event_type, actor_id, reason)
  values (v_appointment.customer_id, v_appointment.id, 'waived', p_owner_id, private.require_appointment_reason(p_reason))
  returning * into v_event;
  insert into public.appointment_events (appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata)
  values (v_appointment.id, v_appointment.shop_id, p_owner_id, 'shop_owner', 'strike_waived', v_appointment.status, v_appointment.status,
    v_event.reason, jsonb_build_object('strike_event_id', v_event.id));
  perform private.recalculate_customer_booking_restriction(v_appointment.customer_id);
  return v_event;
end;
$$;

create or replace function public.api_process_due_no_show_reviews()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select appointment.id, appointment.customer_id, appointment.shop_id, appeal.id as appeal_id
    from public.appointments as appointment
    left join public.no_show_appeals as appeal on appeal.appointment_id = appointment.id
    where appointment.status = 'customer_no_show'
      and appointment.no_show_appeal_deadline <= now()
      and (appeal.id is null or appeal.status = 'pending')
      and not exists (select 1 from public.customer_strike_events strike where strike.appointment_id = appointment.id and strike.event_type = 'upheld')
    for update of appointment
  loop
    if v_row.appeal_id is not null then
      update public.no_show_appeals set status = 'expired', resolved_at = now(), updated_at = now(), version = version + 1
      where id = v_row.appeal_id and status = 'pending';
    end if;
    insert into public.customer_strike_events (customer_id, appointment_id, appeal_id, event_type, reason)
    values (v_row.customer_id, v_row.id, v_row.appeal_id, 'upheld', 'Appeal window expired without an accepted appeal.')
    on conflict do nothing;
    perform private.recalculate_customer_booking_restriction(v_row.customer_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.api_mark_notification_read(p_notification_id uuid, p_recipient_id uuid)
returns public.in_app_notifications
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.in_app_notifications%rowtype;
begin
  update public.in_app_notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_id = p_recipient_id returning * into v_row;
  if not found then raise exception using errcode = 'P0002', message = 'Notification not found.'; end if;
  return v_row;
end;
$$;

revoke all on function public.api_create_appointment_change_proposal(uuid, integer, uuid, uuid, uuid, timestamptz, text, timestamptz) from public, anon, authenticated;
revoke all on function public.api_respond_appointment_change_proposal(uuid, integer, integer, uuid, text, text) from public, anon, authenticated;
revoke all on function public.api_report_appointment_delay(uuid, integer, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.api_mark_customer_no_show(uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.api_create_no_show_appeal(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.api_resolve_no_show_appeal(uuid, integer, uuid, text, text) from public, anon, authenticated;
revoke all on function public.api_waive_customer_strike(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.api_process_due_no_show_reviews() from public, anon, authenticated;
revoke all on function public.api_mark_notification_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.api_create_appointment_change_proposal(uuid, integer, uuid, uuid, uuid, timestamptz, text, timestamptz) to service_role;
grant execute on function public.api_respond_appointment_change_proposal(uuid, integer, integer, uuid, text, text) to service_role;
grant execute on function public.api_report_appointment_delay(uuid, integer, uuid, text, integer, text) to service_role;
grant execute on function public.api_mark_customer_no_show(uuid, integer, uuid, text) to service_role;
grant execute on function public.api_create_no_show_appeal(uuid, uuid, text, text) to service_role;
grant execute on function public.api_resolve_no_show_appeal(uuid, integer, uuid, text, text) to service_role;
grant execute on function public.api_waive_customer_strike(uuid, uuid, text) to service_role;
grant execute on function public.api_process_due_no_show_reviews() to service_role;
grant execute on function public.api_mark_notification_read(uuid, uuid) to service_role;
