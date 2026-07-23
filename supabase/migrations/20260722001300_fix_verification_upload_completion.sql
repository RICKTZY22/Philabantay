-- Fix enum assignment typing in evidence completion.  CASE expressions with
-- only string branches resolve to text; cast each branch to the domain enum.
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
  set status = case when p_content_status = 'valid'
        then 'ready'::public.verification_document_status
        else 'rejected'::public.verification_document_status
      end,
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

revoke all on function public.api_complete_verification_upload(
  uuid, uuid, uuid, integer, text, bigint, text,
  public.verification_content_status, public.verification_malware_status,
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.api_complete_verification_upload(
  uuid, uuid, uuid, integer, text, bigint, text,
  public.verification_content_status, public.verification_malware_status,
  uuid, uuid
) to service_role;
