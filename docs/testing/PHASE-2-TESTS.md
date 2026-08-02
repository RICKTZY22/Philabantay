# Phase 2 tests - shops, workforce, availability

Covers packets P2-01 through P2-08. P2-01 through P2-07 are verified complete.
P2-08's backend race gate is proven and its frontend fixes have an agent-run
browser/gate record below, but final product-owner browser acceptance is still
pending. Test names are quoted verbatim.

Jump to: [P2-01](#p2-01) · [P2-02](#p2-02) · [P2-03](#p2-03) · [P2-04](#p2-04) · [P2-05](#p2-05) · [P2-06](#p2-06) · [P2-08](#p2-08) ·
[Findings](#findings)

---

## P2-01 - shop lifecycle {#p2-01}

Draft → pending_review → published → suspended → archived, with version-checked
`/owner/shop` commands and catalogue visibility gated on `published`.

### `apps/api/test/local-supabase.integration.test.ts` ⏭️ (gated)

| Test | What it protects |
| --- | --- |
| hides an otherwise-eligible shop from discovery until it is published, and again when suspended | A shop appears in public discovery only while `published`, and disappears the moment it is suspended. |
| enforces the V1 one-shop owner and one-active-employment limits atomically | An owner cannot create a second shop; this test was repointed to `POST /api/v1/owner/shop` and expects a `409 conflict`. |
| owner RLS and Express routes include the owned shop and exclude another shop | Lifecycle columns are readable by the owner and invisible cross-tenant. |

### Shared readiness rule

`shopPublicationReadiness` gives the UI the same checklist vocabulary as the
database command. The versioned `api_publish_owner_shop` RPC is authoritative:
it locks the shop and rechecks identity, location, chairs, hours, services,
verified ownership, and a provider qualified for an active service in the same
transaction before changing lifecycle state.

**Verification of record:** the P2-01 slice was verified at 52/52 on a clean
local-Supabase reset and browser-checked (Shop Setup create/edit/publish plus the
owner no-shop redirect). Committed as `f402624` and `5cc05f3`.

---

## P2-02 - shop facts {#p2-02}

Weekly operating hours, per-date closures, owner services, private signed media,
and the exact map-pin picker are implemented and verified full stack.

### `packages/shared/test/shops.test.ts` ✅ (8 readiness/provider tests)

The publish-readiness rule is unit-tested with an explicit `{ activeServices,
bookableProviders, operatingHours }` count object. The provider count is derived
from saved eligible providers and active qualification/service intersections;
the momentary `accepting_bookings` toggle is deliberately irrelevant to
publication.

| Test | What it protects |
| --- | --- |
| is ready when identity, location, chairs, hours, a service, and a provider are present | The happy path reports ready with an empty missing list. |
| blocks publication without an active service | No sellable service means not ready. |
| blocks publication without an operating-hours block | No open day means not ready. |
| requires at least one chair | Zero chairs means not ready. |
| requires shop identity, location, and timezone | Missing name / address / city / map location / timezone each block publication. |
| blocks publication without a bookable provider | The UI cannot claim ready or enable Publish before D-029 passes. |
| counts eligible providers qualified for an active service | Ineligible providers and qualifications only for retired services do not satisfy readiness. |
| does not require the momentary accepting-bookings state | A temporary pause does not block publication. |

### `apps/api/test/local-supabase.integration.test.ts` ✅ (gated, added in P2-02)

| Test | What it protects |
| --- | --- |
| lets an owner set and read shop hours and isolates them from other tenants | Replace-all hours write/read works, and another owner cannot see or touch them (RLS on `shop_operating_hours`). |
| keeps a published shop from losing its last open-hours block or active service | Both P4021 constraint triggers reject the mutation atomically and preserve the prior valid facts. |
| lets an owner edit only their own service menu and retires instead of deleting history | Canonical owner routes infer the shop from auth, reject cross-tenant IDs, and preserve historical references. |
| uploads private shop media through a signed grant and isolates owner previews | Exact-path signed upload of a valid PNG, private preview isolation, object-first removal, and metadata cleanup. |
| rejects content that does not match its declared image type and removes the object | Server byte-signature/size validation rejects a false PNG, records `rejected`, and proves the private object was removed. |
| keeps owner media listing available when one ready object is missing | A stale object produces `preview_url: null` for that row instead of a 503 for the whole owner list; deletion remains retryable. |
| cleans stale awaiting-upload metadata only after storage cleanup | The bounded worker removes an abandoned object before deleting its stale metadata row. |
| caps media metadata per shop and exposes a stable API error | The 101st retained media row fails with database code P4022 and API code `media_limit`. |
| lets an owner manage shop closures and isolates them from other tenants | Upsert / list / remove closures works, and cross-tenant reads are denied (RLS on `shop_closures`). |
| projects real public shop details without private closure or media fields | Anonymous detail reads include real hours, future closures, active services/prices, capacity/default buffer, and approved media URLs while omitting owner/version data, closure reasons, storage paths, and moderation internals. |

**Verification of record (2026-07-27):** clean `supabase db reset` through
`20260726000100_p2_02_shop_facts_commands.sql`, then the complete API
integration/direct-RLS matrix at **56/56**. Typecheck, **88 unit tests**, API
and web production builds, and `git diff --check` all passed.

### Authenticated verified-owner Shop Setup smoke ✅

| Scenario | Exact evidence |
| --- | --- |
| Shop details and location | Detail changes and map-click/drag/coordinate pin changes persisted after save and reload. |
| Hours and closures | Weekly hours persisted; closure create/list/remove passed. Chrome native segmented date entry produced `2026-08-15` and keyboard submission created the closure. |
| Services | Create, edit, retire, and restore passed. |
| Photos | Non-image validation rejected the file; signed JPEG upload completed and its private preview rendered at non-zero dimensions. |
| Publication | Publish and unpublish passed with the expected lifecycle/version updates. |
| Stale version | A stale second session received the conflict message, reloaded the latest version, and did not overwrite the first session. |
| Narrow/mobile | 320×800 and 375×812 had no horizontal overflow, clipping, or unusable controls. |
| Keyboard | Native Chrome `Tab`/`Shift+Tab` traversal reached the owner menu, form, map, and actions with visible focus; Enter opened controls and Escape dismissed the menu without a focus trap. |
| Reduced motion | `prefers-reduced-motion: reduce` suppressed transitions/animations while controls remained usable. |
| Browser errors | No Chrome console errors during the final native keyboard/date gate. |

The temporary smoke shop and its cascading child records were removed after
verification; the local verified owner account remains with zero shops.

### Public shop-detail follow-up ✅ (2026-07-28)

- `packages/shared/test/ApiBackend.test.ts`: anonymous detail reads validate the
  strict `PublicShopDetail` contract (including chair capacity and default
  buffer), and unexpected private fields fail closed.
- `apps/api/test/public-catalog.test.ts`: the API uses explicit column
  allowlists, normalizes database times, filters active services and
  `ready + approved` media, issues 15-minute media URLs, omits closure reasons
  and storage paths, and rejects a private field before responding.
- Clean local reset applied every migration through
  `20260727000300_p2_05_provider_capabilities.sql`, including
  `20260726000100_p2_02_shop_facts_commands.sql`; the full API integration and
  direct-RLS matrix passed **62/62**.
- All workspaces typechecked; shared **51**, API **27**, and web **19** fast
  tests passed (**97 total**); API/web production builds, DB lint, and
  `git diff --check` passed.

This follow-up does not start P2-06. Honest live availability remains P2-07,
and customer wait estimates remain hidden until their later planned phase.

---

## P2-03 - hiring state {#p2-03}

The owner controls one canonical `off | open | full` state on the versioned
shop row. Only eligible published shops in `open` state enter the barber hiring
catalogue.

### Shared unit and adapter tests ✅ (5 P2-03 assertions)

| Test | What it protects |
| --- | --- |
| derives off, open, and full from the canonical shop columns | `false/null`, `true/null-or-positive`, and `false/zero` remain distinct. |
| normalizes an owner shop row to the owner hiring contract | The UI receives the state, count, note, version, and timestamp it needs. |
| routes owner hiring reads and writes through the API adapter | GET/PATCH paths and versioned request payload cannot drift. |
| rejects an exact zero count for `open` | Unknown count is null; a known opening count must be positive. |

### `apps/api/test/local-supabase.integration.test.ts` ✅

| Test | Exact evidence |
| --- | --- |
| lets an owner control canonical hiring state and exposes only published open shops | Default off; open with count/note; stale version returns 409; only the eligible published shop appears; owner direct update and legacy-table read are denied; full disappears and stores zero; off clears the count. |

**Verification of record (2026-07-27):** clean `supabase db reset` applied
`20260727000100_p2_03_hiring_state.sql`; the complete API integration and
direct-RLS matrix passed **57/57**. Shared/API/web fast suites passed
**47 + 25 + 19 = 91 tests**, all workspaces typechecked, API/web production
builds passed, and `git diff --check` passed.

### Authenticated verified-owner Hiring smoke ✅

| Scenario | Exact evidence |
| --- | --- |
| State and fields | Default off loaded; open saved with count `2` and note; a second save changed the count to `3`; full reloaded with disabled count `0`; off reloaded with no count. |
| Validation | Native number validation rejected exact count `0` while state was open (`rangeUnderflow`, minimum 1). |
| Publication boundary | Draft shop showed the explicit “hiring stays private until publication” notice; the API matrix independently proved published-only public visibility. |
| Stale version | A second authenticated tab submitted an older shop version, received the conflict alert, and reloaded count `3` and the winning note without overwriting them. |
| Narrow/mobile | At 390×844, `clientWidth` and `scrollWidth` were both 390; no horizontal overflow. |
| Keyboard | Native radio, number, note, and submit controls were present in logical focus order; keyboard selection/submission was exercised. |
| Reduced motion | `prefers-reduced-motion: reduce` evaluated true and the page rule disables transitions. |

---

## P2-04 - employment convergence {#p2-04}

### Shared adapter test ✅

| Test | What it protects |
| --- | --- |
| uses the converged employment-request and professional-profile routes | Application creation, owner acceptance, and job-profile updates remain on the canonical API paths and payloads. |

### Local Supabase API/direct-RLS matrix ✅

| Test | What it protects |
| --- | --- |
| counts successful join-code redemptions once and never refunds resolved requests | The 80-bit uppercase-hex plaintext is returned once, replay consumes no extra use, decline/withdraw/expiry do not refund successful redemptions, the usage limit is enforced, failed attempts throttle, revocation works, direct code reads fail, and code entry creates no employment. |
| denies employment resolution to a verified owner who owns no shop | Reproduces the former `shop_id <> NULL` bypass. Both accept and decline fail through HTTP preflight and direct service-role RPC; forged owner-invitation provenance also fails with `42501`; the request remains pending and no foreign-shop employment is created. |
| converges application and invitation acceptance with RLS, stale, vacancy, and one-employment race safety | Participant reads and cross-tenant exclusion, denied direct writes/event mutation, stale versions, final-opening one-winner race, two-owner/same-barber one-winner race, truthful `superseded` competitor status, atomic employment, and immutable events. |
| rechecks suspended professional identity inside staff and join commands | Suspended barbers cannot enter the converged join-code command. |
| revokes a former barber from shop operations while retaining history for the owner | Rehire by code returns to a pending owner-approved request and never restores employment directly. |

**Security re-verification (2026-07-28):** the original P2-04 migration now
makes `private.owner_shop_id` raise `42501` instead of returning NULL, and
forward migration `20260728000100_p2_04_ownerless_resolution_guard.sql`
repairs databases that already applied P2-04. Express independently verifies
that the request belongs to the caller's owned shop before invoking the
service-role command. A clean reset through that hotfix passed the complete API
and direct-RLS matrix **63/63**. Fast suites passed shared **51**, API **27**,
and web **19** (**97 total**). Database lint, all workspace typechecks,
API/web production builds, and `git diff --check` passed.

### Authenticated browser smoke ✅

| Gate | Evidence |
| --- | --- |
| Owner request workflow | Verified owner opened the unified workspace, created an invitation, accepted it, saw pending clear, active employment created, and known openings decrement `2 → 1`. |
| Join-code safety | Rotate showed plaintext once; reload retained only active/usage/expiry metadata and no code element. |
| Barber job profile | Verified barber saved opt-in visibility, bio, experience, specialties, portfolio URL, coarse area, and schedule preference. |
| Responsive | Owner Hiring and barber Professional at 390×844 had no horizontal overflow (`scrollWidth 375 < innerWidth 390`). |
| Keyboard/accessibility | Native links, buttons, radio/checkbox, number, text, and textarea controls were exposed with `tabIndex=0`; regions, headings, status/alert output, labels, and disabled states were present. |
| Reduced motion | Emulated `prefers-reduced-motion: reduce` matched and sampled page descendants had no non-zero transition duration. |
| Runtime | A clean reload produced no new console errors. |

---

## P2-05 - provider capabilities {#p2-05}

Owner-as-provider remains an explicit capability at the owner's own shop.
Employment remains the ordinary barber eligibility source. Only the owner can
grant or revoke service qualifications; barber requests never self-grant.

### Shared adapter test ✅

| Test | What it protects |
| --- | --- |
| keeps provider capabilities and qualification requests behind one typed service | Owner capability, qualification replacement, barber read/request, and owner approve/decline all stay behind canonical `QualificationService` routes and methods. |

### Local Supabase API/direct-RLS matrix ✅

| Test | What it protects |
| --- | --- |
| keeps owner-provider capability and service qualifications owner-authoritative, audited, and race-safe | Default capability-off state, no role switching, direct-JWT table/RPC denial, owner enable/disable and accepting state, idempotent replay/mismatch denial, owner and barber qualification grants, foreign-shop denial, barber request/replay, owner approval, stale decision denial, immutable events, and one-winner concurrent qualification replacement. |

Clean reset applied every migration through
`20260727000300_p2_05_provider_capabilities.sql`; the complete API suite passed
**59/59**. Fast suites passed shared **49**, API **25**, and web **19**
(**93 total**). Database lint reported no schema errors, all workspaces
typechecked, API/web production builds passed, and `git diff --check` passed.

### Authenticated browser smoke ✅

| Gate | Evidence |
| --- | --- |
| Owner provider | Verified owner enabled the shop-scoped provider capability and accepting state without changing account role; controls and eligibility refreshed authoritatively. |
| Qualification management | Owner granted and removed an owner qualification, directly granted a barber qualification, and saw checked states persist after refresh. |
| Barber request | Verified employed barber saw read-only current qualifications, requested an unqualified active service, and saw `Request pending`; owner then approved it and the service became checked for that barber. |
| Stale sessions | Two owner tabs loaded the same barber revision; one saved, the stale tab received the explicit conflict and refreshed to the authoritative `Classic cut` selection. |
| Responsive/accessibility | At exact 390×844, `scrollWidth = innerWidth = 390`; labeled native checkboxes, textboxes, and buttons remained keyboard-focusable with `tabIndex=0`. |
| Reduced motion/runtime | Emulated reduced motion matched with zero non-zero transitions in the provider panel after the focused fix; clean reload produced no console errors and restored the provider workspace. |

---

## Pre-P2-06 bounded hardening

The 2026-07-28 hardening packet covered the confirmed P2-02/P2-04 and
appointment-display findings without starting schedule authority.

- Clean reset applied through
  `20260728000300_bounded_hardening_commands.sql`.
- SQL evidence confirmed the legacy plaintext join-code table is absent and
  `authenticated` cannot execute `private.assert_published_shop_facts` or
  `private.is_shop_member`.
- The local API integration/direct-RLS workspace passed **69/69 twice
  consecutively**, proving fixture cleanup is repeatable.
- Fast suites passed shared **54**, API **28**, and web **32** (**114 total**).
  All workspaces typechecked, API/web production builds passed, database lint
  reported no errors, and `git diff --check` passed.

The new automated cases cover both P4021 invariants, invalid media content and
object cleanup, missing-preview isolation, stale-upload cleanup, the media cap,
owner-invitation provenance, truthful supersession, legacy appointment
normalization, and all canonical appointment pill states.

---

## P2-06 - schedule authority ✅ signed off 2026-07-30 {#p2-06}

Verified on 2026-07-28 without marking the packet complete:

- clean reset applied through
  `20260728000600_p2_06_schedule_authority_closeout.sql`;
- the API integration/direct-RLS workspace passed **69/69 twice
  consecutively** without another reset;
- route coverage denies anonymous and foreign actors, proves canonical owner
  schedule reads/writes, and confirms the removed barber self-write route is
  unavailable;
- direct authenticated JWT writes to schedule revisions/events and request
  status are denied;
- concurrent owner weekly writes produce one 200 and one stale 409; P4025
  asserts the exact active-booking count; approval writes a linked exception,
  advances the revision, and preserves append-only event history;
- shared **56**, API **28**, and web **32** fast tests passed (**116 total**);
  typecheck, lint, API/web production builds, DB lint, and `git diff --check`
  passed;
- authenticated smoke covered owner weekly shifts and exceptions, barber
  read-only structured requests, transactional approval, two-session stale
  recovery, exact 390×844 owner/barber layouts without overflow, native
  keyboard controls, reduced motion, and a clean console.

Signed off 2026-07-30 on the agent-executed functional and accessibility pass below, accepted by the product owner in lieu of a personal visible-workflow review. That review and an OS-level reduced-motion check are carried as open items in [the roadmap](../plans/ROADMAP-STATUS.md). P2-07 is next.

### Workflow scenarios executed 2026-07-30 ✅ (functional half)

Run against the live local stack at the product owner's request, through the
real API and browser UI, no SQL shortcuts. Full table with exact responses in
[the QA traceability matrix](../plans/QA-TRACEABILITY-MATRIX.md).

| Gate | Exact evidence |
| --- | --- |
| Stale-tab conflict | Two concurrent owner `PUT /owner/staff/:id/shifts` on the same version returned one `200` and one `409 conflict`; an explicitly stale `expected_version: 1` also returned `409 conflict`. |
| Barber authority | `PUT /owner/staff/:id/shifts` with a barber token returned `403 forbidden`; `/schedule` rendered 0 time inputs. Both `time_off` and `different_hours` requests returned `201`. |
| Transactional approval | Approve returned `200` with `exception_id` and `schedule_version: 3`; `/shifts/exceptions/me` then held the date with `is_available: false` and the revision advanced 2 → 3, with no separate shift edit. |
| Booking conflict (P4025) | Removing availability on a booked date and narrowing hours to exclude a 10:00 booking both returned `409 schedule_has_active_bookings` naming exactly 1 booking and the date. A 09:00-20:00 window that still covers the booking returned `201`, so the guard is not blanket-refusing. |
| Owner UI round-trip | A weekday end time changed to 20:15 in the staff panel and saved persisted as `20:15:00` with `schedule_version` 5. |
| Wall-clock asymmetry | Reads return `HH:MM:SS`, writes require `HH:MM`. Investigated as a suspected unchanged-save failure and dismissed: rendered time inputs are clean `HH:MM` with none empty. |

Follow-up browser evidence on 2026-07-30 closed the runtime-only checks:
`prefers-reduced-motion: reduce` matched through browser media emulation, the
Rive canvas resolved to `display: none`, and the static fallback remained
visible at opacity 1. Opening the landing Log in dialog placed initial focus on
its Close button; Escape closed it and restored focus to the exact header Log
in trigger. Product judgment on the visible owner/barber workflow remains a
human decision.

### Pre-P2-07 public landing/auth presentation smoke

Verified locally on 2026-07-29 without changing P2-06/P2-07 status.

| Gate | Exact evidence |
| --- | --- |
| Responsive hero | A 16-case matrix covered morning, afternoon, evening, and midnight at `1440x900`, `1024x768`, `390x844`, and `320x760`. Every case exposed exactly one scene and held `scrollWidth = clientWidth`; the landing-specific `min-width: 0` override removed the prior scrollbar-width leak at 320 CSS pixels. Desktop keeps the approved device overlap and narrow layouts stack the devices. |
| Four-scene framing | All four normalized `1915x821` WebPs preserve the same horizon, street, crack, and right-side barbershop footprint. Forced desktop screenshots confirmed the retired portal and live-city window are not reintroduced. **Corrected 2026-07-30:** this row previously claimed live SVG laptop/phone chassis sit above the art. No such elements exist in any commit; the hero right-hand grid track is intentionally empty so the barbershop art shows through. |
| Static activity content | Morning contains school-bound students and a jeepney; afternoon contains customers waiting outside the barbershop plus traffic; evening contains workers travelling home with lit vehicles; midnight has no sidewalk pedestrians and only a jeepney/car. The hero contains zero runtime walker/pedestrian DOM or travel animation. |
| Philippine-time switching | The dedicated hero schedule is midnight `00:00-04:59`, morning `05:00-11:59`, afternoon `12:00-16:59`, and evening `17:00-23:59`. Eight boundary assertions passed. Computed styles exposed all four asset URLs, forced checks activated exactly one matching layer, and live `Asia/Manila` time selected midnight during verification. |
| Unified workflow | The workflow remains a bright, sticky-index layout independent of city phase. At desktop the index measured 664 px and the first chapter approximately 664 px. |
| Dedicated auth | **Updated 2026-07-30:** landing buttons link to the single `/login` or `/signup` surface. Switching modes preserves the protected-route `from` state, and successful/failed mutations remain inside the curtain transaction. |
| Keyboard/accessibility | **Updated 2026-07-30:** empty sign-up exposed four alerts and focused the first invalid field; password visibility remained a labeled button and invalid login returned focusable controls with the safe backend error on `/login`. |
| Reduced motion | Scene crossfade duration resolved to `0s`. Existing auth/workflow reduced-motion behavior remains intact. (The device-UI animation claim was removed with the laptop/phone correction above.) |
| Runtime and gates | **Re-measured 2026-07-30:** no browser errors, no horizontal overflow at the measured desktop auth viewport, all workspaces typechecked, 124 fast tests passed with 41 expected skips, and lint/API/web production builds plus `git diff --check` passed. |

## P2-08 race gate — backend proven 2026-08-01 {#p2-08}

P2-07 is verified complete (see [roadmap status](../plans/ROADMAP-STATUS.md)).
P2-08 widened the race coverage rather than rebuilding it, and **needed no
migrations: every race class already held.** The matrix moved 82 → 85.

| Race class | Probe | Result |
| --- | --- | --- |
| Provider slot, two customers, one barber | pre-existing (P2-07) | one winner, loser `23P01` |
| Customer overlap, one customer, two barbers | pre-existing (P2-07) | one winner, loser `23P01` |
| Chair capacity, two barbers, one chair | pre-existing (P2-07), with a two-chair control | one winner, loser `P4026` |
| Last vacancy + one-active-employment | pre-existing (P2-04) | one winner |
| **Hold released, then contested** | decline the hold, then two customers claim the freed slot at once | slot returns to the pool; exactly one winner |
| **Claim/expiry boundary** | force a hold due, then run the sweeper and a fresh claim concurrently | never two live rows; refusal is transient and a retry after the sweep succeeds |
| **Owner-provider slot, two customers** | both claim the owner's slot at once | one winner, loser `23P01` |
| **Owner-provider vs barber, one chair** | owner-provider and employed barber claim the same instant | one winner, loser `P4026` |

**All three new regressions were falsified before being trusted**, each
reproducing the exact failure it exists to catch:

- skipping the decline so the slot never frees → `expected [] to have a length of 1 but got 0`;
- two chairs instead of one → `expected [ …2 items ] to have a length of 1 but got 2`;
- never running the sweeper → `expected 'requested' to be 'expired'`.

**One behaviour worth recording, found by the probe rather than assumed.** At the
claim/expiry boundary the correct invariant is *never two*, not *always one*. A
claim can read a hold while it is still `requested`, lose on the exclusion
constraint, and then watch the sweeper retire that same hold — leaving the slot
free and the customer told it was taken. That is a transient false refusal, not a
lost booking, and the regression now pins the part that matters: after the sweep,
a retry succeeds. Making the claim wait on the sweeper instead would be a worse
trade.

### Authenticated frontend journeys — preliminary agent pass 2026-08-01 🔨

Run through the real browser UI at `http://localhost:5174` with the API on
port 4000. The owner shop was published only for the customer discovery leg and
was returned to `draft`; hiring was returned to `off`, the owner-provider
capability to off, Bruno's two qualifications were restored, and the temporary
barber change request was declined. No booking, closure, or published shop was
left behind.

| Journey | Exact browser evidence |
| --- | --- |
| Owner shop | Existing details, six-day hours, two active services, and the empty closure editor rendered authoritatively. Unchanged details, hours, and one active service each saved successfully. Publish made the shop discoverable; Unpublish returned it to `draft`. Removing every qualification made the bookable-provider row `is-todo` and disabled Publish; restoring Bruno's two qualifications made it `is-done` and enabled Publish again. |
| Owner staff | Enabled the owner shop-scoped provider capability, granted an owner qualification, removed all owner/Bruno qualifications for the readiness refusal, restored Bruno's two qualifications, and returned the owner capability to off. The shift editor exposed all 14 labelled time inputs. |
| Owner hiring/stale tab | One tab saved `open / 2 / P2-08 winning write`; a stale second tab tried to save Full, received `Stale ang screen na ito. Ni-reload ang pinakabagong data.`, and reloaded the winning Hiring/2/note values without overwriting them. The conflict alert was fixed so the authoritative reload no longer erases it. Hiring finished Off with null count/note. |
| Owner reservations | Empty canonical reservation ledger and all four filters rendered; the mobile filter row no longer clips Completed or Cancelled/no-show. |
| Barber | Read-only schedule rendered **0 time inputs**, six assigned weekdays, attendance **1/1 present, 0 absent**, and no exception. A real Time off request was submitted and appeared Pending; the owner declined it through the staff panel, returning the fixture to no pending request. Own bookings were empty. |
| Customer | Published shop appeared in discovery; the detail dialog exposed real address, services/prices, barber, and live walk-in state. The customer sent `P2-08 smoke check — no action needed.` through the real shop chat, and the empty bookings calendar rendered at every width. |
| Explicit exclusion | The detail dialog has no booking control and the web app has no `/availability` or `/bookings/quote` consumer. The customer slot picker remains roadmap open item 6 and was reported, not built or faked in this packet. |

Interactive counts below are **visible/reachable**, followed by disabled count.
Every row measured **0 unreachable, 0 unlabelled, 0 clipped controls, and 0 px
document horizontal overflow** after the focused fixes.

| Surface | 1280×800 | 390×844 | 375×812 | 320×800 |
| --- | ---: | ---: | ---: | ---: |
| Owner Shop Setup | 63/58 (+5) | 63/58 (+5) | 63/58 (+5) | 63/58 (+5) |
| Owner Staff, shift editor open | 44/38 (+6) | 44/38 (+6) | 44/38 (+6) | 44/38 (+6) |
| Owner Hiring, Off | 11/9 (+2) | 11/9 (+2) | 11/9 (+2) | 11/9 (+2) |
| Owner Reservations | 8/8 (+0) | 8/8 (+0) | 8/8 (+0) | 8/8 (+0) |
| Barber home | 37/37 (+0) | 37/37 (+0) | 37/37 (+0) | 37/37 (+0) |
| Barber schedule | 39/39 (+0) | 39/39 (+0) | 39/39 (+0) | 39/39 (+0) |
| Customer discovery | 56/56 (+0) | 56/56 (+0) | 56/56 (+0) | 56/56 (+0) |
| Customer shop detail dialog | 4/4 (+0) | 4/4 (+0) | 4/4 (+0) | 4/4 (+0) |
| Customer booking calendar | 37/37 (+0) | 37/37 (+0) | 37/37 (+0) | 37/37 (+0) |
| Customer shop chat | 9/8 (+1) | 8/7 (+1) | 8/7 (+1) | 8/7 (+1) |

| Cross-cutting gate | Exact evidence |
| --- | --- |
| Keyboard | The menu focus trap wrapped Close → Sign out with Shift+Tab and Sign out → Close with Tab. Escape dismissed it and restored focus to the burger. A physical Chrome run proved Enter activation by moving the focused native Log in link from `/` to `/login`; the tab was then restored. All enabled controls counted above remained in the native focus order. |
| Real reduced motion | Chrome media emulation made `matchMedia('(prefers-reduced-motion: reduce)').matches === true`. Barber schedule, customer chat, owner hiring, and the open owner menu each had **0** computed animation/transition durations above 1 ms. This is preliminary agent evidence for the P2-06 structural-only caveat; product-owner confirmation remains. |
| Visible workflow review | The agent visually reviewed Owner Staff at desktop/mobile with the capability controls separated from the roster, 14 labelled shift times, unclipped note action, attendance, and request decision controls. Barber Schedule clearly presented the roster as read-only, exposed the structured request, and showed attendance/pending state without overflow. The carried P2-06 human-review caveat remains until the product owner records their browser result. |
| LR-033 session restore | Fresh owner deep links at all four required widths rendered only `Sandali, tinitingnan ang session...` immediately after DOMContentLoaded, then resolved to Owner Staff. No landing, login, customer, barber, verification, or owner workspace content appeared during restore. A stale session resolved through the same neutral shell to `/login`, not to a wrong workspace. |
| Console | Clean owner, barber, and customer role journeys each recorded **0 console errors**. A final fresh owner load after the deliberate rapid-reload probe also recorded 0. |
| Frontend fixes | Labelled the Leaflet drag pin; retained the hiring conflict alert and normalized the saved note; wrapped mobile owner filters, staff-note action, and chat replies; replaced the 720 px mobile appointment-calendar floor with a usable compact grid. |
| Deterministic gate | `npm run typecheck`, real ESLint with zero warnings, **129 fast tests** (shared 61, API 28, web 40), production build, and `git diff --check` all passed. The 85-case matrix was intentionally **not rerun** because no `apps/api` or `supabase` file changed; its already-recorded twice-green backend proof above remains authoritative. |

**Not signed off yet.** Per the product owner's 2026-08-01 clarification, the
final browser acceptance belongs to the product owner. The measurements above
record the agent's defect-finding pass and are not a substitute for that pass.
Do not mark P2-08 or Phase 2 complete until the owner records the browser result.

---

## Findings {#findings}

1. **Readiness count object is passed in, not derived.** `shopPublicationReadiness`
   takes `{ activeServices, operatingHours }` as counts so it stays a pure
   function. The caller is responsible for counting non-closed hours and active
   services correctly; the API publish route and the UI must agree. They are
   aligned today; the transactional publish command rechecks both counts.
2. **Closures uniqueness is per (shop_id, local_date).** Upsert uses
   `onConflict: 'shop_id,local_date'`, so a second save for the same date updates
   rather than duplicates. A closure that is not "closed" must carry replacement
   open/close times (DB constraint), which the save path enforces.
