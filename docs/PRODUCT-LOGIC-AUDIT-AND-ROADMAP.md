# Philabantay Product Logic Audit and Roadmap

Status: planning document; no implementation is authorized by this file alone.

Last reviewed: 2026-07-17

This document records product rules, current logic gaps, and a recommended
implementation order for Philabantay. Read `ARCHITECTURE.md` and
`CODE-PATTERNS.md` before changing code. Keep business rules in the shared
domain package and enforce them in the Express API and Postgres/RLS boundary,
not only in React.

## 1. Executive summary

The largest product risk is that the application does not yet have a reliable
record of what happened during an appointment. It knows the scheduled time and
a small status enum, but it does not know whether the customer arrived, when the
cut started, when it ended, whether the customer agreed that it was finished,
or whether payment was collected.

The second major risk is verification. Pending owner accounts are strongly
locked, but there is no real submission/review/approval workflow. The pending
barber flow is inconsistent against the Supabase/Express backend: the account
remains a customer while employment endpoints and database constraints already
require a verified barber.

The recommended priority is:

1. Repair verification and role promotion.
2. Establish a trustworthy appointment lifecycle and event history.
3. Add the barber work console and expanded owner controls.
4. Collect reliable operational data and build correctly defined analytics.
5. Complete ratings and moderation.
6. Expand Settings into common, accessible, role-specific settings.

## 2. Current appointment behavior

The current appointment statuses are:

```text
pending -> confirmed -> completed | cancelled | no_show
```

Current behavior and limitations:

- A pending appointment immediately blocks its barber time slot.
- The owner can accept (`confirmed`) or decline (`cancelled`) a pending
  reservation.
- The assigned barber's API can change a confirmed appointment to completed,
  cancelled, or no-show after the scheduled start time.
- The barber UI does not currently expose the complete/no-show workflow.
- There is no arrival or check-in state.
- There is no in-progress state.
- There are no actual start or finish timestamps.
- There is no customer completion confirmation or dispute.
- There is no payment state or receipt.
- Pending appointments do not automatically expire.
- Forgotten confirmed appointments can remain confirmed forever.
- There is no immutable status history.

### 2.1 Recommended appointment lifecycle

```text
Requested
  |-- owner declines --------------------------> Declined
  |-- confirmation timeout --------------------> Expired
  `-- owner accepts ----------------------------> Confirmed
                                                     |
                     customer/shop cancels ---------+--> Cancelled
                     grace period passes ------------+--> Customer no-show
                     customer checks in -------------+--> Checked in
                                                          |
                                                     In progress
                                                          |
                                                Awaiting confirmation
                                                  |-- customer confirms
                                                  |-- automatic timeout
                                                  `-- customer disputes
                                                          |
                                               Completed or Disputed
```

Recommended completion proof:

1. Customer checks in using a short booking PIN or QR code.
2. The owner has a manual fallback for dead phones, walk-ins, accessibility, or
   connectivity problems.
3. Only the assigned barber can press **Start cut**.
4. The server records `actual_started_at`.
5. The assigned barber presses **Finish cut**.
6. The server records `actual_finished_at`.
7. The customer confirms completion or reports a problem.
8. If the customer does nothing for two hours, the system automatically
   completes the appointment unless it has been disputed.

GPS should not be required for check-in. It is unreliable indoors and creates
unnecessary privacy risk.

### 2.2 Keep separate facts separate

Do not force every fact into `appointments.status`. Model these separately:

- Fulfillment status: requested, confirmed, checked-in, in-progress,
  awaiting-confirmation, completed, cancelled, no-show, disputed, expired.
- Payment status: unpaid, pending, paid, partially-refunded, refunded, waived.
- Staff attendance: clocked-in, clocked-out, late, absent, corrected.
- Notification delivery: queued, sent, delivered, failed, read when available.
- Immutable appointment events: actor, action, old value, new value, timestamp,
  reason, and metadata.

## 3. Critical booking loopholes

### P0: fix before expanding the feature set

1. **Completion has no trustworthy proof.** A status button is not evidence that
   the customer arrived or that a service occurred.
2. **Confirmed bookings can be silently changed.** A customer can reschedule a
   confirmed booking to another time, service, or barber while it remains
   confirmed. A material change should return it to requested or require shop
   approval again.
3. **Pending reservations never expire.** They can block inventory forever.
4. **Status decisions can race.** Concurrent accept/decline operations can both
   validate stale state, with the final database write winning. Mutations must
   require the expected previous state or use a transaction/RPC.
5. **Cancellation is ambiguous.** The app does not persist who cancelled, why,
   when, or whether the cancellation was customer-, barber-, shop-, or
   system-initiated.
6. **There is no event history.** Disputes cannot be reconstructed.
7. **Historical transactions are not snapshotted.** Editing a service can change
   the price, name, and duration shown for historical appointments and reports.
8. **Schedule changes can invalidate future bookings.** Shift edits do not force
   the actor to resolve affected reservations.
9. **Employment changes do not resolve future work.** Removing or resigning a
   barber needs a reassign/contact/cancel workflow for every future booking.
10. **Revenue is not revenue.** Current charts calculate completed appointments
    using the current service price, without payment evidence. Until payments
    exist, call this **completed service value**.

### P1: reliability and operations

- Define late-arrival and no-show grace periods.
- Define cancellation cutoffs and exception handling.
- Add shop closures and holiday rules.
- Add customer approval for material owner changes.
- Attribute no-shows and cancellations to the correct actor.
- Add notification jobs for acceptance, rejection, reminders, changes, delays,
  cancellations, completion, and rating requests.
- Prevent service deactivation when unresolved future bookings depend on it, or
  require an explicit resolution workflow.
- Define account deletion and operational-record retention.

## 4. Verification

### 4.1 Current owner behavior

Selecting Shop owner currently produces:

```text
role = customer
requested_role = shop_owner
verification_status = pending
```

The account is redirected to the verification lock. Dashboard, settings,
messages, shop operations, Express routes, and direct authenticated Postgres
access are blocked. Session restoration and sign-out remain available.

That lock is a useful security boundary, but the operational workflow is
missing:

- No verification form or shop registration submission.
- No verification-request table or status history.
- No evidence/document storage.
- No reviewer queue or admin screen.
- No approve/reject API.
- No rejection reason, request-for-information state, appeal, or resubmission.
- No atomic role grant and shop publication operation.

The owner should complete the application and private shop draft before the
full lock begins. While locked, they should only be able to view verification
status, respond to a request for information, resubmit after rejection, or sign
out. They must not access normal account settings or shop tools.

### 4.2 Current barber inconsistency

Selecting Barber currently produces:

```text
role = customer
requested_role = barber
verification_status = pending
```

The UI sends the account to the hiring map. The real API then requires a granted
`barber` role for employment operations, while Postgres requires the barber to
already be verified before an employment record can be created. There is no
complete normal route that promotes this pending account first.

Because the granted role remains customer, direct customer operations may also
remain possible, while barber-requested navigation redirects away from customer
appointments. This creates contradictory permissions and can strand records.

### 4.3 Recommended barber verification flow

```text
Signup
  -> choose Barber
  -> submit professional application
  -> pending platform verification
  -> platform approves identity/profile
  -> role becomes barber; barber profile is created
  -> browse hiring shops
  -> apply or enter employer-issued code
  -> owner approves employment
  -> employment becomes active
```

Platform verification and shop employment approval are separate decisions. An
owner can confirm employment, but that should not silently substitute for any
platform identity checks unless the product explicitly adopts a trusted-owner
sponsorship policy.

Suggested barber application fields:

- Legal/display name and verified contact information.
- Experience, specialties, and services performed.
- Portfolio images.
- Preferred work area.
- Optional certificates.
- Identity evidence only when required by documented product policy.
- Consent to verification and document-retention rules.

Until approved, the barber can view, edit, and resubmit the verification
application and sign out. They cannot appear in public discovery, accept
bookings, join customer conversations, manage shifts, or create employment.

### 4.4 Recommended owner verification submission

Collect before the account enters its lock:

- Owner identity and verified contact information.
- Shop/business name.
- Address and exact map pin.
- Business contact details.
- Shop photos or ownership evidence when required by policy.
- Initial operating hours.
- Initial services and prices.
- Required agreements and consent.

The shop remains a private draft until approval. Approval should atomically
grant the owner role, attach ownership, and publish the shop when its required
setup is complete.

### 4.5 Admin verification workflow

Add queues for:

- Pending barbers.
- Pending owners.
- Needs more information.
- Approved.
- Rejected.
- Suspended.
- Appeals.

Every decision records reviewer ID, timestamp, public reason, private notes,
evidence reviewed, and status history. Role grants, suspensions, and related
record creation must be server-only transactions.

## 5. Barber work console and permissions

The employed barber home currently summarizes upcoming appointments but does
not provide a complete service workflow. Add a **Today's chair** console with:

- Assigned requested and confirmed reservations.
- Waiting/checked-in customers.
- View customer and haircut notes.
- Start cut.
- Finish cut.
- Mark customer no-show after the grace period.
- Report a delay.
- Contact the customer or owner.
- Request reassignment.
- Report an operational issue.
- Appointment timeline.

Recommended permission rules:

| Action | Rule |
| --- | --- |
| Start cut | Assigned barber, confirmed booking, customer checked in, allowed time window |
| Finish cut | Assigned barber, in-progress booking, actual start exists |
| Customer no-show | Grace period passed and no valid customer check-in |
| Cancel | Before cutoff, with an actor and reason |
| Report delay | Assigned barber before or during the appointment |
| Request reassignment | Before service begins; owner resolves it |
| View private notes | Assigned appointment or authorized owner only |

A barber cannot complete another barber's booking, change the charged service
price, delete booking history, mark no-show early, edit customer ratings, or
reassign work without the required owner/customer approval.

## 6. Expanded owner access

### 6.1 Reservation operations

Owners need more than accept/decline:

- Reassign a barber.
- Propose a new time.
- Change a service with customer confirmation.
- Check a customer in manually.
- Cancel with a reason.
- Mark customer no-show after the grace period.
- Resolve a disputed completion.
- Record payment or waiver.
- Add private operational notes.
- View complete appointment history.
- Message the customer from the reservation.
- Filter today, waiting, late, in-progress, unresolved, and historical bookings.

Material owner changes should notify the customer and require confirmation when
they change time, barber, service, or price.

### 6.2 Shop configuration

Add owner controls for:

- Public shop profile and map pin.
- Opening hours and holidays.
- Services, prices, and active state.
- Service duration and cleanup/buffer time.
- Booking lead time and maximum advance window.
- Cancellation cutoff and late-arrival grace period.
- Pending-request expiration.
- Instant booking versus owner approval.
- Walk-in policy and chair capacity.
- Notification recipients.
- Staff permissions.

### 6.3 Staff controls

Owners should be able to review applications, activate/suspend/end employment,
assign limited staff permissions, manage shifts/exceptions, review attendance
corrections, and export attendance records.

Ending employment must require a resolution for every future booking: reassign,
contact the customer, or cancel with a reason.

## 7. Owner analytics and data collection

Current analytics include completed booking value, completed count, top
visitors, top services, barber ratings, completed cuts, and no-shows. Their
definitions are not yet consistently trustworthy:

- Completed service value is labelled revenue without payment records.
- Historical value uses the current service price.
- Customer no-shows are displayed inside barber performance.
- Top visitors use completed visits, while top services include most
  non-cancelled bookings.
- Scheduled time is used instead of actual completion time.
- Raw average ratings can over-rank tiny samples.

### 7.1 Recommended dashboards

#### Booking funnel

- Requested, accepted, declined, expired, checked-in, completed, cancelled,
  customer no-show, and shop/barber cancellation.
- Acceptance rate and average owner response time.
- Completion rate and loss reason.

#### Demand and capacity

- Bookings by hour and weekday.
- Available minutes versus booked minutes.
- Barber utilization.
- Peak hours.
- Searches or booking attempts with no available slots.
- Average booking lead time.

#### Customer health

- New versus returning customers.
- Repeat rate after 30/60/90 days.
- Visit frequency.
- Cancellation and no-show rates.
- Dormant customers.
- Customer lifetime value only after real payment data exists.

#### Service performance

- Requested and completed volume.
- Completed service value.
- Cancellation/no-show rate by service.
- Scheduled versus actual duration.
- Demand by hour/day.
- Price-change history.

#### Barber performance

- Rating average, distribution, and sample size.
- Completed cuts.
- Repeat customers.
- Utilization.
- On-time start rate.
- Scheduled versus actual duration.
- Barber-attributed cancellations.
- Customer no-shows shown separately from barber performance.
- Attendance and punctuality.

#### Financial reports (only with payment records)

- Gross collected, refunds, discounts, and net collected.
- Average paid transaction.
- Cash versus online payment.
- Tips and commissions if those features are adopted.

### 7.2 Required data

Collect the minimum reliable facts needed for those reports:

- Appointment event history and actor.
- Created, accepted, checked-in, actual start, actual finish, confirmed, and
  cancelled timestamps.
- Cancellation/no-show actor and reason.
- Booked service name, duration, and price snapshots.
- Payment amount, state, and method.
- Reassignment history.
- Customer completion confirmation or dispute.
- Effective shop-hours snapshot.
- Notification delivery results.

Do not collect continuous precise customer location for analytics.

## 8. Ratings

### 8.1 Current behavior

A rating can currently be created when:

- The authenticated user is a customer.
- The appointment belongs to that customer.
- The appointment status is `completed`.

The current UI path is:

```text
Bookings
  -> open a completed booking
  -> Rate this visit
  -> choose Barber stars
  -> choose Barbershop stars
  -> Save rating
```

Both 1-5 scores are required. One review is stored per appointment; saving again
updates it. Postgres recalculates barber and shop aggregate ratings. The API
supports a written comment, but the current UI does not expose a comment field.

### 8.2 Rating gaps

- Completion is not trustworthy until the lifecycle work is complete.
- The rating action is hidden inside the completed-booking dialog.
- There is no dashboard prompt or delivered notification.
- No visible comment input.
- No editing window.
- No owner/barber response.
- No abuse report or moderation workflow.
- No dispute relationship.
- Public review lists are incomplete.
- Barber and shop scores must be submitted together.
- Performance views do not show rating distribution or confidence/sample size.

### 8.3 Recommended rating policy

- One review per customer-owned completed appointment.
- Unlock only after customer-confirmed or system-finalized completion.
- Show a prominent **Rate your visit** action on the customer dashboard and
  completed booking.
- Optionally send a rating reminder according to notification preferences.
- Separate barber criteria (skill, professionalism, punctuality) from shop
  criteria (cleanliness, service, booking experience).
- Written comment is optional.
- Allow customer edits for seven days; later changes go through support.
- Allow one public owner/barber response.
- Owners cannot delete negative reviews.
- Admin moderation can hide abusive text while retaining score and audit data.
- Show average, distribution, and count. Rankings need a minimum sample or a
  clear **not enough ratings** label.

Do not add public ratings of customers. Customer cancellations/no-shows should
remain private operational data with safeguards against unfair treatment.

## 9. Settings and accessibility

### 9.1 Current settings behavior

The current Settings shell has Account, Doodle avatar, Notifications, Security,
and Report a bug. It provides labels, landmarks, responsive navigation, and
basic account/password forms.

Current limitations:

- Search filters only the five navigation entries, not individual settings.
- Notification toggles are stored only in browser `localStorage` and do not
  cause reminders, emails, or pushes to be delivered.
- Password copy says at least ten characters while the enforced rule is six
  plus a special character.
- Current session information is static and cannot revoke other devices.
- No MFA, privacy controls, export, deletion, language, or accessibility
  preferences.
- Error announcements should use an alert pattern where immediate attention is
  required.
- Most settings are not role-specific.

### 9.2 Common settings

- Profile and verified contact information.
- Password and two-factor authentication.
- Active devices, revoke session, and sign out all devices.
- Notification channels, reminder timing, and quiet hours.
- Language: English and Filipino.
- Accessibility preferences.
- Privacy, consent, and blocked users.
- Download account data.
- Deactivate/delete account with retention explanation.
- Help, support, and bug reports.

### 9.3 Accessibility preferences

- Readable-font mode instead of handwriting text for important content.
- Text-size control.
- High-contrast mode.
- Reduced motion and decorative-animation disable option.
- Larger controls.
- Sound/vibration preferences.
- Keyboard-visible focus indicators.
- Screen-reader chart summaries and accessible data tables.
- Consistent English/Filipino language selection.

Color alone must never communicate appointment, verification, payment, or
attendance state. Every chart needs an equivalent text summary or table.

### 9.4 Customer settings

- Default city/search radius.
- Booking reminder timing.
- Preferred services and barber preference.
- Communication channels.
- Saved payment methods later.
- Cancellation/no-show policy acknowledgement.

### 9.5 Barber settings

- Professional profile, bio, specialties, portfolio, and performed services.
- Public visibility.
- Accepting-bookings defaults.
- Booking and shift notification timing.
- Employment/shop information.
- Verification application and status.

### 9.6 Owner settings

- Shop setup, map pin, hours, and holidays.
- Services and prices.
- Booking, cancellation, expiration, and grace-period policies.
- Staff permissions.
- Notification recipients.
- Payment configuration later.
- Data export and analytics definitions.
- Verification and shop-publication status.

## 10. Recommended implementation phases

### Phase 0: product contract and verification

- Define capability/state rules in the shared domain package.
- Add verification requests, evidence metadata, status history, and admin
  decision records.
- Repair pending-barber read/submission permissions and atomic promotion.
- Add owner submission before lock and restricted resubmission after rejection.
- Add admin verification API and minimal UI.

### Phase 1: appointment truth

- Expand the fulfillment lifecycle.
- Add actual timestamps and appointment events.
- Add PIN/QR check-in and owner fallback.
- Add barber start/finish/no-show console.
- Add customer completion confirmation/dispute.
- Add automatic pending expiration and completion finalization.
- Make transitions conditional/transaction-safe.
- Snapshot service transaction data.

### Phase 2: operational reliability

- Cancellation reasons, cutoffs, grace periods, and attribution.
- Reassignment and material-change approval.
- Shop closures/holidays.
- Resolve booking conflicts before schedule, service, or employment changes.
- Deliver real reminders and status notifications.
- Add appointment timeline to customer, barber, and owner views.

### Phase 3: workforce truth

- Clock-in/out and scheduled-shift snapshots.
- Late/absent/overtime classification.
- Barber correction request and owner resolution history.
- Approved shift requests apply the intended exception transactionally.

### Phase 4: owner operations and analytics

- Shop policy/configuration pages.
- Operational reservation filters and controls.
- Defined booking, capacity, customer, service, and barber reports.
- Accessible chart tables and exports.

### Phase 5: ratings, settings, and trust

- Rating prompts, comments, edit window, responses, reports, and moderation.
- Common and role-specific settings.
- Real notification persistence/delivery.
- MFA/session/privacy/data controls.
- Keyboard, screen-reader, contrast, language, readable-font, and reduced-motion
  verification.

### Phase 6: commerce (optional, after the booking lifecycle is stable)

- Payment records, cash/online methods, deposits, refunds, and receipts.
- Honest gross/net financial reporting.
- Tips and commissions only if included in the product scope.

## 11. Suggested first-release boundary

Include:

- Verification submission/review/promotion.
- Requested/confirmed/check-in/in-progress/completed/cancelled/no-show/disputed
  lifecycle.
- Appointment event history.
- Barber work console.
- Owner operational controls.
- Transaction snapshots.
- Real essential notifications.
- Customer-confirmed rating eligibility.
- Core accessible role-specific settings.

Defer:

- Online payments.
- Required GPS verification.
- Loyalty/rewards expansion.
- Barber commission accounting.
- Multi-branch ownership.
- Advanced queue prediction.

## 12. Product defaults proposed for review

Unless the product owner decides otherwise:

1. Treat the first release as booking-only; label financial-looking metrics
   **completed service value**, not revenue.
2. Use PIN/QR check-in with an audited owner fallback.
3. Let the barber finish the cut, give the customer two hours to confirm or
   dispute, then automatically finalize.
4. Expire unconfirmed requested slots after a configurable short timeout.
5. Require actor and reason for every cancellation, no-show, override, role
   decision, and attendance correction.
6. Do not rank barbers solely by raw average rating without sample-size context.
7. Do not publish or operationalize a professional account before verification
   and, for barbers, active shop employment where required.

