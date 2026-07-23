# Claude Opus 4.8 prompt — Phase 1 professional access lock

You are the frontend agent collaborating with Codex on Philabantay V1.
Codex owns the backend/data/security packets P1-01 and P1-04. Your assignment
is **P1-02 Professional Access Lock — frontend only**.

## Read first, in this exact order

1. `docs/plans/README.md`
2. `docs/plans/00-V1-PRODUCT-CONTRACT.md`
3. `docs/plans/01-PHASE-1-FOUNDATION-IDENTITY.md`
4. `docs/plans/06-IMPLEMENTATION-WORKBREAKDOWN.md`
5. `docs/plans/LOGIC-LOOPHOLE-RESCAN-2026-07-22.md`
6. `docs/plans/UI-FRONTEND-MASTER-SPEC.md`
7. `docs/plans/QA-TRACEABILITY-MATRIX.md`
8. `docs/plans/AGENT-HANDOFF.md`
9. `docs/plans/OPEN-QUESTIONS.md`
10. `docs/systemarch/CODE-PATTERNS.md`
11. `docs/systemarch/ARCHITECTURE.md`

Then inspect the current shared account helpers, dashboard routing, navigation,
verification page/components, session restoration, sign-out path, tests, and
responsive CSS before editing.

## Requirements owned

- `ID-01`
- frontend portion of `SEC-03`
- frontend portion of `UX-01`, `UX-02`, and `A11Y-01` for verification lock
- logic finding `LR-003`
- work packet `P1-02`

## Approved product policy

Pending, rejected, or suspended professional accounts are absolutely locked.
This applies to both requested roles: `barber` and `shop_owner`.

While locked, the authenticated user may access only:

- verification status and evidence submission/resubmission when allowed;
- a small help/support explanation;
- sign out.

They must not access customer browsing, hiring, owner setup, dashboard,
messages, bookings, settings, or any barber/owner operational route. Do not
grant a temporary customer experience merely because the stored effective role
is still `customer` while verification is pending.

Customers with `requested_role=customer` and `verification_status=not_required`
are unaffected.

## Scope

Implement the frontend lock shell and verification experience in `apps/web`.
You may add or update focused component tests. Reuse existing shared types and
helpers where possible.

Expected UI behavior:

1. Session restoration must decide the access state before rendering protected
   content; no forbidden-dashboard flash.
2. A locked professional sees one large, polished, responsive verification
   workspace—not the tiny preview banner currently shown.
3. Navigation is replaced by a restricted shell. The hamburger menu, if kept,
   contains only Verification/Status, Help, and Sign out.
4. Pending state explains that review is ongoing and prevents duplicate
   submission unless the contract explicitly allows an update.
5. Rejected state clearly shows the safe rejection reason when provided and a
   resubmit action when eligible.
6. Suspended state explains that access is restricted and provides the approved
   support path; it must not expose prior operational content.
7. Loading, empty, validation, upload failure, network failure, retry, success,
   stale session, forbidden, and sign-out-busy states must be explicit.
8. Preserve the Philabantay notebook/doodle visual language, but prioritize
   readability and focus. Do not redesign unrelated landing pages or dashboards.
9. Support 320 px mobile, tablet, desktop, keyboard-only use, visible focus,
   screen-reader names/status announcements, 200% zoom, reduced motion, and no
   color-only status meaning.
10. Direct navigation to any locked operational route must land on the locked
    verification workspace, not a blank page or partially rendered dashboard.

## Contract boundary

Do not:

- edit Supabase migrations, RLS, Express routes, or backend authorization;
- call Supabase directly;
- import or enable `MockBackend`;
- hardcode demo accounts, verification outcomes, credentials, or fake evidence;
- add page-specific fetch shortcuts outside `DataBackend`;
- invent a new role/status vocabulary;
- silently weaken the absolute lock because an API method is missing;
- touch owner dashboard redesign, hiring, booking lifecycle, or landing-page
  animation in this packet.

If the current `DataBackend` lacks a verification action or safe response field,
keep the mutation unavailable, show an honest state, and report the exact
missing method/DTO/error code to Codex. Do not fake success.

## Coordination and file ownership

Codex may concurrently edit shared types/schemas/services, migrations, and
`apps/api`. Do not edit these high-conflict files without first reporting why:

- `packages/shared/src/types.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/services.ts`
- migrations
- `apps/api/**`

You may inspect them. If a shared helper change is essential, propose the exact
signature in your handoff instead of making a conflicting edit.

Before editing, report:

```text
Requirements owned: ID-01, SEC-03(frontend), UX-01/02, A11Y-01, LR-003, P1-02
Current routes/components found:
Files you intend to edit:
Contract gaps discovered:
```

## Acceptance checks

At minimum verify:

- pending barber cannot reach hiring or barber dashboard;
- pending owner cannot reach Shop Setup, settings, reservations, or dashboard;
- rejected and suspended professional accounts cannot reach operational pages;
- locked account can view status/help and sign out;
- verified barber/owner and normal customer routing remain intact;
- refresh/deep-link produces no protected-content flash;
- keyboard and screen-reader status behavior works;
- layouts work at 320, 768, 1280, and 1920 px;
- web typecheck/build and focused tests pass.

Do not claim backend security is fixed. Frontend route guards are user
experience only; Codex will implement and test API/RLS denial independently.

## Required handoff

End with:

```text
Requirements addressed:
Outcome:
Changed files:
Routes/components changed:
Shared contract assumptions/gaps:
Tests and exact results:
Widths and accessibility checks:
Known gaps:
Files Codex must now touch:
Phase gate status: NOT COMPLETE / READY FOR INTEGRATION REVIEW
```

Show the proposed file list and current-state findings before making edits, then
implement this single packet. Stop after P1-02 and wait for integration review.
