# Phase 2 — publishable shops, workforce, and availability truth

## Outcome

At the end of Phase 2, a verified owner can create and publish one real shop,
hire qualified barbers through safe request flows, assign schedules, and expose
availability that correctly respects hours, closures, staff, services, buffers,
customer/barber overlap, and physical chair capacity.

This phase produces trustworthy supply. The full visit-operation UI arrives in
Phase 3.

## Current foundation to preserve

- Shop, service, employment, application, join-code, shift-pattern,
  shift-exception, attendance, staff-note, and hiring-listing tables exist.
- Owner dashboard has real reservation/stat/staff/performance reads, but Shop
  Setup and several catalogue fields remain partial or placeholder.
- One-active-employment protection exists.
- Barber overlap exclusion exists for active appointment states.
- Hiring map/application/join-code UI exists in partial form.

## Target domain additions

### Shop lifecycle and setup

Extend shops and supporting tables with:

```text
shops
- lifecycle_status: draft | pending_review | published | suspended | archived
- description, public_contact_phone, timezone, place_id
- location_verified_at, published_at
- booking_mode: manual | instant
- chair_count, default_buffer_min
- min_lead_minutes, max_advance_days
- cancellation_cutoff_minutes (default 120)
- no_show_grace_minutes (default 15)
- closeout_grace_minutes (default 30)
- is_hiring, hiring_open_positions nullable, hiring_note nullable
- version

shop_operating_hours
- shop_id, weekday, open_time, close_time, closed, block_order

shop_closures
- shop_id, local_date, closed, replacement_open/close, reason

shop_media
- shop_id, storage_path, role, sort_order, alt_text, moderation_status

service_qualifications
- shop_id, service_id, provider_user_id, active, granted_by

shop_policy_versions
- shop_id, policy_type, version, payload, effective_at, superseded_at
```

Publication requires valid shop identity/address/pin/timezone, at least one
operating-hours block, `chair_count >= 1`, and at least one active service.
Only `published` shops appear in public catalogue queries or RLS views.

### Hiring and employment requests

Migrate the separate application/invitation/join paths into:

```text
barber_job_profiles
- barber_id, visible, bio, experience, specialties
- portfolio_media, coarse_work_area, schedule_preference, updated_at

employment_requests
- id, shop_id, barber_id
- direction: barber_application | owner_invitation | join_code
- status: pending | accepted | declined | withdrawn | expired
- message, join_code_id nullable, created_by, resolved_by
- created_at, expires_at, resolved_at, version

employment_events
- employment/request IDs, actor, event, reason, metadata, created_at
```

All accepted requests call one transaction that verifies both accounts and the
shop, enforces one active employment, creates the stint, closes competing
requests according to policy, decrements a known position count, and turns
hiring off when the final opening is filled.

Join code upgrades:

- Store a hash where practical; never return it through catalogue reads.
- Add expiry, usage limit, revocation/rotation event, and attempt throttling.
- Code entry creates a pending request; owner approval activates employment.

### Authoritative schedules and staff state

- Owner assigns recurring shifts and one-date exceptions.
- Barber may view assigned shifts and submit a structured change request.
- Approval writes the resulting shift exception/assignment in the same
  transaction. Decline changes only the request state.
- Absence/leave inputs participate in availability.
- Attendance history is separate from future roster truth.
- Owner/staff notes remain private to the subject barber and authorized owner;
  they never enter public profiles or analytics text exports by default.

## Availability engine

### Required inputs

For shop, service, date, and optional barber preference, compute from:

1. Shop `published`/accepting state, timezone, booking mode, lead/advance rules.
2. Operating hours and date-specific closure/replacement hours.
3. Service active state, duration, and buffer.
4. Active employment or owner provider capability.
5. Service qualification.
6. Assigned shift and date exception.
7. Approved leave/absence and live accepting-bookings state where policy uses it.
8. Active appointment/hold intervals for the provider.
9. Active appointment/hold intervals for the customer.
10. Concurrent active intervals compared with `chair_count`.

### Assignment model

Persist customer intent before confirmation:

```text
barber_preference: exact | preferred | any
requested_barber_id nullable
barber_id nullable until assignment is resolved
assignment_source: customer | owner | automatic
assignment_reason nullable
```

- Exact requires a requested qualified barber.
- Preferred attempts that barber; substitution behavior must be visible and
  penalty-free for the customer.
- Any selects the eligible provider with the fewest assigned service minutes on
  the shop's local date. Tie-break by earliest shift start, then stable provider
  ID so retries agree.
- The final create/confirm transaction locks the necessary capacity facts and
  rechecks barber, customer, and chair conflicts.
- Add a customer active-interval exclusion/transactional equivalent.
- Do not use browser-calculated slots as proof.

### API shape

Target operations include:

```text
GET/POST/PATCH /api/v1/owner/shop
GET/PUT        /api/v1/owner/shop/hours
GET/POST/PATCH/DELETE /api/v1/owner/shop/closures
GET/POST/PATCH/DELETE /api/v1/owner/shop/services
POST           /api/v1/owner/shop/media/request-upload
POST           /api/v1/owner/shop/publish
POST           /api/v1/owner/shop/unpublish

GET/PATCH      /api/v1/owner/shop/hiring
GET            /api/v1/hiring/shops
GET/PUT        /api/v1/barber/job-profile
GET/POST       /api/v1/employment/requests
POST           /api/v1/employment/requests/:id/accept|decline|withdraw
POST           /api/v1/owner/shop/join-code/rotate|revoke

GET/PUT        /api/v1/owner/staff/:id/shifts
GET/POST       /api/v1/barber/shift-change-requests
POST           /api/v1/owner/shift-change-requests/:id/approve|decline
GET/PUT        /api/v1/owner/service-qualifications

GET            /api/v1/availability?shopId=&serviceId=&date=&preference=
POST           /api/v1/bookings/quote
```

Names may adapt to the existing router structure, but one domain command must
have one canonical route and shared DTO. All lists use stable cursor pagination.

## Frontend build contract

### Owner hamburger menu

All destinations live in the existing drawer, not a separate top tab bar:

```text
Home
Reservations
Staff
Hiring
Messages
Barbers (performance)
Shop setup
Analytics
Notifications
Settings
Sign out
```

Phase 2 makes Shop setup, Hiring, and staff supply operational. Other
destinations may link to existing/Phase 3-4 screens but must not show fake data.

### Shop Setup route and screen

Recommended canonical route:

```text
/dashboard/owner/shop
```

Desktop uses a compact stepper with form at left and customer-facing preview at
right. Mobile uses one step at a time with saved progress. Steps:

1. Shop identity: name, description, public contact.
2. Location: address search, draggable pin, city, coordinates, timezone.
3. Hours and closures: weekly blocks plus date exceptions.
4. Services: name, description/specialty, duration, price in PHP, active state,
   cleanup buffer, qualified providers.
5. Photos: storefront/interior/team/gallery, order, alt text, progress/retry.
6. Booking policies: manual/instant, lead/advance, cancellation cutoff, grace.
7. Capacity and staffing: chair count and owner-performs-services toggle.
8. Hiring: toggle, optional opening count, note/requirements.
9. Review and publish: readiness checklist and public preview.

Verified owner with no shop is redirected here after login. Draft saves to the
backend and is resumable. Editing later uses the same screen and version checks.
Material edits that require review show their publication impact before save.

### Barber hiring workspace

Routes:

```text
/hiring
/hiring/applications
/hiring/requests/:requestId
/professional
```

- Map/list shows published hiring shops with a distinct Hiring pin/badge.
- Details show openings, note, services/specialties, hours, location, and shop
  verification/publication state.
- Hiring shops are prioritized; non-hiring shops are either separated or hidden
  by an explicit filter, never presented as open positions.
- Job profile supports opt-in visibility, experience, specialties, portfolio,
  coarse area, and preferred schedule.
- Application/invitation/join-code flows converge on one request timeline.
- Contact between owner and barber is scoped to the employment request.
- When hiring turns off/full, badge/list/detail update on realtime invalidation or
  the next fetch and never remain as a stale positive claim.

### Owner hiring workspace

- Header shows Off, Hiring, or Full with one switch and optional position count.
- Browse verified visible job seekers; filters use specialty, coarse area, and
  schedule preference without exposing home coordinates.
- Request detail supports profile/portfolio, conversation, invite, accept,
  decline, and audit history.
- Accept action explains the one-active-shop rule and affected opening count.
- Concurrent acceptance of the final opening produces one success and a clear
  stale/full response for the other action.

### Staff and schedule workspace

- Owner: roster list, provider qualifications, weekly shifts, exceptions,
  pending change requests, absence/attendance summaries, and private notes.
- Barber: read-only authoritative schedule, exceptions, and structured change
  request. Remove unrestricted self-rewrite controls once owner scheduling is
  authoritative.
- Desktop uses bounded list/calendar + detail. Mobile uses agenda cards and
  full-screen edit/request forms.
- Apply the requested compact spacing pass: content-sized panels, shorter empty
  states, responsive grids, and no large blank area beside an empty booking list.

### Customer catalogue changes

- Only published shops are visible.
- Shop details use real hours, closures, services, prices, photos, specialties,
  rating count, and honest open/closed status.
- Location denial falls back to search/list and never blocks discovery.
- Queue/wait estimates remain hidden until Phase 3 has real walk-in data.

## Required shared services

Add or extend contract domains instead of page-level fetch calls:

- `OwnerShopService`
- `ShopHoursService`
- `ServiceManagementService`
- `ShopMediaService`
- `HiringService`
- `EmploymentRequestService`
- `StaffSchedulingService`
- `QualificationService`
- expanded `AvailabilityService`

If the existing `ShopService`/`BarberEmploymentService` remains the home, keep
methods cohesive and documented; do not create duplicate ways to mutate the
same fact.

## Test scenarios

1. Verified owner creates a draft, resumes on another device, satisfies the
   checklist, publishes, edits, and unpublishes.
2. Customer cannot list or deep-link a draft/suspended shop.
3. Owner cannot publish with zero chairs, no hours, or no active service.
4. Barber applies; owner invites; barber enters a code. All become requests and
   only one can activate the barber.
5. Two owners attempt to activate the same barber; one succeeds.
6. Two accept actions race for one remaining opening; one succeeds and hiring
   turns off.
7. Approved shift change creates the actual exception; decline does not.
8. Exact/preferred/any availability respects qualification and shifts.
9. Two customers race for one barber/chair; capacity is not exceeded.
10. One customer cannot hold overlapping active visits.
11. Closing the shop or deactivating a service returns clear affected-booking
    preconditions rather than silently invalidating reservations.
12. Narrow/mobile map, setup, hiring, staff, keyboard, and reduced-motion tests
    pass.

## Exit gate

Phase 2 is complete only when:

- an approved owner can create, resume, publish, and edit one real shop without
  placeholders or manual SQL;
- only published shops appear publicly;
- hiring off/open/full and opening counts stay transactionally correct;
- all hiring paths converge on owner-approved employment;
- one-active-employment and one-owner-shop V1 boundaries hold under races;
- owner-assigned schedules and barber change requests represent the same truth;
- availability scenario tests combine every listed input;
- concurrent probes cannot exceed barber, customer, or chair capacity; and
- the frontend uses protected `DataBackend` methods with complete async states.

The product owner reviews Shop Setup, hiring, staff/schedule, catalogue, and the
availability test report before Phase 3 begins.
