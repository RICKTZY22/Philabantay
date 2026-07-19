-- Trusted helpers live outside the exposed public schema. RLS policies call
-- these SECURITY DEFINER functions to avoid recursive policy lookups.

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.users as u
  where u.id = (select auth.uid());
$$;

create or replace function private.owns_shop(
  p_shop_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shops as s
    where s.id = p_shop_id
      and s.owner_id = coalesce(p_user_id, (select auth.uid()))
  );
$$;

create or replace function private.is_active_barber_for_shop(
  p_shop_id uuid,
  p_barber_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barber_employment as e
    where e.shop_id = p_shop_id
      and e.barber_id = coalesce(p_barber_id, (select auth.uid()))
      and e.status = 'active'
      and e.ended_at is null
  );
$$;

create or replace function private.is_shop_member(
  p_shop_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.owns_shop(p_shop_id, p_user_id)
    or private.is_active_barber_for_shop(p_shop_id, p_user_id);
$$;

create or replace function private.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations as c
    where c.id = p_conversation_id
      and (
        c.customer_id = coalesce(p_user_id, (select auth.uid()))
        or c.barber_id = coalesce(p_user_id, (select auth.uid()))
        or private.owns_shop(c.shop_id, p_user_id)
      )
  );
$$;

create or replace function private.rating_matches_completed_appointment(
  p_appointment_id uuid,
  p_customer_id uuid,
  p_barber_id uuid,
  p_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments as a
    where a.id = p_appointment_id
      and a.customer_id = p_customer_id
      and a.barber_id = p_barber_id
      and a.shop_id = p_shop_id
      and a.status = 'completed'
  );
$$;

create or replace function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'New user'
  );

  insert into public.users (
    id,
    role,
    requested_role,
    verification_status,
    onboarding_completed,
    full_name,
    email,
    phone,
    location,
    avatar_url,
    created_at,
    updated_at
  ) values (
    new.id,
    'customer',
    null,
    'unverified',
    false,
    profile_name,
    lower(coalesce(new.email, '')),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'location', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_change();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_auth_user_change();

create or replace function private.validate_barber_employment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.users as u
    where u.id = new.barber_id
      and u.role = 'barber'
      and u.verification_status = 'verified'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Employment requires a verified barber profile.';
  end if;

  return new;
end;
$$;

create trigger barber_employment_validate_barber
  before insert or update of barber_id on public.barber_employment
  for each row execute function private.validate_barber_employment();

create or replace function private.require_active_employment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.barber_employment as e
    where e.id = new.employment_id
      and e.barber_id = new.barber_id
      and e.shop_id = new.shop_id
      and e.status = 'active'
      and e.ended_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'An active employment is required for this staff record.';
  end if;

  return new;
end;
$$;

create trigger shift_patterns_require_active_employment
  before insert or update of employment_id, barber_id, shop_id on public.shift_patterns
  for each row execute function private.require_active_employment();

create trigger shift_exceptions_require_active_employment
  before insert or update of employment_id, barber_id, shop_id on public.shift_exceptions
  for each row execute function private.require_active_employment();

create trigger shift_change_requests_require_active_employment
  before insert or update of employment_id, barber_id, shop_id on public.shift_change_requests
  for each row execute function private.require_active_employment();

create or replace function private.validate_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.barber_employment as e
    where e.id = new.employment_id
      and e.barber_id = new.barber_id
      and e.shop_id = new.shop_id
      and e.hired_at is not null
      and new.date >= e.hired_at
      and (e.ended_at is null or new.date <= e.ended_at)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Attendance date is outside the employment period.';
  end if;

  if new.recorded_by <> new.barber_id
    and not private.owns_shop(new.shop_id, new.recorded_by) then
    raise exception using
      errcode = '23514',
      message = 'Attendance can only be recorded by the barber or shop owner.';
  end if;

  return new;
end;
$$;

create trigger attendance_records_validate
  before insert or update on public.attendance_records
  for each row execute function private.validate_attendance_record();

create or replace function private.prepare_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_duration integer;
  service_is_active boolean;
begin
  select s.duration_min, s.active
    into service_duration, service_is_active
  from public.services as s
  where s.id = new.service_id
    and s.shop_id = new.shop_id;

  if service_duration is null then
    raise exception using
      errcode = '23503',
      message = 'Service does not belong to the appointment shop.';
  end if;

  if (tg_op = 'INSERT'
      or new.service_id is distinct from old.service_id
      or new.shop_id is distinct from old.shop_id)
    and not service_is_active then
    raise exception using
      errcode = '23514',
      message = 'Inactive services cannot be booked.';
  end if;

  if not private.is_active_barber_for_shop(new.shop_id, new.barber_id) then
    raise exception using
      errcode = '23514',
      message = 'Barber is not active at the appointment shop.';
  end if;

  new.ends_at := new.starts_at + make_interval(mins => service_duration);
  return new;
end;
$$;

create trigger appointments_prepare
  before insert or update of barber_id, shop_id, service_id, starts_at
  on public.appointments
  for each row execute function private.prepare_appointment();

create or replace function private.enforce_direct_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  -- Service-role operations have no end-user auth.uid(); Express performs the
  -- equivalent transition checks before issuing those writes.
  if actor_id is null then
    return new;
  end if;

  if actor_id = old.customer_id then
    if new.customer_id is distinct from old.customer_id
      or new.shop_id is distinct from old.shop_id then
      raise exception using errcode = '42501', message = 'Customers cannot move bookings between accounts or shops.';
    end if;

    if new.status <> old.status and new.status <> 'cancelled' then
      raise exception using errcode = '42501', message = 'Customers may only cancel an active booking.';
    end if;

    if old.status not in ('pending', 'confirmed') or old.starts_at <= now() then
      raise exception using errcode = '42501', message = 'This booking can no longer be changed.';
    end if;
  elsif actor_id = old.barber_id or private.owns_shop(old.shop_id, actor_id) then
    if new.customer_id is distinct from old.customer_id
      or new.barber_id is distinct from old.barber_id
      or new.shop_id is distinct from old.shop_id
      or new.service_id is distinct from old.service_id
      or new.starts_at is distinct from old.starts_at
      or new.notes is distinct from old.notes then
      raise exception using errcode = '42501', message = 'Shop staff may only change appointment status.';
    end if;
  else
    raise exception using errcode = '42501', message = 'Not allowed to update this appointment.';
  end if;

  return new;
end;
$$;

create trigger appointments_enforce_direct_update
  before update on public.appointments
  for each row execute function private.enforce_direct_appointment_update();

create or replace function private.validate_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_barber_for_shop(new.shop_id, new.barber_id) then
    raise exception using
      errcode = '23514',
      message = 'Conversation barber is not active at this shop.';
  end if;

  if new.kind = 'customer_shop' then
    if not exists (
      select 1 from public.users as u
      where u.id = new.customer_id and u.role = 'customer'
    ) then
      raise exception using errcode = '23514', message = 'Customer conversation requires a customer account.';
    end if;
  elsif not private.owns_shop(new.shop_id, new.customer_id) then
    raise exception using errcode = '23514', message = 'Staff conversation must be opened by the shop owner.';
  end if;

  return new;
end;
$$;

create trigger conversations_validate
  before insert or update of kind, customer_id, shop_id, barber_id
  on public.conversations
  for each row execute function private.validate_conversation();

create or replace function private.validate_message_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_conversation_participant(new.conversation_id, new.sender_id) then
    raise exception using errcode = '23514', message = 'Message sender is not a conversation participant.';
  end if;
  return new;
end;
$$;

create trigger messages_validate_sender
  before insert or update of conversation_id, sender_id
  on public.messages
  for each row execute function private.validate_message_sender();

create or replace function private.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function private.touch_conversation_from_message();

create or replace function private.validate_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.rating_matches_completed_appointment(
    new.appointment_id,
    new.customer_id,
    new.barber_id,
    new.shop_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Rating must match a completed appointment.';
  end if;
  return new;
end;
$$;

create trigger ratings_validate
  before insert or update of appointment_id, customer_id, barber_id, shop_id
  on public.ratings
  for each row execute function private.validate_rating();

create or replace function private.refresh_rating_aggregates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_barber_id uuid;
  new_barber_id uuid;
  old_shop_id uuid;
  new_shop_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_barber_id := old.barber_id;
    old_shop_id := old.shop_id;
  end if;
  if tg_op <> 'DELETE' then
    new_barber_id := new.barber_id;
    new_shop_id := new.shop_id;
  end if;

  if old_barber_id is not null then
    update public.barbers as b
    set rating = coalesce((select round(avg(r.barber_rating)::numeric, 2) from public.ratings as r where r.barber_id = old_barber_id), 0),
        rating_count = (select count(*) from public.ratings as r where r.barber_id = old_barber_id)
    where b.id = old_barber_id;
  end if;

  if new_barber_id is not null and new_barber_id is distinct from old_barber_id then
    update public.barbers as b
    set rating = coalesce((select round(avg(r.barber_rating)::numeric, 2) from public.ratings as r where r.barber_id = new_barber_id), 0),
        rating_count = (select count(*) from public.ratings as r where r.barber_id = new_barber_id)
    where b.id = new_barber_id;
  end if;

  if old_shop_id is not null then
    update public.shops as s
    set rating = coalesce((select round(avg(r.shop_rating)::numeric, 2) from public.ratings as r where r.shop_id = old_shop_id), 0),
        rating_count = (select count(*) from public.ratings as r where r.shop_id = old_shop_id)
    where s.id = old_shop_id;
  end if;

  if new_shop_id is not null and new_shop_id is distinct from old_shop_id then
    update public.shops as s
    set rating = coalesce((select round(avg(r.shop_rating)::numeric, 2) from public.ratings as r where r.shop_id = new_shop_id), 0),
        rating_count = (select count(*) from public.ratings as r where r.shop_id = new_shop_id)
    where s.id = new_shop_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger ratings_refresh_aggregates
  after insert or update or delete on public.ratings
  for each row execute function private.refresh_rating_aggregates();

create trigger users_set_updated_at
  before update on public.users
  for each row execute function private.set_updated_at();
create trigger shops_set_updated_at
  before update on public.shops
  for each row execute function private.set_updated_at();
create trigger barbers_set_updated_at
  before update on public.barbers
  for each row execute function private.set_updated_at();
create trigger services_set_updated_at
  before update on public.services
  for each row execute function private.set_updated_at();
create trigger barber_employment_set_updated_at
  before update on public.barber_employment
  for each row execute function private.set_updated_at();
create trigger shift_patterns_set_updated_at
  before update on public.shift_patterns
  for each row execute function private.set_updated_at();
create trigger shift_exceptions_set_updated_at
  before update on public.shift_exceptions
  for each row execute function private.set_updated_at();
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function private.set_updated_at();
create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute function private.set_updated_at();
create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function private.set_updated_at();
create trigger barber_applications_set_updated_at
  before update on public.barber_applications
  for each row execute function private.set_updated_at();
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function private.set_updated_at();
create trigger shift_change_requests_set_updated_at
  before update on public.shift_change_requests
  for each row execute function private.set_updated_at();
create trigger hiring_listings_set_updated_at
  before update on public.hiring_listings
  for each row execute function private.set_updated_at();
