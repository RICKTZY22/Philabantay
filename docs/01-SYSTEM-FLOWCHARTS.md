# 1. Philabantay system flowcharts

This document explains the product as a sequence of decisions and state
changes. Read it before the UML, DFD, or database documents. A box marked
**CURRENT** is backed by the repository today; **PARTIAL** means only part of
the path exists; **PLANNED** is the intended behavior.

## 1.1 Whole-product journey

```mermaid
flowchart TD
    Visitor["Visitor opens Philabantay"] --> Signup["Create account or sign in<br/>CURRENT"]
    Signup --> Role{"Choose intended role"}

    Role -->|Customer| CustomerReady["Customer onboarding<br/>CURRENT"]
    Role -->|Barber| BarberVerify["Barber verification<br/>PLANNED"]
    Role -->|Owner| OwnerVerify["Owner verification lock<br/>PARTIAL"]

    BarberVerify --> AdminReview["Admin review<br/>PLANNED UI"]
    OwnerVerify --> AdminReview
    AdminReview -->|Approved| ProfessionalReady["Professional privileges enabled"]
    AdminReview -->|More information| Resubmit["Correct and resubmit"]
    Resubmit --> AdminReview
    AdminReview -->|Rejected| Restricted["Restricted account with reason"]

    ProfessionalReady -->|Owner| ShopSetup["Create and publish shop<br/>PARTIAL API / PLANNED UI"]
    ProfessionalReady -->|Barber| JobMode["Find a shop or enter join code<br/>PARTIAL"]

    ShopSetup --> Hiring["Hiring and invitations<br/>PARTIAL"]
    JobMode --> Hiring
    Hiring --> Employment["Active barber employment<br/>CURRENT core"]

    CustomerReady --> Discover["Discover shop, service, and barber<br/>CURRENT"]
    ShopSetup --> Discover
    Employment --> Discover
    Discover --> Request["Reservation requested<br/>CURRENT"]
    Request --> Operate["Accept, assign, check in, serve, finish<br/>CURRENT backend / PARTIAL UI"]
    Operate --> Complete["Customer confirms or completion timer closes visit<br/>CURRENT backend"]
    Complete --> Review["Verified-visit rating<br/>CURRENT core"]
    Complete --> Analytics["Owner and barber operational data<br/>PARTIAL"]
    Review --> Analytics
    Analytics --> Improve["Adjust staffing, hours, services, and hiring<br/>PLANNED feedback loop"]
    Improve --> ShopSetup
```

The central idea is a feedback loop. Shop configuration makes discovery and
booking possible; completed visits generate trusted history; that history helps
the owner improve configuration and staffing. A chart is never the source of
truth—it is a view over finalized operational records.

## 1.2 Account and verification flow

```mermaid
flowchart TD
    A["Supabase Auth account created<br/>CURRENT"] --> B["public.users profile created by trigger<br/>CURRENT"]
    B --> C{"Requested role"}

    C -->|Customer| D["verification_status = not_required"]
    D --> E["Complete basic onboarding"]
    E --> F["Customer access"]

    C -->|Barber or owner| G["Base privileges remain restricted"]
    G --> H["Complete verification form<br/>PLANNED persistence"]
    H --> I["Upload private evidence<br/>PLANNED Storage bucket"]
    I --> J["verification_status = pending"]
    J --> K{"Admin decision<br/>PLANNED UI/API"}
    K -->|Approve| L["verification_status = verified"]
    K -->|Request changes| M["Return reason and editable submission"]
    M --> H
    K -->|Reject| N["verification_status = rejected"]
    L --> O{"Role"}
    O -->|Owner| P["Redirect to Shop Setup when no shop exists"]
    O -->|Barber| Q["Open job-seeker or employed workspace"]
```

Security rule: selecting a role in the browser is only a request. The browser
cannot approve it. Express authorization and Postgres RLS must both see a
verified server-side profile before professional operations are permitted.

The repository already locks unverified owners out of operational routes, but
it does not yet have a complete verification-submission table, evidence bucket,
or admin review screen. Those pieces are explicitly planned rather than implied.

## 1.3 Owner shop setup and publishing

```mermaid
flowchart LR
    Verified["Verified owner"] --> Existing{"Owns a shop?"}
    Existing -->|No| Draft["Create draft shop"]
    Existing -->|Yes| Edit["Open Shop Setup"]
    Draft --> Identity["1. Name, description, contact"]
    Identity --> Location["2. Address and exact map pin"]
    Location --> Hours["3. Weekly hours and exceptions"]
    Hours --> Services["4. Services, duration, price, specialty"]
    Services --> Media["5. Logo, cover, gallery"]
    Media --> Staffing["6. Join code and optional hiring"]
    Staffing --> Validate{"Required fields valid?"}
    Validate -->|No| Draft
    Validate -->|Yes| Publish["Publish shop"]
    Publish --> Discoverable["Visible in customer discovery"]
    Edit --> Identity
```

The current API can create and update basic shop rows and services. The full
owner wizard, draft/published state, operating-hours storage, photos, and hiring
fields on the shop are planned extensions.

Publishing is different from verification: verification proves the owner;
publishing proves the shop profile has enough information for customers.

## 1.4 Hiring, application, invitation, and join-code flow

```mermaid
flowchart TD
    Owner["Verified owner with published shop"] --> HiringOn["Enable hiring and set optional openings"]
    Barber["Verified barber looking for work"] --> Browse["Browse hiring shops"]
    HiringOn --> Browse

    Browse --> Apply["Barber applies"]
    Apply --> AppPending["Application pending"]
    AppPending --> Review["Owner reviews profile and portfolio"]
    Review -->|Decline| AppDeclined["Application declined"]
    Review -->|Contact| Thread["Application-scoped conversation"]
    Thread --> Offer["Owner sends offer"]
    Review -->|Offer directly| Offer
    Offer -->|Barber declines| AppDeclined
    Offer -->|Barber accepts| Activate["Employment becomes active atomically"]

    Owner --> Search["Browse barbers looking for work<br/>PLANNED"]
    Search --> Invite["Send shop invitation<br/>PLANNED"]
    Invite -->|Accepted| Activate
    Invite -->|Declined| InviteClosed["Invitation closed"]

    Owner --> Code["Generate or rotate shop join code<br/>CURRENT"]
    Barber --> Enter["Enter code"]
    Code --> Enter
    Enter --> JoinPending["Pending join request<br/>PLANNED safer behavior"]
    JoinPending -->|Owner confirms| Activate

    Activate --> Decrement{"Openings count specified?"}
    Decrement -->|No| KeepHiring["Remain hiring until owner turns it off"]
    Decrement -->|Yes, more remain| Reduce["Decrease remaining openings"]
    Decrement -->|Yes, reaches zero| Full["Set is_hiring = false"]
```

Today, hiring is represented by a one-to-one `hiring_listings` table, and the
barber map already filters open listings. The target design consolidates the
status and optional metadata onto the shop, or otherwise guarantees a single
authoritative source. The real API also needs atomic opening-count updates; the
mock and API currently differ.

Recommended join-code rule: a code identifies the shop but does not bypass
verification or owner approval. This prevents a leaked reusable code from
silently adding staff.

## 1.5 Reservation and fulfillment lifecycle

```mermaid
flowchart LR
    Requested["Requested"] --> Decision{"Owner decision before expiry"}
    Requested -->|Deadline passes| Expired["Expired"]
    Decision -->|Decline with reason| Declined["Declined"]
    Decision -->|Accept and assign| Confirmed["Confirmed"]

    Confirmed -->|Customer cancels| Cancelled["Cancelled"]
    Confirmed -->|No arrival after grace and staff review| NoShow["Customer no-show"]
    Confirmed -->|Valid PIN or QR| CheckedIn["Checked in"]
    CheckedIn -->|Assigned barber starts| InProgress["In progress"]
    InProgress -->|Assigned barber finishes| Awaiting["Awaiting confirmation"]
    Awaiting -->|Customer confirms| Completed["Completed"]
    Awaiting -->|Confirmation deadline, no dispute| AutoCompleted["Completed by timer"]
    Awaiting -->|Customer disputes| Disputed["Disputed"]
    Disputed -->|Owner/admin resolution| Resolved{"Resolution"}
    Resolved -->|Service valid| Completed
    Resolved -->|Correct outcome| Cancelled
```

This canonical lifecycle is substantially implemented in the Supabase
migrations and Express command routes. Every command uses an expected version,
locks the appointment row, re-checks actor and state, and writes an immutable
appointment event in the same transaction.

The database does not infer that a physical haircut occurred. Completion needs
evidence: check-in, start, finish, customer confirmation, or an audited timeout.

## 1.6 Barber preference and assignment

```mermaid
flowchart TD
    Start["Customer selects service and time"] --> Preference{"Barber preference"}
    Preference -->|Exact barber| Exact["Only requested barber is acceptable"]
    Preference -->|Preferred barber| Preferred["Try requested barber; alternative allowed"]
    Preference -->|Any barber| Any["Choose an eligible available barber"]

    Exact --> Available{"Requested barber available?"}
    Available -->|Yes| Hold["Create expiring slot hold/request"]
    Available -->|No| Reject["Offer another time or ask permission to reassign"]

    Preferred --> PreferredAvailable{"Preferred barber available?"}
    PreferredAvailable -->|Yes| Hold
    PreferredAvailable -->|No| Auto["Select alternative by availability and workload"]
    Any --> Auto
    Auto --> Hold

    Hold --> OwnerAccept["Owner accepts"]
    OwnerAccept --> DbGuard["Postgres overlap constraint and transaction"]
    DbGuard -->|Wins slot| Confirm["Confirmed assignment"]
    DbGuard -->|Conflict| Conflict["409 slot unavailable; show alternatives"]
```

The existing data model records a single barber on an appointment but does not
yet distinguish exact, preferred, and any-barber intent. That preference must be
stored if automatic assignment is added; otherwise the owner could replace an
exact request without consent.

## 1.7 Cancellation, late arrival, and no-show handling

```mermaid
flowchart TD
    Confirmed["Confirmed appointment"] --> Event{"What happened?"}
    Event -->|Customer cancels early| Early["Cancelled by customer"]
    Event -->|Customer cancels inside policy window| Late["Late cancellation"]
    Event -->|Shop or barber cancels| ShopCancel["Cancelled by shop"]
    Event -->|Customer checks in| Continue["Continue fulfillment"]
    Event -->|No check-in after lateness grace| Eligible["Eligible for no-show review"]
    Eligible --> StaffDecision{"Authorized staff decision"}
    StaffDecision -->|Customer arrived or evidence unclear| Review["Needs review; keep record open"]
    StaffDecision -->|No arrival confirmed| NoShow["Customer no-show"]
    NoShow --> Appeal["Customer may dispute within policy window"]

    Early --> Release["Release slot and retain audit history"]
    Late --> Release
    ShopCancel --> Release
    NoShow --> Metrics["Count operational outcome; do not count revenue"]
    Review --> Closeout["Daily closeout queue"]
```

No cancellation or no-show is physically deleted. “Trash” in the interface
must mean archived from the active queue, never removed from the transactional
history.

## 1.8 Daily closeout and reconciliation

```mermaid
flowchart TD
    Trigger["30 minutes after configured shop closing time"] --> Job["Idempotent closeout job"]
    Job --> Pending["Expire unanswered requests whose service time passed"]
    Job --> Past["Find confirmed appointments past their end time"]
    Past --> Evidence{"Check-in, start, and finish evidence?"}
    Evidence -->|All present and confirmation deadline passed| Complete["Finalize completed"]
    Evidence -->|Missing or contradictory| Queue["Add to needs-review queue"]
    Job --> Due["Run appointment-relative expiry and confirmation timers"]
    Pending --> Rollup["Recompute or refresh finalized daily metrics"]
    Complete --> Rollup
    Queue --> Summary["Owner closeout summary with unresolved actions"]
    Rollup --> Summary
```

Appointment-relative timers remain authoritative. The shop-close job is a
reconciliation safety net; it must not cancel a legitimate service that runs
past posted closing time.

## 1.9 Rating and analytics flow

```mermaid
flowchart LR
    Completed["Completed appointment"] --> Eligible["Create one rating opportunity"]
    Eligible --> Review["Customer rates actual barber and shop"]
    Review --> Validate["Database verifies customer, appointment, barber, shop, and completed state"]
    Validate --> Store["Store rating"]
    Store --> Aggregate["Recalculate barber and shop aggregates"]
    Aggregate --> Public["Shop/barber profile and 1-5 star filters"]
    Completed --> Value["Completed service value"]
    Payment["Verified payment record<br/>PLANNED"] --> Revenue["Recognized revenue"]
    Value --> Dashboard["Owner operational analytics"]
    Revenue --> Dashboard
    Aggregate --> Dashboard
```

The current database correctly ties a rating to a completed appointment and
updates aggregates. It does not yet model payment, so current revenue charts
must be described as completed service value or estimates—not collected money.

## 1.10 Invariants shared by every flow

1. The browser proposes; Express and Postgres decide.
2. Every shop-scoped action carries or resolves a shop ID and verifies
   ownership or active membership.
3. State-changing commands are idempotent or protected by an expected version.
4. Human-world events require human or device evidence; absence of data is not
   proof of completion or misconduct.
5. Historical transactions are retained. UI archives are views, not deletes.
6. Analytics count only states whose meaning is finalized and documented.
7. Planned functionality stays visibly labeled until tests prove it works.
