-- P2-05: owner-as-provider without role switching, plus owner-authoritative,
-- shop-scoped service qualifications and barber requests.

create table public.owner_provider_profiles (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete restrict,
  active boolean not null default false,
  accepting_bookings boolean not null default false,
  rating numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  version integer not null default 1,
  granted_by uuid references public.users(id) on delete restrict,
  granted_at timestamptz,
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_provider_profiles_owner_unique unique (owner_id),
  constraint owner_provider_profiles_rating check (rating between 0 and 5),
  constraint owner_provider_profiles_rating_count check (rating_count >= 0),
  constraint owner_provider_profiles_version check (version >= 1),
  constraint owner_provider_profiles_accepting_active
    check (active or not accepting_bookings),
  constraint owner_provider_profiles_state check (
    (active and granted_by is not null and granted_at is not null
      and revoked_by is null and revoked_at is null)
    or
    (not active and accepting_bookings = false)
  )
);

create table public.provider_qualification_revisions (
  shop_id uuid not null references public.shops(id) on delete cascade,
  provider_user_id uuid not null references public.users(id) on delete cascade,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (shop_id, provider_user_id),
  constraint provider_qualification_revisions_version check (version >= 1)
);

create table public.service_qualifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_id uuid not null,
  provider_user_id uuid not null references public.users(id) on delete restrict,
  active boolean not null default true,
  granted_by uuid not null references public.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_qualifications_service_shop_fk
    foreign key (service_id, shop_id)
    references public.services(id, shop_id)
    on delete cascade,
  constraint service_qualifications_identity_unique
    unique (shop_id, service_id, provider_user_id),
  constraint service_qualifications_state check (
    (active and revoked_by is null and revoked_at is null)
    or
    (not active and revoked_by is not null and revoked_at is not null)
  )
);

create index service_qualifications_provider_active_idx
  on public.service_qualifications (shop_id, provider_user_id, active, service_id);

create type public.service_qualification_request_status as enum (
  'pending',
  'approved',
  'declined',
  'withdrawn'
);

create table public.service_qualification_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_id uuid not null,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  status public.service_qualification_request_status not null default 'pending',
  message text,
  idempotency_key uuid not null,
  resolved_by uuid references public.users(id) on delete restrict,
  resolution_reason text,
  resolved_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_qualification_requests_service_shop_fk
    foreign key (service_id, shop_id)
    references public.services(id, shop_id)
    on delete cascade,
  constraint service_qualification_requests_idempotency
    unique (barber_id, idempotency_key),
  constraint service_qualification_requests_message_length
    check (message is null or char_length(message) <= 500),
  constraint service_qualification_requests_reason_length
    check (resolution_reason is null or char_length(resolution_reason) <= 500),
  constraint service_qualification_requests_version check (version >= 1),
  constraint service_qualification_requests_resolution check (
    (status = 'pending' and resolved_by is null and resolved_at is null)
    or
    (status <> 'pending' and resolved_by is not null and resolved_at is not null)
  )
);

create unique index service_qualification_requests_one_pending
  on public.service_qualification_requests (shop_id, service_id, barber_id)
  where status = 'pending';

create index service_qualification_requests_shop_status_idx
  on public.service_qualification_requests (shop_id, status, created_at, id);

create table public.provider_capability_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  provider_user_id uuid not null references public.users(id) on delete restrict,
  service_id uuid references public.services(id) on delete restrict,
  request_id uuid references public.service_qualification_requests(id) on delete restrict,
  actor_id uuid not null references public.users(id) on delete restrict,
  event_type text not null,
  reason text,
  command_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint provider_capability_events_type check (event_type in (
    'owner_provider_enabled',
    'owner_provider_disabled',
    'owner_accepting_changed',
    'qualification_granted',
    'qualification_revoked',
    'qualification_requested',
    'qualification_request_approved',
    'qualification_request_declined'
  )),
  constraint provider_capability_events_reason_length
    check (reason is null or char_length(reason) <= 500),
  constraint provider_capability_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index provider_capability_events_provider_idx
  on public.provider_capability_events (shop_id, provider_user_id, created_at, id);

create table private.provider_command_results (
  command_id uuid primary key,
  command_kind text not null,
  actor_id uuid not null,
  command_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.owner_provider_profiles enable row level security;
alter table public.owner_provider_profiles force row level security;
alter table public.provider_qualification_revisions enable row level security;
alter table public.provider_qualification_revisions force row level security;
alter table public.service_qualifications enable row level security;
alter table public.service_qualifications force row level security;
alter table public.service_qualification_requests enable row level security;
alter table public.service_qualification_requests force row level security;
alter table public.provider_capability_events enable row level security;
alter table public.provider_capability_events force row level security;

revoke all on table public.owner_provider_profiles from public, anon, authenticated;
revoke all on table public.provider_qualification_revisions from public, anon, authenticated;
revoke all on table public.service_qualifications from public, anon, authenticated;
revoke all on table public.service_qualification_requests from public, anon, authenticated;
revoke all on table public.provider_capability_events from public, anon, authenticated;
revoke all on table private.provider_command_results from public, anon, authenticated;

grant select, insert, update on table public.owner_provider_profiles to service_role;
grant select, insert, update on table public.provider_qualification_revisions to service_role;
grant select, insert, update on table public.service_qualifications to service_role;
grant select, insert, update on table public.service_qualification_requests to service_role;
grant select, insert on table public.provider_capability_events to service_role;
grant select, insert on table private.provider_command_results to service_role;

create or replace function private.ensure_provider_qualification_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    insert into public.provider_qualification_revisions (
      shop_id,
      provider_user_id
    )
    values (new.shop_id, new.barber_id)
    on conflict (shop_id, provider_user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.ensure_provider_qualification_revision() from public;

create trigger barber_employment_provider_revision
  after insert or update of status on public.barber_employment
  for each row execute function private.ensure_provider_qualification_revision();

insert into public.provider_qualification_revisions (shop_id, provider_user_id)
select employment.shop_id, employment.barber_id
from public.barber_employment as employment
where employment.status = 'active'
on conflict (shop_id, provider_user_id) do nothing;

create or replace function private.require_owner_provider_actor(
  p_actor_id uuid,
  p_shop_id uuid default null
)
returns public.shops
language plpgsql
security definer
set search_path = ''
as $$
declare
  shop public.shops;
begin
  select candidate.*
  into shop
  from public.shops as candidate
  join public.users as actor on actor.id = candidate.owner_id
  where candidate.owner_id = p_actor_id
    and (p_shop_id is null or candidate.id = p_shop_id)
    and actor.role = 'shop_owner'
    and actor.verification_status = 'verified'
    and actor.onboarding_completed
  for update of candidate;

  if shop.id is null then
    raise exception using
      errcode = 'P4031',
      message = 'A verified owner may manage providers only for their own shop.';
  end if;
  return shop;
end;
$$;

revoke all on function private.require_owner_provider_actor(uuid, uuid) from public;
grant execute on function private.require_owner_provider_actor(uuid, uuid) to service_role;

create or replace function private.provider_is_eligible(
  p_shop_id uuid,
  p_provider_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.owner_provider_profiles as owner_provider
    join public.users as profile on profile.id = owner_provider.owner_id
    where owner_provider.shop_id = p_shop_id
      and owner_provider.owner_id = p_provider_user_id
      and owner_provider.active
      and profile.role = 'shop_owner'
      and profile.verification_status = 'verified'
  )
  or exists (
    select 1
    from public.barber_employment as employment
    join public.users as profile on profile.id = employment.barber_id
    where employment.shop_id = p_shop_id
      and employment.barber_id = p_provider_user_id
      and employment.status = 'active'
      and profile.role = 'barber'
      and profile.verification_status = 'verified'
  );
$$;

revoke all on function private.provider_is_eligible(uuid, uuid) from public;
grant execute on function private.provider_is_eligible(uuid, uuid) to service_role;

create or replace function public.api_set_owner_provider_capability(
  p_actor_id uuid,
  p_expected_version integer,
  p_active boolean,
  p_accepting_bookings boolean,
  p_reason text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  shop public.shops;
  current_profile public.owner_provider_profiles;
  result jsonb;
  command_hash text;
  prior private.provider_command_results;
  next_version integer;
  was_active boolean := false;
  was_accepting boolean := false;
begin
  if p_expected_version < 0
     or p_reason is null
     or char_length(btrim(p_reason)) not between 3 and 500
     or p_command_id is null
     or (not p_active and p_accepting_bookings) then
    raise exception using errcode = '22023', message = 'Invalid owner provider capability command.';
  end if;

  shop := private.require_owner_provider_actor(p_actor_id, null);
  command_hash := encode(extensions.digest(
    concat_ws('|', p_actor_id, p_expected_version, p_active, p_accepting_bookings, btrim(p_reason)),
    'sha256'
  ), 'hex');

  select command.*
  into prior
  from private.provider_command_results as command
  where command.command_id = p_command_id;

  if prior.command_id is not null then
    if prior.command_kind <> 'set_owner_provider_capability'
       or prior.actor_id <> p_actor_id
       or prior.command_hash <> command_hash then
      raise exception using errcode = 'P4096', message = 'This command id was already used with different input.';
    end if;
    return prior.result;
  end if;

  select profile.*
  into current_profile
  from public.owner_provider_profiles as profile
  where profile.shop_id = shop.id
  for update;

  if current_profile.shop_id is null then
    if p_expected_version <> 0 then
      raise exception using errcode = 'P4020', message = 'Owner provider settings changed. Reload and try again.';
    end if;
    next_version := 1;
    insert into public.owner_provider_profiles (
      shop_id, owner_id, active, accepting_bookings, version,
      granted_by, granted_at, revoked_by, revoked_at
    )
    values (
      shop.id, p_actor_id, p_active, p_accepting_bookings, next_version,
      case when p_active then p_actor_id else null end,
      case when p_active then now() else null end,
      case when p_active then null else p_actor_id end,
      case when p_active then null else now() end
    )
    returning * into current_profile;
  else
    was_active := current_profile.active;
    was_accepting := current_profile.accepting_bookings;
    if current_profile.owner_id <> p_actor_id then
      raise exception using errcode = 'P4031', message = 'Owner provider capability is scoped to the owning account.';
    end if;
    if current_profile.version <> p_expected_version then
      raise exception using errcode = 'P4020', message = 'Owner provider settings changed. Reload and try again.';
    end if;
    next_version := current_profile.version + 1;
    update public.owner_provider_profiles
    set active = p_active,
        accepting_bookings = p_accepting_bookings,
        version = next_version,
        granted_by = case
          when p_active and not current_profile.active then p_actor_id
          else granted_by
        end,
        granted_at = case
          when p_active and not current_profile.active then now()
          else granted_at
        end,
        revoked_by = case when p_active then null else p_actor_id end,
        revoked_at = case when p_active then null else now() end,
        updated_at = now()
    where shop_id = shop.id
    returning * into current_profile;
  end if;

  insert into public.provider_qualification_revisions (shop_id, provider_user_id)
  values (shop.id, p_actor_id)
  on conflict (shop_id, provider_user_id) do nothing;

  insert into public.provider_capability_events (
    shop_id, provider_user_id, actor_id, event_type, reason, command_id, metadata
  )
  values (
    shop.id,
    p_actor_id,
    p_actor_id,
    case
      when p_active and not was_active then 'owner_provider_enabled'
      when not p_active and was_active then 'owner_provider_disabled'
      else 'owner_accepting_changed'
    end,
    btrim(p_reason),
    p_command_id,
    jsonb_build_object(
      'active', p_active,
      'accepting_bookings', p_accepting_bookings,
      'previous_active', was_active,
      'previous_accepting_bookings', was_accepting
    )
  );

  result := to_jsonb(current_profile);
  insert into private.provider_command_results (
    command_id, command_kind, actor_id, command_hash, result
  )
  values (
    p_command_id, 'set_owner_provider_capability', p_actor_id, command_hash, result
  );
  return result;
end;
$$;

revoke all on function public.api_set_owner_provider_capability(
  uuid, integer, boolean, boolean, text, uuid
) from public, anon, authenticated;
grant execute on function public.api_set_owner_provider_capability(
  uuid, integer, boolean, boolean, text, uuid
) to service_role;

create or replace function public.api_set_provider_qualifications(
  p_actor_id uuid,
  p_provider_user_id uuid,
  p_expected_version integer,
  p_service_ids uuid[],
  p_reason text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  shop public.shops;
  revision public.provider_qualification_revisions;
  service_count integer;
  command_hash text;
  prior private.provider_command_results;
  result jsonb;
  service_row record;
begin
  if p_provider_user_id is null
     or p_expected_version < 1
     or p_service_ids is null
     or p_reason is null
     or char_length(btrim(p_reason)) not between 3 and 500
     or p_command_id is null then
    raise exception using errcode = '22023', message = 'Invalid service qualification command.';
  end if;

  if cardinality(p_service_ids) <> (
    select count(distinct service_id) from unnest(p_service_ids) as service_id
  ) then
    raise exception using errcode = '22023', message = 'Service ids must be unique.';
  end if;

  shop := private.require_owner_provider_actor(p_actor_id, null);
  command_hash := encode(extensions.digest(
    concat_ws(
      '|', p_actor_id, p_provider_user_id, p_expected_version,
      array_to_string(p_service_ids, ','), btrim(p_reason)
    ),
    'sha256'
  ), 'hex');

  select command.*
  into prior
  from private.provider_command_results as command
  where command.command_id = p_command_id;

  if prior.command_id is not null then
    if prior.command_kind <> 'set_provider_qualifications'
       or prior.actor_id <> p_actor_id
       or prior.command_hash <> command_hash then
      raise exception using errcode = 'P4096', message = 'This command id was already used with different input.';
    end if;
    return prior.result;
  end if;

  if not private.provider_is_eligible(shop.id, p_provider_user_id) then
    raise exception using errcode = 'P4031', message = 'Qualifications require active employment or this shop''s owner-provider capability.';
  end if;

  select count(*)
  into service_count
  from public.services as service
  where service.shop_id = shop.id
    and service.id = any(p_service_ids);

  if service_count <> cardinality(p_service_ids) then
    raise exception using errcode = '22023', message = 'Every qualification service must belong to this shop.';
  end if;

  insert into public.provider_qualification_revisions (shop_id, provider_user_id)
  values (shop.id, p_provider_user_id)
  on conflict (shop_id, provider_user_id) do nothing;

  select current_revision.*
  into revision
  from public.provider_qualification_revisions as current_revision
  where current_revision.shop_id = shop.id
    and current_revision.provider_user_id = p_provider_user_id
  for update;

  if revision.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'Provider qualifications changed. Reload and try again.';
  end if;

  for service_row in
    select qualification.id, qualification.service_id
    from public.service_qualifications as qualification
    where qualification.shop_id = shop.id
      and qualification.provider_user_id = p_provider_user_id
      and qualification.active
      and not (qualification.service_id = any(p_service_ids))
    for update
  loop
    update public.service_qualifications
    set active = false,
        revoked_by = p_actor_id,
        revoked_at = now(),
        updated_at = now()
    where id = service_row.id;
    insert into public.provider_capability_events (
      shop_id, provider_user_id, service_id, actor_id, event_type, reason, command_id
    )
    values (
      shop.id, p_provider_user_id, service_row.service_id, p_actor_id,
      'qualification_revoked', btrim(p_reason), p_command_id
    );
  end loop;

  for service_row in
    select requested.id
    from public.services as requested
    where requested.shop_id = shop.id
      and requested.id = any(p_service_ids)
  loop
    if not exists (
      select 1
      from public.service_qualifications as qualification
      where qualification.shop_id = shop.id
        and qualification.provider_user_id = p_provider_user_id
        and qualification.service_id = service_row.id
        and qualification.active
    ) then
      insert into public.service_qualifications (
        shop_id, service_id, provider_user_id, active,
        granted_by, granted_at, revoked_by, revoked_at
      )
      values (
        shop.id, service_row.id, p_provider_user_id, true,
        p_actor_id, now(), null, null
      )
      on conflict (shop_id, service_id, provider_user_id)
      do update set
        active = true,
        granted_by = excluded.granted_by,
        granted_at = excluded.granted_at,
        revoked_by = null,
        revoked_at = null,
        updated_at = now();
      insert into public.provider_capability_events (
        shop_id, provider_user_id, service_id, actor_id, event_type, reason, command_id
      )
      values (
        shop.id, p_provider_user_id, service_row.id, p_actor_id,
        'qualification_granted', btrim(p_reason), p_command_id
      );
    end if;
  end loop;

  update public.provider_qualification_revisions
  set version = version + 1, updated_at = now()
  where shop_id = shop.id and provider_user_id = p_provider_user_id
  returning jsonb_build_object(
    'shop_id', shop_id,
    'provider_user_id', provider_user_id,
    'qualification_version', version
  ) into result;

  insert into private.provider_command_results (
    command_id, command_kind, actor_id, command_hash, result
  )
  values (
    p_command_id, 'set_provider_qualifications', p_actor_id, command_hash, result
  );
  return result;
end;
$$;

revoke all on function public.api_set_provider_qualifications(
  uuid, uuid, integer, uuid[], text, uuid
) from public, anon, authenticated;
grant execute on function public.api_set_provider_qualifications(
  uuid, uuid, integer, uuid[], text, uuid
) to service_role;

create or replace function public.api_create_service_qualification_request(
  p_barber_id uuid,
  p_service_id uuid,
  p_message text,
  p_idempotency_key uuid
)
returns public.service_qualification_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  employment public.barber_employment;
  existing public.service_qualification_requests;
  created_request public.service_qualification_requests;
begin
  if p_service_id is null
     or p_idempotency_key is null
     or (p_message is not null and char_length(btrim(p_message)) not between 1 and 500) then
    raise exception using errcode = '22023', message = 'Invalid qualification request.';
  end if;

  select request.*
  into existing
  from public.service_qualification_requests as request
  where request.barber_id = p_barber_id
    and request.idempotency_key = p_idempotency_key;

  if existing.id is not null then
    if existing.service_id <> p_service_id
       or coalesce(existing.message, '') <> coalesce(nullif(btrim(p_message), ''), '') then
      raise exception using errcode = 'P4096', message = 'This idempotency key was already used with different input.';
    end if;
    return existing;
  end if;

  select current_employment.*
  into employment
  from public.barber_employment as current_employment
  join public.users as profile on profile.id = current_employment.barber_id
  where current_employment.barber_id = p_barber_id
    and current_employment.status = 'active'
    and current_employment.ended_at is null
    and profile.role = 'barber'
    and profile.verification_status = 'verified'
    and profile.onboarding_completed
  for update of current_employment;

  if employment.id is null then
    raise exception using errcode = 'P4031', message = 'An active verified employment is required.';
  end if;

  if not exists (
    select 1
    from public.services as service
    where service.id = p_service_id
      and service.shop_id = employment.shop_id
      and service.active
  ) then
    raise exception using errcode = '22023', message = 'The requested active service must belong to your current shop.';
  end if;

  if exists (
    select 1
    from public.service_qualifications as qualification
    where qualification.shop_id = employment.shop_id
      and qualification.service_id = p_service_id
      and qualification.provider_user_id = p_barber_id
      and qualification.active
  ) then
    raise exception using errcode = 'P4020', message = 'You are already qualified for this service.';
  end if;

  insert into public.service_qualification_requests (
    shop_id, service_id, barber_id, message, idempotency_key
  )
  values (
    employment.shop_id, p_service_id, p_barber_id,
    nullif(btrim(p_message), ''), p_idempotency_key
  )
  returning * into created_request;

  insert into public.provider_capability_events (
    shop_id, provider_user_id, service_id, request_id,
    actor_id, event_type, reason
  )
  values (
    employment.shop_id, p_barber_id, p_service_id, created_request.id,
    p_barber_id, 'qualification_requested', created_request.message
  );

  return created_request;
end;
$$;

revoke all on function public.api_create_service_qualification_request(
  uuid, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.api_create_service_qualification_request(
  uuid, uuid, text, uuid
) to service_role;

create or replace function public.api_resolve_service_qualification_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_decision text,
  p_reason text default null
)
returns public.service_qualification_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.service_qualification_requests;
  shop public.shops;
begin
  if p_decision not in ('approve', 'decline')
     or p_expected_version < 1
     or (p_reason is not null and char_length(btrim(p_reason)) not between 3 and 500) then
    raise exception using errcode = '22023', message = 'Invalid qualification request decision.';
  end if;

  select candidate.*
  into request_row
  from public.service_qualification_requests as candidate
  where candidate.id = p_request_id
  for update;

  if request_row.id is null then
    raise exception using errcode = 'P0002', message = 'Qualification request not found.';
  end if;

  shop := private.require_owner_provider_actor(p_actor_id, request_row.shop_id);

  if request_row.status <> 'pending' then
    raise exception using errcode = 'P4023', message = 'Qualification request was already resolved.';
  end if;
  if request_row.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'Qualification request changed. Reload and try again.';
  end if;
  if not private.provider_is_eligible(shop.id, request_row.barber_id) then
    raise exception using errcode = 'P4031', message = 'Only an active verified staff member can receive this qualification.';
  end if;

  if p_decision = 'approve' then
    insert into public.service_qualifications (
      shop_id, service_id, provider_user_id, active,
      granted_by, granted_at, revoked_by, revoked_at
    )
    values (
      shop.id, request_row.service_id, request_row.barber_id, true,
      p_actor_id, now(), null, null
    )
    on conflict (shop_id, service_id, provider_user_id)
    do update set
      active = true,
      granted_by = excluded.granted_by,
      granted_at = excluded.granted_at,
      revoked_by = null,
      revoked_at = null,
      updated_at = now();

    update public.provider_qualification_revisions
    set version = version + 1, updated_at = now()
    where shop_id = shop.id and provider_user_id = request_row.barber_id;
  end if;

  update public.service_qualification_requests
  set status = case
        when p_decision = 'approve'
          then 'approved'::public.service_qualification_request_status
        else 'declined'::public.service_qualification_request_status
      end,
      resolved_by = p_actor_id,
      resolution_reason = nullif(btrim(p_reason), ''),
      resolved_at = now(),
      version = version + 1,
      updated_at = now()
  where id = request_row.id
  returning * into request_row;

  insert into public.provider_capability_events (
    shop_id, provider_user_id, service_id, request_id,
    actor_id, event_type, reason
  )
  values (
    shop.id, request_row.barber_id, request_row.service_id, request_row.id,
    p_actor_id,
    case when p_decision = 'approve'
      then 'qualification_request_approved'
      else 'qualification_request_declined'
    end,
    nullif(btrim(p_reason), '')
  );

  return request_row;
end;
$$;

revoke all on function public.api_resolve_service_qualification_request(
  uuid, uuid, integer, text, text
) from public, anon, authenticated;
grant execute on function public.api_resolve_service_qualification_request(
  uuid, uuid, integer, text, text
) to service_role;

create or replace function private.prevent_provider_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'Provider capability events are immutable.';
end;
$$;

revoke all on function private.prevent_provider_event_mutation() from public;

create trigger provider_capability_events_immutable
  before update or delete on public.provider_capability_events
  for each row execute function private.prevent_provider_event_mutation();
