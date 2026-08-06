-- Phase 4: widen the administrator provisioning bound.
--
-- `api_provision_verification_admin` refused any command carrying more than four
-- capabilities, which was exactly the number that existed when it was written.
-- P4-03 adds `content_moderation` and P4-02 adds `dispute_review`, so one trusted
-- operator now needs six, and the old bound made provisioning them impossible
-- rather than merely awkward.
--
-- The body below is the applied definition, reproduced verbatim from
-- `pg_get_functiondef` with exactly one line changed: the cardinality ceiling.
-- The replay hash, both locks, the MFA and confirmed-email gates, the
-- `professional_access` exclusion, the capability upserts, and the immutable
-- `private.admin_provisioning_events` audit are untouched.

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
as $function$
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
     -- Was `not between 1 and 4`. The ceiling now matches the number of
     -- grantable capabilities, so adding one does not lock provisioning.
     or coalesce(cardinality(requested_capabilities), 0) not between 1 and 6
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
$function$;

revoke all on function public.api_provision_verification_admin(uuid, text, public.account_capability[], text, uuid)
  from public, anon, authenticated;
grant execute on function public.api_provision_verification_admin(uuid, text, public.account_capability[], text, uuid)
  to service_role;
