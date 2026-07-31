-- P2-07 follow-up: stop an unrecognised shop timezone from taking the shop's
-- entire booking surface down.
--
-- Found by reviewing 20260730000200 rather than by a failing test. That
-- migration made the engine evaluate every wall-clock rule in the shop's own
-- timezone instead of a hardcoded 'Asia/Manila', which is the right behaviour —
-- but nothing has ever validated that `shops.timezone` holds a real IANA zone.
-- The only constraint is a length check:
--
--   shops_timezone_length  check (char_length(btrim(timezone)) between 1 and 64)
--
-- so 'Manila/NotAZone' has always been storable. Before P2-07 that was inert,
-- because the gate ignored the column. Now every booking, quote, and slot query
-- runs `at time zone shop.timezone`, and an unrecognised value raises
--
--   ERROR: time zone "Manila/NotAZone" not recognized
--
-- which surfaces as a 500 and makes the shop completely unbookable with no
-- actionable message. One bad character in a settings field would do it.
--
-- The guard is a trigger rather than Express validation because writes to
-- `shops` go through the service role, which bypasses Express entirely on some
-- paths. It is also not a CHECK constraint: recognising a zone means consulting
-- pg_timezone_names, and CHECK expressions must be immutable.
--
-- The engine deliberately does not re-validate per booking. pg_timezone_names
-- enumerates the whole zone database on every call, which is fine on a rare shop
-- write and wasteful on every slot in a day. One gate at the write boundary is
-- enough precisely because it covers every writer.

create or replace function private.validate_shop_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = new.timezone
  ) then
    raise exception using
      errcode = '22023',
      message = format(
        '%L is not a recognised IANA time zone. Use a name such as Asia/Manila.',
        new.timezone
      );
  end if;
  return new;
end;
$$;

revoke all on function private.validate_shop_timezone()
  from public, anon, authenticated, service_role;

-- Repair anything already stored before the guard existed. A shop holding an
-- unrecognised zone cannot take a booking at all, so leaving the value intact
-- would only preserve an outage; resetting to the column's own default restores
-- function and is visible to the owner in Shop Setup. Expected to affect zero
-- rows on any environment that only ever wrote 'Asia/Manila'.
update public.shops as shop
  set timezone = 'Asia/Manila'
  where not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = shop.timezone
  );

create trigger shops_validate_timezone
  before insert or update of timezone
  on public.shops
  for each row
  execute function private.validate_shop_timezone();
