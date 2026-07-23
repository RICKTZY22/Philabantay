# Philabantay V1 implementation plan

This folder is the **authoritative implementation plan** for Philabantay V1.
It consolidates the product decisions, workflows, UI direction, backend work,
security rules, and release gates discussed through 2026-07-22.

The documents in `docs/` remain useful explanations and historical records.
When an older roadmap conflicts with this folder, use this folder for intended
V1 behavior, then verify current technical behavior against shared contracts
and versioned Supabase migrations.

## Read order

1. [V1 product contract](00-V1-PRODUCT-CONTRACT.md)
2. [Phase 1: foundation and verified identities](01-PHASE-1-FOUNDATION-IDENTITY.md)
3. [Phase 2: shops, workforce, and availability](02-PHASE-2-SHOP-WORKFORCE-AVAILABILITY.md)
4. [Phase 3: booking and live operations](03-PHASE-3-BOOKING-LIVE-OPERATIONS.md)
5. [Phase 4: trust, insights, and experience](04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md)
6. [Phase 5: production rollout](05-PHASE-5-PRODUCTION-ROLLOUT.md)
7. [UI/frontend master specification](UI-FRONTEND-MASTER-SPEC.md)
8. [Backend, data, and security master specification](BACKEND-DATA-SECURITY-MASTER-SPEC.md)
9. [QA and traceability matrix](QA-TRACEABILITY-MATRIX.md)
10. [Implementation work breakdown](06-IMPLEMENTATION-WORKBREAKDOWN.md)
11. [Latest logic/loophole rescan](LOGIC-LOOPHOLE-RESCAN-2026-07-22.md)
12. [Agent handoff and collaboration rules](AGENT-HANDOFF.md)
13. [Clarifications and decision register](OPEN-QUESTIONS.md)
14. [Current Phase 1 execution status](PHASE-1-STATUS-2026-07-22.md)
15. [Frozen P1-02/P1-05 verification contract](P1-02-P1-05-VERIFICATION-CONTRACT.md)

## Five phases at a glance

| Phase | Outcome | Cannot start until | Exit summary |
| --- | --- | --- | --- |
| 1. Foundation and identity | Contracts, authorization, professional verification, admin review | Current Supabase/Express baseline is checkpointed | Roles cannot be self-granted; tenant and direct-write bypass tests pass. |
| 2. Shops, workforce, availability | A verified owner can publish one real shop and employ qualified staff; bookability is trustworthy | Phase 1 role/capability model is stable | Published supply, employment, schedules, hours, qualifications, and chair capacity agree under concurrency. |
| 3. Booking and live operations | Customers, barbers, and owners can run booked and walk-in visits end to end | Phase 2 availability engine is authoritative | Full visit, disruption, closeout, offline payment, and notification scenarios pass through normal UI/API paths. |
| 4. Trust, insights, experience | Disputes, ratings, communications, analytics, settings, and accessibility are operational | Phase 3 events and payment facts are reliable | Trust queues and metrics are auditable; every role has a complete, responsive workspace. |
| 5. Production rollout | Hardened, monitored, recoverable release | All feature gates pass | Security, restore, migration, load, accessibility, browser, and rollout gates pass. |

```mermaid
flowchart LR
    P1["1. Foundation + identity"] --> P2["2. Shops + workforce + availability"]
    P2 --> P3["3. Booking + live operations"]
    P3 --> P4["4. Trust + insights + experience"]
    P4 --> P5["5. Production rollout"]
```

## Status words

| Word | Meaning |
| --- | --- |
| **CURRENT** | Present in code or migrations and verified enough to extend. |
| **PARTIAL** | A real foundation exists, but a required path or rule is missing. |
| **TARGET** | Approved V1 behavior described by this plan. |
| **OPEN** | Needs the product owner's answer before the affected task begins. |
| **POST-V1** | Explicitly excluded from this V1 release. |

## Rule hierarchy for agents

When two sources disagree, use this order:

1. Security and data-integrity invariants in this plan.
2. Explicit decisions in `00-V1-PRODUCT-CONTRACT.md`.
3. The relevant phase file and master specification.
4. Current shared contracts and Supabase migrations for what works today.
5. Historical documents under `docs/` for background only.

No agent should silently choose a different product policy. Add the conflict to
`OPEN-QUESTIONS.md`, mark dependent work blocked, and continue with unrelated
tasks.

## Required implementation order

Every vertical slice follows the repository's existing inside-out pattern:

1. Shared domain type, DTO, Zod schema, and pure rule.
2. Forward-only Supabase migration, constraints, indexes, RLS, and RPCs.
3. Express authorization, validation, error mapping, and route.
4. `DataBackend` interface plus every active adapter.
5. React route/page/components and all async states.
6. Unit, contract, RLS, API, browser, accessibility, and concurrency tests.
7. Documentation and traceability update.

The frontend must never invent operational truth locally, import the mock
backend, call Supabase directly, or depend on a control that has no protected
backend command.

## Scope safety

- Do not rebuild the appointment lifecycle already implemented on 2026-07-18.
  Extend the canonical states, versioned RPCs, and immutable event history.
- Do not restore seeded demo accounts, hardcoded credentials, or fake activity.
- Do not label booked or completed service value as revenue. V1 records offline
  collections and refunds; online payment processing is post-V1.
- Do not expose a second desktop tab bar. Role navigation belongs in the shared
  hamburger drawer, with contextual actions inside pages.
- Do not show placeholder controls or fake graphs. Empty states must be honest.

## Review checkpoints

The product owner reviews and accepts each phase before the next phase begins.
A phase is accepted only when its exit gate and traceability rows are green;
"the screen looks finished" is not enough.

## Active frontend collaboration packets

Run these in order; both are frontend-only and stop before Phase 2:

1. [`CLAUDE-OPUS-4.8-P1-02-FOLLOWUP.md`](CLAUDE-OPUS-4.8-P1-02-FOLLOWUP.md)
   fixes the session-restore content flash, honest verification copy, and lock
   error/test coverage found by the live browser smoke test.
2. [`CLAUDE-OPUS-4.8-P1-01-BOOKING-UI.md`](CLAUDE-OPUS-4.8-P1-01-BOOKING-UI.md)
   moves owner/customer/barber booking surfaces to the canonical versioned
   appointment commands and removes legacy operational status branches.
