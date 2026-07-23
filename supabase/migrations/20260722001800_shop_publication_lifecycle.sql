-- P2-01: shop publication lifecycle.
--
-- Replaces the P1-06 legacy catalogue eligibility floor with a real
-- draft/pending_review/published/suspended/archived lifecycle plus optimistic
-- version and a persisted shop timezone. A shop is catalogue-eligible only when
-- it is published AND still owned by a verified owner AND has at least one
-- active service. Publication and lifecycle transitions are service-role
-- commands (Express), so a browser JWT can never self-publish: the authenticated
-- UPDATE grant excludes lifecycle_status/version/published_at, and every insert
-- is forced to 'draft' by a trigger.

-- 1. Lifecycle enum + columns ------------------------------------------------
create type public.shop_lifecycle_status as enum (
  'draft', 'pending_review', 'published', 'suspended', 'archived'
);

alter table public.shops
  add column lifecycle_status public.shop_lifecycle_status not null default 'draft',
  add column timezone text not null default 'Asia/Manila',
  add column description text,
  add column public_contact_phone text,
  add column booking_mode text not null default 'manual',
  add column chair_count integer not null default 1,
  add column default_buffer_min integer not null default 0,
  add column published_at timestamptz,
  add column version integer not null default 1;

alter table public.shops
  add constraint shops_booking_mode_valid check (booking_mode in ('manual', 'instant')),
  add constraint shops_chair_count_positive check (chair_count >= 1),
  add constraint shops_default_buffer_range check (default_buffer_min between 0 and 120),
  add constraint shops_description_length check (description is null or char_length(description) <= 2000),
  add constraint shops_contact_phone_length
    check (public_contact_phone is null or char_length(btrim(public_contact_phone)) between 5 and 40),
  add constraint shops_timezone_length check (char_length(btrim(timezone)) between 1 and 64),
  add constraint shops_version_positive check (version >= 1),
  add constraint shops_published_has_timestamp
    check (lifecycle_status <> 'published' or published_at is not null);

-- 2. Backfill: shops that were catalogue-eligible under the legacy floor keep
-- appearing publicly, now as explicitly published rows. Inlined (not via the
-- helper) so it is independent of the redefinition in step 3.
update public.shops as shop
  set lifecycle_status = 'published',
      published_at = now()
  where exists (
      select 1 from public.users as owner_profile
      where owner_profile.id = shop.owner_id
        and owner_profile.role = 'shop_owner'
        and owner_profile.requested_role = 'shop_owner'
        and owner_profile.verification_status = 'verified'
        and owner_profile.onboarding_completed
    )
    and exists (
      select 1 from public.services as service
      where service.shop_id = shop.id and service.active
    );

-- 3. Real publication gate. Redefined in place so every existing dependent
-- (private.can_read_legacy_catalogue_barber, public.api_catalogue_shop_ids, and
-- the shops/barbers/services SELECT policies) now requires a published shop
-- without any policy churn. The name keeps its P1-06 spelling; a later packet
-- may rename it to is_published_catalogue_shop.
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
      and shop.lifecycle_status = 'published'
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

-- 4. Force every new shop to start as an unpublished draft. Publication is an
-- explicit service-role command; this closes the direct-insert bypass where a
-- raw JWT could otherwise insert a row already marked 'published'.
create or replace function private.enforce_shop_insert_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.lifecycle_status := 'draft';
  new.published_at := null;
  new.version := 1;
  return new;
end;
$$;

drop trigger if exists shops_force_draft_on_insert on public.shops;
create trigger shops_force_draft_on_insert
  before insert on public.shops
  for each row execute function private.enforce_shop_insert_defaults();

-- 5. Keep the authenticated write surface unable to touch lifecycle columns.
-- (The P1-06 grant already limits UPDATE to name/address/city/lat/lng; this is
-- an explicit guard so future column additions do not silently widen it.)
revoke update on table public.shops from authenticated;
grant update (name, address, city, lat, lng, description, public_contact_phone)
  on table public.shops to authenticated;
