---
tags:
  - philabantay
  - audit
  - security
  - booking
updated: 2026-08-06
---

# Full repo audit — 2026-08-06

**Scope:** whole repository. `apps/api`, `apps/web`, `packages/shared`,
`supabase/migrations` (69 migrations), root config.

**Type:** polishing pass, pre-launch. Read-only. No code was changed.

**Verification standard.** Every finding below carries a `Verified:` line saying
how it was established. Where a claim could be checked against the live local
Postgres, it was, with read-only `SELECT`s against `pg_catalog` and
`information_schema` — never by trusting the migration text, because migrations
`create or replace` each other and only the final state is true. Static findings
say so explicitly. Three findings I initially drafted were **withdrawn** during
verification; they are recorded in [Withdrawn](#withdrawn-during-verification) so
nobody re-files them.

The mutating integration matrix was deliberately **not** run. Another agent was
working in this environment, and the suite asserts exact published-shop counts
(`local-supabase.integration.test.ts:333`), so a concurrent run would have
corrupted both its fixtures and their session.

## Audit conditions — read this before trusting line numbers

The MFA slice was being written **while this audit ran**. Files landed between
18:48 and 18:55; the tree was clean and committed as `3230ab6` by 19:36. Two
observations from mid-edit were transient, not defects, and are recorded as such
in [Withdrawn](#withdrawn-during-verification). Everything else below was
verified against the committed tree.

`3230ab6` closes the blocker recorded in
[CURRENT-STATE](../memory/CURRENT-STATE.md) — TOTP enrolment plus a step-up
challenge — so the staff console is now reachable in a browser for the first
time. It got its own focused pass here, since it is the newest and least-reviewed
code in the repo.

---

## Repo map

| Path | What it is |
| --- | --- |
| `apps/api/src/routes/` | 18 Express routers. Every mutation delegates to a `security definer` Postgres command |
| `apps/api/src/http/` | JWT + AAL authentication, authorization guards, zod validation, error mapping |
| `apps/api/src/lib/` | Supabase clients, Manila time helpers, media/evidence handling, TOTP factors |
| `packages/shared/` | The contract: types, zod schemas, DTOs, and `ApiBackend`, the sole data-access implementation |
| `apps/web/src/` | React 19 + react-router. 112 files, ~15k lines, pages lazy-loaded from `App.tsx` |
| `supabase/migrations/` | 69 forward migrations, ~24k lines. **The booking rules actually live here** |

There is no `docker-compose.yml`. The local stack is the Supabase CLI plus two
npm dev servers, so the audit template's Docker section reduces to the two config
items under [Deploy and config](#deploy-and-config).

---

## Booking domain

The claim gate is strong, and the shape of the remaining defects only makes sense
against that fact. `private.require_bookable_appointment_slot` checks
publication, the shop's own timezone, lead and advance bounds, opening hours,
closures, replacement hours, qualification, a buffer-aware provider gap, customer
double-booking, and chair capacity as peak concurrency — under advisory locks
taken in a fixed shop → customer → barber order, backed by GiST `EXCLUDE`
constraints as a hard floor.

> **Verified (live):** `private.lock_appointment_capacity` exists in exactly one
> signature, `(uuid,uuid,uuid,uuid)` — the shop-scoped one, so no caller can
> still be taking the old three-argument lock. Both `EXCLUDE USING gist`
> constraints are present on `public.appointments` for barber and customer
> overlap, each filtered to the five capacity-blocking statuses.
> `api_create_booking` → `api_create_appointment` →
> `require_bookable_appointment_slot`, and
> `api_reschedule_appointment_unlocked` → `require_bookable_appointment_slot`,
> both confirmed by reading `pg_proc.prosrc` of the deployed functions.

**I could not construct a double-booking, a lost update, or a slot-conflict
race.** Every defect below is in the Express layer sitting in *front* of that
gate, or in a second gate that predates the owner-provider work.

### High

#### B-1. A customer is offered owner-provider slots that the API then refuses

`bookingScope` ([bookings.ts:139-146](../../apps/api/src/routes/bookings.ts))
requires an active `barber_employment` row **and** `profile.role === 'barber'`.
A provider-enabled owner has neither, by design.

The rest of the stack disagrees:

- `api_availability_slots` reads `owner_provider_profiles`, so
  `GET /availability` **offers** their slots.
- `require_bookable_appointment_slot` reads `owner_provider_profiles`, so the
  database **would accept** the reschedule.
- [AppointmentsPage.tsx:279](../../apps/web/src/pages/AppointmentsPage.tsx) posts
  `slot.provider_user_id` straight into `barber_id`.

So the customer clicks a slot the app just advertised and receives
`400 "Barber and service must be active at the same shop."`

> **Verified (live):** both `prosrc` bodies confirmed to reference
> `owner_provider_profiles`. Migration
> [20260730000900:8](../../supabase/migrations/20260730000900_p2_07_owner_provider_availability.sql)
> states the premise outright: "An owner has no `barber_employment` row."
> **Latent, not currently live in this database:** `owner_provider_profiles` has
> 0 rows with `active and accepting_bookings`, though 8 shadow `barbers` rows for
> `shop_owner` users exist. It becomes reachable the moment an owner switches the
> capability on, which is a supported one-click action since P2-05.
> The end-to-end 400 is verified by construction, not executed.

**Fix:** give `bookingScope` the same owner-provider branch the gate has, or
delete it entirely — see [B-4](#b-4-assertbookableslot-is-a-strictly-weaker-duplicate-of-the-claim-gate).

#### B-2. An owner-provider's visit strands at `checked_in` with no button

`allowedAppointmentActions`
([bookings.ts:317-346](../../apps/api/src/routes/bookings.ts)) gates `isProvider`
on `role === 'barber'`, and pushes `start` and `finish` only inside that branch.
The `isOwner` branch pushes `accept`, `decline`, `reassign`, `check_in`,
`issue_check_in_code`, `report_delay`, `propose_change` and `resolve_dispute` —
but never `start` or `finish`.

This is the exact failure the comment at
[bookings.ts:239-249](../../apps/api/src/routes/bookings.ts) says it fixed.
`requireAssignedProvider` was widened for owner-providers, with a comment
explaining that an owner who could be booked but could not start or finish would
strand the appointment. The authorization layer was fixed; **the affordance layer
was not.** The API accepts the call; nothing renders the control.

> **Verified (static):** re-read lines 317-346 of the committed file. `isProvider`
> requires the `barber` role; `start`/`finish` appear only under it.

**Fix:** derive the provider branch from `row.barber_id === profile.id` rather
than from the role, matching `requireAssignedProvider`.

#### B-3. `assertBookableSlot` hardcodes Asia/Manila against a per-shop timezone

[bookings.ts:196](../../apps/api/src/routes/bookings.ts) calls
`manilaDateTimeParts(startsAt)` unconditionally, then derives weekday, local
date, and the 15-minute grid offset from it. The database evaluates the same
rules in `shops.timezone`, which is a **free-text owner input**
([ShopSetupPage.tsx:477](../../apps/web/src/pages/ShopSetupPage.tsx)) validated
only for length ([schemas.ts:204](../../packages/shared/src/schemas.ts)).

For any non-Manila shop, the reschedule and reassign pre-checks compare the wrong
wall clock against `shift_patterns` and mis-compute the grid, rejecting slots the
gate would accept.

> **Verified (live + static):** every shop in this database is currently
> `Asia/Manila` (49 rows), so the bug is **latent here** and reachable through one
> owner edit. `require_reassignable_appointment_slot` and
> `require_bookable_appointment_slot` both read `shops.timezone` and evaluate
> `at time zone v_timezone`, confirming the database is timezone-correct and
> Express is the only layer that is not.

**Fix:** same as B-4 — deleting the pre-check removes the second timezone
implementation entirely.

### Medium

#### B-4. `assertBookableSlot` is a strictly weaker duplicate of the claim gate

[bookings.ts:189-226](../../apps/api/src/routes/bookings.ts) checks shift blocks,
the grid, and same-barber overlap. It does not check shop hours, closures, the
lead/advance window, qualification, chair capacity, or buffer. Since both write
paths call the real gate under lock, its only effect is to reject some valid
requests early, with a different message, in the wrong timezone.

> **Verified (live):** the deployed claim gate calls `require_bookable_shop`,
> `require_booking_window`, `require_shop_open_window`, `require_provider_gap`,
> `require_provider_qualified` and `require_chair_capacity`. The Express function
> replicates two of those six, approximately.

**Fix:** delete it. `errors.ts` already maps every `P40xx` the gate raises to a
specific client code, so error quality does not regress. This closes B-1 and B-3
at the root.

#### B-5. Reassignment to a provider-enabled owner is impossible at every layer

Distinct from B-1, and it needs a migration rather than an Express change.
Reassignment uses a **different** gate,
`private.require_reassignable_appointment_slot`, which resolves the target
provider only through `barber_employment` and raises
`22023 "The barber is not verified, active at this shop, or accepting bookings."`
for an owner. `reassignmentScope`
([bookings.ts:176-182](../../apps/api/src/routes/bookings.ts)) refuses for the
same reason. So an owner who is a bookable provider at their own shop cannot
receive a reassignment, and cannot reassign a booking to themselves.

> **Verified (live):** full `prosrc` of the deployed function read end to end. It
> contains no reference to `owner_provider_profiles`; the employment lookup is
> the only provider resolution path.

**Fix:** add the owner-provider branch to
`require_reassignable_appointment_slot` in a forward migration, then to
`reassignmentScope`.

#### B-6. Shop timezone is a free-text field

[ShopSetupPage.tsx:477](../../apps/web/src/pages/ShopSetupPage.tsx) is a bare
`<input maxLength={64}>`; the shared schema only length-checks it
([schemas.ts:204](../../packages/shared/src/schemas.ts), `:236`, `:802`). An
invalid zone surfaces as a database error at booking time rather than at save
time. D-027 already fixed the 500 this used to cause, so the remaining gap is
that nothing stops it being entered.

> **Verified (static):** input element and all three schema sites read.

**Fix:** a `<select>` over `Intl.supportedValuesOf('timeZone')`, or validate in
the schema.

---

## Authentication, Supabase and general security

This section is in materially better shape than the audit template anticipates.
Absence of findings is itself the finding, so the verification is recorded rather
than summarised.

> **Verified (live), read-only queries against the running database:**
>
> | Claim | Result |
> | --- | --- |
> | Public tables | 67 |
> | Public tables with RLS disabled | **0** |
> | Policies on `public` | 82 |
> | Policies with an unconditional `USING (true)` / `WITH CHECK (true)` | **0** |
> | `public`/`private` functions pinning `search_path` | **219 of 219** |
> | Table-wide `SELECT` to `anon` | **none** |
> | Table-wide `SELECT` to `authenticated` | `ratings` only, scoped by `ratings_select_participant` to customer, provider or shop owner |
>
> The two historical `using (true)` policies on `shops` and `barbers` are dropped
> and replaced with ownership/eligibility predicates, and reinforced with
> **column-level** grants: `public.shops` has 25 columns and `authenticated` can
> read **8** (`id, name, address, city, lat, lng, rating, rating_count`).
> `lifecycle_status`, `owner_id`, `timezone`, `booking_mode`, `chair_count`,
> `min_lead_minutes`, `max_advance_days`, `default_buffer_min`, `description`,
> `public_contact_phone`, `published_at`, `version`, and the hiring columns are
> **not readable**. A browser JWT therefore cannot even identify a draft shop
> through PostgREST, let alone read its private policy.

Also verified:

- **No service-role key is reachable from the browser.** Zero matches for
  `SERVICE_ROLE`, `service_role` or `SECRET_KEY` anywhere in `apps/web` or
  `packages/shared`. Only `VITE_API_BASE_URL` and `VITE_DATA_BACKEND` are read
  client-side; `VITE_STORAGE_ORIGIN` is read at build time by `vite.config.ts`.
- **CORS is a parsed, URL-validated allowlist**
  ([config.ts:38-47](../../apps/api/src/config.ts)), not a wildcard.
- **No raw SQL and no XSS sink.** Zero `dangerouslySetInnerHTML`, `innerHTML`,
  `eval`, or `new Function` in the entire frontend. Every RPC argument is
  zod-validated first.
- **Every route input is parsed.** One raw read exists,
  [qualifications.ts:326](../../apps/api/src/routes/qualifications.ts), and it is
  an allowlist comparison against two literals.
- **Express 5.2.1**, so async route throws reach the error handler. No crash
  path from an unhandled rejection.
- **The error handler does not leak stacks.** `details` is attached only when
  `NODE_ENV === 'development'`
  ([errors.ts:113-120](../../apps/api/src/http/errors.ts)).
- **The P2-04 ownership lesson holds.** Eight sites call
  `requireOwnedShop(dependencies, request)` with no shop id, which proves only
  "owns some shop". Every one is backstopped: the commands re-derive ownership
  from the *target row's* `shop_id` — e.g.
  `require_owner_provider_actor(p_actor_id, request_row.shop_id)` — and
  `shops_one_shop_per_owner` is a unique partial index on `owner_id`, so
  `maybeSingle()` cannot silently match the wrong shop.
- **Check-in codes** are bcrypt-hashed with an expiry and cleared on use; the
  plaintext is never stored or serialized
  ([bookings.ts:95-101](../../apps/api/src/routes/bookings.ts)).

### The new MFA slice (`3230ab6`)

Focused pass, since it is the newest code and it gates every admin surface.

**Correct:** all seven `/admin` routes are wrapped in `RequireAal2`
([App.tsx:174-180](../../apps/web/src/App.tsx)) — no route was missed. Factor
calls act with the caller's own token, never the service role, so a user can only
touch their own factors. `DELETE /auth/mfa/:factorId` requires AAL2, so a stolen
password cannot strip an administrator's second factor. Abandoned unverified
factors are cleaned up before a new enrolment. The enrolment secret is rendered
once as text and never persisted to `localStorage` or `sessionStorage`. Both
challenge forms carry `busy` guards and `disabled` states.

#### S-1. The step-up model is a real security trade-off and is not recorded as a decision

*Severity: Low — design observation, not a defect.*

`/auth/signin` returns a **full working AAL1 session** even when the identity has
a verified factor, and reports `mfa_required` only as a hint
([auth.ts:52-66](../../apps/api/src/routes/auth.ts)). The consequence: a stolen
password grants everything except `/admin` and factor removal. That is a
defensible choice, clearly reasoned in the code comment, and it is why the admin
console became reachable without holding every customer at a code prompt. But it
is the kind of trade-off that gets silently reversed later by someone who reads
`mfa_required` as enforcement.

**Fix:** record it in [DECISIONS.md](../memory/DECISIONS.md) with the threat model
it accepts.

#### S-2. A GoTrue outage silently downgrades sign-in to "no MFA available"

*Severity: Low.*

[auth.ts:57](../../apps/api/src/routes/auth.ts) —
`listFactors(...).catch(() => [])`. If the factor listing fails, `mfa_required`
is omitted and the client never offers the challenge. Because this is step-up
rather than a gate, the impact is availability, not bypass: an administrator
simply cannot reach AAL2 and every `/admin` call 403s, with nothing in the
response explaining why. Worth distinguishing "no factors" from "could not ask".

### Medium

#### S-3. `app.set('trust proxy')` is unset

[app.ts:37-39](../../apps/api/src/app.ts) documents the fix in a comment but does
not apply it. Behind any reverse proxy, every request presents the proxy's IP, so
the 120/min general limiter and the 20-per-15-minutes credential limiter collapse
into one shared bucket. That breaks legitimate users and defeats brute-force
protection at the same time.

> **Verified (static):** `set('trust proxy'` appears nowhere in `apps/api/src`
> except that comment.

### Low

#### S-4. Generated Postgres messages reach clients for four error classes

[errors.ts:64](../../apps/api/src/http/errors.ts) forwards `error.message` for
`23503`, `23514`, `22P02` and `22023`. The deliberate `raise exception` messages
are intentional and good product copy; the *generated* ones expose constraint and
column names, e.g. `violates check constraint "appointments_notes_length"`.
Minor internal-detail disclosure.

---

## Frontend

### Medium

#### F-1. The reschedule slot buttons cannot guard against a double submit

[AppointmentsPage.tsx:279](../../apps/web/src/pages/AppointmentsPage.tsx). Every
sibling action button in this page carries `disabled={Boolean(workingAction)}`.
The slot buttons do not — and **structurally cannot**, because
`CustomerRescheduleForm` receives only `{ appointment, onAction }`
([:256-259](../../apps/web/src/pages/AppointmentsPage.tsx)) and never gets the
busy flag. The single `disabled` on that line belongs to the "Find available
times" form button.

Two fast clicks send two `PATCH` calls carrying the same `expected_version`. The
first succeeds; the second returns `409 stale_appointment`; the user sees *"The
booking action failed. Refresh and try again."* immediately after a reschedule
that actually worked. Optimistic versioning prevents corruption, so this is a
trust problem rather than a data problem.

> **Verified (static):** props destructuring and the button element both read on
> the committed file.

**Fix:** pass the busy flag into `CustomerRescheduleForm` and disable the slots
while an action is in flight.

### Verified clean

- **Every timer and listener is cleaned up.** All 15 `addEventListener` /
  `setInterval` sites checked; add and remove counts match in all nine files that
  register anything. `useLiveLocation` correctly `clearWatch`es behind an
  `active` guard. No memory leak found.
- No Supabase realtime subscriptions exist to leak — the app refetches, and
  `chat.subscribe` is a polling wrapper.
- Loading, error and empty states are present on every path read, including the
  deliberately explained "this visit does not unlock a review" case
  ([AppointmentsPage.tsx:244-249](../../apps/web/src/pages/AppointmentsPage.tsx)).

### Low

#### F-2. `cancel()` falls back to a guessed version

[AppointmentsPage.tsx:113](../../apps/web/src/pages/AppointmentsPage.tsx) uses
`appts?.find(...)?.version ?? 1` when `selected.version` is already in scope and
authoritative.

---

## Deploy and config

### High

#### C-1. `public/_headers` will break production on first deploy

[apps/web/public/_headers](../../apps/web/public/_headers) ships
`connect-src 'self'`. `vite.config.ts` derives dev and preview policies from
`VITE_API_BASE_URL`, so both work locally and this static file never fails
beforehand. Deployed to a host where the API and Supabase are on other origins,
**every API call and every signed shop photo is CSP-blocked** with no prior
warning. The file documents this itself, at length, which means it is a known
unexploded item rather than an oversight — it just has to actually be edited.

> **Verified (static):** `connect-src 'self'` present; `vite.config.ts` confirmed
> to build both policies by directive merge from env.

### Low

#### C-2. `apps/api`'s `build` script does not build

[apps/api/package.json:12](../../apps/api/package.json) — `"build": "tsc
--noEmit"`, a typecheck. Production runs `tsx src/server.ts` against TypeScript
directly. Defensible, but "build" that emits nothing will mislead the next person
setting up deployment.

### Not applicable

No `docker-compose.yml` exists, so the audit template's env-var drift,
`localhost` leakage and health-check-ordering items have nothing to check. The
Supabase CLI owns container health.

One local-environment observation, not a product defect: of eleven running
containers, ten were healthy and `supabase_vector_philabantay` was in a restart
loop (`Restarting (0)`) throughout the audit, while `imgproxy`, `edge_runtime`
and `pooler` were stopped. `vector` is the log collector — nothing the app reads
at runtime — and Postgres, Auth, REST, Storage and Kong were all healthy, so no
finding here depends on it. Worth a look only because a flapping container is
easy to stop noticing.

---

## Dead code and cleanup

**There are zero `TODO`, `FIXME` or `HACK` comments in the entire source tree.**
The single regex hit is `PB-XXXXXXXX` inside a doc comment. For a repo this size
that is worth stating rather than passing over.

### Medium

#### D-1. Roughly 1,000 lines of orphaned landing-page code

`Storefront.tsx` (558 lines) is imported by nothing. `WalkFigure.tsx` (444 lines)
is imported **only** by Storefront, so it is dead by transitivity, along with
`Storefront.css`.

> **Verified by production build, with a positive control.** A first attempt at
> this check was **vacuous** — the probe strings did not exist in the source, so
> their absence from `dist/` proved nothing. Redone with real tokens:
> `city-clock-tower` (5 occurrences in `Storefront.tsx`) and `city-depth` (2)
> appear in **0** files under `dist/`, while the control tokens
> `appointments-mini-list` and `booking-notebook`, from a live page, appear in 3
> files each. No `Storefront` or `WalkFigure` chunk is emitted.

Two stale documents follow from it:

- [FEATURES.md:73](../mdfiles/FEATURES.md) still lists both as live landing
  components.
- [CODE_AUDIT.md:303-306](../security/CODE_AUDIT.md) carries an open performance
  finding about Storefront's infinite animations, which no longer run at all.

#### D-2. `.gitignore` does not cover `*.local.ts`

`.gitignore:4` has `*.local`, which does not match `*.local.ts`.

> **Verified, and partly resolved during the audit.** An untracked
> `apps/api/p409-admin.local.ts` existed at 18:54 — a service-role script that
> minted an email-confirmed auth user — and `git check-ignore` confirmed it was
> **not** ignored, so `git add .` would have committed it. It also failed
> `npm run lint` on an unused `createHmac` import, which is what turned the
> repository's lint gate red. The other agent deleted it by 19:36 and lint is
> green again. **The `.gitignore` gap that let it sit there is unchanged.**

### Low and nitpick

#### D-3. `SHOP_TIMEZONE` is dead and actively misleading

[constants.ts:4](../../packages/shared/src/constants.ts) exports `'Asia/Manila'`
and **nothing imports it**. It is a survivor of the single-timezone era and
contradicts the per-shop `timezone` column — a trap for whoever next needs a
default. Related to B-3.

> **Verified (static):** zero importers across `apps` and `packages`.

#### D-4. Four "format a date as YYYY-MM-DD" helpers, three timezone semantics

| Helper | Semantics |
| --- | --- |
| [lib/date.ts:4](../../apps/web/src/lib/date.ts) `localDateKey` | device-local |
| [CustomerDashboard.tsx:90](../../apps/web/src/components/CustomerDashboard.tsx) `todayDateKey` | Manila-fixed |
| [AppointmentsPage.tsx:282](../../apps/web/src/pages/AppointmentsPage.tsx) `shopDateKey` | shop timezone |
| [attendance.ts:34](../../packages/shared/src/attendance.ts) `dateKey` | caller-supplied |

Given B-3, this is the same class of bug waiting to recur.

#### D-5. N+1 in the qualifications router

[qualifications.ts:292](../../apps/api/src/routes/qualifications.ts) calls
`qualificationRequest` per row, each issuing one or two queries
([:51-64](../../apps/api/src/routes/qualifications.ts)). Parallel and bounded by
pending-request count, so the impact is small — but every other router batches
with `.in(...)`, which makes this the outlier rather than the pattern.

#### D-6. Three names for one concept

`barber_id`, `provider_user_id` and `provider_id` all mean "the person performing
the visit"; `customer_id` and `customer_user_id` both mean the customer. The seam
is load-bearing at
[AppointmentsPage.tsx:279](../../apps/web/src/pages/AppointmentsPage.tsx), where a
slot's `provider_user_id` is hand-mapped into a booking's `barber_id` — the same
line as B-1 and F-1.

---

## Regressions

Nothing in the working tree diverged from `HEAD` at the close of the audit, so
there is no silent regression to find in booking, payments or auth.

One structural risk applies directly to the newest code: **`apps/web` has no
component test harness.** Three test files exist
([access](../../apps/web/test/access.test.ts),
[appointmentStatus](../../apps/web/test/appointmentStatus.test.ts),
[philippineHeroTime](../../apps/web/test/philippineHeroTime.test.ts)) and all
three cover pure helpers. There is no `@testing-library/react` and no jsdom. The
MFA enrolment card and the AAL2 gate therefore shipped in `3230ab6` with **zero
automated frontend coverage**, and they are what stands between a password
session and every staff console surface.

This was already carried as an open item in
[CURRENT-STATE](../memory/CURRENT-STATE.md); the MFA slice raises its priority.

---

## Withdrawn during verification

Recorded so they are not re-filed.

1. **"`packages/shared` does not compile."** True at 18:47 — `VerifyMfaInput` was
   used at `services.ts:245` and never imported. This was a mid-edit state of the
   MFA slice. All three workspaces typechecked clean at 19:00. **Not a defect.**

2. **"The reassign gate is missing shop-hours, chair-capacity and
   booking-window checks."** The omission is real but **correct**. Reassignment
   changes `barber_id` only and passes the existing `starts_at` through, so the
   booking already occupies its chair and already passed the hours and window
   checks. Re-checking shop-scoped peak concurrency for a same-time provider swap
   would reject valid reassignments. Established by reading the full deployed
   `prosrc`. **Withdrawn — the design is right.**

3. **"Any signed-in user can read draft shops through PostgREST."** The policy
   predicate alone would not have stopped it, which is what prompted the concern.
   Column-level grants do: `lifecycle_status` is not among the 8 of 25 `shops`
   columns readable by `authenticated`, so a browser JWT cannot even identify a
   draft shop. **Withdrawn — properly defended.**

A fourth near-miss is worth recording as a non-finding: eight
`requireOwnedShop(dependencies, request)` calls without a shop id looked like the
P2-04 cross-tenant bypass class. Chased all eight; every one is backstopped by a
command that re-derives ownership from the target row. **The P2-04 fix generalised
correctly.**

---

## Prioritised action list

Ordered by user impact, not by severity label.

| # | Action | Findings |
| --- | --- | --- |
| 1 | Fix the owner-provider blind spot in `bookings.ts` — `bookingScope`, `allowedAppointmentActions` | B-1, B-2 |
| 2 | Edit `public/_headers` before the first deploy | C-1 |
| 3 | Delete `assertBookableSlot` and let the authoritative gate answer | B-3, B-4 |
| 4 | Pass the busy flag into `CustomerRescheduleForm` and disable slots in flight | F-1 |
| 5 | Add `*.local.ts` to `.gitignore` | D-2 |
| 6 | Delete `Storefront.tsx`, `WalkFigure.tsx`, `Storefront.css`; correct `FEATURES.md`; close the moot `CODE_AUDIT.md` finding | D-1 |
| 7 | `app.set('trust proxy', 1)` before anything sits behind a proxy | S-3 |
| 8 | Add the owner-provider branch to `require_reassignable_appointment_slot` (forward migration) plus `reassignmentScope` | B-5 |
| 9 | Stand up the web test harness — it now guards the admin console | Regressions |
| 10 | Timezone `<select>`; consolidate the four date helpers; delete `SHOP_TIMEZONE` | B-6, D-3, D-4 |

Items 1 to 4 are the ones that affect users today. Items 1, 3 and 8 share one
root cause — the owner-provider seam from Q20/D-028 was completed in the database
and in authorization, but not in the Express pre-checks or the UI affordances —
and are best done as one packet.

Two items are decisions rather than code: record the step-up trade-off (S-1) and
decide whether the web test harness goes before or after the remaining Phase 3
and Phase 4 browser rows.
