# Phase 2 tests - shops, workforce, availability

Covers packets P2-01 through P2-08. Two packets are built and tested (P2-01,
P2-02 slices 1-2); the rest are not started. Test names are quoted verbatim.

Jump to: [P2-01](#p2-01) · [P2-02](#p2-02) · [P2-03…P2-08](#not-started) ·
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

`shopPublicationReadiness` is the single source of truth for "can this shop
publish", used by both the API publish route and the Shop Setup UI. See the P2-02
readiness tests below; the same rule gates the lifecycle transition to
`published`.

**Verification of record:** the P2-01 slice was verified at 52/52 on a clean
local-Supabase reset and browser-checked (Shop Setup create/edit/publish plus the
owner no-shop redirect). Committed as `f402624` and `5cc05f3`.

---

## P2-02 - shop facts {#p2-02}

Slices 1-2 shipped: weekly operating hours and per-date closures, full stack.
Remaining slices (media upload, services editor UI, map-pin picker) are not
started.

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

### `apps/api/test/local-supabase.integration.test.ts` ⏭️ (gated, added in P2-02)

| Test | What it protects |
| --- | --- |
| lets an owner set and read shop hours and isolates them from other tenants | Replace-all hours write/read works, and another owner cannot see or touch them (RLS on `shop_operating_hours`). |
| lets an owner manage shop closures and isolates them from other tenants | Upsert / list / remove closures works, and cross-tenant reads are denied (RLS on `shop_closures`). |

These two are the tests that took the matrix from **52 to 54**.

**Verification of record:** clean `supabase db reset` through migration
`20260722002000`, then the full matrix at **54/54**. Typecheck, 86 unit tests,
and the web production build all green. Committed as `2df2312`.

---

## P2-03 … P2-08 - not started {#not-started}

No automated tests yet. Planned coverage, from
[../plans/02-PHASE-2-SHOP-WORKFORCE-AVAILABILITY.md](../plans/02-PHASE-2-SHOP-WORKFORCE-AVAILABILITY.md):

| Packet | Planned test focus |
| --- | --- |
| P2-03 Hiring state | off / open / full transitions with optional counts. |
| P2-04 Employment convergence | application / invitation / join-code converge on one owner-approved request. |
| P2-05 Provider capabilities | owner-as-provider and per-service qualifications. |
| P2-06 Schedule authority | owner shifts and barber change requests. |
| P2-07 Availability engine | combine hours, closures, employment, qualification, shifts, buffers, overlap, and chairs into one slot computation. |
| P2-08 Race gate | concurrent claim and capacity probes for the availability engine. |

---

## Findings {#findings}

1. **Hours `PUT` is delete-then-insert (non-atomic).** The replace-all hours
   route deletes existing blocks and inserts the new set in two steps rather than
   one transactional RPC. Low risk for an owner editing their own shop, but a
   crash between the two steps could leave hours empty. Candidate for a single
   transactional RPC in a later pass.
2. **Readiness count object is passed in, not derived.** `shopPublicationReadiness`
   takes `{ activeServices, operatingHours }` as counts so it stays a pure
   function. The caller is responsible for counting non-closed hours and active
   services correctly; the API publish route and the UI must agree. They are
   aligned today (the route counts active services and non-closed hours), but it
   is a coupling to watch when the services editor lands.
3. **Closures uniqueness is per (shop_id, local_date).** Upsert uses
   `onConflict: 'shop_id,local_date'`, so a second save for the same date updates
   rather than duplicates. A closure that is not "closed" must carry replacement
   open/close times (DB constraint), which the save path enforces.
4. **P2-02 is only partway.** Hours and closures are done; media, the services
   editor, and the map-pin picker are still open. Publish readiness already lists
   "at least one active service", so a shop cannot actually publish until the
   services editor slice lands to create one. That is expected sequencing, noted
   here so it is not mistaken for a bug.
