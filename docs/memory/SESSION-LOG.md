---
tags:
  - philabantay
  - session-log
---

# Session log

## 2026-07-28 - Obsidian project canvas

- Added `PHILABANTAY-PROJECT-MAP.canvas` as a visual command center for the
  five-phase roadmap, active P2 packet sequence, runtime architecture,
  repository structure, verification gates, and cost-aware model routing.
- Added direct canvas file nodes for current state, roadmap, work breakdown,
  model guide, architecture, security, testing, traceability, and code patterns.
- Preserved the unrelated empty `Untitled.canvas`; no product status or packet
  boundary changed.

## 2026-07-28 - cost-aware model routing

- Added one authoritative routing matrix covering all 39 V1 packets.
- Assigned Terra, Claude Sonnet, Sol, or Claude Opus by work type and risk,
  with an explicit recommended effort and narrowly scoped support/review lane.
- Reserved `xhigh` for concurrency, security, durability, and release gates;
  no packet defaults to `max` or `ultra`.
- Linked the guide from the project hub, plan read order, work breakdown,
  roadmap, and agent handoff. Packet status and the P2-06 boundary did not
  change.

Append concise handoffs here. Detailed evidence remains in the roadmap, test
catalog, commits, and implementation files.

## 2026-07-28 — P2-06 Slice 2c owner-authority closeout

- Replaced barber self-rewrite schedule paths with canonical, versioned
  owner-authoritative weekly and exception routes; removed the legacy RPCs and
  enforced request idempotency/resolution invariants in migration
  `20260728000600`.
- Made the barber roster read-only with structured time-off/different-hours
  requests; owner approval applies the linked exception and revision/event in
  one transaction. Added stale refresh and P4025 error presentation.
- Clean reset succeeded; the API integration/direct-RLS matrix passed 69/69
  twice without another reset. Direct JWT denials, 401/403 boundaries,
  concurrent 200/409, exact P4025 count, and append-only events are covered.
- Shared 56, API 28, and web 32 fast tests passed (116 total); typecheck, lint,
  builds, DB lint, and diff validation passed.
- Authenticated smoke passed owner weekly/exception edits, barber request and
  owner approval, stale sessions, exact 390×844 layouts without overflow,
  keyboard-native controls, reduced motion, and a clean console.
- A final local-only reset removed the temporary smoke accounts and data while
  preserving the running API/web processes.
- P2-06 remains in progress for independent review/product sign-off. P2-07 was
  not started; no commit, staging, or deployment was performed.

## 2026-07-27 — P2-05 provider capabilities

- Added an explicit shop-scoped owner provider profile/capability with separate
  accepting-bookings and rating facts; the owner account never changes role.
- Added versioned owner-authoritative service qualification sets, barber
  requests, immutable events, idempotent capability/qualification commands,
  stale decisions, foreign-shop denial, and one-winner concurrent updates.
- Added owner Staff qualification management and barber Professional
  read/request UI with authoritative refresh.
- Clean-reset local Supabase through `20260727000300`, passed database lint and
  the complete API/direct-RLS matrix 59/59.
- Passed all workspace typechecks, 93 fast tests, API/web production builds,
  and `git diff --check`.
- Authenticated browser smoke passed owner enable/grant/remove, barber
  request/owner approval, two-session stale recovery, exact 390×844 no-overflow,
  keyboard-native controls, reduced motion after one focused fix, and clean
  reload with no console errors.
- Performed a final local-only reset after browser evidence to remove temporary
  demo accounts/shop data; API and web remained healthy.
- P2-06 was not started.

## 2026-07-27 — P2-04 employment convergence

- Converged barber applications, owner invitations, and join-code entry on one
  pending request/event model; no entry path grants employment.
- Added opt-in barber job profiles and the owner request/candidate/code
  workspace plus barber Professional profile.
- Added hashed expiring codes, rotation/revocation, usage limits, persisted
  throttling, one-time plaintext reveal, immutable events, and locked
  acceptance with vacancy/one-employment race handling.
- Clean-reset local Supabase through `20260727000200`, restarted Kong after the
  Windows Docker DNS cache changed the storage container address, and passed
  the full API/direct-RLS matrix 58/58.
- Passed all typechecks, 92 fast tests, production builds, and diff validation.
- Authenticated owner/barber browser smoke passed invite/accept, opening
  decrement, one-time code reveal, profile persistence, desktop/mobile,
  keyboard semantics, reduced motion, and clean reload.
- P2-05 was not started.

## 2026-07-27 — P2-03 hiring state

- Added the canonical versioned `off | open | full` shop hiring command,
  optional positive opening count/note, and the owner Hiring settings page.
- Gated the barber hiring catalogue on published eligibility plus canonical
  `open`, and revoked browser access to the legacy hiring-listing table.
- Clean-reset local Supabase through `20260727000100`, then passed the complete
  API/direct-RLS matrix 57/57.
- Passed all workspace typechecks, 91 fast unit tests, API/web production
  builds, and `git diff --check`.
- Authenticated owner smoke passed open/full/off persistence and validation,
  stale two-session reload, private-until-published messaging, narrow viewport,
  keyboard reachability, and reduced motion.
- Restarted the stale local API process so `/api/v1/owner/shop/hiring` is now
  served from the current source. P2-04 was not started.

## 2026-07-27 — P2-02 final-gate continuation

- Confirmed Docker/local Supabase health, completed a clean reset through the
  P2-02 migration, and passed the full API/direct-RLS matrix 56/56.
- Passed all workspace typechecks, 88 unit tests, API/web production builds,
  and diff validation.
- Exercised authenticated Shop Setup details/map, hours/closures, service
  lifecycle, media validation/upload, publishing, stale-version, mobile, and
  reduced-motion behavior. Exact trusted keyboard/native-picker evidence is
  still required before closing P2-02.
- Removed the exact local owner smoke shop and its cascading fixture records,
  leaving the verified local owner account with a clean first-time setup.
- Added a visible `Shop Setup` destination to the owner navigation menu.
- Completed the final native Chrome gate: trusted Tab traversal with visible
  focus and working Enter/Escape, plus native segmented date entry
  (`2026-08-15`) and keyboard closure submission. No console errors.
- Removed the temporary native-control test shop and confirmed the local owner
  again owns zero shops.
- Marked P2-02 verified complete. P2-03 remains not started.

## 2026-07-26 — P2-02 implementation

- Finished the remaining Shop facts implementation: service editor, signed
  private media upload, and map-pin picker.
- Replaced check-then-update publishing and delete-then-insert hours with atomic
  versioned database commands.
- Extended public eligibility to require an open-hours block.
- Added service/media isolation scenarios and a signed-upload adapter test.
- Passed typecheck, 88 unit tests, production build, and diff validation.
- Clean Supabase/RLS and owner browser gates remain pending because Docker
  Desktop's Linux engine was off.
- Next: execute the P2-02 final gate, then begin P2-03 only after sign-off.

## 2026-07-26 — shared agent memory setup

- Configured `docs/` as the Git-tracked Philabantay Obsidian vault.
- Added project hub, current-state, decision, session, and handoff templates.
- Added matching `AGENTS.md` and `CLAUDE.md` entrypoints so Codex and Claude
  recover the same project context before editing.
- Selected the optional Local REST API MCP integration for live Obsidian-aware
  search and focused note operations; its credential must remain local.
- Obsidian Local REST API is enabled on loopback; Codex now references its
  private `OBSIDIAN_API_KEY` environment entry and authenticated successfully.
  Claude-side MCP registration remains separate and user-controlled.

## 2026-07-28 — customer catalogue honesty cleanup (pre-P2-06)

- Removed the hardcoded `PHILA-DEMO-25` referral box, the two placeholder
  statistic cards, and the `DISCOVERY_META` demo-shop table (fake price bands,
  fake shop→service mappings, fake wait estimates) from `CustomerDashboard`.
- Replaced them with real `DataBackend` facts: the public catalogue already
  returns `PublicService.shop_id`, so shop→services, per-shop prices, and the
  service filter are now derived from live data. Free-barber counts come from
  `ShopWithStatus.available_barber_count`. No queue or wait estimate is shown.
- Kept the `pending`/`no_show` aliases in `AppointmentsPage`: `ApiBackend`
  does not normalize (`hydrateAppointments` is a pass-through) and
  `appointmentStatusSchema` still accepts both legacy values on the wire.
- Contract gap for a later backend slice: `PublicShop` exposes no public
  operating hours, closures, description, approved photos, specialties, or
  contact details, so the customer shop detail cannot yet show them.
- Verified: web typecheck, 19 web unit tests, production build, and
  `git diff --check` all pass; browser smoke at 1280x720 and 390x844.
- Phase 2 and P2-06 remain incomplete; no packet status was changed.

## 2026-07-28 — safe public shop-detail projection

- Added a strict shared `PublicShopDetail` contract and anonymous
  `GET /catalog/shops/:id` API projection for real description/contact,
  timezone/booking mode, chair capacity/default buffer, weekly hours, future
  closures, active services/prices, and ready+approved media with 15-minute
  signed URLs.
- Kept the response fail-closed with explicit database column allowlists and a
  strict schema; owner identity, lifecycle/version, closure reasons, raw
  storage paths, moderation fields, and internal timestamps are not exposed.
- Added shared adapter, API boundary, and real local-Supabase integration tests.
  A clean reset applied all migrations through P2-05 and the expanded complete
  API/direct-RLS matrix passed 62/62.
- All workspaces typechecked; 97 fast tests, API/web production builds, DB
  lint, and `git diff --check` passed.
- P2-06 was not started. Customer UI can consume `backend.shops.get(shopId)`;
  live availability remains P2-07 and wait estimates remain deferred.

## 2026-07-28 — P2-04 ownerless request-resolution security fix

- Confirmed a high-severity authorization bypass reported by Claude: a verified
  owner with no shop could accept or decline another shop's employment request
  by ID. `target_request.shop_id <> private.owner_shop_id(owner_id)` evaluated
  to NULL when the resolver returned NULL, so PL/pgSQL skipped the denial.
- Changed the original P2-04 resolver to fail closed with SQLSTATE `42501` and
  added forward migration
  `20260728000100_p2_04_ownerless_resolution_guard.sql` for already-migrated
  databases.
- Added an independent Express preflight that requires an owned shop and scopes
  the request ID to that shop before the service-role RPC.
- Added an end-to-end exploit regression for HTTP accept/decline and direct
  service-role RPC accept/decline. All four attempts fail, the request remains
  pending, and no employment is created.
- Clean reset through the hotfix and complete API/direct-RLS matrix passed
  63/63. All workspaces typechecked; 97 fast tests, production builds, DB lint,
  and `git diff --check` passed. P2-06 was not started.

## 2026-07-28 — Claude findings verification

- Rechecked all 26 reported findings against current source and the local
  database. The ownerless P2-04 exploit and its missing regression are now
  fixed locally; fake customer data remains removed.
- Confirmed current security/hardening debt: retained plaintext legacy join
  codes with renamed policies (authenticated privileges are revoked),
  unnecessary private-function execution, a weak owner-invitation constraint,
  and reduced join-code entropy.
- Confirmed media consistency/resilience issues, employment status semantics,
  incomplete appointment status styling, and the appointment normalization/doc
  mismatch. Join-code usage consumption on request creation needs an explicit
  product decision.
- Reproduced integration non-idempotence: clean run 63/63, immediate second run
  62/63 due to leaked published fixture shops. Reset the local database after
  the diagnostic and restored Auth health.
- Confirmed missing P4021/media-rejection automation and an overstated media
  test-catalog claim; root `npm test` documentation and the completed-packet
  count are stale.
- P2-06 was not started.

## 2026-07-28 — bounded hardening closeout

- Repaired findings 2-9, 11-13, 19, 21-22, 24-25 without starting P2-06.
- Removed retained plaintext legacy join codes; revoked private helper
  execution; enforced owner-invitation provenance; strengthened join-code
  entropy; and made superseded employment requests truthful.
- Made media deletion object-first/retryable, added the 24-hour bounded stale
  upload worker and 100-row cap, isolated preview failures, and exposed
  accurate rejected/deleting UI states.
- Normalized legacy appointment status reads and added explicit UI presentation
  coverage for all canonical statuses.
- Added P4021, invalid-content cleanup, stale media, cap, preview resilience,
  provenance, status-normalization, and repeatability regressions.
- Clean reset through `20260728000300` passed. The API integration/direct-RLS
  workspace passed 69/69 twice consecutively; 112 fast tests, all typechecks,
  lint, production builds, database lint, SQL grant/data checks, and
  `git diff --check` passed.
- Issue 10 remains a product decision; remote deployment was not authorized.
  P2-06 was not started.

## 2026-07-28 — remaining-risk follow-up

- Closed issue 10 with the security-preserving product rule that each
  successful non-replayed join-code request consumes one non-refundable use.
- Extended the local integration case through decline, withdrawal, expiry,
  exhausted usage, throttling, and revocation; after a clean reset the API
  workspace passed 69/69 twice consecutively.
- Audited remote readiness: GitHub origin is reachable, but the working branch
  contains shared unrelated dirty work; Supabase CLI has no access token or
  linked project; and the repository has no API/web production-host
  configuration. No safe coherent commit or remote rollout was possible
  without a user-selected scope and deployment credentials. P2-06 was not
  started.

## 2026-07-28 — remote rollout deferred

- Product owner explicitly deferred Supabase login/linking and remote
  deployment until Phase 5 production rollout.
- Local Supabase remains the verification target while Phase 2 and the later
  feature phases are unfinished. Missing remote credentials/hosting are no
  longer treated as a current packet blocker.
- P2-06 was not started.

## 2026-07-28 — bounded hardening review corrections

- Reviewed Codex's bounded hardening packet (issues 2-9, 11-13, 19, 21-22,
  24-25). All sixteen items verified, including the two traps flagged in the
  task card: the enum addition was correctly split from its use, and invitation
  provenance used a trigger rather than an illegal CHECK subquery.
- Fixed two residual defects found in review:
  - `media_limit` (P4022) was returned by the API but missing from
    `DataErrorCode` and `API_ERROR_CODES`, so an owner hitting the 100-photo cap
    saw a generic error instead of the real reason.
  - `hydrateAppointments` normalized reads only. Added a single
    `appointmentRequest` helper so all 15 appointment command responses
    normalize the legacy `pending`/`no_show` aliases in one place.
- Added a regression test for each, and confirmed both fail when the fix is
  reverted rather than passing vacuously.
- Verified: typecheck clean, 114 fast tests (shared 54, api 28, web 32),
  API/web production builds, `git diff --check` clean, and the local Supabase
  matrix at 69/69 run twice consecutively with no reset.
- Correction to this entry: issue 10 is **closed**, not open. [D-014](DECISIONS.md)
  (2026-07-28) fixed the rule that a successful non-replayed join-code request
  consumes one non-refundable use. Phase 1 browser/accessibility smoke and the
  independent P1-07 adversarial re-scan remain open. P2-06 not started.

## 2026-07-28 — doc corrections + P2-06 schema slice

- Corrected the stale test-count claims: `docs/testing/README.md` said
  `shared 52` and a full total of 153 while the same block computed the fast
  total from 54; it now reads shared 54 and **155** (54 + 69 + 32), measured, not
  assumed. Fast total 114 was already correct in all five places.
- Corrected this log's own 2026-07-28 review entry: it claimed issue 10 was
  still an open product decision, which contradicted [D-014](DECISIONS.md) and an
  earlier entry that already recorded closing it.
- Surveyed P2-06 against the Phase 2 plan (STAFF-01). Confirmed the real gap is
  larger than rewiring: barbers self-author patterns and exceptions through
  `PUT /shifts/patterns`, `POST /shifts/exceptions`, and
  `DELETE /shifts/exceptions/:id`, and `api_resolve_shift_change_request` does
  not exist at all — approval is a bare status UPDATE in
  `apps/api/src/routes/employment.ts` that writes no schedule.
- Landed P2-06 slice 1: forward migration `20260728000400` with
  `staff_schedule_revisions`, structured/versioned change-request columns,
  exception provenance, an append-only `staff_schedule_events` table, and
  read-only RLS. New enums were created rather than extending existing ones, so
  the `ALTER TYPE ... ADD VALUE` transaction restriction does not apply.
- Caught and corrected my own ordering mistake: the first version tightened
  `idempotency_key` to NOT NULL and added the resolution invariant, which broke
  two integration tests because the pre-P2-06 write paths violate both. Both
  tightenings are deferred to slice 2 with the reason recorded in the migration,
  and the suite returned to 69/69.
- Verified: matrix 69/69, 114 fast tests, all typechecks, API/web builds, and
  `git diff --check`.
- P2-06 behavior slice not started; no barber self-rewrite has been removed yet.
  P2-07 not started.

## 2026-07-28 — P2-06 slice 2a: schedule commands

- Added `20260728000500_p2_06_schedule_authority_commands.sql`: five
  owner-authoritative commands plus four raising helpers. Approval writes the
  shift exception, links it to the request, advances the roster revision, and
  records the audit event in one transaction; decline touches request state only.
  Removing availability on a date with active bookings raises `P4025` instead of
  silently invalidating reservations.
- Every helper raises rather than returning NULL, deliberately, because P2-04's
  ownerless-resolution exploit came from a NULL-returning owner lookup feeding a
  `<>` comparison.
- Fixed one smell before applying: the approve path read the roster version
  without a lock, which could surface a concurrent owner edit as a misleading
  "schedule changed" conflict. It now reads under the same lock the bump takes.
- Deferred to slice 2b, with the reason recorded in the migration: dropping the
  four pre-P2-06 RPCs and applying the `idempotency_key NOT NULL` and
  pending-resolution invariants. Verified that doing it now fails 3 integration
  tests, because those RPCs are still the live write path for
  `PUT /shifts/patterns`, `POST /shifts/exceptions`,
  `DELETE /shifts/exceptions/:id`, and `POST /shift-change-requests`.
- Ran a clean `supabase db reset` so migrations are the single source of truth,
  then re-seeded the local accounts the reset removed.
- Verified: matrix 69/69, 114 fast tests, typecheck, API/web builds,
  `git diff --check`, and all five commands present after the reset.
- Behavior has not changed yet: barbers can still self-rewrite. Slice 2b is
  routes, contract, UI, the five test categories, and smoke. P2-07 not started.

## 2026-07-28 — P2-06 slice 2b (part 1): change-request authority wired

- Replaced the bare status UPDATE with real commands. `POST /shift-change-requests`
  now calls `api_submit_shift_change_request` (kind, optional time range,
  idempotency key) and the old `PATCH /shift-change-requests/:id` is gone,
  replaced by `POST /owner/shift-change-requests/:id/approve|decline` calling
  `api_resolve_shift_change_request`. Approving writes the shift exception in the
  same transaction and returns its id as proof.
- Extended the shared contract: `ShiftChangeRequest` now carries `version`,
  `requested_kind`, requested times, resolution fields, and
  `applied_exception_id`; added `StaffSchedule`, owner write inputs, and
  `ResolveShiftChangeRequestResult`. Updated `ApiBackend`, `OwnerStaffPanel`, and
  the barber `DashboardPage` request form.
- Fixed my own bug found by the new test: the route body schema required
  `decision` even though the decision comes from the URL path, so every resolve
  returned 400. Split `resolveShiftChangeRequestBodySchema` from the client-facing
  input.
- Added integration coverage to the staff-writes case: idempotent replay returns
  the same request, a foreign owner gets 403, a stale version gets 409, approval
  produces a linked `source = 'change_request'` exception, and re-resolving an
  already-resolved request gets 409.
- Verified: matrix 69/69, 114 fast tests, typecheck, API/web builds,
  `git diff --check`.
- Still open in slice 2b: owner shift/exception routes are not wired to the new
  versioned commands yet, the three barber self-rewrite endpoints
  (`PUT /shifts/patterns`, `POST /shifts/exceptions`,
  `DELETE /shifts/exceptions/:id`) still exist, the deferred drops and invariants
  are still deferred, and no browser smoke has run. P2-07 not started.

## 2026-07-28 — P2-06 independent verification + narrowed-hours guard

- Verified Codex's slice 2c against the handoff. Barber self-rewrite is genuinely
  gone: routes deleted, contract methods removed, **zero non-SELECT grants** to
  `authenticated` on all five schedule tables, and the matrix proves 401 anon /
  403 barber on all four owner routes. Closeout `20260728000600` drops the four
  legacy RPCs, applies the deferred `idempotency_key NOT NULL` and
  pending-resolution invariants, and additionally revokes the `update (status)`
  column grant plus the old owner UPDATE policy that had allowed a direct
  status-only write around the command. None of the seven handoff traps recurred,
  and `schedule_has_active_bookings` is plumbed through `errors.ts`,
  `DataErrorCode`, and `API_ERROR_CODES`.
- Corrected one of my own review findings: `different_hours` **is** implemented in
  the barber UI, in `BarberShiftCalendar.tsx` rather than `DashboardPage.tsx`,
  with a proper submit guard mirroring the zod range rule. My earlier claim that
  it was missing came from grepping the wrong file.
- Fixed the one real remaining gap with `20260728000700`: the conflict guard only
  fired on full unavailability and compared dates while ignoring times, so
  narrowing a window, or approving a `different_hours` request, could leave a
  booking outside the barber's own availability. Both the owner upsert and the
  approval path now pass the resulting window to
  `private.assert_no_conflicting_bookings_on_date`.
- Added integration regression: narrowed window is refused with
  `schedule_has_active_bookings`, and a window that still covers the booking is
  accepted, so the guard is not simply refusing every edit on a booked date.
- Verified: clean `supabase db reset` through `20260728000700`, matrix 69/69 twice
  consecutively, 116 fast tests, shared and api typechecks clean, `git diff --check`
  clean.
- Not mine and left untouched: `apps/web` currently fails typecheck because an
  in-flight landing/auth split deleted `components/AuthSlider.tsx` while the new
  untracked `pages/AuthPage.tsx` still imports it. Unrelated dirty work, preserved.
- P2-06 stays 🔨 pending independent sign-off and human browser evidence.
  P2-07 not started.

## 2026-07-29 — public landing/auth presentation polish

- Preserved the Philabantay space identity and rebuilt the hero composition
  around a live city split, product-preview laptop, and phone.
- Refined the city into a full-bleed asymmetric right-side window; the final
  laptop/phone cluster sits left so the shop and clock landmark remain visible.
- Reduced the hero crowd to two independently timed passersby plus the
  shop-specific customer sequence. All feet now stay within 6-12 px of the
  city street baseline instead of floating above it.
- Replaced the digital live-city chip with a large analog clock tower driven by
  `Asia/Manila` time every second; its hour also drives the city phase.
- Enlarged the laptop and phone, kept the laptop high in the city overlap, and
  moved the phone to the left side as requested.
- Kept the bundled workflow bright and phase-independent.
- Reused the real sign-in/sign-up forms in an accessible route-stable landing
  dialog, with mode transitions and reduced-motion fallbacks.
- Browser smoke covered the full-bleed desktop edge, device placement, active
  pedestrian motion, route-stable auth, keyboard/focus behavior, reduced
  motion, no horizontal overflow, and a clean console.
- Follow-up browser geometry grounded the analog tower and its widened stone
  foundation within 7 px of the city street baseline; the former floating gap
  is gone.
- Expanded the left message area with a larger headline, handwritten supporting
  line, sketched strokes, and irregular doodle CTAs. Desktop browser geometry
  measured a 445 x 487 px copy block with zero horizontal overflow.
- Closed the split-scene overflow regression: landing-only containers now clip
  horizontal artwork, the 861-1120 px range retains the side-by-side city split
  with a flush right edge, narrower layouts contain the full-width city
  fallback, and the travelling spaceship fades before the viewport boundary.
  The 1280 x 720 browser check remained overflow-free; the web production build
  and targeted `git diff --check` passed.
- Added the supplied barber-tool illustration as a 390 px repeating workflow
  wallpaper with a low-opacity multiply treatment (300 px/lighter on narrow
  screens). Browser inspection confirmed the bundled asset loaded behind the
  heading and cards without horizontal overflow; the web production build
  passed.
- Removed the remaining false right-edge gap by clipping horizontal overflow at
  the document root and resetting stray horizontal scroll on mount/resize.
  Browser verification held `scrollX = 0`; the city now ends at the scrollbar.
- Generated and integrated a cohesive 21:9 hero world from the supplied prompt:
  night sky, dusk seam, daylight street/barbershop, grounded walker, and a soft
  empty portal for the live HTML device mockups. The optimized WebP is 83,954
  bytes (down from the 1.6 MB generation); desktop browser verification showed
  the asset loaded, `scrollX = 0`, and no duplicated legacy city layer.
- Removed the static child from a non-destructive v3 background edit and placed
  the existing SVG figure on the rebuilt sidewalk. Its internal limbs walk
  while the wrapper travels left at roughly 30 px/s; browser samples confirmed
  movement, grounded feet, `scrollX = 0`, and the reduced-motion fallback keeps
  the figure static.
- Workspace typecheck, 116 fast tests, lint, API/web production builds, and
  `git diff --check` passed for the landing/auth slice.
- P2-06 remains pending independent sign-off. P2-07 was not started.

### Hero time variants and retired walker — supersedes the portal notes above

- Replaced the v3 portal artwork with two aligned, built-in ImageGen 21:9
  variants: `philabantay-hero-morning-v1.webp` (112,038 bytes) and
  `philabantay-hero-night-v1.webp` (97,124 bytes). Morning retains a night-side
  blend; night retains a faint warm horizon. Both use one small hand-drawn
  split crack instead of a black portal.
- Grounded people are now baked into both scenes: two wait at the shop, one
  jogs, one walks home, and one stands near the storefront. Removed the hero
  walker markup/keyframes and the legacy live-city/space render layers.
- Moved the retired 87,690-byte v3 artwork and the old walker recipe to
  `docs/design-archive/landing-hero-experiments/`, which has no runtime import.
- Rebuilt the laptop and phone chassis as inline SVG line art while preserving
  HTML content inside. Card pulse, list scan, phone-card, and CTA motion are
  internal to the devices; reduced-motion CSS disables those animations and
  the phase crossfade.
- Live browser evidence at 1265 x 712: Philippine time resolved to `02:06`
  (`night`), the night layer opacity was `1`, both new asset URLs were present
  in computed styles, laptop SVG count `1`, phone SVG count `1`, legacy hero
  walker count `0`, legacy city count `0`, and
  `scrollWidth = clientWidth = 1265`. Timed computed-style samples changed for
  the laptop cards/list and phone shop UI. Console errors: `0`.
- Resized the generated scene to use the full desktop width below the
  navigation, so the complete right-side barbershop and the rest of the 21:9
  composition are visible rather than cropped.
- Final gate: all-workspace typecheck passed; 116 fast tests passed
  (41 skipped); lint passed; API/web production builds passed with both hero
  assets emitted; `git diff --check` passed with non-failing line-ending
  warnings only.
- P2-06 remains pending independent sign-off. P2-07 was not started.

### Four PH-time hero scenes — supersedes the two-variant notes above

- Generated four matched scene edits with built-in ImageGen, then normalized
  every runtime asset to `1915x821` WebP: morning v2 `97,584` bytes, afternoon
  v1 `105,860` bytes, evening v1 `83,662` bytes, and midnight v1 `53,954`
  bytes. The prompts preserved one camera/horizon/street/crack/barbershop
  geometry while changing only light, people, shop activity, and vehicles.
- Added the dedicated live `Asia/Manila` hero schedule without changing the
  wider landing `data-day-phase` contract: midnight `00:00-04:59`, morning
  `05:00-11:59`, afternoon `12:00-16:59`, evening `17:00-23:59`. Eight boundary
  unit assertions passed.
- Scene content is static and phase-specific: students travel to school in the
  morning; customers wait at the barbershop in the afternoon; workers travel
  home in the evening; midnight has empty sidewalks and sparse late traffic.
  Each scene includes a grounded Philippine jeepney, and populated scenes use
  only pre-drawn figures.
- Live browser evidence at `1440x900` resolved Philippine time to midnight.
  Forced morning/afternoon/evening/midnight screenshots each exposed exactly
  one matching layer, all four computed background URLs loaded, laptop SVG
  count was `1`, phone SVG count was `1`, runtime hero walker count was `0`,
  and console warnings/errors were `0`.
- A 16-case responsive matrix covered every scene at `1440x900`, `1024x768`,
  `390x844`, and `320x760`. Every final case held
  `scrollWidth = clientWidth`. The matrix caught a pre-existing 15 px overflow
  at the narrowest width; landing-specific `min-width: 0` removed the global
  320 px minimum while a vertical scrollbar is present.
- Reduced-motion emulation resolved hero crossfade duration to `0s` and the
  laptop/phone internal animation names to `none`. The page was restored to its
  live clock and default viewport after forced-state verification.
- Archived the superseded morning/night two-phase WebPs beside the retired v3
  portal art; nothing in that archive remains in the runtime asset graph.
- Final gate: all-workspace typecheck passed; 124 fast tests passed with 41
  skipped; lint passed; API/web production builds passed; and
  `git diff --check` passed with non-failing line-ending warnings only.
- P2-06 remains pending independent sign-off. P2-07 was not started.

## 2026-07-29 — landing-redesign leftovers removed

- Checked the redesigned landing and auth in the browser. Landing renders with
  19 CSS `data-reveal` nodes, the `IntersectionObserver` scene-pausing is active,
  no horizontal overflow at 1280, and no console errors. All four nav anchors
  (`#home`, `#services`, `#contact`, `#how`) resolve to real ids, and both hero
  CTAs are wired to real actions rather than being dead buttons.
- Auth verified end to end: owner sign-in routes to `/dashboard/owner/overview`,
  and a reload keeps the dashboard with no landing flash. `/login` and `/signup`
  now deep-link to real pages with the correct form, which closes the long-standing
  fragility where both redirected to `/` and defaulted to sign-in.
- Removed dead code the redesign orphaned: `theme/useDoodleAnimations.ts` (50
  lines) and `theme/doodleAnimationRuntime.ts` (156 lines). An import scan across
  `apps/web/src` confirmed nothing referenced them. Six of the seven `data-*`
  targets that runtime drove are gone from the codebase; only `data-reveal`
  survives, now CSS-driven.
- Dropped the `gsap` dependency, which existed solely for that runtime. Removed
  from `apps/web/package.json` and the lockfile; the build has no gsap chunk.
  `useJourneyScroll` never used it and stays.
- Corrected the docs the removal made stale, plus pre-existing rot found while
  checking: `ARCHITECTURE.md` tech-stack and `theme/` rows, the animation-by-
  attribute gotcha, the "sample-only shop-profile UI" gotcha (that page was
  deleted and the dashboard fakes were removed on 2026-07-28), the component
  table rows for `BarbersPage`, `BarberDetailPage`, and `ShopProfilePage` (all
  deleted in `3a983c6`), and the GSAP claim in `FEATURES.md`.
- Verified: typecheck clean, 125 fast tests (shared 56, api 28, web 40), API/web
  production builds, matrix 69/69, `git diff --check` clean.
- Left untouched: `useJourneyScroll`, `WalkFigure`, and all five hero assets are
  live. No CSS was pruned; unused-rule detection is unreliable by grep and the
  risk of removing a live rule outweighs the gain.

## 2026-07-29 - auth review + signup form compaction

- Reviewed the auth surface end to end: `routes/auth.ts` (signup/signin/refresh
  public, rate-limited via `credentialLimiter`; everything else behind
  `authenticate`), `http/auth.ts` (JWT verified through `getClaims`, then
  cross-checked against `getUser` before trusting the subject), and
  `http/authorization.ts` (role/capability/ownership/employment guards, plus
  `requireOperationalAccess` and `requireAal2`). Route ordering in `app.ts`
  keeps verification/support reachable for locked accounts while gating
  everything else. No vulnerabilities found; no backend changes made.
- The reported "signup form is too large" was real and measurable: at a
  1280x720 viewport the card rendered 804px tall and the document needed
  1161px, putting the submit button 176px below the fold.
- Compacted `AuthSlider.css` only (no TSX/validation changes): tightened
  `.auth-form-panel` padding, `.auth-form-header` spacing/heading size, form
  and field gaps, input height (49px to 44px), and the password-toggle
  button. Changed `.auth-name-grid` from a 2-column layout that forced last
  name onto its own row to one 3-column row (first/middle/last together).
- Verified live against a second Vite instance (port 5180, added and then
  removed from `.claude/launch.json`) so the check didn't depend on another
  session's dev server: signup card dropped to 684px (document 1041px,
  submit button only 36px past the fold at 720px tall), sign-in form
  unaffected structurally, no horizontal overflow or console errors at
  375px/700px/830px/1280px. Web typecheck passed.
- Left `.auth-card`'s shared 650px `min-height` alone since sign-in's content
  is only ~259px tall and depends entirely on it for its current size;
  lowering it would shrink sign-in too, which wasn't part of the request.

## 2026-07-29 — committed five days of Phase 2 work; matrix restored

- **Committed the backlog.** 115 uncommitted files had accumulated since
  `a281fb3` (2026-07-24), including all 11 P2-02..P2-06 migrations and the
  P2-04 security fix, with nothing staged and nothing pushed. Split into ten
  commits: local port move, P2-02..P2-05 migrations, the P2-04
  ownerless-resolution fix on its own so it stays visible in history, bounded
  hardening, P2-06 schedule authority, shared+API contracts, Phase 2 web
  surfaces, the landing/Rive redesign with the dead animation runtime removed,
  docs and the memory vault, and an env port fix.
- The shared contract and Express route changes for P2-02 through P2-06 had to
  land in one commit: five packets were built against a single working tree and
  their hunks interleave in the same files. The migrations are still committed
  per packet, so each packet's database truth is independently reviewable.
- Left `docs/2026-07-26.md` and `docs/Untitled.canvas` untracked; both are empty
  stubs, not work.
- Confirmed `docs/.obsidian/.gitignore` keeps `plugins/` and `workspace.json`
  out of the repository, so the Local REST API key, certificate, and private key
  in the plugin's `data.json` were never staged. Only the eight shareable vault
  settings files are tracked.
- **Restored the test environment.** Docker was already back up (server 29.6.1)
  and the stack was healthy on the moved ports. Every migration through
  `20260728000700` was already applied, so no reset was needed for the standing
  gate: the API integration/direct-RLS matrix passed **69/69 twice back to back
  with no reset**.
- Measured the rest of the gate: all workspaces typecheck, **124 fast tests**
  (shared 56, api 28 with 41 gated, web 40), lint, API and web production
  builds, and `supabase db lint` with no schema errors.
- **Fixed the recorded test-count drift.** Docs said 116 fast / 157 full; web
  moved 32 → 40 with the landing suite, so the real numbers are **124 fast /
  165 full**. Updated the current gate blocks in `testing/README.md`,
  `ROADMAP-STATUS.md`, and `QA-TRACEABILITY-MATRIX.md`. Dated historical
  evidence blocks and earlier session-log entries were left as written.
- **Found and fixed a live port drift.** The local stack moved to `54521`, but
  both `.env.example` files still advertised `54321`. In the web app that is not
  cosmetic: `vite.config.ts` derives `connect-src` and `img-src` from
  `VITE_STORAGE_ORIGIN`, so a fresh checkout would have signed shop-photo
  uploads and private previews blocked by CSP and pointed at a dead port. Fixed
  both examples and the local `apps/web/.env`.
- **New known gap:** the clean-reset replay proof still stops at
  `20260728000600`. `20260728000700` is applied locally but has never replayed
  from an empty database. The reset was deliberately skipped so the seeded
  accounts and dev shop needed for the pending P2-06 product pass survive.
- P2-06 stays 🔨. The five outstanding product-owner scenarios are recorded in
  `QA-TRACEABILITY-MATRIX.md`; scenarios 1-3 are ready against the existing
  draft dev shop, scenario 4 needs the shop published and one real booking, and
  the keyboard/reduced-motion evidence needs a person. P2-07 not started.
- The web dev server could not be started from this session: port `5174` is
  registered to another chat's server, and `5174` is required because
  `vite.config.ts` uses `strictPort` and the API's `WEB_ORIGIN` allowlist trusts
  only that port. Set `"autoPort": false` on the web entry in
  `.claude/launch.json` to document that constraint.

## 2026-07-30 — landing dead-code sweep; hero "defect" retracted

- Started the web dev server on 5174 once the port was freed and verified the
  earlier `VITE_STORAGE_ORIGIN` fix live: the served CSP now carries
  `http://127.0.0.1:54521` in both `img-src` and `connect-src`, alongside
  `http://127.0.0.1:4000` and `'wasm-unsafe-eval'` for Rive.
- **Retracted a wrong finding.** I reported the hero's empty 636px right grid
  track as a layout defect. It is not. `.phil-hero-marketing` has
  `background-color: rgba(0, 0, 0, 0)` and `background-image: none` at
  `z-index: 12`, while `.phil-hero-time-scenes` sits at `z-index: 0` with
  `inset: 0` and the active scene layer measures `1425x900`. The art paints
  straight through the empty track, which is exactly what the source comment at
  the disabled street block says: the hero is intentionally space-only. Filling
  that track would cover the right-side barbershop. No change made.
- Corrected the docs that claimed the opposite. `CURRENT-STATE.md`,
  `PHASE-2-TESTS.md`, and `ROADMAP-STATUS.md` all recorded "one laptop SVG and
  one phone SVG" in the hero as verified 2026-07-29 evidence. Those elements
  exist in no commit. Each claim is now replaced with the measured truth and
  marked as a correction rather than quietly deleted.
- **Removed 363 lines of unreachable code from `LandingPage.tsx`** (1095 → 732):
  the `{false && <>...</>}` fragment inside `HowStreetBackdrop` (former lines
  668-771), the `{false && <><JourneyCityBackdrop /><JourneyDoodles />
  <ScatterDoodles /></>}` call site, the three component definitions those were
  the only reference to (former lines 777-1032), and the now-unused `WalkFigure`
  import. All seven `WalkFigure` uses in this file were inside those dead
  ranges; `WalkFigure` itself stays, with four live uses in `Storefront.tsx`.
- This corrects a wrong conclusion in the earlier sweep, which kept those pieces
  because an import scan found them referenced. The only references were from
  branches that cannot run.
- **Left the `{false && <div className="phil-street">` block** (now line 344, 61
  lines) alone. It carries an explicit in-code comment stating the legacy street
  source is deliberately kept out of the render tree, so removing it would
  override a recorded decision. Archiving it under
  `docs/design-archive/` the way the retired hero art was handled is the natural
  next step if the tree should be fully clean.
- No bundle change to speak of: the entry chunk moved 183.02 kB → 183.01 kB,
  because Rollup was already eliminating `false &&` branches. The gain is 363
  fewer lines to read and no more misleading "live" references.
- Verified after the removal: all workspaces typecheck, 124 fast tests pass
  (shared 56, api 28 with 41 gated, web 40), lint passes, API and web production
  builds pass. Browser at `1440x900`, `390x844`, and `320x760` (the last also in
  dark scheme) had no horizontal overflow, one active hero scene serving
  `philabantay-hero-afternoon-v1.webp` for live Manila afternoon, the workflow
  section and Rive canvas intact, 19 `data-reveal` nodes matching the previously
  recorded count, and zero console errors.
- Modal focus behavior could not be verified: `ModalPortal` moves focus inside a
  `requestAnimationFrame`, and rAF does not fire while the automation pane is
  hidden. Escape and the `inert` toggle are synchronous and both worked. Treat
  initial focus and focus return as unverified rather than broken.

## 2026-07-30 — clean replay proved, merged to main, Q4 gap found

- **Closed the clean-replay gap.** `supabase db reset` replayed every migration
  from an empty database through `20260728000700`. Every `NOTICE` was a benign
  `does not exist, skipping` from an idempotent `drop if exists` guard. The
  matrix then passed **69/69 twice** without another reset.
- Re-seeded accounts. Worth knowing: `seed:accounts` restores more than logins.
  It rebuilt `Philabantay · Dev Shop` (draft, 1 chair, 2 active services) and the
  barber's active employment there. It does not create operating hours, so the
  shop starts with zero open days and cannot publish until an owner adds one.
- Full gate re-run after the reset: typecheck clean, 124 fast tests, lint, API
  and web production builds, and `supabase db lint` with no schema errors.
- **Merged to `main` as a fast-forward.** `a281fb3..04af147`, 13 commits, zero
  merge commits, `main` tree hash identical to the verified branch
  (`d722a70977dc936a326c747248839f5e50288d4e`). Pre-merge checks confirmed
  `origin/main` had not diverged, no duplicate commit subjects, and no duplicate
  patch-ids. `main` was updated with `git branch -f` rather than a checkout so
  the running dev server did not churn through a five-day-old tree and back.
- Decided to stop batching. Main had been sitting five days and five packets
  behind with a cross-tenant security fix stranded on a feature branch, while
  several agents shared the workspace. From here, merge at packet boundaries and
  let `ROADMAP-STATUS.md` carry completeness, not branch topology.
- **Found an unimplemented accepted decision: Q4.** The product owner accepted on
  2026-07-22 that first publication requires a lightweight admin review of shop
  control, address, and location. `api_publish_owner_shop` in `20260726000100`
  sets `lifecycle_status = 'published'` directly, so first publication is
  self-service today. `pending_review` exists in the enum from `20260722001800`
  and is referenced in `types.ts` and `ShopSetupPage.tsx`, but nothing sets it
  and no admin shop-review route exists; the admin surface covers verifications
  only. Recorded as open item 6 in `ROADMAP-STATUS.md`. Phase 2 is not closeable
  until it is implemented or Q4 is reversed by a dated decision.
- Reviewed `OPEN-QUESTIONS.md` end to end: Q1 through Q19 are all answered, so
  no product decision is blocking. Q4 is a delivery gap, not an open question.

## 2026-07-30 — P2-06 signed off

- Added the accessibility half of the pass, at the standard P2-02..P2-05 used:
  owner `/dashboard/owner/staff` 47 visible interactive controls, 39 keyboard
  reachable, 8 disabled, **0 unreachable, 0 unlabelled**; barber `/schedule`
  41/40/1 with the same zeroes. All 14 shift-editor time inputs labelled and 14
  `:focus`/`:focus-visible` rules live.
- Reduced motion satisfied structurally rather than by emulation, and the
  structure is the stronger argument: `BarberShiftCalendar.css` and
  `DashboardPage.css` declare **zero** transitions or animations, so nothing
  needs suppressing, and `OwnerStaffPanel.css` carries a blanket
  `prefers-reduced-motion` block forcing `transition: none` and
  `scroll-behavior: auto`.
- **Corrected my own scoping error.** `ModalPortal` initial focus and focus
  return had been listed as a P2-06 blocker. No P2-06 surface imports
  `ModalPortal`: not `OwnerStaffPanel`, `BarberShiftCalendar`, `DashboardPage`,
  or `ShopOwnerDashboard`. Its users are `Layout`'s landing auth dialog,
  `CustomerDashboard`, and `AppointmentsPage`, so the check moved to the
  pre-P2-07 landing/auth slice.
- **P2-06 → ✅.** Signed off by the product owner on the strength of the
  agent-executed functional and accessibility pass, explicitly accepted in lieu
  of a personal visible-workflow review. Provenance recorded that way on purpose
  rather than implying a human walked the screens.
- Two caveats carried forward as roadmap open item 5 rather than buried: the
  human visible-workflow review and an OS-level reduced-motion check. Neither is
  known-broken; both are unobserved, and both must clear before the Phase 2 exit
  gate.
- Phase 2 now stands at P2-01 through P2-06 complete, **13 of ~39 packets
  overall**. ROADMAP-STATUS, QA-TRACEABILITY-MATRIX, PHASE-2-TESTS,
  CURRENT-STATE, and this log were updated together as the handoff rules require.
- Next: **P2-07 availability engine** (AVAIL-01, AVAIL-02, BOOK-02). Forward
  migrations only, stop before P2-08.

## 2026-07-30 — P2-06 workflow scenarios 1-4 executed and passed

Run on the product owner's request, since they were mid UI-redesign. Driven
through the real HTTP API and the real browser UI, no SQL shortcuts. Full table
in `QA-TRACEABILITY-MATRIX.md`; headline results:

- concurrent owner writes on one version: one `200`, one `409 conflict`; an
  explicitly stale `expected_version: 1` also `409`;
- barber token on `PUT /owner/staff/:id/shifts`: `403 forbidden`, and
  `/schedule` rendered **0** time inputs, so the roster really is read-only;
  both `time_off` and `different_hours` requests returned `201`;
- approval returned `200` with an `exception_id`, the barber's own
  `/shifts/exceptions/me` then held the date at `is_available: false`, and the
  revision advanced 2 → 3, with no separate shift edit;
- removing availability on a booked date **and** narrowing hours to exclude a
  10:00 booking both returned `409 schedule_has_active_bookings`: "This change
  would leave 1 active booking(s) outside the barber's availability on
  2026-08-05." A 09:00-20:00 window that still covers the booking returned
  `201`, which is the negative control proving the guard is not blanket-refusing;
- owner UI round-trip: a weekday end time changed to 20:15 in the staff panel
  and saved persisted as `20:15:00` with `schedule_version` 5.

Two false alarms worth recording so nobody re-chases them:

- **Wall-clock asymmetry is not a bug.** Reads return `HH:MM:SS` and writes
  require `HH:MM`, and `OwnerStaffPanel` seeds form state straight from the API,
  so an unchanged save looked like it must fail validation. The rendered
  `input[type="time"]` values are all clean `HH:MM` with none empty, because the
  browser normalises before React sends anything. Checked rather than assumed.
- **Sign-in was never broken.** It looked broken twice: once because
  `seed:accounts` had rotated the password out from under the printed value
  (fixed by pinning `SEED_PASSWORD`), and once because setting an input's
  `value` programmatically does not register with React, so my own harness
  submitted an empty form. Driving it properly landed on
  `/dashboard/owner/overview` with a stored session.

Local state deliberately left in place so the conflict guard stays
reproducible: the dev shop is now published with 08:00-21:00 Mon-Sat hours, a
customer booking sits on `2026-08-05` 10:00 Manila, `2026-08-05` carries an
owner exception of 09:00-20:00, and `2026-08-10` has a pending
`different_hours` request.

P2-06 stays 🔨. Only the human half is left: keyboard-only traversal with
visible focus, reduced motion on a real OS setting, `ModalPortal` initial focus
and focus return (unverified rather than broken, since it moves focus inside a
`requestAnimationFrame` that a headless pane never fires), and product judgment
on the visible workflow. An agent-run functional pass is not product sign-off,
so the packet is not being marked complete on the strength of it.

## 2026-07-30 — Q4 reversed; date stamps corrected

- **Q4 reversed by product-owner decision (D-019).** V1 shop publication is
  self-service: a verified owner publishes directly once the readiness checklist
  passes, and no admin review gates first publication. Recorded as a dated
  reversal under Q4 in `OPEN-QUESTIONS.md`, a new decision-log row, D-019 in
  `DECISIONS.md`, and a resolution note on open item 6 in `ROADMAP-STATUS.md`.
  No code changed, because the code already behaved this way; the documents were
  what disagreed.
- Reason on record: no admin staff, nothing deployed, and an unstaffed queue
  would block the project's own testing before protecting a real customer. Same
  trade as the 2026-07-24 verification simplification. `pending_review` is
  retained in the enum and shared types so re-enabling costs one lifecycle
  branch, one admin route, and one queue screen. Revisit trigger: first real
  shop publishes, or the Phase 4 staff admin console lands.
- Confirmed the guard rails that remain: the transactional publish command
  rechecks verified ownership, identity/address/pin/timezone, one
  operating-hours block, `chair_count >= 1`, and one active service, and only
  `published` shops are publicly visible.
- **Corrected date stamps.** This session crossed midnight. The first eleven
  commits were genuinely 2026-07-29 (17:26-17:39), but the dead-code sweep, hero
  retraction, clean replay, merge, and Q4 work all happened on 2026-07-30
  (12:53-13:14) and had been stamped 07-29. Fixed the headings, "corrected on"
  markers, the roadmap title, the latest-gate and latest-run headings, the QA
  matrix sign-off heading, and `CURRENT-STATE.md` frontmatter. Genuinely 07-29
  entries were left alone.
- Answered an infrastructure question with evidence rather than assumption:
  **there is no Redis anywhere in this project**, and none is planned. Rate
  limiting is `express-rate-limit` ^7.5.1 in `apps/api/src/app.ts` with four
  limiters on the default per-process MemoryStore. The security-critical
  throttle is not in memory at all: `employment_join_attempts` is a Postgres
  table, so join-code brute-force protection is already correct across
  instances and across restarts. Combined with the documented outbox pattern in
  Phases 3-5, the architecture already treats Postgres as the coordination
  substrate, so Redis may never be needed. Two real gaps to carry into Phase 5:
  `app.set('trust proxy', ...)` is described in a code comment but not set, and
  the MemoryStore limiters would multiply if the API ever runs more than one
  instance.

## 2026-07-30 — Premium Studio redesign preservation handoff

- Added `plans/UI-PROFESSIONAL-REDESIGN-HANDOFF.md` as the independent reviewer
  contract for the approved Style C signed-in workspace redesign.
- Recorded the non-removal inventory for customer, barber, owner, shared
  messaging/settings, Shop Setup, hiring, schedule authority, and owner-provider
  workflows; no application code or packet status changed in this review.
- Defined the saved doodle avatar as the user's profile picture in the header,
  drawer, settings, customer home, and participant surfaces where a returned
  public profile supplies it. The complete premade/custom creator remains.
- Flagged four prototype mismatches: global navigation must remain the hamburger
  drawer; next availability/live capacity may not be invented before P2-07;
  Start service/Add walk-in wait for Phase 3 contracts; and avatar gear
  eligibility is currently UI-derived despite comments implying backend
  enforcement.
- The first visual implementation pass can proceed under the documented
  assumptions. Product/backend answers are needed only before expanding avatar
  rewards or information architecture.

## 2026-07-30 — Premium Studio signed-in redesign implementation

- Implemented the selected Style C direction across customer discovery,
  bookings, messages, settings/avatar, barber Today's Chair/schedule/profile,
  and owner overview/reservations/staff/hiring/shop setup.
- Corrected the first dark-heavy pass: content and work surfaces are light
  warm neutrals, with charcoal restricted to global navigation and the route
  curtain. Signed-in pages explicitly use `color-scheme: light`.
- Preserved every route and feature contract. The saved allowlisted doodle
  avatar is now the accessible profile-picture link to `/settings/avatar` and
  is reused in barber/owner dashboard identity chips.
- Fixed the reviewer-reported `barberAvatarId` prop-drilling error and loaded
  the barber dashboard successfully afterward.
- Browser evidence: zero horizontal overflow at the 1440, 390, and 320 width
  gates; ModalPortal initial focus and Escape return work; the Rive character
  blinks and tracks the cursor; reduced-motion emulation hides the Rive canvas
  and keeps its static fallback visible.
- Verification passed: typecheck, lint, production build, 124 fast tests with
  41 expected integration skips, and diff validation.

## 2026-07-30 — Auth and section motion polish

- Unified successful sign-in, sign-up, sign-out, and drawer section navigation
  under one curtain transaction. Auth/session mutations now occur only after
  the curtain closes, and failed auth reopens to the same form.
- Added one keyed route-stage entrance using transform and opacity only.
  Reduced motion bypasses curtain work and disables the route animation.
- Shortened the visual handoff to 420 ms close, a 90 ms paint hold, and 420 ms
  open. The curtain blocks interactions for the full handoff and stays above
  the portalled auth dialog without changing global layer tokens.
- Restored the signed-in Gochi Hand wordmark on a small paper label, removed
  the oversized customer-home avatar, and removed the drawer context-shortcut
  card. The actual header/settings avatar and full creator remain.
- Browser verification covered customer sign-in, owner sign-out, an owner
  section change, clean reload, reduced motion, and 1440/390/320 widths.
  Performance sampling across a section transition measured about 5 ms layout,
  20 ms style recalculation, and 288 ms total task time across the complete
  multi-second observation window; the clean reload logged zero warnings or
  errors.
- Full gate passed: typecheck, lint, production build, 124 fast tests, 41
  expected integration skips, and diff validation.

## 2026-07-30 — Dedicated login and signup redesign

- Read and accepted Claude's shared-index incident report before taking the
  high-conflict auth files. The unpushed integrated commit was left intact and
  the unrelated dirty `LandingPage.css` remained untouched.
- Replaced the dark two-column auth story with one centered white form card on
  a warm cream canvas. The header keeps the Gochi Hand paper-label wordmark;
  headings and form controls use a professional sans-serif hierarchy.
- Kept only two restrained coral/yellow organic shapes and three small pastel
  role accents. The public auth shell explicitly uses `color-scheme: light`,
  clips decorative overflow, and removes the wallpaper from the settled page.
- Preserved the single `/login` and `/signup` architecture, sanitized `from`
  return state, validation/focus behavior, password visibility, role
  onboarding, professional verification note, and curtain auth transaction.
- Browser checks confirmed the dark story is absent, the desktop viewport has
  zero horizontal overflow, empty sign-up creates four alerts and focuses the
  first invalid field, password visibility toggles, and invalid login safely
  returns to `/login` with the backend error. Runtime logs had no errors.
- Full gate passed: all workspaces typechecked, lint and production build
  passed, and 124 fast tests passed with 41 expected integration skips.

## 2026-07-30 — Auth header micro-adjustment

- Removed the decorative Secure access label from both dedicated auth pages.
- Moved Back to home from the page body into the upper-left auth header while
  retaining the centered handwritten wordmark and right-side mode action.
- Browser checks on `/login` and `/signup` confirmed one header back link, no
  body duplicate, zero horizontal overflow, and no runtime warnings/errors.

## 2026-07-30 — Dedicated auth header removed

- Product follow-up superseded the preceding header placement. The entire
  login/signup header band, centered wordmark, and right-side mode action are
  now hidden on dedicated auth routes.
- Back to home is the only navigation above the auth introduction; sign-in and
  sign-up switching remains inside the form card.
- Browser checks confirmed the app header is not visible on either route,
  exactly one Back to home link remains, horizontal overflow is zero, and
  runtime logs have no warnings/errors.

## 2026-07-30 — Auth forms fit short desktop viewports

- Reduced only vertical gaps, panel padding, and short-viewport typography;
  field controls remain at least 46px high.
- At desktop heights up to 900px, the decorative role strip and verification
  footnote are hidden so the forms—not secondary copy—receive the viewport.
- Browser measurement at `1280x720` showed `scrollHeight = innerHeight = 720`
  for login and signup. Login card ended near 546px and signup near 705px, with
  zero horizontal overflow and no runtime warnings/errors.
- Mobile behavior is unchanged and retains natural scrolling where the longer
  signup form cannot honestly fit without shrinking usable controls.

## 2026-07-30 — Auth card wordmark, dots, and action order

- Replaced the compact SIGN IN / CREATE ACCOUNT kicker with the Philabantay
  barber-pole logo and Gochi Hand wordmark inside both form cards.
- Moved Create account below Log in as an outlined secondary button; signup
  mirrors the hierarchy with Log in instead below Continue to account type.
  Both links retain the sanitized protected-route `from` state.
- Added two CSS-only orange dot clusters around each card without adding image
  requests, scripts, or layout-affecting elements.
- Per product-owner direction, no browser smoke ran. Automated verification
  passed: all workspaces typechecked, lint and production build passed, and 124
  fast tests passed with 41 expected integration skips.

## 2026-07-30 — Auth decoration corrected to large patches

- Product-owner clarification replaced the small orange dot grids with seven
  large, soft orange gradient patches distributed across the full auth-page
  width, plus the two existing organic card-adjacent blobs.
- The decoration remains CSS-only, non-interactive, behind the content, and
  does not add image requests or layout elements. Web typecheck, 40 web tests,
  root lint, production build, and diff validation passed; visual smoke remains
  with the product owner.

## 2026-07-30 — Auth card wordmark emphasized

- Removed the redundant in-card Log in heading shown in the product-owner
  screenshot while retaining the primary Log in submit control.
- Increased the Philabantay Gochi Hand wordmark from 22px to 34px and scaled
  the barber pole with it; short desktop viewports use a 30px wordmark.
- Signup retains its useful Your details heading and all auth behavior is
  unchanged.
- Web typecheck, 40 web tests, root lint, production build, and diff validation
  passed; no browser smoke ran.

## 2026-07-30 — Auth cards widened for desktop fit

- Increased the centered login card maximum from 570px to 720px and signup from
  720px to 940px, with the auth-page canvas widened to 1120px.
- Grouped signup email and phone into a two-column desktop row, reducing form
  height without shrinking fields. At 720px and below the group returns to one
  column, preserving the mobile flow.
- Authentication, validation, field semantics, and action order are unchanged.
- Web typecheck, 40 web tests, root lint, production build, and diff validation
  passed; no browser smoke ran.

## 2026-07-30 — Approved compact auth wireframe implemented

- Applied the approved reference format to login: a centered 460px desktop
  card, large Philabantay wordmark, stacked existing fields, one primary Log in
  action, and an inline “New here? Create account” row.
- Signup mirrors the inline account-switch treatment with “Already have an
  account? Log in” while retaining its existing fields and validation.
- Removed “Your role, messages, and bookings stay connected to this account.”
  from the login card. No auth contracts or routing behavior changed.
- Web typecheck, 40 web tests, root lint, production build, and diff validation
  passed; no browser smoke ran.

## 2026-07-30 — Login card vertically extended

- Kept the approved 460px desktop width and extended the login panel to a
  responsive 500–600px minimum on tall desktops, matching the product-owner
  markup.
- Centered the existing wordmark, fields, Log in action, and inline account
  switch as one balanced content group instead of leaving unused space at the
  bottom.
- Desktop viewports at or below 900px use a responsive 400–500px minimum and
  tighter spacing; mobile and signup layouts are unchanged.
- Web typecheck, 40 web tests, root lint, production build, and diff validation
  passed; no browser smoke ran.
