-- Phase 4 P4-02: the support-case model.
--
-- Before this migration a dispute was two columns on `appointments`
-- (`dispute_opened_at`, `dispute_reason`) plus the `disputed` status. There was no
-- escalation, no admin queue, no assigned reviewer, no evidence that could be
-- kept out of the public appointment timeline, and no record of who *looked* at a
-- case. The phase plan requires all five.
--
-- One normalized model serves both appointment disputes and rating moderation, so
-- escalation and audit are written once. A rating report becomes a case only when
-- it needs a human decision beyond the shop.

-- Corrections are their own event type. Overturning an owner is not the same fact
-- as the owner deciding, and the timeline has to be able to say so.
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
    'strike_waived', 'dispute_escalated', 'dispute_corrected'
  ));

create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  -- Short and quotable, because a customer on the phone has to be able to read it
  -- out. Uniqueness is enforced here rather than assumed from the uuid.
  reference text not null unique check (reference ~ '^PB-[0-9A-F]{8}$'),
  kind text not null check (kind in ('appointment_dispute', 'rating_moderation')),
  shop_id uuid not null references public.shops(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  rating_report_id uuid references public.rating_reports(id) on delete cascade,
  opened_by uuid not null references public.users(id) on delete restrict,
  opened_by_role text not null check (opened_by_role in ('customer', 'barber', 'shop_owner')),
  subject text not null check (char_length(btrim(subject)) between 3 and 200),
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),
  status text not null default 'owner_review' check (status in (
    'owner_review', 'owner_decided', 'escalated', 'information_requested', 'resolved', 'withdrawn'
  )),
  -- Q13 windows. Stored as targets, presented as targets, never as guarantees.
  owner_response_due_at timestamptz not null,
  owner_decision text check (owner_decision in ('completed', 'cancelled', 'no_action')),
  owner_decision_reason text check (owner_decision_reason is null or char_length(btrim(owner_decision_reason)) between 3 and 2000),
  owner_decided_at timestamptz,
  escalation_deadline_at timestamptz,
  escalated_at timestamptz,
  escalation_reason text check (escalation_reason is null or char_length(btrim(escalation_reason)) between 3 and 2000),
  assigned_admin_id uuid references public.users(id) on delete set null,
  admin_target_at timestamptz,
  information_requested_at timestamptz,
  information_request_reason text,
  resolution text check (resolution in ('upheld_owner', 'overturned_owner', 'no_action', 'closed_no_response')),
  resolution_reason text check (resolution_reason is null or char_length(btrim(resolution_reason)) between 3 and 2000),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_case_subject_shape check (
    (kind = 'appointment_dispute' and appointment_id is not null and rating_report_id is null)
    or (kind = 'rating_moderation' and rating_report_id is not null and appointment_id is null)
  ),
  constraint support_case_resolution_shape check ((status = 'resolved') = (resolved_at is not null)),
  constraint support_case_decision_shape check ((owner_decision is null) = (owner_decided_at is null))
);
-- One live dispute per appointment. A resolved one does not block a new fact.
create unique index support_case_one_open_per_appointment_idx
  on public.support_cases (appointment_id)
  where appointment_id is not null and status <> 'resolved' and status <> 'withdrawn';
create unique index support_case_one_per_report_idx
  on public.support_cases (rating_report_id) where rating_report_id is not null;
-- The admin queue is exactly this index: escalated and information-requested only.
create index support_case_admin_queue_idx on public.support_cases (status, escalated_at)
  where status in ('escalated', 'information_requested');
create index support_case_shop_idx on public.support_cases (shop_id, status, created_at desc);
create index support_case_owner_due_idx on public.support_cases (owner_response_due_at)
  where status = 'owner_review';
create index support_case_escalation_due_idx on public.support_cases (escalation_deadline_at)
  where status = 'owner_decided';

create trigger support_cases_set_updated_at
  before update on public.support_cases
  for each row execute function private.set_updated_at();

create table public.case_participants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('customer', 'barber', 'shop_owner', 'admin')),
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (case_id, user_id)
);
create index case_participant_user_idx on public.case_participants (user_id, removed_at);

create table public.case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  author_role text not null check (author_role in ('customer', 'barber', 'shop_owner', 'admin')),
  -- V1 is text only. Attachments stay off until private storage, malware scan,
  -- content-type checks, retention, and authorization ship together (plan 3).
  note text not null check (char_length(btrim(note)) between 3 and 4000),
  -- `admin_only` never reaches the shop or the customer, and none of it reaches
  -- the public appointment timeline. That separation is why evidence lives here
  -- instead of in `appointment_events`.
  visibility text not null default 'case' check (visibility in ('case', 'admin_only')),
  created_at timestamptz not null default now()
);
create index case_evidence_case_idx on public.case_evidence (case_id, created_at);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  -- Same reason as `rating_events.seq`: one command appends several events and
  -- `now()` is the transaction timestamp, so ordering has to be explicit.
  seq bigint generated always as identity,
  case_id uuid not null references public.support_cases(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  actor_role text not null check (actor_role in ('customer', 'barber', 'shop_owner', 'admin', 'system')),
  event_type text not null check (event_type in (
    'opened', 'evidence_added', 'owner_decided', 'customer_accepted', 'escalated',
    'assigned', 'information_requested', 'resolved', 'withdrawn', 'accessed', 'correction_applied'
  )),
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 2000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index case_event_case_idx on public.case_events (case_id, seq);
-- Sensitive-access views are queried by actor for the audit surface, so they get
-- their own index rather than a scan of the whole log.
create index case_event_access_idx on public.case_events (actor_id, seq desc)
  where event_type = 'accessed';

create trigger case_events_immutable
  before update or delete on public.case_events
  for each row execute function private.reject_p3_event_mutation();
create trigger case_evidence_immutable
  before update or delete on public.case_evidence
  for each row execute function private.reject_p3_event_mutation();

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

do $$
declare
  target_table text;
begin
  foreach target_table in array array['support_cases', 'case_participants', 'case_evidence', 'case_events'] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon, authenticated', target_table);
    execute format('grant all on table public.%I to service_role', target_table);
  end loop;
end $$;

grant select on public.support_cases, public.case_participants to authenticated;

create policy support_case_participant_read on public.support_cases
  for select to authenticated
  using (
    opened_by = (select auth.uid())
    or private.owns_shop(shop_id)
    or exists (
      select 1 from public.case_participants as participant
      where participant.case_id = id
        and participant.user_id = (select auth.uid())
        and participant.removed_at is null
    )
  );
create policy case_participant_self_read on public.case_participants
  for select to authenticated using (user_id = (select auth.uid()));

-- `case_evidence` deliberately grants nothing to `authenticated`. Evidence is
-- only ever served through Express, which filters `admin_only` rows by actor.
-- A blanket read policy could not make that distinction safely.
