-- Phase 4 P4-02: support-case commands.
--
-- Q13 windows, applied consistently: owner response target 48 hours, customer
-- escalation within 48 hours of the owner's decision, admin target five business
-- days. They are targets, and the only one with teeth is the escalation window,
-- because letting a customer escalate forever would make "resolved" meaningless.

create or replace function private.lock_support_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_case_id is null then
    raise exception using errcode = '22023', message = 'Support case id is required.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('support-case:' || p_case_id::text, 0)
  );
end;
$$;
revoke all on function private.lock_support_case(uuid) from public, anon, authenticated, service_role;

create or replace function private.next_case_reference()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate text;
  v_attempt integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_candidate := 'PB-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
    exit when not exists (select 1 from public.support_cases where reference = v_candidate);
    if v_attempt >= 10 then
      raise exception using errcode = '40001', message = 'Could not allocate a case reference; retry.';
    end if;
  end loop;
  return v_candidate;
end;
$$;
revoke all on function private.next_case_reference() from public, anon, authenticated, service_role;

create or replace function private.require_dispute_admin(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_verification_admin_capability(p_actor_id, 'dispute_review'::public.account_capability);
end;
$$;
revoke all on function private.require_dispute_admin(uuid) from public, anon, authenticated, service_role;

/**
 * Records that somebody looked at a case. The phase plan requires *access* to be
 * audited, not only decisions, because a support console that can read a private
 * dispute is a sensitive surface even when nothing changes.
 */
create or replace function public.api_record_case_access(
  p_case_id uuid,
  p_actor_id uuid,
  p_actor_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_role not in ('customer', 'barber', 'shop_owner', 'admin') then
    raise exception using errcode = '22023', message = 'Unknown case actor role.';
  end if;
  insert into public.case_events (case_id, actor_id, actor_role, event_type)
  values (p_case_id, p_actor_id, p_actor_role, 'accessed');
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Customer opens the dispute
-- ---------------------------------------------------------------------------

create or replace function public.api_open_appointment_dispute(
  p_appointment_id uuid,
  p_expected_version integer,
  p_customer_id uuid,
  p_reason text,
  p_evidence_note text default null
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_case public.support_cases%rowtype;
  v_reason text := btrim(p_reason);
  v_evidence text := nullif(btrim(coalesce(p_evidence_note, '')), '');
begin
  perform private.lock_appointment_command(p_appointment_id);
  -- The existing lifecycle command stays the authority on whether this
  -- appointment may be disputed at all, and by whom. The case is the record of
  -- the process around that transition, not a second state machine for it.
  v_appointment := public.api_transition_appointment_unlocked(
    p_appointment_id, p_expected_version, 'dispute', p_customer_id, v_reason, null
  );

  insert into public.support_cases (
    reference, kind, shop_id, appointment_id, opened_by, opened_by_role,
    subject, reason, status, owner_response_due_at
  )
  values (
    private.next_case_reference(), 'appointment_dispute', v_appointment.shop_id, v_appointment.id,
    p_customer_id, 'customer',
    'Dispute for ' || coalesce(v_appointment.booked_service_name, 'a visit')
      || ' on ' || to_char(v_appointment.starts_at at time zone coalesce(v_appointment.booked_timezone, 'Asia/Manila'), 'YYYY-MM-DD'),
    v_reason, 'owner_review', now() + interval '48 hours'
  )
  returning * into v_case;

  insert into public.case_participants (case_id, user_id, participant_role)
  select v_case.id, participant.user_id, participant.participant_role
  from (
    select v_appointment.customer_id as user_id, 'customer' as participant_role
    union all
    select shop.owner_id, 'shop_owner' from public.shops as shop where shop.id = v_appointment.shop_id
    union all
    select v_appointment.barber_id, 'barber'
  ) as participant
  where participant.user_id is not null
  on conflict (case_id, user_id) do nothing;

  -- `opened` is appended before any evidence event so the audit reads in the
  -- order the facts happened. `case_events.seq` makes that order total, which
  -- `created_at` cannot: both rows carry the same transaction timestamp.
  insert into public.case_events (case_id, actor_id, actor_role, event_type, reason, metadata)
  values (v_case.id, p_customer_id, 'customer', 'opened', v_reason,
    jsonb_build_object('appointment_id', v_appointment.id, 'reference', v_case.reference,
      'owner_response_due_at', v_case.owner_response_due_at));

  if v_evidence is not null then
    insert into public.case_evidence (case_id, author_id, author_role, note, visibility)
    values (v_case.id, p_customer_id, 'customer', v_evidence, 'case');
    insert into public.case_events (case_id, actor_id, actor_role, event_type)
    values (v_case.id, p_customer_id, 'customer', 'evidence_added');
  end if;
  return v_case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Owner decides
-- ---------------------------------------------------------------------------

create or replace function public.api_decide_appointment_dispute(
  p_case_id uuid,
  p_expected_version integer,
  p_owner_id uuid,
  p_decision text,
  p_reason text
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.support_cases%rowtype;
  v_appointment public.appointments%rowtype;
  v_reason text := btrim(p_reason);
begin
  perform private.lock_support_case(p_case_id);
  select * into v_case from public.support_cases where id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Support case not found.';
  end if;
  if v_case.kind <> 'appointment_dispute' then
    raise exception using errcode = '22023', message = 'This case is not an appointment dispute.';
  end if;
  if not exists (select 1 from public.shops where id = v_case.shop_id and owner_id = p_owner_id) then
    raise exception using errcode = '42501', message = 'Only the shop owner may decide this dispute.';
  end if;
  if v_case.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The case changed; refresh before trying again.';
  end if;
  if v_case.status <> 'owner_review' then
    raise exception using errcode = 'P4021', message = 'This case is no longer awaiting the shop decision.';
  end if;
  if p_decision not in ('completed', 'cancelled') then
    raise exception using errcode = '22023', message = 'Decision must be completed or cancelled.';
  end if;
  if char_length(v_reason) < 3 then
    raise exception using errcode = '22023', message = 'A dispute decision requires a reason.';
  end if;

  perform private.lock_appointment_command(v_case.appointment_id);
  select * into v_appointment from public.appointments where id = v_case.appointment_id;
  v_appointment := public.api_transition_appointment_unlocked(
    v_case.appointment_id,
    v_appointment.version,
    case when p_decision = 'completed' then 'resolve_complete' else 'resolve_cancel' end,
    p_owner_id,
    v_reason,
    null
  );

  update public.support_cases
  set status = 'owner_decided',
      owner_decision = p_decision,
      owner_decision_reason = v_reason,
      owner_decided_at = now(),
      -- Q13: the customer has 48 hours from this decision to escalate.
      escalation_deadline_at = now() + interval '48 hours',
      version = version + 1,
      updated_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into public.case_events (case_id, actor_id, actor_role, event_type, reason, metadata)
  values (v_case.id, p_owner_id, 'shop_owner', 'owner_decided', v_reason,
    jsonb_build_object('decision', p_decision, 'appointment_status', v_appointment.status,
      'escalation_deadline_at', v_case.escalation_deadline_at));
  return v_case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Customer accepts or escalates
-- ---------------------------------------------------------------------------

create or replace function public.api_respond_to_dispute_decision(
  p_case_id uuid,
  p_expected_version integer,
  p_customer_id uuid,
  p_response text,
  p_reason text default null
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.support_cases%rowtype;
  v_appointment public.appointments%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.lock_support_case(p_case_id);
  select * into v_case from public.support_cases where id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Support case not found.';
  end if;
  if v_case.opened_by <> p_customer_id then
    raise exception using errcode = '42501', message = 'Only the customer who opened this case may respond.';
  end if;
  if v_case.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The case changed; refresh before trying again.';
  end if;
  if v_case.status <> 'owner_decided' then
    raise exception using errcode = 'P4021', message = 'There is no shop decision awaiting your response.';
  end if;
  if p_response not in ('accept', 'escalate') then
    raise exception using errcode = '22023', message = 'Response must be accept or escalate.';
  end if;
  if now() > v_case.escalation_deadline_at then
    raise exception using errcode = 'P4034',
      message = 'The 48-hour window to respond to this decision has closed.';
  end if;

  if p_response = 'accept' then
    update public.support_cases
    set status = 'resolved',
        resolution = 'upheld_owner',
        resolution_reason = coalesce(v_reason, 'Customer accepted the shop decision.'),
        resolved_by = p_customer_id,
        resolved_at = now(),
        version = version + 1,
        updated_at = now()
    where id = p_case_id
    returning * into v_case;
    insert into public.case_events (case_id, actor_id, actor_role, event_type, reason)
    values (v_case.id, p_customer_id, 'customer', 'customer_accepted', v_case.resolution_reason);
    return v_case;
  end if;

  if v_reason is null then
    raise exception using errcode = '22023', message = 'An escalation requires a reason.';
  end if;

  update public.support_cases
  set status = 'escalated',
      escalated_at = now(),
      escalation_reason = v_reason,
      -- Q13: five business days, approximated as seven calendar days so the target
      -- never silently lands on a weekend.
      admin_target_at = now() + interval '7 days',
      version = version + 1,
      updated_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into public.case_events (case_id, actor_id, actor_role, event_type, reason, metadata)
  values (v_case.id, p_customer_id, 'customer', 'escalated', v_reason,
    jsonb_build_object('admin_target_at', v_case.admin_target_at));

  -- The public appointment timeline learns that an escalation exists. It does not
  -- learn why: the reason and any evidence stay in the case.
  select * into v_appointment from public.appointments where id = v_case.appointment_id;
  insert into public.appointment_events (
    appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata
  )
  values (
    v_appointment.id, v_appointment.shop_id, p_customer_id, 'customer', 'dispute_escalated',
    v_appointment.status, v_appointment.status,
    'The customer escalated the shop decision for platform review.',
    jsonb_build_object('case_reference', v_case.reference)
  );
  return v_case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Admin queue: assign, request information, resolve
-- ---------------------------------------------------------------------------

create or replace function public.api_assign_support_case(
  p_case_id uuid,
  p_expected_version integer,
  p_admin_id uuid
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.support_cases%rowtype;
begin
  perform private.require_dispute_admin(p_admin_id);
  perform private.lock_support_case(p_case_id);
  select * into v_case from public.support_cases where id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Support case not found.';
  end if;
  if v_case.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The case changed; refresh before trying again.';
  end if;
  if v_case.status not in ('escalated', 'information_requested') then
    raise exception using errcode = 'P4021', message = 'Only an escalated case can be assigned.';
  end if;

  update public.support_cases
  set assigned_admin_id = p_admin_id, version = version + 1, updated_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into public.case_participants (case_id, user_id, participant_role)
  values (p_case_id, p_admin_id, 'admin')
  on conflict (case_id, user_id) do update set removed_at = null;

  insert into public.case_events (case_id, actor_id, actor_role, event_type)
  values (p_case_id, p_admin_id, 'admin', 'assigned');
  return v_case;
end;
$$;

create or replace function public.api_request_case_information(
  p_case_id uuid,
  p_expected_version integer,
  p_admin_id uuid,
  p_reason text
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.support_cases%rowtype;
  v_reason text := btrim(p_reason);
begin
  perform private.require_dispute_admin(p_admin_id);
  perform private.lock_support_case(p_case_id);
  select * into v_case from public.support_cases where id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Support case not found.';
  end if;
  if v_case.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The case changed; refresh before trying again.';
  end if;
  if v_case.status <> 'escalated' then
    raise exception using errcode = 'P4021', message = 'Only an escalated case can be returned for information.';
  end if;
  if char_length(v_reason) < 3 then
    raise exception using errcode = '22023', message = 'An information request needs to say what is missing.';
  end if;
  if v_case.assigned_admin_id is distinct from p_admin_id then
    raise exception using errcode = '42501', message = 'Only the assigned reviewer may act on this case.';
  end if;

  update public.support_cases
  set status = 'information_requested',
      information_requested_at = now(),
      information_request_reason = v_reason,
      version = version + 1,
      updated_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into public.case_events (case_id, actor_id, actor_role, event_type, reason)
  values (p_case_id, p_admin_id, 'admin', 'information_requested', v_reason);
  return v_case;
end;
$$;

create or replace function public.api_add_case_evidence(
  p_case_id uuid,
  p_actor_id uuid,
  p_note text,
  p_visibility text default 'case'
)
returns public.case_evidence
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.support_cases%rowtype;
  v_role text;
  v_evidence public.case_evidence%rowtype;
begin
  perform private.lock_support_case(p_case_id);
  select * into v_case from public.support_cases where id = p_case_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Support case not found.';
  end if;
  if v_case.status = 'resolved' or v_case.status = 'withdrawn' then
    raise exception using errcode = 'P4021', message = 'This case is closed.';
  end if;

  select participant.participant_role into v_role
  from public.case_participants as participant
  where participant.case_id = p_case_id
    and participant.user_id = p_actor_id
    and participant.removed_at is null;
  if v_role is null then
    raise exception using errcode = '42501', message = 'You are not a participant in this case.';
  end if;
  if p_visibility not in ('case', 'admin_only') then
    raise exception using errcode = '22023', message = 'Unknown evidence visibility.';
  end if;
  -- Only a reviewer may file evidence the other parties cannot see.
  if p_visibility = 'admin_only' and v_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Only a reviewer may add reviewer-only notes.';
  end if;

  insert into public.case_evidence (case_id, author_id, author_role, note, visibility)
  values (p_case_id, p_actor_id, v_role, btrim(p_note), p_visibility)
  returning * into v_evidence;

  insert into public.case_events (case_id, actor_id, actor_role, event_type, metadata)
  values (p_case_id, p_actor_id, v_role, 'evidence_added', jsonb_build_object('visibility', p_visibility));
  return v_evidence;
end;
$$;

/**
 * Final platform decision. `overturned_owner` is an explicit correction command:
 * it moves the appointment to the corrected final state and appends a
 * `dispute_corrected` event, so derived metrics recompute from finalized facts
 * (including rating eligibility, which follows appointment status by trigger)
 * without any history being rewritten.
 */
create or replace function public.api_resolve_support_case(
  p_case_id uuid,
  p_expected_version integer,
  p_admin_id uuid,
  p_resolution text,
  p_reason text,
  p_corrected_status text default null
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.support_cases%rowtype;
  v_appointment public.appointments%rowtype;
  v_reason text := btrim(p_reason);
begin
  perform private.require_dispute_admin(p_admin_id);
  perform private.lock_support_case(p_case_id);
  select * into v_case from public.support_cases where id = p_case_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Support case not found.';
  end if;
  if v_case.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The case changed; refresh before trying again.';
  end if;
  if v_case.status not in ('escalated', 'information_requested') then
    raise exception using errcode = 'P4021', message = 'Only an escalated case can be resolved by a reviewer.';
  end if;
  if v_case.assigned_admin_id is distinct from p_admin_id then
    raise exception using errcode = '42501', message = 'Only the assigned reviewer may resolve this case.';
  end if;
  if p_resolution not in ('upheld_owner', 'overturned_owner', 'no_action') then
    raise exception using errcode = '22023', message = 'Unknown resolution.';
  end if;
  if char_length(v_reason) < 3 then
    raise exception using errcode = '22023', message = 'A resolution requires a reason.';
  end if;

  if p_resolution = 'overturned_owner' then
    if p_corrected_status not in ('completed', 'cancelled') then
      raise exception using errcode = '22023',
        message = 'Overturning a decision requires the corrected final status.';
    end if;
    if v_case.appointment_id is null then
      raise exception using errcode = '22023', message = 'Only an appointment dispute can be corrected this way.';
    end if;
    perform private.lock_appointment_command(v_case.appointment_id);
    select * into v_appointment from public.appointments where id = v_case.appointment_id for update;
    -- `appointments.status` is an enum and `p_corrected_status` is text, so the
    -- cast is required; without it the comparison has no operator at all.
    if v_appointment.status = p_corrected_status::public.appointment_status then
      raise exception using errcode = 'P4021', message = 'The appointment already carries that final status.';
    end if;

    update public.appointments
    set status = p_corrected_status::public.appointment_status,
        status_updated_at = now(),
        completed_at = case when p_corrected_status = 'completed' then coalesce(completed_at, now()) else null end,
        cancelled_at = case when p_corrected_status = 'cancelled' then now() else null end,
        cancelled_by = case when p_corrected_status = 'cancelled' then p_admin_id else null end,
        cancellation_reason = case when p_corrected_status = 'cancelled' then v_reason else cancellation_reason end,
        version = version + 1
    where id = v_case.appointment_id;

    insert into public.appointment_events (
      appointment_id, shop_id, actor_id, actor_role, event_type, from_status, to_status, reason, metadata
    )
    values (
      v_appointment.id, v_appointment.shop_id, p_admin_id, 'admin', 'dispute_corrected',
      v_appointment.status, p_corrected_status::public.appointment_status,
      'Platform review corrected the recorded outcome of this visit.',
      jsonb_build_object('case_reference', v_case.reference)
    );
    insert into public.case_events (case_id, actor_id, actor_role, event_type, reason, metadata)
    values (p_case_id, p_admin_id, 'admin', 'correction_applied', v_reason,
      jsonb_build_object('from_status', v_appointment.status, 'to_status', p_corrected_status));
  end if;

  update public.support_cases
  set status = 'resolved',
      resolution = p_resolution,
      resolution_reason = v_reason,
      resolved_by = p_admin_id,
      resolved_at = now(),
      version = version + 1,
      updated_at = now()
  where id = p_case_id
  returning * into v_case;

  insert into public.case_events (case_id, actor_id, actor_role, event_type, reason, metadata)
  values (p_case_id, p_admin_id, 'admin', 'resolved', v_reason,
    jsonb_build_object('resolution', p_resolution, 'corrected_status', p_corrected_status));
  return v_case;
end;
$$;

/**
 * Escalation window sweeper. A decision the customer never answered becomes final
 * so the case does not sit open forever, and the closure is a recorded fact rather
 * than an absence of one.
 */
create or replace function public.api_close_unanswered_dispute_decisions(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed integer := 0;
  v_row record;
begin
  for v_row in
    select id from public.support_cases
    where status = 'owner_decided' and escalation_deadline_at <= now()
    order by escalation_deadline_at
    limit greatest(p_limit, 1)
    for update skip locked
  loop
    update public.support_cases
    set status = 'resolved',
        resolution = 'closed_no_response',
        resolution_reason = 'The 48-hour window to respond to the shop decision passed without a reply.',
        resolved_at = now(),
        version = version + 1,
        updated_at = now()
    where id = v_row.id;
    insert into public.case_events (case_id, actor_role, event_type, reason)
    values (v_row.id, 'system', 'resolved',
      'The 48-hour window to respond to the shop decision passed without a reply.');
    v_closed := v_closed + 1;
  end loop;
  return v_closed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rating moderation escalates into the same model
-- ---------------------------------------------------------------------------

create or replace function public.api_escalate_rating_report(
  p_report_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_reason text
)
returns public.support_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.rating_reports%rowtype;
  v_rating public.ratings%rowtype;
  v_case public.support_cases%rowtype;
  v_role text;
  v_reason text := btrim(p_reason);
begin
  select * into v_report from public.rating_reports where id = p_report_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found.';
  end if;
  select * into v_rating from public.ratings where id = v_report.rating_id;
  perform private.lock_rating_command(v_rating.eligibility_id);
  select * into v_report from public.rating_reports where id = p_report_id for update;
  if v_report.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The report changed; refresh before trying again.';
  end if;
  if char_length(v_reason) < 3 then
    raise exception using errcode = '22023', message = 'An escalation requires a reason.';
  end if;

  if p_actor_id = v_rating.customer_id then
    v_role := 'customer';
  else
    v_role := private.rating_shop_actor_role(v_rating.shop_id, v_rating.barber_id, p_actor_id);
  end if;
  if v_role is null then
    raise exception using errcode = '42501', message = 'You are not a party to this review.';
  end if;
  if exists (select 1 from public.support_cases where rating_report_id = p_report_id) then
    raise exception using errcode = 'P4021', message = 'This report is already escalated.';
  end if;

  insert into public.support_cases (
    reference, kind, shop_id, rating_report_id, opened_by, opened_by_role,
    subject, reason, status, owner_response_due_at, escalated_at, admin_target_at
  )
  values (
    private.next_case_reference(), 'rating_moderation', v_report.shop_id, p_report_id,
    p_actor_id, v_role,
    'Moderation appeal for review ' || left(v_rating.id::text, 8),
    v_reason, 'escalated', now(), now(), now() + interval '7 days'
  )
  returning * into v_case;

  insert into public.case_participants (case_id, user_id, participant_role)
  select v_case.id, participant.user_id, participant.participant_role
  from (
    select v_rating.customer_id as user_id, 'customer' as participant_role
    union all
    select shop.owner_id, 'shop_owner' from public.shops as shop where shop.id = v_rating.shop_id
    union all
    select v_rating.barber_id, 'barber'
  ) as participant
  where participant.user_id is not null
  on conflict (case_id, user_id) do nothing;

  insert into public.case_events (case_id, actor_id, actor_role, event_type, reason, metadata)
  values (v_case.id, p_actor_id, v_role, 'opened', v_reason,
    jsonb_build_object('report_id', p_report_id, 'rating_id', v_rating.id, 'reference', v_case.reference));
  insert into public.rating_events (
    shop_id, eligibility_id, rating_id, report_id, actor_id, actor_role, event_type, reason, metadata
  )
  values (
    v_rating.shop_id, v_rating.eligibility_id, v_rating.id, p_report_id, p_actor_id, v_role,
    'report_opened', v_reason, jsonb_build_object('escalated_case', v_case.reference)
  );
  return v_case;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'public.api_record_case_access(uuid, uuid, text)',
    'public.api_open_appointment_dispute(uuid, integer, uuid, text, text)',
    'public.api_decide_appointment_dispute(uuid, integer, uuid, text, text)',
    'public.api_respond_to_dispute_decision(uuid, integer, uuid, text, text)',
    'public.api_assign_support_case(uuid, integer, uuid)',
    'public.api_request_case_information(uuid, integer, uuid, text)',
    'public.api_add_case_evidence(uuid, uuid, text, text)',
    'public.api_resolve_support_case(uuid, integer, uuid, text, text, text)',
    'public.api_close_unanswered_dispute_decisions(integer)',
    'public.api_escalate_rating_report(uuid, integer, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', target);
    execute format('grant execute on function %s to service_role', target);
  end loop;
end $$;

-- Cases are derived from commands, exactly like ratings. Express reads them and
-- calls the commands; it never writes a case row itself.
revoke insert, update, delete, truncate on table public.support_cases from service_role;
revoke insert, update, delete, truncate on table public.case_participants from service_role;
revoke insert, update, delete, truncate on table public.case_evidence from service_role;
revoke insert, update, delete, truncate on table public.case_events from service_role;
