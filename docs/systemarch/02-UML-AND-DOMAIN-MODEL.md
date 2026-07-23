# 2. UML and domain model

This document translates the flowcharts into software structure. The diagrams
use UML-style Mermaid notation so Git hosting, editors, and documentation tools
can render them without separate image files.

## 2.1 System component diagram

```mermaid
flowchart LR
    subgraph Browser["Browser trust boundary"]
        React["React 19 UI"]
        AuthContext["AuthContext"]
        BackendProvider["BackendProvider"]
        ApiBackend["ApiBackend"]
        MockBackend["MockBackend<br/>development alternative"]
    end

    subgraph Contract["Shared contract"]
        Types["Domain types"]
        DTO["DTOs and Zod schemas"]
        Services["DataBackend interfaces"]
        Rules["Pure lifecycle rules"]
    end

    subgraph Server["Server trust boundary"]
        Express["Express REST API"]
        AuthMiddleware["JWT authentication"]
        Authorization["Role and shop authorization"]
        Worker["Appointment transition worker"]
    end

    subgraph Supabase["Supabase trust boundary"]
        GoTrue["Supabase Auth"]
        Postgres["Postgres tables"]
        RLS["RLS policies"]
        RPC["Transactional RPC functions"]
        Storage["Private/public object storage<br/>PLANNED for verification and shop media"]
    end

    React --> AuthContext
    React --> BackendProvider
    AuthContext --> Services
    BackendProvider --> Services
    Services --> ApiBackend
    Services --> MockBackend
    ApiBackend --> Express
    Express --> AuthMiddleware
    AuthMiddleware --> Authorization
    Authorization --> Postgres
    Authorization --> RPC
    Worker --> RPC
    GoTrue --> AuthMiddleware
    Postgres --> RLS
    RPC --> Postgres
    Types --- DTO
    DTO --- Services
    Rules --- Services
    Express --> DTO
```

Read the arrows from the browser toward durable data: UI calls the shared
backend contract, Express applies request and authorization rules, and Postgres
performs the final transactional and tenant-isolation checks.

### Responsibility rule

- React owns presentation, local interaction state, and helpful button hiding.
- `packages/shared` owns contracts and reusable business decisions.
- Express owns request validation and the first authorization layer.
- Postgres owns durable invariants, row-level isolation, concurrency, and
  transactional state changes.
- Supabase Auth owns credentials and sessions.
- The service-role credential exists only on the server.

## 2.2 Current core domain class diagram

```mermaid
classDiagram
    class AuthUser {
        +uuid id
        +string email
        +timestamp created_at
    }

    class User {
        +uuid id
        +UserRole role
        +OnboardingRole requested_role
        +VerificationStatus verification_status
        +boolean onboarding_completed
        +string full_name
        +string email
        +string phone
        +string location
        +string avatar_url
    }

    class Barber {
        +uuid id
        +string bio
        +decimal rating
        +int rating_count
        +ShiftStatus shift_status
        +boolean accepting_bookings
    }

    class Shop {
        +uuid id
        +uuid owner_id
        +string name
        +string address
        +string city
        +float lat
        +float lng
        +decimal rating
        +int rating_count
    }

    class Service {
        +uuid id
        +uuid shop_id
        +string name
        +int duration_min
        +int price_cents
        +boolean active
    }

    class BarberEmployment {
        +uuid id
        +uuid barber_id
        +uuid shop_id
        +EmploymentStatus status
        +timestamp applied_at
        +timestamp hired_at
        +timestamp ended_at
    }

    class ShiftPattern {
        +uuid id
        +uuid employment_id
        +int weekday
        +time start_time
        +time end_time
    }

    class ShiftException {
        +uuid id
        +uuid employment_id
        +date date
        +boolean is_available
        +time start_time
        +time end_time
        +string reason
    }

    class Appointment {
        +uuid id
        +uuid customer_id
        +uuid barber_id
        +uuid shop_id
        +uuid service_id
        +AppointmentStatus status
        +timestamp starts_at
        +timestamp ends_at
        +int version
        +string booked_service_name
        +int booked_duration_min
        +int booked_price_cents
        +timestamp checked_in_at
        +timestamp actual_started_at
        +timestamp actual_finished_at
        +timestamp completed_at
    }

    class AppointmentEvent {
        +uuid id
        +uuid appointment_id
        +uuid actor_id
        +string actor_role
        +EventType event_type
        +AppointmentStatus from_status
        +AppointmentStatus to_status
        +string reason
        +json metadata
        +timestamp created_at
    }

    class Rating {
        +uuid id
        +uuid appointment_id
        +uuid customer_id
        +uuid barber_id
        +uuid shop_id
        +int barber_rating
        +int shop_rating
        +string comment
    }

    class Conversation {
        +uuid id
        +ConversationKind kind
        +uuid shop_id
        +uuid customer_id
        +uuid barber_id
        +timestamp updated_at
    }

    class Message {
        +uuid id
        +uuid conversation_id
        +uuid sender_id
        +string body
        +timestamp read_at
        +timestamp created_at
    }

    AuthUser "1" --> "1" User : profile
    User "1" --> "0..1" Barber : professional profile
    User "1" --> "0..*" Shop : owns
    Shop "1" --> "0..*" Service : offers
    Barber "1" --> "0..*" BarberEmployment : employment history
    Shop "1" --> "0..*" BarberEmployment : staff history
    BarberEmployment "1" --> "0..*" ShiftPattern : weekly schedule
    BarberEmployment "1" --> "0..*" ShiftException : date override
    User "1" --> "0..*" Appointment : books as customer
    Barber "1" --> "0..*" Appointment : performs
    Shop "1" --> "0..*" Appointment : fulfills
    Service "1" --> "0..*" Appointment : selected catalog item
    Appointment "1" --> "1..*" AppointmentEvent : audit timeline
    Appointment "1" --> "0..1" Rating : verified review
    Shop "1" --> "0..*" Conversation : owns context
    Conversation "1" --> "0..*" Message : contains
    User "1" --> "0..*" Message : sends
```

The core model has four ownership anchors: an authenticated profile, a shop, an
employment stint, and an appointment. Events and snapshots preserve history so
later profile, service, or staffing edits cannot rewrite an earlier visit.

### Why the appointment stores snapshots

`service_id` links to the current service catalog, but the appointment also
stores the booked name, duration, and price. If an owner edits “Classic Cut”
from PHP 250 to PHP 300 tomorrow, yesterday’s history must remain PHP 250.

### Why employment is a history table

A barber can work for different shops over time. Attendance, schedules, staff
notes, and performance must remain attached to the correct employment stint
instead of silently moving when the barber changes shops.

## 2.3 Supporting workforce and engagement classes

```mermaid
classDiagram
    class User
    class Shop
    class Barber
    class Appointment

    class BarberApplication {
        +uuid id
        +uuid barber_id
        +uuid shop_id
        +ApplicationStatus status
        +timestamp created_at
    }

    class HiringListing {
        +uuid shop_id
        +string role_title
        +EmploymentType employment_type
        +string[] requirements
        +int open_positions
        +boolean accepting_applications
    }

    class ShopJoinCode {
        +uuid shop_id
        +string code
        +timestamp rotated_at
    }

    class AttendanceRecord {
        +uuid id
        +uuid employment_id
        +uuid barber_id
        +uuid shop_id
        +date date
        +AttendanceStatus status
        +uuid recorded_by
        +string notes
    }

    class ShiftChangeRequest {
        +uuid id
        +uuid employment_id
        +date date
        +string message
        +RequestStatus status
    }

    class StaffNote {
        +uuid id
        +uuid shop_id
        +uuid barber_id
        +uuid author_id
        +string body
    }

    class NotificationPreference {
        +uuid user_id
        +boolean booking_reminders
        +boolean chat_notifications
        +boolean email_updates
        +boolean nearby_alerts
    }

    class FavoriteShop {
        +uuid user_id
        +uuid shop_id
    }

    class FavoriteBarber {
        +uuid user_id
        +uuid barber_id
    }

    HiringListing "1" --> "1" Shop : extends
    BarberApplication "0..*" --> "1" Shop : targets
    BarberApplication "0..*" --> "1" Barber : submitted by
    ShopJoinCode "1" --> "1" Shop : grants join context
    AttendanceRecord "0..*" --> "1" BarberEmployment : belongs to
    ShiftChangeRequest "0..*" --> "1" BarberEmployment : requests change to
    StaffNote "0..*" --> "1" Shop : private to
    StaffNote "0..*" --> "1" Barber : concerns
    NotificationPreference "1" --> "1" User : owned by
    FavoriteShop "0..*" --> "1" User : saved by
    FavoriteShop "0..*" --> "1" Shop : saves
    FavoriteBarber "0..*" --> "1" User : saved by
    FavoriteBarber "0..*" --> "1" Barber : saves
```

`HiringListing` is current. The planned hiring redesign may migrate its status
and metadata onto `Shop`; see the database design for the compatibility plan.

## 2.4 Planned extension classes

These classes describe missing product capabilities. They are not current
tables and must not be used as evidence that a feature exists.

```mermaid
classDiagram
    class User
    class Shop
    class Barber
    class Appointment

    class VerificationSubmission {
        +uuid id
        +uuid user_id
        +OnboardingRole requested_role
        +SubmissionStatus status
        +json form_data
        +uuid reviewed_by
        +string review_reason
        +timestamp submitted_at
        +timestamp reviewed_at
    }

    class VerificationDocument {
        +uuid id
        +uuid submission_id
        +DocumentType type
        +string storage_path
        +string content_hash
        +timestamp created_at
    }

    class ShopHour {
        +uuid id
        +uuid shop_id
        +int weekday
        +time opens_at
        +time closes_at
        +boolean closed
    }

    class ShopClosure {
        +uuid id
        +uuid shop_id
        +date date
        +time opens_at
        +time closes_at
        +string reason
    }

    class ShopMedia {
        +uuid id
        +uuid shop_id
        +MediaType type
        +string storage_path
        +int sort_order
        +ModerationStatus status
    }

    class EmploymentInvitation {
        +uuid id
        +uuid shop_id
        +uuid barber_id
        +uuid invited_by
        +InvitationStatus status
        +string note
        +timestamp expires_at
    }

    class JoinRequest {
        +uuid id
        +uuid shop_id
        +uuid barber_id
        +uuid code_id
        +RequestStatus status
    }

    class Payment {
        +uuid id
        +uuid appointment_id
        +PaymentMethod method
        +PaymentStatus status
        +int amount_cents
        +string provider_reference
        +timestamp paid_at
    }

    class Notification {
        +uuid id
        +uuid user_id
        +NotificationType type
        +json payload
        +timestamp read_at
        +timestamp created_at
    }

    User "1" --> "0..*" VerificationSubmission : submits
    VerificationSubmission "1" --> "1..*" VerificationDocument : contains
    Shop "1" --> "0..*" ShopHour : weekly hours
    Shop "1" --> "0..*" ShopClosure : date exception
    Shop "1" --> "0..*" ShopMedia : displays
    Shop "1" --> "0..*" EmploymentInvitation : sends
    Barber "1" --> "0..*" EmploymentInvitation : receives
    Shop "1" --> "0..*" JoinRequest : reviews
    Barber "1" --> "0..*" JoinRequest : requests
    Appointment "1" --> "0..*" Payment : settlement attempts
    User "1" --> "0..*" Notification : receives
```

These planned records separate reviewable evidence, public shop presentation,
employment invitations, payment evidence, and durable notifications from the
existing core tables. Keeping them separate avoids putting unrelated lifecycle
states into a single JSON field and makes RLS easier to reason about.

## 2.5 Verification state machine

```mermaid
stateDiagram-v2
    [*] --> Unverified
    Unverified --> NotRequired: customer onboarding
    Unverified --> Pending: professional submits evidence
    Pending --> Verified: admin approves
    Pending --> Rejected: admin rejects
    Rejected --> Pending: corrected resubmission
    Verified --> Suspended: admin safety action
    Suspended --> Verified: admin restores
    NotRequired --> [*]
    Verified --> [*]
```

Role and verification are separate facts. A user can request owner onboarding
without being a verified owner. Authorization should require both the correct
effective role and the correct verification status.

## 2.6 Employment state machine

```mermaid
stateDiagram-v2
    [*] --> Applied: barber applies or join request approved for review
    Applied --> Active: owner and barber accept employment
    Applied --> [*]: application declined or withdrawn
    Active --> Resigned: employment ends
    Resigned --> [*]
```

The current database uses `applied`, `active`, and `resigned`. Invitations and
safer join requests are planned coordination records that eventually create or
transition this authoritative employment record.

## 2.7 Appointment state machine

```mermaid
stateDiagram-v2
    [*] --> Requested
    Requested --> Confirmed: owner accepts and assigns
    Requested --> Declined: owner declines
    Requested --> Expired: response deadline passes
    Confirmed --> CheckedIn: customer supplies valid code
    Confirmed --> Cancelled: authorized cancellation
    Confirmed --> CustomerNoShow: staff records no-show
    CheckedIn --> InProgress: assigned barber starts
    InProgress --> AwaitingConfirmation: assigned barber finishes
    AwaitingConfirmation --> Completed: customer confirms
    AwaitingConfirmation --> Completed: confirmation timer expires
    AwaitingConfirmation --> Disputed: customer disputes
    Disputed --> Completed: dispute resolved as fulfilled
    Disputed --> Cancelled: dispute resolved otherwise
    Declined --> [*]
    Expired --> [*]
    Cancelled --> [*]
    CustomerNoShow --> [*]
    Completed --> [*]
```

No arbitrary `PATCH status` should bypass this machine. The explicit command
endpoints and transactional RPC functions are the authoritative transition
mechanism.

## 2.8 Booking sequence with concurrency protection

```mermaid
sequenceDiagram
    actor Customer
    participant Web as React / ApiBackend
    participant API as Express API
    participant DB as Postgres RPC
    participant Owner

    Customer->>Web: Choose service, barber, date, and time
    Web->>API: POST /bookings with access token
    API->>API: Validate JWT, role, DTO, and operational access
    API->>DB: Insert requested appointment
    DB->>DB: Validate service/shop/barber references
    DB->>DB: Enforce barber time-range exclusion constraint
    alt slot is free
        DB-->>API: Appointment and initial event
        API-->>Web: 201 requested
        Web-->>Customer: Show pending reservation
        Owner->>API: POST /bookings/:id/accept with expected_version
        API->>DB: Transactional transition and assignment
        DB-->>API: Confirmed appointment and event
        API-->>Owner: Success
    else overlapping request wins first
        DB-->>API: Constraint conflict
        API-->>Web: 409 slot unavailable
        Web-->>Customer: Explain conflict and show alternatives
    end
```

The database exclusion constraint is the final defense against two customers
winning the same barber and time range. The API converts that database conflict
into a stable `409` response; the UI should refresh availability instead of
pretending the earlier screen was still authoritative.

## 2.9 Check-in and completion sequence

```mermaid
sequenceDiagram
    actor Customer
    actor Barber
    actor Owner
    participant API as Express API
    participant DB as Postgres lifecycle RPC
    participant Worker as Transition worker

    Owner->>API: Accept and assign appointment
    API->>DB: requested -> confirmed
    Barber->>API: Issue short-lived check-in code
    API->>DB: Store code hash and expiry
    Customer->>API: Submit check-in code
    API->>DB: confirmed -> checked_in
    Barber->>API: Start service with expected_version
    API->>DB: checked_in -> in_progress
    Barber->>API: Finish service with expected_version
    API->>DB: in_progress -> awaiting_confirmation
    alt customer confirms
        Customer->>API: Confirm completion
        API->>DB: awaiting_confirmation -> completed
    else customer disputes
        Customer->>API: Open dispute with reason
        API->>DB: awaiting_confirmation -> disputed
        Owner->>API: Resolve within authorized policy
        API->>DB: disputed -> completed or cancelled
    else customer takes no action
        Worker->>DB: Finalize due appointments
        DB->>DB: awaiting_confirmation -> completed
    end
```

The service is not considered completed when the barber merely taps Finish.
Finish opens a confirmation window; customer confirmation or the controlled
timeout closes it, while a dispute preserves an auditable review path.

## 2.10 Aggregate ownership

Use these boundaries when deciding where a mutation belongs:

| Aggregate | Root | Mutations that must be atomic |
| --- | --- | --- |
| Account verification | `users` / planned submission | Submit, review, grant or restrict operational role. |
| Shop catalog | `shops` | Publish, update public identity, hiring status, hours, and media references. |
| Employment | `barber_employment` | Accept application/invitation, activate one shop, end previous stint, consume opening. |
| Appointment | `appointments` | Assign, transition status, snapshot service, record event, protect version and time slot. |
| Conversation | `conversations` | Validate participant and append message. |
| Rating | `ratings` | Verify completed appointment and refresh both aggregates. |
| Payment | planned `payments` | Verify provider/cash evidence and recognize revenue exactly once. |
