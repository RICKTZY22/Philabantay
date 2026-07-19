-- The verification lock applies only to accounts that requested shop-owner
-- privileges. SQL NULL semantics previously evaluated customers with no
-- requested_role as locked, causing restrictive RLS policies to hide all rows.

create or replace function private.current_user_has_operational_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      u.requested_role is distinct from 'shop_owner'::public.onboarding_role
      or u.verification_status = 'verified'::public.verification_status
    from public.users as u
    where u.id = (select auth.uid())
  ), false);
$$;

revoke all on function private.current_user_has_operational_access() from public, anon, authenticated;
grant execute on function private.current_user_has_operational_access() to authenticated;
