-- P2-06 schedule-authority closeout.
--
-- The replacement Express routes now call only the versioned owner/barber
-- commands introduced in 20260728000500. It is therefore safe to remove the
-- four pre-P2-06 writers and tighten the request state invariants.

drop function if exists public.api_replace_shift_patterns(uuid, jsonb);
drop function if exists public.api_create_shift_exception(
  uuid,
  date,
  boolean,
  time without time zone,
  time without time zone,
  text
);
drop function if exists public.api_remove_shift_exception(uuid, uuid);
drop function if exists public.api_create_shift_change_request(uuid, date, text);

-- Owner decisions must also stay behind the transactional resolver. The
-- historical column grant/policy allowed a direct status-only update that
-- would not apply the promised schedule change.
revoke update (status) on table public.shift_change_requests from authenticated;
drop policy if exists shift_change_requests_update_owner
  on public.shift_change_requests;

alter table public.shift_change_requests
  alter column idempotency_key set not null,
  drop constraint if exists shift_change_requests_resolution_state,
  add constraint shift_change_requests_resolution_state check (
    (
      status = 'pending'
      and resolved_at is null
      and resolved_by is null
    )
    or (
      status <> 'pending'
      and resolved_at is not null
    )
  );
