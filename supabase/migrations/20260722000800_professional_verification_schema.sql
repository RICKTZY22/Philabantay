-- P1-05 professional verification: durable workflow, evidence metadata,
-- capability grants, audit history, and the private Storage boundary.
--
-- This migration intentionally does not pretend that malware scanning or SMS
-- delivery exists.  Those facts are represented independently and approval
-- commands added by the next migration fail closed until they are real.

create type public.verification_submission_status as enum (
  'draft',
  'pending',
  'needs_information',
  'approved',
  'rejected',
  'withdrawn'
);

create type public.verification_document_type as enum (
  'government_id_front',
  'government_id_back',
  'selfie',
  'certificate',
  'portfolio',
  'business_registration',
  'proof_of_shop_control',
  'proof_of_business_address'
);

create type public.verification_document_status as enum (
  'awaiting_upload',
  'processing',
  'ready',
  'rejected',
  'superseded',
  'purged'
);

create type public.verification_content_status as enum (
  'pending',
  'valid',
  'invalid'
);

create type public.verification_malware_status as enum (
  'pending',
  'clean',
  'infected',
  'failed',
  'unavailable'
);

create type public.account_capability as enum (
  'professional_access',
  'verification_queue_read',
  'verification_assign',
  'verification_review',
  'professional_suspend'
);

create type public.account_capability_state as enum ('active', 'revoked');

alter table public.users
  add column authorization_version integer not null default 1,
  add constraint users_authorization_version_positive
    check (authorization_version > 0);

create table public.verification_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  requested_role public.onboarding_role not null,
  status public.verification_submission_status not null default 'draft',
  attempt_number integer not null,
  supersedes_submission_id uuid references public.verification_submissions(id) on delete restrict,
  legal_name text not null,
  form_schema_version smallint not null default 1,
  form_data jsonb not null default '{}'::jsonb,
  submission_round integer not null default 0,
  assigned_reviewer_id uuid references public.users(id) on delete restrict,
  assigned_by uuid references public.users(id) on delete restrict,
  assigned_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete restrict,
  retry_after timestamptz,
  applicant_reason_code text,
  applicant_message text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_submissions_professional_role
    check (requested_role in ('barber', 'shop_owner')),
  constraint verification_submissions_attempt_positive check (attempt_number > 0),
  constraint verification_submissions_round_nonnegative check (submission_round >= 0),
  constraint verification_submissions_version_positive check (version > 0),
  constraint verification_submissions_schema_version check (form_schema_version = 1),
  constraint verification_submissions_legal_name_length
    check (char_length(btrim(legal_name)) between 1 and 120),
  constraint verification_submissions_form_object
    check (jsonb_typeof(form_data) = 'object'),
  constraint verification_submissions_form_size
    check (octet_length(form_data::text) <= 32768),
  constraint verification_submissions_applicant_message_length
    check (applicant_message is null or char_length(applicant_message) <= 2000),
  constraint verification_submissions_reason_length
    check (applicant_reason_code is null or char_length(applicant_reason_code) <= 80),
  constraint verification_submissions_reviewer_not_applicant
    check (assigned_reviewer_id is null or assigned_reviewer_id <> user_id),
  constraint verification_submissions_decider_not_applicant
    check (reviewed_by is null or reviewed_by <> user_id),
  constraint verification_submissions_not_self_superseding
    check (supersedes_submission_id is null or supersedes_submission_id <> id),
  constraint verification_submissions_assignment_consistent check (
    (assigned_reviewer_id is null and assigned_by is null and assigned_at is null)
    or
    (assigned_reviewer_id is not null and assigned_by is not null and assigned_at is not null)
  ),
  constraint verification_submissions_state_timestamps check (
    (status = 'draft' and submitted_at is null and reviewed_at is null and reviewed_by is null)
    or
    (status in ('pending', 'needs_information') and submitted_at is not null and reviewed_at is null and reviewed_by is null)
    or
    (status in ('approved', 'rejected') and submitted_at is not null and reviewed_at is not null and reviewed_by is not null)
    or
    (status = 'withdrawn' and reviewed_at is null and reviewed_by is null)
  ),
  constraint verification_submissions_attempt_unique
    unique (user_id, requested_role, attempt_number)
);

create unique index verification_submissions_one_active
  on public.verification_submissions (user_id, requested_role)
  where status in ('draft', 'pending', 'needs_information');

create unique index verification_submissions_one_approved
  on public.verification_submissions (user_id, requested_role)
  where status = 'approved';

create index verification_submissions_queue
  on public.verification_submissions (status, submitted_at, id);

create index verification_submissions_assigned_queue
  on public.verification_submissions (assigned_reviewer_id, status, submitted_at, id);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.verification_submissions(id) on delete restrict,
  document_type public.verification_document_type not null,
  storage_path text unique,
  status public.verification_document_status not null default 'awaiting_upload',
  declared_mime text,
  declared_size_bytes bigint,
  detected_mime text,
  size_bytes bigint,
  sha256 bytea,
  content_status public.verification_content_status not null default 'pending',
  malware_status public.verification_malware_status not null default 'pending',
  scanner_provider text,
  scanner_reference text,
  uploaded_at timestamptz,
  validated_at timestamptz,
  scanned_at timestamptz,
  purge_after timestamptz,
  purged_at timestamptz,
  legal_hold_at timestamptz,
  legal_hold_by uuid references public.users(id) on delete restrict,
  legal_hold_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint verification_documents_version_positive check (version > 0),
  constraint verification_documents_declared_size check (
    declared_size_bytes is null or declared_size_bytes between 1 and 10485760
  ),
  constraint verification_documents_actual_size check (
    size_bytes is null or size_bytes between 1 and 10485760
  ),
  constraint verification_documents_mime_length check (
    (declared_mime is null or char_length(declared_mime) <= 120)
    and (detected_mime is null or char_length(detected_mime) <= 120)
  ),
  constraint verification_documents_scanner_length check (
    (scanner_provider is null or char_length(scanner_provider) <= 120)
    and (scanner_reference is null or char_length(scanner_reference) <= 240)
  ),
  constraint verification_documents_legal_hold_consistent check (
    (legal_hold_at is null and legal_hold_by is null and legal_hold_reason is null)
    or
    (legal_hold_at is not null and legal_hold_by is not null
      and char_length(btrim(legal_hold_reason)) between 3 and 1000)
  ),
  constraint verification_documents_purged_metadata check (
    status <> 'purged'
    or (purged_at is not null and storage_path is null and sha256 is null)
  )
);

create unique index verification_documents_one_current_type
  on public.verification_documents (submission_id, document_type)
  where status not in ('superseded', 'purged');

create index verification_documents_submission
  on public.verification_documents (submission_id, status, document_type, id);

create index verification_documents_due_purge
  on public.verification_documents (purge_after, id)
  where purge_after is not null and purged_at is null and legal_hold_at is null;

create table public.verification_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.verification_submissions(id) on delete restrict,
  applicant_id uuid not null references public.users(id) on delete restrict,
  actor_id uuid references public.users(id) on delete restrict,
  actor_role text not null,
  event_type text not null,
  from_status public.verification_submission_status,
  to_status public.verification_submission_status,
  public_reason_code text,
  public_message text,
  private_reason_code text,
  private_note text,
  metadata jsonb not null default '{}'::jsonb,
  command_id uuid not null unique,
  command_kind text not null,
  command_hash bytea not null,
  request_id uuid,
  created_at timestamptz not null default now(),
  constraint verification_events_actor_role check (
    actor_role in ('customer', 'barber', 'shop_owner', 'admin', 'system')
  ),
  constraint verification_events_event_type_length
    check (char_length(btrim(event_type)) between 1 and 120),
  constraint verification_events_command_kind_length
    check (char_length(btrim(command_kind)) between 1 and 120),
  constraint verification_events_reason_lengths check (
    (public_reason_code is null or char_length(public_reason_code) <= 80)
    and (private_reason_code is null or char_length(private_reason_code) <= 120)
  ),
  constraint verification_events_note_lengths check (
    (public_message is null or char_length(public_message) <= 2000)
    and (private_note is null or char_length(private_note) <= 4000)
  ),
  constraint verification_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint verification_events_metadata_size check (octet_length(metadata::text) <= 16384)
);

create index verification_events_submission_timeline
  on public.verification_events (submission_id, created_at, id);

create table public.account_capabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  shop_id uuid references public.shops(id) on delete restrict,
  capability public.account_capability not null,
  state public.account_capability_state not null,
  granted_by uuid references public.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  version integer not null default 1,
  constraint account_capabilities_phase_one_global check (shop_id is null),
  constraint account_capabilities_version_positive check (version > 0),
  constraint account_capabilities_state_consistent check (
    (state = 'active' and revoked_by is null and revoked_at is null)
    or
    (state = 'revoked' and revoked_at is not null)
  )
);

create unique index account_capabilities_one_active_grant
  on public.account_capabilities (user_id, capability, coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state = 'active';

create index account_capabilities_user_state
  on public.account_capabilities (user_id, state, capability);

-- Command results are intentionally private.  They let commands distinguish a
-- safe retry from command-id reuse with a different payload and replay the
-- completed result without trusting a browser-supplied idempotency claim.
create table private.verification_command_results (
  command_id uuid primary key,
  command_kind text not null,
  actor_id uuid,
  target_id uuid,
  command_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint verification_command_results_kind_length
    check (char_length(btrim(command_kind)) between 1 and 120),
  constraint verification_command_results_result_object
    check (jsonb_typeof(result) = 'object')
);

revoke all on table private.verification_command_results
  from public, anon, authenticated, service_role;

create or replace function private.set_verification_submission_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger verification_submissions_set_updated_at
  before update on public.verification_submissions
  for each row execute function private.set_verification_submission_updated_at();

create or replace function private.enforce_verification_submission_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(new.user_id, new.requested_role, new.attempt_number, new.supersedes_submission_id, new.created_at)
     is distinct from
     row(old.user_id, old.requested_role, old.attempt_number, old.supersedes_submission_id, old.created_at) then
    raise exception using errcode = '42501', message = 'Verification submission identity is immutable.';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('pending', 'withdrawn'))
    or (old.status = 'pending' and new.status in ('needs_information', 'approved', 'rejected', 'withdrawn'))
    or (old.status = 'needs_information' and new.status in ('pending', 'withdrawn'))
  ) then
    raise exception using errcode = '23514', message = 'Invalid verification submission transition.';
  end if;

  if old.status not in ('draft', 'needs_information') and (
    new.legal_name is distinct from old.legal_name
    or new.form_schema_version is distinct from old.form_schema_version
    or new.form_data is distinct from old.form_data
  ) then
    raise exception using errcode = '42501', message = 'Submitted verification details are immutable.';
  end if;

  if old.status in ('approved', 'rejected', 'withdrawn') and new is distinct from old then
    raise exception using errcode = '42501', message = 'Terminal verification history is immutable.';
  end if;

  return new;
end;
$$;

create trigger verification_submissions_enforce_transition
  before update on public.verification_submissions
  for each row execute function private.enforce_verification_submission_transition();

create or replace function private.reject_verification_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Verification events are append-only.';
end;
$$;

create trigger verification_events_no_update_delete
  before update or delete on public.verification_events
  for each row execute function private.reject_verification_event_mutation();

create trigger verification_events_no_truncate
  before truncate on public.verification_events
  for each statement execute function private.reject_verification_event_mutation();

create or replace function private.has_account_capability(
  p_user_id uuid,
  p_capability public.account_capability,
  p_shop_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_capabilities as grant_row
    where grant_row.user_id = p_user_id
      and grant_row.capability = p_capability
      and grant_row.state = 'active'
      and grant_row.shop_id is not distinct from p_shop_id
  );
$$;

create or replace function private.is_assigned_verification_reviewer(
  p_submission_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.verification_submissions as submission
    where submission.id = p_submission_id
      and submission.assigned_reviewer_id = p_user_id
  );
$$;

create or replace function private.can_upload_verification_object(
  p_storage_path text,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.verification_documents as document
    join public.verification_submissions as submission
      on submission.id = document.submission_id
    where document.storage_path = p_storage_path
      and document.status = 'awaiting_upload'
      and submission.user_id = p_user_id
      and submission.status in ('draft', 'needs_information')
      and split_part(p_storage_path, '/', 1) = p_user_id::text
      and split_part(p_storage_path, '/', 2) = submission.id::text
      and split_part(p_storage_path, '/', 3) = document.id::text
      and split_part(p_storage_path, '/', 4) = 'blob'
      and split_part(p_storage_path, '/', 5) = ''
  );
$$;

alter table public.verification_submissions enable row level security;
alter table public.verification_submissions force row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_documents force row level security;
alter table public.verification_events enable row level security;
alter table public.verification_events force row level security;
alter table public.account_capabilities enable row level security;
alter table public.account_capabilities force row level security;

revoke all on table public.verification_submissions from public, anon, authenticated;
revoke all on table public.verification_documents from public, anon, authenticated;
revoke all on table public.verification_events from public, anon, authenticated;
revoke all on table public.account_capabilities from public, anon, authenticated;

-- Express needs allowlisted reads.  All writes happen only through the
-- SECURITY DEFINER command functions in the following migrations.
revoke all on table public.verification_submissions from service_role;
revoke all on table public.verification_documents from service_role;
revoke all on table public.verification_events from service_role;
revoke all on table public.account_capabilities from service_role;
grant select on table public.verification_submissions to service_role;
grant select on table public.verification_documents to service_role;
grant select on table public.verification_events to service_role;
grant select on table public.account_capabilities to service_role;

revoke all on function private.has_account_capability(uuid, public.account_capability, uuid)
  from public, anon, authenticated;
revoke all on function private.is_assigned_verification_reviewer(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_upload_verification_object(text, uuid)
  from public, anon, authenticated;
grant execute on function private.has_account_capability(uuid, public.account_capability, uuid)
  to service_role;
grant execute on function private.is_assigned_verification_reviewer(uuid, uuid)
  to service_role;
grant execute on function private.can_upload_verification_object(text, uuid)
  to service_role;

-- Correct the legacy self-profile read grant.  Browser JWTs may read only
-- non-privileged profile columns; Express uses service_role for the trusted
-- Profile projection.
revoke select on table public.users from authenticated;
grant select (
  id,
  onboarding_completed,
  full_name,
  email,
  phone,
  location,
  avatar_url,
  created_at,
  updated_at
) on table public.users to authenticated;

-- Private evidence bucket.  Signed upload grants are issued only after a
-- document row with the exact opaque path has been registered.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'verification-evidence',
  'verification-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists verification_evidence_insert_registered on storage.objects;
create policy verification_evidence_insert_registered
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-evidence'
    and private.can_upload_verification_object(name, (select auth.uid()))
  );

-- There are deliberately no authenticated SELECT/UPDATE/DELETE policies for
-- evidence objects.  Viewing, replacement, and purge go through Express.
