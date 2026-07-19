# Local Supabase verification

Section 5 of the Supabase migration was completed against the Docker-backed
Supabase CLI stack on July 17, 2026.

## What passed

- All five versioned migrations and `supabase/seed.sql` apply from a clean
  `supabase db reset`.
- Ephemeral customer, barber, and owner test accounts can authenticate with
  Supabase Auth and are not stored in source control.
- Direct Postgres access using each user's JWT obeys RLS boundaries.
- The Express API independently enforces the same role and shop boundaries even
  though its server-side database client uses the service-role key.
- Customer, barber, and owner dashboards load through `ApiBackend` in the real
  browser UI. Owner Overview, Reservations, Staff, Messages, Barbers, and
  Settings are exposed through the hamburger menu.
- Browser verification produced no console errors or warnings.

The integration suite creates temporary users and two temporary shops to prove
cross-shop isolation, then the database is reset back to the empty,
credential-free seed.

## Run it again

```powershell
npx supabase start
npx supabase db reset
$status = npx supabase status -o env
# Export the URL, publishable key, and service-role key from $status for the API
# and test process, then:
$env:RUN_LOCAL_SUPABASE_TESTS = '1'
npm test --workspace @barbershop/api -- local-supabase.integration.test.ts
```

Run `npx supabase stop` when the local services are no longer needed. Docker
Desktop must be running before `npx supabase start`.

## Verified authorization matrix

| Role | Allowed | Explicitly denied |
| --- | --- | --- |
| Customer | Own appointments and participating conversation messages | Another customer's appointments/messages and owner-only routes |
| Barber | Assigned appointments, own shop shifts/attendance, participating messages | Another shop's shifts, appointments, messages, and owner routes |
| Owner | Appointments, staff, shifts, attendance, and conversations in owned shop | Every operational row and owner route for another shop |

The normal workspace test command leaves this live suite skipped so developers
without Docker can still run fast unit and boundary tests.
