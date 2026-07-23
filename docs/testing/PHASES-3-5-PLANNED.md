# Phases 3-5 tests - planned

No automated tests exist yet for these phases; the work is not started. This
file is a placeholder so the testing catalog stays complete across all five
phases, and it records the test focus each packet will need when it is built.

Source of truth for scope:
[../plans/03-PHASE-3-BOOKING-LIVE-OPERATIONS.md](../plans/03-PHASE-3-BOOKING-LIVE-OPERATIONS.md),
[../plans/04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md](../plans/04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md),
[../plans/05-PHASE-5-PRODUCTION-ROLLOUT.md](../plans/05-PHASE-5-PRODUCTION-ROLLOUT.md).

## Phase 3 - booking and live operations (P3-01…P3-09) ⬜

Planned test focus: end-to-end booking creation and lifecycle over the real
availability engine, live status transitions, notifications, and the customer and
provider day views. Expect both API-boundary tests and gated local-Supabase race
tests for concurrent booking and capacity.

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

## When you build one of these

1. Add the tests alongside the code in the matching workspace.
2. Update [../plans/ROADMAP-STATUS.md](../plans/ROADMAP-STATUS.md) and
   [../plans/QA-TRACEABILITY-MATRIX.md](../plans/QA-TRACEABILITY-MATRIX.md).
3. Replace the relevant section here with a real test catalog like the Phase 1
   and Phase 2 files, and record any findings.
