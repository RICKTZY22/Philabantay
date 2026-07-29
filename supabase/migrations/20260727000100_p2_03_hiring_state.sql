-- P2-03: canonical shop hiring state.
--
-- Public hiring claims are derived from shops.is_hiring plus an optional
-- positive opening count. A known final fill is represented as is_hiring=false
-- with hiring_open_positions=0 ("full"); an ordinary owner opt-out clears the
-- count ("off"). Owner writes go through one version-checked command.

alter table public.shops
  add column if not exists is_hiring boolean not null default false,
  add column if not exists hiring_open_positions integer,
  add column if not exists hiring_note text;

alter table public.shops
  drop constraint if exists shops_hiring_open_positions_valid,
  add constraint shops_hiring_open_positions_valid check (
    (
      is_hiring
      and (hiring_open_positions is null or hiring_open_positions between 1 and 1000)
    )
    or (
      not is_hiring
      and (hiring_open_positions is null or hiring_open_positions = 0)
    )
  ),
  drop constraint if exists shops_hiring_note_length,
  add constraint shops_hiring_note_length check (
    hiring_note is null or char_length(hiring_note) <= 1000
  );

-- Preserve any genuine legacy owner listing as the initial canonical state.
update public.shops as shop
   set is_hiring = listing.accepting_applications and listing.open_positions > 0,
       hiring_open_positions = case
         when listing.accepting_applications and listing.open_positions > 0
           then listing.open_positions
         when listing.open_positions = 0
           then 0
         else null
       end
  from public.hiring_listings as listing
 where listing.shop_id = shop.id;

create index if not exists shops_open_hiring_updated_idx
  on public.shops (updated_at desc, id)
  where is_hiring;

create or replace function public.api_set_owner_shop_hiring(
  p_owner_id uuid,
  p_expected_version integer,
  p_status text,
  p_open_positions integer default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.shops;
  normalized_note text;
begin
  if p_status not in ('off', 'open', 'full') then
    raise exception using errcode = '22023', message = 'Hiring status must be off, open, or full.';
  end if;
  if p_status = 'open' and p_open_positions is not null
     and (p_open_positions < 1 or p_open_positions > 1000) then
    raise exception using errcode = '22023', message = 'Open positions must be between 1 and 1000.';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception using errcode = '22023', message = 'Hiring note must be at most 1000 characters.';
  end if;

  select *
    into target
    from public.shops
   where owner_id = p_owner_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Create your shop before changing hiring.';
  end if;
  if target.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This shop changed since you loaded it.';
  end if;

  normalized_note := nullif(btrim(coalesce(p_note, '')), '');

  update public.shops
     set is_hiring = p_status = 'open',
         hiring_open_positions = case
           when p_status = 'open' then p_open_positions
           when p_status = 'full' then 0
           else null
         end,
         hiring_note = normalized_note,
         version = version + 1
   where id = target.id
   returning * into target;

  return jsonb_build_object(
    'shop_id', target.id,
    'status', case
      when target.is_hiring then 'open'
      when target.hiring_open_positions = 0 then 'full'
      else 'off'
    end,
    'is_hiring', target.is_hiring,
    'open_positions', target.hiring_open_positions,
    'note', target.hiring_note,
    'shop_version', target.version,
    'updated_at', target.updated_at
  );
end;
$$;

revoke all on function public.api_set_owner_shop_hiring(uuid, integer, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.api_set_owner_shop_hiring(uuid, integer, text, integer, text)
  to service_role;

-- Keep the pre-P2-04 application command honest while the unified employment
-- request model is still pending. The shop row lock closes an off/full race
-- between a fresh hiring read and application submission.
create or replace function public.api_create_barber_application(
  p_barber_id uuid,
  p_shop_id uuid
)
returns public.barber_applications
language plpgsql
set search_path = ''
as $$
declare
  target public.shops;
  application public.barber_applications%rowtype;
begin
  select *
    into target
    from public.shops
   where id = p_shop_id
   for update;

  if not found
     or target.lifecycle_status <> 'published'
     or not target.is_hiring
     or target.hiring_open_positions = 0 then
    raise exception using errcode = 'P4021', message = 'This shop is not accepting applications.';
  end if;

  insert into public.barber_applications (barber_id, shop_id, status)
  values (p_barber_id, p_shop_id, 'pending')
  returning * into application;

  insert into public.barber_employment (barber_id, shop_id, status)
  values (p_barber_id, p_shop_id, 'applied');

  return application;
end;
$$;

-- The legacy table remains temporarily for pre-P2-04 application compatibility,
-- but browsers no longer read or mutate it directly. Canonical hiring reads and
-- writes now use the protected API and the shop columns above.
revoke all on table public.hiring_listings from anon, authenticated;
drop policy if exists hiring_listings_select_catalogue_or_owner on public.hiring_listings;
drop policy if exists hiring_listings_insert_owner on public.hiring_listings;
drop policy if exists hiring_listings_update_owner on public.hiring_listings;
drop policy if exists hiring_listings_delete_owner on public.hiring_listings;
