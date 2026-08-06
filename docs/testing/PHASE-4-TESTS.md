---
tags:
  - philabantay
  - phase-4
  - testing
updated: 2026-08-05
---

# Phase 4 test catalogue

Evidence for [Phase 4 — trust, insights, experience](../plans/04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md).
Every row below is a test that exists and was observed passing; the rows that are
**not** covered say so plainly rather than being marked green by association.

Run the backend suites from `apps/api`:

```bash
RUN_LOCAL_SUPABASE_TESTS=1 npx vitest run
```

## Files added by Phase 4

| File | Tests | Covers |
| --- | --- | --- |
| `test/phase4-trust.integration.test.ts` | 14 | P4-03 ratings: eligibility, edit window, responses, reports, moderation, walk-in claims, aggregates |
| `test/phase4-disputes.integration.test.ts` | 7 | P4-02 support cases: the full journey, evidence visibility, audited access |
| `test/phase4-analytics.integration.test.ts` | 10 | P4-04 metrics, definitions, and the "revenue" label ban |
| `test/phase4-messaging.integration.test.ts` | 13 | P4-01 membership, blocking, send limits, pagination, retention |
| `test/phase4-settings.integration.test.ts` | 8 | P4-08 cross-device settings, mandatory notices, quiet hours, operations view |

`apps/api/vitest.config.ts` is new and load-bearing: every file in this workspace
shares one Postgres, and several matrix assertions are written against global
state, so files run serially. Before this they raced, and a suite that published a
shop or ran a shop-wide sweeper broke an unrelated suite that then passed on its
own. That was latent before Phase 4 and only stayed quiet because nothing else
published a shop.

## The twelve required tests

| # | Requirement | Status | Where |
| --- | --- | --- | --- |
| 1 | Customer dispute → owner decision → customer escalation → admin resolution | **covered** | `phase4-disputes` — "runs the whole journey" |
| 2 | Completed appointment creates one eligibility; seven-day edit then lock | **covered** | `phase4-trust` — "opens exactly one eligibility…", "allows an edit inside the seven-day window and locks it afterwards" |
| 3 | Walk-in claim can rate only its completed linked visit | **covered** | `phase4-trust` — "lets a linked walk-in rate only its own completed visit" |
| 4 | Negative review remains scored after abusive text is hidden | **covered** | `phase4-trust` — "keeps the score after abusive review text is hidden by a moderator" |
| 5 | Owner/barber response and report/moderation/appeal are audited | **covered** | `phase4-trust` — response and moderation event assertions; `phase4-disputes` — "audits every read of a case body" |
| 6 | Former/suspended barber cannot open staff messages or a guessed conversation | **covered** | `phase4-messaging` — "closes staff messages the moment employment ends, including a guessed id", plus the suspended-barber case |
| 7 | Owner dashboard metrics reproduce from fixture queries and use correct labels | **covered** | `phase4-analytics` — all ten tests; every figure re-derived from a stated fixture |
| 8 | Customer no-show never lowers barber performance | **covered** | `phase4-analytics` — "never lowers barber performance for a customer no-show" |
| 9 | Notification provider fails; in-app state remains and operations sees failure | **covered** | `phase4-settings` — "shows a provider failure to operations while in-app state survives"; the in-app half also in the Phase 3 matrix |
| 10 | Settings persist on another device and mandatory notices stay enabled | **covered** | `phase4-settings` — "persists a choice made on one device to another device", "keeps mandatory transactional notices enabled no matter what is sent" |
| 11 | Keyboard / screen reader / contrast / reduced motion / 320 px / tablet / desktop per role and admin | **NOT COVERED** | Needs a real browser. See "What Phase 4 still owes" |
| 12 | Performance comparison records role bundle sizes, key render time, image payload | **partial** | Bundle sizes are recorded below from the production build. Render time and image payload need a browser. |

**Ten of twelve are covered by automated regressions. Tests 11 and 12 are not, and
Phase 4 must not be recorded as complete until they are.**

## Falsification record

Every claim below was observed *failing* with the defect reintroduced, then
observed passing again after a full `supabase db reset`. A regression nobody has
seen fail is a regression nobody has tested.

| Defect reintroduced | Tests that failed |
| --- | --- |
| Restore `service_role` + `authenticated` write grants on `ratings` | 3 (service-role write, browser write, edit window) |
| Make the rating aggregate exclude hidden text | 1 (score survives moderation) |
| Let an unclaimed walk-in unlock a rating | 1 (walk-in claim) |
| Make `overturned_owner` skip the visit correction | 1 (dispute journey) |
| Remove the reviewer-only evidence filter | 1 (hidden notes) |
| Fold customer no-shows into shop-caused failures, and net refunds into collected | 7 (analytics, including required test 8) |
| Make the message block one-way | 1 (blocking) |
| Remove the employment recheck from `is_conversation_participant` **and** from `lock_current_barber_employment` | 2 (former barber, suspended barber) |
| Apply quiet hours to required notices, and drop the settings version check | 2 (quiet hours, stale save) |

One result worth recording on its own: removing the employment recheck from
`private.is_conversation_participant` alone did **not** break required test 6. The
rule is enforced at three independent layers — the Express guard, the command's
participant predicate, and the `messages` trigger via
`private.lock_current_barber_employment` — and it took disabling two database
layers before the assertion could be observed failing. That is a real
defence-in-depth property, and it is recorded here because it was demonstrated
rather than assumed.

## Gate evidence, 2026-08-05

On a database replayed from empty through all **69** migrations:

```text
migrations      69 applied from empty
DB lint         no schema errors
functions       219 / 219 in public+private pin `search_path = ''`  (100%)
typecheck       all workspaces passed
lint            eslint . --max-warnings 0, clean
fast tests      131 passed (shared 40, api 29, web 62)
matrix          143 / 143, twice back to back with no reset
build           API + web production build passed
diff            git diff --check clean (line-ending warnings only)
```

Write grants on every trust and settings table, checked directly: `anon`,
`authenticated`, and `service_role` hold **no** INSERT, UPDATE, DELETE, or TRUNCATE
on `ratings`, `rating_eligibilities`, `rating_responses`, `rating_reports`,
`rating_events`, `support_cases`, `case_participants`, `case_evidence`,
`case_events`, `conversations`, `messages`, `conversation_blocks`,
`conversation_reports`, or `notification_preferences`.

### Role bundle sizes (required test 12, partial)

From the production build. Role code is lazy-loaded, so a customer does not
download owner or admin screens.

```text
react-vendor           230.26 kB   gzip 73.77 kB   shared
index                  164.89 kB   gzip 43.93 kB   shared shell
leaflet                149.51 kB   gzip 43.30 kB   discovery map only
ShopOwnerDashboard      66.00 kB   gzip 16.37 kB   owner only
AppDashboardPage        27.10 kB   gzip  8.80 kB   customer home
ShopSetupPage           25.26 kB   gzip  6.94 kB   owner only
SettingsPage            22.78 kB   gzip  6.52 kB   shared
Phase3OperationsPage    18.20 kB   gzip  4.99 kB   staff only
AppointmentsPage        18.05 kB   gzip  5.77 kB   shared
BarberDashboard         17.27 kB   gzip  5.49 kB   barber only
AdminVerificationPage   11.68 kB   gzip  3.33 kB   admin only
RatingPanel             10.97 kB   gzip  4.07 kB   customer trust
ChatPage                 8.36 kB   gzip  3.14 kB   shared
```

No baseline existed before Phase 4, so this table *is* the baseline. A later run
compares against it; this one cannot claim "no regression" because there is
nothing yet to regress from.

## What Phase 4 still owes

Recorded honestly so nobody reads the table above as a finished phase.

1. **Required test 11 — accessibility and responsive sweep.** Not run. Needs a
   real browser at 320 px, tablet, and desktop for customer, barber, owner, and
   admin, with keyboard traversal, screen-reader labels, contrast, and reduced
   motion. The new surfaces were built to the contract — 44 px targets, visible
   focus, `prefers-reduced-motion` paths, no colour-only status, tables beside
   every chart, `overflow-x` on wide tables — but built to the contract is not
   the same as observed passing.
2. **Required test 12 — render time and image payload.** Bundle sizes are
   recorded; the other two figures are not measured.
3. **Admin console screens.** The dispute queue, moderation queue, and
   notification operations view are complete and tested at the API, with no UI.
   Plan section 11's console is the natural home and is not built.
4. **Rating response editing UI.** `api_edit_rating_response` exists and is
   granted; no screen calls it. Publishing a response is wired, editing is not.
5. **A `hiring` conversation kind** (owner ↔ candidate before employment) is
   deliberately absent. The plan's messaging section is satisfied by the existing
   `customer_shop` and `staff` kinds; adding a third would need a new enum value
   and a rethink of `private.validate_conversation`, which hard-requires either a
   customer account or shop ownership.
6. **P2-08 and P3-09 remain open** on their own three named items. Nothing here
   closes them, and nothing here depends on them.

## New traps, for the next card

- **`api_record_offline_payment` refuses a `paid_at` more than five minutes in the
  future.** A fixture cannot put collections in the same future window as its
  visits, and the analytics ledger buckets on `paid_at`, so those two assertions
  need two ranges.
- **`api_deliver_due_in_app_notifications` takes the oldest due rows up to a
  limit.** A test that enqueues a notice and expects the next sweep to reach it
  silently depends on the global queue being shorter than that limit. Backdate the
  fixture's `created_at` instead.
- **In-app inbox rows are created by the enqueue triggers, not by the delivery
  worker.** Asserting on `in_app_notifications` after calling the delivery command
  tests the wrong mechanism; assert on `notification_deliveries`.
- **`supabase db reset` restarts containers.** The first command afterwards can
  fail to connect. Give it a moment before running a suite.
