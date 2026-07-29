-- Pre-P2-06 bounded hardening: close retained legacy data and helper grants,
-- strengthen employment-request provenance, and add durable state/capacity for
-- media cleanup and truthful superseded requests.

alter type public.shop_media_upload_status
  add value if not exists 'deleting';

alter type public.employment_request_status
  add value if not exists 'superseded';

drop table if exists public.legacy_shop_join_codes;

revoke all on function private.assert_published_shop_facts(uuid)
  from public, anon, authenticated;
revoke all on function private.is_shop_member(uuid, uuid)
  from public, anon, authenticated;

alter table public.employment_requests
  drop constraint if exists employment_requests_actor_direction;
alter table public.employment_requests
  add constraint employment_requests_actor_direction check (
    (direction in ('barber_application', 'join_code') and created_by = barber_id)
    or (direction = 'owner_invitation' and created_by <> barber_id)
  );

create or replace function private.enforce_employment_request_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.direction in ('barber_application', 'join_code')
     and new.created_by <> new.barber_id then
    raise exception using
      errcode = '42501',
      message = 'The barber must create this employment request.';
  end if;

  if new.direction = 'owner_invitation'
     and not exists (
       select 1
         from public.shops as shop
         join public.users as owner on owner.id = shop.owner_id
        where shop.id = new.shop_id
          and shop.owner_id = new.created_by
          and owner.role = 'shop_owner'
          and owner.requested_role = 'shop_owner'
          and owner.verification_status = 'verified'
          and owner.onboarding_completed
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only the verified owning shop account may create an invitation.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_employment_request_actor()
  from public, anon, authenticated;

drop trigger if exists employment_requests_enforce_actor
  on public.employment_requests;
create trigger employment_requests_enforce_actor
  before insert or update of shop_id, barber_id, direction, created_by
  on public.employment_requests
  for each row execute function private.enforce_employment_request_actor();

create or replace function private.enforce_shop_media_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
    from public.shops
   where id = new.shop_id
   for update;

  if (
    select count(*)
      from public.shop_media
     where shop_id = new.shop_id
  ) >= 100 then
    raise exception using
      errcode = 'P4022',
      message = 'A shop can retain at most 100 photo records.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_shop_media_cap()
  from public, anon, authenticated;

drop trigger if exists shop_media_enforce_cap on public.shop_media;
create trigger shop_media_enforce_cap
  before insert on public.shop_media
  for each row execute function private.enforce_shop_media_cap();

do $$
begin
  if exists (
    select 1
      from public.shop_media
     group by shop_id
    having count(*) > 100
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing shop media exceeds the 100-row hardening cap.';
  end if;

  if exists (
    select 1
      from public.employment_requests as request
     where request.direction = 'owner_invitation'
       and not exists (
         select 1
           from public.shops as shop
          where shop.id = request.shop_id
            and shop.owner_id = request.created_by
       )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Existing owner invitations contain invalid creator provenance.';
  end if;
end;
$$;
