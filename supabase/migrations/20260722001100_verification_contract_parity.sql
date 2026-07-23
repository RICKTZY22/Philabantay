-- P1-05 contract parity and operational tooling.
--
-- This forward migration intentionally does not rewrite the already-applied
-- 008-010 migrations.  It normalizes the onboarding draft shape, preserves
-- every administrator-supplied audit field, adds credential-free/AAL-capable
-- administrator provisioning, and makes evidence-purge claims recoverable
-- after a worker crash.

-- Every draft returned by the API must satisfy the shared discriminated draft
-- union, including drafts created implicitly during role onboarding.
update public.verification_submissions
set form_data = jsonb_build_object(
  'version', 1,
  'role', requested_role::text
)
where status = 'draft'
  and form_data = '{}'::jsonb;

create or replace function private.normalize_verification_draft_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.form_data = '{}'::jsonb then
    new.form_data := jsonb_build_object(
      'version', 1,
      'role', new.requested_role::text
    );
  end if;

  if jsonb_typeof(new.form_data) <> 'object'
     or new.form_data ->> 'version' <> '1'
     or new.form_data ->> 'role' <> new.requested_role::text then
    raise exception using
      errcode = '22023',
      message = 'Verification draft form role/version is invalid.';
  end if;

  return new;
end;
$$;

create trigger aa_verification_submissions_normalize_draft_form
  before insert or update of requested_role, form_data
  on public.verification_submissions
  for each row execute function private.normalize_verification_draft_form();

revoke all on function private.normalize_verification_draft_form()
  from public, anon, authenticated, service_role;

-- Replace the first version of these functions so every field accepted by the
-- frozen shared DTO is included in the command hash and immutable event.
drop function public.api_request_verification_information(
  uuid, uuid, integer, text, text, jsonb, text, uuid, uuid
);

create function public.api_request_verification_information(
  p_actor_id uuid,
  p_submission_id uuid,
  p_expected_version integer,
  p_public_reason_code text,
  p_public_message text,
  p_information_items jsonb,
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
  submission public.verification_submissions%rowtype;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  if not private.is_safe_verification_reason(p_public_reason_code)
     or char_length(btrim(p_public_message)) not between 3 and 2000
     or jsonb_typeof(p_information_items) <> 'array'
     or jsonb_array_length(p_information_items) not between 1 and 20
     or (
       p_private_reason_code is not null
       and char_length(btrim(p_private_reason_code)) not between 1 and 100
     ) then
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
        'private_reason_code', nullif(btrim(p_private_reason_code), ''),
        'private_note', nullif(btrim(p_private_note), '')
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
    private_reason_code, private_note, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    submission.id, submission.user_id, p_actor_id, 'admin',
    'verification_information_requested', 'pending', 'needs_information',
    p_public_reason_code, btrim(p_public_message),
    nullif(btrim(p_private_reason_code), ''), nullif(btrim(p_private_note), ''),
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

drop function public.api_approve_verification(uuid, uuid, integer, uuid, uuid);

create function public.api_approve_verification(
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

drop function public.api_restore_professional(uuid, uuid, integer, text, text, uuid, uuid);

create function public.api_restore_professional(
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
     or char_length(btrim(p_public_message)) not between 3 and 2000
     or char_length(btrim(p_private_reason_code)) not between 1 and 100
     or (p_private_note is not null and char_length(btrim(p_private_note)) > 4000) then
    raise exception using errcode = '22023', message = 'The restoration reason is invalid.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'user_id', p_user_id,
        'expected_authorization_version', p_expected_authorization_version,
        'public_reason_code', p_public_reason_code,
        'public_message', btrim(p_public_message),
        'private_reason_code', btrim(p_private_reason_code),
        'private_note', nullif(btrim(p_private_note), '')
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
    from_status, to_status, public_reason_code, public_message,
    private_reason_code, private_note, metadata, command_id, command_kind,
    command_hash, request_id
  ) values (
    approved_submission.id, target.id, p_actor_id, 'admin',
    'professional_restored', 'approved', 'approved',
    p_public_reason_code, btrim(p_public_message), btrim(p_private_reason_code),
    nullif(btrim(p_private_note), ''), '{}'::jsonb,
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

revoke all on function public.api_request_verification_information(
  uuid, uuid, integer, text, text, jsonb, text, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.api_approve_verification(
  uuid, uuid, integer, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.api_restore_professional(
  uuid, uuid, integer, text, text, text, text, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.api_request_verification_information(
  uuid, uuid, integer, text, text, jsonb, text, text, uuid, uuid
) to service_role;
grant execute on function public.api_approve_verification(
  uuid, uuid, integer, text, uuid, uuid
) to service_role;
grant execute on function public.api_restore_professional(
  uuid, uuid, integer, text, text, text, text, uuid, uuid
) to service_role;

-- Server/operations-only administrator provisioning.  The script supplies no
-- password and this command refuses to promote an identity without a confirmed
-- email and at least one verified Supabase Auth MFA factor.
create table private.admin_provisioning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  command_id uuid not null unique,
  operator_reference text not null,
  capabilities public.account_capability[] not null,
  before_role public.user_role not null,
  after_role public.user_role not null,
  authorization_version integer not null,
  created_at timestamptz not null default now(),
  constraint admin_provisioning_operator_reference_length
    check (char_length(btrim(operator_reference)) between 3 and 200),
  constraint admin_provisioning_capabilities_nonempty
    check (cardinality(capabilities) between 1 and 4),
  constraint admin_provisioning_no_professional_access
    check (not ('professional_access'::public.account_capability = any(capabilities)))
);

alter table private.admin_provisioning_events enable row level security;
alter table private.admin_provisioning_events force row level security;
revoke all on table private.admin_provisioning_events
  from public, anon, authenticated, service_role;

create or replace function private.reject_admin_provisioning_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Administrator provisioning events are append-only.';
end;
$$;

create trigger admin_provisioning_events_no_update_delete
  before update or delete on private.admin_provisioning_events
  for each row execute function private.reject_admin_provisioning_event_mutation();

create trigger admin_provisioning_events_no_truncate
  before truncate on private.admin_provisioning_events
  for each statement execute function private.reject_admin_provisioning_event_mutation();

revoke all on function private.reject_admin_provisioning_event_mutation()
  from public, anon, authenticated, service_role;

create or replace function public.api_provision_verification_admin(
  p_user_id uuid,
  p_expected_email text,
  p_capabilities public.account_capability[],
  p_operator_reference text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.users%rowtype;
  identity auth.users%rowtype;
  before_role public.user_role;
  requested_capabilities public.account_capability[];
  requested_capability public.account_capability;
  command_hash bytea;
  replay jsonb;
  result jsonb;
begin
  select array_agg(distinct capability order by capability)
  into requested_capabilities
  from unnest(p_capabilities) as capability;

  if char_length(btrim(p_expected_email)) not between 3 and 254
     or char_length(btrim(p_operator_reference)) not between 3 and 200
     or coalesce(cardinality(requested_capabilities), 0) not between 1 and 4
     or 'professional_access'::public.account_capability = any(requested_capabilities) then
    raise exception using errcode = '22023', message = 'Administrator provisioning input is invalid.';
  end if;

  command_hash := extensions.digest(
    pg_catalog.convert_to(
      jsonb_build_object(
        'user_id', p_user_id,
        'expected_email', lower(btrim(p_expected_email)),
        'capabilities', to_jsonb(requested_capabilities),
        'operator_reference', btrim(p_operator_reference)
      )::text,
      'UTF8'
    ),
    'sha256'
  );
  perform private.lock_verification_command(p_command_id);
  replay := private.verification_command_replay(
    p_command_id, 'provision_verification_admin', null, command_hash
  );
  if replay is not null then return replay; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin-provision:' || p_user_id::text, 0)
  );

  select auth_user.* into identity
  from auth.users as auth_user
  where auth_user.id = p_user_id
  for key share;
  if not found then raise exception using errcode = 'P0002', message = 'Auth identity not found.'; end if;

  select current_profile.* into profile
  from public.users as current_profile
  where current_profile.id = p_user_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Profile not found.'; end if;

  if identity.email_confirmed_at is null
     or lower(coalesce(identity.email, '')) <> lower(btrim(p_expected_email))
     or lower(profile.email) <> lower(btrim(p_expected_email)) then
    raise exception using errcode = 'P4098', message = 'The confirmed Auth identity does not match the expected email.';
  end if;
  if not exists (
    select 1
    from auth.mfa_factors as factor
    where factor.user_id = p_user_id
      and factor.status = 'verified'
  ) then
    raise exception using errcode = 'P4098', message = 'A verified MFA factor is required before administrator provisioning.';
  end if;
  if profile.role not in ('customer', 'admin')
     or profile.requested_role is not null
     or exists (select 1 from public.shops as shop where shop.owner_id = p_user_id)
     or exists (select 1 from public.barbers as barber where barber.id = p_user_id) then
    raise exception using errcode = 'P4097', message = 'A professional or pending-professional account cannot become an administrator.';
  end if;

  before_role := profile.role;

  perform 1
  from public.account_capabilities as capability
  where capability.user_id = p_user_id
    and capability.shop_id is null
  for update;

  update public.users
  set role = 'admin',
      requested_role = null,
      verification_status = 'verified',
      onboarding_completed = true,
      authorization_version = authorization_version + 1
  where id = p_user_id
  returning * into profile;

  foreach requested_capability in array requested_capabilities loop
    insert into public.account_capabilities (
      user_id, shop_id, capability, state, granted_by, granted_at
    )
    select p_user_id, null, requested_capability, 'active', null, now()
    where not exists (
      select 1
      from public.account_capabilities as existing
      where existing.user_id = p_user_id
        and existing.shop_id is null
        and existing.capability = requested_capability
        and existing.state = 'active'
    );
  end loop;

  insert into private.admin_provisioning_events (
    user_id, command_id, operator_reference, capabilities,
    before_role, after_role, authorization_version
  ) values (
    p_user_id, p_command_id, btrim(p_operator_reference), requested_capabilities,
    before_role, profile.role, profile.authorization_version
  );

  result := jsonb_build_object(
    'user_id', profile.id,
    'role', profile.role,
    'authorization_version', profile.authorization_version,
    'capabilities', to_jsonb(requested_capabilities)
  );
  perform private.store_verification_command(
    p_command_id, 'provision_verification_admin', null,
    p_user_id, command_hash, result
  );
  return result;
end;
$$;

revoke all on function public.api_provision_verification_admin(
  uuid, text, public.account_capability[], text, uuid
) from public, anon, authenticated;
grant execute on function public.api_provision_verification_admin(
  uuid, text, public.account_capability[], text, uuid
) to service_role;

-- A worker that dies after claiming a document must not strand it forever.
-- A later run may reclaim a claim after 15 minutes; object deletion and
-- finalization are both idempotent and the stale worker can no longer finalize.
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
      and (
        document.purge_claimed_at is null
        or document.purge_claimed_at < now() - interval '15 minutes'
      )
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

revoke all on function public.api_claim_due_verification_evidence(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.api_claim_due_verification_evidence(integer, uuid)
  to service_role;
