# V1 roadmap status - 2026-07-29

Single source of truth for packet-by-packet progress across all five phases.
Records **verified evidence**, not visual completion. When a claim is only
partially verified, it says so. Per-test detail lives in
[`../testing/`](../testing/README.md).
Model and effort recommendations live in
[the model routing guide](MODEL-ROUTING-GUIDE.md); they do not change verified
packet status.

Legend: ✅ done and verified · 🔨 in progress · ⬜ not started · 🧹 needs polish.

## Progress at a glance

- **Phase 1 (foundation + identity): ✅ complete** — 7/7 packets, automated gate green.
- **Phase 2 (shops + workforce + availability): 🔨 in progress** — P2-01 through P2-05 verified complete; P2-06 implementation gate green, independent sign-off pending.
- Phases 3–5: ⬜ not started.
- **Overall: 12 of ~39 packets.**

## Phase 1 — foundation and identity ✅

Automated gate re-run and verified on 2026-07-23 (see "Latest gate" below).

| Packet | Status | Verified | Polish / open |
| --- | --- | --- | --- |
| P1-01 Baseline + vocabulary | ✅ | Canonical appointment states across active code; legacy names only in the read-normalizer. | — |
| P1-02 Professional access lock | ✅ | Frontend lock (barber + owner) on the shared predicate; real `VerificationService` + `AdminService`; admin review UI. API + RLS matrix green. | 🧹 Final session-restore browser smoke (no public/dashboard flash) not re-run this session (LR-033, reported fixed by Codex). |
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
| P2-06 Schedule authority | 🔨 | Slices 1, 2a, and 2c are implemented and locally verified. Migration `20260728000600` drops legacy self-write RPCs, requires request idempotency keys, and enforces pending/resolved invariants. Canonical owner routes version weekly patterns and exceptions; the barber view is read-only and submits structured change requests; approval applies the exception, links it, advances the revision, and appends an event transactionally. Clean reset through `00600`; matrix 69/69 twice; 116 fast tests; typecheck/lint/build/DB-lint/diff green. Authenticated desktop/mobile smoke passed weekly and exception edits, approval, stale-session refresh, keyboard-native controls, reduced motion, and no console errors. Follow-up `20260728000700` closes the last known gap: the booking-conflict guard now takes the resulting window, so narrowing hours or approving a `different_hours` request is refused when it would leave an active booking outside availability (previously only a full day off was checked, and times were ignored). Regression covers the narrowed-window refusal and a wide window still being accepted. Independent packet sign-off remains pending, so status stays 🔨. |
| P2-07 Availability engine | ⬜ | combine hours, closures, employment, qualification, shifts, buffers, overlap, chairs. |
| P2-08 Race gate | ⬜ | concurrent claim / capacity probes. |

## Phases 3–5 ⬜

- Phase 3 (booking + live operations): P3-01…P3-09.
- Phase 4 (trust, insights, settings, workspaces): P4-01…P4-09, now including the
  **staff admin console** (see below).
- Phase 5 (production hardening + rollout): P5-01…P5-06.

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

1. **Phase 1 final browser/accessibility smoke** — re-confirm the session-restore no-flash fix (LR-033) and run the accessibility pass; this was the closeout step Codex did not finish.
2. **Independent adversarial re-scan (P1-07)** — Codex wrote both the code and its tests; a fresh adversarial pass raises confidence before Phase 1 is formally locked.
3. **Catalogue helper naming** — `is_legacy_catalogue_eligible_shop` now means "published + eligible"; rename for clarity in a later packet.
4. **Remote rollout (Phase 5)** — the P2-04 hotfix and bounded hardening migrations/API intentionally remain local until the production-rollout phase selects and configures the hosted Supabase/API/web targets.
5. **Customer detail UI** — the real public-detail contract exists, but the customer-facing detail screen still needs to consume all of it; honest live availability remains P2-07.
6. **Q4 first-publication admin review is not implemented (found 2026-07-29).** The product owner accepted on 2026-07-22 that "first publication requires a lightweight admin review of shop control/address/location," with later ordinary edits publishing immediately. `api_publish_owner_shop` in `20260726000100` instead sets `lifecycle_status = 'published'` directly, so first publication is self-service. The `pending_review` enum value exists from `20260722001800` and is referenced in `types.ts` and `ShopSetupPage.tsx`, but **nothing ever sets it** and no admin shop-review route exists (the admin surface covers verifications only). This is an accepted decision the implementation silently bypasses. It needs either an implementation packet or a dated decision reversing Q4. Do not treat Phase 2 as closed while it is open.

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
  (Corrected 2026-07-29: this line previously described inline SVG laptop and
  phone chassis holding animated product previews. They do not exist in any
  commit.)
  A unified sticky-index workflow covers lifecycle, customer, shop, and role
  facts.
  Guest auth CTAs open the existing real forms in an accessible in-page modal;
  `/login` and `/signup` remain direct deep-link fallbacks. Latest browser
  evidence confirms all four time variants load and activate one at a time,
  the scene and barbershop fit without horizontal overflow from `1440x900`
  through `320x760`, obsolete hero layers are absent, SVG device frames and
  internal UI motion are active, and console errors are zero. Reduced-motion
  CSS disables the crossfade and internal UI animations.
  This polish does not start P2-07 or change packet counts.

## Latest automated gate (2026-07-29)

Re-measured this session:

```text
Typecheck: all workspaces passed
Unit:      shared 56, api 28, web 40 (124 total; 41 integration skipped)
Lint:      passed
Build:     API + web production build passed
DB lint:   no schema errors
Matrix:    API integration/direct-RLS workspace 69/69 twice back to back,
           no reset between runs, against a database carrying every
           migration through 20260728000700
Tree:      all Phase 2 work committed; working tree clean
```

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
media through short-lived signed URLs. P2-05 remains the latest completed
packet. The per-test breakdown lives in
[`../testing/`](../testing/README.md).

## Next up

P2-06 Slice 2c is implemented and its local gate is green. Keep the packet 🔨
until an independent review/product sign-off is recorded. Do not begin P2-07.
