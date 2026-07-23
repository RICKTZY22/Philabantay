-- Supabase Auth stores confirmed phone numbers as digits while profile input
-- may use an E.164 leading plus. Compare the same canonical digit sequence;
-- never weaken the requirement that the Auth phone itself is confirmed.
create or replace function private.verification_phones_match(
  p_profile_phone text,
  p_auth_phone text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_profile_phone, ''), '[^0-9]', '', 'g'), '')
    is not distinct from
    nullif(regexp_replace(coalesce(p_auth_phone, ''), '[^0-9]', '', 'g'), '')
    and nullif(regexp_replace(coalesce(p_profile_phone, ''), '[^0-9]', '', 'g'), '') is not null;
$$;

revoke all on function private.verification_phones_match(text, text)
  from public, anon, authenticated;

create or replace function public.api_approve_verification(
  p_actor_id uuid,
  p_submission_id uuid,
  p_expected_version integer,
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
  applicant public.users%rowtype;
  auth_identity auth.users%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if p_private_note is not null and char_length(btrim(p_private_note)) > 4000 then
    raise exception using errcode = '22023', message = 'The private approval note is too long.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'submission_id', p_submission_id,
        'expected_version', p_expected_version,
        'private_note', nullif(btrim(p_private_note), '')
      )::text,
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
     or not private.verification_phones_match(applicant.phone, auth_identity.phone) then
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
    from_status, to_status, private_note, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, applicant.id, p_actor_id, 'admin',
    'verification_approved', 'pending', 'approved',
    nullif(btrim(p_private_note), ''), '{}'::jsonb,
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

revoke all on function public.api_approve_verification(
  uuid, uuid, integer, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.api_approve_verification(
  uuid, uuid, integer, text, uuid, uuid
) to service_role;
