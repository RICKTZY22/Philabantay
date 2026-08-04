---
tags:
  - philabantay
  - current-state
updated: 2026-08-05
---

# Current state

Authoritative detail: [Roadmap status](../plans/ROADMAP-STATUS.md).

## Active phase

**Phase 3 — booking and live operations: implementation/automated gate complete,
browser acceptance partially executed.** P3-01 through P3-09 are implemented.
The 2026-08-05 browser run covered responsive owner/barber/customer surfaces,
manual booking/acceptance, consent proposals, reschedule/cancel, delay, stale
state, reduced motion, and cleanup, but did not cover the checklist's remaining
time-bound and operational journeys. Phase 3 is still not formally closed.
P2-08 also remains open because native date/time mutations and exhaustive
keyboard traversal were skipped rather than passed.

- P2-01 Shop lifecycle: verified complete.
- P2-02 Shop facts: verified complete.
- P2-03 Hiring state: verified complete.
- P2-04 Employment convergence: verified complete.
- P2-05 Provider capabilities: verified complete.
- P2-06 Schedule authority: **verified complete, signed off 2026-07-30**; its
  carried visible-workflow and real reduced-motion follow-up was closed by the
  measured 2026-08-05 browser continuation.
- P2-07 Availability engine: **verified complete 2026-07-30**, all ten required
  inputs. Q20 was answered the same day (D-028).
- P2-08 Race gate + frontend smoke: **browser acceptance partial, still open.** Backend
  matrix 85/85 twice on the recorded clean replay; frontend fixes and the
  deterministic code gate are green. The resumed browser run fixed Owner
  Barbers heading semantics and 320 px Barber Schedule overflow, but native
  date/time mutation and exhaustive keyboard traversal remain unobserved.
- P3-01 through P3-08: **implementation/automated verification complete.** The
  final tree passed an empty replay through 58 migrations, zero-finding DB lint,
  131 fast tests, matrix 91/91 twice, typecheck/lint/build/diff.
- P3-09 Phase 3 journey gate: **browser acceptance partial.** The completed and
  skipped rows are recorded in the consolidated checklist; the packet remains
  open until the remaining rows pass.

## Active packet

### P3-09 Phase 3 journey gate — partial browser record, acceptance pending

All planned Phase 3 contracts, migrations, API routes, role UI, and automated
regressions are implemented. The authoritative evidence and packet-by-packet
scope are in the [Phase 3 handoff](../plans/P3-09-PHASE-3-JOURNEY-HANDOFF.md).
The 2026-08-05 partial run and exact remaining work are in the
[browser checklist](../testing/P3-09-MANUAL-BROWSER-CHECKLIST.md#execution-record--2026-08-05-partial-phase-3-remains-open).
Do not mark P3-09 or Phase 3 formally complete until the skipped rows pass.

The run found and fixed two real frontend defects: Owner Barbers had no heading,
and the Barber Schedule calendar forced horizontal overflow at 320 px. The
cross-role booking path passed through request, owner acceptance, audited barber
assignment, proposal reject/accept, delay visibility, live reschedule, and
cancellation. Cleanup left the shop draft and all roles signed out. Customer
check-in correctly refused outside its time window; no timestamps were altered.

### P3-02 Change and disruption — implementation gate green

The old owner command silently reassigned exact choices. A focused regression
was falsified first (expected 409, received 200), then passed after migration
`20260802000200`. The completed versioned proposal/customer-response path locks
and rechecks availability on acceptance and preserves the original on rejection
or conflict. Disruption capture creates attention and alternatives without
silently mutating the booking. See the
[P3-02 handoff](../plans/P3-02-CHANGE-DISRUPTION-HANDOFF.md).

### P3-01 Request/accept/assign — automated gate green, browser pending

P3-01 starts from the verified P2-07 availability engine rather than rebuilding
it. The packet owns manual approval by default, optional instant mode, 15-minute
request expiry, exact/preferred/any provider intent, deterministic assignment and
audit, and owner accept/decline/assign actions.

The implementation and evidence are in the
[P3-01 handoff](../plans/P3-01-REQUEST-ACCEPT-ASSIGN-HANDOFF.md). Existing
behavior that was already transactional remains the authority. The customer
workspace, idempotent manual/instant create, quote policy, restricted fallback,
and owner decision/assignment controls are implemented. Clean replay and DB lint
passed; the final Phase 3 matrix is 91/91 twice; 131 fast tests;
typecheck/lint/build/diff green.
The 2026-08-05 browser continuation passed one real manual booking through
customer request, owner acceptance, and assigned-barber visibility, then
cancelled it during cleanup. Duplicate retry, exact/preferred intent, and
instant-mode browser rows remain open in the consolidated checklist.

### Deferred P2-08 closeout — owner browser acceptance still open

The backend half remained untouched: its four widened race classes were already
proven and matrix 85/85 was green twice. Before the product owner clarified that
they would own the browser test, the agent ran a preliminary pass against the
real local API/browser stack at 1280×800, 390×844, 375×812, and 320×800.

- Owner: details/hours/service saves, publish/unpublish, provider capability and
  qualifications, zero-provider readiness refusal, Staff, Hiring stale-tab
  recovery, and Reservations.
- Barber: read-only schedule with zero time inputs, structured Time off request,
  own bookings, and attendance; the owner declined the smoke request afterward.
- Customer: discovery, honest current detail, own bookings calendar, and real
  shop chat. The missing slot picker remains open item 6 and was not built.
- Every measured surface: zero horizontal overflow, clipped controls,
  unreachable controls, and unlabelled controls. Clean role journeys had zero
  console errors.
- Keyboard: focus wrapped within the owner menu, Escape dismissed and restored
  the burger, and physical Chrome Enter activation navigated the focused native
  Log in link.
- Preliminary real `prefers-reduced-motion: reduce` media emulation matched and produced no
  animation/transition duration above 1 ms on representative owner, barber, and
  customer surfaces. The measured 2026-08-05 continuation repeated real media
  emulation and the visible Staff/Schedule review, closing both carried items.
- Preliminary LR-033: at all four viewports, a restored owner deep link showed only the
  neutral session shell before resolving to Owner Staff; a stale session fell
  back to login without flashing another workspace.

Frontend fixes label the Leaflet pin, preserve the hiring conflict alert and
normalized note, and repair the owner filters/staff note, chat replies, and
appointment calendar at narrow widths. Full gate passed: typecheck, ESLint,
129 fast tests, production build, and `git diff --check`. The matrix was
intentionally not rerun because no API or Supabase file changed. Fixture state
is restored: shop draft, hiring Off with no note/count, owner provider Off,
Bruno qualified for both active services, no pending shift request, and no
closure or booking created.

**Remaining action:** finish exhaustive keyboard traversal plus native
hours/closure mutations. Until then P2-08 and Phase 2 remain open.

### P2-07 availability engine — verified complete

Two real bypasses were found by measuring the existing gate rather than trusting
the packet description, and both were reproduced through the real HTTP API before
any code was written. Each returned `201 Created`:

1. a customer booked a barber at a shop in `draft`, while the public catalogue
   correctly refused to list that same shop;
2. a customer booked a date the owner had marked as a full-day closure.

`private.require_bookable_appointment_slot` was the authoritative claim gate and
contained zero references to `lifecycle_status`, `shop_operating_hours`,
`shop_closures`, `service_qualifications`, `owner_provider_profiles`,
`chair_count`, `default_buffer_min`, or `booking_mode`.

Ten forward migrations, `20260730000100` through `20260730001000`:

- the booking window (`min_lead_minutes`, nullable `max_advance_days`),
  per-service `buffer_min`, BOOK-02 assignment intent, and a qualification
  backfill so switching the requirement on could not make an existing provider
  unbookable;
- the rebuilt gate: publication, the shop's own timezone instead of a hardcoded
  Manila, lead and advance bounds, opening hours, closures and replacement
  hours, qualification, a buffer-aware provider gap, and chair capacity as peak
  concurrency under a new shop-scoped advisory lock;
- grant-on-hire, so a new barber is not silently unbookable, while a service
  added later is deliberately granted to nobody (D-024);
- the slot projection and exact/preferred/any assignment, both answering by
  calling the same gate rather than reimplementing it (D-022);
- the read-only quote behind `POST /bookings/quote`.

Express gained `GET /availability`, `POST /bookings/quote`, six new error codes,
and the booking window on the owner and public shop contracts. The old Express
slot math is deleted, so an offered slot is a claimable slot by construction.

Gate, on a database replayed from empty through all 52 migrations:

```text
typecheck   all workspaces passed
lint        passed
build       API + web production build passed
fast tests  124 (shared 56, api 28, web 40)
matrix      81/81 twice back to back, no reset between runs
DB lint     no schema errors
diff        git diff --check clean
```

Live end-to-end suites through the real API passed 14/14, 17/17, and 3/3 and
restored the dev shop to `draft`. The matrix then passed 81/81 twice again with
zero published shops left behind, so there is no fixture pollution this time.

A pre-push self-review found three defects that no test covered, all fixed in
`20260730000600`/`20260730000700` and regression-tested: automatic assignment was
never actually ordered, because a sub-select's sort does not survive a `UNION
ALL`; an unrecognised `shops.timezone` had become a 500 that made a shop entirely
unbookable, since the engine now evaluates wall-clock rules in the shop's own
zone while nothing had ever validated it beyond a length check (D-027); and quote
and claim disagreed about *why* an `any`/`preferred` slot was refused. The
assignment regression was falsified before being trusted — inverting the ordering
in the live database made it fail. Detail in the session log.

**Input 4 closed the same day.** A shop whose only provider was its owner could
publish, appear in the catalogue, and refuse every customer, because the engine
never read `owner_provider_profiles`. Q20 was answered with the shadow-row seam
(D-028): a provider-enabled owner gets a one-way-mirrored `barbers` row as the
foreign-key anchor, and the gate, the assignment order, and the projection treat
the shop's own opening hours as their roster. Three pre-existing guards were
extended rather than weakened — the appointment assignment lock, the `barbers`
capability-enablement lock, and the provider predicate — each re-deriving
ownership from `shops`. Publication now also refuses a shop with nobody bookable
(D-029). Verified live: the owner booked at `201`, the same request on a Sunday
returned `409 outside_shop_hours` for a Mon-Sat shop, and the owner accepted,
checked in, and started the visit.

### P2-07 browser smoke — 2026-07-30

Full owner and customer pass against the live local stack. Two outcomes no API
test could have produced.

**One UX defect, found and fixed.** Publishing a shop with nobody bookable
returned the correct `409` and message, but Shop Setup displayed *"Nabago ang shop
mula sa ibang session. Ni-reload namin ang pinakabagong bersyon."* — telling the
owner to reload for a problem no reload can fix. `P4020` (stale) and `P4021`
(precondition) both mapped to `409 conflict`, which every client treats as
reload-and-retry. `P4021` now maps to `precondition_failed` (D-030). No frontend
change was needed, because Shop Setup's fallback branch already renders the
server message, and the browser now shows the real sentence in a live region.
Pre-existing — closing every operating day and retiring the last active service
had the same problem — but the new publish guard made it likely to be hit.

**The customer UI has no slot picker, now measured rather than assumed.** Network
capture over a full customer session shows the app never calls `/availability`,
`/bookings/quote`, or the legacy `/catalog/availability/slots`. The shop card's
"Busy — puno ang chairs / 0 free now" comes from the barber's live `shift_status`,
which is walk-in status and unrelated to whether a future slot is bookable. The
engine is complete; the screen that surfaces it is the frontend lane's
customer-detail item.

Also observed: publish and unpublish both correct through the UI, the newly
published shop and its barber appeared in customer discovery, zero console
errors, no horizontal overflow at 375x812, and the dev shop was returned to
`draft` with the matrix passing 81/81 twice afterwards. The smoke initially
found that the readiness checklist omitted the new bookable-provider row; the
2026-08-01 frontend follow-up fixed that gap. Shop Setup now derives the row
from saved provider eligibility and active-service qualifications and disables
Publish until it passes.

### Earlier this session

### Premium Studio signed-in UI redesign — implemented and locally verified

- Customer, barber, and owner workspaces now use light warm-neutral content
  surfaces, copper actions, restrained pastel status accents, and minimal
  doodles. Charcoal is limited to the global header/drawer and transient route
  curtain so dark content blocks do not fight legacy page CSS.
- The existing avatar creator is preserved. Its saved allowlisted avatar is
  the user's profile picture in the signed-in header, drawer, settings, and
  barber/owner dashboard profile chip. The oversized duplicate customer-home
  avatar is removed.
- The signed-in header keeps the handwritten Philabantay wordmark on its paper
  label. The drawer contains the canonical navigation only; the redundant
  context-shortcut card is removed.
- The one-time `/onboarding/role` route intentionally renders without the
  global signed-in header, avatar, or hamburger so the role decision remains a
  focused standalone step. Normal signed-in routes retain the header.
- Sign-in, sign-up, sign-out, and drawer section changes share one curtain
  transaction. Route content enters with a short transform/opacity animation,
  while reduced motion bypasses the curtain and disables the route animation.
- Every sign-out surface uses the shared curtain hook to mark an explicit Home
  route intent before clearing the session. The verification lock permits only
  that one landing transition and consumes the marker after session clearing,
  so protected-route guards cannot race the user into `/login` or `/signup`
  and the exception cannot survive a later login.
- Guest auth now has one dedicated surface: `/login` and `/signup` use a
  centered light form card, warm cream space, copper actions, and soft orange
  gradient patches. These routes intentionally have no global header or intro
  copy; only Back to home sits above the card. A prominent barber-pole/Gochi
  Hand Philabantay mark leads the card without a duplicate Log in heading. The
  approved reference format uses a compact 460px desktop login card and an
  inline “New here? Create account” row below the primary action. The
  role/messages/bookings sentence, role strip, and professional-tools footnote
  are removed with their unused CSS. On tall desktop viewports the card extends
  to roughly 600px and vertically centers its contents, while a responsive
  400–500px minimum protects short desktop fit. Signup mirrors the inline
  account switch and keeps two desktop contact columns to reduce vertical
  height. The former dark split panel and duplicate landing dialog are absent.
  On desktop, both cards are centered against the full available viewport while
  Back to home remains independently pinned at the auth canvas's top-left.
  Mobile remains one column and keeps necessary natural scrolling.
- The CSS-only presentation layer preserves existing routes, contracts, async
  states, the hamburger navigation, owner schedule authority, and the barber's
  read-only shift workflow.
- Browser checks covered customer discovery/bookings/messages/settings,
  barber Today's Chair/schedule/professional profile, and owner
  overview/reservations/staff/hiring/shop setup. The signed-in surfaces hold
  zero horizontal overflow at `1440x900`, `390x844`, and `320x760`.
- `ModalPortal` initial focus and Escape focus return were observed in-browser.
  The Rive character blinked and tracked the cursor; reduced-motion emulation
  disabled its canvas and retained the static fallback.
- Full local gate: all workspaces typechecked, lint and production build
  passed, and 124 fast tests passed with 41 expected integration skips.
- Final auth release verification on 2026-07-30 reran the real local
  Supabase/API matrix **69/69 twice consecutively** without a reset between
  runs. Login failure recovery, protected-route return, successful seeded
  login, sign-out/session clearing, signup first-error focus, both password eye
  controls, exact desktop centering, zero overflow, forced light color scheme,
  and a clean browser console were observed against the live local API.
- The login identifier now accurately uses an email input because the shared
  and Express sign-in contracts accept email, not phone. The final residual
  signup role-selection note is removed; auth routes, session behavior, and
  backend contracts are otherwise unchanged.

This visual slice does not change packet counts. P2-07 remains next.

### Pre-P2-07 public landing/auth polish — verified locally

The public presentation slice requested during P2-06 is implemented without
starting P2-07:

- the hero keeps Philabantay's space/city identity with four aligned generated
  `1915x821` scenes selected by live `Asia/Manila` time: midnight
  `00:00-04:59`, morning `05:00-11:59`, afternoon `12:00-16:59`, and evening
  `17:00-23:59`. One small hand-drawn crack replaces the former dark portal;
- grounded, pre-drawn activity changes with the clock: students and a jeepney
  travel to school in the morning, customers and traffic wait outside the
  barbershop in the afternoon, workers and lit vehicles travel home in the
  evening, and midnight has empty sidewalks with only a jeepney and a car. The
  hero walker and legacy live-city layer remain disconnected, with retired art
  and the walker recipe kept only under
  `docs/design-archive/landing-hero-experiments/`;
- the hero is deliberately art-only. The copy occupies the left grid track and
  the right track is left empty so the scene's right-side barbershop stays
  visible through the transparent section. There are no device mockups in the
  hero, and the two-column grid is load-bearing for that framing: filling the
  right track would cover the barbershop;
- the bundled How it works chapter combines the booking lifecycle, customer
  flow, shop-side flow, and role capabilities in a bright sticky-index layout
  over the supplied repeating barber-tool doodle wallpaper;
- landing Log in, Sign up, Request a Demo, and contact actions link to the
  dedicated `/login` and `/signup` routes. Those pages are now the only auth
  surface and preserve the sanitized protected-route `from` handoff;
- signup validation focuses the first invalid field, password visibility is a
  labeled keyboard control, failed login reopens on the same route after the
  curtain, and form entrance animation is disabled under reduced motion.

Verified on 2026-07-29:

- the browser loaded all four WebP assets. Forced morning, afternoon, evening,
  and midnight checks at `1440x900` each exposed exactly one active layer; live
  Philippine time resolved to the midnight hero scene while the wider landing
  phase remained `night`;
- the full-width scene and right-side barbershop fit below the navigation.
  Every scene held `scrollWidth = clientWidth` at `1440x900`, `1024x768`,
  `390x844`, and `320x760`; the narrowest check also verified the landing shell
  no longer inherits the global `320px` minimum through the browser scrollbar;
- hero DOM contains zero legacy hero walkers and zero legacy live-city layers.
  Reduced-motion emulation resolved the scene transition to `0s`. **Corrected
  2026-07-30:** an earlier version of this entry claimed the hero contained one
  laptop SVG and one phone SVG. It does not, and no commit ever contained them.
  The hero holds only the copy column over the scene art. Re-measured at
  `1440x900`: hero grid `442px 636px`, one child, section background
  `rgba(0, 0, 0, 0)`, and the active scene layer spanning `1425x900` behind it;
- the workflow stays `rgb(251, 250, 246)` even while the live city is in its
  `night` phase; desktop chapter index and first panel are approximately equal
  height;
- browser console errors: 0;
- all workspaces typechecked, 124 fast tests passed with 41 skipped, lint
  passed, API/web production builds passed, and `git diff --check` was clean
  apart from non-failing line-ending warnings.

This polish does not alter packet counts or backend truth. P2-06 remains in
progress pending independent sign-off; P2-07 has not started.

### P2-06 schedule authority — implementation gate green

The owner-authority half from
[P2-06 slice 2c handoff](../plans/P2-06-SLICE-2C-CODEX-HANDOFF.md) is now
implemented locally:

- only the owning verified owner can replace a staff member's weekly pattern or
  add/remove their date exceptions through the canonical versioned routes;
- the legacy barber self-write routes and RPCs are removed;
- the barber schedule is read-only and emits structured, idempotent time-off or
  different-hours requests;
- owner approval transactionally writes the requested exception, links the
  request, advances the schedule revision, and appends an immutable event;
- `idempotency_key` is now required and pending/resolved request invariants are
  enforced by migration `20260728000600`.

Verified on 2026-07-28:

- clean reset applied every migration through `20260728000600`;
- API integration/direct-RLS matrix passed **69/69 twice consecutively**
  without another reset;
- direct authenticated writes to schedule revisions/events and direct request
  status changes were denied;
- owner routes returned 401/403 to anonymous/foreign actors, simultaneous
  versioned writes produced one 200 and one 409, and P4025 reported the exact
  active-booking conflict count;
- **116 fast tests** passed (shared 56, API 28, web 32), all workspaces
  typechecked, lint and production builds passed, DB lint reported no errors,
  and `git diff --check` passed;
- authenticated browser smoke covered weekly edits, exception add/remove,
  structured request and transactional approval, two-session stale recovery,
  exact 390×844 owner and barber layouts without horizontal overflow, native
  keyboard controls, reduced motion, and a clean console.

P2-06 remains in progress pending independent review/product sign-off. P2-07
has not started.

### Prior pre-P2-06 bounded hardening

Latest verified state:

- migrations `20260728000200` and `20260728000300` remove the legacy plaintext
  join-code table, revoke unnecessary private helper execution, enforce
  owner-invitation provenance, add truthful `superseded` requests, and cap
  retained media at 100 rows per shop;
- join codes now carry 80 bits of entropy in uppercase hexadecimal;
- media deletion is object-first and retryable, stale awaiting uploads are
  cleaned after 24 hours in bounded batches, and one bad preview no longer
  fails an owner or public shop-detail response;
- rejected/deleting/unavailable media states are explicit in Shop Setup;
- legacy appointment statuses normalize at the API boundary and every
  canonical appointment state has an explicit UI label/class;
- matrix fixtures archive published test shops before and after the run.

Verified:

- Docker and local Supabase are healthy;
- a clean reset applied every migration through `20260728000300`;
- the complete API integration/direct-RLS workspace passed 69/69 twice
  consecutively;
- SQL checks report the legacy table absent, both private helpers non-executable
  by `authenticated`, and no shop over the media cap;
- 112 fast tests pass (shared 52, API 28, web 32);
- all workspaces typecheck, lint passes, production builds pass, database lint
  has no errors, and `git diff --check` passes.

Earlier P2-05 implementation:

- explicit shop-scoped owner provider profile/capability without role switching;
- owner accepting-bookings state and separate owner-provider rating fields;
- versioned owner-authoritative service qualification sets for the owner and
  active verified barbers;
- barber qualification requests that remain pending until owner approval;
- immutable capability/qualification/request events and idempotent, stale-safe
  commands;
- owner Staff provider management and barber Professional read/request UI.

Earlier P2-05 verification:

- Docker and the local Supabase stack are healthy;
- a clean local database reset applied through
  `20260727000300_p2_05_provider_capabilities.sql`;
- the complete API integration/direct-RLS matrix passes 59/59;
- database lint reports no schema errors;
- all workspaces typecheck;
- 93 fast tests pass;
- API and web production builds pass;
- `git diff --check` passes;
- a final local-only reset removed temporary browser-smoke accounts/data while
  API port 4000 and web port 5174 remained healthy.

Final browser evidence:

- owner enabled the owner-provider capability/accepting state, granted and
  removed owner qualifications, and granted barber qualifications;
- employed barber saw read-only qualifications, requested a service, and the
  owner approved it into an active grant;
- a stale second owner session was rejected and refreshed to authoritative
  qualifications;
- exact 390×844 layout had no horizontal overflow;
- native controls were keyboard reachable, reduced-motion rules eliminated
  transitions, and a clean reload emitted no console errors.

Post-packet follow-up verified 2026-07-28:

- the anonymous public shop-detail contract now projects real weekly hours,
  future closures, active services/prices, chair capacity/default buffer, and
  only ready+approved media with short-lived URLs;
- private owner/version data, closure reasons, storage paths, moderation
  internals, and internal timestamps are excluded by allowlists and a strict
  response schema;
- a clean reset applied all migrations through P2-05 and the P2-04 security
  hotfix; the expanded API and direct-RLS matrix passed 63/63, 97 fast tests
  passed, and typecheck,
  production builds, DB lint, and diff validation passed.
- At that earlier follow-up, P2-06 had not started; honest live availability
  remains planned for P2-07.

P2-04 security correction verified 2026-07-28:

- a confirmed high-severity authorization bypass allowed a verified shop owner
  with no owned shop to accept or decline a known request ID because
  `request.shop_id <> NULL` did not evaluate to true;
- the private owner-shop resolver now raises `42501` when ownership cannot be
  established, including through forward hotfix migration `20260728000100`;
- Express now scopes the request to the caller's owned shop before invoking the
  service-role command;
- the exploit regression attacks accept and decline through HTTP and direct
  service-role RPC, verifies the request stays pending, and verifies no
  employment is created. The clean-reset matrix passes 63/63.

Remaining risks / deliberately excluded work:

- the P2-04 cross-tenant request-resolution exploit is fixed in source and the
  local database, but any remote environment remains exposed until the hotfix
  migration and API are deployed there;
- the authorized hardening findings are repaired locally, and issue 10 is now
  explicitly resolved: usage means successful request creation, is
  non-refundable after decline/withdraw/expiry/supersession, and idempotent
  replay remains free;
- the public detail API now carries most planned real facts, but the customer UI
  does not consume it yet and no authoritative structured shop-specialty field
  exists;
- remote environments remain vulnerable/stale until the P2-04 hotfix, hardening
  migrations, and API are deployed under separate authorization;
- no new browser smoke was required for this backend-heavy hardening packet;
  the existing P2-02 through P2-05 authenticated smoke evidence remains intact.

## Exact next action

**Finish the explicit skips in the consolidated P3-09 browser checklist.** The
change-proposal/customer-response path and responsive role sweep passed on
2026-08-05. Remaining work is exhaustive keyboard traversal, native Shop Setup
hours/closure mutation, duplicate/exact/preferred/instant booking, and the
time-bound/walk-in/payment/notification/closeout journeys. Record failures, fix
them, and retest affected routes. P2-08 and Phase 2 remain open for their two
skipped checks; P3-09 and Phase 3 remain open for the remaining journey rows.

Two follow-ups from the P2-08 work, neither blocking:

- At the claim/expiry boundary a customer can be told a slot is taken and find it
  free a moment later, because their claim lost to a hold the sweeper then
  retired. Correct and transient, and the regression pins that a retry succeeds.
  Worth a UI affordance in Phase 3 (retry rather than a dead end) rather than a
  backend change.
- A falsification run left a stale hold behind and broke two unrelated tests,
  which is a reminder that this suite shares fixtures. Reset the database after
  any deliberate sabotage run.

One frontend item is still open and changes no backend behaviour: **the customer
detail screen does not consume `/availability` or `/bookings/quote`.** That is a
feature, not polish. A customer currently reads "Busy — puno ang chairs" from the
barber's live shift status, which says nothing about whether tomorrow at 14:00 is
free. The Shop Setup readiness row and the owner-provider copy that used to sit
here were both delivered on 2026-08-01.

Carried out of the 2026-08-01 full-repo sweep, none of them blocking P2-08:

- **The web app has no automated tests.** 62 files, 11,743 lines, three test
  files that only cover pure helpers, no `@testing-library/react`, no jsdom.
  Adding the harness is a packet of its own; decide whether it goes before or
  after P2-08.
- ~~`npm run lint` is not a linter.~~ **Fixed 2026-08-01.** ESLint 9 flat config
  at the repo root covers every workspace, `npm run lint` is
  `eslint . --max-warnings 0`, and the misleading `lint` script on `apps/api`
  is gone. Eleven findings across the repo, all resolved.
- **Three pre-existing high-severity advisories** in `npm audit`, none from the
  ESLint install: `postcss` (path traversal via source-map auto-loading) and
  `react-router` / `react-router-dom` (RSC-mode CSRF bypass). We do not use RSC
  mode, so the router one looks inert here, but both want a version bump. Not
  touched, because a router upgrade is its own change with its own gate.
- **`public/_headers` will break production.** `connect-src 'self'` is a
  local-only value and the file cannot see `VITE_API_BASE_URL`. Must be edited
  before the first deploy; a comment in the file now says so.
- **`app.set('trust proxy')` is unset**, so behind a proxy every request shares
  the proxy's IP for rate limiting.
- **`ARCHITECTURE.md` needs a real rewrite.** The false statements are corrected
  and the mock sections are labelled history, but the narrative still describes a
  system that no longer exists.
- **Rive is now referenced by nothing** after the landing trim: `RiveScene`,
  `public/rive/rive.wasm` (2.0 MB), and `character-follow.riv`. Deleting them
  also makes `'wasm-unsafe-eval'` removable from both CSP definitions. Left in
  place pending your call.

### Prior P2-06 detail

P2-06's workflow scenarios 1 to 4 are **functionally verified** as of
2026-07-30 (executed on the product owner's request while they were mid
UI-redesign). Exact responses are tabled in
[QA traceability matrix](../plans/QA-TRACEABILITY-MATRIX.md).

Keyboard and reduced-motion evidence is now also recorded, at the same standard
as P2-02 through P2-05: zero unreachable and zero unlabelled interactive
controls on both surfaces, all 14 shift-editor time inputs labelled, and the two
calendar stylesheets declare no motion at all while `OwnerStaffPanel.css`
carries a blanket reduced-motion guard.

**What remains is one item: product judgment on the visible workflow.** That is
the product owner's call. Every technical gate for P2-06 is green and recorded.

`ModalPortal` focus was previously listed as a P2-06 blocker in error and has
been re-scoped to the landing/auth polish slice; no P2-06 surface imports it.

Environment updated 2026-08-02 after Windows reserved the former local port range:

- Docker and the local Supabase stack are healthy on the unreserved ports
  (API/storage `54321`, database `54322`, studio `54323`);
- the database was reset from empty and carries all 58 migrations through
  `20260802000500_p3_walk_in_payment_closeout.sql`;
- **`npm run seed:accounts` now also creates shop operating hours.** Since P2-07
  the shop's own hours are a booking input, so a shop with none is closed every
  day. Without this the seeded environment signs in fine and then refuses every
  slot, which reads as a bug rather than as missing setup. The dev shop is open
  Mon-Sat 09:00-18:00, matching the demo barber's shift;
- the API and web dev servers were started for product-owner browser acceptance
  on `4000` and `5174`. `5174` is
  not optional: `vite.config.ts` uses `strictPort` and the API's `WEB_ORIGIN`
  allowlist only trusts that port, so any other port fails CORS;
- after the final clean replay, `npm run seed:accounts -w @barbershop/api`
  recreated `owner@phila.test`, `barber@phila.test`, and
  `customer@phila.test` for browser acceptance. The owner owns
  "Philabantay · Dev Shop" (draft, 1 chair, 2 active
  services, Mon-Sat 09:00-18:00) and the barber has active employment there and is
  qualified for both services through the grant-on-hire trigger. The seeded shop
  starts in `draft` with no closures or bookings. Historically, the P2-07 live suites
  published it, exercised every rule, then cancelled their bookings, deleted their
  closures, reset the buffer and booking window, and unpublished. The earlier
  P2-06 schedule state described in previous entries was cleared by the clean
  resets. Publishing takes one owner command whenever a rule needs exercising
  again;
- **Do not leave a manually published shop behind.**
  `local-supabase.integration.test.ts:333` asserts the customer sees *exactly*
  the suite's two fixture shops
  (`toEqual([primaryShopId, secondShopId].sort())`), so any third published shop
  fails it with `expected [ …(3) ] to deeply equal [ …(2) ]`. The suite archives
  its own published fixtures for repeatability but cannot know about a shop
  published by hand. Separately worth noting as brittleness rather than a bug:
  that assertion is global rather than scoped to its own fixtures, so it is
  sensitive to any local state. It was deliberately **not** loosened to make the
  number green;
- the test-account password is now **pinned** via `SEED_PASSWORD` in the
  gitignored `apps/api/.env`, so `npm run seed:accounts -w @barbershop/api` no
  longer regenerates it. Before this, every seed run silently invalidated the
  previously printed password, which cost a debugging round when sign-in
  appeared broken but was only stale credentials. The value itself stays out of
  this vault. Re-running the seed now reports `(password from env)`;
- `main` is current at `04af147`, fast-forwarded with no merge commits.

## Known gaps carried forward

- Q4 first-publication admin review: **resolved 2026-07-30** by reversing the
  decision (D-019). V1 publication is self-service for a verified owner who
  passes the readiness checklist. `pending_review` stays in the enum and shared
  types so the gate is cheap to enable with the Phase 4 staff admin console.
  No longer blocks closing Phase 2.
- Clean-replay proof is **closed** as of 2026-07-30: a full `supabase db reset`
  replayed every migration through `20260728000700` and the matrix then passed
  69/69 twice.
- Shop/employment/appointment rows above the seeded three accounts are matrix
  fixtures; the suite archives published test shops so repeat runs stay
  deterministic.

## Coordination warning

The workspace may be shared with Claude/Opus. Before editing high-conflict
files, check `git status` and follow the ownership rules in
[Agent handoff](../plans/AGENT-HANDOFF.md).

## P2-06 slice 2c outcome

The remaining owner-authority work is now implemented and verified. Canonical
owner routes call the versioned commands; the barber self-write routes and old
RPCs are absent; migration `20260728000600` applies the deferred constraints;
the owner and barber interfaces expose the new authority model. The clean-reset
matrix passed 69/69 twice and the full local gate/browser smoke is recorded
above. This is historical P2-06 evidence; P2-07 is verified and Phase 3 is now
implementation-complete with product-owner browser acceptance pending.
