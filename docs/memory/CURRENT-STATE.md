---
tags:
  - philabantay
  - current-state
updated: 2026-07-30
---

# Current state

Authoritative detail: [Roadmap status](../plans/ROADMAP-STATUS.md).

## Active phase

**Phase 2 — shops, workforce, and availability**

- P2-01 Shop lifecycle: verified complete.
- P2-02 Shop facts: verified complete.
- P2-03 Hiring state: verified complete.
- P2-04 Employment convergence: verified complete.
- P2-05 Provider capabilities: verified complete.
- P2-06 Schedule authority: **verified complete, signed off 2026-07-30** on an
  agent-executed functional and accessibility pass accepted in lieu of a
  personal visible-workflow review.
- P2-07 Availability engine: next.
- P2-08 Race gate: not started.

## Active packet

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
- Sign-in, sign-up, sign-out, and drawer section changes share one curtain
  transaction. Route content enters with a short transform/opacity animation,
  while reduced motion bypasses the curtain and disables the route animation.
- Guest auth now has one dedicated surface: `/login` and `/signup` use a
  centered light form card, warm cream space, copper actions, and three
  restrained pastel role accents. These routes intentionally have no global
  header band; only Back to home sits above the introduction. The former dark
  split panel and duplicate landing dialog are absent. Short desktop viewports
  compact spacing and hide only the decorative role/footer notes so both login
  and signup remain above the fold; mobile keeps necessary natural scrolling.
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

P2-07 has not started.

Environment as left on 2026-07-30:

- Docker and the local Supabase stack are healthy on the moved ports
  (API/storage `54521`, database `54522`, studio `54523`);
- the database was reset from empty and carries every migration through
  `20260728000700`;
- the API dev server runs on `4000` and the web dev server on `5174`. `5174` is
  not optional: `vite.config.ts` uses `strictPort` and the API's `WEB_ORIGIN`
  allowlist only trusts that port, so any other port fails CORS;
- `owner@phila.test`, `barber@phila.test`, and `customer@phila.test` were
  re-seeded. The owner owns "Philabantay · Dev Shop" (draft, 1 chair, 2 active
  services) and the barber has active employment there. The 2026-07-30 scenario
  run left weekly hours 08:00-21:00 Mon-Sat set, a `customer@phila.test` booking
  on `2026-08-05` at 10:00 Manila, an owner exception of 09:00-20:00 on that
  date, and a pending `different_hours` request on `2026-08-10`. **The shop is
  back to `draft`.** It was published for the scenario-4 conflict test and left
  published on purpose, which then broke the matrix: see the fixture-pollution
  note below. Republishing takes one owner command whenever the P4025 guard needs
  exercising again;
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
above. P2-06 remains in progress only for independent review/product sign-off,
and P2-07 has not started.
