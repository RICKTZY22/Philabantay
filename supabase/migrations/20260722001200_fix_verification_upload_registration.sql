-- Fix a PL/pgSQL name collision discovered by the real local integration
-- suite.  Keep this as a forward migration because 009 is already applied.
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
  generated_storage_path text;
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
    update public.verification_documents as prior_document
    set status = 'superseded',
        purge_after = coalesce(prior_document.purge_after, now()),
        version = prior_document.version + 1
    where prior_document.submission_id = p_submission_id
      and prior_document.document_type = p_document_type
      and prior_document.status not in ('superseded', 'purged')
    returning prior_document.storage_path as prior_storage_path
  )
  select coalesce(
    jsonb_agg(superseded.prior_storage_path)
      filter (where superseded.prior_storage_path is not null),
    '[]'::jsonb
  )
  into superseded_paths
  from superseded;

  generated_storage_path := p_actor_id::text || '/' || p_submission_id::text || '/' || document_id::text || '/blob';
  insert into public.verification_documents (
    id, submission_id, document_type, storage_path, status,
    declared_mime, declared_size_bytes, content_status, malware_status
  ) values (
    document_id, p_submission_id, p_document_type, generated_storage_path,
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
    'storage_path', generated_storage_path,
    'superseded_storage_paths', superseded_paths
  );
  perform private.store_verification_command(
    p_command_id, 'register_verification_upload', p_actor_id,
    document.id, command_hash, result
  );
  return result;
end;
$$;

revoke all on function public.api_register_verification_upload(
  uuid, uuid, integer, public.verification_document_type, text, bigint, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.api_register_verification_upload(
  uuid, uuid, integer, public.verification_document_type, text, bigint, uuid, uuid
) to service_role;
