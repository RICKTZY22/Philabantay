-- P2-06 (STAFF-01) slice 2: owner-authoritative schedule commands and the
-- transactional change-request resolution.
--
-- Authority model: the owner writes the roster. A barber may only ask. Approval
-- writes the resulting shift exception, links it to the request, advances the
-- roster revision, and records the audit event in one transaction. Declining
-- touches request state only.
--
-- Every helper raises instead of returning NULL. P2-04's ownerless-resolution
-- exploit came from a NULL-returning owner lookup feeding a `<>` comparison, so
-- no lookup in this file may return a NULL row to a caller.

-- ---------------------------------------------------------------------------
-- Authority + concurrency helpers

create or replace function private.require_owner_staff_employment(
  p_owner_id uuid,
  p_barber_id uuid
)
returns public.barber_employment
language plpgsql
security definer
set search_path = ''
as $$
declare
  employment public.barber_employment;
begin
  select staff.*
    into employment
    from public.barber_employment as staff
    join public.shops as shop on shop.id = staff.shop_id
    join public.users as owner on owner.id = shop.owner_id
   where shop.owner_id = p_owner_id
     and staff.barber_id = p_barber_id
     and staff.status = 'active'
     and staff.ended_at is null
     and owner.role = 'shop_owner'
     and owner.requested_role = 'shop_owner'
     and owner.verification_status = 'verified'
     and owner.onboarding_completed
   for update of staff;

  if employment.id is null then
    raise exception using
      errcode = '42501',
      message = 'A verified owner may only schedule their own active staff.';
  end if;
  return employment;
end;
$$;

create or replace function private.require_owner_of_employment(
  p_owner_id uuid,
  p_employment_id uuid
)
returns public.barber_employment
language plpgsql
security definer
set search_path = ''
as $$
declare
  employment public.barber_employment;
begin
  select staff.*
    into employment
    from public.barber_employment as staff
    join public.shops as shop on shop.id = staff.shop_id
    join public.users as owner on owner.id = shop.owner_id
   where staff.id = p_employment_id
     and shop.owner_id = p_owner_id
     and owner.role = 'shop_owner'
     and owner.requested_role = 'shop_owner'
     and owner.verification_status = 'verified'
     and owner.onboarding_completed
   for update of staff;

  if employment.id is null then
    raise exception using
      errcode = '42501',
      message = 'This staff schedule belongs to another shop.';
  end if;
  return employment;
end;
$$;

-- Version-check and advance one roster token. Always call this before writing
-- schedule rows so two owner sessions cannot both apply stale edits.
create or replace function private.bump_staff_schedule_revision(
  p_employment_id uuid,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_version integer;
begin
  insert into public.staff_schedule_revisions (employment_id)
  values (p_employment_id)
  on conflict (employment_id) do nothing;

  select version
    into current_version
    from public.staff_schedule_revisions
   where employment_id = p_employment_id
   for update;

  if current_version is null then
    raise exception using errcode = 'P0002', message = 'Staff schedule not found.';
  end if;
  if current_version <> p_expected_version then
    raise exception using
      errcode = 'P4020',
      message = 'This staff schedule changed since it was loaded.';
  end if;

  update public.staff_schedule_revisions
     set version = version + 1,
         updated_at = now()
   where employment_id = p_employment_id
   returning version into current_version;

  return current_version;
end;
$$;

-- A date that already carries active bookings must not silently lose them.
create or replace function private.assert_no_active_bookings_on_date(
  p_employment_id uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  select count(*)
    into affected
    from public.appointments as appointment
    join public.barber_employment as staff
      on staff.barber_id = appointment.barber_id
     and staff.shop_id = appointment.shop_id
    join public.shops as shop on shop.id = appointment.shop_id
   where staff.id = p_employment_id
     and appointment.status in (
       'requested', 'confirmed', 'checked_in', 'in_progress', 'awaiting_confirmation'
     )
     and (appointment.starts_at at time zone shop.timezone)::date = p_date;

  if affected > 0 then
    raise exception using
      errcode = 'P4025',
      message = format(
        'This date still has %s active booking(s). Resolve them before removing availability.',
        affected
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner commands

create or replace function public.api_replace_staff_shift_patterns(
  p_owner_id uuid,
  p_barber_id uuid,
  p_expected_version integer,
  p_blocks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employment public.barber_employment;
  new_version integer;
  block jsonb;
begin
  if jsonb_typeof(p_blocks) <> 'array' or jsonb_array_length(p_blocks) > 28 then
    raise exception using
      errcode = '22023',
      message = 'Shift patterns must be an array of at most 28 blocks.';
  end if;

  employment := private.require_owner_staff_employment(p_owner_id, p_barber_id);
  new_version := private.bump_staff_schedule_revision(employment.id, p_expected_version);

  delete from public.shift_patterns where employment_id = employment.id;

  for block in select value from jsonb_array_elements(p_blocks)
  loop
    insert into public.shift_patterns (
      employment_id, barber_id, shop_id, weekday, start_time, end_time
    ) values (
      employment.id,
      employment.barber_id,
      employment.shop_id,
      (block->>'weekday')::smallint,
      (block->>'start_time')::time,
      (block->>'end_time')::time
    );
  end loop;

  insert into public.staff_schedule_events (
    shop_id, employment_id, barber_id, actor_id, event_type, metadata
  ) values (
    employment.shop_id, employment.id, employment.barber_id, p_owner_id,
    'patterns_replaced',
    jsonb_build_object('block_count', jsonb_array_length(p_blocks))
  );

  return jsonb_build_object(
    'employment_id', employment.id,
    'barber_id', employment.barber_id,
    'schedule_version', new_version,
    'patterns', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pattern.id,
          'employment_id', pattern.employment_id,
          'barber_id', pattern.barber_id,
          'shop_id', pattern.shop_id,
          'weekday', pattern.weekday,
          'start_time', to_char(pattern.start_time, 'HH24:MI'),
          'end_time', to_char(pattern.end_time, 'HH24:MI')
        )
        order by pattern.weekday, pattern.start_time
      )
      from public.shift_patterns as pattern
      where pattern.employment_id = employment.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.api_upsert_staff_shift_exception(
  p_owner_id uuid,
  p_barber_id uuid,
  p_expected_version integer,
  p_date date,
  p_is_available boolean,
  p_start_time time default null,
  p_end_time time default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employment public.barber_employment;
  new_version integer;
  saved public.shift_exceptions;
begin
  employment := private.require_owner_staff_employment(p_owner_id, p_barber_id);

  if not p_is_available then
    perform private.assert_no_active_bookings_on_date(employment.id, p_date);
  end if;

  new_version := private.bump_staff_schedule_revision(employment.id, p_expected_version);

  insert into public.shift_exceptions (
    employment_id, barber_id, shop_id, date, is_available,
    start_time, end_time, reason, source, created_by, change_request_id
  ) values (
    employment.id, employment.barber_id, employment.shop_id, p_date, p_is_available,
    case when p_is_available then p_start_time else null end,
    case when p_is_available then p_end_time else null end,
    nullif(btrim(coalesce(p_reason, '')), ''),
    'owner', p_owner_id, null
  )
  on conflict (employment_id, date) do update
     set is_available = excluded.is_available,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         reason = excluded.reason,
         source = 'owner',
         created_by = excluded.created_by,
         change_request_id = null,
         updated_at = now()
  returning * into saved;

  insert into public.staff_schedule_events (
    shop_id, employment_id, barber_id, exception_id, actor_id, event_type, reason, metadata
  ) values (
    employment.shop_id, employment.id, employment.barber_id, saved.id, p_owner_id,
    'exception_upserted', saved.reason,
    jsonb_build_object('date', p_date, 'is_available', p_is_available)
  );

  return jsonb_build_object(
    'schedule_version', new_version,
    'exception', jsonb_build_object(
      'id', saved.id,
      'employment_id', saved.employment_id,
      'barber_id', saved.barber_id,
      'shop_id', saved.shop_id,
      'date', saved.date,
      'is_available', saved.is_available,
      'start_time', to_char(saved.start_time, 'HH24:MI'),
      'end_time', to_char(saved.end_time, 'HH24:MI'),
      'reason', saved.reason,
      'source', saved.source
    )
  );
end;
$$;

create or replace function public.api_remove_staff_shift_exception(
  p_owner_id uuid,
  p_exception_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.shift_exceptions;
  employment public.barber_employment;
  new_version integer;
begin
  select * into target
    from public.shift_exceptions
   where id = p_exception_id
   for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'Shift exception not found.';
  end if;

  employment := private.require_owner_of_employment(p_owner_id, target.employment_id);
  new_version := private.bump_staff_schedule_revision(employment.id, p_expected_version);

  delete from public.shift_exceptions where id = target.id;

  insert into public.staff_schedule_events (
    shop_id, employment_id, barber_id, actor_id, event_type, metadata
  ) values (
    employment.shop_id, employment.id, employment.barber_id, p_owner_id,
    'exception_removed', jsonb_build_object('date', target.date)
  );

  return jsonb_build_object('removed_id', target.id, 'schedule_version', new_version);
end;
$$;

-- ---------------------------------------------------------------------------
-- Barber request + owner resolution

create or replace function public.api_submit_shift_change_request(
  p_barber_id uuid,
  p_date date,
  p_kind text,
  p_message text,
  p_idempotency_key uuid,
  p_start_time time default null,
  p_end_time time default null
)
returns public.shift_change_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  employment public.barber_employment;
  existing public.shift_change_requests;
  created public.shift_change_requests;
begin
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'An idempotency key is required.';
  end if;
  if p_kind not in ('time_off', 'different_hours') then
    raise exception using errcode = '22023', message = 'Request kind must be time_off or different_hours.';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'A request message of 1 to 1000 characters is required.';
  end if;

  select * into existing
    from public.shift_change_requests
   where barber_id = p_barber_id and idempotency_key = p_idempotency_key;
  if found then
    return existing;
  end if;

  -- Raises when the barber has no current verified active employment.
  employment := private.lock_current_barber_employment(p_barber_id);

  insert into public.shift_change_requests (
    employment_id, barber_id, shop_id, date, message,
    requested_kind, requested_start_time, requested_end_time, idempotency_key
  ) values (
    employment.id, employment.barber_id, employment.shop_id, p_date, btrim(p_message),
    p_kind::public.shift_change_request_kind,
    case when p_kind = 'different_hours' then p_start_time else null end,
    case when p_kind = 'different_hours' then p_end_time else null end,
    p_idempotency_key
  )
  returning * into created;

  insert into public.staff_schedule_events (
    shop_id, employment_id, barber_id, request_id, actor_id, event_type, reason, metadata
  ) values (
    employment.shop_id, employment.id, employment.barber_id, created.id, p_barber_id,
    'change_request_created', created.message,
    jsonb_build_object('date', p_date, 'kind', p_kind)
  );

  return created;
end;
$$;

-- Approval is the whole point of this packet: the decision and the resulting
-- schedule row commit together, or neither does.
create or replace function public.api_resolve_shift_change_request(
  p_owner_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.shift_change_requests;
  employment public.barber_employment;
  saved public.shift_exceptions;
  new_version integer;
  normalized_note text;
begin
  if p_decision not in ('approve', 'decline') then
    raise exception using errcode = '22023', message = 'Decision must be approve or decline.';
  end if;
  normalized_note := nullif(btrim(coalesce(p_note, '')), '');

  select * into target
    from public.shift_change_requests
   where id = p_request_id
   for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'Shift change request not found.';
  end if;

  employment := private.require_owner_of_employment(p_owner_id, target.employment_id);

  if target.status <> 'pending' then
    raise exception using errcode = 'P4023', message = 'This shift change request is no longer pending.';
  end if;
  if target.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This shift change request changed since it was loaded.';
  end if;

  if p_decision = 'decline' then
    update public.shift_change_requests
       set status = 'declined',
           resolved_by = p_owner_id,
           resolved_at = now(),
           decision_note = normalized_note,
           version = version + 1,
           updated_at = now()
     where id = target.id;

    insert into public.staff_schedule_events (
      shop_id, employment_id, barber_id, request_id, actor_id, event_type, reason
    ) values (
      employment.shop_id, employment.id, employment.barber_id, target.id, p_owner_id,
      'change_request_declined', normalized_note
    );

    return jsonb_build_object(
      'request_id', target.id,
      'status', 'declined',
      'exception_id', null,
      'schedule_version', (
        select version from public.staff_schedule_revisions where employment_id = employment.id
      )
    );
  end if;

  if target.requested_kind = 'time_off' then
    perform private.assert_no_active_bookings_on_date(employment.id, target.date);
  end if;

  -- The request row is the optimistic token for this decision, so the roster
  -- revision only needs advancing. Read it under the same lock the bump takes,
  -- otherwise a concurrent owner edit would surface as a misleading
  -- "schedule changed" conflict on an approve the owner did nothing wrong on.
  insert into public.staff_schedule_revisions (employment_id)
  values (employment.id)
  on conflict (employment_id) do nothing;

  select version into new_version
    from public.staff_schedule_revisions
   where employment_id = employment.id
   for update;

  new_version := private.bump_staff_schedule_revision(employment.id, new_version);

  insert into public.shift_exceptions (
    employment_id, barber_id, shop_id, date, is_available,
    start_time, end_time, reason, source, created_by, change_request_id
  ) values (
    employment.id, employment.barber_id, employment.shop_id, target.date,
    target.requested_kind = 'different_hours',
    target.requested_start_time,
    target.requested_end_time,
    coalesce(normalized_note, target.message),
    'change_request', p_owner_id, target.id
  )
  on conflict (employment_id, date) do update
     set is_available = excluded.is_available,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         reason = excluded.reason,
         source = 'change_request',
         created_by = excluded.created_by,
         change_request_id = excluded.change_request_id,
         updated_at = now()
  returning * into saved;

  update public.shift_change_requests
     set status = 'approved',
         resolved_by = p_owner_id,
         resolved_at = now(),
         decision_note = normalized_note,
         applied_exception_id = saved.id,
         version = version + 1,
         updated_at = now()
   where id = target.id;

  insert into public.staff_schedule_events (
    shop_id, employment_id, barber_id, request_id, exception_id, actor_id,
    event_type, reason, metadata
  ) values (
    employment.shop_id, employment.id, employment.barber_id, target.id, saved.id, p_owner_id,
    'change_request_approved', normalized_note,
    jsonb_build_object('date', target.date, 'kind', target.requested_kind)
  );

  return jsonb_build_object(
    'request_id', target.id,
    'status', 'approved',
    'exception_id', saved.id,
    'schedule_version', new_version
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Retiring the pre-P2-06 write paths moves to slice 2b.
--
-- Dropping `api_create_shift_change_request`, `api_replace_shift_patterns`,
-- `api_create_shift_exception`, and `api_remove_shift_exception` -- and applying
-- the `idempotency_key NOT NULL` / pending-resolution invariants slice 1
-- deferred -- is only safe once the Express routes stop calling them. Those four
-- functions are still the live write path for
-- `PUT /shifts/patterns`, `POST /shifts/exceptions`,
-- `DELETE /shifts/exceptions/:id`, and `POST /shift-change-requests`.
-- Verified: dropping them here fails 3 integration tests. The commands above
-- are complete and service-role only; slice 2b rewires the routes, removes the
-- barber self-rewrite endpoints, then lands the drops and the invariants.

-- ---------------------------------------------------------------------------
-- Grants: service role only. Browsers keep read-only RLS access.

revoke all on function private.require_owner_staff_employment(uuid, uuid) from public, anon, authenticated;
revoke all on function private.require_owner_of_employment(uuid, uuid) from public, anon, authenticated;
revoke all on function private.bump_staff_schedule_revision(uuid, integer) from public, anon, authenticated;
revoke all on function private.assert_no_active_bookings_on_date(uuid, date) from public, anon, authenticated;

revoke all on function public.api_replace_staff_shift_patterns(uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.api_upsert_staff_shift_exception(uuid, uuid, integer, date, boolean, time, time, text)
  from public, anon, authenticated;
revoke all on function public.api_remove_staff_shift_exception(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.api_submit_shift_change_request(uuid, date, text, text, uuid, time, time)
  from public, anon, authenticated;
revoke all on function public.api_resolve_shift_change_request(uuid, uuid, integer, text, text)
  from public, anon, authenticated;

grant execute on function public.api_replace_staff_shift_patterns(uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.api_upsert_staff_shift_exception(uuid, uuid, integer, date, boolean, time, time, text) to service_role;
grant execute on function public.api_remove_staff_shift_exception(uuid, uuid, integer) to service_role;
grant execute on function public.api_submit_shift_change_request(uuid, date, text, text, uuid, time, time) to service_role;
grant execute on function public.api_resolve_shift_change_request(uuid, uuid, integer, text, text) to service_role;
