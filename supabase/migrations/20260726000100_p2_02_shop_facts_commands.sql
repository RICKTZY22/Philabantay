-- P2-02: atomic shop facts, publication readiness, and private shop media.
--
-- The service-role API is the only mutation caller. These commands keep a
-- published shop from becoming catalogue-visible without both an open-hours
-- block and an active service, and make replace-all hours a single transaction.

-- ---------------------------------------------------------------------------
-- Catalogue/readiness invariants

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
    join public.users as owner_profile on owner_profile.id = shop.owner_id
    where shop.id = p_shop_id
      and shop.lifecycle_status = 'published'
      and owner_profile.role = 'shop_owner'
      and owner_profile.requested_role = 'shop_owner'
      and owner_profile.verification_status = 'verified'
      and owner_profile.onboarding_completed
      and exists (
        select 1
        from public.services as service
        where service.shop_id = shop.id and service.active
      )
      and exists (
        select 1
        from public.shop_operating_hours as hours
        where hours.shop_id = shop.id and not hours.closed
      )
  );
$$;

create or replace function private.assert_published_shop_facts(
  p_shop_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.shops
    where id = p_shop_id and lifecycle_status = 'published'
  ) and (
    not exists (
      select 1 from public.services
      where shop_id = p_shop_id and active
    )
    or not exists (
      select 1 from public.shop_operating_hours
      where shop_id = p_shop_id and not closed
    )
  ) then
    raise exception using
      errcode = 'P4021',
      message = 'A published shop must keep at least one active service and one open-hours block.';
  end if;
end;
$$;

revoke all on function private.assert_published_shop_facts(uuid)
  from public, anon, authenticated;

-- Earlier P2-01 rows could be marked published before operating hours existed.
-- Downgrade those rows to honest drafts rather than showing "published" in the
-- owner UI while the stricter catalogue correctly hides them.
update public.shops as shop
   set lifecycle_status = 'draft',
       published_at = null,
       version = version + 1
 where lifecycle_status = 'published'
   and (
     not exists (
       select 1 from public.services
       where shop_id = shop.id and active
     )
     or not exists (
       select 1 from public.shop_operating_hours
       where shop_id = shop.id and not closed
     )
   );

create or replace function private.enforce_published_shop_facts_from_service()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_published_shop_facts(coalesce(new.shop_id, old.shop_id));
  return null;
end;
$$;

create or replace function private.enforce_published_shop_facts_from_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_published_shop_facts(coalesce(new.shop_id, old.shop_id));
  return null;
end;
$$;

drop trigger if exists services_preserve_published_shop on public.services;
create constraint trigger services_preserve_published_shop
  after insert or update or delete on public.services
  deferrable initially deferred
  for each row execute function private.enforce_published_shop_facts_from_service();

drop trigger if exists hours_preserve_published_shop on public.shop_operating_hours;
create constraint trigger hours_preserve_published_shop
  after insert or update or delete on public.shop_operating_hours
  deferrable initially deferred
  for each row execute function private.enforce_published_shop_facts_from_hours();

-- Publication checks and the lifecycle write now happen while the shop row is
-- locked. This closes the former check-then-update race.
create or replace function public.api_publish_owner_shop(
  p_owner_id uuid,
  p_expected_version integer
)
returns public.shops
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.shops;
begin
  select *
    into target
    from public.shops
   where owner_id = p_owner_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Create your shop before publishing.';
  end if;
  if target.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This shop changed since you loaded it.';
  end if;
  if not exists (
    select 1 from public.users
    where id = p_owner_id
      and role = 'shop_owner'
      and requested_role = 'shop_owner'
      and verification_status = 'verified'
      and onboarding_completed
  ) then
    raise exception using errcode = '42501', message = 'Verified owner access is required.';
  end if;
  if btrim(target.name) = ''
     or btrim(target.address) = ''
     or btrim(target.city) = ''
     or btrim(target.timezone) = ''
     or target.lat not between -90 and 90
     or target.lng not between -180 and 180
     or target.chair_count < 1
     or not exists (
       select 1 from public.services
       where shop_id = target.id and active
     )
     or not exists (
       select 1 from public.shop_operating_hours
       where shop_id = target.id and not closed
     ) then
    raise exception using
      errcode = 'P4021',
      message = 'Complete the shop identity, map pin, hours, chairs, and active service before publishing.';
  end if;

  update public.shops
     set lifecycle_status = 'published',
         published_at = coalesce(published_at, now()),
         version = version + 1
   where id = target.id
   returning * into target;

  return target;
end;
$$;

-- Replace all weekly blocks atomically and advance the shop version so another
-- browser session cannot silently publish stale setup state.
create or replace function public.api_replace_owner_shop_hours(
  p_owner_id uuid,
  p_expected_version integer,
  p_blocks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.shops;
  block jsonb;
  normalized_closed boolean;
begin
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 28 then
    raise exception using errcode = '22023', message = 'Operating-hours blocks must be an array of at most 28 items.';
  end if;

  select *
    into target
    from public.shops
   where owner_id = p_owner_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Create your shop before setting hours.';
  end if;
  if target.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This shop changed since you loaded it.';
  end if;

  delete from public.shop_operating_hours where shop_id = target.id;

  for block in select value from jsonb_array_elements(p_blocks)
  loop
    normalized_closed := coalesce((block->>'closed')::boolean, false);
    insert into public.shop_operating_hours (
      shop_id, weekday, open_time, close_time, closed, block_order
    ) values (
      target.id,
      (block->>'weekday')::smallint,
      case when normalized_closed then null else (block->>'open_time')::time end,
      case when normalized_closed then null else (block->>'close_time')::time end,
      normalized_closed,
      coalesce((block->>'block_order')::smallint, 0)
    );
  end loop;

  perform private.assert_published_shop_facts(target.id);

  update public.shops
     set version = version + 1
   where id = target.id
   returning * into target;

  return jsonb_build_object(
    'shop_version', target.version,
    'hours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', hours.id,
          'shop_id', hours.shop_id,
          'weekday', hours.weekday,
          'open_time', to_char(hours.open_time, 'HH24:MI'),
          'close_time', to_char(hours.close_time, 'HH24:MI'),
          'closed', hours.closed,
          'block_order', hours.block_order
        )
        order by hours.weekday, hours.block_order
      )
      from public.shop_operating_hours as hours
      where hours.shop_id = target.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.api_publish_owner_shop(uuid, integer) from public, anon, authenticated;
grant execute on function public.api_publish_owner_shop(uuid, integer) to service_role;
revoke all on function public.api_replace_owner_shop_hours(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.api_replace_owner_shop_hours(uuid, integer, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Shop media

create type public.shop_media_role as enum ('storefront', 'interior', 'team', 'gallery');
create type public.shop_media_upload_status as enum ('awaiting_upload', 'ready', 'rejected', 'deleting');
create type public.shop_media_moderation_status as enum ('pending', 'approved', 'rejected');

create table public.shop_media (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  storage_path text not null unique,
  role public.shop_media_role not null default 'gallery',
  sort_order smallint not null default 0,
  alt_text text not null,
  declared_mime text not null,
  declared_size_bytes bigint not null,
  upload_status public.shop_media_upload_status not null default 'awaiting_upload',
  moderation_status public.shop_media_moderation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_media_alt_text_length check (char_length(btrim(alt_text)) between 1 and 240),
  constraint shop_media_sort_order_nonnegative check (sort_order >= 0),
  constraint shop_media_mime_allowed check (declared_mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint shop_media_size_allowed check (declared_size_bytes between 1 and 8388608)
);

create index shop_media_shop_order_idx on public.shop_media (shop_id, sort_order, created_at);

create trigger shop_media_set_updated_at
  before update on public.shop_media
  for each row execute function private.set_updated_at();

create or replace function private.enforce_shop_media_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize media allocation per shop so parallel grants cannot both pass
  -- the count and exceed the cap.
  perform 1
    from public.shops
   where id = new.shop_id
   for update;

  if (
    select count(*)
      from public.shop_media
     where shop_id = new.shop_id
  ) >= 100 then
    raise exception using
      errcode = 'P4022',
      message = 'A shop can retain at most 100 photo records.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_shop_media_cap()
  from public, anon, authenticated;

create trigger shop_media_enforce_cap
  before insert on public.shop_media
  for each row execute function private.enforce_shop_media_cap();

alter table public.shop_media enable row level security;
grant select on public.shop_media to authenticated;

create policy shop_media_select_owner
  on public.shop_media for select to authenticated
  using (private.owns_shop(shop_id));

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'shop-media',
  'shop-media',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Objects remain private. Upload and short-lived viewing are granted by
-- Express after it validates ownership against shop_media; no browser storage
-- policy is required for signed upload URLs.
