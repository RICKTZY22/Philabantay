---
tags:
  - philabantay
  - p2-06
  - handoff
updated: 2026-07-28
---

# P2-06 slice 2c handoff (Claude → Codex)

STAFF-01 is half done. The **transactional approval** half is finished and
proven. The **owner-authority** half is not. This card is what remains, plus the
traps already hit so you do not repeat them.

Read `AGENTS.md` and its linked documents first. Do not start P2-07.

---

## 1. What is already landed and verified

Do not redo or "improve" these. They are tested.

### Migrations

| Migration | Contents |
| --- | --- |
| `20260728000400_..._schema.sql` | `staff_schedule_revisions` (per-roster concurrency token), structured/versioned change-request columns, exception provenance (`source`, `created_by`, `change_request_id`), append-only `staff_schedule_events`, read-only RLS |
| `20260728000500_..._commands.sql` | Five owner-authoritative commands + four raising helpers |

Commands, all `SECURITY DEFINER` and **service-role only**:

- `api_replace_staff_shift_patterns(owner, barber, expected_version, blocks)`
- `api_upsert_staff_shift_exception(owner, barber, expected_version, date, is_available, start, end, reason)`
- `api_remove_staff_shift_exception(owner, exception_id, expected_version)`
- `api_submit_shift_change_request(barber, date, kind, message, idempotency_key, start, end)`
- `api_resolve_shift_change_request(owner, request_id, expected_version, decision, note)`

Helpers: `require_owner_staff_employment`, `require_owner_of_employment`,
`bump_staff_schedule_revision`, `assert_no_active_bookings_on_date`.

### Wired and tested

- `POST /barber/shift-change-requests` → `api_submit_shift_change_request`
- `POST /owner/shift-change-requests/:id/approve|decline` → `api_resolve_shift_change_request`
- The old `PATCH /shift-change-requests/:id` (a bare status UPDATE that applied
  no schedule) is **deleted**.
- Shared contract: `ShiftChangeRequest` carries `version`, `requested_kind`,
  requested times, resolution fields, `applied_exception_id`. Added
  `StaffSchedule`, `ReplaceStaffShiftsInput`,
  `UpsertStaffShiftExceptionInput`, `RemoveStaffShiftExceptionInput`,
  `StaffScheduleWriteResult`, `ResolveShiftChangeRequestResult`.
- `ApiBackend`, `OwnerStaffPanel`, and the barber `DashboardPage` request form
  are updated.
- Integration coverage added: idempotent replay returns the same request,
  foreign owner 403, stale version 409, approval produces a linked
  `source = 'change_request'` exception, re-resolve 409.

Current gates: matrix **69/69**, **114** fast tests, typecheck, API/web builds,
`git diff --check` all pass.

---

## 2. What you own

### 2c-1 Wire the owner schedule routes

Three commands exist and nothing calls them. Add canonical routes:

```
GET    /api/v1/owner/staff/:barberId/shifts        -> patterns + exceptions + schedule_version
PUT    /api/v1/owner/staff/:barberId/shifts        -> api_replace_staff_shift_patterns
POST   /api/v1/owner/staff/:barberId/shifts/exceptions -> api_upsert_staff_shift_exception
DELETE /api/v1/owner/staff/shifts/exceptions/:id   -> api_remove_staff_shift_exception
```

The input schemas are already written and exported:
`replaceStaffShiftsInputSchema`, `upsertStaffShiftExceptionInputSchema`,
`removeStaffShiftExceptionInputSchema`.

`GET` must return `schedule_version` from `staff_schedule_revisions`, because
every write echoes it back. Without it the UI cannot satisfy the version check.

The existing `PUT /shops/:shopId/staff/:barberId/shifts/patterns` still uses the
old unversioned `api_replace_shift_patterns`. Point it at the new command or
retire it; do not leave two writers with different concurrency rules.

### 2c-2 Remove the barber self-rewrite

This is the actual authority change and the reason the packet exists. Delete
from `apps/api/src/routes/availability.ts`:

- `PUT /shifts/patterns`
- `POST /shifts/exceptions`
- `DELETE /shifts/exceptions/:id`

Then remove `setRules`, `addOverride`, and `removeOverride` from
`AvailabilityService` and `ApiBackend`. Keep `getRules`, `getOverrides`,
`getMyOverrides`, `getOpenSlots` — reads stay.

### 2c-3 Land the deferred drops and invariants

Only after 2c-1 and 2c-2. A forward migration that:

- drops `api_replace_shift_patterns`, `api_create_shift_exception`,
  `api_remove_shift_exception` (the fourth, `api_create_shift_change_request`,
  is already unused but still present — drop it too);
- sets `shift_change_requests.idempotency_key` to `NOT NULL`;
- adds the pending-resolution invariant:
  `(status = 'pending' and resolved_at is null and resolved_by is null) or (status <> 'pending' and resolved_at is not null)`.

### 2c-4 UI

- **Owner** (`OwnerStaffPanel`): weekly shift editing and exceptions must send
  `expected_version` and refresh on `conflict`. Pending requests already show
  approve/decline; surface that approval applied a schedule change.
- **Barber** (`DashboardPage`): read-only authoritative schedule plus the
  structured request form. Remove the self-edit controls. The form currently
  only submits `kind: 'time_off'`; add `different_hours` with a time range.

### 2c-5 Tests

API, direct-RLS, stale/idempotency, cross-tenant, and concurrency. Specifically
missing today:

- direct-JWT writes to `shift_patterns` / `shift_exceptions` /
  `staff_schedule_revisions` / `staff_schedule_events` are denied;
- barber cannot reach any owner schedule route (403) and anonymous gets 401;
- two concurrent owner writes with the same `expected_version` → one 200, one 409;
- `P4025`: removing availability on a date with active bookings is refused, and
  the message names the count;
- append-only: an owner cannot UPDATE or DELETE `staff_schedule_events`.

### 2c-6 Smoke and docs

Browser/mobile/keyboard/reduced-motion, then roadmap, QA matrix, test catalog,
current state, session log.

---

## 3. Traps already hit — do not repeat

1. **Do not tighten the schema before replacing the writers.** Slice 1 set
   `idempotency_key NOT NULL` and added the resolution invariant while the old
   RPCs were still the live write path. Two integration tests failed
   (`null value in column "idempotency_key" violates not-null constraint`).
   That is why 2c-3 comes last.
2. **Do not drop the old RPCs before the routes stop calling them.** Doing it
   mid-slice broke 3 tests. Verified.
3. **The decision belongs in the path, not the body.** The resolve body schema
   originally required `decision`, so every approve returned 400 while the route
   read the decision from the URL. Use `resolveShiftChangeRequestBodySchema`
   for the wire and keep `decision` only in the client-facing input.
4. **Every owner lookup must raise, never return NULL.** P2-04's ownerless
   resolution exploit came from a NULL-returning lookup feeding a `<>`
   comparison, which plpgsql treats as false. All four helpers in
   `20260728000500` raise. Keep that property.
5. **`ALTER TYPE ... ADD VALUE` cannot be used by DML in the same
   transaction.** Slice 1 avoided this by creating new enums rather than
   extending existing ones. If you need a new label on an existing enum, split
   the migration.
6. **`revoke all on function X` fails when X does not exist**, which makes a
   migration non-rerunnable. `drop function if exists` already removes the ACL;
   the preceding revoke is redundant.
7. **Do not run two local integration matrices at once.** They share the local
   database and interfere.

---

## 4. Acceptance

- Full matrix twice consecutively **with no reset**, identical green result.
- One clean `supabase db reset` through the newest migration, then a full matrix.
- All workspace typechecks, unit tests, API/web production builds,
  `git diff --check`.
- A barber attempting any schedule write is refused at the API layer, proven by
  test, not by inspection.
- Approval still produces a linked exception (existing assertion must stay green).

Report changed files, migrations added, exact counts before and after, which
acceptance runs executed versus skipped, and anything you stopped on rather than
forced. Do not mark P2-06 or Phase 2 complete.
