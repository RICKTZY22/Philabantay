-- P2-07 (slice 4c): a shop cannot publish with nobody bookable.
--
-- Decided with Q20 on 2026-07-30. Publication already checks identity, map pin,
-- timezone, chairs, hours, and one active service, but never checked that any
-- provider could actually take a booking. A shop could therefore publish into
-- the public catalogue and turn away every customer, which was reproduced live:
-- availability returned 200 with zero slots and the booking returned
-- 409 no_provider_available, with nothing at publish time explaining it.
--
-- The body below is the live definition read out of the database with one
-- readiness check inserted before the update. Nothing else changes. It carries
-- its own message rather than joining the existing combined one, because
-- "you have no bookable provider" and "your address is blank" call for
-- completely different actions from the owner.
--
-- This is checked at publish only. An owner whose last barber leaves afterwards
-- keeps a published shop with no slots; making that transition automatic would
-- mean unpublishing a shop behind the owner's back, which is worse. Surfacing it
-- in Shop Setup belongs to the frontend lane.

CREATE OR REPLACE FUNCTION public.api_publish_owner_shop(p_owner_id uuid, p_expected_version integer)
 RETURNS shops
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.shops;
begin
  select *
    into target
    from public.shops
   where owner_id = p_owner_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Create your shop before publishing.';
  end if;
  if target.version <> p_expected_version then
    raise exception using errcode = 'P4020', message = 'This shop changed since you loaded it.';
  end if;
  if not exists (
    select 1 from public.users
    where id = p_owner_id
      and role = 'shop_owner'
      and requested_role = 'shop_owner'
      and verification_status = 'verified'
      and onboarding_completed
  ) then
    raise exception using errcode = '42501', message = 'Verified owner access is required.';
  end if;
  if btrim(target.name) = ''
     or btrim(target.address) = ''
     or btrim(target.city) = ''
     or btrim(target.timezone) = ''
     or target.lat not between -90 and 90
     or target.lng not between -180 and 180
     or target.chair_count < 1
     or not exists (
       select 1 from public.services
       where shop_id = target.id and active
     )
     or not exists (
       select 1 from public.shop_operating_hours
       where shop_id = target.id and not closed
     ) then
    raise exception using
      errcode = 'P4021',
      message = 'Complete the shop identity, map pin, hours, chairs, and active service before publishing.';
  end if;

  -- A shop nobody can be booked at has no business being in the catalogue.
  -- Before this check it could publish, appear in public discovery, and then
  -- refuse every customer: availability returned zero slots and a booking
  -- returned 409 no_provider_available, with nothing at publish time saying why.
  -- Reproduced live on 2026-07-30 with a shop whose only provider was its owner.
  --
  -- "Bookable" deliberately means qualified for at least one active service, not
  -- merely employed, because an unqualified provider yields no slots either.
  if not exists (
    select 1
    from public.service_qualifications as qualification
    join public.services as service
      on service.id = qualification.service_id
     and service.shop_id = qualification.shop_id
    where qualification.shop_id = target.id
      and qualification.active
      and service.active
      and private.is_bookable_provider_for_shop(target.id, qualification.provider_user_id)
  ) then
    raise exception using
      errcode = 'P4021',
      message = 'Add someone who can take bookings before publishing: employ a barber, or switch on your own provider capability, and qualify them for an active service.';
  end if;

  update public.shops
     set lifecycle_status = 'published',
         published_at = coalesce(published_at, now()),
         version = version + 1
   where id = target.id
   returning * into target;

  return target;
end;
$function$;
