-- A shop-owner request is a full account lock until approval. Express repeats
-- this rule, while these restrictive policies protect direct user-token access.

create or replace function private.current_user_has_operational_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    not (
      u.requested_role = 'shop_owner'
      and u.verification_status <> 'verified'
    ),
    false
  )
  from public.users as u
  where u.id = (select auth.uid());
$$;

revoke all on function private.current_user_has_operational_access() from public, anon, authenticated;
grant execute on function private.current_user_has_operational_access() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'shops',
    'barbers',
    'services',
    'barber_employment',
    'shift_patterns',
    'shift_exceptions',
    'appointments',
    'attendance_records',
    'conversations',
    'messages',
    'ratings',
    'barber_applications',
    'notification_preferences',
    'hiring_listings',
    'shop_join_codes',
    'shift_change_requests',
    'staff_notes',
    'favorite_shops',
    'favorite_barbers',
    'bug_reports'
  ]
  loop
    execute format(
      'create policy owner_verification_lock on public.%I as restrictive for all to authenticated using ((select private.current_user_has_operational_access())) with check ((select private.current_user_has_operational_access()))',
      table_name
    );
  end loop;
end;
$$;
