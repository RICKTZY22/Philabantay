-- P2-06 follow-up: conflict-check narrowed hours, not only full unavailability.
--
-- `assert_no_active_bookings_on_date` fired only when a date became fully
-- unavailable, and it compared dates while ignoring times. So an owner could
-- shrink a working window -- or approve a `different_hours` request -- and leave
-- an existing booking sitting outside the barber's own availability with no
-- warning. The Phase 2 plan requires exceptions to be conflict checked, so the
-- guard now takes the resulting window and reports anything that falls outside
-- it.
--
-- P2-07 still owns authoritative availability. This only closes the
-- write-time precondition so a schedule edit cannot silently orphan a booking.

create or replace function private.assert_no_conflicting_bookings_on_date(
  p_employment_id uuid,
  p_date date,
  p_start_time time default null,
  p_end_time time default null
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
     and (appointment.starts_at at time zone shop.timezone)::date = p_date
     and (
       -- No surviving window: every active booking on the date conflicts.
       p_start_time is null
       or p_end_time is null
       -- Otherwise only bookings not fully inside the new window conflict. A
       -- visit that runs past midnight is never fully contained, so it counts.
       or (appointment.starts_at at time zone shop.timezone)::time < p_start_time
       or (appointment.ends_at at time zone shop.timezone)::time > p_end_time
       or (appointment.ends_at at time zone shop.timezone)::date <> p_date
     );

  if affected > 0 then
    raise exception using
      errcode = 'P4025',
      message = format(
        'This change would leave %s active booking(s) outside the barber''s availability on %s. Resolve them first.',
        affected,
        p_date
      );
  end if;
end;
$$;

revoke all on function private.assert_no_conflicting_bookings_on_date(uuid, date, time, time)
  from public, anon, authenticated;

-- Owner-authored exception: check the surviving window, not just full days off.
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

  perform private.assert_no_conflicting_bookings_on_date(
    employment.id,
    p_date,
    case when p_is_available then p_start_time else null end,
    case when p_is_available then p_end_time else null end
  );

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

revoke all on function public.api_upsert_staff_shift_exception(uuid, uuid, integer, date, boolean, time, time, text)
  from public, anon, authenticated;
grant execute on function public.api_upsert_staff_shift_exception(uuid, uuid, integer, date, boolean, time, time, text)
  to service_role;

-- Approval path: previously only `time_off` was conflict checked, so approving
-- a `different_hours` request could narrow the window past an existing booking.
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

  -- Both shapes are checked now. Time off removes the whole day; different
  -- hours must still cover every booking already on it.
  perform private.assert_no_conflicting_bookings_on_date(
    employment.id,
    target.date,
    case when target.requested_kind = 'different_hours' then target.requested_start_time else null end,
    case when target.requested_kind = 'different_hours' then target.requested_end_time else null end
  );

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

revoke all on function public.api_resolve_shift_change_request(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.api_resolve_shift_change_request(uuid, uuid, integer, text, text)
  to service_role;
