# Phase 1 tests - foundation and identity

Covers packets P1-01 through P1-07. Everything here is passing as of 2026-07-24.
Test names below are quoted verbatim from the source so you can grep for them.

- Unit files run on every `npm test` (no Docker).
- The two integration files (`*.integration.test.ts`) are gated behind
  `RUN_LOCAL_SUPABASE_TESTS=1` and need a running local Supabase.

Jump to: [P1-01](#p1-01) · [P1-02](#p1-02) · [P1-03](#p1-03) · [P1-04](#p1-04) ·
[P1-05](#p1-05) · [P1-06](#p1-06) · [P1-07](#p1-07) · [Findings](#findings)

---

## P1-01 - baseline and vocabulary {#p1-01}

Canonical appointment states across the codebase; legacy names live only in the
read-normalizer.

### `packages/shared/test/appointment-lifecycle.test.ts` ✅ (5)

| Test | What it protects |
| --- | --- |
| defines the canonical states that still reserve provider capacity | The capacity-holding set is exactly the canonical states, so availability math cannot leak a freed slot. |
| normalizes only the temporary legacy statuses | The legacy read-normalizer maps old names and touches nothing else. |
| allows the happy path and rejects shortcuts | The state machine permits the legal transition chain and refuses skips. |
| opens customer check-in 30 minutes before start through the scheduled end | Check-in window boundaries are enforced by clock, not by trust. |
| allows customer no-show only after the grace period | No-show cannot be declared early. |

### `apps/api/test/appointment-status-routes.test.ts` ✅ (2)

| Test | What it protects |
| --- | --- |
| filters availability with every capacity-blocking lifecycle state | Every state that holds a chair is excluded from open availability. |
| reports canonical customer no-shows without attributing them as barber no-shows | A customer no-show is never miscounted against the barber. |

---

## P1-02 - professional access lock {#p1-02}

Pending / rejected / suspended barber **and** shop_owner accounts are locked to
verification status, help, and sign-out. The predicate is shared and fail-closed.

### `packages/shared/test/accounts.test.ts` ✅ (parameterized)

The source predicate `isProfessionalVerificationLocked`.

| Test group | What it protects |
| --- | --- |
| locks a `%s` request in the `%s` state (10 cases: barber and shop_owner across unverified / pending / rejected / suspended / not_required) | Both professional roles are locked in every non-verified state (fail-closed). |
| allows a `%s` request in the `%s` state (verified barber, verified owner, customer, and no requested role) | Verified professionals and plain customers are never locked. |
| keeps the owner-only compatibility helper narrow | `isOwnerVerificationLocked` still answers owner-only, so old callers keep their meaning. |

### `apps/web/test/access.test.ts` ✅ (19)

Frontend guards in `apps/web/src/lib/access.ts`, which now alias the shared
predicate.

| Test | What it protects |
| --- | --- |
| never locks a customer request | Customers reach the app. |
| never locks an account with no requested role | Un-onboarded accounts are not trapped. |
| unlocks a verified `${role}` (barber, shop_owner) | Verified professionals pass. |
| locks a `${role}` whose status is `${status}` (fail-closed) | Every pending/rejected/suspended professional is locked (parameterized across roles and statuses). |
| locks both requested professional roles, not owners only (LR-003) | The historical owner-only gap is closed: barbers are locked too. |
| `professionalRoleOf` returns the requested professional role | Role resolution is correct for gating. |
| `professionalRoleOf` returns null for customers and un-onboarded accounts | Non-professionals resolve to null. |
| `lockedVerificationStatus` passes through the recognised locked states | Status copy is accurate. |
| `lockedVerificationStatus` falls back to unverified so copy is never blank | The status panel never renders empty. |

### `packages/shared/test/verification.test.ts` ✅ (schemas + helpers)

| Test | What it protects |
| --- | --- |
| rejects unknown keys at the top level and inside nested form objects | Strict schemas refuse smuggled fields. |
| rejects requested-role/form-role mismatches while permitting an incomplete strict draft | A barber cannot submit an owner form; partial drafts still save. |
| accepts only fixed needs-information field names and strict item bodies | The reviewer "needs info" vocabulary is closed. |
| models the owner proof as one-of instead of requiring both documents | Owners prove ownership with either accepted document, not both. |
| distinguishes content-valid submission readiness from clean-scan approval readiness | "Ready to submit" and "ready to approve after scan" are separate gates. |
| maps internal and unknown risk signals to an applicant-safe reason | Applicants never see internal risk internals. |
| returns state-, cooldown-, document-, and phone-safe applicant actions | The action list respects cooldowns and never leaks. |
| requires an exact active capability scope and AAL2 assignment for admin actions | Admin authority needs the exact scope and step-up auth. |
| projects only applicant-safe submission, document, and timeline fields | Applicant projections drop evidence paths, hashes, and reviewer notes. |

### `packages/shared/test/verification-api.test.ts` ✅ (1)

| Test | What it protects |
| --- | --- |
| uses the frozen applicant and administrator methods and paths | The ApiBackend verification client calls the exact agreed HTTP contract. |

### `apps/api/test/verification-http-boundary.test.ts` ✅ (5)

| Test | What it protects |
| --- | --- |
| lets a locked professional load their verification workspace but blocks operational routes | The lock is enforced at the HTTP edge, not only in the UI. |
| rejects an AAL1 administrator before any capability or queue query | Admins without step-up auth are stopped before any read. |
| rejects an AAL2 administrator without queue capability before reading submissions | Even stepped-up admins need the exact capability. |
| returns applicant-safe projections without evidence paths, hashes, or private review fields | The wire response is scrubbed. |
| records the evidence-view audit event before creating a signed URL | Evidence access is audited before the URL exists. |

### `apps/api/test/verification-local.integration.test.ts` ⏭️ (3, gated)

Real Postgres RLS for verification.

| Test | What it protects |
| --- | --- |
| creates a role-discriminated draft and replays only an identical command | Draft creation is idempotent on identical replays. |
| denies raw verification/profile authority and service RPCs to browser JWTs | A browser JWT cannot touch verification tables or service RPCs directly. |
| submits content-valid evidence, blocks unscanned approval, then approves and audits | The scan gate holds; approval writes an audit trail. |

---

## P1-03 - employment-aware revocation {#p1-03}

Covered inside the local Supabase matrix
(`apps/api/test/local-supabase.integration.test.ts`, ⏭️ gated).

| Test | What it protects |
| --- | --- |
| runs current-staff writes through atomic employment-aware commands | Staff writes go through one command that re-checks employment. |
| serializes a staff capability command against concurrent employment termination | A capability change and a termination cannot interleave to leave stale access. |
| rechecks suspended professional identity inside staff and join commands | Suspension is re-verified at command time, not just at login. |
| refuses to end employment until every assigned active appointment is resolved | You cannot strand a live appointment by firing its provider. |
| revokes a former barber from shop operations while retaining history for the owner | Access ends; history survives for the owner. |

---

## P1-04 - direct-write closure {#p1-04}

Transactional booking commands, append-only events, no authenticated bypass.

### `apps/api/test/app.test.ts` ✅ (relevant cases)

| Test | What it protects |
| --- | --- |
| creates bookings only through the transactional database command | The API never inserts an appointment row directly. |
| lets an owner accept only a reservation from their own shop | Cross-shop acceptance is refused. |
| rejects a pending professional account before the booking command runs | The lock is checked before the command executes. |

### `apps/api/test/local-supabase.integration.test.ts` ⏭️ (gated)

| Test | What it protects |
| --- | --- |
| denies direct JWT writes that would bypass staff and chat commands | Direct-table writes are blocked at RLS. |
| allows only the appointment command to create rows and keeps events append-only | Only the command path inserts; the event log cannot be edited. |
| enforces the owner-to-barber-to-customer lifecycle and records its timeline | The full booking lifecycle is transactional and audited. |
| expires stale requests and finalizes unconfirmed finished cuts automatically | Background transitions are correct and idempotent. |

### `packages/shared/test/ApiBackend.test.ts` ✅ (7, client seam)

| Test | What it protects |
| --- | --- |
| persists a sign-in session, emits the profile, and authenticates later calls | Session handling is correct end to end. |
| refreshes an expired access token once and retries the protected request | One clean refresh-and-retry, no infinite loop. |
| maps the central API error shape to DataError | Server error codes reach the UI as typed errors. |
| delivers a sent message through the active subscription and cleans up polling | Chat delivery works and does not leak timers. |
| (plus three public-catalogue DTO cases, see P1-06) | |

---

## P1-05 - admin boundary {#p1-05}

Admin is never in public onboarding; actions need MFA/AAL2 and an exact
capability, with audited evidence access. Enforced by the verification HTTP
boundary tests (P1-02 list above) and the admin-scope helper test in
`verification.test.ts` (`requires an exact active capability scope and AAL2
assignment for admin actions`).

### `apps/api/test/app.test.ts` ✅ (relevant cases)

| Test | What it protects |
| --- | --- |
| serves an unauthenticated health check | Liveness needs no token. |
| rejects protected routes without a bearer token | No token, no access. |
| verifies bearer tokens with Supabase Auth | Tokens are verified against Auth, not trusted. |
| rejects unknown and malformed sign-in fields before calling Auth | Input is validated before any Auth call. |
| returns the consistent error shape for invalid JSON | Malformed bodies get the standard error envelope. |
| locks pending owner operations while keeping session restore and sign-out available | The lock leaves the two escape hatches open. |

---

## P1-06 - public / private catalogue {#p1-06}

Allowlisted public projections; anonymous catalogue routes; no private field
ever crosses the wire.

### `apps/api/test/public-catalog.test.ts` ✅ (4)

| Test | What it protects |
| --- | --- |
| serves the catalogue without authentication and selects only public shop columns | Anonymous reads see public columns only. |
| fails closed when a database response contains a non-public shop field | An unexpected private field aborts the response instead of leaking. |
| does not retain the old authenticated catalogue GET backdoor | The legacy authenticated route is gone. |
| rate-limits expensive anonymous slot computation at 60 requests per minute | Anonymous slot math is throttled. |

### `packages/shared/test/ApiBackend.test.ts` ✅ (public DTO cases)

| Test | What it protects |
| --- | --- |
| loads strict public catalogue DTOs without a session or Authorization header | The client reads the catalogue anonymously. |
| rejects private fields smuggled into a public catalogue response | Client-side DTO guard fails closed on unexpected fields. |
| rejects the internal active flag from a public service response | The internal `active` flag never reaches the client. |

---

## P1-07 - adversarial gate {#p1-07}

The full local Supabase matrix
(`apps/api/test/local-supabase.integration.test.ts`, ⏭️ gated). Roles exercised:
anonymous, customer, barber, owner, second owner, second barber, plus direct-JWT
and race probes.

| Test | What it protects |
| --- | --- |
| keeps anon off base catalogue tables and limits authenticated SELECTs to public columns | Anonymous and authenticated reads both stay inside the public projection. |
| exposes only eligible shops and excludes future-dated employment from public discovery | Discovery hides ineligible shops and not-yet-active staff. |
| returns only the public shop summary after joining by code | Join-by-code returns the public summary, nothing internal. |
| customer RLS and Express routes expose only the customer booking/messages | A customer sees only their own rows. |
| barber RLS is limited to assigned appointments, own shop shifts, and conversations | A barber sees only their assignments and shop. |
| owner RLS and Express routes include the owned shop and exclude another shop | An owner sees their shop and not a neighbour's. |
| enforces the V1 one-shop owner and one-active-employment limits atomically | The one-shop / one-active-job limits hold under concurrency. |
| the second owner and barber cannot see the primary shop operational rows | Cross-tenant isolation on operational tables. |
| allows an owner to reassign a future reservation to available staff at the same shop | Legit reassignment works within a shop. |
| reassigns against the immutable booking snapshot after a service changes or retires | Reassignment uses the frozen booking snapshot. |
| serializes lifecycle transitions with rescheduling instead of deadlocking | Concurrent transitions serialize cleanly. |
| enforces slot rules in Postgres and refreshes service snapshots in both directions | Slot rules live in the database, not just the app. |
| serializes concurrent provider and customer claims to one winner | A double claim resolves to exactly one winner. |
| locks pending, rejected, and suspended professionals in both RLS and Express | The professional lock is enforced at both layers (ties back to P1-02). |

---

## Findings {#findings}

Real observations from writing and running the Phase 1 suite. Tracked centrally
in [../plans/ROADMAP-STATUS.md](../plans/ROADMAP-STATUS.md).

1. **Integration fixtures do not clean up (test hygiene).** `beforeAll` creates
   shops but there is no `afterAll` delete, and some catalogue checks assert the
   exact set of public shops. The matrix therefore needs a clean
   `supabase db reset` before each run. Confirmed as an isolation artifact, not a
   product defect. Options for later: add `afterAll` cleanup or relax the
   exact-set assertions to superset checks.
2. **Catalogue helper still named for the legacy floor.** The database helper is
   still `is_legacy_catalogue_eligible_shop`, now redefined to require
   `lifecycle_status = 'published'`. Behaviour is correct; the name is stale and
   should be renamed in a later packet.
3. **Raw service-role appointment update is hardening debt (P1-04).** Not an
   authenticated bypass (the service role is the Express guard), but it is a
   direct write path worth folding into a command in a later pass.
4. **Two closeout items are not automated.** The session-restore no-flash browser
   smoke (LR-033) and an independent adversarial re-scan by fresh eyes are still
   manual. The code author also wrote the tests, so a second set of eyes raises
   confidence before Phase 1 is formally locked.
5. **Verification content-scan gate is proven by integration only.** The
   "blocks unscanned approval" guarantee is exercised against real Postgres, so
   it needs Docker to verify; the unit layer proves the schema shape, not the
   scan ordering.
