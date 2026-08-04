# P3-02 change and disruption handoff

Status: implementation and automated verification complete 2026-08-02; browser pending

Requirements: BOOK-03, VISIT-02, EXC-01

Dependency: P3-01 implementation gate green; owner browser acceptance pending

## Slice 1 — exact-choice consent guard

The audit found that `api_reassign_appointment` allowed an owner to replace an
`exact` customer choice without customer consent. The old behavior was
falsified through the real HTTP/RPC stack before the repair:

```text
expected HTTP 409
received HTTP 200
```

Migration `20260802000200_p3_02_exact_reassignment_consent_guard.sql` now makes
the owner reassignment command refuse exact-choice replacements with P4021 /
`precondition_failed`. Preferred and any bookings retain audited owner
reassignment. The owner UI hides the action for exact choices and explains that
customer approval is required.

Verification after a clean replay:

```text
focused regression  passed
API/RLS matrix       86/86 twice, no reset between runs
DB lint              no schema errors
```

## Completed proposal and disruption slice

`appointment_change_proposals` and versioned propose/respond commands now cover
provider, service, and time changes. Approval locks the appointment, checks the
expected version, rechecks canonical capacity/availability, and updates only
after customer consent. Rejection or conflict preserves the original booking and
records immutable evidence/attention instead of silently mutating it.

Booked timezone and cancellation-cutoff facts are frozen on the appointment.
Delay reporting, late-policy classification, shop closure, service retirement,
employment end, and provider absence create disruption/attention facts with
suggested alternatives; they never guess a replacement or cancellation.

Final clean replay, zero-finding database lint, and the 91/91 API/RLS matrix
twice cover HTTP consent, foreign/direct-write refusal, conflict preservation,
and notification creation. The remaining acceptance is the product-owner
browser journey in [the Phase 3 checklist](../testing/P3-09-MANUAL-BROWSER-CHECKLIST.md).
