-- P2-04: converge applications, owner invitations, and join codes on one
-- owner-approved employment request. No request path grants employment by
-- itself; one locked acceptance command owns vacancy and one-employment races.

create type public.employment_request_direction as enum (
  'barber_application',
  'owner_invitation',
  'join_code'
);

create type public.employment_request_status as enum (
  'pending',
  'accepted',
  'declined',
  'withdrawn',
  'expired',
  'superseded'
);

create table public.barber_job_profiles (
  barber_id uuid primary key references public.barbers(id) on delete cascade,
  visible boolean not null default false,
  bio text,
  experience_years integer,
  specialties text[] not null default '{}',
  portfolio_media text[] not null default '{}',
  coarse_work_area text,
  schedule_preference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_job_profiles_bio_length
    check (bio is null or char_length(bio) <= 1000),
  constraint barber_job_profiles_experience
    check (experience_years is null or experience_years between 0 and 80),
  constraint barber_job_profiles_specialties_count
    check (cardinality(specialties) <= 20),
  constraint barber_job_profiles_specialty_length
    check (
      array_position(specialties, '') is null
      and char_length(array_to_string(specialties, '')) <= 1600
    ),
  constraint barber_job_profiles_portfolio_count
    check (cardinality(portfolio_media) <= 8),
  constraint barber_job_profiles_portfolio_length
    check (char_length(array_to_string(portfolio_media, '')) <= 4000),
  constraint barber_job_profiles_work_area_length
    check (coarse_work_area is null or char_length(coarse_work_area) <= 120),
  constraint barber_job_profiles_schedule_length
    check (schedule_preference is null or char_length(schedule_preference) <= 240)
);

insert into public.barber_job_profiles (barber_id, visible, bio)
select barber.id, false, nullif(btrim(barber.bio), '')
from public.barbers as barber
on conflict (barber_id) do nothing;

-- Migrate legacy plaintext codes once, then destroy the plaintext source.
alter table public.shop_join_codes rename to legacy_shop_join_codes;
revoke all on table public.legacy_shop_join_codes from anon, authenticated;

create table public.shop_join_codes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  usage_limit integer not null,
  used_count integer not null default 0,
  revoked_at timestamptz,
  version integer not null default 1,
  command_id uuid not null unique,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_join_codes_usage_limit check (usage_limit between 1 and 100),
  constraint shop_join_codes_used_count check (used_count between 0 and usage_limit),
  constraint shop_join_codes_version check (version >= 1),
  constraint shop_join_codes_hash_length check (char_length(code_hash) = 64)
);

create unique index shop_join_codes_one_active_per_shop
  on public.shop_join_codes (shop_id)
  where revoked_at is null;

create index shop_join_codes_shop_created_idx
  on public.shop_join_codes (shop_id, created_at desc);

insert into public.shop_join_codes (
  shop_id,
  code_hash,
  expires_at,
  usage_limit,
  command_id,
  created_by,
  created_at,
  updated_at
)
select
  legacy.shop_id,
  encode(extensions.digest(upper(btrim(legacy.code)), 'sha256'), 'hex'),
  now() + interval '7 days',
  10,
  gen_random_uuid(),
  shop.owner_id,
  legacy.created_at,
  legacy.rotated_at
from public.legacy_shop_join_codes as legacy
join public.shops as shop on shop.id = legacy.shop_id
where shop.owner_id is not null;

drop table public.legacy_shop_join_codes;

create table public.employment_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  direction public.employment_request_direction not null,
  status public.employment_request_status not null default 'pending',
  message text,
  join_code_id uuid references public.shop_join_codes(id) on delete set null,
  created_by uuid not null references public.users(id) on delete restrict,
  resolved_by uuid references public.users(id) on delete restrict,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint employment_requests_message_length
    check (message is null or char_length(message) <= 1000),
  constraint employment_requests_version check (version >= 1),
  constraint employment_requests_resolution check (
    (status = 'pending' and resolved_at is null and resolved_by is null)
    or (status <> 'pending' and resolved_at is not null)
  ),
  constraint employment_requests_expiry_after_creation
    check (expires_at > created_at),
  constraint employment_requests_join_code_direction check (
    (direction = 'join_code' and join_code_id is not null)
    or (direction <> 'join_code' and join_code_id is null)
  ),
  constraint employment_requests_actor_direction check (
    (direction in ('barber_application', 'join_code') and created_by = barber_id)
    or (direction = 'owner_invitation' and created_by <> barber_id)
  ),
  constraint employment_requests_idempotency unique (created_by, idempotency_key)
);

create unique index employment_requests_one_pending_pair
  on public.employment_requests (shop_id, barber_id)
  where status = 'pending';

create index employment_requests_shop_status_created_idx
  on public.employment_requests (shop_id, status, created_at desc, id);

create index employment_requests_barber_status_created_idx
  on public.employment_requests (barber_id, status, created_at desc, id);

create or replace function private.enforce_employment_request_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction in ('barber_application', 'join_code')
     and new.created_by <> new.barber_id then
    raise exception using
      errcode = '42501',
      message = 'The barber must create this employment request.';
  end if;

  if new.direction = 'owner_invitation'
     and not exists (
       select 1
         from public.shops as shop
         join public.users as owner on owner.id = shop.owner_id
        where shop.id = new.shop_id
          and shop.owner_id = new.created_by
          and owner.role = 'shop_owner'
          and owner.requested_role = 'shop_owner'
          and owner.verification_status = 'verified'
          and owner.onboarding_completed
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only the verified owning shop account may create an invitation.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_employment_request_actor()
  from public, anon, authenticated;

create trigger employment_requests_enforce_actor
  before insert or update of shop_id, barber_id, direction, created_by
  on public.employment_requests
  for each row execute function private.enforce_employment_request_actor();

create table public.employment_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.employment_requests(id) on delete restrict,
  employment_id uuid references public.barber_employment(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  barber_id uuid references public.barbers(id) on delete restrict,
  actor_id uuid references public.users(id) on delete restrict,
  event_type text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint employment_events_type check (event_type in (
    'request_created',
    'request_accepted',
    'request_declined',
    'request_withdrawn',
    'request_expired',
    'request_superseded',
    'join_code_rotated',
    'join_code_revoked'
  )),
  constraint employment_events_reason_length
    check (reason is null or char_length(reason) <= 500),
  constraint employment_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index employment_events_request_created_idx
  on public.employment_events (request_id, created_at, id);

create index employment_events_shop_created_idx
  on public.employment_events (shop_id, created_at desc, id);

create table public.employment_join_attempts (
  barber_id uuid primary key references public.barbers(id) on delete cascade,
  failed_attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint employment_join_attempts_nonnegative check (failed_attempts >= 0)
);

-- Backfill the legacy application timeline before sealing the old table.
insert into public.employment_requests (
  shop_id,
  barber_id,
  direction,
  status,
  created_by,
  resolved_by,
  idempotency_key,
  created_at,
  expires_at,
  resolved_at,
  version,
  updated_at
)
select
  application.shop_id,
  application.barber_id,
  'barber_application'::public.employment_request_direction,
  application.status::text::public.employment_request_status,
  application.barber_id,
  case when application.status = 'pending' then null else shop.owner_id end,
  gen_random_uuid(),
  application.created_at,
  greatest(application.created_at + interval '30 days', now() + interval '1 second'),
  case when application.status = 'pending' then null else application.updated_at end,
  1,
  application.updated_at
from public.barber_applications as application
join public.shops as shop on shop.id = application.shop_id
on conflict do nothing;

insert into public.employment_events (
  request_id,
  shop_id,
  barber_id,
  actor_id,
  event_type,
  created_at
)
select
  request.id,
  request.shop_id,
  request.barber_id,
  request.created_by,
  'request_created',
  request.created_at
from public.employment_requests as request;

delete from public.barber_employment where status = 'applied';

revoke all on table public.barber_applications from anon, authenticated;

alter table public.barber_job_profiles enable row level security;
alter table public.shop_join_codes enable row level security;
alter table public.employment_requests enable row level security;
alter table public.employment_events enable row level security;
alter table public.employment_join_attempts enable row level security;

revoke all on table public.barber_job_profiles from anon, authenticated;
revoke all on table public.shop_join_codes from anon, authenticated;
revoke all on table public.employment_requests from anon, authenticated;
revoke all on table public.employment_events from anon, authenticated;
revoke all on table public.employment_join_attempts from anon, authenticated;

grant select on table public.barber_job_profiles to authenticated;
grant select on table public.employment_requests to authenticated;
grant select on table public.employment_events to authenticated;

create policy barber_job_profiles_select_visible_or_self
  on public.barber_job_profiles for select to authenticated
  using (
    barber_id = (select auth.uid())
    or (
      visible
      and exists (
        select 1 from public.users as actor
        where actor.id = (select auth.uid())
          and actor.role = 'shop_owner'
          and actor.requested_role = 'shop_owner'
          and actor.verification_status = 'verified'
          and actor.onboarding_completed
      )
    )
  );

create policy employment_requests_select_participant
  on public.employment_requests for select to authenticated
  using (
    barber_id = (select auth.uid())
    or private.owns_shop(shop_id)
  );

create policy employment_events_select_participant
  on public.employment_events for select to authenticated
  using (
    barber_id = (select auth.uid())
    or private.owns_shop(shop_id)
  );

create or replace function private.is_verified_barber(p_barber_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users as profile
    join public.barbers as barber on barber.id = profile.id
    where profile.id = p_barber_id
      and profile.role = 'barber'
      and profile.requested_role = 'barber'
      and profile.verification_status = 'verified'
      and profile.onboarding_completed
  );
$$;

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

create or replace function public.api_create_employment_request(
  p_actor_id uuid,
  p_direction text,
  p_shop_id uuid default null,
  p_barber_id uuid default null,
  p_message text default null,
  p_idempotency_key uuid default null
)
returns public.employment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_shop public.shops%rowtype;
  target_barber_id uuid;
  normalized_message text;
  existing_request public.employment_requests%rowtype;
  created_request public.employment_requests%rowtype;
begin
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'An idempotency key is required.';
  end if;
  if p_direction not in ('barber_application', 'owner_invitation') then
    raise exception using errcode = '22023', message = 'Unsupported employment request direction.';
  end if;

  normalized_message := nullif(btrim(coalesce(p_message, '')), '');
  if normalized_message is not null and char_length(normalized_message) > 1000 then
    raise exception using errcode = '22023', message = 'Request message must be at most 1000 characters.';
  end if;

  select *
    into existing_request
    from public.employment_requests
   where created_by = p_actor_id
     and idempotency_key = p_idempotency_key;
  if found then
    return existing_request;
  end if;

  if p_direction = 'barber_application' then
    target_barber_id := p_actor_id;
    if not private.is_verified_barber(target_barber_id) then
      raise exception using errcode = '42501', message = 'A verified barber account is required.';
    end if;
  else
    target_barber_id := p_barber_id;
    if not private.is_verified_barber(target_barber_id) then
      raise exception using errcode = '42501', message = 'A verified barber account is required.';
    end if;
    if not exists (
      select 1 from public.barber_job_profiles
      where barber_id = target_barber_id and visible
    ) then
      raise exception using errcode = 'P0002', message = 'Visible barber job profile not found.';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('employment:barber:' || target_barber_id::text, 0)
  );

  if p_direction = 'barber_application' then
    select * into target_shop
      from public.shops
     where id = p_shop_id
     for update;
  else
    select * into target_shop
      from public.shops
     where id = private.owner_shop_id(p_actor_id)
     for update;
  end if;

  if target_shop.id is null then
    raise exception using errcode = 'P0002', message = 'Shop not found.';
  end if;
  if target_shop.lifecycle_status <> 'published'
     or not target_shop.is_hiring
     or target_shop.hiring_open_positions = 0 then
    raise exception using errcode = 'P4024', message = 'This shop has no available hiring opening.';
  end if;
  if exists (
    select 1 from public.barber_employment
    where barber_id = target_barber_id
      and status = 'active'
      and ended_at is null
  ) then
    raise exception using errcode = 'P4094', message = 'This barber already has an active employment.';
  end if;

  select * into existing_request
  from public.employment_requests
  where shop_id = target_shop.id
    and barber_id = target_barber_id
    and status = 'pending'
  for update;
  if found then
    return existing_request;
  end if;

  insert into public.employment_requests (
    shop_id,
    barber_id,
    direction,
    message,
    created_by,
    idempotency_key,
    expires_at
  ) values (
    target_shop.id,
    target_barber_id,
    p_direction::public.employment_request_direction,
    normalized_message,
    p_actor_id,
    p_idempotency_key,
    now() + interval '14 days'
  )
  returning * into created_request;

  insert into public.employment_events (
    request_id, shop_id, barber_id, actor_id, event_type
  ) values (
    created_request.id, created_request.shop_id, created_request.barber_id,
    p_actor_id, 'request_created'
  );

  return created_request;
end;
$$;

create or replace function public.api_create_join_code_request(
  p_barber_id uuid,
  p_code text,
  p_message text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.employment_join_attempts%rowtype;
  code_record public.shop_join_codes%rowtype;
  target_shop public.shops%rowtype;
  existing_request public.employment_requests%rowtype;
  created_request public.employment_requests%rowtype;
  normalized_message text;
begin
  if not private.is_verified_barber(p_barber_id) then
    raise exception using errcode = '42501', message = 'A verified barber account is required.';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'An idempotency key is required.';
  end if;

  select * into existing_request
  from public.employment_requests
  where created_by = p_barber_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'request', to_jsonb(existing_request));
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('employment:barber:' || p_barber_id::text, 0)
  );

  insert into public.employment_join_attempts (barber_id)
  values (p_barber_id)
  on conflict (barber_id) do nothing;

  select * into attempt
  from public.employment_join_attempts
  where barber_id = p_barber_id
  for update;

  if attempt.locked_until is not null and attempt.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'code', 'join_code_rate_limited',
      'retry_at', attempt.locked_until
    );
  end if;

  if attempt.window_started_at < now() - interval '15 minutes' then
    update public.employment_join_attempts
       set failed_attempts = 0,
           window_started_at = now(),
           locked_until = null,
           updated_at = now()
     where barber_id = p_barber_id;
  end if;

  select * into code_record
  from public.shop_join_codes
  where code_hash = encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now()
    and used_count < usage_limit
  for update;

  if not found then
    update public.employment_join_attempts
       set failed_attempts = failed_attempts + 1,
           locked_until = case
             when failed_attempts + 1 >= 5 then now() + interval '15 minutes'
             else null
           end,
           updated_at = now()
     where barber_id = p_barber_id
     returning * into attempt;
    return jsonb_build_object(
      'ok', false,
      'code', case when attempt.locked_until is null then 'invalid_code' else 'join_code_rate_limited' end,
      'retry_at', attempt.locked_until
    );
  end if;

  select * into target_shop
  from public.shops
  where id = code_record.shop_id
  for update;

  if target_shop.lifecycle_status <> 'published'
     or not target_shop.is_hiring
     or target_shop.hiring_open_positions = 0 then
    return jsonb_build_object('ok', false, 'code', 'hiring_full');
  end if;
  if exists (
    select 1 from public.barber_employment
    where barber_id = p_barber_id and status = 'active' and ended_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_employed');
  end if;

  update public.employment_join_attempts
     set failed_attempts = 0,
         window_started_at = now(),
         locked_until = null,
         updated_at = now()
   where barber_id = p_barber_id;

  select * into existing_request
  from public.employment_requests
  where shop_id = code_record.shop_id
    and barber_id = p_barber_id
    and status = 'pending'
  for update;
  if found then
    return jsonb_build_object('ok', true, 'request', to_jsonb(existing_request));
  end if;

  normalized_message := nullif(btrim(coalesce(p_message, '')), '');
  insert into public.employment_requests (
    shop_id, barber_id, direction, message, join_code_id, created_by,
    idempotency_key, expires_at
  ) values (
    code_record.shop_id, p_barber_id, 'join_code', normalized_message,
    code_record.id, p_barber_id, p_idempotency_key,
    least(code_record.expires_at, now() + interval '14 days')
  )
  returning * into created_request;

  update public.shop_join_codes
     set used_count = used_count + 1,
         version = version + 1,
         updated_at = now()
   where id = code_record.id;

  insert into public.employment_events (
    request_id, shop_id, barber_id, actor_id, event_type
  ) values (
    created_request.id, created_request.shop_id, created_request.barber_id,
    p_barber_id, 'request_created'
  );

  return jsonb_build_object('ok', true, 'request', to_jsonb(created_request));
end;
$$;

create or replace function public.api_resolve_employment_request(
  p_owner_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.employment_requests%rowtype;
  target_shop public.shops%rowtype;
  active_employment public.barber_employment%rowtype;
  normalized_reason text;
begin
  if p_action not in ('accept', 'decline') then
    raise exception using errcode = '22023', message = 'Request action must be accept or decline.';
  end if;
  normalized_reason := nullif(btrim(coalesce(p_reason, '')), '');

  select * into target_request
  from public.employment_requests
  where id = p_request_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Employment request not found.';
  end if;
  if target_request.shop_id <> private.owner_shop_id(p_owner_id) then
    raise exception using errcode = '42501', message = 'This request belongs to another shop.';
  end if;
  if target_request.status <> 'pending' or target_request.expires_at <= now() then
    raise exception using errcode = 'P4023', message = 'This employment request is no longer pending.';
  end if;
  if target_request.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This employment request changed since it was loaded.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('employment:barber:' || target_request.barber_id::text, 0)
  );

  select * into target_request
  from public.employment_requests
  where id = p_request_id
  for update;
  if target_request.shop_id <> private.owner_shop_id(p_owner_id) then
    raise exception using errcode = '42501', message = 'This request belongs to another shop.';
  end if;
  if target_request.status <> 'pending' or target_request.expires_at <= now() then
    raise exception using errcode = 'P4023', message = 'This employment request is no longer pending.';
  end if;
  if target_request.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This employment request changed since it was loaded.';
  end if;

  if p_action = 'decline' then
    update public.employment_requests
       set status = 'declined',
           resolved_by = p_owner_id,
           resolved_at = now(),
           version = version + 1,
           updated_at = now()
     where id = target_request.id
     returning * into target_request;

    insert into public.employment_events (
      request_id, shop_id, barber_id, actor_id, event_type, reason
    ) values (
      target_request.id, target_request.shop_id, target_request.barber_id,
      p_owner_id, 'request_declined', normalized_reason
    );

    return jsonb_build_object(
      'request_id', target_request.id,
      'employment_id', null
    );
  end if;

  select * into target_shop
  from public.shops
  where id = target_request.shop_id
  for update;

  if target_shop.lifecycle_status <> 'published'
     or not target_shop.is_hiring
     or target_shop.hiring_open_positions = 0 then
    raise exception using errcode = 'P4024', message = 'The shop has no remaining hiring opening.';
  end if;
  if not private.is_verified_barber(target_request.barber_id) then
    raise exception using errcode = '42501', message = 'The barber is not currently verified.';
  end if;
  if exists (
    select 1 from public.barber_employment
    where barber_id = target_request.barber_id
      and status = 'active'
      and ended_at is null
  ) then
    raise exception using errcode = 'P4094', message = 'This barber already has an active employment.';
  end if;

  insert into public.barber_employment (
    barber_id, shop_id, status, hired_at
  ) values (
    target_request.barber_id,
    target_request.shop_id,
    'active',
    (now() at time zone target_shop.timezone)::date
  )
  returning * into active_employment;

  update public.employment_requests
     set status = 'accepted',
         resolved_by = p_owner_id,
         resolved_at = now(),
         version = version + 1,
         updated_at = now()
   where id = target_request.id
   returning * into target_request;

  insert into public.employment_events (
    request_id, employment_id, shop_id, barber_id, actor_id, event_type, reason
  ) values (
    target_request.id, active_employment.id, target_request.shop_id,
    target_request.barber_id, p_owner_id, 'request_accepted', normalized_reason
  );

  with closed as (
    update public.employment_requests
       set status = 'superseded',
           resolved_at = now(),
           version = version + 1,
           updated_at = now()
     where barber_id = target_request.barber_id
       and id <> target_request.id
       and status = 'pending'
    returning id, shop_id, barber_id
  )
  insert into public.employment_events (
    request_id, employment_id, shop_id, barber_id, actor_id, event_type, reason
  )
  select
    closed.id, active_employment.id, closed.shop_id, closed.barber_id,
    p_owner_id, 'request_superseded', 'Barber accepted employment at another shop.'
  from closed;

  update public.shops
     set hiring_open_positions = case
           when hiring_open_positions is null then null
           else hiring_open_positions - 1
         end,
         is_hiring = case
           when hiring_open_positions is null then true
           when hiring_open_positions - 1 > 0 then true
           else false
         end,
         version = version + 1,
         updated_at = now()
   where id = target_shop.id
   returning * into target_shop;

  return jsonb_build_object(
    'request_id', target_request.id,
    'employment_id', active_employment.id,
    'shop_version', target_shop.version,
    'is_hiring', target_shop.is_hiring,
    'open_positions', target_shop.hiring_open_positions
  );
end;
$$;

create or replace function public.api_withdraw_employment_request(
  p_barber_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.employment_requests%rowtype;
  normalized_reason text;
begin
  normalized_reason := nullif(btrim(coalesce(p_reason, '')), '');
  select * into target_request
  from public.employment_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Employment request not found.';
  end if;
  if target_request.barber_id <> p_barber_id then
    raise exception using errcode = '42501', message = 'This request belongs to another barber.';
  end if;
  if target_request.status <> 'pending' then
    raise exception using errcode = 'P4023', message = 'This employment request is no longer pending.';
  end if;
  if target_request.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This employment request changed since it was loaded.';
  end if;

  update public.employment_requests
     set status = 'withdrawn',
         resolved_by = p_barber_id,
         resolved_at = now(),
         version = version + 1,
         updated_at = now()
   where id = target_request.id;

  insert into public.employment_events (
    request_id, shop_id, barber_id, actor_id, event_type, reason
  ) values (
    target_request.id, target_request.shop_id, target_request.barber_id,
    p_barber_id, 'request_withdrawn', normalized_reason
  );
  return target_request.id;
end;
$$;

create or replace function public.api_expire_employment_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  with expired as (
    update public.employment_requests
       set status = 'expired',
           resolved_at = now(),
           version = version + 1,
           updated_at = now()
     where status = 'pending'
       and expires_at <= now()
    returning id, shop_id, barber_id
  ), events as (
    insert into public.employment_events (
      request_id, shop_id, barber_id, actor_id, event_type, reason
    )
    select id, shop_id, barber_id, null, 'request_expired', 'Request expiry reached.'
    from expired
    returning 1
  )
  select count(*) into affected from events;
  return affected;
end;
$$;

create or replace function public.api_rotate_shop_join_code(
  p_owner_id uuid,
  p_plaintext_code text,
  p_command_id uuid,
  p_expires_in_days integer,
  p_usage_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_shop_id uuid;
  existing_record public.shop_join_codes%rowtype;
  new_record public.shop_join_codes%rowtype;
begin
  if p_expires_in_days not between 1 and 30 or p_usage_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Join-code expiry or usage limit is invalid.';
  end if;
  target_shop_id := private.owner_shop_id(p_owner_id);
  if target_shop_id is null then
    raise exception using errcode = 'P0002', message = 'Owned shop not found.';
  end if;

  select * into existing_record
  from public.shop_join_codes
  where command_id = p_command_id;
  if found then
    return jsonb_build_object(
      'id', existing_record.id,
      'active', existing_record.revoked_at is null and existing_record.expires_at > now()
        and existing_record.used_count < existing_record.usage_limit,
      'expires_at', existing_record.expires_at,
      'usage_limit', existing_record.usage_limit,
      'used_count', existing_record.used_count,
      'version', existing_record.version
    );
  end if;

  update public.shop_join_codes
     set revoked_at = now(),
         version = version + 1,
         updated_at = now()
   where shop_id = target_shop_id and revoked_at is null;

  insert into public.shop_join_codes (
    shop_id, code_hash, expires_at, usage_limit, command_id, created_by
  ) values (
    target_shop_id,
    encode(extensions.digest(upper(btrim(p_plaintext_code)), 'sha256'), 'hex'),
    now() + make_interval(days => p_expires_in_days),
    p_usage_limit,
    p_command_id,
    p_owner_id
  )
  returning * into new_record;

  insert into public.employment_events (
    request_id, shop_id, actor_id, event_type, metadata
  ) values (
    null, target_shop_id, p_owner_id, 'join_code_rotated',
    jsonb_build_object('join_code_id', new_record.id)
  );

  return jsonb_build_object(
    'id', new_record.id,
    'active', true,
    'expires_at', new_record.expires_at,
    'usage_limit', new_record.usage_limit,
    'used_count', new_record.used_count,
    'version', new_record.version,
    'code', upper(btrim(p_plaintext_code))
  );
end;
$$;

create or replace function public.api_revoke_shop_join_code(
  p_owner_id uuid,
  p_expected_version integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_shop_id uuid;
  target_code public.shop_join_codes%rowtype;
begin
  target_shop_id := private.owner_shop_id(p_owner_id);
  select * into target_code
  from public.shop_join_codes
  where shop_id = target_shop_id and revoked_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Active join code not found.';
  end if;
  if target_code.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This join code changed since it was loaded.';
  end if;

  update public.shop_join_codes
     set revoked_at = now(),
         version = version + 1,
         updated_at = now()
   where id = target_code.id;

  insert into public.employment_events (
    request_id, shop_id, actor_id, event_type, reason,
    metadata
  ) values (
    null, target_shop_id, p_owner_id, 'join_code_revoked',
    nullif(btrim(p_reason), ''),
    jsonb_build_object('join_code_id', target_code.id)
  );
  return target_code.id;
end;
$$;

-- Disable legacy activators. The Express router no longer calls them, and
-- service-role execution is removed so a future route cannot revive the bypass.
revoke all on function public.api_create_barber_application(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.api_resolve_barber_application(uuid, public.barber_application_status, date)
  from public, anon, authenticated, service_role;
revoke all on function public.api_approve_employment(uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function public.api_join_shop_by_code(uuid, text)
  from public, anon, authenticated, service_role;

drop function public.api_create_barber_application(uuid, uuid);
drop function public.api_resolve_barber_application(uuid, public.barber_application_status, date);
drop function public.api_approve_employment(uuid, date);
drop function public.api_join_shop_by_code(uuid, text);

revoke all on function private.is_verified_barber(uuid) from public, anon, authenticated;
revoke all on function private.owner_shop_id(uuid) from public, anon, authenticated;

revoke all on function public.api_create_employment_request(uuid, text, uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.api_create_join_code_request(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.api_resolve_employment_request(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.api_withdraw_employment_request(uuid, uuid, integer, text)
  from public, anon, authenticated;
revoke all on function public.api_expire_employment_requests()
  from public, anon, authenticated;
revoke all on function public.api_rotate_shop_join_code(uuid, text, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.api_revoke_shop_join_code(uuid, integer, text)
  from public, anon, authenticated;

grant execute on function public.api_create_employment_request(uuid, text, uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.api_create_join_code_request(uuid, text, text, uuid)
  to service_role;
grant execute on function public.api_resolve_employment_request(uuid, uuid, integer, text, text)
  to service_role;
grant execute on function public.api_withdraw_employment_request(uuid, uuid, integer, text)
  to service_role;
grant execute on function public.api_expire_employment_requests()
  to service_role;
grant execute on function public.api_rotate_shop_join_code(uuid, text, uuid, integer, integer)
  to service_role;
grant execute on function public.api_revoke_shop_join_code(uuid, integer, text)
  to service_role;
