# P3-09 Phase 3 journey handoff

Status: implementation and automated verification complete 2026-08-02; product-owner browser acceptance pending

Requirements: BOOK-01..03, VISIT-01..02, EXC-01, WALK-01, PAY-01, NOTIF-01, CLOSE-01

Dependency: P3-01 through P3-08 implementation complete

## Delivered scope

- P3-01: customer exact/preferred/any booking, advisory quote, customer-scoped
  idempotency, manual approval/expiry, instant confirmation, restricted-account
  fallback, and owner accept/decline/assign actions.
- P3-02: versioned provider/service/time proposals, customer accept/reject,
  capacity recheck on acceptance, exact-choice consent, frozen policy facts,
  delay reporting, and disruption attention without silent mutation.
- P3-03: expiring single-use check-in codes, owner fallback check-in, start,
  finish, customer confirmation, timeout, and dispute resolution through
  versioned lifecycle commands and immutable events.
- P3-04: owner or assigned-provider no-show after grace, seven-day appeals,
  owner decisions, reversible strike facts, and the rolling three-in-90-days
  restriction.
- P3-05: staff-created walk-ins, public single-use claim, durable failed-attempt
  counting, manual fallback, customer linking only after verified phone match,
  and queue/visit transitions.
- P3-06: offline collection records, replay-safe idempotency, narrow cashier
  capability, and separate correction/refund/void events. Visit completion never
  implies payment.
- P3-07: transactional outbox plus required in-app notification facts,
  idempotent delivery attempts, retry/backoff, and dead-letter state.
- P3-08: idempotent shop/date closeout, due lifecycle processing, unresolved
  attention items, and no inferred attendance or payment.
- P3-09: integrated owner/barber/customer operational workspaces, shared typed
  contracts, API projections, RLS/HTTP/race/retry regressions, and the manual
  journey checklist.

The public walk-in claim projection is allowlisted and excludes staff notes and
creator facts. Authenticated direct writes to operational tables are denied;
state changes use service-role-only commands that recheck actor, tenant, state,
version, and relevant capacity.

## Verification evidence

Final proof used the current working tree after replaying an empty local database
through all 58 migrations, ending at
`20260802000500_p3_walk_in_payment_closeout.sql`.

```text
typecheck       all workspaces passed
lint            zero warnings
fast tests      131 passed (shared 62, API 29, web 40)
production build passed
diff check      clean
database reset  passed through all 58 migrations
database lint   zero findings
API/RLS matrix  91/91, then 91/91 again without reset
```

The matrix covers duplicate booking replay, changed-payload refusal, proposal
consent/conflict, direct-write isolation, notification provider failure/retry,
durable guest-code failures and replay refusal, independent payment corrections,
no-show grace/appeal/strike/waiver/restriction, and repeat closeout without
guessing.

## Acceptance still required

No browser test was run for this completion pass, at the product owner's
direction. Phase 3 must not be called fully accepted until the results from
[the P3-09 manual browser checklist](../testing/P3-09-MANUAL-BROWSER-CHECKLIST.md)
are recorded. Timing/race/provider-failure cases identified as automated-only in
that checklist do not need SQL or manual database repair.

P2-08's deferred product-owner browser acceptance also remains a separate open
item; this handoff does not retroactively pass Phase 2.
