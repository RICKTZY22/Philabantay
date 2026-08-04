-- Phase 3 walk-in queue, offline collection audit, delivery retry bookkeeping,
-- and idempotent daily closeout.

create or replace function private.reject_p3_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Operational event history is immutable.';
end;
$$;
revoke all on function private.reject_p3_event_mutation() from public, anon, authenticated;
create trigger queue_events_immutable before update or delete on public.queue_events
  for each row execute function private.reject_p3_event_mutation();
create trigger payment_events_immutable before update or delete on public.payment_events
  for each row execute function private.reject_p3_event_mutation();
create trigger customer_strike_events_immutable before update or delete on public.customer_strike_events
  for each row execute function private.reject_p3_event_mutation();

create or replace function private.enqueue_queue_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_outbox_id uuid;
begin
  for v_recipient in
    select distinct recipient_id from (
      select shop.owner_id as recipient_id from public.shops shop where shop.id = new.shop_id
      union all
      select walk_in.customer_user_id from public.walk_in_entries walk_in where walk_in.id = new.walk_in_id
    ) recipients where recipient_id is not null and recipient_id is distinct from new.actor_id
  loop
    insert into public.notification_outbox (recipient_id, shop_id, event_key, title, body, payload)
    values (v_recipient, new.shop_id, 'walk-in:' || new.id::text || ':' || v_recipient::text,
      'Walk-in ' || initcap(replace(new.event_type, '_', ' ')), coalesce(new.reason, 'The walk-in queue changed.'),
      jsonb_build_object('walk_in_id', new.walk_in_id, 'event_type', new.event_type))
    on conflict (recipient_id, event_key) do nothing returning id into v_outbox_id;
    if v_outbox_id is not null then
      insert into public.in_app_notifications (outbox_id, recipient_id, title, body, payload)
      values (v_outbox_id, v_recipient, 'Walk-in update', coalesce(new.reason, 'The walk-in queue changed.'),
        jsonb_build_object('walk_in_id', new.walk_in_id, 'event_type', new.event_type));
    end if;
    v_outbox_id := null;
  end loop;
  return new;
end;
$$;

create or replace function private.enqueue_payment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid; v_outbox_id uuid;
begin
  for v_recipient in
    select distinct recipient_id from (
      select shop.owner_id as recipient_id from public.shops shop where shop.id = new.shop_id
      union all
      select appointment.customer_id from public.appointments appointment where appointment.id = new.appointment_id
      union all
      select walk_in.customer_user_id from public.walk_in_entries walk_in where walk_in.id = new.walk_in_id
    ) recipients where recipient_id is not null and recipient_id is distinct from new.actor_id
  loop
    insert into public.notification_outbox (recipient_id, shop_id, appointment_id, event_key, title, body, payload)
    values (v_recipient, new.shop_id, new.appointment_id, 'payment:' || new.id::text || ':' || v_recipient::text,
      'Offline payment ' || new.event_type, 'An offline collection record changed; Philabantay did not process the funds.',
      jsonb_build_object('payment_id', new.payment_id, 'event_type', new.event_type, 'walk_in_id', new.walk_in_id))
    on conflict (recipient_id, event_key) do nothing returning id into v_outbox_id;
    if v_outbox_id is not null then
      insert into public.in_app_notifications (outbox_id, recipient_id, title, body, payload)
      values (v_outbox_id, v_recipient, 'Offline payment ' || new.event_type,
        'An offline collection record changed; Philabantay did not process the funds.',
        jsonb_build_object('payment_id', new.payment_id, 'event_type', new.event_type, 'walk_in_id', new.walk_in_id));
    end if;
    v_outbox_id := null;
  end loop;
  return new;
end;
$$;
revoke all on function private.enqueue_queue_event(), private.enqueue_payment_event() from public, anon, authenticated;
create trigger queue_events_enqueue_notifications after insert on public.queue_events
  for each row execute function private.enqueue_queue_event();
create trigger payment_events_enqueue_notifications after insert on public.payment_events
  for each row execute function private.enqueue_payment_event();

create or replace function public.api_create_walk_in(
  p_shop_id uuid,
  p_actor_id uuid,
  p_display_name text,
  p_service_id uuid default null,
  p_requested_barber_id uuid default null,
  p_notes text default null
)
returns public.walk_in_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_walk_in public.walk_in_entries%rowtype;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  perform private.require_p3_shop_staff(p_shop_id, p_actor_id);
  if char_length(v_name) not between 1 and 80 then raise exception using errcode = '22023', message = 'Walk-in display name is required.'; end if;
  if p_notes is not null and char_length(p_notes) > 1000 then raise exception using errcode = '22023', message = 'Walk-in notes cannot exceed 1000 characters.'; end if;
  if p_service_id is not null and not exists (select 1 from public.services where id = p_service_id and shop_id = p_shop_id and active) then raise exception using errcode = 'P4021', message = 'Walk-in service is not active at this shop.'; end if;
  if p_requested_barber_id is not null and not private.is_bookable_provider_for_shop(p_shop_id, p_requested_barber_id) then raise exception using errcode = 'P4021', message = 'Requested provider is not active at this shop.'; end if;
  insert into public.walk_in_entries (shop_id, created_by, service_id, requested_barber_id, assigned_provider_id, display_name, notes)
  values (p_shop_id, p_actor_id, p_service_id, p_requested_barber_id, p_requested_barber_id, v_name, nullif(btrim(p_notes), ''))
  returning * into v_walk_in;
  insert into public.queue_events (walk_in_id, shop_id, actor_id, event_type, to_status, metadata)
  values (v_walk_in.id, p_shop_id, p_actor_id, 'created', 'waiting', jsonb_build_object('service_id', p_service_id, 'requested_barber_id', p_requested_barber_id));
  return v_walk_in;
end;
$$;

create or replace function public.api_issue_walk_in_claim(
  p_walk_in_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_token text,
  p_expires_at timestamptz
)
returns public.guest_visit_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_walk_in public.walk_in_entries%rowtype;
  v_claim public.guest_visit_claims%rowtype;
begin
  select * into v_walk_in from public.walk_in_entries where id = p_walk_in_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Walk-in not found.'; end if;
  perform private.require_p3_shop_staff(v_walk_in.shop_id, p_actor_id);
  if v_walk_in.version <> p_expected_version then raise exception using errcode = 'P4090', message = 'Walk-in changed; refresh before trying again.'; end if;
  if v_walk_in.queue_status not in ('waiting', 'called') then raise exception using errcode = 'P4021', message = 'This walk-in can no longer issue a claim code.'; end if;
  if p_token !~ '^[0-9]{6}$' or p_expires_at <= now() or p_expires_at > now() + interval '30 minutes' then raise exception using errcode = '22023', message = 'Claim code or expiry is invalid.'; end if;
  insert into public.guest_visit_claims (walk_in_id, claim_token_hash, token_expires_at)
  values (v_walk_in.id, extensions.crypt(p_token, extensions.gen_salt('bf')), p_expires_at)
  on conflict (walk_in_id) do update set claim_token_hash = excluded.claim_token_hash,
    token_expires_at = excluded.token_expires_at, otp_attempts = 0,
    verified_at = null, single_use_at = null
  returning * into v_claim;
  update public.walk_in_entries set version = version + 1, updated_at = now() where id = v_walk_in.id;
  insert into public.queue_events (walk_in_id, shop_id, actor_id, event_type, from_status, to_status, metadata)
  values (v_walk_in.id, v_walk_in.shop_id, p_actor_id, 'claim_code_issued', v_walk_in.queue_status, v_walk_in.queue_status,
    jsonb_build_object('expires_at', p_expires_at));
  return v_claim;
end;
$$;

create or replace function public.api_claim_walk_in(
  p_walk_in_id uuid,
  p_token text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.guest_visit_claims%rowtype;
  v_walk_in public.walk_in_entries%rowtype;
  v_from_status text;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  select * into v_claim from public.guest_visit_claims where walk_in_id = p_walk_in_id for update;
  if not found or v_claim.single_use_at is not null or v_claim.token_expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'invalid_code', 'message', 'Claim code is invalid or expired.');
  end if;
  if v_claim.otp_attempts >= 5 then
    return jsonb_build_object('ok', false, 'code', 'too_many_attempts', 'message', 'Too many claim attempts.');
  end if;
  if char_length(v_phone) < 7 or char_length(v_phone) > 16 then raise exception using errcode = '22023', message = 'A valid phone number is required.'; end if;
  if p_token is null or extensions.crypt(p_token, v_claim.claim_token_hash) <> v_claim.claim_token_hash then
    update public.guest_visit_claims set otp_attempts = otp_attempts + 1 where id = v_claim.id;
    return jsonb_build_object('ok', false, 'code', 'invalid_code', 'message', 'Claim code is invalid or expired.');
  end if;
  select * into v_walk_in from public.walk_in_entries where id = p_walk_in_id for update;
  v_from_status := v_walk_in.queue_status;
  update public.guest_visit_claims set normalized_phone_hash = encode(extensions.digest(lower(v_phone), 'sha256'), 'hex'),
    verified_at = now(), single_use_at = now(), otp_attempts = otp_attempts + 1 where id = v_claim.id;
  update public.walk_in_entries set queue_status = 'checked_in', checked_in_at = now(), version = version + 1, updated_at = now()
  where id = p_walk_in_id returning * into v_walk_in;
  insert into public.queue_events (walk_in_id, shop_id, event_type, from_status, to_status, metadata)
  values (v_walk_in.id, v_walk_in.shop_id, 'guest_claimed', v_from_status, 'checked_in', jsonb_build_object('verified', true));
  return jsonb_build_object('ok', true, 'walk_in', to_jsonb(v_walk_in));
end;
$$;

create or replace function public.api_transition_walk_in(
  p_walk_in_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_action text,
  p_provider_id uuid default null,
  p_reason text default null
)
returns public.walk_in_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.walk_in_entries%rowtype;
  v_updated public.walk_in_entries%rowtype;
  v_next text;
  v_reason text;
begin
  select * into v_current from public.walk_in_entries where id = p_walk_in_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Walk-in not found.'; end if;
  perform private.require_p3_shop_staff(v_current.shop_id, p_actor_id);
  if v_current.version <> p_expected_version then raise exception using errcode = 'P4090', message = 'Walk-in changed; refresh before trying again.'; end if;
  case p_action
    when 'call' then if v_current.queue_status <> 'waiting' then raise exception using errcode = 'P4021', message = 'Only a waiting guest can be called.'; end if; v_next := 'called';
    when 'check_in' then if v_current.queue_status not in ('waiting', 'called') then raise exception using errcode = 'P4021', message = 'This guest cannot be checked in.'; end if; v_next := 'checked_in'; v_reason := private.require_appointment_reason(p_reason);
    when 'start' then
      if v_current.queue_status <> 'checked_in' or v_current.service_id is null then raise exception using errcode = 'P4021', message = 'A checked-in walk-in with a service is required.'; end if;
      if p_provider_id is null or not private.is_bookable_provider_for_shop(v_current.shop_id, p_provider_id) then raise exception using errcode = 'P4021', message = 'An active provider assignment is required.'; end if;
      perform private.require_provider_qualified(v_current.shop_id, v_current.service_id, p_provider_id);
      v_next := 'in_service';
    when 'complete' then if v_current.queue_status <> 'in_service' then raise exception using errcode = 'P4021', message = 'Only an in-service walk-in can complete.'; end if; v_next := 'completed';
    when 'attention' then v_next := 'attention'; v_reason := private.require_appointment_reason(p_reason);
    when 'cancel' then if v_current.queue_status in ('completed', 'cancelled') then raise exception using errcode = 'P4021', message = 'This walk-in is already terminal.'; end if; v_next := 'cancelled'; v_reason := private.require_appointment_reason(p_reason);
    else raise exception using errcode = '22023', message = 'Unknown walk-in action.';
  end case;
  update public.walk_in_entries set queue_status = v_next,
    assigned_provider_id = case when p_action = 'start' then p_provider_id else assigned_provider_id end,
    checked_in_at = case when p_action = 'check_in' then now() else checked_in_at end,
    manually_verified = case when p_action = 'check_in' then true else manually_verified end,
    started_at = case when p_action = 'start' then now() else started_at end,
    completed_at = case when p_action = 'complete' then now() else completed_at end,
    version = version + 1, updated_at = now()
  where id = v_current.id returning * into v_updated;
  insert into public.queue_events (walk_in_id, shop_id, actor_id, event_type, from_status, to_status, reason, metadata)
  values (v_current.id, v_current.shop_id, p_actor_id, p_action, v_current.queue_status, v_next, v_reason,
    jsonb_build_object('provider_id', p_provider_id, 'manually_verified', p_action = 'check_in'));
  return v_updated;
end;
$$;

create or replace function public.api_link_walk_in_customer(p_walk_in_id uuid, p_customer_id uuid)
returns public.walk_in_entries
language plpgsql
security definer
set search_path = ''
as $$
declare v_claim public.guest_visit_claims%rowtype; v_phone text; v_walk_in public.walk_in_entries%rowtype;
begin
  select * into v_claim from public.guest_visit_claims where walk_in_id = p_walk_in_id and verified_at is not null for update;
  if not found then raise exception using errcode = 'P4021', message = 'A verified guest claim is required before account linking.'; end if;
  select regexp_replace(coalesce(phone, ''), '[^0-9+]', '', 'g') into v_phone from public.users
  where id = p_customer_id and role = 'customer' and requested_role = 'customer' and verification_status = 'not_required' and onboarding_completed;
  if v_phone is null or encode(extensions.digest(lower(v_phone), 'sha256'), 'hex') <> v_claim.normalized_phone_hash then
    raise exception using errcode = '42501', message = 'The signed-in customer phone does not match the verified guest claim.';
  end if;
  update public.walk_in_entries set customer_user_id = p_customer_id, version = version + 1, updated_at = now()
  where id = p_walk_in_id and (customer_user_id is null or customer_user_id = p_customer_id) returning * into v_walk_in;
  if not found then raise exception using errcode = 'P4021', message = 'This walk-in is already linked to another account.'; end if;
  insert into public.queue_events (walk_in_id, shop_id, actor_id, event_type, from_status, to_status, metadata)
  values (v_walk_in.id, v_walk_in.shop_id, p_customer_id, 'account_linked', v_walk_in.queue_status, v_walk_in.queue_status, jsonb_build_object('customer_user_id', p_customer_id));
  return v_walk_in;
end;
$$;

create or replace function public.api_set_cashier_capability(
  p_shop_id uuid,
  p_owner_id uuid,
  p_user_id uuid,
  p_active boolean
)
returns public.shop_cashier_capabilities
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.shop_cashier_capabilities%rowtype;
begin
  if not exists (select 1 from public.shops where id = p_shop_id and owner_id = p_owner_id) then raise exception using errcode = '42501', message = 'Only the shop owner may manage cashier access.'; end if;
  if p_user_id = p_owner_id then raise exception using errcode = '22023', message = 'The owner already has payment access.'; end if;
  if p_active and not private.is_active_barber_for_shop(p_shop_id, p_user_id) then raise exception using errcode = 'P4021', message = 'Cashier access requires current shop employment.'; end if;
  insert into public.shop_cashier_capabilities (shop_id, user_id, active, granted_by, granted_at, revoked_at)
  values (p_shop_id, p_user_id, p_active, p_owner_id, now(), case when p_active then null else now() end)
  on conflict (shop_id, user_id) do update set active = excluded.active, granted_by = excluded.granted_by,
    granted_at = case when excluded.active then now() else public.shop_cashier_capabilities.granted_at end,
    revoked_at = case when excluded.active then null else now() end
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function private.require_payment_actor(p_shop_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.shops where id = p_shop_id and owner_id = p_actor_id) then return; end if;
  if exists (select 1 from public.shop_cashier_capabilities where shop_id = p_shop_id and user_id = p_actor_id and active)
    and private.is_active_barber_for_shop(p_shop_id, p_actor_id) then return; end if;
  raise exception using errcode = 'P4031', message = 'Payment-record capability is required.';
end;
$$;
revoke all on function private.require_payment_actor(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.api_record_offline_payment(
  p_appointment_id uuid,
  p_walk_in_id uuid,
  p_actor_id uuid,
  p_method text,
  p_currency text,
  p_amount_cents integer,
  p_paid_at timestamptz,
  p_idempotency_key uuid
)
returns public.payment_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_row public.payment_records%rowtype;
begin
  if (p_appointment_id is null) = (p_walk_in_id is null) then raise exception using errcode = '22023', message = 'Choose exactly one appointment or walk-in.'; end if;
  if p_appointment_id is not null then select shop_id into v_shop_id from public.appointments where id = p_appointment_id;
  else select shop_id into v_shop_id from public.walk_in_entries where id = p_walk_in_id; end if;
  if v_shop_id is null then raise exception using errcode = 'P0002', message = 'Visit not found.'; end if;
  perform private.require_payment_actor(v_shop_id, p_actor_id);
  if p_method not in ('cash', 'card_terminal', 'ewallet', 'other_offline') or p_currency !~ '^[A-Z]{3}$' or p_amount_cents < 0 or p_paid_at > now() + interval '5 minutes' then raise exception using errcode = '22023', message = 'Payment facts are invalid.'; end if;
  select * into v_row from public.payment_records where recorded_by = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if v_row.appointment_id is distinct from p_appointment_id or v_row.walk_in_id is distinct from p_walk_in_id
      or v_row.method <> p_method or v_row.currency <> p_currency or v_row.amount_cents <> p_amount_cents then
      raise exception using errcode = 'P4096', message = 'Idempotency key was already used for different payment facts.';
    end if;
    return v_row;
  end if;
  insert into public.payment_records (appointment_id, walk_in_id, shop_id, method, currency, amount_cents, recorded_by, paid_at, idempotency_key)
  values (p_appointment_id, p_walk_in_id, v_shop_id, p_method, p_currency, p_amount_cents, p_actor_id, p_paid_at, p_idempotency_key)
  returning * into v_row;
  insert into public.payment_events (payment_id, appointment_id, walk_in_id, shop_id, actor_id, event_type, amount_delta_cents, metadata)
  values (v_row.id, p_appointment_id, p_walk_in_id, v_shop_id, p_actor_id, 'recorded', p_amount_cents,
    jsonb_build_object('method', p_method, 'currency', p_currency, 'philabantay_processed', false));
  return v_row;
end;
$$;

create or replace function public.api_change_offline_payment(
  p_payment_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_action text,
  p_amount_cents integer,
  p_reason text
)
returns public.payment_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.payment_records%rowtype;
  v_updated public.payment_records%rowtype;
  v_status text;
  v_new_amount integer;
begin
  select * into v_current from public.payment_records where id = p_payment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Payment record not found.'; end if;
  perform private.require_payment_actor(v_current.shop_id, p_actor_id);
  if v_current.version <> p_expected_version then raise exception using errcode = 'P4090', message = 'Payment changed; refresh before trying again.'; end if;
  if v_current.status not in ('recorded', 'corrected') then raise exception using errcode = 'P4021', message = 'This payment is already terminal.'; end if;
  if p_action = 'correct' then v_status := 'corrected'; v_new_amount := p_amount_cents;
  elsif p_action = 'refund' then v_status := 'refunded'; v_new_amount := 0;
  elsif p_action = 'void' then v_status := 'voided'; v_new_amount := 0;
  else raise exception using errcode = '22023', message = 'Unknown payment action.'; end if;
  if v_new_amount < 0 then raise exception using errcode = '22023', message = 'Payment amount cannot be negative.'; end if;
  update public.payment_records set status = v_status, amount_cents = v_new_amount,
    version = version + 1, updated_at = now() where id = v_current.id returning * into v_updated;
  insert into public.payment_events (payment_id, appointment_id, walk_in_id, shop_id, actor_id, event_type, amount_delta_cents, reason, metadata)
  values (v_current.id, v_current.appointment_id, v_current.walk_in_id, v_current.shop_id, p_actor_id, v_status,
    v_new_amount - v_current.amount_cents, private.require_appointment_reason(p_reason),
    jsonb_build_object('previous_amount_cents', v_current.amount_cents, 'new_amount_cents', v_new_amount,
      'philabantay_processed', false));
  return v_updated;
end;
$$;

create or replace function public.api_record_notification_attempt(
  p_outbox_id uuid,
  p_provider text,
  p_succeeded boolean,
  p_error_code text default null
)
returns public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.notification_outbox%rowtype; v_attempt integer;
begin
  select * into v_row from public.notification_outbox where id = p_outbox_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Outbox item not found.'; end if;
  if v_row.status in ('delivered', 'dead_letter') then return v_row; end if;
  v_attempt := v_row.attempt_count + 1;
  insert into public.notification_deliveries (outbox_id, attempt, provider, status, error_code)
  values (v_row.id, v_attempt, p_provider, case when p_succeeded then 'delivered' else 'failed' end, left(p_error_code, 120))
  on conflict do nothing;
  update public.notification_outbox set attempt_count = v_attempt,
    status = case when p_succeeded then 'delivered' when v_attempt >= 5 then 'dead_letter' else 'retry' end,
    delivered_at = case when p_succeeded then now() else delivered_at end,
    available_at = case when p_succeeded then available_at else now() + make_interval(mins => least(60, power(2, v_attempt)::integer)) end,
    leased_until = null, last_error = case when p_succeeded then null else left(p_error_code, 500) end
  where id = v_row.id returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.api_deliver_due_in_app_notifications(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_item public.notification_outbox%rowtype; v_count integer := 0;
begin
  for v_item in select * from public.notification_outbox
    where status in ('pending', 'retry') and available_at <= now()
    order by created_at for update skip locked limit greatest(1, least(p_limit, 500))
  loop
    perform public.api_record_notification_attempt(v_item.id, 'in_app', true, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.api_run_shop_closeout(p_shop_id uuid, p_local_date date)
returns public.closeout_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.closeout_runs%rowtype;
  v_timezone text;
  v_attention integer := 0;
  v_expired integer := 0;
  v_completed integer := 0;
  v_due record;
begin
  select timezone into v_timezone from public.shops where id = p_shop_id;
  if not found then raise exception using errcode = 'P0002', message = 'Shop not found.'; end if;
  insert into public.closeout_runs (shop_id, local_date, status)
  values (p_shop_id, p_local_date, 'running')
  on conflict (shop_id, local_date) do update set
    status = case when public.closeout_runs.status = 'completed' then 'completed' else 'running' end,
    lease_token = case when public.closeout_runs.status = 'completed' then public.closeout_runs.lease_token else gen_random_uuid() end,
    leased_until = case when public.closeout_runs.status = 'completed' then public.closeout_runs.leased_until else now() + interval '5 minutes' end
  returning * into v_run;
  if v_run.status = 'completed' then return v_run; end if;

  for v_due in select id, version from public.appointments
    where shop_id = p_shop_id and status = 'requested' and expires_at <= now()
    order by expires_at
  loop
    begin
      perform public.api_transition_appointment(v_due.id, v_due.version, 'expire', null, null, null);
      v_expired := v_expired + 1;
    exception when sqlstate 'P4090' or sqlstate '22023' then null;
    end;
  end loop;
  for v_due in select id, version from public.appointments
    where shop_id = p_shop_id and status = 'awaiting_confirmation' and completion_due_at <= now()
    order by completion_due_at
  loop
    begin
      perform public.api_transition_appointment(v_due.id, v_due.version, 'auto_complete', null, null, null);
      v_completed := v_completed + 1;
    exception when sqlstate 'P4090' or sqlstate '22023' then null;
    end;
  end loop;

  insert into public.appointment_attention_items (appointment_id, shop_id, kind, reason)
  select appointment.id, appointment.shop_id, 'closeout_unresolved',
    'Closeout found an unresolved visit; staff must review rather than guessing attendance or completion.'
  from public.appointments as appointment
  where appointment.shop_id = p_shop_id
    and (appointment.starts_at at time zone v_timezone)::date <= p_local_date
    and appointment.status in ('confirmed', 'checked_in', 'in_progress', 'disputed')
  on conflict do nothing;

  insert into public.appointment_attention_items (appointment_id, shop_id, kind, reason)
  select appointment.id, appointment.shop_id, 'payment_mismatch',
    'Completed visit has no active offline collection record; completion was not changed.'
  from public.appointments as appointment
  where appointment.shop_id = p_shop_id
    and (appointment.starts_at at time zone v_timezone)::date <= p_local_date
    and appointment.status = 'completed'
    and not exists (select 1 from public.payment_records payment where payment.appointment_id = appointment.id and payment.status in ('recorded', 'corrected'))
  on conflict do nothing;

  select count(*) into v_attention from public.appointment_attention_items as attention
  where attention.shop_id = p_shop_id and attention.status = 'open'
    and exists (select 1 from public.appointments appointment where appointment.id = attention.appointment_id and (appointment.starts_at at time zone v_timezone)::date <= p_local_date);
  update public.closeout_runs set status = 'completed', expired_count = v_expired,
    auto_completed_count = v_completed, attention_count = v_attention,
    completed_at = now(), leased_until = now(), last_error = null
  where id = v_run.id returning * into v_run;
  return v_run;
end;
$$;

create or replace function public.api_run_due_closeouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_shop record; v_count integer := 0;
begin
  for v_shop in select id, timezone from public.shops where lifecycle_status <> 'archived'
  loop
    perform public.api_run_shop_closeout(v_shop.id, (now() at time zone v_shop.timezone)::date - 1);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.api_create_walk_in(uuid, uuid, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.api_issue_walk_in_claim(uuid, integer, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.api_claim_walk_in(uuid, text, text) from public, anon, authenticated;
revoke all on function public.api_transition_walk_in(uuid, integer, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.api_link_walk_in_customer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.api_set_cashier_capability(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.api_record_offline_payment(uuid, uuid, uuid, text, text, integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.api_change_offline_payment(uuid, integer, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.api_record_notification_attempt(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.api_deliver_due_in_app_notifications(integer) from public, anon, authenticated;
revoke all on function public.api_run_shop_closeout(uuid, date) from public, anon, authenticated;
revoke all on function public.api_run_due_closeouts() from public, anon, authenticated;
grant execute on function public.api_create_walk_in(uuid, uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.api_issue_walk_in_claim(uuid, integer, uuid, text, timestamptz) to service_role;
grant execute on function public.api_claim_walk_in(uuid, text, text) to service_role;
grant execute on function public.api_transition_walk_in(uuid, integer, uuid, text, uuid, text) to service_role;
grant execute on function public.api_link_walk_in_customer(uuid, uuid) to service_role;
grant execute on function public.api_set_cashier_capability(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.api_record_offline_payment(uuid, uuid, uuid, text, text, integer, timestamptz, uuid) to service_role;
grant execute on function public.api_change_offline_payment(uuid, integer, uuid, text, integer, text) to service_role;
grant execute on function public.api_record_notification_attempt(uuid, text, boolean, text) to service_role;
grant execute on function public.api_deliver_due_in_app_notifications(integer) to service_role;
grant execute on function public.api_run_shop_closeout(uuid, date) to service_role;
grant execute on function public.api_run_due_closeouts() to service_role;
