-- Operations-only legal-hold command. Raw evidence-table mutation remains
-- revoked from every API client, including service_role; maintenance must be
-- explicit, idempotent, and visible in the verification audit timeline.
create or replace function public.api_set_verification_evidence_legal_hold(
  p_actor_id uuid,
  p_document_id uuid,
  p_hold boolean,
  p_reason text,
  p_operator_reference text,
  p_command_id uuid
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
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'A legal-hold reason from 3 through 500 characters is required.';
  end if;
  if char_length(btrim(coalesce(p_operator_reference, ''))) not between 3 and 200 then
    raise exception using errcode = '22023', message = 'An operator reference from 3 through 200 characters is required.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(jsonb_build_object(
      'document_id', p_document_id,
      'actor_id', p_actor_id,
      'hold', p_hold,
      'reason', btrim(p_reason),
      'operator_reference', btrim(p_operator_reference)
    )::text, 'UTF8'),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'set_verification_evidence_legal_hold', p_actor_id, command_hash
  );
  if replay is not null then return replay; end if;

  perform private.require_verification_admin_capability(p_actor_id, 'verification_review');

  select current_document.* into document
  from public.verification_documents as current_document
  where current_document.id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Verification document not found.';
  end if;
  if document.status = 'purged' then
    raise exception using errcode = 'P4097', message = 'Purged evidence cannot be placed on legal hold.';
  end if;
  if document.purge_claim_id is not null then
    raise exception using errcode = 'P4095', message = 'Evidence already claimed for purge cannot change legal hold.';
  end if;

  select current_submission.* into submission
  from public.verification_submissions as current_submission
  where current_submission.id = document.submission_id
  for key share;

  update public.verification_documents
  set legal_hold_at = case when p_hold then coalesce(legal_hold_at, now()) else null end,
      legal_hold_by = case when p_hold then p_actor_id else null end,
      legal_hold_reason = case when p_hold then btrim(p_reason) else null end,
      version = version + 1
  where id = p_document_id
  returning * into document;

  insert into public.verification_events (
    submission_id, applicant_id, actor_id, actor_role, event_type,
    from_status, to_status, private_reason_code, private_note, metadata,
    command_id, command_kind, command_hash
  ) values (
    submission.id, submission.user_id, p_actor_id, 'admin',
    case when p_hold then 'verification_evidence_legal_hold_set'
      else 'verification_evidence_legal_hold_released' end,
    submission.status, submission.status,
    case when p_hold then 'legal_hold_set' else 'legal_hold_released' end,
    btrim(p_reason),
    jsonb_build_object(
      'document_id', document.id,
      'operator_reference', btrim(p_operator_reference)
    ),
    p_command_id, 'set_verification_evidence_legal_hold', command_hash
  );

  result := jsonb_build_object(
    'document_id', document.id,
    'legal_hold_at', document.legal_hold_at,
    'legal_hold_reason', document.legal_hold_reason
  );
  perform private.store_verification_command(
    p_command_id, 'set_verification_evidence_legal_hold', p_actor_id,
    document.id, command_hash, result
  );
  return result;
end;
$$;

revoke all on function public.api_set_verification_evidence_legal_hold(
  uuid, uuid, boolean, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.api_set_verification_evidence_legal_hold(
  uuid, uuid, boolean, text, text, uuid
) to service_role;
