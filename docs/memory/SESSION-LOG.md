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

## 2026-07-30 — Auth-page text remnants removed

- Removed the complete login/signup intro copy, including both eyebrow labels,
  the large welcome/setup headings, and their supporting summaries.
- Removed the “One account for” customer/barber/shop-owner strip and the
  professional-tools verification footnote from both modes.
- Deleted all CSS selectors and responsive overrides that existed only for
  those blocks. Replaced the removed `auth-page-title` ARIA reference with an
  explicit Log in/Create account section label.
- Source search found no requested text, selector, or ARIA remnants. Web
  typecheck, 40 web tests, root lint, production build, and diff validation
  passed; no browser smoke ran.

## 2026-07-30 — Auth cards centered from browser measurements

- At `1280×720`, browser measurements found both cards horizontally centered
  but starting at `y=52`; calculated vertical-center targets were approximately
  `y=158` for login and `y=134` for signup.
- Desktop auth now uses a symmetric full-available-height centering grid.
  Back to home is absolutely pinned at the auth canvas's top-left so it does
  not influence card placement. Mobile retains its natural document flow.
- Browser remeasurement at `1280×720` placed login/signup at `y=158.4/134.2`;
  both centers were exactly `360px`, with zero page overflow.
- At the product screenshot's `1918×927` dimensions, both modes centered at
  `x=959.2`, `y=463.6` against viewport midpoints `959/463.5`, again with zero
  overflow. Console output contained only API-unreachable errors because the
  local API was offline.
- Web typecheck, 40 web tests, root lint, production build, and diff validation
  passed.

## 2026-07-30 — Password visibility control changed to icons

- Replaced visible Show/Hide text on login and signup with eye/eye-off SVG
  icons, without adding an icon dependency.
- Retained the native button, dynamic Show password / Hide password accessible
  label, focus treatment, and existing password visibility behavior.
- Web typecheck, 40 web tests, root lint, production build, and diff validation
  passed.

## 2026-07-30 — Final auth release verification before P2-07

- Audited the dedicated login/signup surface, route guards, safe internal
  redirects, auth context, API adapter, curtain transaction, Express auth
  routes, and authorization middleware.
- Corrected the login field to native email semantics because the shared and
  Express contracts do not support phone sign-in. Removed the remaining signup
  role-selection note from the approved minimal card.
- All-workspace typecheck, lint, production build, and the 124-test fast gate
  passed. The live local Supabase/API matrix passed 69/69 twice consecutively
  without another reset.
- Live browser verification covered invalid-login recovery, successful seeded
  login back to the original protected URL, sign-out and protected-route
  re-lock, signup first-error focus, eye-icon toggles, exact 1280×720 centering,
  zero overflow, forced light color scheme, and a console with zero warnings or
  errors.
- No packet count changed. P2-07 remains the exact next implementation packet.

## 2026-07-30 — Onboarding global header removed

- Updated the shared layout so `/onboarding/role` does not render the global
  signed-in wordmark, profile avatar, or hamburger. All other signed-in routes
  keep the existing header.
- Browser verification found zero onboarding headers/banners, one header after
  returning to `/dashboard`, zero horizontal overflow at 1280×720, and no
  console warnings or errors.
- Web typecheck, 40 web tests, root lint, production build, and diff validation
  passed. Auth guards, role submission, redirect state, and P2-07 contracts did
  not change.

## 2026-07-30 — Settings sign-out destination aligned

- Fixed the Security settings sign-out handler to use the same landing-first
  curtain transaction as the drawer. It now replaces the current route with
  `/` before clearing the session, preventing `RequireAuth` from winning the
  race to `/login`.
- Browser verification landed on the public main page, observed the curtain
  back at idle, then confirmed the cleared session by revisiting Settings and
  receiving the expected login guard. The console had no warnings or errors.
- Web typecheck, 40 web tests, root lint, production build, and diff validation
  passed. Claude's in-progress P2-07 migration was not read, edited, staged, or
  committed.

## 2026-07-30 — Verification sign-out race fixed

- Reproduced the reported failure with a verification-locked Barber:
  navigating Home before clearing the session let `Layout` redirect the still
  authenticated user back through `/verification`, after which the auth guard
  committed `/login`.
- Centralized all three sign-out surfaces on `useSignOutToHome`. Behind the
  closed curtain it marks a one-time Home route intent, which is the only
  exception to the verification lock, and then clears the local session. The
  marker is consumed immediately afterward so it cannot survive a later login.
- Exact browser verification passed twice from `/verification` to `/`; the
  landing page was visible and the curtain returned to `idle`. Revisiting
  `/verification` then produced `/login`, confirming that the session was
  cleared without making ordinary protected routes accessible.
- The synthetic auth account used for the reproduction was removed with the
  admin soft-delete path. Its immutable verification audit remains by design.
- Web typecheck, all 40 web tests, production build, and diff validation
  passed. Claude's P2-07 API/shared/migration work was untouched.

## 2026-07-30 — Claude — P2-07 availability engine implemented

Started P2-07 after Codex handed the tree back. Before writing anything, measured
what the existing claim gate actually enforced instead of trusting the packet
description.

**Two live bypasses found and reproduced through the real HTTP API**, both
returning `201 Created`:

1. a customer booked a barber at a shop in `draft`, while the public catalogue
   correctly refused to list that same shop;
2. a customer booked a date the owner had marked as a full-day closure.

`private.require_bookable_appointment_slot` from `20260722000600` was the
authoritative gate and contained **zero** references to `lifecycle_status`,
`shop_operating_hours`, `shop_closures`, `service_qualifications`,
`owner_provider_profiles`, `chair_count`, `default_buffer_min`, or
`booking_mode`. Five of the ten inputs the phase contract lists were missing,
plus the whole BOOK-02 assignment model and the chair half of AVAIL-02.

Five forward migrations, `20260730000100` through `20260730000500`:

- schema for the booking window, per-service buffer, assignment intent, and a
  qualification backfill so requiring qualification could not make an existing
  provider unbookable;
- the rebuilt gate: publication, shop timezone (no longer hardcoded Manila),
  lead/advance window, opening hours, date closures and replacement hours,
  qualification, buffer-aware provider gap, and chair capacity as peak
  concurrency under a new shop-scoped advisory lock;
- grant-on-hire so a new barber is not silently unbookable (D-024);
- the slot projection and exact/preferred/any assignment, both answering by
  calling the same gate rather than reimplementing it (D-022);
- the read-only quote behind `POST /bookings/quote`.

Express gained `GET /availability`, `POST /bookings/quote`, five new error codes,
and the booking window on the owner and public shop contracts. The old Express
slot math is gone: `publicSlots` now defers to the engine, so an offered slot is
a claimable slot.

**Two regressions I introduced were caught by the existing suite, not by me.**
Reproducing the reschedule and reassign command bodies to change one lock call, I
dropped their immutable `appointment_events` inserts and replaced the shared
`require_appointment_reason` validator with an inline copy. The timeline
assertion failed and both are restored verbatim. Worth remembering: when a
forward migration has to restate an existing function, diff the whole body rather
than the part being changed.

Three pre-existing test-integrity problems surfaced because P2-07 made
qualification load-bearing:

- the P2-05 qualification race test ends on a nondeterministic winner and could
  leave the fixture barber revoked, which was invisible while nothing read
  qualifications. It now normalises the shared fixture at the end;
- tests that mint a service mid-run must qualify a provider for it, exactly as a
  real owner would. Added a `qualifyProvider` helper;
- the lifecycle test books "a few minutes from now" and was unbookable for the
  last half hour before midnight, because a shift exception cannot cover a
  window crossing local midnight. It now uses a five-minute service, which
  satisfies both that and check-in's 30-minute window at every hour. Pre-existing
  and independent of P2-07.

`seed-local-accounts.ts` now creates shop operating hours. Without them the
seeded environment signs in fine and then refuses every slot, which reads as a
bug rather than as missing setup.

Verified on a database replayed from empty through all 47 migrations:

```text
typecheck   all workspaces passed
lint        passed
build       API + web production build passed
fast tests  124 (shared 56, api 28, web 40)
matrix      77/77 twice back to back, no reset between runs
DB lint     no schema errors
diff        git diff --check clean
```

The matrix gained 8 gated regressions: publication refusal with a positive
control, closures and replacement hours, qualification revoke/restore,
lead/advance bounds, the cleanup buffer, chair capacity across two providers with
a two-chair control and a concurrent race, projection-equals-claim, and
exact/preferred/any intent.

Also ran two live end-to-end suites through the real API against the seeded
stack: 14/14 and 16/16, both restoring the dev shop to `draft` afterwards. The
matrix then passed 77/77 twice again with zero published shops left behind, so no
fixture pollution this time.

**One required input is not implemented and P2-07 is not complete without it.**
Input 4 is "active employment *or owner provider capability*", and an owner
cannot be booked at all: `appointments.barber_id` references `barbers(id)`, and
P2-05 deliberately modelled owner-as-provider without a `barbers` row. Closing it
means either giving owners a `barbers` row — which duplicates
`accepting_bookings` and `rating`, the exact fields P2-05 separated — or
introducing a real provider seam across roughly thirteen foreign keys. That is an
architecture decision, not an implementation detail, so it is raised as an open
question rather than guessed. Everything else in AVAIL-01, AVAIL-02, and BOOK-02
is implemented and verified.

## 2026-07-30 — Claude — P2-07 self-review before sign-off, three defects fixed

Pre-push adversarial review of my own P2-07 work. Re-running the green suite
would have proved nothing, so this was a read of the SQL looking for what the
tests did not cover. Three real defects, none of which any existing test caught.

**1. Automatic assignment was not actually ordered (logic error).** Both the
create command and the quote built their candidate list as a `UNION ALL` of the
requested provider and `private.ordered_shop_providers(...)`, then sorted with
`order by ranked.priority`. That function sorts internally, but the ordering does
not survive a UNION ALL, and ordering by priority alone leaves every fallback
candidate tied. Postgres happened to return them usefully on this data, which is
precisely why the tests passed. Two BOOK-02 requirements were therefore
unenforced: `any` could pick an arbitrary free provider rather than the one with
the fewest assigned minutes, and the tie-break exists specifically "so retries
agree", which it could not guarantee. Fixed in `20260730000600` by carrying the
rank out of the function as a value and ordering by `(priority, ordinal)`.

Balanced assignment had **no test at all** — the existing assertion only checked
that *some* eligible provider was chosen, which passes under any ordering. The
new regression pins the eligible set to exactly two providers by qualifying only
those two for a purpose-built service, so it stays deterministic however large
the shop roster grows. It was falsified before being trusted: inverting the
ordering in the live database made it fail, and restoring the fix made it pass.

**2. An unrecognised shop timezone took the whole shop down (regression I
introduced).** `20260730000200` correctly made the engine evaluate wall-clock
rules in the shop's own timezone instead of a hardcoded Asia/Manila, but nothing
has ever validated that column beyond a length check, so `'Manila/NotAZone'` was
always storable. Previously inert; now every booking, quote, and slot query runs
`at time zone shop.timezone` and raises `time zone "..." not recognized`, which
surfaces as a 500 and makes the shop unbookable with no actionable message.
`20260730000700` adds a `shops` trigger validating against `pg_timezone_names`,
plus a repair pass for anything already stored. It is a trigger rather than
Express validation because service-role writes bypass Express, and not a CHECK
constraint because recognising a zone is not immutable.

**3. Quote and claim disagreed about why (contract drift).** When no provider
could take an `any`/`preferred` slot, the claim reported `P4033`
(`no_provider_available`) but the quote reported the last candidate's own reason,
typically `slot_taken`. That is exactly the quote/claim drift the one-gate design
exists to prevent, just in the reason string rather than the verdict. Fixed and
verified live: both now say `no_provider_available`.

Two smaller hardening items in the same pass:

- `POST /bookings/quote` returned PostgREST's one-row array, so callers had to
  read index zero for what is a single answer. Now unwrapped to an object.
- the new `GET /availability` and `POST /bookings/quote` were only under the
  120/min general limiter. The anonymous slot route has a 60/min limiter
  precisely because slot computation is expensive, and P2-07 made it far more
  expensive — one subtransaction and a full gate evaluation per candidate. Both
  now carry the same slot limiter, so one signed-in account cannot amplify a
  click into thousands of gate evaluations.
- `private.slot_is_bookable` swallowed `42501` alongside the gate's own refusals.
  Nothing in the gate raises it, so the only source would be a genuine grant or
  RLS fault, and turning that into a quietly empty day would hide the fault
  behind a plausible answer. It now propagates.

Gate after the fixes, on a database replayed from empty through all 49
migrations: typecheck, lint, API and web production builds, 124 fast tests,
**matrix 79/79 twice back to back with no reset**, DB lint no schema errors.
Live suites re-run: 17/17 projection and quote, 14/14 scenarios, 3/3 quote-claim
agreement, zero published shops left behind afterwards.

Q20 is unchanged and still blocks marking P2-07 complete.

## 2026-07-30 — Claude — Q20 answered, P2-07 complete

The product owner chose the shadow-row seam (Option A) and asked for the publish
guard. Both are implemented, verified, and P2-07 is now ✅.

Before presenting the options I measured what deferring would actually cost, and
it changed the recommendation I had written. A shop whose only provider is its
owner — a common Philippine barbershop — could publish, appear in the public
catalogue, and then refuse every customer: availability returned `200` with zero
slots and a booking returned `409 no_provider_available`. Booking the owner by
name returned `400 "not verified, active at this shop, or accepting bookings."`
The engine could not see the capability at all: `owner_provider_profiles`
appeared **zero times** across the seven P2-07 migrations, so switching it on in
Shop Setup changed nothing. That made Q20 a live product hole rather than an
architecture nicety.

Scope measured rather than estimated: 13 tables and 14 foreign keys reference
`barbers(id)`, and the public barber query filters `users.role = 'barber'`, so an
owner with a shadow row does not leak into the barber catalogue.

`20260730000800` and `00900` implement it. The one-way mirror is what answers
D-009's duplicate-state objection: `owner_provider_profiles` stays the only place
the value is authored and nothing writes the shadow. An owner has no roster, so
their working window is the shop's own opening hours and the fifteen-minute grid
anchors to opening time instead of a shift start.

Three pre-existing guards had to learn about owner-providers, and each was found
by running the tests rather than by reading:

- the appointment assignment lock refused with `23514 The assigned barber is not
  actively verified at this shop`;
- the `barbers` capability-enablement lock refused with `42501 A current verified
  employment is required` — correct for a barber, impossible for an owner;
- the lifecycle predicate gates insert, start/finish, and check-in codes.

All three were extended, never weakened, each re-deriving ownership from `shops`
rather than trusting the capability row. Deliberately **not** widened:
`private.is_active_barber_for_shop`, which has ~25 call sites, mostly RLS on
attendance, shift tables, staff notes, and messages. Making it true for an owner
would hand them employee-shaped access where "staff member" is the intended
meaning, so a separate predicate was introduced for "may perform the service".

One inconsistency caught in my own new code before it shipped: the predicate
required `accepting_bookings` for owners but not for barbers, which would have
stopped an owner finishing a visit after pausing new bookings. The claim gate
tests that toggle separately; the predicate now means "may perform" for both.

`20260730001000` adds the publish readiness check (D-029). It ignores the
momentary `accepting_bookings` toggle on purpose, so a shop is not blocked from
publishing merely because its barber is on a break, and it is checked at publish
only — unpublishing behind an owner's back when their last barber leaves would be
worse than letting them see and fix it.

Two long function bodies had to be restated to swap one predicate call. Rather
than retype them — which is exactly how the reschedule and reassign audit events
got dropped earlier today — they were extracted with `pg_get_functiondef`, patched
programmatically with an assertion that exactly one call site matched, and
embedded verbatim.

Gate on a database replayed from empty through all 52 migrations: typecheck,
lint, both production builds, 124 fast tests, **matrix 81/81 twice back to back
with no reset**, DB lint no schema errors. Live: booking the owner by name
returned `201`; the same request on a Sunday returned `409 outside_shop_hours`
for a Mon-Sat shop, which is the window working as intended; and the owner
accepted, checked in, and started the visit.

Phase 2 now has one packet left: **P2-08 race gate**.

## 2026-07-30 — Claude — P2-07 browser smoke: one UX defect found and fixed

Final gate before P2-08, plus a real browser pass. Two things came out of it that
no API test could have.

**1. A publish refusal told the owner the wrong thing (fixed).** Clicking Publish
on a shop with nobody bookable correctly returned `409`, and the server message
was exactly right:

> Add someone who can take bookings before publishing: employ a barber, or switch
> on your own provider capability, and qualify them for an active service.

What Shop Setup actually displayed was:

> Nabago ang shop mula sa ibang session. Ni-reload namin ang pinakabagong bersyon.

The owner was told to reload, for a problem no reload can fix — an infinite loop
with the real reason never shown. Cause: `P4020` ("this changed since you loaded
it") and `P4021` ("a precondition is not met") both mapped to `409 conflict`, and
every client treats `conflict` as reload-and-retry. `P4021` now maps to
`precondition_failed`. Shop Setup's existing `else` branch already renders the
server message, so no frontend change was needed, and re-testing in the browser
showed the real sentence in a live region.

This is pre-existing, not something P2-07 introduced: the other two `P4021` sites
— closing every operating day and retiring the last active service — have been
showing the same wrong message all along. The new publish guard just made it far
more likely to be hit. Three test assertions updated to pin the distinction.

**2. The customer UI genuinely has no slot picker, now proven rather than
asserted.** Network capture over a full customer session shows the calls made:
`catalog/shops`, `catalog/barbers`, `catalog/barbers/available`,
`catalog/services`, `bookings`, `conversations`, `favorites/shops`. It never calls
`/availability`, `/bookings/quote`, or even the legacy
`/catalog/availability/slots`. The shop card shows live walk-in status —
"Busy — puno ang chairs", "0 free now" — which is a Phase 3 concept, not P2-07's
future-slot availability. So the engine is complete and honest, and nothing yet
surfaces it to a customer. That remains the frontend lane's customer-detail item.

Also confirmed in-browser: the readiness checklist does not include the new
bookable-provider requirement, so the owner meets it only as a submit-time error.
Flagged for Codex.

**Correction (same day):** this entry originally said the checklist lists "seven
items". It lists **eight** — shop name, street address, city, map location,
timezone, one chair, one open day, one active service. Codex counted the rows in
`ShopSetupPage.tsx` and the checks in `shopPublicationReadiness`, and was right. I
had counted from scraped page text and miscounted. The substance of the finding
stands: none of the eight is a bookable-provider check.

Browser evidence, owner and customer, signed in against the live local stack:

- publish succeeded through the UI and the status flipped to "Published (live in
  discovery)", version 2, with the button becoming Unpublish;
- the newly published shop and its barber appeared in customer discovery;
- publish refused with the correct reason once the last qualification was
  revoked, and succeeded again once restored;
- zero console errors across the whole session;
- no horizontal overflow at 375x812;
- the dev shop was returned to `draft` and the matrix then passed 81/81 twice
  with zero published shops left behind.

Gate: clean replay through all 52 migrations, typecheck, lint, both production
builds, 124 fast tests, matrix 81/81 twice, DB lint clean.

P2-07 stays ✅. Next is P2-08.

## 2026-08-01 - Shop Setup bookable-provider readiness parity

Closed the D-029 frontend gap Claude found in browser smoke. The shared
publication-readiness count now includes `bookableProviders`, derived by a pure
helper from saved eligible providers whose active qualifications intersect an
active service. `accepting_bookings` remains deliberately ignored. Shop Setup
loads the existing owner qualification workspace, renders a ninth "At least one
bookable provider" row with corrective guidance, and keeps Publish disabled
until the row passes; the database RPC remains authoritative at submission.

Verification: focused shared test 10/10; affected shared and web typechecks
passed; full fast suite 127 passed (shared 59, API 28 with 53 gated skips, web
40); lint and API/web production builds passed. Browser smoke was attempted,
but the in-app browser blocked localhost after an initial connection-refused
page, so no visual result is claimed. No database/API changes and no local
Supabase matrix rerun.

## 2026-08-01 — Claude — reviewed Codex's readiness work; found the bug it exposed

Codex's checklist row is correct and verified in the browser: it renders with a
hint, shows `is-todo` while nothing is bookable, disables Publish in that state,
and both flip back when a provider returns. Zero console errors, no overflow.
Their `countBookableProviders` matches the SQL guard's shape, and making
`bookableProviders` required forced every call site to be updated rather than
defaulting to a silent zero.

**Their change exposed a backend bug of mine that made the new row lie.**
`countBookableProviders` trusts `provider.eligible`, and that field was hardcoded
`true` for every barber in `apps/api/src/routes/qualifications.ts`. Its own type
comment says eligibility is "derived from owner capability or active employment",
and the query behind it filtered only `barber_employment.status = 'active'` — no
`ended_at`, no `hired_at`, no role, no verification — while the booking gate and
the publish guard use `private.is_active_barber_for_shop`, which requires all of
them.

A suspended barber therefore still counted. Reproduced live before the fix:

```text
verified barber   → checklist 1 bookable, publish 200   agree
suspended barber  → checklist 1 bookable, publish 409   DISAGREE
```

The owner saw a complete checklist and a Publish button that failed every press —
exactly what the row was added to prevent, narrowed to suspended staff. P1-02
suspension leaves employment active, so it is reachable. `eligible` now mirrors
`is_active_barber_for_shop` for barbers, and the extra profile columns are read
for that rule alone rather than widened into the `profile` projection.

Two follow-ups recorded rather than done here. `OwnerStaffPanel` renders
`eligible ? 'Eligible' : 'Capability off'`, and "Capability off" is now reachable
for a barber where the words are wrong — that is frontend copy. And the
"How publishing works" paragraph still lists only details, hours, and a service.

**Anti-drift test added.** The readiness rule now exists twice, in TypeScript for
the checklist and in SQL for enforcement, which is the shape this packet spent its
time removing everywhere else. The matrix now asserts the two give the same answer
in both directions, suspending every employed barber so a leftover provider cannot
make it vacuous. Falsified before being trusted: restoring `eligible: true` makes
it fail.

**Docstring corrected.** `shopPublicationReadiness` claimed it was "shared by the
owner UI and the backend (to enforce it before flipping to published)". Nothing in
`apps/api` has ever imported it; `api_publish_owner_shop` is the authority. That
false claim is why the drift went unnoticed, and Codex had finished, so I took it.
It now says plainly that this is a preview kept in step by hand, and points at the
test that pins the two together.

Gate on a database replayed from empty through all 53 migrations: typecheck, lint,
both production builds, 129 fast tests (shared 61, api 28, web 40), **matrix 82/82
twice back to back with no reset**, DB lint clean, `git diff --check` clean.
Browser re-verified after the fix.

## 2026-08-01 — Claude — landing trimmed to the hero, full-repo sweep, one live authorization bug

Two jobs in one turn: the product owner's landing-page cut, and a whole-repo
regression sweep before P2-08.

**Landing page reduced to the hero (D-031).** `#how`, `#services`, `#contact`,
and the footer are gone, with the header nav's Services/Contact Us links and the
hero's "Watch the Video" button removed in the same pass because each pointed at
an anchor that no longer exists. `LandingPage.tsx` 729 → 179 lines. Verified in
the browser: one `section[id]` left, no footer, `deadAnchors` empty, no
horizontal overflow at 1280 or 375.

**2625 lines of dead CSS removed, and proven inert before removing it.**
`LandingPage.css` targeted 228 classes; 173 were unreachable, but only 41 of
those were killed by today's edit — **132 were already dead before it**, going
back to the redesign (`phil-auth-mock`, `phil-billboard`, `phil-pile-*`,
`phil-space-*`). Deleted with a brace-matching parser that drops a rule only when
every class in its selector appears nowhere in any source file. The risk this
repo actually has is dynamic class names, since `is-${status}` is used in about
thirty places, so the pruner listed every deleted selector not anchored to a
`.phil-` class: three, all `badge-*`, all with zero references anywhere.
Falsified rather than eyeballed: computed styles for 27 rendered elements across
26 properties each were captured before and after, **0 differences**. The first
attempt showed 55 differences that turned out to be webfont loading, so the
comparison was redone with `await document.fonts.ready` on both sides.

**Live bug found and fixed: an owner-provider was locked out of their own
booking.** `requireParticipantOrOwner` in the bookings router tested
`appointment.barber_id === userId` *before* the shop-owner branch, and that
branch ends in `requireActiveEmployment`, which hard-requires the `barber` role.
So for an owner running a visit at their own shop the guard answered "you are the
barber on this booking" and then refused them for not being a barber. Reproduced
over HTTP: `GET /bookings/:id/timeline` returned
`403 {"code":"forbidden","message":"This action requires one of these roles: barber."}`.
Cancel goes through the same helper. Q20 taught `requireAssignedProvider` about
owner-providers and stopped there, so the owner could start and finish a visit
but could not read its timeline or cancel it.

Why no test caught it: **every existing owner-provider test calls the RPC
directly**, so the Express guards were never on the path. The matrix now drives
the timeline over HTTP. Falsified in both directions — fails with 403 before the
fix, passes after.

The same shape existed in `requireConversationAccess`. Fixed for consistency, but
recorded honestly as **not currently reachable**: `chat.ts` only ever sets
`conversations.barber_id` from a `barber_employment` row, and an owner has none.

**Documentation rot corrected.** `CODE-PATTERNS.md` and `ARCHITECTURE.md` are two
of the seven files `CLAUDE.md` orders every agent to read before changing code,
and both still described the localStorage `MockBackend` as live — deleted
2026-07-24. `ARCHITECTURE.md` documented a "~1,500-line" mock, a
`bsh_mock_db_v1` localStorage blob, `BroadcastChannel` realtime, and a backend
*choice* in `backend.tsx`. Both now match the code; the mock narrative is kept
but clearly labelled history, and a full `ARCHITECTURE.md` rewrite is still owed.

**Two deploy-time landmines recorded, neither fixable from here.**
`public/_headers` hardcodes `connect-src 'self'` while `vite.config.ts` derives
it from `VITE_API_BASE_URL`/`VITE_STORAGE_ORIGIN`, so dev and `vite preview` pass
while production would CSP-block every API call and every signed photo, with
nothing failing first to warn anyone. A loud comment now sits in the file. And
`app.set('trust proxy')` is still unset, so behind a proxy the rate limiter keys
every request to the proxy's IP.

**`npm run lint` proves nothing.** There is no ESLint anywhere in this repo. Root
`lint` fans out `--if-present`; only `apps/api` has the script and it is
`tsc --noEmit`, identical to its own `typecheck`. `apps/web` is never linted.
Recorded in the definition of done rather than silently relied on again.

**Frontend has no automated tests at all.** 62 files and 11,743 lines of React,
covered by three test files that all exercise pure helpers. No
`@testing-library/react`, no jsdom. The API's 82-case matrix has no counterpart
on the web side, so every UI regression is caught only by a manual browser pass.
Flagged for the product owner, not fixed here.

Checked and found clean, so the sweep is not all bad news: all **152** live SQL
functions pin `search_path`; every SQLSTATE the migrations raise is handled in
`errors.ts` (the earlier gap was my audit regex, not the code); the shared
`API_ERROR_CODES` allowlist and the `DataErrorCode` union agree; no `.env` is
tracked; the one-shop-per-owner and one-active-employment-per-barber indexes make
the bare `.maybeSingle()` calls in the authorization helpers safe.

Gate on a database replayed from empty through all 53 migrations: DB lint clean,
typecheck clean, both production builds clean, 129 fast tests (shared 61, api 28,
web 40), **matrix 82/82 twice back to back with no reset**, `git diff --check`
clean, browser re-verified at 1280 and 375 with no console errors.

## 2026-08-01 — Claude — `npm run lint` is now a real linter

Picked this off the sweep list first because it was the only finding that made us
believe something false. Every "lint clean" line above this entry means
`tsc --noEmit` over `apps/api`, which `npm run typecheck` already did, and
`apps/web` was never linted at all.

ESLint 9 flat config at the repo root (`eslint.config.mjs`) covering all three
workspaces, with `typescript-eslint` recommended and `eslint-plugin-react-hooks`
on `apps/web`. Root `lint` is now `eslint . --max-warnings 0`, so warnings fail
it. The misleading `lint` script on `apps/api` is deleted, leaving one entry
point. Note `@eslint/js` must be pinned to `^9`; unpinned it resolves to 10 and
the peer range conflicts with eslint 9.

**Eleven findings on the whole repo, which is a good result for 21,699 lines**
(web 11,690 + api 5,090 + shared 4,919, plus tests and scripts). All
resolved, none by blanket suppression:

- Three empty marker interfaces in `packages/shared/src/types.ts` converted to
  type aliases (`BarberWithProfile`, `Service`, `OwnerService`).
- `DoodleDefs` kept a `KNOWN` array used only to derive a type; it is now the
  type union directly.
- `lib/security.ts` was flagged by `no-control-regex` for a regex whose entire
  purpose is rejecting control characters in redirect targets. Suppressed with
  the reason on the line above.
- `apps/api/src/http/errors.ts` reported an unused `_next`, which Express
  *requires*: it detects error middleware by arity. Fixed at the config level
  with `argsIgnorePattern: '^_'`, matching the convention the codebase already
  used.
- `ShopMap` read `markersRef.current` inside a teardown; now captured at setup.
  Its viewport effect depends on `shopSignature` rather than `shops` on purpose,
  since the signature is built from every field the effect reads, so depending on
  the array would re-fly the map on every parent render. Suppressed with that
  reasoning written down.
- `AppMenu` reads `burgerRef.current` in cleanup to restore focus. Kept
  deliberately: the copy-to-a-variable fix the rule suggests would capture the
  node as it was when the drawer *opened*, and focusing a detached element drops
  focus to `<body>`. First attempt put the disable comment on the deps line and
  ESLint correctly reported it as an unused directive, because the rule fires on
  the ref read, not the array.
- `AdminVerificationPage` had `load` missing from its effect deps; wrapped in
  `useCallback` rather than suppressed.
- `no-constant-binary-expression` caught `{false && ...}` in `LandingPage.tsx`,
  the ~60-line legacy street scene left behind by this morning's trim. The
  linter was right that unreachable JSX should not sit in a render tree, so it
  is deleted along with the `Building` import and `INK` constant that only it
  used. `LandingPage.tsx` is now 112 lines, from 729 this morning.

**Not fixed, recorded:** `npm audit` reports three pre-existing high-severity
advisories, none introduced by this install — `postcss` path traversal via
source-map auto-loading, and `react-router`/`react-router-dom` RSC-mode CSRF
bypass. We do not use RSC mode. A router upgrade is its own change with its own
gate, so it is not being smuggled in here.

Gate: **ESLint 0 errors 0 warnings**, typecheck clean, both builds clean, 129
fast tests, **matrix 82/82 twice back to back with no reset**, browser
re-verified — the same 27-element computed-style comparison from this morning
still shows zero differences against the pre-prune baseline, no console errors.

## 2026-08-01 — Claude — read the roadmap first, then closed what was safe to close

Product owner handed over the seven open sweep findings and said to decide, but
to read the roadmap first so nothing already planned got overwritten. That was
the right instruction and it changed the plan twice.

**`trust proxy` is already tracked as P5-RL-01**, raised 2026-07-30 with a full
spec in [Phase 5](../plans/05-PHASE-5-PRODUCTION-ROLLOUT.md), alongside P5-RL-02
for the per-process rate-limit store. Fixing it here would have duplicated
scheduled work and pre-empted a topology decision nobody has made. **Left alone
deliberately.**

**The customer detail screen is tracked too**, as open item 6 and in "Next up",
and it is explicitly the frontend lane's. It is a real feature, not polish, so
starting it unilaterally is exactly the collision the product owner warned about.
**Left alone**, and the entry sharpened to say what a customer actually sees
today.

Done instead:

- **P5-CSP-01 registered** in Phase 5, next to the two rate-limit items. The
  `_headers` `connect-src` landmine had no ticket anywhere. Written up with the
  real failure mode: dev, preview, and the whole matrix stay green while
  production blocks every API call and every signed photo. Suggested fix is to
  generate `_headers` from the same function `vite.config.ts` uses, so the two
  definitions cannot drift again.
- **Rive deleted (D-032)** and `'wasm-unsafe-eval'` dropped from both CSPs.
  Nothing referenced it after D-031: component, stylesheet, 2.0 MB `rive.wasm`,
  81 KB `.riv`, and the `@rive-app/canvas` dependency. `script-src` is back to a
  bare `'self'`, which permanently retires the DevTools eval notice that started
  this whole thread.
- **The roadmap was stale in three places and is now correct.** The "Latest
  automated gate" block still claimed 81/81, 124 fast tests, and an uncommitted
  tree; the landing description still described the pre-D-031 page; and four
  findings had no ticket. All fixed, with an explicit warning that
  "Lint: passed" in any block dated before today means nothing.

**A blank page cost real time and the lesson is worth keeping.** After the CSP
edit the landing rendered nothing, with no console error. It was not the code.
`vite.config.ts` builds the dev policy by rewriting the production string by
exact match, so during the window between editing the production directive and
editing the override, the override stopped matching and dev silently lost
`'unsafe-inline'`. Vite's inline preamble is then blocked, React never boots, and
the browser cached that document together with its broken CSP — so it stayed
blank through a config fix, a `node_modules/.vite` purge, an `npm install`, and
three server restarts. `/?cachebust=1` rendered immediately. Recorded in D-032.

Two process notes from that hunt. A `git stash` test was **inconclusive and
nearly misleading**: it restored `RiveScene.tsx`, which imports a package already
uninstalled, so the blank page reproduced for a second unrelated reason and
looked like exculpation. And the computed-style comparison reported
"0 differences" against an empty page, because it loops `min(before, after)`
times; it now returns `comparisonValid` and that flag is what gets read.

Gate: ESLint 0/0, typecheck clean, both builds clean, 129 fast tests, matrix
**82/82 twice back to back with no reset**, landing re-verified at 27 elements
with 0 differences against the pre-prune baseline and `comparisonValid: true`.

## 2026-08-01 — Claude — the "bugs" were the API being down plus the D-032 cache trap; the trap is now structural history

Product owner reported hitting bugs in the app. Diagnosed rather than guessed:

- **The API server was not running.** The web dev server was up, so every screen
  rendered while every login and data call died against port 4000. Started it and
  smoked all three roles over real HTTP: ten calls (owner shop/quals/hiring,
  customer bookings/catalogue, barber bookings/exceptions, three signins), all
  200. Also confirmed the public catalogue is an empty array right now because
  the matrix restores the dev shop to draft — expected state that reads like a
  bug on the discover screen.
- **The D-032 blank page can hit the user's own browser too.** Any tab that
  loaded the app during the broken-CSP window cached the document together with
  its policy; a normal reload keeps it blank. One hard refresh (Ctrl+Shift+R)
  clears it.

**The `.replace()` CSP trap is now removed structurally, not patched.**
`contentSecurityPolicy()` builds directives as a keyed record and takes an
overrides map merged by directive NAME; an override targeting a directive that
does not exist throws at server start instead of silently no-opping. Dev gets
`'unsafe-inline'` (script+style) and `ws: wss:` that way; preview keeps the
strict production policy from the same function. The dev server also now sends
`Cache-Control: no-store`, so a momentarily-broken response can never again be
pinned by a browser cache.

Verified after restart: served dev header carries both real origins plus
`ws: wss:`, no `wasm-unsafe-eval`, `Cache-Control: no-store`; landing and
`/login` render; `[vite] connected.` for HMR. A note for the future: a raw
WebSocket probe against Vite 7's HMR endpoint always fails because clients need
a token — the page's own "[vite] connected." log is the real signal.

Typecheck clean, ESLint 0/0. Config-only change; the matrix does not touch it.

## 2026-08-01 — Claude — P2-08 race gate: backend proven, no migrations needed

Pushed the three pending commits after re-running the matrix I had flagged as not
re-run (82/82 twice), then started P2-08.

**Measured before building, and the measurement was the packet.** P2-07 already
proved three races. The phase contract asks for "parallel last-vacancy,
provider-slot and chair-slot claims produce one valid winner and stable
conflicts", so the work was to widen coverage into the classes nothing had
touched, and **every one of them already held. No migration was written.**

Four new probes, all against the live database:

- a hold released by a decline returns the slot to the pool, and two customers
  then contesting that freed slot produce exactly one winner;
- the claim/expiry boundary never yields two live rows, and its refusal is
  transient — after the sweeper finishes, a retry succeeds;
- two customers racing an owner-provider give one winner on `23P01`;
- an owner-provider and an employed barber racing the shop's single chair give
  one winner on `P4026`.

The last two matter because owners only became bookable in P2-07 (D-028), and
every race proved before that involved employed barbers exclusively. Chair
capacity in particular is an advisory-lock count rather than an exclusion
constraint, so it needed its own proof for the owner path.

**The probe corrected me, which is the point of writing it first.** I asserted
"exactly one live appointment" at the claim/expiry boundary and it failed with
zero. That is legitimate: a claim can read a hold while it is still `requested`,
lose on the exclusion constraint, and then watch the sweeper retire that same
hold — leaving the slot free and the customer told it was taken. The real
invariant is **never two**, not always one. A transient false refusal is not a
lost booking, and making the claim block on the sweeper would be a worse trade.
The regression now pins the part that actually matters: after the sweep, a retry
succeeds, so a slot can never be stranded by an expiring hold. Worth a Phase 3 UI
affordance (offer a retry, not a dead end) rather than a backend change.

**All three regressions falsified before being trusted**, each reproducing the
exact failure it exists to catch: skipping the decline gave
`expected [] to have a length of 1 but got 0`; two chairs instead of one gave
`expected [ …2 items ] to have a length of 1 but got 2`; never running the
sweeper left the hold `requested` instead of `expired`.

**One process lesson.** The sweeper falsification left a stale `requested` hold
behind, because the test failed before its cleanup ran, and that pollution then
broke two unrelated tests — including a `500` on the discovery test that looked
alarming until a clean replay cleared it. This suite shares fixtures: reset the
database after any deliberate sabotage run, and do not read collateral failures
as findings.

Gate on a database replayed from empty through all 53 migrations: DB lint clean,
typecheck clean, ESLint 0/0, both builds clean, 129 fast tests, **matrix 85/85
twice back to back with no reset**, `git diff --check` clean.

**Phase 2 is not closed yet.** P2-08's frontend half — responsive owner, barber
and customer smoke journeys — is untouched. It needs an authenticated browser
session, and signing in means typing a real account password, which I must not
do. So it needs the product owner at the keyboard, or a session I am permitted to
install. In the meantime the same authorization surface was exercised over real
HTTP for all three seeded roles, ten calls, all 200.

## 2026-08-01 — Codex — P2-08 frontend fixes ready; owner browser acceptance pending

Implemented six focused frontend corrections found while preparing the P2-08
smoke journeys: compact mobile appointment calendar, wrapped owner service and
reservation filters, a usable narrow owner-note action, wrapped customer chat
replies, a labelled Leaflet pin, and hiring conflict/note state that survives
the authoritative reload.

The deterministic frontend gate passed: all workspace typechecks, ESLint with
zero warnings, 129 fast tests (61 shared, 28 API, 40 web), production build, and
`git diff --check`. The 85-case matrix was intentionally not rerun because no
`apps/api` or `supabase` file changed. The smoke fixture was restored to draft,
hiring Off, owner-provider Off, Bruno qualified for both active services, no
pending request, and no new booking or closure.

An agent-run preliminary browser pass is recorded in Phase 2 tests, but the
product owner clarified that they will perform the browser test. P2-08 and Phase
2 remain open until that acceptance result is recorded. The customer slot picker
remains the explicitly excluded feature and was not built. No commit or push was
made.

## 2026-08-02 — Codex — local Supabase fetch failure repaired

The app's `/health` endpoint was green while every Supabase-backed request failed
because Windows had dynamically excluded TCP ports `54468–54967`, covering the
configured local Supabase range `54520–54527`. Moved the local stack to the free
`54320–54327` range and aligned the ignored API/web environment files. No
database reset, migration, SQL, or application-code change was involved.

Verified the Supabase auth gateway, API on port 4000, and Vite on
`http://localhost:5174`. Re-ran the local account seeder to pin the configured
development password, then successfully signed in the verified owner, verified
barber, and customer through the real API. The product-owner browser acceptance
remains the next P2-08 action.

## 2026-08-02 — Claude — reviewed Codex's P2-08 pass; found a once-a-week test flake I had shipped

Product owner asked for the project's current stage. Checking the tree rather
than reciting from memory turned up Codex's uncommitted P2-08 work, and running
the matrix against it turned up a flake of mine.

**Codex's work, reviewed and verified rather than taken at face value.** They ran
a preliminary browser pass at 1280×800, 390×844, 375×812 and 320×800, made small
frontend fixes (Leaflet pin label, hiring conflict alert and normalized note,
owner filters/staff note, chat replies, appointment calendar at narrow widths),
and **relocated the whole local Supabase stack from the 545xx range to the
standard 543xx range** in `config.toml` and both `.env.example` files. Verified
live: the stack really is listening on 54321, the local `.env` files agree, and
typecheck, ESLint 0/0, 129 fast tests and both builds are green.

**One gap in their reasoning.** Their note says the matrix was "intentionally not
rerun because no API or Supabase file changed" — but `supabase/config.toml` did
change, and it changes every port the matrix connects through. Rerunning it was
the right call and it found a failure.

**The failure was mine, not theirs: `enforces the booking lead time and advance
horizon` fails every Sunday.** The test snapped its slot to the fixture's Monday
shift and then asserted a hardcoded `min_lead_minutes: 10080` (seven days). That
snap puts the slot 1.8 to 7.8 days out depending on the weekday, so on a Sunday it
lands 7.8 days out, clears the requirement, and the booking is accepted.

Worth recording that my first fix was wrong. I derived the lead from the slot and
added a day, which tripped `shops_min_lead_range` — the column is capped at 10080.
That cap is the real point: **no lead value can refuse a slot 7.8 days out**, so
the approach was unfixable on Sundays rather than merely mistuned.

The real fix reads the gate instead of fighting it. `require_booking_window` runs
before any shift check, so the two refusals never needed a slot the barber works.
They now use a plain now+3d instant, which is 2.04 to 3.0 days out on every
weekday and hour: inside a seven-day lead, beyond a one-day horizon. Only the
"accepted with defaults" half still uses the Monday slot, because that one does
need a real shift window. Checked across 21 weekday/hour combinations, all hold.

Introduced in P2-07 and first observed 2026-08-02, which was simply the first
Sunday anyone ran the matrix. The lesson worth keeping: a test that derives a
date from "today" needs proving across all seven weekdays, not just the one it
was written on.

Matrix **85/85 twice back to back** after the fix, on Codex's relocated ports.

## 2026-08-02 — Codex — duplicate dashboard identity strip removed

Per the product owner's screenshot and explicit direction, removed the shared
`DoodleBoard` top strip that repeated the live shop label and profile avatar/name
on owner, barber, and customer dashboards. The global header remains the single
profile/navigation surface. Customer discovery and owner reservation search are
preserved as standalone controls instead of being deleted with the strip.

Full deterministic gate passed: all workspace typechecks, ESLint with zero
warnings, 129 fast tests, production build, and `git diff --check`. No browser
acceptance was run; the product owner is testing visually. No API, Supabase,
migration, or SQL file changed, so the matrix was not rerun.

## 2026-08-02 — Codex — auth “Back to home” link removed

Removed the standalone auth-canvas link shown in the product owner's screenshot,
plus its now-dead desktop/mobile/hover/reduced-motion CSS and unused `Link`
import. The login/signup switch and protected-route return behavior are
unchanged. Web typecheck, real ESLint, all 40 web tests, production web build,
and `git diff --check` passed. Browser review remains with the product owner.

## 2026-08-02 — Codex — automatic chat replies removed

Removed the three preset chat chips (`May available slot?`, `Magkano ang
haircut?`, and `On the way na ako`) from the shared composer for every role, and
pruned their base, notebook, mobile, and Premium Studio CSS. Normal typed
message submission and recovery are unchanged. Web typecheck, ESLint, all 40
web tests, production web build, and `git diff --check` passed. Browser review
remains with the product owner.

## 2026-08-02 — Claude — the landing "already signed in" bar: two defects, both fixed

Product owner reproduced it precisely: open several tabs with different
accounts, then open the home page, and the signed-in bar is already there. That
reproduction is what identified the real cause. There were two defects, and the
one they saw was the milder of the pair.

**Defect A — the session is shared by every tab, and nothing keeps them in
step.** `ApiBackend` persists to `localStorage` under
`philabantay.api.session.v1` (`services.ts:494`), which is per-origin, not
per-tab. Each tab reads it once in its constructor and then keeps `session` and
`currentProfile` in memory, and **there was no `storage` listener anywhere**, so:

- opening any new tab on `/` silently inherits whoever signed in last, which is
  exactly what was reported;
- signing in as a second account overwrites the shared key while the first tab
  carries on displaying and *sending* the first account's token;
- whichever tab refreshes its token next writes its own session back over the
  other (`refreshAccessToken` → `saveSession`), so the identity flips on the
  loser's next reload;
- one 401 anywhere calls `clearAuth()` and signs every tab out.

That divergence is the dangerous part: two tabs could hold two identities at
once. Fixed with a `storage` listener that adopts the stored session
immediately, re-fetches the profile, and fails closed to signed-out if the
adopted token is unusable. The browser now holds exactly one identity and every
tab follows it. It deliberately does **not** add multi-account support: use
separate browser profiles or a private window for that.

Worth recording as a silent regression. `ARCHITECTURE.md:317` documents that the
retired mock kept sessions **per-tab in `sessionStorage`**. Moving to
`ApiBackend` changed the model to a shared `localStorage` session and nothing
recorded it, so the old doc described safer behaviour than the code had.

**Defect B — the landing claimed two visitors at once.** `Layout.tsx:157` gated
the navbar on `profile && !verificationLocked` with no landing exception, so the
header showed the avatar and app menu while the body kept selling to a guest:
"Request a Demo" and "May account ka na? Log in". Signed-in header, anonymous
body, one page. Now a signed-in visitor is redirected off `/` to their dashboard
(or `/onboarding/role`, matching `AuthPage`'s existing rule).

The trap that redirect had to avoid: `signingOutToHome` is exempt. Sign-out
deliberately lands on `/` while the profile is still briefly set, so redirecting
unconditionally would bounce the user back into the app they were leaving.

**A correction to my own first trace.** I initially said the avatar would render
unstyled on the landing because 414 `studio.css` rules are scoped to
`.app-shell.is-workspace` while the landing shell is `.is-landing`.
`.app-profile-avatar` is unscoped (`studio.css:343`), so it styles fine and the
CSS was never the problem. The defect is the state contradiction, not the paint.

Also caught before it landed: I typed a Cyrillic `С` (U+0421) in
`watchCrossTabSession`. It compiled, because it was consistent in both places,
and would have been invisible to anyone grepping the ASCII name. Replaced.

Typecheck rejected the first version too, since `StorageEvent` and
`globalThis.addEventListener` are not in scope for every workspace that compiles
this package. The listener is now typed structurally, which is the right shape
for a package both Node and the browser consume.

Gate: typecheck clean, ESLint 0/0, 129 fast tests, both builds clean. Guest
landing re-verified in the browser: nav is Home / Log in / Sign up, no avatar,
no session, no console errors, no horizontal overflow.

**Not verified in a browser:** the signed-in redirect and the cross-tab
adoption, because both need a real login and I must not type an account
password. Both are reasoned from the code and typecheck-clean, and both are
prime candidates for the product owner's P2-08 browser acceptance.

## 2026-08-02 — Codex — Phase 3 opened; Phase 6 placeholder recorded

At the product owner's direction, P3-01 Request/accept/assign is now the active
packet. P2-08's final owner-run browser acceptance was explicitly deferred, not
passed, so P2-08 and Phase 2 remain formally open while Phase 3 proceeds. The
first P3-01 action is a gap measurement against the existing transactional
booking, availability, assignment, and lifecycle implementation.

The roadmap now also reserves Phase 6 for final deployment and UI/UX polishing.
The product owner will provide its detailed plans, packet structure, acceptance
criteria, and layouts; none were invented in this update.

P3-01 gap measurement found that the protected manual request, 15-minute hold,
exact/preferred/any assignment, audit, and owner accept/decline/reassign backend
already exist. The first missing seam is now implemented: strict shared client
types/schemas expose customer-aware availability days and advisory booking
quotes to the web app. Focused `ApiBackend` tests passed 21/21 and all-workspace
typecheck passed. The full gate passed with 130 fast tests (shared 62, API 28,
web 40), zero-warning ESLint, production build, and clean diff check. The matrix
was skipped because no API or Supabase file changed. Instant mode, the customer booking workspace, richer quote
policy/idempotency data, and owner assign/reason UI remain open and are recorded
in the active P3-01 handoff.

## 2026-08-02 — Codex — P3-01 automated verification green; P3-02 started

Completed P3-01 implementation: customer service/intent/date/slot/quote/create
workspace, customer-scoped idempotent creation, atomic manual/instant behavior,
restricted-customer manual fallback, quote policy fields, assignment projection,
and owner accept/decline/assign controls. Logic regressions cover concurrent
duplicate submit, changed-payload key reuse, manual expiry, instant confirmation,
and forced-manual restriction.

Verification: database replayed from empty through `20260802000200`; DB lint had
no findings; API/RLS matrix 86/86 twice without reset; 131 fast tests;
typecheck, zero-warning ESLint, production build, and diff check passed. Browser
testing was explicitly skipped and a product-owner checklist was written, so
P3-01 is not marked fully verified.

Started P3-02 after finding that the owner command could replace an exact barber
choice without consent. The regression was falsified first (`expected 409,
received 200`). The new SQL guard and owner UI boundary pass while preferred/any
reassignment remains available. Next is the versioned proposal/approval model.

## 2026-08-02 — Codex — Phase 3 implementation and automated gate complete

Completed P3-02 through P3-09: consent-safe material changes and disruption
attention, visit/no-show/appeal operations, walk-in guest claim and queue,
independent offline payment facts, notification outbox/in-app delivery, durable
closeout, role workspaces, shared contracts, and API boundaries. Four rescan
findings were repaired in-packet: durable failed claim attempts, allowlisted
public guest projection, shop-scoped closeout loops, and narrow conflict catching.

Final evidence on the current tree: clean reset through all 58 migrations; DB
lint zero findings; 131 fast tests; API/RLS matrix 91/91 twice without reset;
all-workspace typecheck; zero-warning ESLint; production build; and clean diff
check. Browser execution was skipped at the product owner's direction. The
consolidated P3-09 checklist is the remaining Phase 3 acceptance gate, so Phase 3
is implementation-complete but not formally accepted. No commit or push was
made.

## 2026-08-02 — Claude — independently verified the Phase 2/3 automated gate; browser half is still partly blocked

Product owner asked for the Phase 2 and Phase 3 testing so the phases can close.
Did everything that does not require signing in, and re-derived Codex's numbers
rather than accepting the summary.

**Codex's automated claims reproduce exactly.** Clean `supabase db reset` through
all **58** migrations, DB lint **no schema errors**, typecheck clean, ESLint
**0/0**, **131 fast tests** (shared 62, api 29, web 40), production builds clean,
`git diff --check` clean, and the API/RLS matrix **91/91 twice back to back with
no reset**. Nothing in their report was overstated.

**Role authorization swept over real HTTP: 37/37.** Covers anonymous refusal on
six protected surfaces (including the new `/notifications`, `/owner/attention`,
`/payments`, `/walk-ins`), anonymous discovery still open, each role on its own
surfaces, cross-role denial, a forged JWT, and an owner without AAL2 on `/admin`.

Two initial "failures" were **my mis-specified expectations, not defects**, and
both taught me the contract:

- `GET /no-show-appeals` defaults to `scope=mine`, which is customer-only, so an
  owner must ask for `?scope=shop`. Now both halves are asserted, plus a barber
  denied on the shop scope.
- `GET /payments` returns **200** for a customer because it is scoped to their
  own appointments. The status was never the question; the scoping was. Added the
  check that actually matters: a barber with active employment but **no cashier
  capability** is refused `403 capability_required`.

**Spot-checked the anonymous walk-in claim**, since it is the one route mounted
before `authenticate` and is a code-guessing surface. Attempts increment on a
`RETURN` rather than a `RAISE`, so the counter commits instead of rolling back
with the failure; the claim row is `FOR UPDATE` locked and attempts cap at five.
Codex's "durable failed claim attempts" repair is real. Also confirmed the bare
`POST /:id/claim` is relative to a `/walk-ins` mount, so the path is correct — my
first read of it as an unprefixed catch-all was wrong.

**Public browser surfaces, four viewports, measured not eyeballed.** Landing,
`/login` and `/signup` at 1280×800, 390×844, 375×812 and 320×800: horizontal
overflow **0** everywhere, **0 unlabelled** focusable controls everywhere
(6/5/9 desktop, 4/5/9 narrow), and zero console errors across every navigation.
Keyboard on `/login`: a clean five-control cycle with a visible focus indicator
on **all five** and no trap.

Two observations, neither a defect:

- The smallest tap target is the D-021 inline mode switch (`a.auth-mode-action`,
  39×17). It is a text link inside a sentence, which the WCAG target-size
  minimum explicitly exempts.
- At 320px `.auth-blob-large` extends past the right edge. It is
  `aria-hidden="true"`, `pointer-events: none`, holds no text or focusable
  content, and is clipped by `overflow-x: clip`, so the document never scrolls
  sideways. Decoration, by design.

**What I could not do, stated plainly.**

1. **Every authenticated journey.** Owner, barber and customer workspaces need a
   signed-in session; signing in means typing a real account password, which I
   must not do, and installing a session token was blocked by the safety
   classifier. The authorization half is covered over HTTP above; layout, focus,
   labelling and console health inside those workspaces are not.
2. **Real `prefers-reduced-motion` emulation.** The browser tools available here
   expose no media emulation, so I can only report that it does not currently
   match. This is the same caveat P2-06 carried and it stays open — Codex claims
   to have emulated it, and I cannot confirm that independently.

Neither phase can be marked accepted on this evidence. The offer on the table:
the product owner signs in once in the browser pane, and the agent then drives
every journey in that session and records evidence at the P2-02..P2-06 standard,
without ever handling the credential.

Phase 3 also remains **entirely uncommitted** — 50 dirty files including five new
migrations — which is a real risk independent of testing.

## 2026-08-05 — Codex — browser acceptance resumed; two frontend defects fixed

- Executed the 2026-08-02 browser-acceptance handoff against the real
  `localhost:5174` web app, API `:4000`, and local Supabase. The backend matrix
  was not rerun because no API, migration, or Supabase file changed.
- Fixed the missing Owner Barbers H1 and the intrinsic Barber Shift Calendar
  width that overflowed at 320 px. Reverification at 1280×800, 390×844,
  375×812, and 320×800 produced zero overflow, clipping, or unlabelled controls
  on the repaired surfaces.
- Passed real reduced-motion media emulation, visible Staff/Schedule review,
  LR-033 no-flash restore, owner readiness/provider/hiring/stale-state flows,
  barber read-only schedule/request/attendance, and responsive customer
  discovery/detail/appointments/chat/settings.
- Ran one real manual booking through owner acceptance and barber visibility;
  customer rejected one proposal, accepted a fresh proposal, saw a barber delay,
  rescheduled through offered availability, and cancelled the temporary booking.
  Check-in before its window correctly refused; timestamps were not altered.
- Explicitly skipped exhaustive Tab/Enter/Space traversal, Chromium-native
  hours/closure mutations, and the remaining time-bound/operational P3-09 rows.
  Therefore P2-08, Phase 2, P3-09, and Phase 3 remain open.
- Cleanup left the dev shop draft, original details/hours/services restored,
  hiring/provider capability off, Bruno qualified for both services, no closure,
  the temporary booking cancelled, the shift request declined, and all roles
  signed out. The local web/API servers were restarted after one process exit.

## 2026-08-05 — Phase 4 backend delivered, experience gate outstanding (Claude)

Measured before building, per the handoff card. The live-database gap measurement
is recorded in `docs/testing/PHASE-4-GAP-MEASUREMENT.md` and was taken before any
code was written. It corrected the card twice — the ratings eligibility rule was
enforced by a database trigger as well as by TypeScript, and the live function
count is 193, not 152 — and found a live contract violation the card had not:
`revenue_is_estimate: true` in `GET /shops/:id/stats` plus a "Revenue" column on
the owner dashboard, which contract §10 forbids in as many words.

Delivered P4-01 through P4-08 across eleven forward migrations,
`20260805000100`–`20260805001100`:

- **P4-03 ratings.** Eligibility records created from finalized visit facts by
  trigger, seven-day edit window then lock, separate shop and provider scores,
  public responses (one per authoring side, Q15), reports, moderator hide/restore
  that preserves the score, and an immutable `rating_events` log. `POST /ratings`
  is now a command; the direct grants are gone.
- **P4-02 disputes.** `support_cases` / `case_participants` / `case_evidence` /
  `case_events`, owner-first decision with Q13 windows as stated targets, customer
  escalation, assigned admin review, audited *access* as well as decisions, and an
  explicit visit-correction command so derived metrics recompute from final facts.
- **P4-04 analytics.** One reproducible SQL read in the shop's own timezone. The
  five §10 value concepts stay distinct, the ledger figures come from payment
  events bucketed on `paid_at`, and every metric ships its own definition string
  so a reader can re-derive the number. The "revenue" labels are gone.
- **P4-01 conversations.** Creation became a command, context is explicit,
  blocking is symmetric, sends are rate-limited inside the command, messages page
  by cursor, retention is two years with a bounded purge.
- **P4-05/06/07 workspaces.** Owner Analytics and Trust destinations, barber
  Performance, the customer rating prompt on home, and a dispute panel replacing a
  button that used to post a hardcoded sentence on the customer's behalf.
- **P4-08 settings.** Preferences were `localStorage`-only with no service method
  at all, so a second device saw defaults. They are now server state through a
  version-checked command; mandatory transactional notices are enforced by a check
  constraint rather than a guard; quiet hours actually delay optional delivery and
  never a required notice; and operations can see and retry a provider failure.

Security findings beyond the card, all fixed and all falsified: a customer could
**delete their own review** through PostgREST (`authenticated` held INSERT and
DELETE on `ratings` with permissive policies); `service_role` held write grants on
`messages`, which would have let a caller step around the new block and rate
limit; `authenticated` held INSERT on `conversations` and UPDATE/DELETE on
`notification_preferences`. Also fixed a stale one-way owner-provider rating
mirror, gave both trust audits a `seq` so events appended in one transaction have a
total order, and serialized the DB-backed test files, which had been racing each
other against one Postgres since before Phase 4.

Falsification, nine sabotage runs each followed by a full reset: every regression
was observed failing with its defect reintroduced. One result worth keeping —
removing the employment recheck from `private.is_conversation_participant` alone
did **not** break required test 6. The rule is enforced at three independent
layers and it took disabling two database layers before the assertion could be
seen failing.

Gate on the final tree: 69 migrations from empty, DB lint zero findings, 219/219
functions pinned to an empty `search_path`, typecheck clean, ESLint 0/0, 131 fast
tests, **matrix 143/143 twice back to back with no reset**, both production builds,
`git diff --check` clean.

**Phase 4 is not closed.** Ten of twelve required tests are covered; required test
11 (accessibility and responsive, per role and admin) has not been run at all and
required test 12 is partial — bundle sizes are recorded as a new baseline, render
time and image payload are not measured. The admin console screens, the
rating-response editing UI, and a deliberately deferred `hiring` conversation kind
are listed in full at the end of `docs/testing/PHASE-4-TESTS.md`. P2-08 and P3-09
remain open on their own items; nothing here closes or depends on them.

Nothing is committed and nothing is pushed.
