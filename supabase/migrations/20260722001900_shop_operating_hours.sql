-- P2-02 (slice 1): shop operating hours.
--
-- Owner-authored weekly schedule. One row per weekday block; a closed weekday
-- has closed=true with null times. Writes go through the service-role Express
-- command (owner-scoped); authenticated tokens may read their own shop's hours
-- for defense-in-depth verification but cannot write directly.
create table public.shop_operating_hours (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  weekday smallint not null,
  open_time time,
  close_time time,
  closed boolean not null default false,
  block_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_hours_weekday_range check (weekday between 0 and 6),
  constraint shop_hours_block_order_nonneg check (block_order >= 0),
  constraint shop_hours_times_present_when_open
    check (closed or (open_time is not null and close_time is not null and open_time < close_time))
);

create index shop_operating_hours_shop_idx
  on public.shop_operating_hours (shop_id, weekday, block_order);

alter table public.shop_operating_hours enable row level security;

-- Owner may read their own shop's hours directly (RLS proof surface). Every
-- mutation is a service-role Express command, so no write grant is issued to
-- authenticated tokens.
grant select on public.shop_operating_hours to authenticated;

create policy shop_hours_select_owner
  on public.shop_operating_hours for select to authenticated
  using (private.owns_shop(shop_id));
