-- P1-05 applicant-side verification commands.  Every mutation is a
-- service-role-only SECURITY DEFINER transaction with optimistic concurrency,
-- command-id replay protection, and an immutable audit event.

create or replace function private.lock_verification_command(p_command_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('verification-command:' || p_command_id::text, 0)
  );
end;
$$;

create or replace function private.verification_command_replay(
  p_command_id uuid,
  p_command_kind text,
  p_actor_id uuid,
  p_command_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  command_row private.verification_command_results%rowtype;
begin
  select stored.*
  into command_row
  from private.verification_command_results as stored
  where stored.command_id = p_command_id;

  if not found then
    return null;
  end if;

  if command_row.command_kind is distinct from p_command_kind
     or command_row.actor_id is distinct from p_actor_id
     or command_row.command_hash is distinct from p_command_hash then
    raise exception using
      errcode = 'P4096',
      message = 'This command id was already used for a different verification request.';
  end if;

  return command_row.result;
end;
$$;

create or replace function private.store_verification_command(
  p_command_id uuid,
  p_command_kind text,
  p_actor_id uuid,
  p_target_id uuid,
  p_command_hash bytea,
  p_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.verification_command_results (
    command_id,
    command_kind,
    actor_id,
    target_id,
    command_hash,
    result
  ) values (
    p_command_id,
    p_command_kind,
    p_actor_id,
    p_target_id,
    p_command_hash,
    p_result
  );
end;
$$;

create or replace function private.is_complete_verification_form(
  p_role public.onboarding_role,
  p_form_data jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_form_data) <> 'object' then false
    when p_form_data ->> 'version' <> '1' then false
    when p_form_data ->> 'role' <> p_role::text then false
    when coalesce(p_form_data ->> 'date_of_birth', '')
      !~ '^\d{4}-\d{2}-\d{2}$' then false
    when p_role = 'barber' then
      jsonb_typeof(p_form_data -> 'specialties') = 'array'
      and jsonb_array_length(p_form_data -> 'specialties') between 1 and 20
    when p_role = 'shop_owner' then
      jsonb_typeof(p_form_data -> 'business') = 'object'
      and jsonb_typeof(p_form_data -> 'intended_shop') = 'object'
      and char_length(btrim(coalesce(p_form_data #>> '{business,legal_name}', ''))) between 1 and 160
      and char_length(btrim(coalesce(p_form_data #>> '{business,display_name}', ''))) between 1 and 120
      and char_length(btrim(coalesce(p_form_data #>> '{business,contact_email}', ''))) between 3 and 254
      and char_length(btrim(coalesce(p_form_data #>> '{business,contact_phone}', ''))) between 7 and 16
      and coalesce(p_form_data #>> '{business,control_basis}', '')
        in ('owned', 'leased', 'managed', 'family_business', 'other')
      and char_length(btrim(coalesce(p_form_data #>> '{intended_shop,name}', ''))) between 1 and 120
      and char_length(btrim(coalesce(p_form_data #>> '{intended_shop,address_line}', ''))) between 1 and 240
      and char_length(btrim(coalesce(p_form_data #>> '{intended_shop,city}', ''))) between 1 and 120
    else false
  end;
$$;

create or replace function private.has_required_verification_documents(
  p_submission_id uuid,
  p_role public.onboarding_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with current_ready as (
    select document.document_type
    from public.verification_documents as document
    where document.submission_id = p_submission_id
      and document.status = 'ready'
      and document.content_status = 'valid'
  )
  select
    exists (select 1 from current_ready where document_type = 'government_id_front')
    and exists (select 1 from current_ready where document_type = 'selfie')
    and (
      p_role = 'barber'
      or exists (
        select 1
        from current_ready
        where document_type in ('proof_of_shop_control', 'proof_of_business_address')
      )
    );
$$;

create or replace function private.validate_superseded_verification_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_submission public.verification_submissions%rowtype;
begin
  if new.supersedes_submission_id is null then
    return new;
  end if;

  select submission.*
  into previous_submission
  from public.verification_submissions as submission
  where submission.id = new.supersedes_submission_id;

  if not found
     or previous_submission.user_id <> new.user_id
     or previous_submission.requested_role <> new.requested_role
     or previous_submission.status not in ('rejected', 'withdrawn') then
    raise exception using
      errcode = '23514',
      message = 'A retry must supersede a terminal request for the same applicant and role.';
  end if;

  return new;
end;
$$;

create trigger verification_submissions_validate_supersedes
  before insert or update of supersedes_submission_id
  on public.verification_submissions
  for each row execute function private.validate_superseded_verification_submission();

create or replace function public.api_begin_professional_verification(
  p_actor_id uuid,
  p_requested_role public.onboarding_role,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.users%rowtype;
  submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if p_requested_role not in ('barber', 'shop_owner') then
    raise exception using errcode = '22023', message = 'A professional role is required.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object('requested_role', p_requested_role)::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'begin_professional_verification', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select profile.*
  into actor_profile
  from public.users as profile
  where profile.id = p_actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Applicant profile not found.';
  end if;
  if actor_profile.onboarding_completed then
    raise exception using errcode = 'P4097', message = 'Role onboarding is already complete.';
  end if;
  if actor_profile.role <> 'customer' or actor_profile.requested_role is not null then
    raise exception using errcode = '42501', message = 'This account cannot start professional verification.';
  end if;

  insert into public.verification_submissions (
    user_id,
    requested_role,
    attempt_number,
    legal_name,
    form_data
  ) values (
    p_actor_id,
    p_requested_role,
    1,
    actor_profile.full_name,
    '{}'::jsonb
  )
  returning * into submission;

  update public.users
  set requested_role = p_requested_role,
      role = 'customer',
      verification_status = 'pending',
      onboarding_completed = true,
      authorization_version = authorization_version + 1
  where id = p_actor_id;

  insert into public.verification_events (
    submission_id,
    applicant_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    metadata,
    command_id,
    command_kind,
    command_hash,
    request_id
  ) values (
    submission.id,
    p_actor_id,
    p_actor_id,
    actor_profile.role::text,
    'verification_started',
    null,
    'draft',
    '{}'::jsonb,
    p_command_id,
    'begin_professional_verification',
    command_hash,
    p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission));
  perform private.store_verification_command(
    p_command_id,
    'begin_professional_verification',
    p_actor_id,
    submission.id,
    command_hash,
    result
  );
  return result;
end;
$$;

create or replace function public.api_create_verification_submission(
  p_actor_id uuid,
  p_requested_role public.onboarding_role,
  p_legal_name text,
  p_form_data jsonb,
  p_command_id uuid,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile public.users%rowtype;
  previous_submission public.verification_submissions%rowtype;
  submission public.verification_submissions%rowtype;
  next_attempt integer;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if p_requested_role not in ('barber', 'shop_owner') then
    raise exception using errcode = '22023', message = 'A professional role is required.';
  end if;
  if jsonb_typeof(p_form_data) <> 'object'
     or p_form_data ? 'role' and p_form_data ->> 'role' <> p_requested_role::text then
    raise exception using errcode = '22023', message = 'Verification form role does not match the requested role.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'requested_role', p_requested_role,
        'legal_name', btrim(p_legal_name),
        'form_data', p_form_data
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'create_verification_submission', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select profile.*
  into actor_profile
  from public.users as profile
  where profile.id = p_actor_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Applicant profile not found.';
  end if;
  if actor_profile.role <> 'customer'
     or actor_profile.requested_role <> p_requested_role
     or not actor_profile.onboarding_completed then
    raise exception using errcode = '42501', message = 'This account cannot create that verification request.';
  end if;
  if exists (
    select 1 from public.verification_submissions
    where user_id = p_actor_id
      and requested_role = p_requested_role
      and status in ('draft', 'pending', 'needs_information', 'approved')
  ) then
    raise exception using errcode = '23505', message = 'An active or approved verification request already exists.';
  end if;

  select prior.*
  into previous_submission
  from public.verification_submissions as prior
  where prior.user_id = p_actor_id
    and prior.requested_role = p_requested_role
    and prior.status in ('rejected', 'withdrawn')
  order by prior.attempt_number desc
  limit 1
  for update;

  if found and previous_submission.retry_after is not null
     and previous_submission.retry_after > now() then
    raise exception using errcode = 'P4099', message = 'This verification request is still in its retry cooldown.';
  end if;

  select coalesce(max(existing.attempt_number), 0) + 1
  into next_attempt
  from public.verification_submissions as existing
  where existing.user_id = p_actor_id
    and existing.requested_role = p_requested_role;

  insert into public.verification_submissions (
    user_id,
    requested_role,
    attempt_number,
    supersedes_submission_id,
    legal_name,
    form_data
  ) values (
    p_actor_id,
    p_requested_role,
    next_attempt,
    previous_submission.id,
    btrim(p_legal_name),
    p_form_data
  )
  returning * into submission;

  update public.users
  set verification_status = 'pending',
      authorization_version = authorization_version + 1
  where id = p_actor_id;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, p_actor_id, p_actor_id, actor_profile.role::text,
    'verification_retry_created', null, 'draft',
    jsonb_build_object('attempt_number', submission.attempt_number),
    p_command_id, 'create_verification_submission', command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission));
  perform private.store_verification_command(
    p_command_id, 'create_verification_submission', p_actor_id,
    submission.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_update_verification_submission(
  p_actor_id uuid,
  p_submission_id uuid,
  p_expected_version integer,
  p_legal_name text,
  p_form_data jsonb,
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
        'expected_version', p_expected_version,
        'legal_name', btrim(p_legal_name),
        'form_data', p_form_data
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'update_verification_submission', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select current_submission.*
  into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.user_id <> p_actor_id then raise exception using errcode = '42501', message = 'Verification request access denied.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status not in ('draft', 'needs_information') then raise exception using errcode = 'P4097', message = 'This verification request cannot be edited.'; end if;
  if jsonb_typeof(p_form_data) <> 'object'
     or p_form_data ? 'role' and p_form_data ->> 'role' <> submission.requested_role::text then
    raise exception using errcode = '22023', message = 'Verification form role does not match the requested role.';
  end if;

  update public.verification_submissions
  set legal_name = btrim(p_legal_name),
      form_data = p_form_data,
      version = version + 1
  where id = p_submission_id
  returning * into submission;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, p_actor_id, p_actor_id, 'customer',
    'verification_details_updated', submission.status, submission.status,
    '{}'::jsonb, p_command_id, 'update_verification_submission',
    command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission));
  perform private.store_verification_command(
    p_command_id, 'update_verification_submission', p_actor_id,
    submission.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_register_verification_upload(
  p_actor_id uuid,
  p_submission_id uuid,
  p_expected_version integer,
  p_document_type public.verification_document_type,
  p_declared_mime text,
  p_declared_size_bytes bigint,
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
  document_id uuid := gen_random_uuid();
  storage_path text;
  superseded_paths jsonb;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if p_declared_mime not in ('image/jpeg', 'image/png', 'application/pdf')
     or p_declared_size_bytes not between 1 and 10485760 then
    raise exception using errcode = '22023', message = 'Evidence must be an allowed file no larger than 10 MiB.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'submission_id', p_submission_id,
        'expected_version', p_expected_version,
        'document_type', p_document_type,
        'declared_mime', p_declared_mime,
        'declared_size_bytes', p_declared_size_bytes
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'register_verification_upload', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select current_submission.*
  into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.user_id <> p_actor_id then raise exception using errcode = '42501', message = 'Verification request access denied.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status not in ('draft', 'needs_information') then raise exception using errcode = 'P4097', message = 'Evidence cannot be changed in this state.'; end if;

  with superseded as (
    update public.verification_documents
    set status = 'superseded',
        purge_after = coalesce(purge_after, now()),
        version = version + 1
    where submission_id = p_submission_id
      and document_type = p_document_type
      and status not in ('superseded', 'purged')
    returning storage_path
  )
  select coalesce(jsonb_agg(storage_path) filter (where storage_path is not null), '[]'::jsonb)
  into superseded_paths
  from superseded;

  storage_path := p_actor_id::text || '/' || p_submission_id::text || '/' || document_id::text || '/blob';
  insert into public.verification_documents (
    id, submission_id, document_type, storage_path, status,
    declared_mime, declared_size_bytes, content_status, malware_status
  ) values (
    document_id, p_submission_id, p_document_type, storage_path,
    'awaiting_upload', p_declared_mime, p_declared_size_bytes,
    'pending', 'pending'
  )
  returning * into document;

  update public.verification_submissions
  set version = version + 1
  where id = p_submission_id
  returning * into submission;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, p_actor_id, p_actor_id, 'customer',
    'verification_upload_registered', submission.status, submission.status,
    jsonb_build_object('document_id', document.id, 'document_type', document.document_type),
    p_command_id, 'register_verification_upload', command_hash, p_request_id
  );

  result := jsonb_build_object(
    'submission', to_jsonb(submission),
    'document', to_jsonb(document),
    'storage_path', storage_path,
    'superseded_storage_paths', superseded_paths
  );
  perform private.store_verification_command(
    p_command_id, 'register_verification_upload', p_actor_id,
    document.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_complete_verification_upload(
  p_actor_id uuid,
  p_submission_id uuid,
  p_document_id uuid,
  p_expected_version integer,
  p_detected_mime text,
  p_size_bytes bigint,
  p_sha256_hex text,
  p_content_status public.verification_content_status,
  p_malware_status public.verification_malware_status,
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
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if p_detected_mime not in ('image/jpeg', 'image/png', 'application/pdf')
     or p_size_bytes not between 1 and 10485760
     or p_sha256_hex !~ '^[0-9a-f]{64}$'
     or p_content_status not in ('valid', 'invalid')
     or p_malware_status not in ('pending', 'unavailable') then
    raise exception using errcode = '22023', message = 'Server evidence validation result is invalid.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'submission_id', p_submission_id,
        'document_id', p_document_id,
        'expected_version', p_expected_version,
        'detected_mime', p_detected_mime,
        'size_bytes', p_size_bytes,
        'sha256_hex', p_sha256_hex,
        'content_status', p_content_status,
        'malware_status', p_malware_status
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'complete_verification_upload', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select current_submission.*
  into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.user_id <> p_actor_id then raise exception using errcode = '42501', message = 'Verification request access denied.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status not in ('draft', 'needs_information') then raise exception using errcode = 'P4097', message = 'Evidence cannot be changed in this state.'; end if;

  select current_document.*
  into document
  from public.verification_documents as current_document
  where current_document.id = p_document_id
    and current_document.submission_id = p_submission_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification document not found.'; end if;
  if document.status <> 'awaiting_upload' then raise exception using errcode = 'P4097', message = 'This evidence upload is no longer awaiting completion.'; end if;

  update public.verification_documents
  set status = case when p_content_status = 'valid' then 'ready' else 'rejected' end,
      detected_mime = p_detected_mime,
      size_bytes = p_size_bytes,
      sha256 = decode(p_sha256_hex, 'hex'),
      content_status = p_content_status,
      malware_status = p_malware_status,
      uploaded_at = now(),
      validated_at = now(),
      scanned_at = case when p_malware_status = 'unavailable' then now() else null end,
      version = version + 1
  where id = p_document_id
  returning * into document;

  update public.verification_submissions
  set version = version + 1
  where id = p_submission_id
  returning * into submission;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, public_reason_code, metadata, command_id,
    command_kind, command_hash, request_id
  ) values (
    submission.id, p_actor_id, p_actor_id, 'customer',
    case when p_content_status = 'valid'
      then 'verification_upload_validated'
      else 'verification_upload_rejected'
    end,
    submission.status, submission.status,
    case when p_content_status = 'invalid' then 'documents_unreadable' else null end,
    jsonb_build_object('document_id', document.id, 'document_type', document.document_type),
    p_command_id, 'complete_verification_upload', command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission), 'document', to_jsonb(document));
  perform private.store_verification_command(
    p_command_id, 'complete_verification_upload', p_actor_id,
    document.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_remove_verification_document(
  p_actor_id uuid,
  p_submission_id uuid,
  p_document_id uuid,
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
  document public.verification_documents%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'submission_id', p_submission_id,
        'document_id', p_document_id,
        'expected_version', p_expected_version
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'remove_verification_document', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.user_id <> p_actor_id then raise exception using errcode = '42501', message = 'Verification request access denied.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status not in ('draft', 'needs_information') then raise exception using errcode = 'P4097', message = 'Evidence cannot be changed in this state.'; end if;

  update public.verification_documents
  set status = 'superseded',
      purge_after = coalesce(purge_after, now()),
      version = version + 1
  where id = p_document_id
    and submission_id = p_submission_id
    and status not in ('superseded', 'purged')
  returning * into document;
  if not found then raise exception using errcode = 'P0002', message = 'Current verification document not found.'; end if;

  update public.verification_submissions
  set version = version + 1
  where id = p_submission_id
  returning * into submission;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, p_actor_id, p_actor_id, 'customer',
    'verification_document_removed', submission.status, submission.status,
    jsonb_build_object('document_id', document.id, 'document_type', document.document_type),
    p_command_id, 'remove_verification_document', command_hash, p_request_id
  );

  result := jsonb_build_object(
    'submission', to_jsonb(submission),
    'document', to_jsonb(document),
    'storage_path', document.storage_path
  );
  perform private.store_verification_command(
    p_command_id, 'remove_verification_document', p_actor_id,
    document.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_submit_verification(
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
  old_status public.verification_submission_status;
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
    p_command_id, 'submit_verification', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.user_id <> p_actor_id then raise exception using errcode = '42501', message = 'Verification request access denied.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status not in ('draft', 'needs_information') then raise exception using errcode = 'P4097', message = 'This verification request cannot be submitted.'; end if;
  if not private.is_complete_verification_form(submission.requested_role, submission.form_data) then
    raise exception using errcode = '22023', message = 'Complete all required verification form fields before submitting.';
  end if;
  if not private.has_required_verification_documents(submission.id, submission.requested_role) then
    raise exception using errcode = 'P4098', message = 'Required evidence is missing or still being validated.';
  end if;

  old_status := submission.status;
  update public.verification_submissions
  set status = 'pending',
      submitted_at = now(),
      submission_round = case when old_status = 'needs_information'
        then submission_round + 1 else submission_round end,
      applicant_reason_code = null,
      applicant_message = null,
      version = version + 1
  where id = p_submission_id
  returning * into submission;

  update public.users
  set verification_status = 'pending'
  where id = p_actor_id;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, p_actor_id, p_actor_id, 'customer',
    case when old_status = 'needs_information'
      then 'verification_resubmitted' else 'verification_submitted' end,
    old_status, 'pending',
    jsonb_build_object('submission_round', submission.submission_round),
    p_command_id, 'submit_verification', command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission));
  perform private.store_verification_command(
    p_command_id, 'submit_verification', p_actor_id,
    submission.id, command_hash, result
  );
  return result;
end;
$$;

create or replace function public.api_withdraw_verification(
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
  old_status public.verification_submission_status;
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
    p_command_id, 'withdraw_verification', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = p_submission_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Verification request not found.'; end if;
  if submission.user_id <> p_actor_id then raise exception using errcode = '42501', message = 'Verification request access denied.'; end if;
  if submission.version <> p_expected_version then raise exception using errcode = 'P4095', message = 'The verification request changed. Reload and try again.'; end if;
  if submission.status not in ('draft', 'pending', 'needs_information') then raise exception using errcode = 'P4097', message = 'This verification request cannot be withdrawn.'; end if;

  old_status := submission.status;
  update public.verification_submissions
  set status = 'withdrawn',
      assigned_reviewer_id = null,
      assigned_by = null,
      assigned_at = null,
      version = version + 1
  where id = p_submission_id
  returning * into submission;

  update public.users
  set verification_status = 'unverified',
      authorization_version = authorization_version + 1
  where id = p_actor_id;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, p_actor_id, p_actor_id, 'customer',
    'verification_withdrawn', old_status, 'withdrawn', '{}'::jsonb,
    p_command_id, 'withdraw_verification', command_hash, p_request_id
  );

  result := jsonb_build_object('submission', to_jsonb(submission));
  perform private.store_verification_command(
    p_command_id, 'withdraw_verification', p_actor_id,
    submission.id, command_hash, result
  );
  return result;
end;
$$;

-- All helper and command functions are inaccessible to browser JWTs.  Express
-- supplies the authenticated actor id after verifying the Supabase token.
revoke all on function private.lock_verification_command(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.verification_command_replay(uuid, text, uuid, bytea)
  from public, anon, authenticated, service_role;
revoke all on function private.store_verification_command(uuid, text, uuid, uuid, bytea, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.is_complete_verification_form(public.onboarding_role, jsonb)
  from public, anon, authenticated;
revoke all on function private.has_required_verification_documents(uuid, public.onboarding_role)
  from public, anon, authenticated;

revoke all on function public.api_begin_professional_verification(uuid, public.onboarding_role, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_create_verification_submission(uuid, public.onboarding_role, text, jsonb, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_update_verification_submission(uuid, uuid, integer, text, jsonb, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_register_verification_upload(uuid, uuid, integer, public.verification_document_type, text, bigint, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_complete_verification_upload(uuid, uuid, uuid, integer, text, bigint, text, public.verification_content_status, public.verification_malware_status, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_remove_verification_document(uuid, uuid, uuid, integer, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_submit_verification(uuid, uuid, integer, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.api_withdraw_verification(uuid, uuid, integer, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.api_begin_professional_verification(uuid, public.onboarding_role, uuid, uuid)
  to service_role;
grant execute on function public.api_create_verification_submission(uuid, public.onboarding_role, text, jsonb, uuid, uuid)
  to service_role;
grant execute on function public.api_update_verification_submission(uuid, uuid, integer, text, jsonb, uuid, uuid)
  to service_role;
grant execute on function public.api_register_verification_upload(uuid, uuid, integer, public.verification_document_type, text, bigint, uuid, uuid)
  to service_role;
grant execute on function public.api_complete_verification_upload(uuid, uuid, uuid, integer, text, bigint, text, public.verification_content_status, public.verification_malware_status, uuid, uuid)
  to service_role;
grant execute on function public.api_remove_verification_document(uuid, uuid, uuid, integer, uuid, uuid)
  to service_role;
grant execute on function public.api_submit_verification(uuid, uuid, integer, uuid, uuid)
  to service_role;
grant execute on function public.api_withdraw_verification(uuid, uuid, integer, uuid, uuid)
  to service_role;
