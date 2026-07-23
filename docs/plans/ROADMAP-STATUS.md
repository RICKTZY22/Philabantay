# V1 roadmap status — 2026-07-23

Single source of truth for packet-by-packet progress across all five phases.
Records **verified evidence**, not visual completion. When a claim is only
partially verified, it says so.

Legend: ✅ done and verified · 🔨 in progress · ⬜ not started · 🧹 needs polish.

## Progress at a glance

- **Phase 1 (foundation + identity): ✅ complete** — 7/7 packets, automated gate green.
- **Phase 2 (shops + workforce + availability): 🔨 in progress** — P2-01 done; P2-02 started.
- Phases 3–5: ⬜ not started.
- **Overall: about 8 of ~39 packets.**

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
| P2-02 Shop facts | 🔨 | **Slices 1–2 (operating hours + date closures): implemented full-stack; typecheck + unit + build green; migration reset and integration matrix PENDING (Docker down); not committed.** Remaining slices: media (storage upload), services editor UI, map-pin picker. |
| P2-03 Hiring state | ⬜ | off / open / full with optional counts. |
| P2-04 Employment convergence | ⬜ | application / invitation / join-code converge on one owner-approved request. |
| P2-05 Provider capabilities | ⬜ | owner-as-provider, service qualifications. |
| P2-06 Schedule authority | ⬜ | owner shifts + barber change requests. |
| P2-07 Availability engine | ⬜ | combine hours, closures, employment, qualification, shifts, buffers, overlap, chairs. |
| P2-08 Race gate | ⬜ | concurrent claim / capacity probes. |

## Phases 3–5 ⬜

- Phase 3 (booking + live operations): P3-01…P3-09.
- Phase 4 (trust, insights, settings, workspaces): P4-01…P4-09.
- Phase 5 (production hardening + rollout): P5-01…P5-06.

## Needs polishing / open items

1. **P2-02 slice 1 verification is pending Docker** — clean-reset the migration and run the full matrix (incl. the new hours RLS test), then commit.
2. **Phase 1 final browser/accessibility smoke** — re-confirm the session-restore no-flash fix (LR-033) and run the accessibility pass; this was the closeout step Codex did not finish.
3. **Independent adversarial re-scan (P1-07)** — Codex wrote both the code and its tests; a fresh adversarial pass raises confidence before Phase 1 is formally locked.
4. **Hours `PUT` is delete-then-insert (non-atomic)** — low risk for an owner editing their own shop; consider a single transactional RPC in a later pass.
5. **Catalogue helper naming** — `is_legacy_catalogue_eligible_shop` now means "published + eligible"; rename for clarity in a later packet.
6. **Integration test hygiene** — the `beforeAll` fixture does not delete its shops, so the exact-set catalogue assertion needs a clean reset before each matrix run (works via reset; could harden with `afterAll` cleanup or non-exact assertions).
7. **Docs** — keep traceability rows and this status current per packet.

## Deferred to the UX-polish pass

Agreed improvements intentionally postponed so the team can focus on backend and
security first (decision 2026-07-23). Schedule these in the Phase 4 experience
pass or a dedicated pre-launch polish slice, not mid-packet.

- **Landing + auth split.** Pull the auth form out of the landing hero. The
  landing should lead with the value proposition and clear CTAs (Get started /
  Log in) while keeping the "how it works" and role sections; add real `/login`
  and `/signup` routes (this also fixes the current deep-link fragility where
  those paths only redirect to `/` and read mode from router state). Keep the
  existing notebook + space-station brand: borrow structure, not skin, from
  marketing references. Touches routing, `AuthSlider`, redirect/`from` logic,
  and the GSAP scroll, so it is its own slice.

## Latest automated gate (2026-07-23)

Run by Claude Opus this session:

```text
Typecheck: all workspaces passed
Unit:      shared 42, api 25, web 19 (81 total)
Build:     web production build passed
Matrix:    52/52 on a clean local-Supabase reset (migrations through
           20260722001800; P2-01 lifecycle + all Phase 1 RLS/security probes)
```

The P2-02 migrations (`20260722001900_shop_operating_hours.sql`,
`20260722002000_shop_closures.sql`) and their hours/closures RLS tests are **not**
in that matrix run yet (Docker Desktop was stopped afterward).

## Next up

Finish P2-02: verify slices 1–2 (hours + closures) once Docker is up and commit,
then slices for media, the services editor, and the map-pin picker.
