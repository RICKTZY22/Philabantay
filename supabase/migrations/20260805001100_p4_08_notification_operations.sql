-- Phase 4 P4-08: the notification operations view.
--
-- Plan section 8 requires an operations surface exposing "outbox lag, failure
-- rate, last successful worker cycle, and retry action for authorized admin", and
-- required test 9 asks that when a provider fails, in-app state remains *and*
-- operations sees the failure. The first half was already true since Phase 3:
-- `api_record_notification_attempt` moves a failed row to `retry` and leaves the
-- in-app row visible. The second half had nowhere to look — there was no view, so
-- a provider outage was invisible to anybody who could act on it.

create or replace function public.api_notification_operations_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'generated_at', now(),
    'pending', count(*) filter (where status = 'pending'),
    'retry', count(*) filter (where status = 'retry'),
    'delivered', count(*) filter (where status = 'delivered'),
    -- A dead letter is work nobody will retry automatically. It is the number an
    -- operator most needs to see, so it is never folded into `retry`.
    'dead_letter', count(*) filter (where status = 'dead_letter'),
    -- Lag is the age of the oldest thing still waiting past its due time, which is
    -- what "behind" actually means for a queue. A large backlog that is not yet due
    -- is not lag.
    'oldest_due_age_seconds', coalesce(
      extract(epoch from (now() - min(available_at) filter (
        where status in ('pending', 'retry') and available_at <= now()
      )))::integer, 0),
    'due_now', count(*) filter (where status in ('pending', 'retry') and available_at <= now()),
    'held_for_quiet_hours', count(*) filter (
      where status in ('pending', 'retry') and available_at > now() and attempt_count = 0
    )
  )
  into v_result
  from public.notification_outbox;

  v_result := v_result || (
    select jsonb_build_object(
      'attempts_last_24h', count(*),
      'failures_last_24h', count(*) filter (where status = 'failed'),
      -- Null rather than zero when nothing was attempted: a rate over no attempts
      -- is not zero percent, it is unknown.
      'failure_rate_last_24h', case when count(*) = 0 then null
        else round(count(*) filter (where status = 'failed')::numeric / count(*), 4) end,
      'last_successful_delivery_at', max(created_at) filter (where status = 'delivered'),
      'last_failure_at', max(created_at) filter (where status = 'failed'),
      'recent_error_codes', coalesce((
        select jsonb_agg(jsonb_build_object('error_code', grouped.error_code, 'count', grouped.count))
        from (
          select coalesce(delivery.error_code, 'unknown') as error_code, count(*) as count
          from public.notification_deliveries as delivery
          where delivery.status = 'failed' and delivery.created_at > now() - interval '24 hours'
          group by coalesce(delivery.error_code, 'unknown')
          order by count(*) desc
          limit 10
        ) as grouped
      ), '[]'::jsonb)
    )
    from public.notification_deliveries
    where created_at > now() - interval '24 hours'
  );

  return v_result || jsonb_build_object(
    'definitions', jsonb_build_object(
      'oldest_due_age_seconds', 'Seconds since the oldest still-undelivered notice became due. Notices scheduled for the future, including ones held for quiet hours, are not counted as lag.',
      'held_for_quiet_hours', 'Notices deferred to a future time with no delivery attempt yet. These are waiting by design, not stuck.',
      'failure_rate_last_24h', 'Failed delivery attempts divided by all delivery attempts in the last 24 hours. Null when there were no attempts.',
      'dead_letter', 'Notices that exhausted their automatic retries. These need an operator to retry them.'
    )
  );
end;
$$;

revoke all on function public.api_notification_operations_health() from public, anon, authenticated;
grant execute on function public.api_notification_operations_health() to service_role;

/**
 * Operator retry. Returns a dead-lettered or retrying notice to the queue with its
 * attempt counter reset, so an outage that burned five attempts can be recovered
 * without hand-editing the table.
 */
create or replace function public.api_retry_notification(
  p_outbox_id uuid,
  p_admin_id uuid
)
returns public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_outbox%rowtype;
begin
  perform private.require_verification_admin_capability(
    p_admin_id, 'content_moderation'::public.account_capability
  );
  select * into v_row from public.notification_outbox where id = p_outbox_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Outbox item not found.';
  end if;
  if v_row.status = 'delivered' then
    raise exception using errcode = 'P4021', message = 'That notice was already delivered.';
  end if;

  update public.notification_outbox
  set status = 'pending',
      attempt_count = 0,
      available_at = now(),
      leased_until = null,
      last_error = null
  where id = p_outbox_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.api_retry_notification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.api_retry_notification(uuid, uuid) to service_role;
