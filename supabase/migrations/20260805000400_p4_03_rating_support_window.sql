-- Phase 4 P4-03: support control over a review's edit window.
--
-- Q15 says that once the seven days pass, "correction requires support or
-- moderation". Nothing implemented that: the window was a timestamp only the
-- submitting command ever wrote, so a moderator who reversed a wrong decision had
-- no way to let the author fix their own text, and a moderator facing an author
-- abusing repeated edits had no way to stop it short of hiding the review.
--
-- This is the support action Q15 describes. It needs `content_moderation` and,
-- through Express, AAL2; it is version-checked; and it appends an event, so a
-- reopened window is visible in the same audit as every other trust decision.

create or replace function public.api_set_rating_edit_window(
  p_rating_id uuid,
  p_expected_version integer,
  p_moderator_id uuid,
  p_editable_until timestamptz,
  p_reason text
)
returns public.ratings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.ratings%rowtype;
  v_rating public.ratings%rowtype;
  v_reason text := btrim(p_reason);
begin
  perform private.require_moderator(p_moderator_id);
  if char_length(v_reason) < 3 then
    raise exception using errcode = '22023', message = 'A window change requires a reason.';
  end if;
  -- A window cannot be pushed further than a further seven days, so support can
  -- correct a decision without turning a review into a permanently editable one.
  if p_editable_until > now() + interval '7 days' then
    raise exception using errcode = '22023', message = 'An edit window may not extend more than seven days from now.';
  end if;

  select * into v_previous from public.ratings where id = p_rating_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Rating not found.';
  end if;
  perform private.lock_rating_command(v_previous.eligibility_id);
  select * into v_previous from public.ratings where id = p_rating_id for update;
  if v_previous.version <> p_expected_version then
    raise exception using errcode = 'P4090', message = 'The review changed; refresh before trying again.';
  end if;

  update public.ratings
  set editable_until = p_editable_until,
      -- Reopening clears the lock; closing early records it immediately.
      locked_at = case when p_editable_until > now() then null else now() end,
      version = version + 1,
      updated_at = now()
  where id = p_rating_id
  returning * into v_rating;

  insert into public.rating_events (
    shop_id, eligibility_id, rating_id, actor_id, actor_role, event_type, reason, metadata
  )
  values (
    v_rating.shop_id, v_rating.eligibility_id, v_rating.id, p_moderator_id, 'admin',
    case when p_editable_until > now() then 'rating_edited' else 'rating_locked' end,
    v_reason,
    jsonb_build_object(
      'edit_window_changed', true,
      'from', v_previous.editable_until,
      'to', v_rating.editable_until
    )
  );
  return v_rating;
end;
$$;

revoke all on function public.api_set_rating_edit_window(uuid, integer, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.api_set_rating_edit_window(uuid, integer, uuid, timestamptz, text)
  to service_role;
