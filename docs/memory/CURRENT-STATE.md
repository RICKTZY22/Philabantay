---
tags:
  - philabantay
  - current-state
updated: 2026-07-29
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
- P2-06 Schedule authority: in progress (Slices 1, 2a, and 2c implemented and
  verified; packet sign-off remains pending).
- P2-07 through P2-08: not started.

## Active packet

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
- the laptop and phone use inline SVG line-art chassis around animated HTML UI,
  with those internal animations disabled under reduced motion;
- the bundled How it works chapter combines the booking lifecycle, customer
  flow, shop-side flow, and role capabilities in a bright sticky-index layout
  over the supplied repeating barber-tool doodle wallpaper;
- landing Log in, Sign up, Request a Demo, and contact actions open the existing
  real auth forms in one portalled dialog without changing route; direct
  `/login` and `/signup` routes remain valid fallbacks;
- signup validation focuses the first invalid field, modal Escape/focus return
  works after switching modes, and form/entrance animation is disabled under
  reduced motion.

Verified on 2026-07-29:

- the browser loaded all four WebP assets. Forced morning, afternoon, evening,
  and midnight checks at `1440x900` each exposed exactly one active layer; live
  Philippine time resolved to the midnight hero scene while the wider landing
  phase remained `night`;
- the full-width scene and right-side barbershop fit below the navigation.
  Every scene held `scrollWidth = clientWidth` at `1440x900`, `1024x768`,
  `390x844`, and `320x760`; the narrowest check also verified the landing shell
  no longer inherits the global `320px` minimum through the browser scrollbar;
- hero DOM contains one laptop SVG and one phone SVG, with zero legacy hero
  walkers and zero legacy live-city layers. Reduced-motion emulation resolved
  the scene transition to `0s` and both device UI animation names to `none`;
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

Independently review the P2-06 Slice 2c owner-authority diff and evidence, then
decide whether the packet can be signed off. Keep P2-06 in progress until that
review is recorded. Do not begin P2-07.

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
