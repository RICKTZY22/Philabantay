-- Phase 3 operational schema. These resources extend the canonical appointment
-- lifecycle; none of them bypasses or replaces appointments/appointment_events.

alter table public.appointment_events
  drop constraint if exists appointment_events_type;
alter table public.appointment_events
  add constraint appointment_events_type check (event_type in (
    'created', 'accepted', 'declined', 'checked_in', 'started', 'finished',
    'completion_confirmed', 'auto_completed', 'cancelled', 'customer_no_show',
    'disputed', 'dispute_resolved', 'expired', 'rescheduled', 'reassigned',
    'check_in_code_issued', 'change_proposed', 'change_approved',
    'change_rejected', 'change_conflict', 'delay_reported',
    'disruption_reported', 'no_show_appealed', 'no_show_appeal_resolved',
    'strike_waived'
  ));

alter table public.appointments
  add column booked_timezone text,
  add column booked_cancellation_cutoff_minutes integer not null default 120,
  add column late_policy_action boolean not null default false,
  add column no_show_appeal_deadline timestamptz,
  add constraint appointments_booked_timezone_length check (
    booked_timezone is null or char_length(booked_timezone) between 1 and 100
  ),
  add constraint appointments_cancellation_cutoff_range check (
    booked_cancellation_cutoff_minutes between 0 and 10080
  );

update public.appointments as appointment
set booked_timezone = coalesce(shop.timezone, 'Asia/Manila')
from public.shops as shop
where shop.id = appointment.shop_id
  and appointment.booked_timezone is null;

alter table public.appointments alter column booked_timezone set not null;

create or replace function private.snapshot_appointment_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(shop.timezone, 'Asia/Manila')
    into new.booked_timezone
    from public.shops as shop
    where shop.id = new.shop_id;
    new.booked_cancellation_cutoff_minutes := 120;
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_appointment_policy() from public, anon, authenticated;
drop trigger if exists appointments_snapshot_policy on public.appointments;
create trigger appointments_snapshot_policy
  before insert on public.appointments
  for each row execute function private.snapshot_appointment_policy();

create or replace function private.mark_late_appointment_policy_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('requested', 'confirmed')
    and (
      new.status = 'cancelled'
      or new.starts_at is distinct from old.starts_at
      or new.service_id is distinct from old.service_id
      or new.barber_id is distinct from old.barber_id
    )
    and now() > old.starts_at - make_interval(mins => old.booked_cancellation_cutoff_minutes)
  then
    new.late_policy_action := true;
  end if;
  return new;
end;
$$;
revoke all on function private.mark_late_appointment_policy_action() from public, anon, authenticated;
drop trigger if exists appointments_mark_late_policy_action on public.appointments;
create trigger appointments_mark_late_policy_action
  before update on public.appointments
  for each row execute function private.mark_late_appointment_policy_action();

create table public.appointment_change_proposals (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  proposed_by uuid not null references public.users(id) on delete restrict,
  proposed_by_role text not null check (proposed_by_role in ('barber', 'shop_owner')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'conflict', 'expired')),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  original_service_id uuid not null references public.services(id) on delete restrict,
  original_provider_id uuid not null references public.users(id) on delete restrict,
  original_starts_at timestamptz not null,
  original_service_name text not null,
  original_duration_min integer not null check (original_duration_min between 5 and 480),
  original_price_cents integer not null check (original_price_cents >= 0),
  proposed_service_id uuid not null references public.services(id) on delete restrict,
  proposed_provider_id uuid not null references public.users(id) on delete restrict,
  proposed_starts_at timestamptz not null,
  proposed_service_name text not null,
  proposed_duration_min integer not null check (proposed_duration_min between 5 and 480),
  proposed_price_cents integer not null check (proposed_price_cents >= 0),
  proposed_buffer_min integer not null check (proposed_buffer_min between 0 and 120),
  expires_at timestamptz not null,
  responded_at timestamptz,
  response_reason text check (response_reason is null or char_length(btrim(response_reason)) between 3 and 1000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index appointment_change_one_pending_idx
  on public.appointment_change_proposals (appointment_id) where status = 'pending';
create index appointment_change_customer_queue_idx
  on public.appointment_change_proposals (appointment_id, status, created_at desc);

create table public.appointment_delays (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  reported_by uuid not null references public.users(id) on delete restrict,
  category text not null check (category in ('provider_late', 'shop_delay', 'previous_service', 'other')),
  estimate_minutes integer not null check (estimate_minutes between 5 and 240),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  created_at timestamptz not null default now()
);
create index appointment_delays_appointment_idx on public.appointment_delays (appointment_id, created_at desc);

create table public.disruption_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  source_type text not null check (source_type in ('closure', 'provider_absence', 'service_deactivation', 'employment_end')),
  source_id uuid,
  local_date date,
  affected_count integer not null default 0 check (affected_count >= 0),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.appointment_attention_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  disruption_batch_id uuid references public.disruption_batches(id) on delete set null,
  kind text not null check (kind in ('disruption', 'change_conflict', 'closeout_unresolved', 'payment_mismatch', 'attendance_mismatch')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  suggested_alternatives jsonb not null default '[]'::jsonb check (jsonb_typeof(suggested_alternatives) = 'array'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (appointment_id, kind, disruption_batch_id)
);
create index appointment_attention_shop_idx on public.appointment_attention_items (shop_id, status, created_at desc);
create unique index appointment_attention_one_unbatched_idx
  on public.appointment_attention_items (appointment_id, kind)
  where disruption_batch_id is null;

create table public.no_show_appeals (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'upheld', 'expired')),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 2000),
  owner_reason text check (owner_reason is null or char_length(btrim(owner_reason)) between 3 and 1000),
  expires_at timestamptz not null default (now() + interval '7 days'),
  resolved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_strike_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  appeal_id uuid references public.no_show_appeals(id) on delete set null,
  event_type text not null check (event_type in ('upheld', 'waived', 'corrected')),
  actor_id uuid references public.users(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  created_at timestamptz not null default now()
);
create unique index customer_strike_one_upheld_idx
  on public.customer_strike_events (appointment_id) where event_type = 'upheld';
create index customer_strike_window_idx on public.customer_strike_events (customer_id, created_at desc);

create table public.walk_in_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete restrict,
  customer_user_id uuid references public.users(id) on delete set null,
  service_id uuid references public.services(id) on delete restrict,
  requested_barber_id uuid references public.users(id) on delete restrict,
  assigned_provider_id uuid references public.users(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  notes text check (notes is null or char_length(notes) <= 1000),
  queue_status text not null default 'waiting' check (queue_status in ('waiting', 'called', 'checked_in', 'in_service', 'attention', 'completed', 'cancelled')),
  quoted_at timestamptz not null default now(),
  checked_in_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  manually_verified boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index walk_in_shop_queue_idx on public.walk_in_entries (shop_id, queue_status, created_at);

create table public.guest_visit_claims (
  id uuid primary key default gen_random_uuid(),
  walk_in_id uuid not null unique references public.walk_in_entries(id) on delete cascade,
  normalized_phone_hash text,
  claim_token_hash text not null,
  token_expires_at timestamptz not null,
  otp_attempts integer not null default 0 check (otp_attempts between 0 and 10),
  verified_at timestamptz,
  single_use_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.queue_events (
  id uuid primary key default gen_random_uuid(),
  walk_in_id uuid not null references public.walk_in_entries(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_id uuid references public.users(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index queue_events_walk_in_idx on public.queue_events (walk_in_id, created_at, id);

create table public.shop_cashier_capabilities (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  active boolean not null default true,
  granted_by uuid not null references public.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (shop_id, user_id)
);

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete restrict,
  walk_in_id uuid references public.walk_in_entries(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete cascade,
  method text not null check (method in ('cash', 'card_terminal', 'ewallet', 'other_offline')),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'recorded' check (status in ('recorded', 'corrected', 'refunded', 'voided')),
  recorded_by uuid not null references public.users(id) on delete restrict,
  paid_at timestamptz not null,
  idempotency_key uuid not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recorded_by, idempotency_key),
  constraint payment_exactly_one_visit check ((appointment_id is null) <> (walk_in_id is null))
);
create unique index payment_one_active_idx on public.payment_records (appointment_id)
  where appointment_id is not null and status in ('recorded', 'corrected');
create unique index payment_one_active_walk_in_idx on public.payment_records (walk_in_id)
  where walk_in_id is not null and status in ('recorded', 'corrected');

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment_records(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete restrict,
  walk_in_id uuid references public.walk_in_entries(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete restrict,
  event_type text not null check (event_type in ('recorded', 'corrected', 'refunded', 'voided')),
  amount_delta_cents integer not null,
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 1000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint payment_event_exactly_one_visit check ((appointment_id is null) <> (walk_in_id is null))
);
create index payment_events_payment_idx on public.payment_events (payment_id, created_at, id);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  event_key text not null,
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 1000),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  required_operational boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'retry', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key)
);
create index notification_outbox_due_idx on public.notification_outbox (status, available_at)
  where status in ('pending', 'retry');

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  attempt integer not null check (attempt > 0),
  provider text not null,
  status text not null check (status in ('delivered', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  unique (outbox_id, attempt, provider)
);

create table public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique references public.notification_outbox(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index in_app_notification_recipient_idx on public.in_app_notifications (recipient_id, read_at, created_at desc);

create table public.closeout_runs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  local_date date not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  expired_count integer not null default 0,
  auto_completed_count integer not null default 0,
  attention_count integer not null default 0,
  lease_token uuid not null default gen_random_uuid(),
  leased_until timestamptz not null default (now() + interval '5 minutes'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  unique (shop_id, local_date)
);

-- Browser JWTs receive read-only participant views. Every mutation remains an
-- Express/service-role command and direct writes are denied by absence of grants.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'appointment_change_proposals', 'appointment_delays', 'disruption_batches',
    'appointment_attention_items', 'no_show_appeals', 'customer_strike_events',
    'walk_in_entries', 'guest_visit_claims', 'queue_events', 'shop_cashier_capabilities', 'payment_records',
    'payment_events', 'notification_outbox', 'notification_deliveries',
    'in_app_notifications', 'closeout_runs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;

grant select on public.appointment_change_proposals, public.appointment_delays,
  public.no_show_appeals, public.customer_strike_events, public.walk_in_entries,
  public.queue_events, public.shop_cashier_capabilities, public.payment_records, public.payment_events,
  public.in_app_notifications to authenticated;

create policy appointment_change_participant_read on public.appointment_change_proposals
  for select to authenticated using (exists (
    select 1 from public.appointments a where a.id = appointment_id
      and (a.customer_id = (select auth.uid()) or a.barber_id = (select auth.uid()) or private.owns_shop(a.shop_id))
  ));
create policy appointment_delay_participant_read on public.appointment_delays
  for select to authenticated using (exists (
    select 1 from public.appointments a where a.id = appointment_id
      and (a.customer_id = (select auth.uid()) or a.barber_id = (select auth.uid()) or private.owns_shop(a.shop_id))
  ));
create policy no_show_appeal_participant_read on public.no_show_appeals
  for select to authenticated using (customer_id = (select auth.uid()) or private.owns_shop(shop_id));
create policy customer_strike_self_read on public.customer_strike_events
  for select to authenticated using (customer_id = (select auth.uid()));
create policy walk_in_shop_staff_read on public.walk_in_entries
  for select to authenticated using (private.owns_shop(shop_id) or private.is_active_barber_for_shop(shop_id, (select auth.uid())) or customer_user_id = (select auth.uid()));
create policy queue_event_shop_staff_read on public.queue_events
  for select to authenticated using (private.owns_shop(shop_id) or private.is_active_barber_for_shop(shop_id, (select auth.uid())));
create policy cashier_capability_shop_read on public.shop_cashier_capabilities
  for select to authenticated using (private.owns_shop(shop_id) or user_id = (select auth.uid()));
create policy payment_participant_read on public.payment_records
  for select to authenticated using (private.owns_shop(shop_id) or exists (
    select 1 from public.appointments a where a.id = appointment_id and a.customer_id = (select auth.uid())
  ) or exists (
    select 1 from public.walk_in_entries w where w.id = walk_in_id and w.customer_user_id = (select auth.uid())
  ));
create policy payment_event_participant_read on public.payment_events
  for select to authenticated using (private.owns_shop(shop_id) or exists (
    select 1 from public.appointments a where a.id = appointment_id and a.customer_id = (select auth.uid())
  ) or exists (
    select 1 from public.walk_in_entries w where w.id = walk_in_id and w.customer_user_id = (select auth.uid())
  ));
create policy in_app_notification_self_read on public.in_app_notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
