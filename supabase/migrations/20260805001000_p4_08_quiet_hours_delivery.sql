-- Phase 4 P4-08: quiet hours actually delay optional reminders.
--
-- `notification_outbox.required_operational` already existed and already carried
-- the mandatory/optional distinction the plan asks for, but nothing read it at
-- delivery time: `api_deliver_due_in_app_notifications` delivered every due row
-- regardless. So a quiet-hours preference could be stored and displayed while
-- changing nothing, which is worse than not offering it.
--
-- Plan section 8: "Quiet hours delay optional reminders, never urgent
-- security/booking changes." Delay, not drop — an optional reminder held overnight
-- is rescheduled to the moment the window ends, so it still arrives.

/**
 * The moment quiet hours next end for one recipient, or null when they are not in
 * quiet hours at all. Evaluated in the shop's timezone where one is known, because
 * a quiet night is the user's night rather than UTC's.
 */
create or replace function private.quiet_hours_end_for(
  p_recipient_id uuid,
  p_shop_id uuid default null
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prefs public.notification_preferences%rowtype;
  v_timezone text := 'Asia/Manila';
  v_local timestamp;
  v_local_time time;
  v_inside boolean;
  v_end timestamp;
begin
  select * into v_prefs from public.notification_preferences where user_id = p_recipient_id;
  if not found or v_prefs.quiet_hours_start is null then
    return null;
  end if;
  if p_shop_id is not null then
    select coalesce(timezone, 'Asia/Manila') into v_timezone from public.shops where id = p_shop_id;
  end if;
  v_timezone := coalesce(v_timezone, 'Asia/Manila');
  v_local := now() at time zone v_timezone;
  v_local_time := v_local::time;

  if v_prefs.quiet_hours_start <= v_prefs.quiet_hours_end then
    v_inside := v_local_time >= v_prefs.quiet_hours_start and v_local_time < v_prefs.quiet_hours_end;
  else
    -- A window that wraps midnight, for example 22:00 to 07:00.
    v_inside := v_local_time >= v_prefs.quiet_hours_start or v_local_time < v_prefs.quiet_hours_end;
  end if;
  if not v_inside then
    return null;
  end if;

  v_end := date_trunc('day', v_local) + v_prefs.quiet_hours_end;
  -- Already past today's end time means the window began last night.
  if v_end <= v_local then
    v_end := v_end + interval '1 day';
  end if;
  return v_end at time zone v_timezone;
end;
$$;
revoke all on function private.quiet_hours_end_for(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.api_deliver_due_in_app_notifications(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.notification_outbox%rowtype;
  v_count integer := 0;
  v_quiet_until timestamptz;
begin
  for v_item in select * from public.notification_outbox
    where status in ('pending', 'retry') and available_at <= now()
    order by created_at for update skip locked limit greatest(1, least(p_limit, 500))
  loop
    -- A required operational notice is never held. Booking changes and security
    -- events reach people at 3am if that is when they happen, which is the whole
    -- reason the column exists.
    if v_item.required_operational then
      v_quiet_until := null;
    else
      v_quiet_until := private.quiet_hours_end_for(v_item.recipient_id, v_item.shop_id);
    end if;

    if v_quiet_until is not null then
      -- Delayed, not dropped: it becomes due again when the window ends.
      update public.notification_outbox
      set available_at = v_quiet_until
      where id = v_item.id;
    else
      perform public.api_record_notification_attempt(v_item.id, 'in_app', true, null);
      v_count := v_count + 1;
    end if;
  end loop;
  -- Counts deliveries, not rows examined, so a quiet night reports zero delivered
  -- rather than pretending the queue was drained.
  return v_count;
end;
$$;

revoke all on function public.api_deliver_due_in_app_notifications(integer) from public, anon, authenticated;
grant execute on function public.api_deliver_due_in_app_notifications(integer) to service_role;

-- `private.optional_reminder_allowed_now` from the previous migration is now
-- redundant: `quiet_hours_end_for` answers the same question and also says when
-- the delay should end, which the delivery loop needs.
drop function if exists private.optional_reminder_allowed_now(uuid, uuid);
