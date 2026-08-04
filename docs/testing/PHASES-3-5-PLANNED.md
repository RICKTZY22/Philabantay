# Phases 3-6 tests - planned

Phase 3 implementation is complete with browser acceptance pending; Phases 4-6
have not started. This file keeps the testing
catalog complete across all six phases and records current evidence plus the
focus each remaining packet will need.

Source of truth for scope:
[../plans/03-PHASE-3-BOOKING-LIVE-OPERATIONS.md](../plans/03-PHASE-3-BOOKING-LIVE-OPERATIONS.md),
[../plans/04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md](../plans/04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md),
[../plans/05-PHASE-5-PRODUCTION-ROLLOUT.md](../plans/05-PHASE-5-PRODUCTION-ROLLOUT.md),
[../plans/06-PHASE-6-DEPLOYMENT-UI-UX-POLISH.md](../plans/06-PHASE-6-DEPLOYMENT-UI-UX-POLISH.md).

## Phase 3 - booking and live operations (P3-01…P3-09) 🔨

P3-01 through P3-09 implementation and automated verification completed
2026-08-02. The final tree replayed all 58 migrations from empty, DB lint returned
zero findings, 131 fast tests passed, and the 91-test API/RLS matrix passed twice
without a reset. Typecheck, zero-warning ESLint, production build, and diff check
also passed.

Coverage includes idempotent manual/instant booking; consent-safe proposals and
conflicts; delay/disruption attention; visit/no-show/appeal state; durable and
single-use walk-in claims; independent payment facts; outbox failure/retry; and
repeat closeout that never guesses. See the
[Phase 3 completion handoff](../plans/P3-09-PHASE-3-JOURNEY-HANDOFF.md).

Browser execution was explicitly skipped at the product owner's direction.
Use the [consolidated P3-09 checklist](P3-09-MANUAL-BROWSER-CHECKLIST.md). P3-09
and Phase 3 remain acceptance-pending until those results are recorded.

## Phase 4 - trust, insights, settings, workspaces (P4-01…P4-09) ⬜

Planned test focus: reviews and trust signals, owner insights and reporting,
account and shop settings, and multi-workspace boundaries. Expect projection
tests (no private data in insights) and RLS isolation tests per workspace. The
deferred landing + auth split (see the roadmap) lands in this phase's experience
pass and will want routing and redirect tests.

## Phase 5 - production hardening and rollout (P5-01…P5-06) ⬜

Planned test focus: load and rate-limit behaviour, migration and rollback drills,
observability and error budgets, and the production security re-scan. Expect the
independent adversarial re-scan carried over from P1-07 to be formalized here.

## Phase 6 - final deployment and UI/UX polishing (packets TBD) ⬜

Detailed test scope is intentionally pending the product-owner-authored plan,
acceptance criteria, and layouts. Phase 6 must retain the Phase 5 release gates
and include evidence for the final deployment plus approved responsive,
accessible UI/UX polish.

## When you build one of these

1. Add the tests alongside the code in the matching workspace.
2. Update [../plans/ROADMAP-STATUS.md](../plans/ROADMAP-STATUS.md) and
   [../plans/QA-TRACEABILITY-MATRIX.md](../plans/QA-TRACEABILITY-MATRIX.md).
3. Replace the relevant section here with a real test catalog like the Phase 1
   and Phase 2 files, and record any findings.
