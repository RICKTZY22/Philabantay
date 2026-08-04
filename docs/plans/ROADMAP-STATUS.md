# V1 roadmap status - 2026-08-02

Single source of truth for packet-by-packet progress across all six phases.
Records **verified evidence**, not visual completion. When a claim is only
partially verified, it says so. Per-test detail lives in
[`../testing/`](../testing/README.md).
Model and effort recommendations live in
[the model routing guide](MODEL-ROUTING-GUIDE.md); they do not change verified
packet status.

Legend: ✅ done and verified · 🔨 in progress · ⬜ not started · 🧹 needs polish.

## Progress at a glance

- **Phase 1 (foundation + identity): ✅ complete** — 7/7 packets, automated gate green.
- **Phase 2 (shops + workforce + availability): 🔨 closeout deferred** — P2-01 through P2-07 are verified. P2-08's backend race gate and frontend code gate are proven, but the product owner explicitly deferred the final browser acceptance on 2026-08-02. This is not a pass and Phase 2 is not formally closed.
- **Phase 3 (booking + live operations): 🔨 browser acceptance pending** — P3-01 through P3-09 are implemented and the clean automated gate is green; the product owner will run the written browser journey gate before formal closure.
- Phases 4–5: ⬜ not started.
- Phase 6: ⬜ product-owner plan pending; packet count is intentionally TBD.
- **Overall: 14 verified packets; 39 packets are currently defined, with Phase 6 still TBD.**

## Phase 1 — foundation and identity ✅

Automated gate re-run and verified on 2026-07-23 (see "Latest gate" below).

| Packet | Status | Verified | Polish / open |
| --- | --- | --- | --- |
| P1-01 Baseline + vocabulary | ✅ | Canonical appointment states across active code; legacy names only in the read-normalizer. | — |
| P1-02 Professional access lock | ✅ | Frontend lock (barber + owner) on the shared predicate; real `VerificationService` + `AdminService`; admin review UI. API + RLS matrix green. An agent-run LR-033 pass on 2026-08-01 observed the neutral restore shell at all four P2-08 viewports with no forbidden-content flash. | 🧹 Final product-owner browser acceptance of LR-033 remains part of P2-08. |
| P1-03 Employment-aware revocation | ✅ | Former/suspended staff lose shifts, attendance, chat, assignment; races pass on local Supabase. | — |
| P1-04 Direct-write closure | ✅ | Transactional booking commands, append-only events, revoked authenticated bypasses. | 🧹 Raw service-role appointment update is tracked hardening debt (not an authenticated bypass). |
| P1-05 Admin boundary | ✅ | Admin never in public onboarding; MFA/AAL2, capabilities, audited evidence access; covered by the matrix. | — |
| P1-06 Public/private catalogue | ✅ | Allowlisted public projections; anonymous `/catalog` routes; P2-01 replaced the legacy eligibility floor with the real published lifecycle. | 🧹 Helper still spelled `is_legacy_catalogue_eligible_shop` (redefined to require `published`); rename later. |
| P1-07 Adversarial gate | ✅ (API/RLS) | Anonymous/customer/owner/barber/cross-shop/former/suspended/direct-JWT/race matrix passes (52/52). | 🧹 Independent adversarial re-scan by fresh eyes + browser/accessibility smoke for maximum assurance. |

## Phase 2 — shops, workforce, availability 🔨

| Packet | Status | Detail |
| --- | --- | --- |
| P2-01 Shop lifecycle | ✅ | Draft → published → suspended lifecycle, `/owner/shop` version-checked commands, catalogue gated on `published`, Shop Setup UI + no-shop redirect. Matrix 52/52 + browser verified. Committed (`5cc05f3`, `f402624`). |
| P2-02 Shop facts | ✅ | Clean local reset through `20260726000100`; authenticated verified-owner Shop Setup passed details/map, hours/closures, services, media, publish/unpublish, stale sessions, mobile, keyboard, native date control, reduced motion, and console checks. The 2026-07-28 follow-ups added the strict public-detail projection plus bounded media hardening: content-rejection proof, object-first retryable deletion, resilient previews, stale-upload cleanup, and a 100-row per-shop cap. |
| P2-03 Hiring state | ✅ | Canonical versioned off/open/full state with optional positive count/note, owner Hiring UI, public published-shop gate, stale-session recovery, and legacy direct-table revocation. Clean reset through `20260727000100`; matrix 57/57; 91 unit tests; typecheck/build/diff and authenticated browser smoke green. |
| P2-04 Employment convergence | ✅ (reverified after security fix) | Applications, invitations, and join codes converge on locked, versioned requests. The ownerless resolution exploit is repaired by fail-closed SQL, forward hotfix `20260728000100`, and API shop scoping. The bounded hardening follow-up removes retained plaintext legacy codes, enforces invitation creator provenance, uses 80-bit uppercase-hex join codes, and records competing requests as `superseded`. |
| P2-05 Provider capabilities | ✅ | Explicit shop-scoped owner provider profile without role switching; owner-authoritative per-service barber/owner qualifications, accepting state, barber requests, immutable audit, version/idempotency/race guards, Staff/Professional UI. Clean reset through `20260727000300`; matrix 59/59; 93 fast tests; typecheck/build/diff and authenticated browser smoke green. |
| P2-06 Schedule authority | ✅ | Slices 1, 2a, and 2c are implemented and locally verified. Migration `20260728000600` drops legacy self-write RPCs, requires request idempotency keys, and enforces pending/resolved invariants. Canonical owner routes version weekly patterns and exceptions; the barber view is read-only and submits structured change requests; approval applies the exception, links it, advances the revision, and appends an event transactionally. Clean reset through `00600`; matrix 69/69 twice; 116 fast tests; typecheck/lint/build/DB-lint/diff green. Authenticated desktop/mobile smoke passed weekly and exception edits, approval, stale-session refresh, keyboard-native controls, reduced motion, and no console errors. Follow-up `20260728000700` closes the last known gap: the booking-conflict guard now takes the resulting window, so narrowing hours or approving a `different_hours` request is refused when it would leave an active booking outside availability (previously only a full day off was checked, and times were ignored). Regression covers the narrowed-window refusal and a wide window still being accepted. **Workflow scenarios 1-4 functionally verified 2026-07-30** against the live stack through the real API and browser UI with no SQL shortcuts: concurrent owner writes gave one 200 and one 409, a barber token got 403 on the owner route and `/schedule` rendered zero time inputs, approval alone wrote the exception and advanced the revision, and both removing and narrowing availability on a booked date returned `409 schedule_has_active_bookings` naming exactly 1 booking while a still-covering window was accepted. Accessibility recorded at the same standard as P2-02..P2-05: **0 unreachable and 0 unlabelled** interactive controls on both surfaces (owner 47/39, barber 41/40, remainder disabled), all 14 shift-editor time inputs labelled, and reduced motion satisfied structurally because `BarberShiftCalendar.css` and `DashboardPage.css` declare no motion at all while `OwnerStaffPanel.css` carries a blanket `prefers-reduced-motion` guard. **Signed off 2026-07-30 by the product owner on the strength of that agent-executed functional and accessibility pass, accepted in lieu of a personal visible-workflow review.** Two caveats stay on the record: reduced motion was verified structurally rather than by emulating the OS setting, and no human has visually reviewed the two surfaces. `ModalPortal` focus was listed here in error and is re-scoped to the landing/auth slice, since no P2-06 surface imports it. |
| P2-07 Availability engine | ✅ | **All ten required inputs implemented and verified 2026-07-30.** Measured before building: the authoritative claim gate `private.require_bookable_appointment_slot` contained zero references to `lifecycle_status`, `shop_operating_hours`, `shop_closures`, `service_qualifications`, `owner_provider_profiles`, `chair_count`, `default_buffer_min`, or `booking_mode`. Two bypasses were reproduced live through the real HTTP API, both `201 Created`: a customer booked a barber at a `draft` shop that the public catalogue correctly refused to list, and a customer booked a date the owner had marked as a full-day closure. Ten forward migrations `20260730000100`..`01000` add the booking window (`min_lead_minutes`, nullable `max_advance_days`), per-service `buffer_min`, BOOK-02 assignment intent (`barber_preference`, `requested_barber_id`, `assignment_source`, `assignment_reason`, `booked_buffer_min`), a qualification backfill, grant-on-hire, the rebuilt gate, the slot projection, and the read-only quote. The gate now enforces publication, the shop's own timezone instead of a hardcoded Manila, lead/advance bounds, opening hours, closures and replacement hours, qualification, a buffer-aware provider gap, and chair capacity as **peak concurrency** under a new shop-scoped advisory lock (D-023). The projection and quote answer by calling that same gate per candidate rather than reimplementing it, so an offered slot is a claimable slot by construction (D-022). Express gained `GET /availability`, `POST /bookings/quote`, and five error codes (`chairs_unavailable`, `shop_not_bookable`, `outside_shop_hours`, `outside_booking_window`, `provider_not_qualified`, plus `no_provider_available`); the old Express slot math is deleted. Gate on a database replayed from empty through all 52 migrations: typecheck, lint, API + web production build, **124 fast tests** (shared 56, api 28, web 40), **matrix 81/81 twice back to back with no reset**, DB lint no schema errors, `git diff --check` clean. The matrix gained 12 gated regressions, including owner-provider bookability and the publish readiness check: publication refusal with a positive control, closures and replacement hours, qualification revoke/restore, lead and advance bounds, the cleanup buffer, chair capacity across two providers with a two-chair control and a concurrent race, projection-equals-claim, and exact/preferred/any intent. Two live end-to-end suites through the real API passed 14/14 and 16/16 and restored the dev shop to `draft`; the matrix then passed 81/81 twice again with zero published shops left behind. **A pre-push self-review found three more defects that no test covered, all fixed in `20260730000600` and `20260730000700`:** automatic assignment was not actually ordered, because a sub-select’s sort does not survive a UNION ALL, so `any` could pick an arbitrary free provider and retries were not guaranteed to agree; an unrecognised `shops.timezone` had become a 500 that made a shop entirely unbookable, since the engine now evaluates wall-clock rules in the shop’s zone while nothing had ever validated it beyond a length check; and quote and claim disagreed about *why* an `any`/`preferred` slot was refused. The assignment regression was falsified before being trusted — inverting the ordering in the live database made it fail. The quote also now returns one object rather than PostgREST’s one-row array, the two new authenticated endpoints carry the same 60/min slot limiter as the anonymous route because P2-07 made slot computation far more expensive, and `slot_is_bookable` no longer swallows `42501`. **Input 4 completed 2026-07-30 (Q20 answered, D-028).** A shop whose only provider was its owner could publish, appear in the catalogue, and refuse every customer — availability returned `200` with zero slots and a booking returned `409 no_provider_available` — because the engine never read `owner_provider_profiles` at all. `20260730000800`/`00900` give a provider-enabled owner a one-way-mirrored `barbers` shadow row as the foreign-key anchor and teach the gate, the balanced-assignment order, and the slot projection about them; an owner has no roster, so their working window is the shop own opening hours and the grid anchors to opening time. Three pre-existing guards were extended rather than weakened. `20260730001000` adds the missing readiness check so a shop cannot publish with nobody bookable (D-029). Verified live: booking the owner by name returned `201`, the same request on a Sunday returned `409 outside_shop_hours` for a Mon-Sat shop, and the owner could accept, check in, and start the visit. Matrix **81/81 twice**. |
| P2-08 Race gate + smoke journeys | 🔨 deferred acceptance | **Backend race gate proven 2026-08-01; no migrations were needed.** The four widened races all held, the three new regressions were falsified, and matrix 85/85 passed twice on a clean replay. Six focused frontend files fix the defects found, and the deterministic gate passed: 129 fast tests, typecheck, ESLint, production build, and diff check. An agent-run browser pass recorded the required four viewports, interactive counts, keyboard, reduced motion, LR-033, stale-session, and console evidence in [Phase 2 tests](../testing/PHASE-2-TESTS.md#p2-08), but this is preliminary. **The product owner explicitly deferred/skipped final browser acceptance on 2026-08-02. This is not a pass; P2-08 and Phase 2 remain open while P3 work proceeds.** Matrix intentionally not rerun because no API/Supabase file changed. The customer slot picker moves into its planned P3 booking scope rather than being backfilled as P2 smoke polish. |

The agent's preliminary P2-08 pass exercised real reduced-motion media
emulation and visually inspected the owner Staff/barber Schedule workflows.
The product owner deferred the final browser acceptance on 2026-08-02, so the
two carried P2-06 follow-ups remain open until that result is recorded.

## Phase 3 — booking and live operations 🔨

P3-01 through P3-09 are **implementation-complete and automated-green as of
2026-08-02**. Delivered scope includes manual/instant/idempotent booking;
consent-safe change proposals and disruption attention; check-in, start, finish,
confirmation and dispute; no-show appeals/strikes; walk-in claim/link/queue;
offline payment facts; outbox/in-app delivery; and idempotent closeout that never
guesses.

Evidence on the final tree: empty-database replay through all 58 migrations,
zero-finding DB lint, 131 fast tests, API/RLS matrix **91/91 twice** without a
reset, all-workspace typecheck, zero-warning ESLint, production build, and clean
diff check. See the [Phase 3 handoff](P3-09-PHASE-3-JOURNEY-HANDOFF.md).

**Browser execution was skipped at the product owner's direction.** The owner
will run the [consolidated manual checklist](../testing/P3-09-MANUAL-BROWSER-CHECKLIST.md),
so P3-09 and Phase 3 remain acceptance-pending rather than formally complete.

## Phases 4–6 ⬜

- Phase 4 (trust, insights, settings, workspaces): P4-01…P4-09, now including the
  **staff admin console** (see below).
- Phase 5 (production hardening + rollout): P5-01…P5-06.
- [Phase 6](06-PHASE-6-DEPLOYMENT-UI-UX-POLISH.md): final deployment and
  product-owner-directed UI/UX polishing. Detailed plans, packet IDs, acceptance
  criteria, and layouts remain with the product owner and are intentionally TBD.

### Staff admin console (Phase 4)

A private, staff-only back-office. Access reuses the existing `admin` role + AAL2
MFA + capability grants, provisioned by script and never reachable through public
signup (the Phase 1 admin boundary). It consolidates the scattered admin surfaces
and adds the operator tools needed at PH scale:

- Verification review queue (exists): approve / reject / request-info.
- Account moderation: suspend / restore professionals (exists) plus ban or
  disable any account (new; extend suspend beyond professionals).
- Bug report triage: list, read, update status (new; reports are already
  collected by the support system, just not surfaced).
- User directory + platform metrics: total users, counts by role, growth (new).
- Audit views for sensitive access (build on the existing verification audit).
- Swap the dev SMS path for a real PH provider (Semaphore / Twilio).

## Needs polishing / open items

1. **Phase 1 final browser/accessibility smoke (LR-033)** — the agent's preliminary P2-08 pass observed the neutral session-restore shell with no forbidden-content flash; final product-owner browser acceptance was deferred on 2026-08-02 and remains open.
2. **Independent adversarial re-scan (P1-07)** — Codex wrote both the code and its tests; a fresh adversarial pass raises confidence before Phase 1 is formally locked.
3. **Catalogue helper naming** — `is_legacy_catalogue_eligible_shop` now means "published + eligible"; rename for clarity in a later packet.
4. **Remote rollout (Phase 5)** — the P2-04 hotfix and bounded hardening migrations/API intentionally remain local until the production-rollout phase selects and configures the hosted Supabase/API/web targets.
4a. **P5-RL-01 `trust proxy` is not set (raised 2026-07-30).** `apps/api/src/app.ts` rate-limits on client IP and its own comment says to set `app.set('trust proxy', <hops>)` in production, but it is not set. Behind any proxy or CDN, `req.ip` becomes the proxy address and all traffic shares one bucket, so per-IP limits stop working and one abusive client can exhaust everyone's. Numeric hop count only, never `true`. Detail in [Phase 5](05-PHASE-5-PRODUCTION-ROLLOUT.md).
4b. **P5-RL-02 rate-limit store is per-process (raised 2026-07-30).** `express-rate-limit` uses its default `MemoryStore`, so N API instances allow roughly N times the intended limit. Fine on one instance. Not a security hole on its own: join-code brute-force protection lives in the `employment_join_attempts` Postgres table and is already shared across instances. Decide the store before scaling out, preferring edge rate limiting over introducing Redis, which would be the project's first non-Postgres dependency.
5. **P2-06 visible-workflow/reduced-motion follow-up** — the agent recorded a preliminary real-media and visual pass during P2-08; final product-owner browser confirmation was deferred on 2026-08-02 and remains open.
6. **Customer booking UI / P3-01 scope — implemented, browser pending.** The customer shop dialog now consumes `/availability` and `/bookings/quote`, collects exact/preferred/any intent, reviews real service/policy facts, and creates through the idempotent transactional command. Automated gates are green; product-owner browser acceptance remains.
8. **No automated rendered-component tests exist for the web app (raised 2026-08-01).** 62 files and 11,690 lines of React are covered by three test files that exercise pure helpers (`access`, `appointmentStatus`, `philippineHeroTime`). There is no `@testing-library/react` and no jsdom, so no component or page is rendered in a unit test. The API has an 85-case local matrix; frontend regressions still depend on manual browser passes such as P2-08. ESLint covers `rules-of-hooks` and `exhaustive-deps`, but cannot prove a booking screen renders the right thing. Standing up the harness is a packet of its own; schedule it before frontend scope grows materially.
9. **Three pre-existing high-severity `npm audit` advisories (raised 2026-08-01).** `postcss` path traversal via source-map auto-loading, and `react-router` / `react-router-dom` RSC-mode CSRF bypass. None were introduced by the ESLint install. We do not use RSC mode, so the router pair looks inert here, but both want a version bump with its own gate. Deliberately not bundled into an unrelated change.
10. **`ARCHITECTURE.md` needs a real rewrite (raised 2026-08-01).** Every false statement of current fact is corrected and the mock sections are labelled history, but the narrative still walks through a `~1,500-line MockBackend`, a `bsh_mock_db_v1` localStorage blob, and `BroadcastChannel` realtime — all deleted 2026-07-24. It is one of the seven files `CLAUDE.md` orders every agent to read before changing code, so the rot has a real cost.
11. **`public/_headers` ships a local-only `connect-src` — tracked as P5-CSP-01.** Deploying it unchanged CSP-blocks every API call and every signed shop photo in production while dev, preview, and the whole matrix stay green. Detail in [Phase 5](05-PHASE-5-PRODUCTION-ROLLOUT.md).
7. **Q4 first-publication admin review — resolved 2026-07-30 by reversing the decision, not by building the queue.** Found the same day: the 2026-07-22 acceptance ("first publication requires a lightweight admin review of shop control/address/location") was never implemented. `api_publish_owner_shop` in `20260726000100` has always set `lifecycle_status = 'published'` directly, and although `pending_review` exists in the enum from `20260722001800` and is referenced in `types.ts` and `ShopSetupPage.tsx`, nothing ever set it and no admin shop-review route existed. V1 now matches the code: **publication is self-service** for a verified owner whose readiness checklist passes. See D-019 and the dated Q4 reversal in [Open questions](OPEN-QUESTIONS.md). The transactional publish command still rechecks verified ownership, identity/address/pin/timezone, one operating-hours block, `chair_count >= 1`, and one active service, and only `published` shops are publicly visible. `pending_review` is retained so re-enabling costs one lifecycle branch, one admin route, and one queue screen; schedule that with the Phase 4 staff admin console. Revisit when the first real shop publishes or that console lands. **This no longer blocks closing Phase 2.**

## Verification approach (decided 2026-07-24)

Professional verification is simplified for the MVP so onboarding works without
building document IDV first:

- **Now (near-term, unblocks Phase 3 testing):** barbers and shop owners verify by
  **email + SMS OTP**, then a **human approves** through the existing
  `/admin/verifications` queue. Document requirements are set to none; the whole
  evidence + malware-scan pipeline stays in the code, dormant. SMS starts on a
  free dev/test path (prints the code) so the flow runs at zero cost; a real PH
  provider is wired later.
- **Deferred until scale ("when famous"):** re-enable required documents
  (government ID + selfie, owner proof-of-control) and add automated
  ID + face/liveness + certificate/business-doc verification (buy an IDV provider,
  keep human-in-the-loop). Owner business docs cross-check PH registries
  (TESDA / DTI / SEC / BIR) where APIs allow. This is the trust-hardening pass.

Rationale: spend backend + security effort where it pays off now; the human
review queue already gives a fraud gate at MVP volume. Fully reversible by
flipping the document requirements back on.

## Deferred to the UX-polish pass

Agreed improvements intentionally postponed so the team can focus on backend and
security first (decision 2026-07-23). Schedule these in the Phase 4 experience
pass or a dedicated pre-launch polish slice, not mid-packet.

- **Superseded 2026-08-01 by D-031: the landing is now the hero and nothing
  else.** `#how`, `#services`, `#contact`, and the footer are deleted, along with
  the header nav's Services and Contact Us links and the hero's "Watch the
  Video" button, since each pointed at an anchor that no longer exists.
  `LandingPage.tsx` went 729 → 112 lines and `LandingPage.css` 3602 → 977. Of the
  173 unreachable CSS classes only 41 were orphaned by that cut; 132 were already
  dead. Rive was deleted with it, which removed `'wasm-unsafe-eval'` from both CSP
  definitions. **The paragraph below describes the pre-D-031 landing and is kept
  only as the record of what was built.**
- **Landing + auth presentation — implemented locally 2026-07-29.** The
  landing now leads with a large doodle-forward value proposition and four
  aligned city-space scenes selected from live Philippine time. Morning shows
  students travelling to school, afternoon shows customers waiting at the
  barbershop, evening shows workers travelling home, and midnight leaves the
  sidewalks empty with sparse traffic; jeepneys anchor the Philippine street
  in every variant. One small sketched seam replaces the former dark portal.
  The former hero walker and live-city scene are disconnected and archived.
  The hero is art-only: the copy takes the left grid track and the right track
  stays empty so the scene's barbershop shows through the transparent section.
  (Corrected 2026-07-30: this line previously described inline SVG laptop and
  phone chassis holding animated product previews. They do not exist in any
  commit.)
  A unified sticky-index workflow covers lifecycle, customer, shop, and role
  facts.
  Guest auth CTAs link to one dedicated `/login` and `/signup` surface; the
  duplicate in-page modal has been removed. Latest browser
  evidence confirms all four time variants load and activate one at a time,
  the scene and barbershop fit without horizontal overflow from `1440x900`
  through `320x760`, obsolete hero layers are absent, SVG device frames and
  internal UI motion are active, and console errors are zero. Reduced-motion
  CSS disables the crossfade and internal UI animations.
  This polish does not start P2-07 or change packet counts.

## Latest automated gate (2026-08-02)

Re-measured this session:

```text
Typecheck: all workspaces passed
Unit:      shared 62, api 29, web 40 (131 total; 62 integration skipped)
Lint:      ESLint 9, 0 errors 0 warnings, all three workspaces
Build:     API + web production build passed
DB lint:   no schema errors
Matrix:    API integration/direct-RLS workspace 91/91 twice back to back,
           no reset between runs, against a database replayed from empty
           through all 58 migrations up to 20260802000500
Browser:   Phase 3 acceptance not run; product-owner checklist pending.
           Historical P2-08 preliminary instrumentation remains separate and
           final P2-08 owner acceptance is also deferred, not passed.
Diff:      git diff --check clean
Tree:      P3-01..P3-09 implementation and roadmap updates are uncommitted; main was already
           5 commits ahead of origin at the incoming clean handoff
```

**Read "Lint: passed" in any block dated before 2026-08-01 as meaning nothing.**
Until that date `npm run lint` fanned out `--if-present`, only `apps/api` had the
script, and it was `tsc --noEmit` — the same command as that workspace's own
`typecheck`. `apps/web` was never linted. It is now a real
`eslint . --max-warnings 0` over one flat config at the repo root, and its first
run found eleven issues, all fixed.

The matrix moved 81 → 82 with a regression covering an owner-provider reading the
timeline of their own booking over HTTP. That guard bug was live: every previous
owner-provider test called the RPC directly, so the Express guards had never been
exercised on that path. It then moved 82 → 85 with P2-08's three race probes.

The matrix moved 69 → 81 with P2-07's twelve new gated regressions, and the gated
skip count moved 41 → 53 for the same reason. Fast tests stay at 124 because every
new test needs the real database.

Clean-replay proof is now complete: `supabase db reset` replayed the entire
chain from an empty database through `20260728000700`, and the matrix then
passed 69/69 twice without another reset. All 13 commits are merged to `main` as
a fast-forward (`a281fb3..04af147`), so `main` carries zero merge commits and
its tree is identical to the verified branch.

One caveat: web unit tests moved 32 → 40 with the landing work, so the older
116 / 157 totals in dated blocks are historical, not current.

The expanded matrix includes the P2-02 public shop-detail projection and media
hardening, P4021 catalogue-invariant checks, P2-04 ownerless-resolution and
invitation-provenance regressions, and repeat-run fixture cleanup. Anonymous
clients receive only the published shop's allowlisted public facts, future
closures without private reasons, active services/prices, and ready+approved
media through short-lived signed URLs. Phase 3 is the latest implementation
milestone; its browser acceptance and P2-08's browser acceptance remain open.
The per-test breakdown lives in
[`../testing/`](../testing/README.md).

## Next up

**Run the product-owner Phase 3 browser acceptance, then record the result.**
P3-01 through P3-09 implementation and automated verification are green. The
consolidated checklist covers the owner/barber/customer journeys and four
required viewports without SQL shortcuts. It must not be recorded as passed
until executed. P2-08 browser acceptance is likewise still deferred.

Three follow-ups ride along rather than blocking anything:

- Phase 3 browser acceptance is not run; use the written customer/owner responsive,
  keyboard, reduced-motion, console, stale-session, duplicate-submit, manual,
  and instant checklist;
- the slot projection spends one subtransaction per candidate by design (D-022),
  measured at roughly fifty savepoints for a thirteen-hour day. That is fine at
  V1 volume. If a real shop's slot query ever gets slow, add a cheap pre-filter in
  front of the gate — never a second copy of the predicates;
- **D-029 Shop Setup readiness row closed 2026-08-01.** The checklist now reads
  saved provider eligibility and active-service qualifications through the
  existing qualification workspace, and Publish stays disabled until at least
  one provider qualifies. The remaining frontend copy follow-up is to make
  clear that enabling the owner capability makes the owner bookable during the
  shop's opening hours.

The agent's preliminary P2-08 evidence covered the two P2-06 follow-ups, but
the owner Staff/barber Schedule visible review and real reduced-motion result
remain pending product-owner browser acceptance.
