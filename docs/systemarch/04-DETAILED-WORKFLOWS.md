# 4. Detailed workflows

This is the operating manual for Philabantay. It describes the human trigger,
UI behavior, server command, durable database effect, expected result, and
failure behavior for each important flow.

## 4.1 Common vocabulary and timers

| Term | Meaning |
| --- | --- |
| Requested role | What the user wants to become. It grants no professional authority by itself. |
| Effective role | Server-controlled role used for authorization. |
| Verified | A trusted review process approved the professional account. |
| Published shop | A shop profile allowed into customer discovery. This lifecycle is planned. |
| Active employment | The authoritative link allowing a verified barber to operate for one shop. |
| Appointment event | Immutable record of actor, action, previous/new state, reason, metadata, and time. |
| Attention item | Planned task for an ambiguous appointment that automation must not guess about. |
| Completed service value | Booked price of completed services; not proof of payment. |
| Revenue | Money verified as collected; unavailable until payments are modeled. |

Current appointment timer defaults:

- Requested reservation expiry: **15 minutes**.
- Check-in window opens: **30 minutes before** start.
- Check-in window closes: at the scheduled end.
- Customer no-show eligibility: **15 minutes after** start.
- Customer completion-confirmation deadline: **120 minutes** after finish.
- API due-transition worker interval: approximately **60 seconds** while the
  API process is running.
- Planned daily shop closeout: **30 minutes after** configured closing time.

These values should become centrally configured product constants or shop
policy snapshots rather than being repeated in UI text.

## 4.2 Role-capability matrix

| Capability | Guest | Customer | Pending professional | Verified job-seeker barber | Employed barber | Verified owner, no shop | Active owner | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Browse published shops | Yes | Yes | Target: verification-only lock or explicitly allowed preview | Yes | Yes | Yes | Yes | Yes |
| Book and manage own visit | Sign in first | Yes | No during strict lock | Product decision; recommended no while acting as professional | No as barber workspace | No as owner workspace | No as owner workspace | Support only |
| Submit verification | No | When requesting professional role | Yes | No unless resubmitting/suspended | No unless renewal | No unless renewal | No unless renewal | Review only |
| Browse hiring shops | No | No | After barber verification | Yes | Optional, normally hidden | No | No | Audit |
| Apply / receive invitation | No | No | No | Yes | No while actively employed | No | No | Audit |
| Manage own shifts | No | No | No | No active employment | Yes within policy | No | Owner manages staff | Override only with audit |
| Operate assigned booking | No | No | No | No | Yes | No shop | Yes for owned shop | Emergency support with audit |
| Create/edit shop | No | No | No | No | No | Yes after verification | Own shop | Moderation |
| Manage hiring/staff | No | No | No | No | Own requests only | After shop exists | Own shop | Moderation |
| Review verification | No | No | No | No | No | No | No | Yes |

Current code fully supports only part of this matrix. The target matrix is the
authorization specification; each cell needs Express and RLS tests before it is
considered implemented.

## 4.3 Customer account creation and onboarding — CURRENT

| Step | Actor and UI | Preconditions | Server/database effect | Result and failure behavior |
| --- | --- | --- | --- | --- |
| 1 | Visitor enters name, email, optional phone, and password. | Not signed in; valid fields. | `POST /auth/signup`; Supabase Auth creates identity. | Duplicate/invalid credentials return a safe error without exposing secrets. |
| 2 | System creates application profile. | Auth user exists. | Auth trigger inserts `public.users` with base customer role, unverified, incomplete onboarding. | Auth/profile IDs remain identical. Trigger failure aborts account creation path. |
| 3 | User selects Customer. | Authenticated profile. | Onboarding command sets requested/effective customer semantics and `not_required` verification. | Customer becomes operational. Arbitrary role values fail strict validation. |
| 4 | UI routes to customer dashboard. | Onboarding complete. | Read-only calls load published catalogue, own bookings, favorites, and messages. | Loading, empty, error, and retry states are required. |

Rule: signup metadata may suggest a display name but never grant barber, owner,
or admin authority.

## 4.4 Barber verification — PLANNED

| Step | Actor and UI | Preconditions | Server/database effect | Result and failure behavior |
| --- | --- | --- | --- | --- |
| 1 | Customer chooses “Become a barber.” | Signed in; no active professional submission. | Create draft verification submission for barber. Effective role stays customer/restricted. | Direct profile role edits are rejected. |
| 2 | Applicant enters legal name, phone, experience, specialties, general work area, and optional certificates/portfolio. | Draft owned by applicant. | Strictly validate and save allowlisted form fields with version. | Invalid or stale updates return field/conflict errors without losing the draft. |
| 3 | Applicant uploads ID and required evidence. | Supported file type/size; authenticated. | Validate magic bytes, strip unsafe metadata where appropriate, scan, store privately, save hash/path metadata. | Failed scans never become reviewer-visible as trusted evidence. |
| 4 | Applicant submits. | Required fields/documents complete. | `draft -> pending`; append submission event. | Form becomes read-only except withdrawal; repeated submit is idempotent. |
| 5 | Admin requests information, approves, or rejects. | Admin authorization; pending submission. | Atomic decision RPC updates submission/event and, on approval, user role/status plus `barbers` profile. | Applicant sees status and safe reason, never private reviewer notes. |
| 6 | Approved barber chooses job-seeker mode or views existing employment. | Verified granted barber role. | Read job profile/employment. | No employment opens hiring map; active employment opens work dashboard. |

Privacy: exact home address, ID images, phone, and certificates are not part of
the public barber card unless separately and explicitly approved.

## 4.5 Owner verification — PARTIAL to PLANNED

The current application has a strong owner lock: an owner applicant is routed
to verification and blocked from operational API/RLS access. The persistence
and admin-review workflow below is still planned.

| Step | Actor and UI | Preconditions | Server/database effect | Result and failure behavior |
| --- | --- | --- | --- | --- |
| 1 | Customer chooses “Shop owner.” | Signed in. | Requested role becomes owner; effective operational privileges remain restricted. | Layout and API redirect/block everything except verification and sign-out. |
| 2 | Applicant enters legal/business name, verified contact, proposed shop identity, and proof. | Restricted owner applicant. | Save versioned owner verification submission and private documents. | Applicant may resume later. No shop is public yet. |
| 3 | Applicant submits. | Required evidence present. | `pending` submission/event. | Duplicate submission is prevented. |
| 4 | Admin reviews. | Real admin role and reviewer permission. | Approve, needs-information, or reject with event/reason. | Crafted browser approval requests fail Express and RLS/RPC checks. |
| 5 | Approval grants owner role. | Submission still pending and profile version current. | Atomic role/status update and approval event. | Partial promotion cannot occur. |
| 6 | Owner is redirected to Shop Setup. | Verified owner with no shop. | UI queries `getMyShop`; no row leads to draft-creation flow. | Empty owner dashboard is replaced by a clear required next step. |

## 4.6 Admin review and suspension — PLANNED

1. Admin signs in with MFA and an effective `admin` role.
2. Queue lists pending submissions without downloading every document.
3. Opening one item records reviewer access and generates short-lived document
   URLs.
4. Admin may request more information, approve, reject, or flag fraud.
5. Reason is mandatory for all non-approval decisions.
6. Approval is an atomic trusted RPC; the browser cannot send an arbitrary new
   role as a normal profile patch.
7. Suspension is a separate audited action. It revokes operational access,
   hides affected professional/shop catalogue records, and creates tasks for
   future bookings rather than silently deleting them.
8. Restoration requires a new event and policy-appropriate review.

Admin support access to messages, documents, or cross-shop data must be
exceptional, purpose-limited, and audited.

## 4.7 Owner Shop Setup and publication — PARTIAL to PLANNED

| Step | Owner UI | Required data | Server/database effect | Completion/failure behavior |
| --- | --- | --- | --- | --- |
| 1 | “Set up your shop” creates a draft. | Verified owner; no existing shop for one-shop MVP. | Create `shops` row with `draft` lifecycle. | Idempotency prevents double-click duplicate shops. |
| 2 | Identity step saves name, description, business contact. | Valid lengths. | Patch allowlisted shop fields. | Autosave or explicit Save shows durable success. |
| 3 | Location step searches address and places map pin. | User consent and normalized address. | Server resolves/stores provider place reference and coordinates; records verification state. | Browser coordinates alone are not trusted proof. |
| 4 | Hours step sets weekly hours and exceptions. | Valid, non-overlapping local-time blocks and timezone. | Replace weekly hours transactionally; store closures separately. | Overnight hours require explicit supported representation. |
| 5 | Services step adds name, duration, price, category/specialty. | At least one active service before publication. | Shop-scoped service CRUD; historical appointments remain snapshotted. | Removing a service deactivates it; it does not rewrite history. |
| 6 | Media step uploads logo, cover, and gallery. | Safe image type/size and alt text. | Private staging, scan/process, publish approved derivative path and metadata. | Failed upload does not block already saved form sections. |
| 7 | Staffing step shows join-code controls and optional hiring configuration. | Draft shop exists. | Generate/rotate code and save hiring state. | Code is never exposed in public shop payloads. |
| 8 | Review step explains missing requirements. | All required data loaded. | Server validates publication readiness. | Server returns structured missing fields, not a generic failure. |
| 9 | Owner publishes. | Verified owner, valid location/catalog/hours. | `draft/pending_review -> published`, timestamp and event. | Only now does discovery return the shop. |

Later edits reuse the same sections. Material ownership/location edits may
return the shop to review; ordinary price/hour edits can publish immediately if
policy permits.

## 4.8 Hiring on, off, and full — PARTIAL

### Owner enables hiring

1. Owner opens Shop Setup or Hiring.
2. Toggle requires a published, eligible shop.
3. Optional remaining openings is `NULL` for unspecified; otherwise positive.
4. Optional note explains specialty/schedule needs.
5. Save updates the one authoritative hiring source and `hiring_updated_at`.
6. Barber hiring endpoint reads only published, verified, `is_hiring=true`
   shops with `NULL` or positive openings.

### Automatic full state

1. Employment request is accepted.
2. Transaction locks request, shop, and relevant barber employment state.
3. It creates active employment.
4. If count is specified, it decrements once.
5. At zero it sets `is_hiring=false` in the same transaction.
6. Next fetch/focus refresh immediately removes the hiring pin.

### Owner turns hiring off

Turning it off immediately prevents new public applications. Existing pending
applications remain visible for explicit resolution; product policy must decide
whether they may still be accepted. Recommended default: owner may resolve them
but UI warns the shop is no longer publicly hiring.

Resignation does not automatically reopen hiring. The owner decides whether a
new vacancy exists.

## 4.9 Barber application — CURRENT foundation, PLANNED richer workflow

| Step | Actor and UI | Server/database effect | Result/failure behavior |
| --- | --- | --- | --- |
| 1 | Verified job-seeker opens hiring map. | Query active listings, then hydrate safe shop data. | Non-hiring shops are absent from primary list; location denial still permits list browsing. |
| 2 | Barber reviews shop/openings/note/requirements. | Read public hiring fields only. | Join code and owner private data are never returned. |
| 3 | Barber presses Apply once. | Transaction creates application and applied employment placeholder where current model requires it. | Duplicate pending application returns a clear conflict. |
| 4 | Owner opens Applications. | Owner-scoped query returns safe barber job profile and application. | Cross-shop IDs return not found/forbidden. |
| 5 | Either party starts application-scoped contact. | Planned hiring conversation with participant validation. | Arbitrary owner/barber spam without a request context is blocked. |
| 6 | Owner sends offer; barber accepts. | Planned unified request transaction activates employment and consumes opening. | Concurrent final opening accepts only one. |

Current Express can resolve a barber application, but owner UI/shared contract
coverage is incomplete and real-API hiring counts are not atomically closed.

## 4.10 Owner invitation — PLANNED

1. Barber explicitly enables “Looking for work.”
2. Owner browses verified opt-in profiles using specialty, area, and schedule
   filters.
3. Exact home location and private verification data are excluded.
4. Owner sends an invitation with role, schedule expectation, and note.
5. Barber receives the invitation and may open a scoped conversation.
6. Barber accepts, declines, or lets it expire.
7. Acceptance runs the same employment activation transaction as an accepted
   application.

Using one activation function prevents applications and invitations from
creating different employment rules.

## 4.11 Join code — CURRENT direct join, PLANNED safer request

Target workflow:

1. Owner generates or rotates a code after the shop exists.
2. Code has expiry/usage policy and is not logged or publicly returned.
3. Verified barber enters it with attempt rate limiting.
4. Server resolves the code and creates a pending join request.
5. Owner sees the barber identity and confirms or rejects.
6. Confirmation activates employment transactionally.
7. Code use and decision are audited.

Current behavior immediately inserts active employment after a valid reusable
code. Keep this labeled as a gap until owner confirmation is implemented.

## 4.12 Employment, shifts, and attendance — CURRENT/PARTIAL

### Employment activation

- Preconditions: verified barber, eligible shop, no other active employment.
- Write: one active employment with hired date, request resolution, event, and
  optional hiring decrement.
- Failure: no partial employment or opening decrement.

### Weekly shifts

1. Owner assigns weekly patterns for the employment stint.
2. Barber sees the same authoritative schedule.
3. Barber requests a change rather than silently overwriting an owner-assigned
   shift in the target model.
4. Owner approval and actual schedule edit must be explicit; approval alone
   should either apply a structured requested change atomically or explain that
   the owner must edit afterward.
5. Date exceptions override weekly patterns.

Current RLS/UI permit overlapping owner and barber editing paths. Resolve this
before claiming owner-controlled scheduling.

### Attendance

Current attendance stores present/absent daily records. Planned workforce truth
should add clock-in/out, late state, correction request, approval, and event
history. Attendance notes remain private to the barber and authorized owner.

### Employment end

Ending employment must first identify future assigned appointments. The owner
must reassign with customer-policy checks, reschedule, or cancel with reason.
Only then should the stint become resigned/ended.

## 4.13 Customer discovery and service selection — CURRENT/PARTIAL

1. Guest/customer browses published shops without mandatory location access.
2. If location is granted, one shared live location controls center, hidden
   radius, and nearest-first order.
3. The UI never describes straight-line distance as driving distance.
4. Shop detail shows public identity, verified state, hours, services, prices,
   specialties, safe photos, ratings, and available barbers.
5. Customer selects a service before requesting a slot; service duration and
   price determine the interval and snapshot.
6. Disabled/deleted services remain visible in historical appointments but are
   not newly bookable.

Current gaps include shop publication/hours/media and some sample shop-profile
content.

## 4.14 Booking exact, preferred, or any barber — PLANNED extension

| Preference | Meaning | Assignment rule |
| --- | --- | --- |
| Exact | Customer will accept only this barber. | Reject/offer another time if unavailable. Reassignment needs customer approval. |
| Preferred | Try this barber first. | Alternative is allowed under clear policy and notification. |
| Any | Customer prioritizes time/service. | System or owner chooses an eligible barber transactionally. |

Workflow:

1. Availability reads active employment, effective shifts/exceptions, service
   duration, existing blocking appointments, shop hours/closures, and policy.
2. Customer selects an offered slot and preference.
3. Booking request carries an idempotency key.
4. Server validates again; displayed availability is only a hint.
5. Database snapshots service and creates `requested` plus initial event.
6. Barber overlap exclusion settles concurrent requests.
7. Customer overlap protection rejects impossible personal schedules.
8. Owner receives the request before its expiry.

Current appointments require a barber immediately, so unassigned `any` requests
need the database changes described in the design document.

## 4.15 Owner acceptance, decline, and reassignment — CURRENT backend/PARTIAL UI

### Accept

1. Owner opens action-first reservation queue.
2. Row shows customer, service snapshot, time, notes, preference, and requested
   barber.
3. Owner chooses an eligible barber when assignment is allowed.
4. Command includes `expected_version`.
5. RPC locks appointment, confirms ownership/state/availability, assigns, moves
   to `confirmed`, and inserts event.
6. All participant views refresh.

### Decline

Decline requires a safe reason, transitions only a requested appointment, frees
inventory, writes an event, and creates a notification outbox row when delivery
exists.

### Reassign

Current backend provides atomic owner reassignment. Target UI must honor exact
barber preference, check target employment/availability, preserve history, and
notify the customer and both barbers. A stale version returns conflict and the
owner reloads before retrying.

## 4.16 Check-in — CURRENT backend

1. Appointment is confirmed and within the allowed check-in window.
2. Assigned barber issues a six-digit, short-lived code.
3. Server stores only a bcrypt hash and expiry; plain code is returned once.
4. Customer submits code from their own appointment screen.
5. RPC verifies customer, status, time, hash, expiry, and expected version.
6. Appointment becomes `checked_in`; event records the action.
7. Owner manual fallback requires an explicit reason and is audited.

Failures never reveal the hash or distinguish sensitive internal causes more
than necessary. Attempts should receive user/IP/appointment rate limits.

## 4.17 Start, finish, confirmation, and dispute — CURRENT backend

### Start

- Only the assigned active barber starts.
- Appointment must be checked in.
- Actual start timestamp and event are written atomically.

### Finish

- Only the assigned barber finishes an in-progress service.
- Actual finish and confirmation-due timestamps are written.
- State becomes awaiting confirmation.

### Customer confirmation

- Only the appointment customer confirms.
- Completion timestamp and event unlock rating eligibility.

### No customer action

- The worker calls the due-finalization RPC.
- Only valid awaiting-confirmation rows past their deadline are completed.
- Worker is retry-safe; running twice does not double-complete or duplicate
  business effects.

### Dispute

- Customer supplies a reason before the confirmation deadline.
- State becomes disputed and rating remains locked.
- Authorized owner resolution records reason and outcome as completed or
  cancelled.
- Future admin escalation and evidence policy remain planned.

## 4.18 Cancellation and no-show — CURRENT core/PARTIAL policy

### Cancellation

Current lifecycle allows authorized cancellation only from requested/confirmed
before service start. Store actor, timestamp, reason, and event. Planned policy
adds early/late classification and payment/refund consequences without creating
new appointment payment states.

### Customer no-show

1. Appointment is confirmed.
2. No check-in exists.
3. At least 15 minutes passed after start.
4. Current backend allows the assigned barber to mark no-show with reason.
5. Event and no-show metadata are stored.
6. Customer dispute/appeal UI and owner review policy should be added.

Absence of a network event is not proof. Automation may create an attention
item, but a human-authorized decision is needed before accusing a participant.

### Shop/barber no-show — PLANNED

Customer needs a symmetric report path if the shop is closed or barber absent.
It creates an evidence-backed dispute/attention task and may lead to shop-side
cancellation, refund, and reliability metrics after review.

## 4.19 Ratings and public review filters — CURRENT core/PARTIAL UI

1. Appointment reaches completed.
2. Customer’s own appointment list detects no existing rating.
3. UI shows separate 1–5 barber and shop controls plus optional comment.
4. API validates strict scores/comment and authenticated customer.
5. Database trigger verifies completed appointment and exact participant IDs.
6. Unique appointment constraint prevents duplicates.
7. Aggregate barber/shop rating and count refresh.
8. Public UI shows verified-visit review, distribution, and filters: all or
   1–5 stars, newest, highest, lowest.

Planned trust features: edit window, owner/barber response, report abuse,
moderation event history, and sample-size context. Owners cannot delete a bad
review simply because it is unfavorable.

## 4.20 Conversations and messaging — CURRENT/PARTIAL

1. A valid business context opens a customer-shop or staff conversation.
2. Server validates conversation shape and participant membership.
3. Sender posts plain text through strict DTO limits.
4. Trigger validates sender and updates conversation activity.
5. UI delivers local sent message immediately and polls for remote messages.
6. Mark-read updates only accessible conversation.

The compose box should remain plain; canned auto-fill replies are planned for
removal. Future hiring conversations need their own context/participants rather
than pretending a barber applicant is a customer-shop thread.

Planned abuse controls include per-user/IP/conversation limits, block/report,
moderation, attachment scanning, delivery state, and bounded cursor pagination.

## 4.21 Notifications — PARTIAL/PLANNED

Preferences exist; delivery does not.

Target flow:

1. A business transaction inserts an outbox row in the same commit.
2. Worker selects due rows with a lock/lease.
3. It evaluates current user preferences and mandatory transactional rules.
4. It sends through in-app, push, email, or SMS provider.
5. Delivery attempt and provider reference are recorded.
6. Retry uses exponential backoff and an idempotency key.
7. Permanent failure is visible to operations but does not roll back the
   booking transaction.

Critical booking state remains visible in-app even when optional notifications
are disabled.

## 4.22 Daily closeout — PLANNED

The existing minute worker expires requested appointments and finalizes
awaiting-confirmation appointments. Daily closeout is a separate shop-level
reconciliation.

1. Scheduler calculates the shop’s local closing time from stored hours and
   timezone.
2. Thirty minutes after close it inserts/locks a unique closeout run.
3. It invokes existing due-expiry and due-finalization logic.
4. It finds stale confirmed, checked-in, in-progress, and disputed rows.
5. It never guesses misconduct or completion from missing data.
6. It creates attention items for the owner.
7. It refreshes finalized operational rollups if rollups are used.
8. It creates a summary notification.
9. It marks the run complete with counts and errors.
10. Retry resumes safely from the same run key.

Cancelled, expired, declined, disputed, and no-show records are retained. An
“Archive” action only removes them from active views.

## 4.23 Owner dashboard and analytics

### Operations-first home

Display in this priority:

1. Requests awaiting accept/decline.
2. Assignment conflicts and stale versions.
3. Today’s check-ins, in-progress visits, late arrivals, and attention items.
4. Staff availability and shift exceptions.
5. Pending hiring/application/shift actions.
6. Compact completed-service-value and rating summary.

Full charts belong in Analytics, not ahead of urgent work.

### Metric definitions

| Metric | Definition |
| --- | --- |
| Requested | Appointments created in range. |
| Acceptance rate | Confirmed requests divided by resolved requested appointments; define treatment of expiry. |
| Completion rate | Completed divided by eligible confirmed visits. |
| Customer no-show rate | Customer-no-show divided by eligible confirmed visits. |
| Utilization | Actual/scheduled service minutes divided by available staffed minutes; unavailable until hours/shift truth is complete. |
| Completed service value | Sum of snapshotted price for completed appointments. |
| Revenue | Sum of settled payment records minus refunds; unavailable today. |
| Average rating | Database aggregate over valid completed-visit reviews. |
| Repeat customer | Customer with a documented threshold of completed visits in the same shop. |

Every chart needs a table equivalent, range/timezone label, empty state, and
definition tooltip.

## 4.24 Temporary closure, suspension, and permanent closure — PLANNED

These are separate actions:

- **Hiring off:** affects recruitment only.
- **Closed today:** date exception; existing future bookings need explicit
  handling.
- **Temporarily closed:** hides new availability and creates a future-booking
  resolution queue.
- **Suspended:** platform safety action; hides public shop and locks operations
  according to incident policy.
- **Archived/permanently closed:** prevents new activity but preserves history.

Before closure becomes effective, the owner resolves or communicates every
future appointment. The system must not silently cancel bookings or erase data.

## 4.25 Account suspension, export, and deletion — PLANNED

1. User requests export/deletion or admin initiates suspension for policy.
2. Server verifies identity, recent authentication, and authority.
3. System identifies active appointments, employment, disputes, payments, and
   retention holds.
4. Immediate deletion is blocked where it would break an active obligation.
5. Export is produced from only the user’s allowed data.
6. When eligible, private/profile data is deleted or pseudonymized while
   retained transactional/audit facts preserve integrity.
7. Tokens and device sessions are revoked.
8. Completion and exceptions are audited.

## 4.26 Error, offline, and concurrency behavior

Every interactive workflow must implement:

- Loading, empty, success, validation error, server error, and retry states.
- Busy/disabled mutation controls that resist double submission.
- An idempotency key for create-like operations where a retry could duplicate
  data.
- `409` handling that reloads current state and explains the conflict.
- Session-expired handling that refreshes once or signs in without losing safe
  form drafts.
- Offline messaging that does not claim success until acknowledged.
- Accessible live regions for status changes.
- No destructive optimistic update unless rollback is reliable.

## 4.27 Product benefit by role

### Customer

Verified discovery, transparent services/prices, real slot protection,
barber-preference control, check-in proof, clear status timeline, safe
cancellation/dispute, private history, favorites/rebooking, and verified-visit
reviews.

### Barber

Verified professional identity, opt-in job profile, applications/invitations,
clear employment and schedule, shift requests, assignment protection, workload
history, customer cut notes under policy, fair performance signals, and ratings
based only on completed work.

### Owner

Verified shop publication, action-first reservation desk, staffing/hiring,
auditable fulfillment, customer/staff messages, trustworthy reviews, service and
capacity insights, and a closeout queue that identifies uncertainty rather than
hiding it.

### Administrator

Least-privilege queues for verification, moderation, support, and security;
every exceptional access and decision is attributable and reviewable.

## 4.28 Decisions to approve before implementation

1. One shop per owner for the first release, or multiple shops immediately?
2. May a pending professional browse as a customer, or is verification-only
   lock absolute?
3. Which evidence is required for barber and owner verification, and how long
   is it retained?
4. Does a preferred barber permit automatic reassignment without a second
   customer confirmation?
5. What is the late-cancellation threshold and consequence before payments?
6. Who may mark customer no-show: assigned barber, owner, or both?
7. Can pending applications be accepted after the owner turns hiring off?
8. Does a join code always require owner approval? Recommended: yes.
9. What constitutes a material shop edit requiring re-review?
10. What retention/export/deletion policy applies to messages, verification,
    appointment history, and security events?
