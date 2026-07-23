# Express REST API

`apps/api` is the server-only Supabase adapter for Philabantay. It uses a
publishable-key client to verify Supabase access tokens and a separate,
non-persisting service-role client for database work. The service-role key is
never referenced by `apps/web` or by a `VITE_` environment variable.

## Run locally

Copy `apps/api/.env.example` to `apps/api/.env`, fill in the keys printed by
`supabase status`, then run:

```powershell
npm run dev:api
```

The default base URL is `http://127.0.0.1:4000/api/v1`. Except for signup,
signin, token refresh, and `/health`, requests require:

```http
Authorization: Bearer <supabase-access-token>
```

To use this server from Vite, copy `apps/web/.env.example` to
`apps/web/.env`, set `VITE_DATA_BACKEND=api`, and keep
`VITE_API_BASE_URL=http://127.0.0.1:4000/api/v1`.

## Response contract

Successful JSON responses use `{ "data": ... }`. Expected failures use one
shape everywhere:

```json
{
  "error": {
    "code": "forbidden",
    "message": "You are not allowed to perform this action.",
    "details": []
  }
}
```

`details` is optional. Request bodies are parsed with strict shared Zod schemas,
so unknown fields are rejected before any database query.

## Route groups

| Group | Main routes |
| --- | --- |
| Auth | `/auth/signup`, `/auth/signin`, `/auth/refresh`, `/auth/me`, `/auth/onboarding`, `/auth/profile`, `/auth/password`, `/auth/signout` |
| Catalogue | `/shops`, `/barbers`, `/barbers/available`, `/services` |
| Availability | `/shifts/patterns`, `/shifts/exceptions`, `/availability/slots`, owner staff-pattern route |
| Bookings | `/bookings`, versioned lifecycle commands, timeline, `/shops/:id/bookings` |
| Owner reporting | `/shops/:id/stats`, `/shops/:id/staff`, `/shops/:id/barbers/performance` |
| Chat | `/conversations`, `/conversations/staff`, `/conversations/:id/messages`, `/messages`, read action |
| Employment | hiring shops, applications, join codes, approval, attendance, shift-change requests, staff notes |
| Account data | favorites, ratings, notification preferences, bug reports |

The `messages` table remains in the Supabase Realtime publication for a future
push transport. The current `ApiBackend` implements the existing synchronous
subscription contract with authenticated HTTP polling and immediate same-tab
delivery, so chat UI components require no transport-specific code.

## Defense in depth

The middleware verifies each bearer token with Supabase Auth's `getUser(jwt)`
network check, loads the trusted role from `public.users`, and attaches both to
the request. Every shop/staff route then checks ownership, active employment, or
conversation participation before using the service-role client.

The service-role client bypasses RLS. These Express checks are mandatory and do
not replace the RLS policies; they protect the service-role query path while RLS
protects direct user-token database access.

Multi-row writes that must be atomic are implemented by
`20260717000400_api_write_transactions.sql`. Shift-pattern replacement and
barber application/employment transitions therefore commit or roll back as one
database transaction.

## Appointment lifecycle commands

Clients send the appointment's latest positive `version` as
`expected_version`. A stale command returns HTTP `409` with
`stale_appointment`; clients should refresh instead of retrying blindly.

| Actor | Command routes |
| --- | --- |
| Owner | `POST /bookings/:id/accept`, `/decline`, `/check-in`, `/reassign`, `/resolve-dispute` |
| Assigned barber | `POST /bookings/:id/check-in-code`, `/start`, `/finish`, `/no-show` |
| Customer | `POST /bookings/:id/check-in`, `/confirm-completion`, `/dispute`, `/cancel` |
| Participants/owner | `GET /bookings/:id/timeline` |

Cancellation, decline, no-show, reassignment, manual owner check-in, and
dispute decisions require a reason. Lifecycle writes execute through
service-role-only PostgreSQL functions that lock the appointment, repeat actor
and state checks, increment `version`, and append an immutable
`appointment_events` record in the same transaction. Direct authenticated
status updates are revoked.

The API server runs an idempotent one-minute worker that expires unanswered
requests and completes finished cuts whose customer confirmation window ended.
Service names, durations, and prices are snapshotted onto appointments, so
historical reports do not change when the service menu is edited. Until payment
collection is modeled, `revenue_cents` is retained as a compatibility alias for
`completed_service_value_cents` and is marked `revenue_is_estimate: true`.

## Tests

`npm test --workspace @barbershop/api` verifies the public health endpoint,
required bearer authentication, Supabase token verification, strict-body
rejection before Auth calls, and the consistent invalid-JSON error shape.

`test/local-supabase.integration.test.ts` adds live direct-RLS, Express API
isolation, and appointment lifecycle coverage. It is skipped during the normal fast suite and enabled with
`RUN_LOCAL_SUPABASE_TESTS=1` after starting local Supabase. See
[LOCAL-SUPABASE-VERIFICATION.md](../mdfiles/LOCAL-SUPABASE-VERIFICATION.md) for the exact
workflow and verified role matrix.
