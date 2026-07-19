# UI/frontend master specification

This is the frontend build contract for the five-phase plan. It complements the
phase files; it does not authorize fake local data or frontend-only business
rules.

## 1. Frontend architecture rules

- Keep React 19, Vite, React Router, local route state, `AuthContext`, and
  `DataBackend` injection.
- Routes remain declared only in `apps/web/src/App.tsx` and are lazy loaded by
  role/domain.
- Pages orchestrate reads/mutations; components render reusable visual units;
  pure domain rules stay in `packages/shared`.
- No page imports `services/mock`, calls Supabase, or invents a direct fetch not
  represented by a shared service contract.
- Global role navigation lives in the existing accessible hamburger drawer.
  Contextual tabs/filters may exist inside a destination, but a second global
  row of Overview/Reservations/Staff/Barbers buttons must not return.
- Preserve `DoodleBoard`, notebook chat, theme tokens, portalled modal behavior,
  safe routing helpers, and one colocated stylesheet per component/page.

## 2. Information architecture

### Public/guest

```text
Landing
Discover shops/barbers
Shop detail
Barber detail
Guest walk-in claim
Sign in / sign up
```

### Customer hamburger

```text
Home
Discover
Bookings
Messages
Notifications
Settings
Sign out
```

### Pending/rejected/suspended professional

```text
Verification / status
Help
Sign out
```

The lock is deliberate. Public discovery is still available after sign out.

### Verified job-seeker barber

```text
Hiring
Applications
Professional profile
Notifications
Settings
Sign out
```

### Employed barber or owner-provider

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

### Active owner

```text
Home
Reservations
Staff
Hiring
Messages
Barbers
Shop setup
Analytics
Notifications
Settings
Sign out
```

`Staff` is roster/shifts/attendance/notes. `Barbers` is performance. They are
separate because they answer different owner questions.

### Admin

```text
Verification queue
Disputes
Moderation
Suspensions
Audit & operations
Settings
Sign out
```

## 3. Target route map

| Route | Access | Screen |
| --- | --- | --- |
| `/` | Public | Doodle landing/auth. |
| `/barbers` | Public | Discover map/list. |
| `/barbers/:barberId` | Public | Barber profile and booking entry. |
| `/shops/:shopId` | Public | Published shop profile. |
| `/walk-ins/claim/:token` | Public token | Guest OTP claim and visit status. |
| `/onboarding/role` | Signed in/incomplete | Role request. |
| `/verification/*` | Professional applicant | Application, evidence, status. |
| `/dashboard` | Signed in | Role-aware home. |
| `/appointments` | Customer | Booking action center. |
| `/appointments/:appointmentId` | Participant | Booking detail/timeline. |
| `/chat` and `/chat/:id` | Participant | Notebook inbox/thread. |
| `/chair` | Provider | Today's Chair. |
| `/schedule` | Provider | Assigned schedule/attendance/change requests. |
| `/hiring` | Verified barber/owner context | Hiring map or owner hiring workspace. |
| `/hiring/applications` | Verified barber | Application/request history. |
| `/professional` | Verified barber/provider | Professional profile. |
| `/dashboard/owner/overview` | Owner | Operations-first home. |
| `/dashboard/owner/reservations` | Owner | Reservation queue/detail. |
| `/dashboard/owner/staff` | Owner | Staff operations. |
| `/dashboard/owner/hiring` | Owner | Hiring controls and requests. |
| `/dashboard/owner/barbers` | Owner | Performance. |
| `/dashboard/owner/shop` | Owner | Shop Setup/edit. |
| `/dashboard/owner/analytics` | Owner | Reports/charts/tables. |
| `/notifications` | Signed in | In-app notification center. |
| `/settings/*` | Signed in | Role-aware settings shell. |
| `/admin/*` | Admin + MFA | Isolated admin bundle. |

Legacy URLs should redirect. They must not render duplicate versions of the same
workflow.

## 4. Shared application shell

### Desktop

- Sticky brand/header with hamburger, page title/context, shop/role badge, and
  notification indicator.
- Main content uses a bounded wide container; operational tables may use more
  width without touching the viewport edge.
- `DoodleBoard` rail remains decorative/contextual. It does not become a second
  navigation source that conflicts with the drawer.

### Tablet/mobile

- Hamburger remains the single navigation entry.
- Page title and critical status remain visible; decorative rail collapses.
- Split list/detail becomes cards → full-screen detail or bottom sheet.
- Map/list screen gets explicit Map/List toggle; do not squeeze a permanent split
  map onto mobile.
- Critical valid action may use a sticky bottom bar with safe-area inset.

### Responsive validation widths

Test at 320, 375, 640, 768, 1024, 1366, and 1920 px. Layout changes are CSS
media/container queries, not JavaScript viewport branching unless browser
behavior genuinely requires it.

## 5. Screen-state contract

Every asynchronous route and mutation explicitly renders:

| State | UI requirement |
| --- | --- |
| Session restoring | Neutral shell/skeleton; no forbidden-content flash. |
| Loading | Layout-preserving skeleton or concise loader. |
| Empty | Honest explanation and one valid next action. |
| Success | Updated authoritative content and accessible announcement. |
| Validation error | Field-level association plus summary when needed. |
| Forbidden | Safe message; never reveal whether a foreign ID exists. |
| Not found | Recovery link appropriate to role. |
| Stale `409` | Reload server state/timeline and explain what changed. |
| Offline/network | Preserve safe draft; retry; never claim success. |
| Busy | Disable duplicate submit while preserving cancel/close rules. |
| Partial data | Show available facts and identify what could not load. |

Use `DataError`/consistent API error codes; do not string-match arbitrary server
messages to decide behavior.

## 6. Role screen specifications

### Customer home

Priority order:

1. Needs-action card: substitution, change approval, completion confirmation,
   dispute update, or rating.
2. Next visit with status/deadline and one primary action.
3. Discover nearby published shops with location fallback.
4. Recent messages.
5. Favorites and recent services.

Empty customer home invites discovery. It does not show sample appointments.

### Discover and profiles

- Search/filter/map/list share one data set and location state.
- Shop cards: name, verified/publication signal where meaningful, open/closed,
  next availability, services/price range, rating + count, hiring badge only in
  barber context.
- Shop page: real media, hours/closures, services, staff, ratings, and booking
  action. Hide queue estimate until real queue data exists.
- Barber page: public professional details, specialties, actual rating/count,
  shop association, qualified services, availability, and booking entry.

### Customer booking/detail

Suggested components:

```text
BookingWizard
ServicePicker
BarberPreferencePicker
AvailabilityPicker
BookingPolicySummary
BookingRequestCountdown
AppointmentStatusCard
AppointmentTimeline
AppointmentActionBar
ChangeProposalCard
RatingComposer
```

Booking detail is deep-linkable and reloadable. It receives allowed actions and
version from backend state; it never calculates permission from the label alone.

### Barber home and Today's Chair

Suggested components:

```text
ShiftStatusSummary
NextCustomerCard
ChairAgenda
ChairVisitCard
CheckInCodePanel
ServiceAmendmentComposer
DelayReporter
NoShowDialog
ShiftChangeRequestList
```

Use chronological density. Empty upcoming bookings use a compact state inside
the available column width, not a tall blank panel.

### Owner home and reservations

Textual desktop wireframe:

```text
+---------------------------------------------------------------+
| Header: shop / status / alerts / range                         |
+-------------------------------+-------------------------------+
| Attention queue               | Today's chair/capacity        |
| unanswered, late, disputed    | waiting, active, staff        |
+-------------------------------+-------------------------------+
| Walk-ins                      | Compact value/collection      |
+---------------------------------------------------------------+
| Quick links: Reservations | Staff | Hiring | Analytics         |
+---------------------------------------------------------------+
```

Reservations wireframe:

```text
+---------------------------------------------------------------+
| Search | status | barber | service | date                      |
+--------------------------------------+------------------------+
| Paginated queue/table/cards           | Selected booking      |
| customer / provider / service / time  | facts + timeline      |
| status + deadline                     | valid actions         |
+--------------------------------------+------------------------+
```

Suggested components:

```text
OwnerAttentionQueue
TodayOperationsSummary
ReservationFilters
ReservationList
ReservationDetail
ReservationActions
StaffAvailabilityStrip
WalkInQueue
MetricSummaryCard
```

### Owner staff versus barber performance

Staff screen owns employment, schedule, attendance, correction requests,
private notes, permissions, and ending employment. Barbers screen owns rating
distribution/count, completed cuts, workload, punctuality, repeat visitors, and
separated failure/no-show signals. Do not duplicate full profiles across both.

### Shop Setup

Use `ShopSetupShell` with step routes/query state, backend draft version,
readiness checklist, and public preview. Each step saves independently and can
retry without losing other steps. Media upload progress is per file.

### Messages

Retain the notebook-style inbox/thread shared across roles:

- customer sees shop context;
- barber sees assigned customer or hiring/staff context;
- owner sees customer and staff threads with a context filter;
- participant and context remain visible on mobile thread view;
- pagination/subscription merge deduplicates by message ID;
- former staff authorization failure removes the thread after safe refresh.

### Analytics

Suggested components:

```text
AnalyticsRangePicker
MetricDefinitionPopover
MetricCard
ChartWithTable
DataQualityNotice
BookingFunnelChart
DemandTrendChart
ServiceMixChart
VisitorRanking
StaffWorkloadChart
RatingsDistribution
CollectionSummary
```

Use the existing/lightweight chart library only behind reusable wrappers.
Every chart has a table alternative and no-data state. Avoid importing charts
into the operations home bundle when only compact numbers are needed.

### Admin

Admin routes use their own shell/chunk. Queue list never fetches sensitive
evidence. Detail fetches allowlisted facts; document view is a separate audited
action. All decisions require confirmation, reason, expected version, and
post-action authoritative reload.

## 7. Forms and mutation pattern

1. Initialize from server DTO; keep editable draft local.
2. Validate with shared schema at appropriate interaction/submit boundaries.
3. Generate/reuse idempotency key for create/payment/decision commands.
4. Disable duplicate submit and expose progress.
5. On success, use returned entity then refetch related summaries if needed.
6. On stale conflict, retain non-sensitive draft, reload truth, and ask the user
   to review differences.
7. Never optimistically grant a role, employment, confirmed booking, completed
   visit, payment, or moderation result.

## 8. Accessibility requirements

- Semantic landmarks, one page `h1`, ordered headings, real buttons/links.
- Icon-only controls have accessible names; status is text plus visual style.
- Inputs have programmatic label, hint, error, and required state.
- Tabs implement tab semantics only when they behave like tabs; filters may use
  regular controls.
- Dialogs use the shared portal, initial focus, trap, Escape/backdrop behavior,
  scroll lock, inert background, and focus restoration.
- Live regions announce mutation and meaningful status changes without noise.
- Data tables have headers/captions; charts have summary and accessible table.
- Motion uses transform/opacity, pauses offscreen, and honors reduced motion.
- Touch targets are at least 44×44 CSS px and content remains usable at 200% zoom.

## 9. Visual direction and performance

- Preserve Philabantay's hand-drawn/notebook identity and Taglish-friendly tone.
- Owner analytics may use the approved compact dashboard reference: clean cards,
  restrained blue/purple/orange accents within theme tokens, strong hierarchy,
  and generous but not wasteful spacing.
- The city/sky/space landing story and human characters can remain; auth becomes
  a clean space-station panel rather than a billboard if that design has been
  accepted. Decorative animation never blocks sign-in or causes horizontal
  overflow/black gutters.
- Limit continuous animation count, lazy-load large scenes/assets, pause when
  hidden, and measure before/after. Prefer CSS; dynamically import GSAP only for
  sequences that materially need it.
- Walking-character variants should reuse optimized assets and predictable
  paths; decorative people use `aria-hidden` and do not overlap controls.

## 10. Frontend definition of done per slice

- Shared contract exists before UI wiring.
- Route guard and hamburger entry match capability/state.
- Loading/empty/error/success/busy/stale/offline states are implemented.
- Desktop, tablet, and mobile layouts are verified.
- Keyboard, focus, labels, status announcement, reduced motion pass.
- No placeholder data, hardcoded account, secret, nested interactive control,
  direct backend import, or duplicated business rule.
- Typecheck, build, targeted tests, browser smoke, and `git diff --check` pass.
- Phase/traceability docs are updated in the same change.
