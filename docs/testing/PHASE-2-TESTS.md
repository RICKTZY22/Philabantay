# Phase 2 tests - shops, workforce, availability

Covers packets P2-01 through P2-08. P2-01 through P2-05 are verified complete.
The rest are not started. Test names are quoted verbatim.

Jump to: [P2-01](#p2-01) · [P2-02](#p2-02) · [P2-03](#p2-03) · [P2-04](#p2-04) · [P2-05](#p2-05) · [P2-06…P2-08](#not-started) ·
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
it locks the shop and rechecks identity, location, chairs, hours, services, and
verified ownership in the same transaction before changing lifecycle state.

**Verification of record:** the P2-01 slice was verified at 52/52 on a clean
local-Supabase reset and browser-checked (Shop Setup create/edit/publish plus the
owner no-shop redirect). Committed as `f402624` and `5cc05f3`.

---

## P2-02 - shop facts {#p2-02}

Weekly operating hours, per-date closures, owner services, private signed media,
and the exact map-pin picker are implemented and verified full stack.

### `packages/shared/test/shops.test.ts` ✅ (5)

The publish-readiness rule, unit-tested with an explicit `{ activeServices,
operatingHours }` count object.

| Test | What it protects |
| --- | --- |
| is ready when identity, location, timezone, chairs, hours, and an active service are present | The happy path reports ready with an empty missing list. |
| blocks publication without an active service | No sellable service means not ready. |
| blocks publication without an operating-hours block | No open day means not ready. |
| requires at least one chair | Zero chairs means not ready. |
| requires shop identity, location, and timezone | Missing name / address / city / map location / timezone each block publication. |

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

## P2-06 - schedule authority (implementation gate green) {#p2-06}

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

Independent review/product sign-off remains pending. P2-07 was not started.

### Pre-P2-07 public landing/auth presentation smoke

Verified locally on 2026-07-29 without changing P2-06/P2-07 status.

| Gate | Exact evidence |
| --- | --- |
| Responsive hero | A 16-case matrix covered morning, afternoon, evening, and midnight at `1440x900`, `1024x768`, `390x844`, and `320x760`. Every case exposed exactly one scene and held `scrollWidth = clientWidth`; the landing-specific `min-width: 0` override removed the prior scrollbar-width leak at 320 CSS pixels. Desktop keeps the approved device overlap and narrow layouts stack the devices. |
| Four-scene framing | All four normalized `1915x821` WebPs preserve the same horizon, street, crack, and right-side barbershop footprint. Forced desktop screenshots confirmed the live SVG laptop/phone remain above the art without reintroducing the retired portal or live-city window. |
| Static activity content | Morning contains school-bound students and a jeepney; afternoon contains customers waiting outside the barbershop plus traffic; evening contains workers travelling home with lit vehicles; midnight has no sidewalk pedestrians and only a jeepney/car. The hero contains zero runtime walker/pedestrian DOM or travel animation. |
| Philippine-time switching | The dedicated hero schedule is midnight `00:00-04:59`, morning `05:00-11:59`, afternoon `12:00-16:59`, and evening `17:00-23:59`. Eight boundary assertions passed. Computed styles exposed all four asset URLs, forced checks activated exactly one matching layer, and live `Asia/Manila` time selected midnight during verification. |
| Unified workflow | The workflow remains a bright, sticky-index layout independent of city phase. At desktop the index measured 664 px and the first chapter approximately 664 px. |
| In-page auth | Landing buttons opened the real sign-in/sign-up forms without changing the route; switching modes stayed inside the same dialog. |
| Keyboard/accessibility | Close received initial focus, Escape closed, focus returned to the invoking control, and empty sign-up exposed four alerts and focused the first invalid field. |
| Reduced motion | Scene crossfade duration resolved to `0s`; laptop list/card and phone card/button animations resolved to `none`. Existing auth/workflow reduced-motion behavior remains intact. |
| Runtime and gates | Browser console stayed clean. Workspace typecheck, 124 fast tests with 41 skipped, lint, API/web production builds, and `git diff --check` passed. |

## P2-07 … P2-08 - not started {#not-started}

| Packet | Planned test focus |
| --- | --- |
| P2-07 Availability engine | combine hours, closures, employment, qualification, shifts, buffers, overlap, and chairs into one slot computation. |
| P2-08 Race gate | concurrent claim and capacity probes for the availability engine. |

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
