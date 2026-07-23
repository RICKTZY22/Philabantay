-- Extend the existing restrictive account lock from owner applicants to every
-- professional applicant. The policies named owner_verification_lock already
-- call this helper on every current application table (including appointment
-- events), so replacing the helper updates the direct-JWT boundary atomically.
--
-- Service-role maintenance continues to bypass RLS. Verification/status APIs
-- must be mounted outside the Express operational lock and their future tables
-- must use dedicated applicant/reviewer policies instead of this blanket one.

create or replace function private.current_user_has_operational_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      (
        u.requested_role is distinct from 'barber'::public.onboarding_role
        and u.requested_role is distinct from 'shop_owner'::public.onboarding_role
      )
      or u.verification_status = 'verified'::public.verification_status
    from public.users as u
    where u.id = (select auth.uid())
  ), false);
$$;

revoke all on function private.current_user_has_operational_access() from public, anon, authenticated;
grant execute on function private.current_user_has_operational_access() to authenticated;
