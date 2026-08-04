# P3-01 request / accept / assign handoff

Status: implementation and automated verification complete; owner browser acceptance pending

Started: 2026-08-02

Dependency: P2-07 verified
Requirements: BOOK-01, BOOK-03

## Evidence boundary

P3-01 began at the product owner's direction while P2-08's final owner-run
browser acceptance is deferred. That skipped check is not a pass and Phase 2
remains formally open.

## Measured current truth

Already implemented and retained:

- `api_create_appointment` claims through the P2-07 availability gate and always
  creates a manual `requested` reservation today;
- requested rows receive a 15-minute `expires_at` deadline and block inventory;
- exact, preferred, and any intent resolve transactionally, with deterministic
  automatic assignment and assignment reason/source fields;
- appointment creation and lifecycle transitions append immutable events;
- protected owner accept and decline routes use optimistic versions, and the
  Reservations screen exposes both actions;
- protected owner reassignment exists in SQL, Express, and the shared adapter,
  including an immutable reassignment event.

Measured gaps:

1. `shops.booking_mode` is stored, editable, and public, but creation ignores it
   and always returns `requested`; instant confirmation is not implemented.
2. The authenticated `/availability` and `/bookings/quote` endpoints existed,
   but the shared web adapter exposed neither, leaving the customer UI unable to
   consume the authoritative engine.
3. The current quote returns assignment and service facts, but not the planned
   policy snapshot, request expiry, or idempotency key.
4. The customer shop detail has services and live-now staff only. It has no
   service/date/intent/slot/review/create workspace.
5. Owner accept/decline is present, but decline uses a fixed generic reason and
   owner assign/reassign is not exposed in the Reservations UI.
6. Appointment responses do not yet return server-authoritative allowed actions;
   the UI still derives buttons from status.

## Slice 1 — web contract seam

Implemented 2026-08-02:

- added strict `AvailabilityDay`, `AvailabilitySlot`, and `BookingQuote` client
  schemas/types;
- added `availability.getDay(...)` for customer-aware, multi-provider slots;
- added `bookings.quote(...)` for advisory review data;
- covered authenticated query construction, request body, response parsing, and
  bearer authorization in the shared adapter test.

Focused evidence:

```text
shared ApiBackend tests  21 passed
typecheck                all workspaces passed
```

Full repository gate:

```text
typecheck   passed
lint        passed with zero warnings
fast tests  130 (shared 62, API 28, web 40)
build       API + web production build passed
diff        git diff --check clean
matrix      skipped; no apps/api or Supabase file changed
```

## Completed implementation

- customer service, exact/preferred/any intent, local-date availability, slot,
  notes, quote/review, and create workspace;
- one idempotent transactional create command with payload-mismatch refusal;
- manual requests with 15-minute holds and atomic instant confirmation;
- restricted customers forced to manual even at instant shops;
- quote policy fields for effective mode, timezone, expiry, cleanup buffer,
  cancellation cutoff, and the retained idempotency key;
- appointment API projections now include preference and assignment facts;
- owner accept, decline with a supplied reason, and assign/reassign UI for
  preferred/any choices.

## Final verification

```text
clean migration replay  passed through 20260802000200
DB lint                 no schema errors
fast tests              131 (shared 62, API 29, web 40)
API/RLS matrix          86/86 twice, no reset between runs
typecheck               all workspaces passed
lint                    zero errors and zero warnings
production build        API + web passed
git diff --check        clean
browser                 skipped at product-owner request
```

The product-owner checklist is
[P3-01 manual browser checklist](../testing/P3-01-MANUAL-BROWSER-CHECKLIST.md).
P3-01 must not be marked fully verified until that result is recorded.
