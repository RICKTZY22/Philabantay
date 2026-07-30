# QA and traceability matrix

This matrix prevents a feature from being declared complete because one screen
exists. Each requirement must trace through shared contract, database/security,
API/adapter, frontend, and verification evidence.

The human-readable, per-test breakdown lives in
[`../testing/`](../testing/README.md): one file per phase listing every
automated test and the findings behind it.

## 1. Requirement map

| ID | Requirement | Phase | Primary evidence |
| --- | --- | --- | --- |
| ID-01 | Signup cannot self-grant barber/owner/admin | 1 | Auth/RLS/API tests |
| ID-02 | Barber and owner evidence submission/resubmission | 1 | Browser + storage tests |
| ID-03 | Admin review/approve/reject/suspend with audit | 1 | Admin E2E + DB events |
| SEC-01 | Express and RLS independently isolate roles/shops | 1–5 | Direct JWT matrix |
| SEC-02 | No direct appointment write bypass | 1 | Negative RLS/concurrency tests |
| SEC-03 | Former/suspended staff lose access | 1–4 | Chat/command denial tests |
| SHOP-01 | Owner creates/resumes/edits one private shop draft | 2 | Owner E2E |
| SHOP-02 | Only valid published shops appear publicly | 2 | Passed: published eligibility + strict anonymous summary/detail projection + API/direct-RLS tests |
| SHOP-03 | Real location, hours, closures, media, services, policies, chairs | 2 | Setup E2E + 2026-07-28 public detail contract/API projection; live availability remains P2-07 |
| HIRE-01 | Shop hiring off/open/full with optional count/note | 2 | Passed 2026-07-27: version/race + public gate + direct-RLS + authenticated UI refresh/mobile/a11y smoke |
| HIRE-02 | Application/invitation/join code converge on request | 2 | Employment E2E |
| HIRE-03 | Final opening and one-active-employment are atomic | 2 | Concurrency tests |
| STAFF-01 | Owner-assigned shifts and applied change requests | 2 | DB/API/browser tests |
| AVAIL-01 | Availability combines all required schedule/policy inputs | 2 | Scenario table |
| AVAIL-02 | Provider/customer/chair capacity holds under race | 2 | Parallel transaction tests |
| BOOK-01 | Manual default, optional instant, 15-minute request hold | 3 | Timer/race E2E |
| BOOK-02 | Exact/preferred/any intent and balanced assignment | 2–3 | Rule + browser tests |
| BOOK-03 | Owner accept/decline/assign/reassign UI and audit | 3 | Owner/customer/barber E2E |
| VISIT-01 | Check-in/start/finish/confirm/timeout/dispute lifecycle | 3 | Lifecycle E2E + events |
| VISIT-02 | Material service/reassignment change requires consent | 3 | Conflict/consent tests |
| EXC-01 | Cancel, no-show, appeal, strikes, delay, disruption | 3 | Time/policy E2E |
| WALK-01 | Staff walk-in, QR/OTP claim, fallback, linked visit | 3 | Guest mobile E2E |
| CLOSE-01 | Closeout is idempotent and never guesses | 3 | Worker repeat tests |
| PAY-01 | Offline collection/correction/refund separate from visit | 3 | Payment event tests |
| NOTIF-01 | Event/outbox atomic; in-app state survives delivery failure | 3–4 | Failure/retry tests |
| MSG-01 | Context-scoped notebook messages; former staff removed | 4 | Participant/retention tests |
| TRUST-01 | Owner-first dispute then audited admin escalation | 4 | Multi-role E2E |
| RATE-01 | One completed verified visit review; 7-day edit | 4 | Eligibility/time tests |
| RATE-02 | Separate shop/barber score, response, moderation, appeal | 4 | Public/admin E2E |
| DATA-01 | Owner metrics have definitions and reproducible queries | 4 | Golden query comparison |
| UX-01 | Role hamburger, no duplicate global tabs | 1–4 | Route/navigation smoke |
| UX-02 | Complete async/error/stale/offline state contract | 1–4 | Component/browser tests |
| A11Y-01 | Keyboard, screen reader, contrast, zoom, reduced motion | 1–5 | Automated + manual audit |
| OPS-01 | Durable jobs, monitoring, retention, backups, restore | 5 | Drill/runbook evidence |
| REL-01 | Full clean-environment role journey without SQL | 5 | Release-candidate E2E |

## 2. Availability scenario table

The authoritative availability suite must cover at least:

| Scenario | Expected result |
| --- | --- |
| Shop draft/suspended/closed | No public slot. |
| Outside weekly hours | No slot. |
| Date closure | No slot; replacement hours override when configured. |
| Barber not actively employed/verified/qualified | Not a candidate. |
| Owner provider capability at foreign shop | Denied. |
| Shift exception unavailable | No slot. |
| Approved absence | No slot. |
| Duration fits but duration + buffer does not | No slot. |
| Provider overlap | No slot. |
| Customer overlap | No slot for that customer. |
| All chairs consumed by other providers | No slot. |
| Requested hold active | Capacity blocked until release/expiry. |
| Hold expires | Capacity becomes available once. |
| Exact barber unavailable | No silent substitute. |
| Preferred unavailable | Qualified policy path returned. |
| Any with unequal assigned minutes | Least-assigned eligible provider chosen. |
| Any tie | Stable tie-break produces same retry result. |
| Two simultaneous final claims | One success, one conflict/alternative. |

## 3. Lifecycle transition test table

| Command | Valid actor/state | Negative cases |
| --- | --- | --- |
| Create request | Customer; bookable quote | Foreign shop/service, overlap, closed, unverified provider, duplicate key |
| Accept | Owning owner; `requested`; unexpired | Barber/customer actor, stale version, expired/capacity lost |
| Decline | Owning owner; `requested` | Missing reason, foreign shop, terminal state |
| Reassign | Owner under preference/consent policy | Exact without consent, unqualified/unavailable provider |
| Check in | Customer code or owner reason; `confirmed` | Early/expired/replayed/wrong code, foreign actor |
| Start | Assigned provider/authorized fallback; `checked_in` | Wrong provider, no check-in, stale version |
| Propose change | Provider/owner; valid active state | Invalid service, price/duration, foreign actor |
| Approve change | Customer; pending proposal | Expired/stale/conflicting capacity |
| Finish | Actual provider; `in_progress` | Wrong actor/state, unresolved required proposal |
| Confirm | Customer; `awaiting_confirmation` | Foreign actor, stale/terminal |
| Auto-complete | System; due valid sequence | Early, disputed, missing finish |
| Dispute | Customer; `awaiting_confirmation` | Late/terminal/foreign |
| Resolve | Owner then admin escalation policy | Self-review, missing reason, stale case |
| No-show | Owner/assigned provider after grace | Early, customer actor, no reason, wrong appointment |
| Cancel/reschedule | Actor and cutoff/policy allow | Foreign, started visit, overlap, stale |

## 4. Role/tenant security probes

For every protected resource, test all of the following where relevant:

- anonymous;
- owning customer;
- different customer;
- assigned active barber;
- different barber in same shop;
- barber in another shop;
- former barber;
- suspended/pending barber;
- owning owner;
- owner of another shop;
- ordinary admin without case assignment where restricted;
- assigned/admin reviewer;
- worker/service identity;
- guessed UUID and valid foreign UUID.

Run once through Express and once with direct authenticated Supabase access.
Service-role-only tests do not prove RLS.

## 5. Screen quality checklist

Every route has evidence for:

- session restore/no forbidden flash;
- loading skeleton;
- empty state with valid next action;
- partial failure;
- validation summary/field association;
- forbidden/not found safety;
- stale-version recovery;
- offline/network retry and preserved safe draft;
- duplicate-submit resistance;
- success announcement and authoritative refresh;
- keyboard order/focus/escape/return;
- screen-reader name/state/status;
- no color-only meaning;
- 200% zoom and 320 px layout;
- reduced-motion path;
- mobile/tablet/desktop screenshots or browser evidence.

## 6. Test layers and commands

The exact scripts may evolve, but CI must expose clear jobs for:

```text
shared typecheck + unit tests
API typecheck + unit/route tests
web typecheck + component tests
clean Supabase migration + SQL assertions
direct RLS role matrix
API integration matrix
concurrency/idempotency tests
browser E2E by role/domain
accessibility audit
production build + bundle/performance report
secret/dependency/security scan
git diff --check
```

## 7. Phase sign-off record

| Phase | Product review | Security/data review | Frontend/accessibility review | Automated gate | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Pending | RLS/API matrix green; independent re-scan pending | Pending (browser/a11y smoke) | Passed 2026-07-24 (typecheck, 86 unit, build, matrix 54/54 incl. integration) | Automated gate green; human reviews pending |
| 2 | Pending | P2-01 through P2-06 local API/direct-RLS workspace green (69/69 twice) after clean reset through `20260728000600` on 2026-07-28; direct schedule revision/event and request-status writes denied; anonymous/foreign owner schedule access denied; concurrent owner writes produce one 200 and one stale 409; P4025 count asserted | P2-02 Shop Setup, P2-03 Hiring, P2-04 employment, P2-05 provider, and P2-06 schedule-authority smoke green; P2-06 covered owner weekly/exception writes, read-only barber request/approval, stale sessions, exact 390×844 owner/barber layouts without overflow, native keyboard controls, reduced motion, and no console errors | All workspaces typecheck; 124 fast tests (shared 56, api 28, web 40); API/web production builds; lint, DB lint, and diff validation passed 2026-07-29. Matrix re-run 69/69 twice back to back on 2026-07-29 with no reset, against every migration through `20260728000700`. Clean-reset replay proof still stops at `20260728000600` | In progress (P2-01 through P2-05 complete; P2-06 implementation gate green but independent sign-off pending; P2-07 not started) |
| 3 | Pending | Pending | Pending | Pending | Not started |
| 4 | Pending | Pending | Pending | Pending | Not started |
| 5 | Pending | Pending | Pending | Pending | Not started |

Pre-P2-07 presentation evidence added 2026-07-29: the public landing/auth slice
passed 1440/1024/390/320 responsive checks without horizontal overflow,
route-stable portalled login/signup, field-associated validation with first
invalid focus, Escape/focus restoration, reduced-motion fallbacks, a bright
unified workflow chapter, a live `Asia/Manila` analog clock tower and matching
city phase, and a clean
browser console. The same run passed all workspace typechecks, 124 fast tests,
lint, and API/web production builds. This evidence does not mark P2-06 complete
or start P2-07.

### P2-06 workflow scenarios: functionally verified 2026-07-30

Scenarios 1 to 4 were executed on the product owner's request (they were mid
UI-redesign) against the running local stack, through the real HTTP API and the
real browser UI, with no SQL shortcuts. Every one passed.

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Two concurrent owner writes claiming the same schedule version | One `200`, one `409 conflict`. An explicitly stale `expected_version: 1` also returned `409 conflict`. |
| 2 | Barber cannot write their own schedule | `PUT /owner/staff/:id/shifts` with the barber's token returned `403 forbidden`. The `/schedule` screen rendered **0** time inputs, editable or otherwise. |
| 2 | Barber submits both request kinds | `time_off` and `different_hours` both returned `201`. |
| 3 | Approval alone writes the exception | Approve returned `200` with `exception_id` and `schedule_version: 3`; the barber's own `/shifts/exceptions/me` then contained the date with `is_available: false`, with no separate shift edit. Revision advanced 2 → 3. |
| 4 | Removing availability on a booked date | `409 schedule_has_active_bookings`: "This change would leave 1 active booking(s) outside the barber's availability on 2026-08-05. Resolve them first." |
| 4 | Narrowing hours so the booking falls outside (the `20260728000700` fix) | Same `409` and message for a 14:00-18:00 window against a 10:00 booking. |
| 4 | Negative control: a window that still covers the booking | `201`, accepted. Proves the guard is not simply refusing every exception. |
| — | Owner write path through the browser UI | Changed a weekday end time to 20:15 in the staff panel and saved; the database showed `20:15:00` and `schedule_version` advanced to 5. |

Scenario 4 setup was performed through the API the UI calls: weekly operating
hours set, shop published (`lifecycle_status: published`), and a real customer
booking created by `customer@phila.test` for `2026-08-05` 10:00 Manila.

One suspicion investigated and dismissed: `OwnerStaffPanel` seeds form state
straight from the API, which returns `HH:MM:SS`, while the write contract is
`HH:MM`, so an unchanged save looked like it should fail validation. It does
not. The rendered `input[type="time"]` values are all clean `HH:MM` with none
empty, so the browser normalises before React ever sends them.

#### Accessibility evidence, same standard as P2-02 through P2-05

Measured on both P2-06 surfaces with the shift editor open:

| Surface | Visible interactive | Keyboard reachable | Not reachable | Unlabelled |
| --- | --- | --- | --- | --- |
| Owner `/dashboard/owner/staff` | 47 | 39 (8 disabled) | **0** | **0** |
| Barber `/schedule` | 41 | 40 (1 disabled) | **0** | **0** |

All 14 `input[type="time"]` controls in the shift editor are labelled, and 14
`:focus`/`:focus-visible` rules are live in the loaded stylesheets.

Reduced motion is satisfied structurally rather than by emulation, which is
stronger than it sounds here: `BarberShiftCalendar.css` and `DashboardPage.css`
declare **zero** transitions or animations, so there is nothing to suppress, and
`OwnerStaffPanel.css` carries a blanket
`@media (prefers-reduced-motion: reduce)` block forcing `transition: none` and
`scroll-behavior: auto` across `.owner-provider-panel *` and
`.owner-staff-card *`.

**Still outstanding:** product judgment on the visible workflow. That is the
product owner's call and cannot be delegated to an agent.

**Re-scoped, not a P2-06 blocker.** `ModalPortal` initial focus and focus return
were previously listed here in error. No P2-06 surface uses it:
`OwnerStaffPanel`, `BarberShiftCalendar`, `DashboardPage`, and
`ShopOwnerDashboard` do not import `ModalPortal` at all. Its users are `Layout`
(the landing auth dialog), `CustomerDashboard`, and `AppointmentsPage`, so the
check belongs to the pre-P2-07 landing/auth polish slice. It remains
**unverified rather than broken**: focus is moved inside a
`requestAnimationFrame` that a headless pane never fires, while Escape and the
`inert` toggle are synchronous and both work.

Agents update evidence links/commit IDs here only after tests actually pass.
Do not replace “Pending” with assumptions.

## 8. Recurring logic and loophole audit

The current baseline is recorded in
[`LOGIC-LOOPHOLE-RESCAN-2026-07-22.md`](LOGIC-LOOPHOLE-RESCAN-2026-07-22.md).
After every integrated work packet, append its API, direct-RLS, race/retry and
browser verdict to that report. New findings receive a stable `LR-###` ID and
map back to a requirement row above; never delete an old finding to make a gate
look green.

Current integrated evidence (2026-07-22): a clean local Supabase reset applied
all migrations through `20260722000700_command_boundary_and_lock_order`.
The API suite passed 42/42, including 22 Docker-backed Express/direct-RLS/
command-boundary/race tests; shared passed 27/27; web passed 19/19; workspace
typecheck, production build, and `git diff --check` passed. Database lint
completed with three non-blocking unused-variable warnings in wrapped
appointment functions. P1-03, P1-04, and P1-06 are green; the backend half of
the P1-02 professional lock is green for pending, rejected, and suspended
barber and owner requests.

Live browser smoke evidence: pending owner and barber operational deep links
redirect to `/verification`; the operational menu is absent; sign out works;
and the lock layout has no horizontal overflow at 390 px. The same smoke test
found a forbidden public landing/sign-in flash during session restoration and
copy that falsely implies a verification submission/review case exists. These
remain frontend P1-02 blockers. P1-05 and the full P1-07 admin/browser/
accessibility matrix remain open, so this is not a Phase 1 sign-off.
