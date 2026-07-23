-- P1-05 administrator and worker commands.  Express enforces verified JWT AAL2
-- before every admin route; these transactions independently enforce role,
-- active capability, exact reviewer assignment, versions, and evidence state.

-- Two-phase purge metadata. Claiming blocks signed views immediately; the
-- worker deletes the object before finalizing the metadata tombstone.
alter table public.verification_documents
  add column purge_claim_id uuid,
  add column purge_claimed_at timestamptz,
  add constraint verification_documents_purge_claim_consistent check (
    (purge_claim_id is null and purge_claimed_at is null)
    or (purge_claim_id is not null and purge_claimed_at is not null)
  );

create or replace function private.require_verification_admin_capability(
  p_actor_id uuid,
  p_capability public.account_capability
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.users as profile
    join public.account_capabilities as capability
      on capability.user_id = profile.id
    where profile.id = p_actor_id
      and profile.role = 'admin'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
      and capability.capability = p_capability
      and capability.shop_id is null
      and capability.state = 'active'
  ) then
    raise exception using
      errcode = 'P4031',
      message = 'The required administrator capability is not active.';
  end if;

  perform 1
  from public.users as profile
  where profile.id = p_actor_id
  for key share;

  perform 1
  from public.account_capabilities as capability
  where capability.user_id = p_actor_id
    and capability.capability = p_capability
    and capability.shop_id is null
    and capability.state = 'active'
  for key share;
end;
$$;

create or replace function private.has_required_clean_verification_documents(
  p_submission_id uuid,
  p_role public.onboarding_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_clean as (
    select document.document_type
    from public.verification_documents as document
    where document.submission_id = p_submission_id
      and document.status = 'ready'
      and document.content_status = 'valid'
      and document.malware_status = 'clean'
  )
  select
    exists (select 1 from current_clean where document_type = 'government_id_front')
    and exists (select 1 from current_clean where document_type = 'selfie')
    and (
      p_role = 'barber'
      or exists (
        select 1
        from current_clean
        where document_type in ('proof_of_shop_control', 'proof_of_business_address')
      )
    );
$$;

create or replace function private.is_safe_verification_reason(p_reason text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_reason in (
    'documents_unreadable',
    'details_do_not_match',
    'missing_information',
    'shop_control_not_confirmed',
    'eligibility_not_met',
    'unable_to_verify'
  );
$$;

create or replace function public.api_assign_verification_reviewer(
  p_actor_id uuid,
  p_submission_id uuid,
  p_reviewer_id uuid,
  p_expected_version integer,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'submission_id', p_submission_id,
        'reviewer_id', p_reviewer_id,
        'expected_version', p_expected_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'assign_verification_reviewer', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  perform private.require_verification_admin_capability(p_actor_id, 'verification_assign');
  if p_reviewer_id = p_actor_id then
    -- Self-assignment is permitted only when the assigner also has the review
    -- capability; applicant separation is checked independently below.
    perform private.require_verification_admin_capability(p_actor_id, 'verification_review');
  elsif not exists (
    select 1
    from public.users as reviewer
    join public.account_capabilities as capability
      on capability.user_id = reviewer.id
    where reviewer.id = p_reviewer_id
      and reviewer.role = 'admin'
      and reviewer.verification_status = 'verified'
      and capability.capability = 'verification_review'
      and capability.state = 'active'
      and capability.shop_id is null
  ) then
    raise exception using errcode = 'P4031', message = 'The selected reviewer is not eligible.';
  end if;

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status <> 'pending' then raise exception using errcode = 'P4097', message = 'Only a pending request can be assigned.'; end if;
  if submission.user_id = p_reviewer_id then raise exception using errcode = '42501', message = 'An applicant cannot review their own request.'; end if;

  update public.verification_submissions
  set assigned_reviewer_id = p_reviewer_id,
      assigned_by = p_actor_id,
      assigned_at = now(),
      version = version + 1
  where id = p_submission_id
  returning * into submission;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, submission.user_id, p_actor_id, 'admin',
    'verification_reviewer_assigned', 'pending', 'pending',
    jsonb_build_object('reviewer_id', p_reviewer_id),
    p_command_id, 'assign_verification_reviewer', command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission));
  perform private.store_verification_command(
    p_command_id, 'assign_verification_reviewer', p_actor_id,
    submission.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_request_verification_information(
  p_actor_id uuid,
  p_submission_id uuid,
  p_expected_version integer,
  p_public_reason_code text,
  p_public_message text,
  p_information_items jsonb,
  p_private_note text,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if not private.is_safe_verification_reason(p_public_reason_code)
     or char_length(btrim(p_public_message)) not between 3 and 2000
     or jsonb_typeof(p_information_items) <> 'array'
     or jsonb_array_length(p_information_items) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'The information request is invalid.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'submission_id', p_submission_id,
        'expected_version', p_expected_version,
        'public_reason_code', p_public_reason_code,
        'public_message', btrim(p_public_message),
        'information_items', p_information_items,
        'private_note', p_private_note
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'request_verification_information', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  perform private.require_verification_admin_capability(p_actor_id, 'verification_review');
  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status <> 'pending' then raise exception using errcode = 'P4097', message = 'Only a pending request can request more information.'; end if;
  if submission.assigned_reviewer_id <> p_actor_id then raise exception using errcode = '42501', message = 'Only the assigned reviewer can change this request.'; end if;

  update public.verification_submissions
  set status = 'needs_information',
      applicant_reason_code = p_public_reason_code,
      applicant_message = btrim(p_public_message),
      version = version + 1
  where id = p_submission_id
  returning * into submission;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, public_reason_code, public_message,
    private_note, metadata, command_id, command_kind, command_hash, request_id
  ) values (
    submission.id, submission.user_id, p_actor_id, 'admin',
    'verification_information_requested', 'pending', 'needs_information',
    p_public_reason_code, btrim(p_public_message), nullif(btrim(p_private_note), ''),
    jsonb_build_object('information_items', p_information_items),
    p_command_id, 'request_verification_information', command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission));
  perform private.store_verification_command(
    p_command_id, 'request_verification_information', p_actor_id,
    submission.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_approve_verification(
  p_actor_id uuid,
  p_submission_id uuid,
  p_expected_version integer,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.verification_submissions%rowtype;
  applicant public.users%rowtype;
  auth_identity auth.users%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object('submission_id', p_submission_id, 'expected_version', p_expected_version)::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'approve_verification', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  perform private.require_verification_admin_capability(p_actor_id, 'verification_review');

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status <> 'pending' then raise exception using errcode = 'P4097', message = 'Only a pending request can be approved.'; end if;
  if submission.assigned_reviewer_id <> p_actor_id then raise exception using errcode = '42501', message = 'Only the assigned reviewer can approve this request.'; end if;
  if submission.user_id = p_actor_id then raise exception using errcode = '42501', message = 'An applicant cannot approve their own request.'; end if;

  select profile.* into applicant
  from public.users as profile
  where profile.id = submission.user_id
  for update;
  if applicant.requested_role <> submission.requested_role
     or applicant.role <> 'customer'
     or applicant.verification_status <> 'pending' then
    raise exception using errcode = 'P4097', message = 'The applicant profile no longer matches this request.';
  end if;

  select identity.* into auth_identity
  from auth.users as identity
  where identity.id = applicant.id
  for key share;
  if auth_identity.email_confirmed_at is null then
    raise exception using errcode = 'P4098', message = 'The applicant email address is not confirmed.';
  end if;
  if auth_identity.phone_confirmed_at is null
     or nullif(auth_identity.phone, '') is null
     or applicant.phone is distinct from auth_identity.phone then
    raise exception using errcode = 'P4098', message = 'The professional phone number is not confirmed.';
  end if;
  if not private.has_required_clean_verification_documents(submission.id, submission.requested_role) then
    raise exception using errcode = 'P4098', message = 'Required evidence is missing, rejected, or not malware-clean.';
  end if;

  update public.verification_submissions
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = p_actor_id,
      applicant_reason_code = null,
      applicant_message = null,
      version = version + 1
  where id = p_submission_id
  returning * into submission;

  update public.users
  set role = submission.requested_role::text::public.user_role,
      verification_status = 'verified',
      authorization_version = authorization_version + 1
  where id = applicant.id
  returning * into applicant;

  if submission.requested_role = 'barber' then
    insert into public.barbers (id, shift_status, accepting_bookings)
    values (applicant.id, 'off', false)
    on conflict (id) do nothing;
  end if;

  insert into public.account_capabilities (
    user_id, shop_id, capability, state, granted_by, granted_at
  ) values (
    applicant.id, null, 'professional_access', 'active', p_actor_id, now()
  );

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, applicant.id, p_actor_id, 'admin',
    'verification_approved', 'pending', 'approved', '{}'::jsonb,
    p_command_id, 'approve_verification', command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission), 'profile', to_jsonb(applicant));
  perform private.store_verification_command(
    p_command_id, 'approve_verification', p_actor_id,
    submission.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_reject_verification(
  p_actor_id uuid,
  p_submission_id uuid,
  p_expected_version integer,
  p_public_reason_code text,
  p_public_message text,
  p_private_reason_code text,
  p_private_note text,
  p_retry_after timestamptz,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if not private.is_safe_verification_reason(p_public_reason_code)
     or char_length(btrim(p_public_message)) not between 3 and 2000
     or p_retry_after is not null and p_retry_after <= now() then
    raise exception using errcode = '22023', message = 'The rejection decision is invalid.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'submission_id', p_submission_id,
        'expected_version', p_expected_version,
        'public_reason_code', p_public_reason_code,
        'public_message', btrim(p_public_message),
        'private_reason_code', p_private_reason_code,
        'private_note', p_private_note,
        'retry_after', p_retry_after
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'reject_verification', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  perform private.require_verification_admin_capability(p_actor_id, 'verification_review');
  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status <> 'pending' then raise exception using errcode = 'P4097', message = 'Only a pending request can be rejected.'; end if;
  if submission.assigned_reviewer_id <> p_actor_id then raise exception using errcode = '42501', message = 'Only the assigned reviewer can reject this request.'; end if;

  update public.verification_submissions
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = p_actor_id,
      retry_after = p_retry_after,
      applicant_reason_code = p_public_reason_code,
      applicant_message = btrim(p_public_message),
      version = version + 1
  where id = p_submission_id
  returning * into submission;

  update public.users
  set role = 'customer',
      verification_status = 'rejected',
      authorization_version = authorization_version + 1
  where id = submission.user_id;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, public_reason_code, public_message,
    private_reason_code, private_note, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, submission.user_id, p_actor_id, 'admin',
    'verification_rejected', 'pending', 'rejected',
    p_public_reason_code, btrim(p_public_message),
    nullif(btrim(p_private_reason_code), ''), nullif(btrim(p_private_note), ''),
    jsonb_build_object('retry_after', p_retry_after),
    p_command_id, 'reject_verification', command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission));
  perform private.store_verification_command(
    p_command_id, 'reject_verification', p_actor_id,
    submission.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_record_verification_evidence_view(
  p_actor_id uuid,
  p_submission_id uuid,
  p_document_id uuid,
  p_admin_view boolean,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.verification_submissions%rowtype;
  document public.verification_documents%rowtype;
  actor_profile public.users%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'submission_id', p_submission_id,
        'document_id', p_document_id,
        'admin_view', p_admin_view
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'record_verification_evidence_view', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select profile.* into actor_profile
  from public.users as profile where profile.id = p_actor_id for key share;
  if not found then raise exception using errcode = 'P0002', message = 'Viewer profile not found.'; end if;

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id for key share;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;

  if p_admin_view then
    perform private.require_verification_admin_capability(p_actor_id, 'verification_review');
    if submission.assigned_reviewer_id <> p_actor_id then
      raise exception using errcode = '42501', message = 'Only the assigned reviewer can view this evidence.';
    end if;
  elsif submission.user_id <> p_actor_id then
    raise exception using errcode = '42501', message = 'Verification evidence access denied.';
  end if;

  select current_document.* into document
  from public.verification_documents as current_document
  where current_document.id = p_document_id
    and current_document.submission_id = p_submission_id
    and current_document.storage_path is not null
    and current_document.status not in ('superseded', 'purged')
    and current_document.purge_claimed_at is null
  for key share;
  if not found then raise exception using errcode = 'P0002', message = 'Verification evidence not found.'; end if;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, submission.user_id, p_actor_id, actor_profile.role::text,
    case when p_admin_view then 'verification_evidence_viewed_by_reviewer'
      else 'verification_evidence_viewed_by_applicant' end,
    submission.status, submission.status,
    jsonb_build_object('document_id', document.id, 'document_type', document.document_type),
    p_command_id, 'record_verification_evidence_view', command_hash, p_request_id
  );

  result := jsonb_build_object(
    'document_id', document.id,
    'storage_path', document.storage_path
  );
  perform private.store_verification_command(
    p_command_id, 'record_verification_evidence_view', p_actor_id,
    document.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_record_verification_scan(
  p_document_id uuid,
  p_malware_status public.verification_malware_status,
  p_scanner_provider text,
  p_scanner_reference text,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  document public.verification_documents%rowtype;
  submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if p_malware_status not in ('clean', 'infected', 'failed', 'unavailable')
     or char_length(btrim(p_scanner_provider)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Scanner result is invalid.';
  end if;
  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'document_id', p_document_id,
        'malware_status', p_malware_status,
        'scanner_provider', p_scanner_provider,
        'scanner_reference', p_scanner_reference
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'record_verification_scan', null, command_hash
  );
  if replay is not null then return replay; end if;

  select current_document.* into document
  from public.verification_documents as current_document
  where current_document.id = p_document_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification document not found.'; end if;
  if document.status in ('superseded', 'purged') or document.content_status <> 'valid' then
    raise exception using errcode = 'P4097', message = 'This document cannot receive a scanner result.';
  end if;

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = document.submission_id for key share;

  update public.verification_documents
  set malware_status = p_malware_status,
      status = case when p_malware_status = 'infected' then 'rejected' else status end,
      scanner_provider = btrim(p_scanner_provider),
      scanner_reference = nullif(btrim(p_scanner_reference), ''),
      scanned_at = now(),
      version = version + 1
  where id = p_document_id
  returning * into document;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, public_reason_code, metadata, command_id,
    command_kind, command_hash, request_id
  ) values (
    submission.id, submission.user_id, null, 'system',
    'verification_evidence_scanned', submission.status, submission.status,
    case when p_malware_status = 'infected' then 'documents_unreadable' else null end,
    jsonb_build_object('document_id', document.id, 'malware_status', p_malware_status),
    p_command_id, 'record_verification_scan', command_hash, p_request_id
  );

  result := jsonb_build_object('document', to_jsonb(document));
  perform private.store_verification_command(
    p_command_id, 'record_verification_scan', null,
    document.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_suspend_professional(
  p_actor_id uuid,
  p_user_id uuid,
  p_expected_authorization_version integer,
  p_public_reason_code text,
  p_public_message text,
  p_private_reason_code text,
  p_private_note text,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.users%rowtype;
  approved_submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if not private.is_safe_verification_reason(p_public_reason_code)
     or char_length(btrim(p_public_message)) not between 3 and 2000 then
    raise exception using errcode = '22023', message = 'The suspension reason is invalid.';
  end if;
  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'user_id', p_user_id,
        'expected_authorization_version', p_expected_authorization_version,
        'public_reason_code', p_public_reason_code,
        'public_message', btrim(p_public_message),
        'private_reason_code', p_private_reason_code,
        'private_note', p_private_note
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'suspend_professional', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;
  perform private.require_verification_admin_capability(p_actor_id, 'professional_suspend');

  select profile.* into target from public.users as profile where profile.id = p_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'Professional account not found.'; end if;
  if target.role = 'barber' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('appointment:barber:' || p_user_id::text, 0)
    );
  end if;
  select profile.* into target
  from public.users as profile where profile.id = p_user_id for update;
  if target.authorization_version <> p_expected_authorization_version then raise exception using errcode = 'P4095', message = 'The professional access record changed. Reload and try again.'; end if;
  if target.role not in ('barber', 'shop_owner') or target.verification_status <> 'verified' then raise exception using errcode = 'P4097', message = 'Only a verified professional can be suspended.'; end if;

  select submission.* into approved_submission
  from public.verification_submissions as submission
  where submission.user_id = p_user_id
    and submission.requested_role = target.requested_role
    and submission.status = 'approved'
  for key share;
  if not found then raise exception using errcode = 'P4097', message = 'The professional has no approved verification history.'; end if;

  update public.account_capabilities
  set state = 'revoked',
      revoked_by = p_actor_id,
      revoked_at = now(),
      version = version + 1
  where user_id = p_user_id
    and capability = 'professional_access'
    and shop_id is null
    and state = 'active';
  if not found then raise exception using errcode = 'P4097', message = 'Professional access is not active.'; end if;

  update public.users
  set verification_status = 'suspended',
      authorization_version = authorization_version + 1
  where id = p_user_id
  returning * into target;

  if target.role = 'barber' then
    update public.barbers
    set shift_status = 'off', accepting_bookings = false
    where id = target.id;
  end if;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, public_reason_code, public_message,
    private_reason_code, private_note, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    approved_submission.id, target.id, p_actor_id, 'admin',
    'professional_suspended', 'approved', 'approved',
    p_public_reason_code, btrim(p_public_message),
    nullif(btrim(p_private_reason_code), ''), nullif(btrim(p_private_note), ''),
    '{}'::jsonb, p_command_id, 'suspend_professional', command_hash, p_request_id
  );

  result := jsonb_build_object('profile', to_jsonb(target));
  perform private.store_verification_command(
    p_command_id, 'suspend_professional', p_actor_id,
    target.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_restore_professional(
  p_actor_id uuid,
  p_user_id uuid,
  p_expected_authorization_version integer,
  p_public_message text,
  p_private_note text,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.users%rowtype;
  approved_submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if char_length(btrim(p_public_message)) not between 3 and 2000 then
    raise exception using errcode = '22023', message = 'The restoration note is invalid.';
  end if;
  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'user_id', p_user_id,
        'expected_authorization_version', p_expected_authorization_version,
        'public_message', btrim(p_public_message),
        'private_note', p_private_note
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'restore_professional', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;
  perform private.require_verification_admin_capability(p_actor_id, 'professional_suspend');

  select profile.* into target from public.users as profile where profile.id = p_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'Professional account not found.'; end if;
  if target.role = 'barber' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('appointment:barber:' || p_user_id::text, 0)
    );
  end if;
  select profile.* into target
  from public.users as profile where profile.id = p_user_id for update;
  if target.authorization_version <> p_expected_authorization_version then raise exception using errcode = 'P4095', message = 'The professional access record changed. Reload and try again.'; end if;
  if target.role not in ('barber', 'shop_owner') or target.verification_status <> 'suspended' then raise exception using errcode = 'P4097', message = 'Only a suspended professional can be restored.'; end if;

  select submission.* into approved_submission
  from public.verification_submissions as submission
  where submission.user_id = p_user_id
    and submission.requested_role = target.requested_role
    and submission.status = 'approved'
  for key share;
  if not found then raise exception using errcode = 'P4097', message = 'The professional has no approved verification history.'; end if;

  insert into public.account_capabilities (
    user_id, shop_id, capability, state, granted_by, granted_at
  ) values (
    p_user_id, null, 'professional_access', 'active', p_actor_id, now()
  );

  update public.users
  set verification_status = 'verified',
      authorization_version = authorization_version + 1
  where id = p_user_id
  returning * into target;

  if target.role = 'barber' then
    update public.barbers
    set shift_status = 'off', accepting_bookings = false
    where id = target.id;
  end if;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, public_message, private_note, metadata,
    command_id, command_kind, command_hash, request_id
  ) values (
    approved_submission.id, target.id, p_actor_id, 'admin',
    'professional_restored', 'approved', 'approved',
    btrim(p_public_message), nullif(btrim(p_private_note), ''), '{}'::jsonb,
    p_command_id, 'restore_professional', command_hash, p_request_id
  );

  result := jsonb_build_object('profile', to_jsonb(target));
  perform private.store_verification_command(
    p_command_id, 'restore_professional', p_actor_id,
    target.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_claim_due_verification_evidence(
  p_limit integer,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_hash bytea;
  replay jsonb;
  jobs jsonb;
  result jsonb;
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Purge batch limit must be between 1 and 100.';
  end if;
  command_hash := extensions.digest(
    pg_catalog.convert_to(jsonb_build_object('limit', p_limit)::text, 'UTF8'),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'claim_due_verification_evidence', null, command_hash
  );
  if replay is not null then return replay; end if;

  with due as (
    select document.id
    from public.verification_documents as document
    where document.purge_after is not null
      and document.purge_after <= now()
      and document.purged_at is null
      and document.storage_path is not null
      and document.legal_hold_at is null
      and document.purge_claimed_at is null
    order by document.purge_after, document.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.verification_documents as document
    set purge_claim_id = p_command_id,
        purge_claimed_at = now(),
        version = version + 1
    from due
    where document.id = due.id
    returning document.id, document.submission_id, document.storage_path
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'document_id', id,
    'submission_id', submission_id,
    'storage_path', storage_path
  )), '[]'::jsonb)
  into jobs
  from claimed;

  result := jsonb_build_object('claim_id', p_command_id, 'jobs', jobs);
  perform private.store_verification_command(
    p_command_id, 'claim_due_verification_evidence', null,
    null, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_finalize_verification_evidence_purge(
  p_document_id uuid,
  p_claim_id uuid,
  p_expected_storage_path text,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  document public.verification_documents%rowtype;
  submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  command_hash := extensions.digest(
    pg_catalog.convert_to(jsonb_build_object(
      'document_id', p_document_id,
      'claim_id', p_claim_id,
      'expected_storage_path', p_expected_storage_path
    )::text, 'UTF8'),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'finalize_verification_evidence_purge', null, command_hash
  );
  if replay is not null then return replay; end if;

  select current_document.* into document
  from public.verification_documents as current_document
  where current_document.id = p_document_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification document not found.'; end if;
  if document.purge_claim_id <> p_claim_id
     or document.storage_path is distinct from p_expected_storage_path
     or document.legal_hold_at is not null then
    raise exception using errcode = 'P4095', message = 'The evidence purge claim is stale or no longer eligible.';
  end if;

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = document.submission_id for key share;

  update public.verification_documents
  set status = 'purged',
      storage_path = null,
      sha256 = null,
      purged_at = now(),
      purge_claim_id = null,
      purge_claimed_at = null,
      version = version + 1
  where id = p_document_id
  returning * into document;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, submission.user_id, null, 'system',
    'verification_evidence_purged', submission.status, submission.status,
    jsonb_build_object('document_id', document.id),
    p_command_id, 'finalize_verification_evidence_purge', command_hash, p_request_id
  );

  result := jsonb_build_object('document_id', document.id, 'purged_at', document.purged_at);
  perform private.store_verification_command(
    p_command_id, 'finalize_verification_evidence_purge', null,
    document.id, command_hash, result
  );
  return result;
end;
$$;

revoke all on function private.require_verification_admin_capability(uuid, public.account_capability)
  from public, anon, authenticated, service_role;
revoke all on function private.has_required_clean_verification_documents(uuid, public.onboarding_role)
  from public, anon, authenticated;
revoke all on function private.is_safe_verification_reason(text)
  from public, anon, authenticated;

revoke all on function public.api_assign_verification_reviewer(uuid, uuid, uuid, integer, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_request_verification_information(uuid, uuid, integer, text, text, jsonb, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_approve_verification(uuid, uuid, integer, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_reject_verification(uuid, uuid, integer, text, text, text, text, timestamptz, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_record_verification_evidence_view(uuid, uuid, uuid, boolean, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_record_verification_scan(uuid, public.verification_malware_status, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_suspend_professional(uuid, uuid, integer, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_restore_professional(uuid, uuid, integer, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_claim_due_verification_evidence(integer, uuid)
  from public, anon, authenticated;
revoke all on function public.api_finalize_verification_evidence_purge(uuid, uuid, text, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.api_assign_verification_reviewer(uuid, uuid, uuid, integer, uuid, uuid)
  to service_role;
grant execute on function public.api_request_verification_information(uuid, uuid, integer, text, text, jsonb, text, uuid, uuid)
  to service_role;
grant execute on function public.api_approve_verification(uuid, uuid, integer, uuid, uuid)
  to service_role;
grant execute on function public.api_reject_verification(uuid, uuid, integer, text, text, text, text, timestamptz, uuid, uuid)
  to service_role;
grant execute on function public.api_record_verification_evidence_view(uuid, uuid, uuid, boolean, uuid, uuid)
  to service_role;
grant execute on function public.api_record_verification_scan(uuid, public.verification_malware_status, text, text, uuid, uuid)
  to service_role;
grant execute on function public.api_suspend_professional(uuid, uuid, integer, text, text, text, text, uuid, uuid)
  to service_role;
grant execute on function public.api_restore_professional(uuid, uuid, integer, text, text, uuid, uuid)
  to service_role;
grant execute on function public.api_claim_due_verification_evidence(integer, uuid)
  to service_role;
grant execute on function public.api_finalize_verification_evidence_purge(uuid, uuid, text, uuid, uuid)
  to service_role;
