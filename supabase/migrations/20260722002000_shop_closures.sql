-- P2-02 (slice 2): shop date-specific closures / replacement hours.
--
-- A closure overrides the weekly operating hours for one local date: either the
-- shop is fully closed that day, or it opens with replacement hours. One row per
-- (shop, date). Owner-scoped like operating hours; writes are service-role
-- Express commands, reads allowed for the owner (RLS proof surface).
create table public.shop_closures (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  local_date date not null,
  closed boolean not null default true,
  replacement_open_time time,
  replacement_close_time time,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_closures_unique_date unique (shop_id, local_date),
  constraint shop_closures_reason_length check (reason is null or char_length(reason) <= 200),
  constraint shop_closures_replacement_present_when_open
    check (
      closed
      or (
        replacement_open_time is not null
        and replacement_close_time is not null
        and replacement_open_time < replacement_close_time
      )
    )
);

create index shop_closures_shop_date_idx on public.shop_closures (shop_id, local_date);

alter table public.shop_closures enable row level security;

grant select on public.shop_closures to authenticated;

create policy shop_closures_select_owner
  on public.shop_closures for select to authenticated
  using (private.owns_shop(shop_id));
