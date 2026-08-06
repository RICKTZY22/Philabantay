-- Phase 4 P4-03: rating commands.
--
-- Every write below is a versioned SECURITY DEFINER command with a pinned empty
-- search_path, and the final block revokes the direct grants that let Express
-- write `ratings` itself. After this migration the only way a rating, response,
-- report, or moderation decision can exist is through one of these functions.

-- ---------------------------------------------------------------------------
-- Shared guards
-- ---------------------------------------------------------------------------

-- Serializes every command that touches one review, so eligibility, window, and
-- write cannot interleave. Keyed on the rating's own eligibility because that is
-- the one identifier that exists before the rating row does.
create or replace function private.lock_rating_command(p_eligibility_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_eligibility_id is null then
    raise exception using errcode = '22023', message = 'Rating eligibility id is required.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rating:command:' || p_eligibility_id::text, 0)
  );
end;
$$;
revoke all on function private.lock_rating_command(uuid) from public, anon, authenticated, service_role;

-- Who on the shop side may answer or report this review. Owners are checked
-- first for the same reason as `requireParticipantOrOwner`: since D-028 an
-- owner-provider is a legitimate `ratings.barber_id` through their shadow
-- `barbers` row, and the barber branch requires active employment.
create or replace function private.rating_shop_actor_role(
  p_shop_id uuid,
  p_provider_id uuid,
  p_actor_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.shops where id = p_shop_id and owner_id = p_actor_id) then
    return 'shop_owner';
  end if;
  if p_actor_id = p_provider_id
    and private.is_active_barber_for_shop(p_shop_id, p_actor_id)
  then
    return 'barber';
  end if;
  return null;
end;
$$;
revoke all on function private.rating_shop_actor_role(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function private.require_moderator(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_verification_admin_capability(p_actor_id, 'content_moderation'::public.account_capability);
end;
$$;
revoke all on function private.require_moderator(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Submit and edit
-- ---------------------------------------------------------------------------

create or replace function public.api_submit_rating(
  p_eligibility_id uuid,
  p_customer_id uuid,
  p_barber_rating smallint,
  p_shop_rating smallint,
  p_comment text default null,
  p_display_mode text default 'short_name'
)
returns public.ratings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eligibility public.rating_eligibilities%rowtype;
  v_rating public.ratings%rowtype;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  perform private.lock_rating_command(p_eligibility_id);
  select * into v_eligibility from public.rating_eligibilities where id = p_eligibility_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Rating eligibility not found.';
  end if;
  if v_eligibility.customer_id <> p_customer_id then
    raise exception using errcode = '42501', message = 'You may only rate your own visit.';
  end if;
  if v_eligibility.state = 'used' then
    raise exception using errcode = 'P4021', message = 'This visit has already been rated.';
  end if;
  if v_eligibility.state <> 'open' then
    raise exception using errcode = 'P4035',
      message = coalesce(v_eligibility.void_reason, 'This visit does not unlock a rating.');
  end if;
  if p_display_mode not in ('short_name', 'anonymous') then
    raise exception using errcode = '22023', message = 'Display mode must be short_name or anonymous.';
  end if;

  insert into public.ratings (
    eligibility_id, appointment_id, walk_in_id, customer_id, barber_id, shop_id,
    barber_rating, shop_rating, comment, display_mode, editable_until
  )
  values (
    v_eligibility.id, v_eligibility.appointment_id, v_eligibility.walk_in_id,
    v_eligibility.customer_id, v_eligibility.provider_id, v_eligibility.shop_id,
    p_barber_rating, p_shop_rating, v_comment, p_display_mode, now() + interval '7 days'
  )
  returning * into v_rating;

  update public.rating_eligibilities
  set state = 'used', updated_at = now()
  where id = v_eligibility.id;

  insert into public.rating_events (
    shop_id, eligibility_id, rating_id, actor_id, actor_role, event_type, metadata
  )
  values (
    v_eligibility.shop_id, v_eligibility.id, v_rating.id, p_customer_id, 'customer', 'rating_submitted',
    jsonb_build_object(
      'barber_rating', p_barber_rating,
      'shop_rating', p_shop_rating,
      'has_comment', v_comment is not null,
      'source', v_eligibility.source,
      'editable_until', v_rating.editable_until
    )
  );
  return v_rating;
end;
$$;

create or replace function public.api_edit_rating(
  p_rating_id uuid,
  p_expected_version integer,
  p_customer_id uuid,
  p_barber_rating smallint,
  p_shop_rating smallint,
  p_comment text default null,
  p_display_mode text default 'short_name'
)
returns public.ratings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rating public.ratings%rowtype;
  v_previous public.ratings%rowtype;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into v_previous from public.ratings where id = p_rating_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Rating not found.';
  end if;
  perform private.lock_rating_command(v_previous.eligibility_id);
  select * into v_previous from public.ratings where id = p_rating_id for update;
  if v_previous.customer_id <> p_customer_id then
    raise exception using errcode = '42501', message = 'You may only edit your own review.';
  end if;
  if v_previous.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The review changed; refresh before trying again.';
  end if;
  if now() > v_previous.editable_until then
    raise exception using errcode = 'P4034',
      message = 'The seven-day edit window for this review has closed.';
  end if;
  if p_display_mode not in ('short_name', 'anonymous') then
    raise exception using errcode = '22023', message = 'Display mode must be short_name or anonymous.';
  end if;
  if v_previous.text_state = 'hidden' then
    -- Editing hidden text would let the author republish moderated content by
    -- the back door. Correction has to go through moderation instead.
    raise exception using errcode = 'P4021',
      message = 'Moderated review text cannot be edited; ask support to review the decision.';
  end if;

  update public.ratings
  set barber_rating = p_barber_rating,
      shop_rating = p_shop_rating,
      comment = v_comment,
      display_mode = p_display_mode,
      edit_count = edit_count + 1,
      version = version + 1,
      updated_at = now()
  where id = p_rating_id
  returning * into v_rating;

  -- The previous values live in the audit, which is what makes the edit window
  -- reviewable rather than merely enforced.
  insert into public.rating_events (
    shop_id, eligibility_id, rating_id, actor_id, actor_role, event_type, metadata
  )
  values (
    v_rating.shop_id, v_rating.eligibility_id, v_rating.id, p_customer_id, 'customer', 'rating_edited',
    jsonb_build_object(
      'from', jsonb_build_object(
        'barber_rating', v_previous.barber_rating,
        'shop_rating', v_previous.shop_rating,
        'comment', v_previous.comment,
        'display_mode', v_previous.display_mode
      ),
      'to', jsonb_build_object(
        'barber_rating', v_rating.barber_rating,
        'shop_rating', v_rating.shop_rating,
        'comment', v_rating.comment,
        'display_mode', v_rating.display_mode
      ),
      'edit_count', v_rating.edit_count
    )
  );
  return v_rating;
end;
$$;

-- Turns the passed edit window into a recorded fact. The window is enforced by
-- `api_edit_rating` regardless; this exists so "then lock" is an auditable event
-- and not only an inference from a timestamp.
create or replace function public.api_lock_due_ratings(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked integer := 0;
  v_row record;
begin
  for v_row in
    select id, shop_id, eligibility_id
    from public.ratings
    where locked_at is null and editable_until <= now()
    order by editable_until
    limit greatest(p_limit, 1)
    for update skip locked
  loop
    update public.ratings set locked_at = now() where id = v_row.id;
    insert into public.rating_events (shop_id, eligibility_id, rating_id, actor_role, event_type)
    values (v_row.shop_id, v_row.eligibility_id, v_row.id, 'system', 'rating_locked');
    v_locked := v_locked + 1;
  end loop;
  return v_locked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public responses
-- ---------------------------------------------------------------------------

create or replace function public.api_publish_rating_response(
  p_rating_id uuid,
  p_actor_id uuid,
  p_body text
)
returns public.rating_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rating public.ratings%rowtype;
  v_role text;
  v_response public.rating_responses%rowtype;
begin
  select * into v_rating from public.ratings where id = p_rating_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Rating not found.';
  end if;
  perform private.lock_rating_command(v_rating.eligibility_id);
  v_role := private.rating_shop_actor_role(v_rating.shop_id, v_rating.barber_id, p_actor_id);
  if v_role is null then
    raise exception using errcode = '42501',
      message = 'Only the shop owner or the barber who performed this visit may respond.';
  end if;
  if exists (select 1 from public.rating_responses where rating_id = p_rating_id and author_role = v_role) then
    raise exception using errcode = 'P4021', message = 'This side has already published its one response.';
  end if;

  insert into public.rating_responses (rating_id, shop_id, author_id, author_role, body, editable_until)
  values (p_rating_id, v_rating.shop_id, p_actor_id, v_role, btrim(p_body), now() + interval '7 days')
  returning * into v_response;

  insert into public.rating_events (
    shop_id, eligibility_id, rating_id, response_id, actor_id, actor_role, event_type, metadata
  )
  values (
    v_rating.shop_id, v_rating.eligibility_id, v_rating.id, v_response.id, p_actor_id, v_role,
    'response_published', jsonb_build_object('editable_until', v_response.editable_until)
  );
  return v_response;
end;
$$;

create or replace function public.api_edit_rating_response(
  p_response_id uuid,
  p_expected_version integer,
  p_actor_id uuid,
  p_body text
)
returns public.rating_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.rating_responses%rowtype;
  v_response public.rating_responses%rowtype;
  v_rating public.ratings%rowtype;
begin
  select * into v_previous from public.rating_responses where id = p_response_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Response not found.';
  end if;
  select * into v_rating from public.ratings where id = v_previous.rating_id;
  perform private.lock_rating_command(v_rating.eligibility_id);
  select * into v_previous from public.rating_responses where id = p_response_id for update;
  if v_previous.author_id <> p_actor_id then
    raise exception using errcode = '42501', message = 'Only the author may edit this response.';
  end if;
  if v_previous.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The response changed; refresh before trying again.';
  end if;
  -- Q15: seven days, then correction requires moderation.
  if now() > v_previous.editable_until then
    raise exception using errcode = 'P4034',
      message = 'The seven-day edit window for this response has closed.';
  end if;
  if v_previous.text_state = 'hidden' then
    raise exception using errcode = 'P4021',
      message = 'A moderated response cannot be edited; ask support to review the decision.';
  end if;

  update public.rating_responses
  set body = btrim(p_body),
      edit_count = edit_count + 1,
      version = version + 1,
      updated_at = now()
  where id = p_response_id
  returning * into v_response;

  insert into public.rating_events (
    shop_id, eligibility_id, rating_id, response_id, actor_id, actor_role, event_type, metadata
  )
  values (
    v_response.shop_id, v_rating.eligibility_id, v_rating.id, v_response.id, p_actor_id, v_previous.author_role,
    'response_edited',
    jsonb_build_object('from', v_previous.body, 'to', v_response.body, 'edit_count', v_response.edit_count)
  );
  return v_response;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports and moderation
-- ---------------------------------------------------------------------------

create or replace function public.api_report_rating(
  p_rating_id uuid,
  p_response_id uuid,
  p_reporter_id uuid,
  p_reason_category text,
  p_reason text
)
returns public.rating_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rating public.ratings%rowtype;
  v_response public.rating_responses%rowtype;
  v_target text := case when p_response_id is null then 'review' else 'response' end;
  v_role text;
  v_report public.rating_reports%rowtype;
begin
  select * into v_rating from public.ratings where id = p_rating_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Rating not found.';
  end if;
  perform private.lock_rating_command(v_rating.eligibility_id);

  if p_response_id is not null then
    select * into v_response from public.rating_responses where id = p_response_id and rating_id = p_rating_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Response not found for this rating.';
    end if;
  end if;

  -- The customer may report a response; the shop side may report review text.
  if p_reporter_id = v_rating.customer_id then
    v_role := 'customer';
    if v_target <> 'response' then
      raise exception using errcode = 'P4021', message = 'Report your own review through support, not the report control.';
    end if;
  else
    v_role := private.rating_shop_actor_role(v_rating.shop_id, v_rating.barber_id, p_reporter_id);
    if v_role is null then
      raise exception using errcode = '42501', message = 'You are not a party to this review.';
    end if;
    if v_target <> 'review' then
      raise exception using errcode = 'P4021', message = 'The shop side cannot report its own response.';
    end if;
  end if;

  if p_reason_category not in ('abusive', 'spam', 'private_information', 'off_topic', 'not_a_customer', 'other') then
    raise exception using errcode = '22023', message = 'Unknown report category.';
  end if;

  insert into public.rating_reports (
    rating_id, response_id, shop_id, target, reporter_id, reporter_role, reason_category, reason
  )
  values (
    p_rating_id, p_response_id, v_rating.shop_id, v_target, p_reporter_id, v_role,
    p_reason_category, btrim(p_reason)
  )
  returning * into v_report;

  if v_target = 'review' and v_rating.moderation_state = 'none' then
    update public.ratings set moderation_state = 'reported', version = version + 1, updated_at = now()
    where id = p_rating_id;
  elsif v_target = 'response' and v_response.moderation_state = 'none' then
    update public.rating_responses set moderation_state = 'reported', version = version + 1, updated_at = now()
    where id = p_response_id;
  end if;

  insert into public.rating_events (
    shop_id, eligibility_id, rating_id, response_id, report_id, actor_id, actor_role, event_type, reason, metadata
  )
  values (
    v_rating.shop_id, v_rating.eligibility_id, v_rating.id, p_response_id, v_report.id, p_reporter_id, v_role,
    'report_opened', v_report.reason, jsonb_build_object('target', v_target, 'category', p_reason_category)
  );
  return v_report;
end;
$$;

-- Hide, restore, or reject. Scores are never touched here, and nothing is
-- deleted: `text_state` moves and history accumulates.
create or replace function public.api_moderate_rating_report(
  p_report_id uuid,
  p_expected_version integer,
  p_moderator_id uuid,
  p_decision text,
  p_reason text
)
returns public.rating_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.rating_reports%rowtype;
  v_rating public.ratings%rowtype;
  v_reason text := btrim(p_reason);
  v_event text;
  v_text_state text;
  v_moderation_state text;
begin
  perform private.require_moderator(p_moderator_id);
  select * into v_report from public.rating_reports where id = p_report_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Report not found.';
  end if;
  select * into v_rating from public.ratings where id = v_report.rating_id;
  perform private.lock_rating_command(v_rating.eligibility_id);
  select * into v_report from public.rating_reports where id = p_report_id for update;
  if v_report.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The report changed; refresh before trying again.';
  end if;
  if v_report.status <> 'open' then
    raise exception using errcode = 'P4021', message = 'This report is already resolved.';
  end if;
  if p_decision not in ('hide_text', 'restore_text', 'reject') then
    raise exception using errcode = '22023', message = 'Decision must be hide_text, restore_text or reject.';
  end if;
  if char_length(v_reason) < 3 then
    raise exception using errcode = '22023', message = 'A moderation decision requires a reason.';
  end if;

  if p_decision = 'hide_text' then
    v_text_state := 'hidden'; v_moderation_state := 'hidden'; v_event := 'text_hidden';
  elsif p_decision = 'restore_text' then
    v_text_state := 'visible'; v_moderation_state := 'restored'; v_event := 'text_restored';
  else
    v_text_state := null; v_moderation_state := 'cleared'; v_event := 'report_rejected';
  end if;

  update public.rating_reports
  set status = case when p_decision = 'reject' then 'rejected' else 'upheld' end,
      resolution_reason = v_reason,
      resolved_by = p_moderator_id,
      resolved_at = now(),
      version = version + 1,
      updated_at = now()
  where id = p_report_id
  returning * into v_report;

  if v_report.target = 'review' then
    update public.ratings
    set text_state = coalesce(v_text_state, text_state),
        moderation_state = v_moderation_state,
        version = version + 1,
        updated_at = now()
    where id = v_report.rating_id;
  else
    update public.rating_responses
    set text_state = coalesce(v_text_state, text_state),
        moderation_state = v_moderation_state,
        version = version + 1,
        updated_at = now()
    where id = v_report.response_id;
  end if;

  insert into public.rating_events (
    shop_id, eligibility_id, rating_id, response_id, report_id, actor_id, actor_role, event_type, reason, metadata
  )
  values (
    v_report.shop_id, v_rating.eligibility_id, v_rating.id, v_report.response_id, v_report.id,
    p_moderator_id, 'admin',
    case when p_decision = 'reject' then 'report_rejected' else v_event end,
    v_reason,
    jsonb_build_object('decision', p_decision, 'target', v_report.target)
  );

  -- Belt and braces for the phase-plan requirement that a hidden review keeps
  -- its score: recompute the public averages after every moderation decision and
  -- assert the count did not move.
  if v_report.target = 'review' then
    perform private.recalculate_rating_aggregates(v_rating.shop_id, v_rating.barber_id);
  end if;
  return v_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: commands only, and Express loses its direct write on ratings
-- ---------------------------------------------------------------------------

revoke all on function public.api_submit_rating(uuid, uuid, smallint, smallint, text, text) from public, anon, authenticated;
revoke all on function public.api_edit_rating(uuid, integer, uuid, smallint, smallint, text, text) from public, anon, authenticated;
revoke all on function public.api_lock_due_ratings(integer) from public, anon, authenticated;
revoke all on function public.api_publish_rating_response(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.api_edit_rating_response(uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.api_report_rating(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.api_moderate_rating_report(uuid, integer, uuid, text, text) from public, anon, authenticated;

grant execute on function public.api_submit_rating(uuid, uuid, smallint, smallint, text, text) to service_role;
grant execute on function public.api_edit_rating(uuid, integer, uuid, smallint, smallint, text, text) to service_role;
grant execute on function public.api_lock_due_ratings(integer) to service_role;
grant execute on function public.api_publish_rating_response(uuid, uuid, text) to service_role;
grant execute on function public.api_edit_rating_response(uuid, integer, uuid, text) to service_role;
grant execute on function public.api_report_rating(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.api_moderate_rating_report(uuid, integer, uuid, text, text) to service_role;

-- The point of the packet. `appointments` had insert/delete/truncate revoked in
-- P1-04 so that no service-role client could forge a booking; `ratings` kept
-- full write access, which made `POST /ratings` the last mutation in the app
-- that could bypass a command. It cannot any more.
revoke insert, update, delete, truncate on table public.ratings from service_role;

-- Eligibility is derived from finalized visit facts by trigger. Nothing, not even
-- Express, may hand-write one.
revoke insert, update, delete, truncate on table public.rating_eligibilities from service_role;
revoke insert, update, delete, truncate on table public.rating_responses from service_role;
revoke insert, update, delete, truncate on table public.rating_reports from service_role;
revoke insert, update, delete, truncate on table public.rating_events from service_role;
