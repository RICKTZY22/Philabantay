-- P2-06 (STAFF-01) slice 1: schema for owner-authoritative schedules and
-- versioned barber change requests.
--
-- Before this packet a barber could rewrite their own weekly patterns and
-- author their own exceptions, and "approving" a change request was a bare
-- status UPDATE that never wrote the resulting schedule. This migration adds
-- the optimistic-concurrency token, the structured request shape, the
-- provenance of every exception, and an immutable audit trail. The commands
-- themselves land in the next migration so new enum labels are never used in
-- the transaction that creates them.

-- New types, not ALTER TYPE ... ADD VALUE, so they are usable immediately.
create type public.shift_change_request_kind as enum ('time_off', 'different_hours');
create type public.shift_exception_source as enum ('owner', 'change_request');

-- ---------------------------------------------------------------------------
-- One concurrency token per staff roster, mirroring
-- provider_qualification_revisions from P2-05.

create table public.staff_schedule_revisions (
  employment_id uuid primary key
    references public.barber_employment(id) on delete cascade,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint staff_schedule_revisions_version check (version >= 1)
);

insert into public.staff_schedule_revisions (employment_id)
select employment.id from public.barber_employment as employment
on conflict (employment_id) do nothing;

create trigger staff_schedule_revisions_set_updated_at
  before update on public.staff_schedule_revisions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Structured, versioned change requests.

alter table public.shift_change_requests
  add column if not exists version integer not null default 1,
  add column if not exists requested_kind public.shift_change_request_kind
    not null default 'time_off',
  add column if not exists requested_start_time time,
  add column if not exists requested_end_time time,
  add column if not exists resolved_by uuid references public.users(id) on delete restrict,
  add column if not exists resolved_at timestamptz,
  add column if not exists decision_note text,
  add column if not exists idempotency_key uuid,
  add column if not exists applied_exception_id uuid
    references public.shift_exceptions(id) on delete set null;

update public.shift_change_requests
   set idempotency_key = gen_random_uuid()
 where idempotency_key is null;

-- Historical rows resolved before this packet have no recorded decision time;
-- fall back to their last update so the resolution constraint holds.
update public.shift_change_requests
   set resolved_at = updated_at
 where status <> 'pending' and resolved_at is null;

-- `idempotency_key` stays nullable and the resolution invariant stays absent
-- until the next migration replaces the pre-P2-06 commands. The old
-- `api_create_shift_change_request` inserts no key and the old PATCH route sets
-- a status without a decision time, so tightening here would break them while
-- they are still the live write path. Slice 2 adds both once nothing writes
-- these tables outside the new owner-authoritative commands.

alter table public.shift_change_requests
  drop constraint if exists shift_change_requests_version,
  add constraint shift_change_requests_version check (version >= 1),
  drop constraint if exists shift_change_requests_kind_times,
  add constraint shift_change_requests_kind_times check (
    (requested_kind = 'time_off'
      and requested_start_time is null and requested_end_time is null)
    or (requested_kind = 'different_hours'
      and requested_start_time is not null and requested_end_time is not null
      and requested_start_time < requested_end_time)
  ),
  drop constraint if exists shift_change_requests_decision_note_length,
  add constraint shift_change_requests_decision_note_length check (
    decision_note is null or char_length(btrim(decision_note)) between 1 and 500
  ),
  drop constraint if exists shift_change_requests_idempotency,
  add constraint shift_change_requests_idempotency
    unique (barber_id, idempotency_key);

-- A barber may not stack two open requests for the same working day.
create unique index if not exists shift_change_requests_one_pending_per_day
  on public.shift_change_requests (employment_id, date)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Exception provenance: who wrote it, and whether an approval produced it.

alter table public.shift_exceptions
  add column if not exists source public.shift_exception_source not null default 'owner',
  add column if not exists created_by uuid references public.users(id) on delete restrict,
  add column if not exists change_request_id uuid
    references public.shift_change_requests(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Immutable schedule audit trail.

create table public.staff_schedule_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  employment_id uuid references public.barber_employment(id) on delete restrict,
  barber_id uuid references public.barbers(id) on delete restrict,
  request_id uuid references public.shift_change_requests(id) on delete restrict,
  exception_id uuid references public.shift_exceptions(id) on delete set null,
  actor_id uuid references public.users(id) on delete restrict,
  event_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staff_schedule_events_type check (event_type in (
    'patterns_replaced',
    'exception_upserted',
    'exception_removed',
    'change_request_created',
    'change_request_approved',
    'change_request_declined'
  )),
  constraint staff_schedule_events_reason_length
    check (reason is null or char_length(reason) <= 500),
  constraint staff_schedule_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index staff_schedule_events_shop_created_idx
  on public.staff_schedule_events (shop_id, created_at desc, id);
create index staff_schedule_events_request_created_idx
  on public.staff_schedule_events (request_id, created_at, id);

-- ---------------------------------------------------------------------------
-- Row-level security. Every write stays a service-role command; browsers read
-- only their own participant rows.

alter table public.staff_schedule_revisions enable row level security;
alter table public.staff_schedule_events enable row level security;

revoke all on table public.staff_schedule_revisions from public, anon, authenticated;
revoke all on table public.staff_schedule_events from public, anon, authenticated;

grant select on table public.staff_schedule_revisions to authenticated;
grant select on table public.staff_schedule_events to authenticated;

create policy staff_schedule_revisions_select_participant
  on public.staff_schedule_revisions for select to authenticated
  using (
    exists (
      select 1
        from public.barber_employment as employment
       where employment.id = staff_schedule_revisions.employment_id
         and (
           employment.barber_id = (select auth.uid())
           or private.owns_shop(employment.shop_id)
         )
    )
  );

create policy staff_schedule_events_select_participant
  on public.staff_schedule_events for select to authenticated
  using (
    barber_id = (select auth.uid())
    or private.owns_shop(shop_id)
  );

-- Append-only: no update or delete policy exists for either table, and the
-- prior packets' event tables follow the same rule.
