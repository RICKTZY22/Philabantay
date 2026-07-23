# Product clarifications and decision register

The core V1 direction is settled, but these questions change schema,
permissions, or UI behavior enough that they should be answered before their
listed phase. Each includes a recommended default so the product owner can
reply “all recommended” or override individual IDs.

## Blocking before Phase 1 implementation

### Q1 — pending professional access

**Question:** Should a pending/rejected/suspended barber or owner be completely
locked to verification/status, help, and sign out, or may they use customer or
hiring features while waiting?

**Recommended:** Absolute professional lock. They may browse public pages only
after signing out as a guest. This matches the requested owner lock and avoids a
confusing partial identity.

**Decision (2026-07-19):** Accepted as recommended. The operational lock applies
to pending/rejected/suspended barbers as well as owners, not only owners.

### Q2 — owner who performs cuts

**Question:** When an owner enables “I also work as a barber,” should the owner
appear as a public provider with their own schedule, qualifications, bookings,
and barber rating?

**Recommended:** Yes. Keep primary role `shop_owner`, create a shop-scoped
service-provider capability/profile, and give the owner a separate provider
rating based only on cuts they actually perform. No role switching.

**Decision (2026-07-19):** Accepted as recommended. Authorization resolves an
owner as a bookable provider only through a shop-scoped `service_provider`
capability, never a client-selected role.

### Q3 — admin account provisioning and MFA

**Question:** Who creates the first admin accounts, and is MFA mandatory before
they can view identity evidence?

**Recommended:** Provision admins only through a secure server-side operational
process; never public signup. Require MFA and log every evidence view and
decision.

**Decision (2026-07-19):** Accepted as recommended. `admin` is never offered in
public onboarding; MFA is required before any evidence view; evidence access and
every decision are audited.

## Approved defaults for Phase 2 implementation

**Decision (2026-07-22):** The product owner accepted all recommendations in
Q4–Q7. They are binding V1 defaults unless a later dated decision replaces one.

### Q4 — shop publication review

**Question:** After owner identity approval and a complete Shop Setup, does the
shop publish automatically, or does an admin review every new shop/location?

**Recommended:** First publication requires a lightweight admin review of shop
control/address/location. Later ordinary content/price/hour edits publish
immediately; ownership or major location changes return to review.

### Q5 — preferred-barber substitution after confirmation

**Question:** If a preferred barber becomes unavailable after confirmation,
does the replacement take effect immediately while the customer can opt out, or
stay pending until customer accepts?

**Recommended:** Keep the appointment confirmed but flag “replacement needs
attention”; notify immediately and let the customer accept, reschedule, or
cancel without penalty. Do not start service until the customer acknowledges
the actual provider. Exact-barber replacement always requires explicit consent.

### Q6 — staff-note visibility

**Question:** Are all staff notes visible to the barber they concern, or may an
owner write a private management note?

**Recommended:** Add visibility `shared_with_barber | owner_only`.
Barber-authored notes are shared; owner chooses explicitly. Never use hidden
notes as an automatic disciplinary or performance score.

### Q7 — service qualifications

**Question:** Who may certify that a barber can perform a service?

**Recommended:** Owner grants/removes shop-scoped service qualifications after
employment; barber may request them but cannot self-grant. Owner-provider
qualifications are configured during Shop Setup and auditable.

## Approved defaults for Phase 3 implementation

**Decision (2026-07-22):** The product owner accepted all recommendations in
Q8 and Q10–Q12. Q9 was already accepted on 2026-07-19.

### Q8 — no-show strikes: platform or shop scope

**Question:** Do the three upheld no-show strikes apply across Philabantay or
only at the affected shop?

**Recommended:** Platform-wide manual-approval restriction, but owners see only
the restriction flag/expiry and the customer's incidents at their shop—not the
private details from other shops.

### Q9 — designated cashier

**Question:** May an owner grant offline-payment recording to an active barber?

**Recommended:** Yes, through a narrow `record_offline_payment` shop capability.
It does not grant refunds, analytics administration, staffing, or shop settings.
Owner performs refunds/corrections in V1 unless a separate permission is later
approved.

**Decision (2026-07-19):** Accepted as recommended. `record_offline_payment` is
a shop-scoped capability grantable to an active barber; refunds/corrections stay
with the owner in V1.

### Q10 — walk-in OTP and fallback

**Question:** Which provider sends OTP, and what happens if a guest has no
phone?

**Recommended:** Build a provider interface and local test stub; choose the
production vendor at Phase 5 procurement. No-phone fallback creates an audited
staff-verified claim with a short code, but only OTP-verified or later
account-linked claims may publish a public rating unless a stronger fallback
policy is approved.

### Q11 — one chair per active visit

**Question:** Does every V1 service consume exactly one physical chair, or can a
service consume zero or multiple chairs?

**Recommended:** Exactly one chair per capacity hold/active visit.
Multi-resource services are post-V1.

### Q12 — cancellation inside two hours

**Question:** Can a customer still cancel inside the free-change cutoff, and how
is it labeled without V1 fees?

**Recommended:** Yes. Record `late_customer_cancellation`, release capacity,
notify the shop, and retain the policy snapshot. Do not automatically count it
as a no-show or charge a fee.

## Approved defaults for Phase 4 implementation

**Decision (2026-07-22):** The product owner accepted all recommendations in
Q13–Q16.

### Q13 — dispute timing

**Question:** What response windows should the UI promise for owner decisions
and customer escalation?

**Recommended:** Owner response target 48 hours; customer may escalate within
48 hours of owner decision; admin target five business days. Present them as
targets, not guarantees, until support staffing is proven.

### Q14 — public reviewer identity

**Question:** How is a customer named on a public verified review?

**Recommended:** First name plus last initial by default, with an Anonymous
display option. Never reveal phone, email, precise location, or full account
history.

### Q15 — public response editing

**Question:** Can a shop/barber edit its one public response?

**Recommended:** One response editable for seven days; preserve every version
in the moderation audit. After that, correction requires support/moderation.

### Q16 — launch language and locale

**Question:** Confirm launch currency, timezone, and interface languages.

**Recommended:** PHP, `Asia/Manila`, and English plus Filipino/Taglish-ready
strings. Persist shop timezone even while V1 launches in one market.

## Approved defaults and required operational gates for Phase 5

**Decision (2026-07-22):** The product owner accepted the recommended defaults
in Q17–Q19. Vendor procurement and legal/privacy approval remain Phase 5 release
work; accepting the engineering default does not claim those external reviews
have occurred.

### Q17 — email and OTP vendors

**Question:** Which production providers and budget are approved?

**Recommended:** Keep provider adapters vendor-neutral through Phase 3/4;
choose vendors before staging soak based on Philippine delivery, privacy, cost,
retry, and webhook support.

### Q18 — recovery and service targets

**Question:** What recovery point, recovery time, and availability targets can
the production budget support?

**Recommended starting targets:** RPO at most 24 hours, RTO at most 4 hours for
the pilot, and 99.5% monthly application availability. Tighten after measured
pilot operations.

### Q19 — final retention/legal approval

**Question:** Has Philippine privacy/legal review approved 90-day verification
evidence, 2-year messages, 5-year operational/financial history, and 1-year
security logs?

**Recommended:** Treat these as engineering defaults until counsel/data-
protection review signs off; support legal hold and configurable retention.

## Decision log

| ID | Decision | Date | Decided by | Documents updated |
| --- | --- | --- | --- | --- |
| Q1 | Accepted: absolute professional lock (pending/rejected/suspended barbers and owners). | 2026-07-19 | Product owner | OPEN-QUESTIONS.md |
| Q2 | Accepted: owner-as-provider via shop-scoped `service_provider` capability; no role switching; separate provider rating. | 2026-07-19 | Product owner | OPEN-QUESTIONS.md |
| Q3 | Accepted: admins provisioned server-side only; MFA before evidence view; all access/decisions audited. | 2026-07-19 | Product owner | OPEN-QUESTIONS.md |
| Q9 | Accepted: narrow `record_offline_payment` shop capability for an active barber; refunds/corrections stay with owner. | 2026-07-19 | Product owner | OPEN-QUESTIONS.md |
| Q4–Q8, Q10–Q19 | Accepted all recommended defaults; Q17 procurement and Q19 legal/privacy approval remain Phase 5 release gates. | 2026-07-22 | Product owner | OPEN-QUESTIONS.md, phase plans, work breakdown |

Future policy changes must add a dated decision row and update the product
contract, relevant phase, contracts, tests, and UI copy together.
