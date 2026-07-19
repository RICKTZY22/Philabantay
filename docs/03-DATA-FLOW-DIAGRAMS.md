# 3. Data-flow diagrams

A data-flow diagram (DFD) answers a different question from a flowchart. A
flowchart asks “what happens next?” A DFD asks “what data enters, where is it
validated, where is it stored, and who may receive it?”

Notation used here:

- Rectangles are people or external systems.
- Rounded nodes are Philabantay processes.
- Cylinder-shaped nodes are durable data stores.
- Arrow labels name the data—not merely the action.

## 3.1 Context diagram — DFD Level 0

```mermaid
flowchart LR
    Customer["Customer"]
    Barber["Barber"]
    Owner["Shop owner"]
    Admin["Administrator<br/>PLANNED console"]
    Map["Map/geocoding provider"]
    Notify["Email/SMS/push provider<br/>PLANNED"]
    Pay["Payment provider<br/>PLANNED"]

    System(("Philabantay platform"))

    Customer -->|identity, location consent, booking, message, rating| System
    System -->|shop discovery, booking status, messages, receipts| Customer

    Barber -->|verification, availability, employment response, service events| System
    System -->|job listings, shifts, bookings, messages, performance| Barber

    Owner -->|verification, shop catalog, hiring, assignments, operations| System
    System -->|reservations, staff state, reviews, analytics, alerts| Owner

    Admin -->|verification and moderation decisions| System
    System -->|review queues and audit evidence| Admin

    System -->|address or place reference| Map
    Map -->|normalized coordinates| System
    System -->|notification jobs| Notify
    Notify -->|delivery result| System
    System -->|payment intent or verification| Pay
    Pay -->|signed payment event| System
```

Purpose: establish the system boundary. Customers, barbers, owners, and admins
do not access one another’s records directly. All flows enter Philabantay and
are subjected to authentication, authorization, validation, and database
policy.

Current external integration is limited: OpenStreetMap tiles are used by the
browser. Notification delivery and payments are planned, and address
geocoding/server validation is not yet authoritative.

## 3.2 Platform decomposition — DFD Level 1

```mermaid
flowchart TB
    Customer["Customer"]
    Barber["Barber"]
    Owner["Owner"]
    Admin["Admin"]

    P1(("1. Identity and verification"))
    P2(("2. Shop catalog and discovery"))
    P3(("3. Hiring and employment"))
    P4(("4. Availability and booking"))
    P5(("5. Fulfillment and closeout"))
    P6(("6. Chat and notifications"))
    P7(("7. Ratings and analytics"))

    D1[("D1 Auth users and profiles")]
    D2[("D2 Verification evidence<br/>PLANNED")]
    D3[("D3 Shops, services, hours, media")]
    D4[("D4 Employment, shifts, attendance")]
    D5[("D5 Appointments and events")]
    D6[("D6 Conversations and messages")]
    D7[("D7 Ratings and payments")]
    D8[("D8 Notifications and audit logs<br/>PARTIAL/PLANNED")]

    Customer --> P1
    Barber --> P1
    Owner --> P1
    Admin --> P1
    P1 <--> D1
    P1 <--> D2

    Customer --> P2
    Owner --> P2
    P2 <--> D3

    Barber --> P3
    Owner --> P3
    P3 <--> D3
    P3 <--> D4

    Customer --> P4
    Barber --> P4
    Owner --> P4
    P4 <--> D3
    P4 <--> D4
    P4 <--> D5

    Customer --> P5
    Barber --> P5
    Owner --> P5
    P5 <--> D5
    P5 --> D8

    Customer --> P6
    Barber --> P6
    Owner --> P6
    P6 <--> D6
    P6 --> D8

    Customer --> P7
    Owner --> P7
    Barber --> P7
    P7 <--> D5
    P7 <--> D7
```

Explanation:

- Process 1 establishes who a person is and what they may do.
- Process 2 controls public shop facts; it must not publish incomplete or
  suspended shops.
- Process 3 turns applications, invitations, or approved join requests into an
  employment record.
- Processes 4 and 5 separate scheduling from physical fulfillment. A reserved
  slot is not proof of a completed service.
- Process 6 keeps participant-scoped communication separate from operational
  records.
- Process 7 reads finalized facts. It does not invent revenue or ratings.

## 3.3 Identity and professional verification — DFD Level 2

```mermaid
flowchart LR
    Applicant["Barber or owner applicant"]
    Admin["Authorized admin"]
    Auth["Supabase Auth"]
    P11(("1.1 Create account"))
    P12(("1.2 Submit verification"))
    P13(("1.3 Validate and store evidence"))
    P14(("1.4 Review decision"))
    P15(("1.5 Grant or restrict role"))

    Users[("users")]
    Requests[("verification_submissions<br/>PLANNED")]
    Documents[("private verification documents<br/>PLANNED")]
    Events[("verification_events<br/>PLANNED")]

    Applicant -->|email, password, basic metadata| P11
    P11 -->|credential operation| Auth
    Auth -->|auth user ID| P11
    P11 -->|unprivileged profile| Users

    Applicant -->|role-specific form| P12
    P12 -->|normalized submission| Requests
    Applicant -->|ID/business evidence| P13
    P13 -->|private object| Documents
    P13 -->|document metadata and hash| Requests

    Admin -->|approve, reject, or needs-info with reason| P14
    P14 -->|decision event| Events
    P14 --> P15
    P15 -->|trusted role and verification update| Users
    P15 -->|status result without private documents| Applicant
```

Security rules:

1. Passwords stay in Supabase Auth and never enter application tables.
2. Evidence objects are private and accessed through short-lived reviewer URLs.
3. Applicants can read their own submission status but not reviewer-only notes
   or another applicant’s evidence.
4. Only the trusted approval process may write effective role and verified
   status.
5. Every decision is append-only in the audit stream.

The current database has the `users.verification_status` field and an owner
operational lock but not the three planned verification stores shown above.

## 3.4 Shop setup and publication — DFD Level 2

```mermaid
flowchart LR
    Owner["Verified owner"]
    Customer["Customer discovery"]
    P21(("2.1 Save shop draft"))
    P22(("2.2 Validate location and required fields"))
    P23(("2.3 Manage services, hours, and media"))
    P24(("2.4 Publish or suspend shop"))
    P25(("2.5 Build discovery catalogue"))

    Shops[("shops")]
    Services[("services")]
    Hours[("shop_hours and closures<br/>PLANNED")]
    Media[("shop_media and object storage<br/>PLANNED")]

    Owner -->|name, contact, address, coordinates| P21
    P21 --> Shops
    Owner -->|services, weekly hours, images| P23
    P23 --> Services
    P23 --> Hours
    P23 --> Media
    Shops --> P22
    Services --> P22
    Hours --> P22
    P22 -->|validation result| P24
    Owner -->|publish request| P24
    P24 -->|lifecycle status| Shops
    Shops --> P25
    Services --> P25
    Hours --> P25
    P25 -->|published, allowed public fields only| Customer
```

Current risk: every stored shop is readable because no draft/published lifecycle
exists. The target catalogue must filter at the database/API layer; hiding a
draft only in React is insufficient.

## 3.5 Hiring and employment activation — DFD Level 2

```mermaid
flowchart TB
    Barber["Verified barber"]
    Owner["Verified owner"]
    P31(("3.1 Publish hiring status"))
    P32(("3.2 Browse matching shops/barbers"))
    P33(("3.3 Apply or invite"))
    P34(("3.4 Contact in scoped conversation"))
    P35(("3.5 Accept offer or join request"))
    P36(("3.6 Activate employment and consume opening"))

    Shops[("shops / hiring source")]
    Profiles[("barber job profiles<br/>PLANNED")]
    Applications[("applications, invitations, join requests")]
    Chats[("hiring conversations<br/>PLANNED")]
    Employment[("barber_employment")]

    Owner -->|openings, role, note| P31
    P31 --> Shops
    Shops --> P32
    Profiles --> P32
    Barber -->|search filters| P32
    Owner -->|search filters| P32
    Barber -->|application| P33
    Owner -->|invitation| P33
    P33 --> Applications
    P33 --> P34
    P34 <--> Chats
    Barber <--> P34
    Owner <--> P34
    Barber -->|accept or decline| P35
    Owner -->|accept, decline, or confirm join| P35
    P35 --> P36
    P36 -->|active verified stint| Employment
    P36 -->|decrement and auto-close at zero| Shops
```

The activation and opening decrement must be one transaction. Two accepted
offers cannot both consume the final opening, and a failed employment insert
must not decrease the count.

## 3.6 Booking request and assignment — DFD Level 2

```mermaid
flowchart LR
    Customer["Customer"]
    Owner["Owner"]
    Barber["Assigned barber"]
    P41(("4.1 Calculate available slots"))
    P42(("4.2 Validate booking request"))
    P43(("4.3 Reserve requested slot"))
    P44(("4.4 Accept and assign"))
    P45(("4.5 Publish participant views"))

    Catalog[("shops and services")]
    Schedule[("employment, shifts, exceptions")]
    Appointments[("appointments")]
    Events[("appointment_events")]

    Customer -->|shop, service, preference, date| P41
    Catalog --> P41
    Schedule --> P41
    Appointments -->|blocking intervals| P41
    P41 -->|candidate slots| Customer

    Customer -->|selected slot and notes| P42
    P42 --> P43
    P43 -->|requested appointment and price snapshot| Appointments
    P43 -->|created event| Events
    P43 -->|pending request| Owner

    Owner -->|accept, assign, decline, or propose change| P44
    Schedule --> P44
    P44 -->|versioned transition| Appointments
    P44 -->|assignment event| Events
    Appointments --> P45
    P45 -->|customer status| Customer
    P45 -->|assigned workload| Barber
    P45 -->|reservation ledger| Owner
```

The database already prevents overlapping active appointments for the same
barber. The target design must additionally persist exact/preferred/any-barber
intent and protect customers from overlapping their own bookings.

## 3.7 Physical fulfillment and completion — DFD Level 2

```mermaid
flowchart TD
    Customer["Customer"]
    Barber["Assigned barber"]
    Owner["Owner fallback"]
    Worker["Background worker"]

    P51(("5.1 Issue check-in code"))
    P52(("5.2 Verify arrival"))
    P53(("5.3 Start service"))
    P54(("5.4 Finish service"))
    P55(("5.5 Confirm, dispute, or auto-finalize"))

    Appointments[("appointments")]
    Events[("appointment_events")]

    Barber --> P51
    P51 -->|hashed code and expiry| Appointments
    P51 -->|plain code shown once| Customer
    Customer -->|six-digit code| P52
    Owner -->|manual fallback plus reason| P52
    P52 -->|checked-in timestamp| Appointments
    P52 -->|check-in event| Events
    Barber -->|start command| P53
    P53 --> Appointments
    P53 --> Events
    Barber -->|finish command| P54
    P54 --> Appointments
    P54 --> Events
    Customer -->|confirm or dispute with reason| P55
    Worker -->|due confirmation timeout| P55
    P55 -->|final status and timestamps| Appointments
    P55 -->|immutable outcome event| Events
```

The plain check-in code is never stored. Only its hash and expiry are durable.
Completion without customer action is allowed only after the documented
finished-service evidence and timeout.

## 3.8 Rating, reporting, and financial truth — DFD Level 2

```mermaid
flowchart LR
    Customer["Customer"]
    Owner["Owner"]
    Barber["Barber"]
    P71(("7.1 Verify rating eligibility"))
    P72(("7.2 Store review and refresh aggregates"))
    P73(("7.3 Build operational metrics"))
    P74(("7.4 Reconcile payments<br/>PLANNED"))

    Appointments[("appointments and events")]
    Ratings[("ratings")]
    Payments[("payments<br/>PLANNED")]

    Customer -->|scores and comment| P71
    Appointments -->|completed visit and actual barber/shop| P71
    P71 --> P72
    P72 --> Ratings
    Ratings -->|public aggregate and filters| Customer
    Appointments --> P73
    Ratings --> P73
    P73 -->|service value, funnel, utilization, ratings| Owner
    P73 -->|completed work and ratings| Barber
    Payments --> P74
    P74 -->|recognized revenue and refunds| Owner
```

Current dashboards can derive completed booked-service value. They cannot claim
collected revenue because the payment store and reconciliation process do not
exist yet.

## 3.9 Trust-boundary overlay

```mermaid
flowchart LR
    subgraph Untrusted["Untrusted client boundary"]
        UI["React UI"]
        Token["User access/refresh token"]
    end

    subgraph AppServer["Trusted application boundary"]
        API["Express API"]
        Validate["JWT, strict Zod, role, ownership"]
        ServiceKey["Service-role credential"]
    end

    subgraph Data["Trusted data boundary"]
        Auth["Supabase Auth"]
        RLS["Postgres plus RLS"]
        RPC["Locked transactional RPCs"]
        PrivateFiles["Private Storage<br/>PLANNED"]
    end

    UI -->|Bearer token and untrusted input| API
    Token --> UI
    API --> Validate
    Validate -->|getUser verification| Auth
    Validate -->|allowlisted query or command| RLS
    ServiceKey --> API
    API --> RPC
    RPC --> RLS
    API --> PrivateFiles
```

The service role bypasses RLS and therefore never belongs in the browser. Every
service-role query must be preceded by Express authorization or encapsulated in
an RPC that repeats actor and ownership checks. RLS remains essential because
authenticated Supabase tokens could otherwise access Postgres directly.
