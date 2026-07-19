# Phase 4 — trust, communications, insights, and complete role experience

## Outcome

At the end of Phase 4, Philabantay is operationally understandable rather than
merely functional: disputes and reviews have fair processes, former staff cannot
linger in conversations, owners see reproducible business signals, barbers see
fair performance signals, settings are real, and every role works accessibly on
mobile and desktop.

## 1. Disputes, appeals, and support

### Appointment dispute workflow

1. Customer opens dispute from `awaiting_confirmation` with reason and optional
   safe evidence.
2. Owner reviews visit timeline and submits completed/cancelled decision with
   reason.
3. Customer accepts or escalates within the configured window.
4. Admin queue shows only escalated cases and relevant scoped evidence.
5. Admin resolves, requests information, or returns case; every access and
   decision appends an event.
6. Corrections update derived metrics from final facts without deleting history.

Add `support_cases`, `case_participants`, `case_evidence`, and `case_events`, or
a similarly normalized model shared by appointment disputes and moderation.
Do not put private case evidence in public appointment timelines.

### Admin UI

Routes:

```text
/admin/disputes
/admin/disputes/:caseId
/admin/moderation
/admin/moderation/:caseId
/admin/suspensions
/admin/audit
```

Desktop uses queue + detail; mobile uses filterable cards and full-screen
detail. Exceptional action controls are visually separated from ordinary facts,
require reason, use expected version, and show audit impact.

## 2. Ratings and public trust

### Eligibility and lifecycle

- One completed booked visit or completed verified walk-in claim creates one
  rating eligibility record.
- Customer rates actual barber and shop separately from 1–5 and may add text.
- Edit window is seven days from creation; after that the review is immutable
  except moderation/public response.
- One public response may be authored by the shop and, where appropriate, actual
  barber. Edit policy for responses follows the open decision in the question
  register.
- Customer can report a response; owner/barber can report abusive review text.
- Moderator may hide text, restore text, or reject report while preserving the
  score and immutable decision history.
- Disputed/unresolved/foreign/duplicate visits never unlock rating.

### Public UI

- Shop profile: average, count, 1–5 distribution, verified-visit list, filters,
  date, service, owner response, and moderation label where text is hidden.
- Barber profile: actual-provider average/count/distribution and verified visit
  reviews attributable to that provider.
- Never show a high average without sample size.
- Rating prompt appears on completed booking detail and customer home, not only
  buried in history.

## 3. Messaging trust

- Use the existing notebook-style chat UI consistently for customer, barber,
  and owner.
- Add explicit conversation context: customer-shop, appointment, hiring request,
  or active staff relationship.
- Owner can message customers and active barbers from the same Messages area,
  with clear context and participant labels.
- Employment end removes staff-conversation access immediately while preserving
  records according to retention.
- Add block/report, send/read rate limits, safe pagination, and delivery/read
  state. Blocking does not suppress legally/operationally required booking
  notices; those use the notification system.
- Attachments are disabled unless private storage, malware scan, content type,
  size, retention, and authorization are implemented together.
- Message retention default is two years.

## 4. Owner dashboard and analytics

### Layout

Keep the established notebook/doodle identity but use a dense modern dashboard
grid inspired by the approved reference: compact left rail inside `DoodleBoard`,
rounded data cards, clear chart hierarchy, responsive stacking, and role
navigation in the hamburger. Avoid a second row of global navigation buttons.

Owner Home remains operations-first. Analytics is a separate destination.

### Analytics sections

| Section | Required signals |
| --- | --- |
| Demand | Requests, confirmed, completed, cancelled, expired, customer no-show, disputes by range. |
| Value/collection | Booked value, completed service value, collected, refunded, net collected—separate labels. |
| Capacity | Available chair/provider minutes, assigned minutes, utilization, rejected demand. |
| Customers | Unique visitors, repeat rate, top visitors by completed visit count, retention cohorts where sample supports it. |
| Services | Top services/styles by completed count/value, duration variance, cancellation/no-show reason mix. |
| Staff | Workload, completed cuts, punctuality/attendance, rating count/distribution, shop-caused failures separate from customer no-shows. |
| Trust | Shop/barber ratings distribution, disputes, moderation and response time. |
| Walk-ins | Claimed/unclaimed, wait range, conversion to completed, service mix. |

Range selector: last 7 days, last 30 days, custom month/range, and all time where
query cost is bounded. Time buckets use shop timezone.

Every chart must:

- state its definition and data cutoff;
- expose an accessible table/download view;
- show no-data and partial-data warnings honestly;
- use completed/finalized facts appropriate to the metric;
- exclude unresolved corrections until policy says otherwise; and
- never use legacy `no_show` or call service value “revenue.”

### Owner role workspaces

- **Reservations:** Phase 3 action queue plus history and export.
- **Staff:** shifts, attendance, corrections, notes, future-booking resolution,
  employment end/suspension.
- **Hiring:** position state, applications/invitations/join requests.
- **Barbers:** performance focused, separate from Staff operations.
- **Messages:** customers and active staff in one consistent UI.
- **Shop setup:** editable business truth.
- **Analytics:** the sections above.

## 5. Barber experience and performance

- Home: shift, next customer, delays, messages, requests/attention—not owner
  analytics copied into a smaller card.
- Schedule: authoritative assigned roster plus change-request flow.
- Attendance: clock/check record where implemented, late/absent reason, correction
  request, owner decision, and history.
- Performance: completed cuts, assigned service minutes, rating average/count/
  distribution, repeat customers, punctuality, owner/shop cancellations, and
  customer no-shows shown separately.
- Professional profile: specialties, portfolio, work status, verification state,
  and job visibility.
- Tighten large empty areas in schedule, weekly pattern, exception, and empty
  upcoming-booking panels without breaking the notebook style or responsiveness.

## 6. Customer experience

- Home prioritizes next action, upcoming visit, unresolved substitution/change,
  rating prompt, recent messages, and discovery.
- Discovery/shop profile contains only real catalogue, hours, service, media,
  rating, and availability facts.
- Booking detail remains the source for lifecycle action/timeline.
- Notification center deep-links into the exact booking, message, dispute,
  employment, or rating context.
- Public browsing remains usable without precise location or sign-in.

## 7. Settings information architecture

### Shared account settings

```text
Account profile
Avatar/appearance
Notifications
Language and accessibility
Security and sessions
Privacy, export, deletion
Blocked/reported users
Help and bug report
```

### Barber-specific settings

- Professional profile visibility.
- Booking/shift notification timing.
- Employment information and verification status.

### Owner-specific settings

Separate account settings from shop settings. Shop operational facts stay in
Shop Setup or Shop Settings:

- booking/cancellation policy;
- hours and closures;
- publication/verification state;
- staff cashier permissions;
- notification recipients;
- data exports and metric definitions.

Preferences persist through backend services across devices. Notification
controls distinguish mandatory transactional notices from optional channels.

## 8. Notification completion

- In-app center supports unread state, pagination, mark read, deep link, and
  category filters.
- Optional email templates contain minimal private data and safe signed links.
- Quiet hours delay optional reminders, never urgent security/booking changes.
- Operations dashboard exposes outbox lag, failure rate, last successful worker
  cycle, and retry action for authorized admin.
- Preferences are not stored only in browser local storage.

## 9. Accessibility, responsive, and performance contract

Breakpoints are content-driven; target validation widths:

- mobile: 320–640 px;
- adaptive tablet: 641–1023 px;
- desktop: 1024 px and wider.

Required across all roles:

- minimum 44 px touch targets;
- visible focus, logical heading/order, keyboard-complete interaction;
- correct labels, descriptions, errors, status live regions, and semantic tables;
- no color-only status, text alternatives for charts, readable-font/text-size
  mode, contrast mode, and reduced motion;
- focus-trapped portalled dialogs with restoration and one active overlay;
- skeleton/loading, honest empty next step, validation, forbidden, not found,
  stale conflict, network retry, and success confirmation;
- cursor pagination for messages, bookings, events, ratings, applications, and
  admin queues;
- role bundles lazy-loaded so customer does not download owner/admin screens;
- parallel independent reads and measured render/bundle/image budgets.

Landing page may keep the city/sky/space doodle story and walking characters,
but animation must favor transform/opacity, pause offscreen, honor reduced
motion, avoid continuous heavy card/scissor effects, and never delay auth.

## 10. Corrections and analytics integrity

Add explicit correction commands/events for attendance, employment, payment,
service amendments, no-show appeal, dispute, and moderation. Derived aggregates
must be reproducible by replaying finalized facts. Cache/materialized views may
accelerate queries but are never the only truth.

## Required tests and phase demo

1. Customer dispute → owner decision → customer escalation → admin resolution.
2. Completed appointment creates one eligibility; seven-day edit then lock.
3. Walk-in claim can rate only its completed linked visit.
4. Negative review remains scored after abusive text is hidden.
5. Owner/barber response and report/moderation/appeal are audited.
6. Former/suspended barber cannot open staff messages or guessed conversation.
7. Owner dashboard metrics reproduce from fixture queries and use correct labels.
8. Customer no-show never lowers barber performance.
9. Notification provider fails; in-app state remains and operations sees failure.
10. Settings persist on another device and mandatory transactional notices stay
    enabled.
11. Keyboard/screen reader/contrast/reduced motion/320 px/tablet/desktop checks
    pass for each role and admin.
12. Performance comparison records role bundle sizes, key render time, and image
    payload; no unexplained regression is accepted.

## Exit gate

Phase 4 is complete only when trust decisions and sensitive access are audited,
rating eligibility cannot be forged, former staff access is closed, every metric
has a reproducible definition, all role settings use real backend state, and the
complete role workspaces pass accessibility/responsive/performance gates.
