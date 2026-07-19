# Supabase schema and RLS design

The version-controlled database lives under `supabase/`. The Express routes in
`apps/api` and the frontend `ApiBackend` are implemented and locally verified.
This file is a concise current-schema reference; see
[05-DATABASE-DESIGN.md](05-DATABASE-DESIGN.md) for the complete current ER model,
known gaps, and planned verification/shop/hiring/payment extensions.

## Files

- `supabase/migrations/20260717000100_initial_domain_schema.sql` creates the
  enums, tables, constraints, foreign keys, indexes, and overlap protection.
- `supabase/migrations/20260717000200_domain_functions_and_triggers.sql` adds
  Auth/profile synchronization, authorization helpers, validation triggers,
  appointment duration calculation, message activity updates, and live rating
  aggregation.
- `supabase/migrations/20260717000300_row_level_security.sql` enables RLS on
  every application table, grants the minimum direct-client privileges, and
  adds the policies.
- `supabase/migrations/20260717000400_api_write_transactions.sql` adds atomic
  database functions for multi-row API writes.
- `supabase/migrations/20260717000500_service_role_privileges.sql` grants the
  Express server role explicit CRUD privileges. `bypassrls` alone does not
  grant SQL table access.
- `supabase/migrations/20260717000600_lock_attendance_to_owner.sql` makes
  attendance mutation owner-controlled.
- `supabase/migrations/20260717000700_lock_unverified_owner_accounts.sql`
  blocks unverified owner applicants from operational data.
- `supabase/migrations/20260718000100_appointment_lifecycle.sql` adds the
  canonical lifecycle, immutable events, optimistic versions, service
  snapshots, hashed check-in codes, and transactional command functions.
- `supabase/migrations/20260718000200_customer_operational_access_fix.sql` and
  `20260718000300_appointment_stale_error_code.sql` correct access/conflict
  behavior.
- `supabase/migrations/20260718000400_owner_reassign_appointment.sql` adds
  atomic owner reassignment.
- `supabase/seed.sql` is intentionally credential-free and creates no users,
  profiles, shops, services, or activity data.
- `supabase/config.toml` configures the local CLI stack and seed file.

## Shared type mapping

| Shared shape | Postgres source | Mapping detail |
| --- | --- | --- |
| `Profile` | `public.users` | `id` is the matching `auth.users.id`. |
| `Barber` | `public.barbers` | Rating fields are maintained from real `ratings` rows. |
| `Shop` | `public.shops` | `barber_ids` is derived from active `barber_employment`; it is not duplicated as an array. |
| `Service` | `public.services` | SQL adds `shop_id`; the API omits it from the existing response shape. |
| `BarberEmployment` | `public.barber_employment` | SQL adds `status` and `applied_at`; API methods returning current employment select `status = active`. |
| `AvailabilityRule` | `public.shift_patterns` | SQL adds shop/employment scope; time values are formatted as `HH:MM` by the API. |
| `AvailabilityOverride` | `public.shift_exceptions` | SQL adds shop/employment scope. Public responses omit `reason`. |
| `BarberAbsence` | `public.attendance_records` | API maps rows with `status = absent`; the table can also hold explicit presence. |
| `Appointment` | `public.appointments` | Canonical lifecycle, optimistic version, lifecycle timestamps/reasons, and immutable booked-service name/duration/price snapshot. |
| `AppointmentEvent` | `public.appointment_events` | Immutable actor/action/from/to/reason/metadata timeline. |
| `Conversation` | `public.conversations` | SQL adds `kind` (`customer_shop` or `staff`); current DTOs do not expose it. |
| `Message` | `public.messages` | Added to Supabase Realtime when the publication exists. |
| `Review` | `public.ratings` | One rating per completed appointment. |

The schema also includes persistence already required by `DataBackend`:
`hiring_listings`, `shop_join_codes`, `shift_change_requests`, `staff_notes`,
`favorite_shops`, `favorite_barbers`, and `bug_reports`.

## RLS matrix

| Data | Customer | Barber | Shop owner |
| --- | --- | --- | --- |
| Full user profile | Own row only | Own row only | Own row only |
| Shop/barber/service catalogue | Read discoverable rows | Read discoverable rows | Read catalogue; write own shop/services |
| Appointments | Create/read/update own | Read assigned; update status | Read/update status for own shop |
| Employment | None beyond applications | Read own history | Manage own shop employment |
| Shift patterns/exceptions | None | Read/write own active-shop shifts | Read/write shifts in own shop |
| Attendance | None | Read own records | Read/write records in own shop |
| Conversations/messages | Only participating conversations | Participating/assigned shop conversations | Conversations belonging to own shop |
| Ratings | Create/read own completed-cut rating | Read ratings about self | Read ratings for own shop |
| Applications | None | Create/read own | Read/resolve for own shop |
| Notification preferences | Read/write own | Read/write own | Read/write own |
| Staff notes/change requests | None | Own notes/requests | Staff in own shop |
| Favorites and bug reports | Own rows only | Own rows only | Own rows only |

Shop identity, active services, barber cards, and open hiring listings are
catalogue data, so authenticated customers can discover shops before booking.
This is the only intentional cross-shop read surface. Operational data is always
participant- or shop-scoped.

`public.users` is not used as a public profile directory because it contains
email and phone. Section 3 must build `PublicProfile` responses with an explicit
`id`, `full_name`, and `avatar_url` column allowlist.

## Credential-free seed

`supabase/seed.sql` intentionally creates no Auth users, profiles, shops, or
services. Local accounts must be created through the application signup flow or
through ephemeral integration-test setup. Production account imports must use
the server-side Auth Admin API and must never be stored in a migration or seed.

## Database safeguards

- Active appointments for the same barber cannot overlap (`tstzrange` exclusion
  constraint).
- Appointment writes snapshot service duration/name/price; the service and
  active barber must belong to the appointment shop.
- Lifecycle RPCs lock the appointment, require `expected_version`, verify actor
  and state, and append an event atomically.
- Requested appointments expire after 15 minutes; finished appointments become
  due for finalization after the confirmation window when the API worker calls
  the due-transition functions.
- Check-in uses a hashed, expiring short code; the plain value is not stored.
- Shift and exception rows require an active employment record.
- Attendance dates must fall inside the employment stint and may only be
  recorded by the barber or that shop's owner.
- Conversations require an active shop barber; messages require a participant
  sender.
- Ratings must match a completed appointment. Barber/shop aggregates update
  from the live rating rows after insert, update, or delete.
- Security-definer RLS helpers live in the unexposed `private` schema and set an
  empty `search_path`.

## Contract notes

1. Shared Zod request schemas live in `packages/shared/src/schemas.ts` and are
   applied by the Express routes before database access.
2. `BarberEmployment` does not expose the new `applied | active | resigned`
   status. Existing UI methods remain compatible by returning only active rows,
   but a future employment-history screen will need a shared type extension.
3. `Service` is globally shaped in TypeScript but shop-scoped in Postgres. The
   API must always filter by shop and must never infer a shop from a client body.
4. The Express client uses the service-role key and therefore bypasses RLS.
   Every route still needs the requested role/ownership checks as a second,
   mandatory authorization layer.
5. Docker-backed `supabase db reset`, direct RLS tests, Express authorization
   tests, and three-role browser checks pass locally. See
   [LOCAL-SUPABASE-VERIFICATION.md](LOCAL-SUPABASE-VERIFICATION.md).
