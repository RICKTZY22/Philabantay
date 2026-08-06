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
| 11 | Keyboard / screen reader / contrast / reduced motion / 320 px / tablet / desktop per role and admin | **customer, barber, owner PASS; admin DEFERRED** | [P4-09 execution record](#p4-09-execution-record--2026-08-06) |
| 12 | Performance comparison records role bundle sizes, key render time, image payload | **covered** | [P4-09 execution record](#p4-09-execution-record--2026-08-06) |

**Ten of twelve were covered by automated regressions. Test 12 is now complete and
test 11 passes for three of four roles. Phase 4 does not close: the admin half of
test 11 is deferred with the staff admin console, which does not exist.**

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

---

## P4-09 execution record, 2026-08-06

Run against the real local stack: Express on `127.0.0.1:4000`, the production
build served on `localhost:5174`, Chrome 148. The six surfaces that had never been
opened were populated with real data first, completed visits, three reviews with
a spread, two disputes, offline payments, a chat thread, because empty states do
not exercise a chart, a decision form, or a focus trap.

### Six defects found, all fixed and re-measured

| # | Surface | Defect | Evidence |
| --- | --- | --- | --- |
| 1 | Customer home | `GET /ratings/workspace` returned **500** and blanked the whole screen. The embed hint `users!rating_eligibilities_provider_id_fkey` names a constraint that points at `barbers`, not `users`, so PostgREST answered `PGRST200`. No automated test covers this route, which is why 14 passing rating tests sat beside a broken home screen. | Reproduced directly against PostgREST; fixed with the two-hop embed already used in `bookings.ts` and `chat.ts`; re-verified on a freshly replayed database. |
| 2 | Customer home | The rating workspace was one of eight reads in a single `Promise.all`, so any one failure took discovery, bookings and messages down with it. | Defect 1 demonstrated it. The rating read now degrades to "no prompt" instead of blanking the page. |
| 3 | Owner Analytics, Owner Trust, Barber Performance, Dispute panel | Five `min-height: 44px` rules were **dead CSS**. `.app-shell.is-workspace .btn-sm` is three classes and pins small buttons to 36px, so `.analytics-range .btn` and its four siblings never applied. Measured at **36px**, not 44. | Every rule is now scoped under the workspace shell. Re-measured: 44px on all range buttons, trust forms and dispute actions. |
| 4 | Owner Analytics | "Text hidden by moderation" carried `definitionKey="distribution"`, so its "How this is calculated" disclosure described the rating spread and stated the opposite of what the tile counts. | The distribution definition now sits with the chart it describes, satisfying "every chart states its definition"; the tile no longer claims one. |
| 5 | Owner Trust | "Disputes needing a decision (n)" counted every unresolved case, including ones the owner had already decided. After recording two decisions the heading still read `(2)`. | Split into "Disputes needing a decision" (`owner_review` only) and "Decided, waiting on someone else". Re-measured: `(0)` and `(2)`. |
| 6 | Whole signed-in app | Two palette tokens failed WCAG AA. `--studio-faint` `#87909a` measured **2.64:1** at worst and `--studio-muted` `#66717b` **4.06:1**, both under 4.5:1 for normal text, on tiles, hints, table headers and metric labels everywhere. The base `--faint` `#8a867e` measured **3.29:1** and reaches every portalled dialog, because `ModalPortal` renders outside `.app-shell` and falls back to the doodle palette. | Three tokens darkened, plus the selected settings-nav description (4.06 → 5.93). Re-measured across five surfaces: **zero AA failures, minimum 4.59:1**. Flagged for product review, see [DECISIONS](../memory/DECISIONS.md). |

### Text size and contrast were stored and never applied

`text_size`, `high_contrast` and `reduce_motion` were written to the server by the
Settings panel and **read by nothing** in `apps/web`. Choosing "Larger" persisted
at version 1 and changed no font, colour, class or attribute. Section 9 requires a
readable-font/text-size mode, a contrast mode and a reduced-motion path for every
role, so two of the three modes did not exist and the third only responded to the
device setting.

`lib/appearance.ts` now reflects all three onto the document root from the app
shell, so they apply on every route rather than only while the panel that writes
them is mounted, and `theme/studio.css` implements them. Measured: the root scales
to `zoom: 1.25` and a heading's rendered box grows 60 → 76 device px; high contrast
lifts the worst ratio on Settings from 4.06 to 4.97.

One limitation, measured rather than assumed: at a 320px viewport `zoom: 1.25`
puts the effective width at 256 CSS px, and the shell's global 320px minimum then
forces the **page** to scroll sideways (346px against a 320px viewport). The
largest step therefore holds at the middle one below 360px. Lifting that cap means
removing the 320px floor first.

### Test 11 results

| Check | Customer | Barber | Owner | Admin |
| --- | --- | --- | --- | --- |
| Zero page-level horizontal overflow at 320 / 768 / 1280 | pass | pass | pass | not run |
| 200% zoom equivalent (640 CSS px) | pass | pass | pass | not run |
| Keyboard traversal complete, visible focus on every stop | pass | pass | pass | not run |
| Dialog focus trap, Escape, focus restoration | pass | n/a | n/a | not run |
| Accessible name on every interactive control | pass | pass | pass | not run |
| 44px targets on Phase 4 controls | pass | pass | pass | not run |
| Contrast AA | pass | pass | pass | not run |
| Reduced motion | rule-verified | rule-verified | rule-verified | not run |
| No colour-only status | pass | pass | pass | not run |

Detail worth keeping:

- **Keyboard, Owner Analytics at 320px**: 29 stops, DOM order, wrapping to the
  top, every stop with a visible outline. The three horizontally-scrolling tables
  each take focus, Chrome 148 makes a scroller without focusable children
  keyboard-reachable, so the off-screen columns are reachable. A programmatic
  `.focus()` probe said otherwise and was wrong; the real Tab traversal is the
  evidence.
- **Focus trap, booking detail modal**: 25 focus events, all inside
  `.booking-notebook`, wrapping. Escape closes and returns focus to the trigger.
  An earlier "focus not restored" reading was an instrumentation artifact, the
  modal had been opened from an unfocused trigger, so there was nothing to restore
  to. `ModalPortal` guards restoration on `isConnected` and behaves correctly.
- **One active overlay**: with the booking modal open, the closed menu drawer is
  `aria-hidden="true"` and `visibility: hidden`, so it is out of the tree and out
  of the tab order.
- **Wide tables** scroll inside `.analytics-table-scroll` (243px client, 420–551px
  content) while the page stays at exactly 320px.
- **Reduced motion is rule-verified, not emulation-observed.** The browser tooling
  in this session exposes no `prefers-reduced-motion` media emulation, and the
  handoff is explicit that a CSS toggle is not equivalent. What was verified: the
  blanket `!important` guard in `theme/studio.css` matches both the bar fills and
  the buttons, and after fixing the bar transitions the only animation left on any
  Phase 4 surface is the studio `.btn` transition on
  `background-color, border-color, color, transform`. Recorded as verified by rule
  inspection; a human with real media emulation should confirm.

### The two animated bars: the contract's preference does apply

`.analytics-bar-fill` and `.performance-bar-fill` carried `transition: height
240ms`, under a comment claiming "Transform/opacity only", it was neither.

Section 9's "animation must favor transform/opacity" sits inside the *landing
page* paragraph, so read literally it does not govern a dashboard chart. But
`docs/systemarch/CODE-PATTERNS.md` states the same rule unconditionally as a
repo-wide convention, and CLAUDE.md requires following it. **The preference
applies, through CODE-PATTERNS rather than through section 9.**

It is not a nit here. The demand series emits one bar per active day, so "All
time" on an established shop animates hundreds of bars, and `height` forces a
reflow of the whole flex row on every frame, at the moment the owner is waiting
for numbers. `transform: scaleY` was the obvious swap and was rejected because it
squashes the 1.5px border and 6px top radius that give the bars their look. Both
transitions are removed instead: they only ever fired on a range change, since a
new element renders at its final height, so nothing is lost. Verified in the
browser, no animated property remains on either panel.

### The admin half of test 11 is deferred, and Phase 4 does not close

Recorded plainly rather than counted as three-quarters of a pass:

- Three of the four admin surfaces **do not exist**: the dispute queue, the
  rating-moderation queue and the notification operations view are complete and
  tested at the API with no UI. They are outstanding item 3 below and belong to
  plan section 11's staff admin console.
- The fourth, `/admin/verifications`, exists (`AdminVerificationPage`, 11.68 kB)
  but was **not reachable**: the five `admin` rows are fixture leftovers with
  random per-run passwords, and making a real one needs signup, TOTP enrolment and
  `admin:provision`, which deliberately refuses to create an account or set a
  password.

So test 11 covers three roles of four. Building the console first was out of scope
for a gate that is explicitly not allowed to start new Phase 4 features.

### Test 12, bundle sizes, key render time, image payload

Measured against the production build served on `localhost:5174`.

Bundle sizes versus the baseline table above: **no unexplained regression.**

```text
index                  164.89 -> 165.57 kB   +0.68  appearance effect in the shell
ShopOwnerDashboard      66.00 ->  66.66 kB   +0.66  trust panel section split
AppDashboardPage        27.10 ->  27.23 kB   +0.13  rating workspace fallback
SettingsPage            22.78 ->  22.81 kB   +0.03  applyAppearance call
react-vendor, leaflet, ShopSetupPage, Phase3OperationsPage,
AppointmentsPage, BarberDashboard, AdminVerificationPage,
RatingPanel, ChatPage                        unchanged
```

Every delta is attributable to a P4-09 fix; total growth is about 1.5 kB.

Key render time. Paint timing is unusable here, the browser pane does not
composite, so first-contentful-paint reported 3604 ms against a 143 ms
DOMContentLoaded. These two figures are compositing-independent: **shell ready** is
`domContentLoadedEventEnd`, and **role data ready** is the last `/api/v1` response
to land, after which React commits within a frame.

```text
role       shell ready   role data ready   API calls   JS decoded   CSS decoded
customer        69 ms            639 ms          10      575.8 kB      125.5 kB
barber          95 ms          1,569 ms          12      449.6 kB      119.2 kB
owner           96 ms          1,942 ms          10      491.5 kB      139.0 kB
```

Image payload:

```text
built image assets, total            365.3 kB across 6 files
  landing heroes (4 WebP)            333.1 kB   landing only, one shown at a time
  barber-pattern.avif                 31.9 kB   the only image a signed-in role loads
  favicon.svg                          0.4 kB
signed-in first-party image payload   32.3 kB   identical for all three roles
UI iconography                        inline SVG, 18–33 elements, ~9 kB of markup
```

The customer role additionally requests **12 OpenStreetMap tiles** on home. Their
bytes are not measurable from the page, the tiles are cross-origin without
`Timing-Allow-Origin`, so `transferSize` reads 0, and they are third-party rather
than app payload. Recorded as a count, not as a number nobody measured. The 13
requests are 13 distinct tile coordinates; an earlier reading of duplicate fetches
was a misread of repeated filenames across different tile columns.

### Also verified

- **ChatPage after the cursor rewrite.** The screen was not moved to
  `getMessagePage`, so the existing `getMessages` path was checked directly: a
  three-message thread renders in order with timestamps, the read call fires, and
  there is no overflow.
- The Phase 4 destinations (Analytics, Trust) are in the hamburger, not a second
  navigation row.
- Honest empty and partial states hold with real data: "Not enough data" for a
  rate with no denominator, "No reviews yet" beside a shop rating, "Not recorded"
  for an unmeasured wait, and "0.0%" only where a real denominator exists.
- Booked value, completed service value, collected, refunded and net collected
  stayed five distinct figures with data present (₱3,760 / ₱3,480 / ₱1,200 / ₱0 /
  ₱1,200), and no screen used the word "revenue".
- A dispute decision, a published review response and a rating all completed
  end-to-end through the real UI.
- Gate on a database replayed from empty afterwards: 69 migrations, DB lint no
  schema errors, 219/219 functions pin `search_path = ''`, matrix 143/143 twice
  back to back, 131 fast tests, typecheck, ESLint 0/0, both production builds,
  `git diff --check` clean. Zero published shops left behind.

### Method note

The browser pane stopped delivering synthetic mouse and key input partway through
(screenshots failed with "the pane is not displayed, so the page is not
compositing"). Real key events still worked for the Tab and Escape traversals
above; form submits were driven through `requestSubmit()` where clicks were not
delivered. That is a tooling limitation of this session, not app behaviour, the
same submit worked immediately when driven directly, exactly as trap 9 warns.
Nothing was filed as a defect on the strength of a non-delivered click.

## What Phase 4 still owes

Recorded honestly so nobody reads the table above as a finished phase.

1. **Required test 11, the admin quarter.** Customer, barber and owner passed on
   2026-08-06 and the results are recorded above. Admin is deferred, for two
   separate reasons: three of its four surfaces do not exist, and the fourth is
   unreachable without provisioning an admin identity by hand. **This is what
   keeps Phase 4 open.**
2. ~~**Required test 12, render time and image payload.**~~ **Done 2026-08-06.**
   Bundle sizes, key render time and image payload are all recorded above, with no
   unexplained bundle regression.
3. **Admin console screens.** The dispute queue, moderation queue, and
   notification operations view are complete and tested at the API, with no UI.
   Plan section 11's console is the natural home and is not built. Building it and
   then running test 11's admin quarter against it is the work that closes Phase 4.
   Provisioning a usable admin is part of it: sign up, enrol TOTP in Settings →
   Security, then `npm run admin:provision -w @barbershop/api`.
4. **Reduced motion wants one confirmation with real media emulation.** Verified
   by rule inspection in this session because the tooling exposed no way to force
   the media query. The rules are `!important` and match; a human toggling the OS
   setting closes it in a minute.
5. **Rating response editing UI.** `api_edit_rating_response` exists and is
   granted; no screen calls it. Publishing a response is wired, editing is not.
6. **A `hiring` conversation kind** (owner ↔ candidate before employment) is
   deliberately absent. The plan's messaging section is satisfied by the existing
   `customer_shop` and `staff` kinds; adding a third would need a new enum value
   and a rethink of `private.validate_conversation`, which hard-requires either a
   customer account or shop ownership.
7. **The 44px target rule holds for Phase 4 controls, not for the app.**
   `.app-shell.is-workspace .btn-sm { min-height: 36px }` puts *every* small
   workspace button under the section 9 minimum, measured on pre-existing
   controls too, such as Manage schedule (36px) and the calendar's Previous/Next
   month (37×36). Disclosure `<summary>` elements run 24–32px. Raising the global
   floor changes the look of every signed-in screen, so it is a product-owner
   decision rather than a gate fix. Recorded here with its real blast radius.
8. **P2-08 and P3-09 remain open** on their own three named items. Nothing here
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
- **A `min-height` on `.something .btn` inside the workspace is dead CSS.**
  `.app-shell.is-workspace .btn` / `.btn-sm` are three classes and win. Scope any
  target-size rule under `.app-shell.is-workspace` too, and measure it in the
  browser rather than trusting that the declaration applied.
- **`ModalPortal` renders outside `.app-shell`**, so a portalled dialog does not
  inherit the workspace token remap and falls back to the base doodle palette.
  Anything checked for contrast has to be checked with a dialog open as well.
- **The assignment guard refuses a visit dated before the provider was hired**
  (`employment.hired_at <= starts_at::date`), and it only fires for non-terminal
  statuses. A fixture can backdate a `completed` visit freely but not an
  `awaiting_confirmation` one. That guard is correct; work with it.
- **`read_page` only reports controls inside the visual viewport.** Scroll the
  section into view first, or it looks like the page has three controls.
