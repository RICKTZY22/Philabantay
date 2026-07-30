-- P2-07 (slice 1): the availability inputs the claim engine could not see.
--
-- Measured before writing this. private.require_bookable_appointment_slot from
-- 20260722000600 is the authoritative claim gate, and it contains zero
-- references to lifecycle_status, shop_operating_hours, shop_closures,
-- service_qualifications, owner_provider_profiles, chair_count,
-- default_buffer_min, or booking_mode. Two consequences were reproduced against
-- the live local stack before this file existed, both returning 201 Created:
--
--   1. a customer booked a barber at a shop in `draft`, while the public
--      catalogue correctly refused to list that same shop;
--   2. a customer booked a date the owner had marked as a full-day closure.
--
-- This slice only adds columns and the qualification rows the new engine needs.
-- 20260730000200 replaces the engine itself. Splitting them keeps the data
-- backfill reviewable on its own, because it is the part that can silently
-- change who is bookable.

-- 1. Shop booking window ------------------------------------------------------
-- The phase contract lists lead time and booking horizon as availability
-- inputs, but neither column existed.
--
-- Both defaults are exact no-ops, because a migration must not invent a policy
-- the owner never chose. Zero lead time changes nothing: the gate already
-- requires a future start. A NULL horizon means "no limit", so shops keep taking
-- bookings as far ahead as they do today; picking any finite default would have
-- silently closed bookings beyond it for every existing shop.
alter table public.shops
  add column min_lead_minutes integer not null default 0,
  add column max_advance_days integer;

alter table public.shops
  add constraint shops_min_lead_range
    check (min_lead_minutes between 0 and 10080),
  add constraint shops_max_advance_range
    check (max_advance_days is null or max_advance_days between 1 and 365);

-- 2. Per-service cleanup buffer ----------------------------------------------
-- Null means "inherit shops.default_buffer_min", so an owner who never opens a
-- service keeps precisely the shop-wide buffer they already configured. Only an
-- explicit per-service value overrides it.
alter table public.services
  add column buffer_min integer;

alter table public.services
  add constraint services_buffer_range
    check (buffer_min is null or buffer_min between 0 and 120);

-- 3. Assignment intent (BOOK-02) ---------------------------------------------
create type public.appointment_barber_preference as enum ('exact', 'preferred', 'any');
create type public.appointment_assignment_source as enum ('customer', 'owner', 'automatic');

alter table public.appointments
  add column barber_preference public.appointment_barber_preference not null default 'exact',
  add column requested_barber_id uuid references public.barbers(id) on delete restrict,
  add column assignment_source public.appointment_assignment_source not null default 'customer',
  add column assignment_reason text,
  add column booked_buffer_min integer not null default 0;

-- Every existing appointment was created by naming one barber directly, which
-- is exactly `exact` intent with the requested provider equal to the assigned
-- one. Backfill before the consistency constraint lands.
update public.appointments
  set requested_barber_id = barber_id
  where requested_barber_id is null;

-- The buffer snapshot follows the shop's configured default. Existing rows are
-- not re-validated against it: the snapshot only participates in conflict
-- checks for *future* bookings, so an already-accepted back-to-back pair stays
-- valid while new bookings must respect the gap.
update public.appointments as appointment
  set booked_buffer_min = shop.default_buffer_min
  from public.shops as shop
  where shop.id = appointment.shop_id
    and shop.default_buffer_min <> 0;

alter table public.appointments
  add constraint appointments_snapshot_buffer
    check (booked_buffer_min between 0 and 120),
  add constraint appointments_assignment_reason_length
    check (
      assignment_reason is null
      or char_length(btrim(assignment_reason)) between 3 and 500
    ),
  -- `any` is the only intent with no named provider, and the other two always
  -- carry one. Stated as an equivalence so neither side can drift.
  add constraint appointments_requested_barber_matches_preference
    check ((barber_preference = 'any') = (requested_barber_id is null));

-- 4. Snapshot the buffer wherever an appointment is written -------------------
-- Redefined forward so the snapshot cannot depend on which command inserted the
-- row. Everything else in this trigger is unchanged from 20260718000100.
create or replace function private.prepare_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_name text;
  service_duration integer;
  service_price integer;
  service_is_active boolean;
  service_buffer integer;
  shop_buffer integer;
  actor_id uuid := (select auth.uid());
begin
  select s.name, s.duration_min, s.price_cents, s.active, s.buffer_min
    into service_name, service_duration, service_price, service_is_active, service_buffer
  from public.services as s
  where s.id = new.service_id
    and s.shop_id = new.shop_id;

  if service_duration is null then
    raise exception using
      errcode = '23503',
      message = 'Service does not belong to the appointment shop.';
  end if;

  if (tg_op = 'INSERT'
      or new.service_id is distinct from old.service_id
      or new.shop_id is distinct from old.shop_id)
    and not service_is_active then
    raise exception using
      errcode = '23514',
      message = 'Inactive services cannot be booked.';
  end if;

  if not private.is_active_barber_for_shop(new.shop_id, new.barber_id) then
    raise exception using
      errcode = '23514',
      message = 'Barber is not active at the appointment shop.';
  end if;

  if new.starts_at <= now() and tg_op = 'INSERT' then
    raise exception using
      errcode = '23514',
      message = 'Appointment must start in the future.';
  end if;

  if tg_op = 'INSERT' and actor_id is not null then
    new.customer_id := actor_id;
    new.status := 'requested';
  end if;

  if tg_op = 'INSERT'
      or new.service_id is distinct from old.service_id
      or new.shop_id is distinct from old.shop_id then
    select shop.default_buffer_min
      into shop_buffer
    from public.shops as shop
    where shop.id = new.shop_id;

    new.booked_service_name := service_name;
    new.booked_duration_min := service_duration;
    new.booked_price_cents := service_price;
    new.booked_buffer_min := coalesce(service_buffer, shop_buffer, 0);
  end if;

  -- The buffer deliberately does NOT extend ends_at. An appointment ends when
  -- the service ends; the buffer is cleanup time that the engine adds on top
  -- when it tests for conflicts.
  new.ends_at := new.starts_at + make_interval(mins => new.booked_duration_min);
  if tg_op = 'INSERT' and new.status = 'requested' then
    new.expires_at := coalesce(new.expires_at, now() + interval '15 minutes');
  end if;
  return new;
end;
$$;

-- 5. Qualification backfill ---------------------------------------------------
-- The new engine requires an active service_qualifications row before anyone
-- can be booked. P2-05 created that table but nothing in the booking path ever
-- read it, so most shops have no rows at all: at the time of writing the
-- development shop had 0 and only the integration fixture shop had any. Turning
-- the requirement on without this backfill would make every such shop
-- unbookable, which is the "do not tighten before the writers exist" trap.
--
-- An owner who employs a barber while a service is active has already allowed
-- that pairing, so the owner is recorded as the grantor. Existing rows are left
-- exactly as they are, including deliberate revocations, because ON CONFLICT
-- DO NOTHING never resurrects a revoked grant.
with candidate as (
  select
    service.shop_id,
    service.id as service_id,
    employment.barber_id as provider_user_id,
    shop.owner_id
  from public.services as service
  join public.shops as shop
    on shop.id = service.shop_id
  join public.barber_employment as employment
    on employment.shop_id = service.shop_id
   and employment.status = 'active'
   and employment.ended_at is null
  where service.active
),
granted as (
  insert into public.service_qualifications (
    shop_id,
    service_id,
    provider_user_id,
    active,
    granted_by
  )
  select distinct
    candidate.shop_id,
    candidate.service_id,
    candidate.provider_user_id,
    true,
    candidate.owner_id
  from candidate
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

-- 6. Supporting index ---------------------------------------------------------
-- Chair capacity sweeps every capacity-blocking appointment at one shop that
-- overlaps a candidate window. appointments_shop_starts_at_idx already covers
-- the shop/start lookup; this partial index keeps the sweep off the cancelled
-- and completed history, which is the bulk of the table over time.
create index appointments_shop_capacity_idx
  on public.appointments (shop_id, starts_at, ends_at)
  where status in (
    'requested',
    'confirmed',
    'checked_in',
    'in_progress',
    'awaiting_confirmation'
  );
