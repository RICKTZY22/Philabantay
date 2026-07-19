-- Multi-table API operations live in Postgres functions so each REST request
-- either completes fully or rolls back fully. These functions are intentionally
-- executable only by the server-side service role.

create or replace function public.api_replace_shift_patterns(
  p_employment_id uuid,
  p_rules jsonb
)
returns setof public.shift_patterns
language plpgsql
set search_path = ''
as $$
declare
  v_employment public.barber_employment%rowtype;
begin
  select e.*
  into v_employment
  from public.barber_employment as e
  where e.id = p_employment_id
    and e.status = 'active'
    and e.ended_at is null;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Active employment not found.';
  end if;

  if jsonb_typeof(p_rules) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'Shift rules must be a JSON array.';
  end if;

  delete from public.shift_patterns
  where employment_id = p_employment_id;

  insert into public.shift_patterns (
    employment_id,
    barber_id,
    shop_id,
    weekday,
    start_time,
    end_time
  )
  select
    v_employment.id,
    v_employment.barber_id,
    v_employment.shop_id,
    rule.weekday,
    rule.start_time,
    rule.end_time
  from jsonb_to_recordset(p_rules) as rule(
    weekday smallint,
    start_time time without time zone,
    end_time time without time zone
  );

  return query
  select pattern.*
  from public.shift_patterns as pattern
  where pattern.employment_id = p_employment_id
  order by pattern.weekday, pattern.start_time;
end;
$$;

create or replace function public.api_create_barber_application(
  p_barber_id uuid,
  p_shop_id uuid
)
returns public.barber_applications
language plpgsql
set search_path = ''
as $$
declare
  v_application public.barber_applications%rowtype;
begin
  insert into public.barber_applications (barber_id, shop_id, status)
  values (p_barber_id, p_shop_id, 'pending')
  returning * into v_application;

  insert into public.barber_employment (barber_id, shop_id, status)
  values (p_barber_id, p_shop_id, 'applied');

  return v_application;
end;
$$;

create or replace function public.api_resolve_barber_application(
  p_application_id uuid,
  p_status public.barber_application_status,
  p_hired_at date default current_date
)
returns public.barber_applications
language plpgsql
set search_path = ''
as $$
declare
  v_application public.barber_applications%rowtype;
  v_employment_id uuid;
begin
  if p_status not in ('accepted', 'declined') then
    raise exception using
      errcode = '22023',
      message = 'Application status must be accepted or declined.';
  end if;

  update public.barber_applications
  set status = p_status
  where id = p_application_id
    and status = 'pending'
  returning * into v_application;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Pending barber application not found.';
  end if;

  if p_status = 'accepted' then
    update public.barber_employment
    set status = 'active', hired_at = p_hired_at
    where barber_id = v_application.barber_id
      and shop_id = v_application.shop_id
      and status = 'applied'
    returning id into v_employment_id;

    if v_employment_id is null then
      insert into public.barber_employment (
        barber_id,
        shop_id,
        status,
        hired_at
      )
      values (
        v_application.barber_id,
        v_application.shop_id,
        'active',
        p_hired_at
      );
    end if;
  else
    delete from public.barber_employment
    where barber_id = v_application.barber_id
      and shop_id = v_application.shop_id
      and status = 'applied';
  end if;

  return v_application;
end;
$$;

create or replace function public.api_approve_employment(
  p_employment_id uuid,
  p_hired_at date default current_date
)
returns public.barber_employment
language plpgsql
set search_path = ''
as $$
declare
  v_employment public.barber_employment%rowtype;
begin
  update public.barber_employment
  set status = 'active', hired_at = p_hired_at
  where id = p_employment_id
    and status = 'applied'
  returning * into v_employment;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Applied employment not found.';
  end if;

  update public.barber_applications
  set status = 'accepted'
  where barber_id = v_employment.barber_id
    and shop_id = v_employment.shop_id
    and status = 'pending';

  return v_employment;
end;
$$;

revoke all on function public.api_replace_shift_patterns(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.api_create_barber_application(uuid, uuid) from public, anon, authenticated;
revoke all on function public.api_resolve_barber_application(uuid, public.barber_application_status, date) from public, anon, authenticated;
revoke all on function public.api_approve_employment(uuid, date) from public, anon, authenticated;

grant execute on function public.api_replace_shift_patterns(uuid, jsonb) to service_role;
grant execute on function public.api_create_barber_application(uuid, uuid) to service_role;
grant execute on function public.api_resolve_barber_application(uuid, public.barber_application_status, date) to service_role;
grant execute on function public.api_approve_employment(uuid, date) to service_role;
