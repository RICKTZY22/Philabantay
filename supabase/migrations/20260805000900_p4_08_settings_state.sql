-- Phase 4 P4-08: settings that are real backend state.
--
-- Measured before writing this. `notification_preferences` existed and was already
-- persisted per user, so cross-device persistence was half-built — but the
-- Notification settings screen never called it. It read and wrote
-- `localStorage['bsh_prefs']`, which plan section 8 forbids in as many words
-- ("Preferences are not stored only in browser local storage") and which makes
-- required test 10 impossible: a second device starts from defaults.
--
-- The table also had only four booleans. Plan section 7 asks for language,
-- accessibility, and quiet hours, and section 8 asks that mandatory transactional
-- notices be distinguishable from optional channels.
--
-- Two further gaps found by measuring grants rather than reading code:
-- `authenticated` held INSERT/UPDATE/DELETE with self-scoped policies, so a
-- browser JWT could write preferences straight through PostgREST — including
-- DELETE, which silently resets somebody to defaults — and the Express route
-- upserted the table directly instead of calling a command.

alter table public.notification_preferences
  -- Optional channels. These are the only rows a user may switch off.
  add column nearby_radius_km integer not null default 5
    check (nearby_radius_km between 1 and 50),
  -- Quiet hours delay optional reminders. Both null means no quiet hours; a pair
  -- that wraps midnight is legitimate, so no ordering constraint is imposed.
  add column quiet_hours_start time,
  add column quiet_hours_end time,
  add column language text not null default 'en' check (language in ('en', 'fil')),
  add column text_size text not null default 'default'
    check (text_size in ('default', 'large', 'larger')),
  add column high_contrast boolean not null default false,
  add column reduce_motion boolean not null default false,
  add column version integer not null default 1 check (version > 0),
  /*
   * Mandatory transactional notices: booking changes, security events, and the
   * other messages a user cannot opt out of without the product lying to them.
   *
   * Stored as a column rather than left implicit so the contract is legible in the
   * schema and in the API response, and constrained so it can never be false.
   * A settings screen cannot switch it off, an API caller cannot switch it off,
   * and neither can a future command with a bug in it — the row would fail to
   * write. That is a stronger guarantee than a guard clause.
   */
  add column transactional_notices boolean not null default true,
  add constraint notification_transactional_notices_always_on check (transactional_notices),
  add constraint notification_quiet_hours_shape check (
    (quiet_hours_start is null) = (quiet_hours_end is null)
  );

create or replace function public.api_set_notification_preferences(
  p_user_id uuid,
  p_expected_version integer,
  p_booking_reminders boolean,
  p_chat_notifications boolean,
  p_email_updates boolean,
  p_nearby_alerts boolean,
  p_nearby_radius_km integer,
  p_quiet_hours_start time,
  p_quiet_hours_end time,
  p_language text,
  p_text_size text,
  p_high_contrast boolean,
  p_reduce_motion boolean
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_preferences%rowtype;
  v_existing public.notification_preferences%rowtype;
begin
  if p_language not in ('en', 'fil') then
    raise exception using errcode = '22023', message = 'Unsupported language.';
  end if;
  if p_text_size not in ('default', 'large', 'larger') then
    raise exception using errcode = '22023', message = 'Unsupported text size.';
  end if;
  if p_nearby_radius_km is null or p_nearby_radius_km not between 1 and 50 then
    raise exception using errcode = '22023', message = 'Nearby radius must be between 1 and 50 km.';
  end if;
  if (p_quiet_hours_start is null) <> (p_quiet_hours_end is null) then
    raise exception using errcode = '22023', message = 'Quiet hours need both a start and an end, or neither.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('notification-preferences:' || p_user_id::text, 0)
  );

  select * into v_existing from public.notification_preferences where user_id = p_user_id for update;
  if found then
    -- Version-checked like every other user-owned record, so two devices editing
    -- at once produce a refusal rather than a silent last-write-wins.
    if p_expected_version is not null and v_existing.version <> p_expected_version then
      raise exception using errcode = 'P4090',
        message = 'Your preferences changed on another device; refresh before saving.';
    end if;
    update public.notification_preferences
    set booking_reminders = p_booking_reminders,
        chat_notifications = p_chat_notifications,
        email_updates = p_email_updates,
        nearby_alerts = p_nearby_alerts,
        nearby_radius_km = p_nearby_radius_km,
        quiet_hours_start = p_quiet_hours_start,
        quiet_hours_end = p_quiet_hours_end,
        language = p_language,
        text_size = p_text_size,
        high_contrast = p_high_contrast,
        reduce_motion = p_reduce_motion,
        -- Never taken from the caller. There is no parameter for it on purpose.
        transactional_notices = true,
        version = version + 1,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.notification_preferences (
    user_id, booking_reminders, chat_notifications, email_updates, nearby_alerts,
    nearby_radius_km, quiet_hours_start, quiet_hours_end, language, text_size,
    high_contrast, reduce_motion, transactional_notices
  )
  values (
    p_user_id, p_booking_reminders, p_chat_notifications, p_email_updates, p_nearby_alerts,
    p_nearby_radius_km, p_quiet_hours_start, p_quiet_hours_end, p_language, p_text_size,
    p_high_contrast, p_reduce_motion, true
  )
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.api_set_notification_preferences(
  uuid, integer, boolean, boolean, boolean, boolean, integer, time, time, text, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.api_set_notification_preferences(
  uuid, integer, boolean, boolean, boolean, boolean, integer, time, time, text, text, boolean, boolean
) to service_role;

/**
 * Whether an optional reminder may be delivered right now for one recipient.
 * Quiet hours delay optional reminders and never urgent notices, so this answers
 * only the optional question and the caller keeps deciding what is urgent.
 *
 * Evaluated in the shop's timezone when one is known, because "quiet hours" means
 * the user's night, not UTC's.
 */
create or replace function private.optional_reminder_allowed_now(
  p_recipient_id uuid,
  p_shop_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prefs public.notification_preferences%rowtype;
  v_timezone text := 'Asia/Manila';
  v_local time;
begin
  select * into v_prefs from public.notification_preferences where user_id = p_recipient_id;
  -- No stored row means defaults, and the default is to allow.
  if not found or v_prefs.quiet_hours_start is null then
    return true;
  end if;
  if p_shop_id is not null then
    select coalesce(timezone, 'Asia/Manila') into v_timezone from public.shops where id = p_shop_id;
  end if;
  v_local := (now() at time zone coalesce(v_timezone, 'Asia/Manila'))::time;

  if v_prefs.quiet_hours_start <= v_prefs.quiet_hours_end then
    return not (v_local >= v_prefs.quiet_hours_start and v_local < v_prefs.quiet_hours_end);
  end if;
  -- A window that wraps midnight, for example 22:00 to 07:00.
  return not (v_local >= v_prefs.quiet_hours_start or v_local < v_prefs.quiet_hours_end);
end;
$$;
revoke all on function private.optional_reminder_allowed_now(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Preferences are a user-owned record written by one command. `authenticated` held
-- INSERT, UPDATE, and DELETE with self-scoped policies, which made PostgREST a
-- second write path and let a browser DELETE the row to reset itself to defaults,
-- bypassing the version check and the mandatory-notice constraint's audit trail.
drop policy if exists notification_preferences_insert_self on public.notification_preferences;
drop policy if exists notification_preferences_update_self on public.notification_preferences;
drop policy if exists notification_preferences_delete_self on public.notification_preferences;
revoke insert, update, delete, truncate on table public.notification_preferences from anon, authenticated;
revoke insert, update, delete, truncate on table public.notification_preferences from service_role;
