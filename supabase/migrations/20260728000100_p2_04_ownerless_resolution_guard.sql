-- P2-04 security hotfix: fail closed when a verified owner has no owned shop.
--
-- The original SQL resolver returned NULL for that state. Comparisons such as
-- `request.shop_id <> private.owner_shop_id(actor_id)` then evaluated to NULL,
-- allowing a SECURITY DEFINER command to continue past its ownership guard.
-- Keep this forward migration even though the original migration is corrected:
-- already-migrated databases need the replacement too.

create or replace function private.owner_shop_id(p_owner_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_shop_id uuid;
begin
  select shop.id
    into target_shop_id
    from public.shops as shop
    join public.users as owner on owner.id = shop.owner_id
   where shop.owner_id = p_owner_id
     and owner.role = 'shop_owner'
     and owner.requested_role = 'shop_owner'
     and owner.verification_status = 'verified'
     and owner.onboarding_completed;

  if target_shop_id is null then
    raise exception using
      errcode = '42501',
      message = 'A verified owned shop is required.';
  end if;

  return target_shop_id;
end;
$$;

revoke all on function private.owner_shop_id(uuid)
  from public, anon, authenticated;
