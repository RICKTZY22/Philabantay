-- P1-06: least-privilege public catalogue boundary.
--
-- The product does not have an explicit shop publication lifecycle yet.
-- This migration therefore uses a deliberately named legacy eligibility floor:
-- a shop has a verified/onboarded owner and at least one active service. P2-01
-- must replace this helper with the real draft/published/suspended lifecycle.

create or replace function private.is_legacy_catalogue_eligible_shop(
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shops as shop
    join public.users as owner_profile
      on owner_profile.id = shop.owner_id
    where shop.id = p_shop_id
      and owner_profile.role = 'shop_owner'
      and owner_profile.requested_role = 'shop_owner'
      and owner_profile.verification_status = 'verified'
      and owner_profile.onboarding_completed
      and exists (
        select 1
        from public.services as service
        where service.shop_id = shop.id
          and service.active
      )
  );
$$;

revoke all on function private.is_legacy_catalogue_eligible_shop(uuid)
  from public, anon, authenticated;
grant execute on function private.is_legacy_catalogue_eligible_shop(uuid)
  to authenticated;

create or replace function private.can_read_legacy_catalogue_barber(
  p_barber_id uuid,
  p_viewer_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barber_employment as employment
    join public.users as barber_profile
      on barber_profile.id = employment.barber_id
    where employment.barber_id = p_barber_id
      and employment.status = 'active'
      and employment.ended_at is null
      and employment.hired_at <= (now() at time zone 'Asia/Manila')::date
      and barber_profile.role = 'barber'
      and barber_profile.requested_role = 'barber'
      and barber_profile.verification_status = 'verified'
      and barber_profile.onboarding_completed
      and (
        private.owns_shop(
          employment.shop_id,
          coalesce(p_viewer_id, (select auth.uid()))
        )
        or private.is_legacy_catalogue_eligible_shop(employment.shop_id)
      )
  );
$$;

revoke all on function private.can_read_legacy_catalogue_barber(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_read_legacy_catalogue_barber(uuid, uuid)
  to authenticated;

-- The anonymous Express router uses the service-role client. It first obtains
-- this allowlist, then performs explicit-column projections for every DTO.
-- Browser JWTs cannot execute the helper RPC or read base tables anonymously.
create or replace function public.api_catalogue_shop_ids()
returns table (shop_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select shop.id as shop_id
  from public.shops as shop
  where private.is_legacy_catalogue_eligible_shop(shop.id)
  order by shop.id;
$$;

revoke all on function public.api_catalogue_shop_ids()
  from public, anon, authenticated;
grant execute on function public.api_catalogue_shop_ids()
  to service_role;

-- Keep anonymous users off every base table. Public discovery is exposed only
-- by the validated Express /api/v1/catalog routes above the auth middleware.
revoke all on table public.shops from anon;
revoke all on table public.barbers from anon;
revoke all on table public.services from anon;

-- Remove the earlier whole-row SELECT grants. Even an authenticated browser
-- token receives only the same allowlisted catalogue columns, never owner_id,
-- created_at, updated_at, or the internal service.active flag.
revoke select on table public.shops from authenticated;
revoke select on table public.barbers from authenticated;
revoke select on table public.services from authenticated;

grant select (id, name, address, city, lat, lng, rating, rating_count)
  on table public.shops to authenticated;
grant select (id, bio, rating, rating_count, shift_status, accepting_bookings)
  on table public.barbers to authenticated;
grant select (id, shop_id, name, duration_min, price_cents)
  on table public.services to authenticated;

drop policy if exists shops_select_catalogue on public.shops;
drop policy if exists shops_select_legacy_catalogue_or_owner on public.shops;
create policy shops_select_legacy_catalogue_or_owner
  on public.shops for select to authenticated
  using (
    private.owns_shop(id)
    or private.is_legacy_catalogue_eligible_shop(id)
  );

drop policy if exists barbers_select_catalogue on public.barbers;
drop policy if exists barbers_select_legacy_catalogue_member_or_self on public.barbers;
create policy barbers_select_legacy_catalogue_member_or_self
  on public.barbers for select to authenticated
  using (
    id = (select auth.uid())
    or private.can_read_legacy_catalogue_barber(id, (select auth.uid()))
  );

drop policy if exists services_select_catalogue_or_owner on public.services;
drop policy if exists services_select_legacy_catalogue_or_owner on public.services;
create policy services_select_legacy_catalogue_or_owner
  on public.services for select to authenticated
  using (
    private.owns_shop(shop_id)
    or (
      active
      and private.is_legacy_catalogue_eligible_shop(shop_id)
    )
  );
