# Claude Opus 4.8 packet — P1-01 canonical booking UI

You are the frontend agent collaborating with Codex on Philabantay V1. Run this
packet only after the focused P1-02 verification-lock follow-up. Codex owns
Supabase, Express, and shared contracts. You own the `apps/web` booking UI and
the development-only mock adapter behavior required by that UI.

## Read first

1. `docs/plans/00-V1-PRODUCT-CONTRACT.md`
2. `docs/plans/01-PHASE-1-FOUNDATION-IDENTITY.md`
3. `docs/plans/03-PHASE-3-BOOKING-LIVE-OPERATIONS.md`
4. `docs/plans/06-IMPLEMENTATION-WORKBREAKDOWN.md`
5. `docs/plans/LOGIC-LOOPHOLE-RESCAN-2026-07-22.md`
6. `docs/plans/QA-TRACEABILITY-MATRIX.md`
7. `docs/systemarch/CODE-PATTERNS.md`
8. `docs/systemarch/ARCHITECTURE.md`

Inspect the current `BookingService`, appointment types/labels, owner
reservations UI, customer appointments UI, barber booking UI, and
`MockBackend` before editing.

## Confirmed integration defect

The real API creates a new request with canonical status `requested`. The
owner reservation table currently renders Accept/Decline only when status is
legacy `pending`, and calls `bookings.setStatus(..., 'confirmed'|'cancelled')`.
Therefore a real request can appear without any owner decision controls.

The shared service already exposes the correct versioned commands:

```ts
bookings.accept(appointmentId, { expected_version })
bookings.decline(appointmentId, { expected_version, reason })
```

Do not edit those shared contracts.

## Required changes

1. Owner Reservations shows decision controls for a future `requested`
   appointment, never based on legacy `pending`.
2. Accept uses `bookings.accept` with the row's current `version`.
3. Decline collects a real, non-empty owner reason in an accessible inline
   form or existing modal and uses `bookings.decline` with the current
   `version`. Do not silently convert decline into generic cancellation.
4. On success, merge the authoritative returned row and announce the result.
   On stale-version conflict, explain that the booking changed and refresh the
   authoritative list. Prevent double submit.
5. Canonical statuses are displayed and filtered consistently across owner,
   barber, and customer booking surfaces:

   `requested`, `confirmed`, `checked_in`, `in_progress`,
   `awaiting_confirmation`, `completed`, `declined`, `expired`,
   `customer_cancelled`, `shop_cancelled`, `customer_no_show`, `disputed`.

6. Remove operational branches keyed only to legacy `pending`, `accepted`,
   `cancelled`, or `no_show`. If a development migration shim is still needed
   for persisted mock data, normalize it once at the mock persistence boundary
   and document it; do not spread aliases through components.
7. Update `MockBackend` so the same UI uses the same canonical command behavior
   and optimistic-version checks. Do not add fake production data or demo
   accounts.
8. Preserve the hamburger-menu owner navigation and current visual design.
   This packet is lifecycle correctness, not a dashboard redesign.

## Required state and accessibility behavior

- loading, empty, submitting, success, validation, API/network failure, stale
  conflict, and already-decided states are explicit;
- keyboard users can open/cancel/submit the decline reason flow;
- validation and async result use appropriate labels and live status/alert;
- buttons remain understandable without color;
- no duplicate action controls after the authoritative status changes;
- mobile table/card behavior remains usable at 320 px.

## File ownership

Expected files are under:

- `apps/web/src/components/ShopOwnerDashboard.tsx` and its CSS/tests;
- `apps/web/src/pages/AppointmentsPage.tsx` and focused status-label helpers;
- barber booking components if they contain legacy-only branches;
- `apps/web/src/services/mock/**` only where canonical mock behavior is needed;
- `apps/web/test/**`.

Do not edit:

- `apps/api/**`
- `packages/shared/**`
- `supabase/**`
- verification UI being handled by the preceding Opus packet
- unrelated landing/dashboard animation

Report any missing shared DTO or error code to Codex instead of inventing a
parallel contract.

## Acceptance tests

At minimum prove:

- a real-shaped `requested` row exposes Accept and Decline;
- Accept sends the exact current version and renders `confirmed` from the
  response;
- Decline requires a reason, sends the exact version, and renders `declined`;
- stale conflict refreshes rather than overwriting;
- non-requested rows expose no owner decision buttons;
- all canonical statuses have a safe human-readable label/filter class;
- legacy mock persistence, if retained, is normalized at one boundary;
- web tests, typecheck, and production build pass;
- 320, 768, and 1280 px checks pass.

End with:

```text
Requirements addressed:
Changed files:
Canonical-state changes:
Owner decision flow before/after:
Tests and exact results:
Responsive/accessibility checks:
Shared/API gaps for Codex:
Known gaps:
Phase gate status: READY FOR CODEX INTEGRATION REVIEW / NOT READY
```

Stop after this packet. Do not begin Phase 2.
