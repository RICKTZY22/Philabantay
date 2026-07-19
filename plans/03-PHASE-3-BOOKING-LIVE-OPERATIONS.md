# Phase 3 — booking, fulfillment, walk-ins, and live operations

## Outcome

At the end of Phase 3, a customer, barber, and owner can run a normal booking or
walk-in from intent through completion using only the public UI and protected
API. Delays, cancellations, no-shows, service changes, closures, closeout,
offline collections, and notification failure have explicit behavior.

## Existing lifecycle to extend, not rebuild

The current backend already implements canonical states, optimistic versions,
immutable appointment events, booked-service snapshots, 15-minute request
expiry, owner accept/decline/reassign, hashed check-in codes, check-in, start,
finish, customer confirmation/dispute, 120-minute auto-completion, and
customer-no-show marking. Phase 3 completes policies, capacity integration,
cross-role UI, and missing workflows around that foundation.

## Booking creation and confirmation

### Manual mode (default)

1. Customer chooses shop, service, date/time, barber intent, and notes.
2. Server returns a quote with exact service snapshot, policy snapshot,
   candidate assignment, expiry, and idempotency key.
3. Create transaction rechecks availability and creates `requested` plus a
   15-minute capacity hold.
4. Owner sees the request immediately and can accept/assign or decline with a
   reason.
5. Acceptance rechecks provider/customer/chair capacity and creates the
   confirmation event. Expired requests cannot be accepted.

### Instant mode

1. Same quote and intent collection.
2. One transaction chooses/validates the provider and capacity.
3. Appointment is created as `confirmed`; no state is exposed between capacity
   claim and confirmation.
4. Strike-restricted customers still use manual approval even at an instant
   shop.

### Preference behavior

- Exact replacement requires a versioned proposal and customer approval.
- Preferred may use a qualified replacement according to the agreed policy;
  notification and penalty-free accept/reschedule/cancel actions are shown.
- Any uses Phase 2's least-assigned-service-minutes algorithm.
- A material post-confirmation reassignment displays the reason and actual
  provider in the timeline.

## Canonical cross-role state and actions

| State | Customer | Assigned barber | Owner | System |
| --- | --- | --- | --- | --- |
| `requested` | View countdown, cancel | View only if assigned | Accept/assign or decline | Expire after 15 min |
| `confirmed` | Cancel/reschedule under policy, get check-in help | View details, report delay | Reassign, cancel, issue code | Send reminders |
| `checked_in` | View queue/status | Start, contact | Manual correction/attention | Detect lateness |
| `in_progress` | View service state, approve amendment | Propose amendment, finish | Authorized fallback/monitor | Track actual time |
| `awaiting_confirmation` | Confirm or dispute | View result | View/resolve dispute later | Auto-complete after 120 min |
| `disputed` | Evidence/status/escalate later | View relevant state | Resolve first level | Keep unresolved |
| terminal states | History, eligible rating/receipt | History/performance | History/analytics/correction | Retain events |

Buttons are driven by server-returned allowed actions, version, and deadlines.
The UI may explain rules but must not duplicate them as the authority.

## Customer frontend

### Discovery and booking workspace

- Start from shop/service or barber detail, never lose the selected shop.
- Step summary: service → barber intent → date/time → notes → policy/review.
- Show duration, booked value, buffer impact only when useful, shop timezone,
  manual/instant behavior, cancellation cutoff, and request expiry.
- Availability refresh preserves valid choices and clearly marks a lost slot.
- A slot conflict returns nearby times/providers instead of a generic failure.
- Duplicate click/retry uses the same idempotency key.

### Booking action center

Routes:

```text
/appointments
/appointments/:appointmentId
```

- Tabs/filters: Needs action, Upcoming, and History.
- Detail includes status, countdown/deadline, shop, actual provider, service,
  booked/final value, check-in instructions, conversation link, and event
  timeline in plain language.
- Actions: cancel with reason, reschedule, respond to substitution/change,
  check in, confirm completion, dispute, and rate when eligible.
- Mobile uses agenda cards and full-screen detail with one sticky valid action;
  desktop may use agenda/calendar plus detail drawer.

## Barber frontend

### Hamburger destinations

```text
Home
Today's Chair
Schedule & attendance
Messages
Professional profile
Notifications
Settings
Sign out
```

### Today's Chair (`/chair`)

- Chronological operational list: upcoming assigned, waiting/checked-in,
  in-progress, awaiting confirmation, completed, and attention.
- Each card shows customer, service, booked/final duration/value, time,
  preference/assignment reason where relevant, notes, and timeline.
- Actions: issue/show check-in code when authorized, start, propose change,
  finish, report delay, contact shop/customer, request reassignment, and mark
  no-show after grace with reason.
- Owner remains the accept/decline authority for manual requests in V1.
- Do not use a wide empty Kanban layout on mobile; use dense chronological cards.

## Owner frontend

### Operations-first home

Owner home order:

1. Critical attention and unanswered requests.
2. Today: waiting, checked in, in progress, late, awaiting confirmation.
3. Staff on shift/absent and chair capacity.
4. Walk-in queue.
5. Compact booked/completed/collected summary.
6. Links to analytics, hiring, and staff workspaces.

Charts do not push urgent work below the fold.

### Reservations (`/dashboard/owner/reservations`)

- Search and filters: needs action, requested, today, upcoming, in progress,
  awaiting confirmation, disputed, completed, cancelled/no-show, barber,
  service, date range.
- Desktop uses bounded queue/table plus detail panel; narrow screens use cards.
- Each detail shows customer, assigned/requested provider, service, date/time,
  status, notes, policy/deadlines, timeline, communication, and payment record.
- Actions: accept, decline with reason, assign/reassign, issue code, audited
  manual check-in, propose change, cancel, mark no-show after grace, and resolve
  first-level dispute where allowed.
- This directly fixes the earlier reservations screen that showed only a status
  badge with no accept/decline controls.

## Check-in, delay, service, and completion

### Check-in

- Code/QR is short-lived and cannot be read from Postgres after issuance.
- Customer self-check-in provides the code; owner fallback requires a reason.
- Early, expired, wrong-shop, wrong-appointment, and replay attempts fail safely.

### Delay and disruption

- Barber/owner can report a delay estimate and reason category.
- Customer receives in-app status with accept wait, request new time, contact,
  or penalty-free cancellation when shop-caused.
- Barber absence, closure, service deactivation, or employment end creates an
  affected-booking batch with proposed qualified alternatives.
- No background job silently changes confirmed provider or time.

### In-service amendment

Add `appointment_change_proposals` and events containing original/proposed
service, duration, price, provider, reason, proposer, expiry, response, version.

1. Barber/owner proposes.
2. Customer sees exact change and downstream warning.
3. Customer approves/rejects.
4. Approval locks appointment/capacity, rechecks conflicts, stores final
   snapshot, and emits an event/outbox notification.
5. A conflict leaves the original service intact and creates an attention item.

### Completion truth

- `finish` means service provider reports done; state becomes
  `awaiting_confirmation`.
- Customer confirms or disputes.
- Auto-completion after 120 minutes requires the valid prior check-in/start/
  finish sequence.
- Owner resolves first-level dispute as completed or cancelled with reason;
  admin escalation is completed in Phase 4.

## Cancellation, no-show, and restriction

- Free cancel/reschedule until two hours before start.
- Inside cutoff, allow an explicit late request/cancellation where policy does;
  record it without an automatic V1 fee.
- Owner or assigned barber can mark customer no-show only 15 minutes after start.
- Customer receives notice and can appeal. Strike is added only after upheld
  decision/appeal expiry.
- Three upheld strikes in rolling 90 days set `manual_approval_until` to 30 days
  after the latest threshold event. Owner waiver and admin correction append
  events.
- Customer no-show is never counted as barber failure.

## Walk-in and queue

### Data model

```text
walk_in_entries
- id, shop_id, created_by, customer_user_id nullable
- guest_claim_id nullable, service_id nullable
- requested/preferred barber nullable, assigned_provider nullable
- queue_status, quoted_at, checked_in_at, started_at, completed_at, version

guest_visit_claims
- id, walk_in_id, name, normalized_phone_hash, verified_at
- claim_token_hash, token_expires_at, otp_attempts, single_use_at

queue_events
- walk_in_id, actor, event, reason, metadata, created_at
```

Once service begins, create/link an appointment-like visit record so lifecycle,
payments, ratings, and analytics share one source of truth rather than two
incompatible systems.

### UI flow

- Staff quick-add: service, optional preference, display name/initials, notes.
- Queue board: waiting, called, checked in, in service, attention.
- QR and short code are large, printable/showable, expire, and cannot be reused.
- Guest mobile page: name + phone → OTP → claimed visit state → rating after
  completed. No app installation or account creation is required.
- Manual fallback requires staff reason and later displays “manually verified.”
- Advanced wait predictions are post-V1; V1 may show position and honest ranges
  derived from current queue, never fake precision.

## Offline collection records

Add separate payment facts:

```text
payment_records
- id, appointment_id, shop_id, method, currency, amount_cents
- status: recorded | corrected | refunded | voided
- recorded_by, paid_at, idempotency_key, version

payment_events
- payment_id, actor, event, amount_delta_cents, reason, metadata, created_at
```

- Supported V1 methods are configurable offline labels such as cash, card
  terminal, and e-wallet paid outside Philabantay.
- Owner and explicitly designated cashier can record collection.
- Correction/refund is a new event with reason; do not overwrite the original.
- UI says “Record payment,” not “Pay now,” and shows that Philabantay did not
  process the funds.
- Appointment completion and payment settlement remain independent.

## Transactional notifications

Phase 3 introduces the durable foundation because booking correctness depends on
visible changes:

```text
notification_outbox
notification_deliveries
in_app_notifications
```

Outbox rows are committed with request/accept/decline/expiry/reassignment,
delay, cancellation, check-in, completion, dispute, no-show, walk-in claim,
payment correction, and affected-booking events. A worker retries with bounded
backoff and idempotency. Optional email failure never changes booking state.

## Daily closeout and attention items

```text
closeout_runs (unique shop_id + local_date)
appointment_attention_items
```

- Scheduler runs 30 minutes after later of closing time or latest expected end.
- Safe automatic transitions reuse the canonical due-transition RPC.
- Uncertain confirmed/checked-in/in-progress/disputed, closure, attendance, and
  payment mismatches become owner tasks.
- Run is idempotent, observable, retryable, and produces a summary.
- Nothing is “trashed”; history is retained and active lists may archive.

## Offline/network UX

- Preserve unsent form drafts locally with no secrets or approval truth.
- Show offline banner and disable commands that cannot safely run.
- Retried writes reuse idempotency key; duplicate result is displayed as success
  only after authoritative reload.
- `409 stale` reloads detail/timeline and explains who changed it.
- Do not implement a hidden offline mutation queue in V1.

## Required tests and phase demo

The phase demo must include:

1. Manual exact-barber request accepted and completed.
2. Instant any-barber race with balanced assignment and chair guard.
3. Preferred provider unavailable; customer sees replacement options.
4. Expired request cannot be accepted.
5. Reschedule/cancel before and inside cutoff.
6. Check-in replay/expiry and audited owner fallback.
7. Start/finish/confirm and 120-minute due transition.
8. Dispute and owner first-level resolution.
9. Early no-show denied; valid no-show appealed/upheld; strike restriction.
10. In-service amendment accepted and conflict rejected without corrupting the
    original visit.
11. Shop closure creates alternatives and attention tasks.
12. Walk-in QR/OTP claim, manual fallback, completion, and eligibility signal.
13. Offline collection, correction, and refund audit.
14. Outbox provider failure with intact in-app state and successful retry.
15. Closeout repeated twice produces one run and no guessed completion.
16. 320 px/mobile, tablet, desktop, keyboard, screen-reader status, and reduced
    motion checks for every critical role path.

## Exit gate

Phase 3 is complete only when all demonstration scenarios pass through normal
UI and API paths without SQL, fake data, duplicate writes, or silent state
changes. Every lifecycle state has a usable detail/timeline, every actor sees
only allowed actions, and worker/payment/walk-in facts remain auditable under
retry and concurrency.
