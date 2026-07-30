-- P2-07 (slice 2b): a new hire is bookable for what the shop already offers.
--
-- 20260730000100 backfilled a grant for every provider/service pairing that
-- existed when it ran, and 20260730000200 made an active grant mandatory before
-- anyone can be booked. On its own that leaves one trap: an owner hires a barber,
-- nothing grants anything, and the barber is silently unbookable with no error
-- anywhere until a customer fails to find a slot.
--
-- So a barber becoming active at a shop is granted the shop's currently active
-- services, attributed to the owner who employed them. The owner may revoke any
-- of it afterwards through the existing P2-05 command.
--
-- The mirror case is deliberately NOT implemented. When an owner adds a *new*
-- service, existing staff are left unqualified for it, because that is precisely
-- the gap P2-05's owner-grant and barber-request flows exist to fill. Granting
-- every service to everyone on creation would make that shipped feature
-- unreachable: no barber could ever have a service to request. Adding staff to a
-- service stays an explicit act.
--
-- ON CONFLICT DO NOTHING means a deliberate revocation is never resurrected,
-- including across a re-hire. The owner's decision outlives the employment row.
--
-- This is a trigger rather than an addition to the employment-acceptance command
-- because bookability is an invariant: a trigger also covers any future path
-- that activates an employment, whereas amending one command only covers today's.

create or replace function private.grant_default_service_qualifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
begin
  select shop.owner_id
  into v_owner_id
  from public.shops as shop
  where shop.id = new.shop_id;

  -- Never returns NULL into a comparison: without an owner there is nobody to
  -- attribute the grant to, and granted_by is NOT NULL.
  if v_owner_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Cannot grant default qualifications for a shop with no owner.';
  end if;

  with granted as (
    insert into public.service_qualifications (
      shop_id,
      service_id,
      provider_user_id,
      active,
      granted_by
    )
    select
      service.shop_id,
      service.id,
      new.barber_id,
      true,
      v_owner_id
    from public.services as service
    where service.shop_id = new.shop_id
      and service.active
    on conflict (shop_id, service_id, provider_user_id) do nothing
    returning shop_id, provider_user_id
  )
  insert into public.provider_qualification_revisions (
    shop_id,
    provider_user_id,
    version,
    updated_at
  )
  select distinct granted.shop_id, granted.provider_user_id, 1, now()
  from granted
  on conflict (shop_id, provider_user_id) do update
    set version = provider_qualification_revisions.version + 1,
        updated_at = now();

  return null;
end;
$$;

revoke all on function private.grant_default_service_qualifications()
  from public, anon, authenticated, service_role;

-- Fires only on the transition into a bookable state, so an ordinary update to
-- an already-active row does no work.
create trigger barber_employment_default_qualifications
  after insert or update of status, ended_at
  on public.barber_employment
  for each row
  when (new.status = 'active' and new.ended_at is null)
  execute function private.grant_default_service_qualifications();
