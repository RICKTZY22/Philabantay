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
| SHOP-02 | Only valid published shops appear publicly | 2 | RLS/catalogue/browser tests |
| SHOP-03 | Real location, hours, closures, media, services, policies, chairs | 2 | Setup E2E + schema checks |
| HIRE-01 | Shop hiring off/open/full with optional count/note | 2 | Race + UI refresh tests |
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
| 2 | Pending | P2-01 + P2-02 hours/closures matrix green (54/54) 2026-07-24 | Pending | P2-01 done; P2-02 slices 1-2 verified and committed (`2df2312`) | In progress (P2-01 done, P2-02 slices 1-2 done) |
| 3 | Pending | Pending | Pending | Pending | Not started |
| 4 | Pending | Pending | Pending | Pending | Not started |
| 5 | Pending | Pending | Pending | Pending | Not started |

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
