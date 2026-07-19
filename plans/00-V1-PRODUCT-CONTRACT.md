# Philabantay V1 product contract

This document freezes the product behavior that all five phases must implement.
It is intentionally more precise than a feature wish list: it says who may do
what, which facts are authoritative, what happens when people do not use the
app perfectly, and which ideas are postponed.

## 1. Product purpose

Philabantay helps a local barbershop coordinate discovery, hiring, schedules,
bookings, walk-ins, service completion, ratings, and operational improvement.
It must reduce uncertainty for all three everyday roles:

- **Customer:** find a suitable shop, understand availability and price, book
  or join as a walk-in, track the visit, and leave a verified review.
- **Barber:** find work, understand the assigned roster, run today's customers,
  communicate changes, and build a credible performance history.
- **Owner:** prove ownership, create and publish a shop, hire and schedule staff,
  run reservations and walk-ins, resolve exceptions, record collections, and
  improve the shop using honest metrics.
- **Administrator:** verify professionals, handle escalated disputes and
  moderation, suspend abuse, and audit exceptional actions.

## 2. V1 business boundary

### Included

- One verified owner operating one shop.
- One active shop for an ordinary barber.
- An owner may also perform services at the owner's own shop through a separate,
  shop-scoped service-provider capability.
- Manual or instant booking per shop, with manual approval as the default.
- Exact, preferred, or any-barber customer intent.
- Explicit chair capacity and qualified-barber availability.
- Staff-created walk-ins, guest claim by QR/OTP, and verified walk-in ratings.
- Cash or other offline payment records, corrections, and refunds.
- In-app transactional notifications and optional email.
- Audited verification, appointment, employment, payment, moderation, and
  closeout decisions.

### Post-V1

- Multi-branch or multi-shop ownership.
- Simultaneous ordinary-barber employment at multiple shops.
- General manager/receptionist roles. V1 may grant a narrow cashier permission
  to an active employee.
- Online payment processors, deposits, chargebacks, automatic penalties,
  commissions, tips, payroll, or formal accounting.
- Full offline mutation synchronization.
- Predictive wait times, advanced waitlists, loyalty/rewards, and marketing
  automation.
- Push/SMS notifications beyond the phone OTP needed for a guest visit claim.
- Public ratings of customers or mandatory precise GPS verification.

## 3. Account, role, and verification rules

1. Signup always creates a normal authenticated profile with no professional
   privilege.
2. Choosing barber or owner creates a role request, not a granted role.
3. A pending, rejected, or suspended professional uses a restricted shell. The
   only operational destinations are verification/status, help, and sign out.
4. Barber evidence: government ID and selfie. Optional portfolio/certificates
   improve the profile but do not replace identity evidence.
5. Owner evidence: government ID, selfie, business/contact details, and evidence
   of shop control or business address.
6. Evidence uses private storage and short-lived signed access for assigned
   reviewers. Raw evidence is deleted 90 days after the final decision unless a
   documented legal hold applies.
7. Approval, profile promotion, professional extension creation, and audit event
   happen in one trusted transaction.
8. Suspension is checked at command time; an old session or active employment
   must never preserve professional access.
9. Admin privilege is never offered in public onboarding and requires stronger
   authentication and audited exceptional access.

## 4. Shop and employment rules

1. An approved owner without a shop is sent to Shop Setup, not an empty owner
   dashboard.
2. A shop begins as a private draft. It becomes discoverable only after required
   identity, location, operating hours, chair count, and at least one active
   service are valid and the publication policy is satisfied.
3. The owner controls shop details, services, prices, hours, closures, photos,
   booking mode, buffers, cancellation policy, chair count, and hiring state.
4. Hiring is stored on the shop as `is_hiring` plus optional open-position count
   and note. Turning it off removes the hiring marker on the next fetch/realtime
   update. Filling a known final opening turns it off atomically.
5. Barber applications, owner invitations, and join codes all create one kind
   of employment request. A join code never grants immediate employment.
6. Join codes expire, can be rotated/revoked, have attempt protection, and may
   have a usage limit.
7. The owner is authoritative for assigned shifts. A barber requests a change;
   approval applies the actual exception transactionally rather than only
   changing a request label.
8. Ending or suspending employment cannot strand future bookings. Each affected
   appointment must be reassigned, rescheduled with customer consent, or
   cancelled and communicated before the employment change commits.

## 5. Availability and assignment rules

A slot is bookable only when all of the following agree:

- shop is published, open for the date, and accepting the selected booking mode;
- local shop hours, date closure/override, lead time, and maximum advance window;
- active eligible employment or owner service-provider capability;
- barber shift, exception, attendance/absence, and accepting-bookings state;
- barber qualification for the chosen service;
- service duration plus configured cleanup/preparation buffer;
- no active barber overlap and no active customer overlap;
- shop chair capacity is not exceeded; and
- no active hold or appointment consumes the same capacity.

The database transaction is the final concurrency guard. A slot shown by the UI
is an offer, not a guarantee.

Customer barber intent:

| Intent | Target behavior |
| --- | --- |
| Exact | Requires the selected barber. Replacement needs explicit customer approval. |
| Preferred | Tries the selected barber. A qualified replacement may be proposed or assigned according to policy; the customer is notified and may accept, reschedule, or cancel without penalty. |
| Any | Assign the qualified available barber with the fewest assigned service minutes that local day; use stable deterministic tie-breakers. |

## 6. Booking and visit lifecycle

Canonical appointment states are:

```text
requested -> confirmed -> checked_in -> in_progress
          -> awaiting_confirmation -> completed
                                      -> disputed -> completed/cancelled

requested -> declined | expired | cancelled
confirmed -> cancelled | customer_no_show
```

`pending` and `no_show` are legacy read aliases only and must be removed after
compatibility migration. New code and storage use `requested` and
`customer_no_show`.

Lifecycle policies:

- Manual requests hold required capacity for 15 minutes and expire if not
  accepted. Instant booking confirms only inside the same authoritative
  transaction that checks capacity and assignment.
- Free customer cancellation or reschedule ends two hours before start. V1 does
  not charge automatic late fees; late changes remain auditable.
- Check-in uses a short-lived shop-issued code/QR. An owner fallback requires a
  reason and audit event.
- Only an assigned eligible provider or authorized owner fallback can start and
  finish service.
- Finish moves to `awaiting_confirmation`; it does not silently declare a
  completed visit.
- The customer may confirm or dispute. Without action, a valid visit
  auto-completes after 120 minutes.
- Owner handles the first dispute decision; the customer may escalate to a
  platform administrator.
- Owner or assigned barber may mark customer no-show only after a 15-minute
  grace period, with reason, notification, and customer appeal.
- Only an upheld no-show counts as a strike. Three upheld strikes within 90 days
  force manual approval for new bookings for 30 days. Owner waiver and customer
  appeal remain auditable. No automatic fee is charged in V1.

## 7. Walk-ins and in-service changes

Walk-in flow:

1. Staff creates a queue entry and optional service/barber preference.
2. The system issues a single-use QR and short claim code.
3. Customer opens an ordinary mobile browser; no installed app is required.
4. Customer enters name and phone and verifies an OTP.
5. The claim link shows queue/visit state and later unlocks rating eligibility.
6. If phone access fails, staff uses an audited manual/short-code fallback.
7. The visit still follows check-in/start/finish/confirmation truth; it is not
   auto-completed merely because it was a walk-in.

In-service amendment flow:

1. Barber proposes a service or add-on after consultation.
2. Proposal shows the new service, price, duration, and effect on later visits.
3. Customer explicitly approves or rejects.
4. Approval revalidates barber and chair capacity plus downstream conflicts.
5. Original booking snapshot and final approved values remain in immutable
   history.

## 8. Disruption and closeout rules

- Barber absence, serious delay, shop closure, or employment change creates an
  affected-booking workflow. The system proposes qualified replacements or new
  times; it never silently moves a customer.
- Customer can accept, reschedule, or cancel without penalty when disruption is
  caused by the shop or barber.
- Daily closeout runs 30 minutes after the later of scheduled shop closing time
  or the latest appointment's expected end.
- Closeout is idempotent per shop/local date. It may expire valid requests and
  auto-complete eligible visits, but uncertain cases become attention items.
- Closeout never guesses that a service happened, labels misconduct, or deletes
  appointment/event history.

## 9. Ratings, communication, and moderation

- Only a completed booked visit or completed verified walk-in claim unlocks one
  review.
- The review has separate barber and shop scores plus an optional comment.
- Customer can edit for seven days. The shop/barber side may publish one
  response. Reports, moderation, and appeals are auditable.
- Moderation may hide abusive text while retaining the verified score and audit
  trail. A score cannot be removed merely because it is negative.
- A review attaches to the actual service provider, not merely the originally
  requested barber.
- Conversations are scoped to a shop, appointment, hiring request, or staff
  relationship as appropriate. Former staff lose staff-thread access.
- Blocking/reporting and rate limits must not erase required transactional
  notices.

## 10. Payments and metric truth

- V1 records cash and other offline collection facts; it does not process money.
- Owner or an active employee with explicit cashier permission may record a
  collection. Corrections and refunds append events; they do not overwrite
  history.
- Keep these concepts separate in UI and analytics:

| Metric | Meaning |
| --- | --- |
| Booked value | Price snapshot when the booking was created. |
| Completed service value | Final approved service value for completed visits. |
| Collected amount | Offline money staff recorded as received. |
| Refunded amount | Money recorded as returned. |
| Net collected | Collected minus refunded. |

Do not call any of these "revenue" until accounting policy defines recognized
revenue and the payment source is trustworthy.

## 11. Notification and offline behavior

- Critical transactions write an outbox record in the same commit as the domain
  event. Delivery failure never rolls back or hides the actual state.
- V1 channels are in-app and optional email. OTP delivery for guest claim is
  required even when marketing/optional notifications are disabled.
- Every delivery attempt is idempotent, retryable, observable, and linked to the
  domain event.
- V1 is online-first. Preserve form drafts, use idempotency keys for retried
  commands, prevent duplicate submits, and reload authoritative state after a
  conflict. Do not create a general offline mutation queue.

## 12. Privacy and retention defaults

| Data | V1 default |
| --- | --- |
| Raw verification evidence | Delete 90 days after final decision, except legal hold. |
| Messages | Retain 2 years. |
| Operational and financial history | Retain 5 years; anonymize where deletion rights allow. |
| Security/audit access logs | Retain 1 year. |
| Public location | Shop location only; job seeker home location is coarse and opt-in. |

Legal review is a production gate. Backups, exports, anonymization, legal holds,
and deletion jobs must follow the approved final policy.

## 13. Non-negotiable technical invariants

- React route guards improve UX; Express authorization and RLS are independent
  security layers.
- Browser code never receives a service-role key.
- Direct authenticated table writes cannot bypass booking, role, publication,
  or capacity invariants.
- Every sensitive mutation validates input and expected version, checks actor
  capability and shop scope, and writes its audit event atomically.
- User text renders as text, not raw HTML.
- IDs, cursors, and redirect targets are encoded and validated.
- History is corrected through new events, never destructive rewriting.
- Async UI covers loading, empty, success, validation, forbidden, stale,
  network/offline, and retry states.

## 14. The 18 system concerns and their phase

| Concern | Primary phase |
| --- | --- |
| Identity, roles, professional verification | 1 |
| Admin review, suspension, exceptional access | 1 |
| Tenant isolation, contracts, direct-write safety | 1 |
| Shop creation, publication, hours, services, media | 2 |
| Hiring, applications, invitations, join codes | 2 |
| Employment, shifts, qualifications, attendance inputs | 2 |
| Availability, holds, assignment, chair capacity | 2 |
| Booking request/accept/decline/reschedule | 3 |
| Check-in, service progress, completion | 3 |
| Walk-ins and queue claim | 3 |
| In-service service/price amendments | 3 |
| Cancellation, no-show, delay, disruption | 3 |
| Daily closeout and attention items | 3 |
| Offline collection/refund records | 3 |
| Disputes, support, ratings, moderation | 4 |
| Messaging, notifications, settings | 3-4 |
| Owner/staff analytics and corrections | 4 |
| Reliability, accessibility, privacy, release operations | 5 |

## 15. Questions that remain open

Implementation defaults and blocking questions are tracked in
[OPEN-QUESTIONS.md](OPEN-QUESTIONS.md). An answer there changes this contract
only when the decision log is updated in the same patch.
