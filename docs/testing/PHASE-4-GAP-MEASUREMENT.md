---
tags:
  - philabantay
  - phase-4
  - measurement
updated: 2026-08-05
---

# Phase 4 gap measurement

Measured against the **live local database** on 2026-08-05 before any Phase 4
code was written, in the style of the P2-07 measurement. Everything below is a
query result, not a reading of the plan. Database carried all **58** migrations
through `20260802000500_p3_walk_in_payment_closeout.sql`.

Method: `docker exec supabase_db_philabantay psql` against `information_schema`,
`pg_proc`, `pg_trigger`, `pg_policy`, and `information_schema.role_table_grants`,
plus `grep` over `apps/api/src`, `apps/web/src`, and `packages/shared/src`.

## 1. Baseline invariants (must not regress)

| Invariant | Measured |
| --- | --- |
| Live functions in `public` + `private` | **180** (79 public, 101 private) |
| Functions with `search_path=""` pinned | **180 / 180 = 100%** |
| `SECURITY DEFINER` functions | 173 |
| `public.api_*` command functions | 79 |
| Tables in `public` | 57 |
| Tables with RLS disabled | **0** |

The handoff card said "all 152 live functions". The live count is **180**; the
invariant that matters — 100% of them pin `search_path` — holds, and Phase 4
must keep it at 100%. Note the pinned value is literally `search_path=""`, so a
measurement query looking for `search_path=` finds nothing and falsely reports
every function as unpinned.

## 2. P4-03 ratings — the defect, measured precisely

Confirmed, and one correction to the handoff card.

**Confirmed.** No `api_rate_*` function exists. `POST /ratings`
([account-data.ts:72](../../apps/api/src/routes/account-data.ts:72)) is a direct
service-role `.upsert()` on `public.ratings`, and `service_role` still holds:

```text
ratings       DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
appointments  REFERENCES, SELECT, TRIGGER, UPDATE      <- insert/delete/truncate revoked in P1-04
```

**Correction.** The eligibility rule is *not* only in TypeScript. A
`BEFORE INSERT OR UPDATE OF appointment_id, customer_id, barber_id, shop_id`
trigger `ratings_validate` calls
`private.rating_matches_completed_appointment`, which re-checks customer,
barber, shop, and `status = 'completed'` in the database. So the rule is
enforced twice today, and the "only in TypeScript" framing overstates it.

The structural gaps that remain real, and that P4-03 must close:

1. **No command owns the decision.** No transaction boundary, no advisory lock,
   no `expected_version`, so eligibility and write are not one atomic step.
2. **No audit event.** Nothing is appended anywhere when a rating is created or
   changed, while the phase plan requires rating decisions to be auditable.
3. **The trigger does not cover score edits.** It fires only on
   `UPDATE OF appointment_id, customer_id, barber_id, shop_id`. An UPDATE that
   changes `barber_rating`, `shop_rating`, or `comment` alone is unvalidated —
   which is exactly where the seven-day edit window has to live.
4. **`ratings` is 10 columns and has none of the Phase 4 shape:** no eligibility
   record, no `version`, no `editable_until`, no moderation state, no hidden-text
   flag, no public response, no reports, no walk-in linkage.
5. **`refresh_rating_aggregates` averages every row.** Good news for
   "hidden text keeps its score" — hiding must be a state change, never a delete.

## 3. P4-02 disputes — no model exists

Tables matching `%dispute%`, `%case%`, `%moderat%`, `%report%`, `%appeal%`:

```text
bug_reports
no_show_appeals
```

There is no `support_cases`, `case_participants`, `case_evidence`, or
`case_events`. The dispute flow currently rides `appointments.dispute_opened_at`
/ `dispute_reason` plus the `disputed` status in `appointment_status`, and
`appointment_events` already allows `disputed` / `dispute_resolved` event types.
There is no escalation, no admin queue, and no assigned reviewer for disputes
(only for verifications).

## 4. P4-04 analytics — "revenue" is live in the product today

Contract §10 forbids calling any of these "revenue". Measured occurrences:

| Location | What it says |
| --- | --- |
| [bookings.ts:717](../../apps/api/src/routes/bookings.ts:717) | `revenue_cents: completedServiceValue` |
| [bookings.ts:718](../../apps/api/src/routes/bookings.ts:718) | `revenue_is_estimate: true` |
| [bookings.ts:698](../../apps/api/src/routes/bookings.ts:698) | `point.revenue_cents += price` |
| [ShopOwnerDashboard.tsx:927](../../apps/web/src/components/ShopOwnerDashboard.tsx:927) | `<dt>Revenue</dt>` per-barber column |
| [ShopOwnerDashboard.tsx:575](../../apps/web/src/components/ShopOwnerDashboard.tsx:575) | empty-state copy "…ang revenue kapag may completed booking na" |

`revenue_is_estimate: true` is the exact thing §10 prohibits: an estimate
labelled revenue. This is a live contract violation, not a missing feature.

`GET /shops/:id/stats` computes in TypeScript from `appointments` only. It never
reads `payment_records`, so **collected**, **refunded**, and **net collected** do
not exist anywhere in the product; **booked value** and **completed service
value** are conflated into one number derived from `booked_price_cents`.

Missing analytics sections, against the plan's table: capacity (available vs
assigned minutes, utilization, rejected demand), demand funnel (requests /
expired / cancelled / no-show / disputes), retention cohorts, duration variance,
attendance/punctuality, trust distribution, and every walk-in metric.

## 5. P4-01 conversations — closer than the card says, two real gaps

`requireConversationAccess`
([authorization.ts:124](../../apps/api/src/http/authorization.ts:124)) does
recheck active employment for the barber branch and checks owners first for the
owner-provider case. A guessed conversation id therefore fails for a former
barber, because `requireActiveEmployment` filters `status = 'active'` and
`ended_at is null`.

Two things are genuinely missing:

1. **`conversations` is written directly, not through a command.** Both
   `POST /conversations` and `POST /conversations/staff` `.insert()` on the table
   with service-role grants. `api_send_message` and `api_mark_conversation_read`
   exist; conversation creation does not.
2. **Context is only `kind: customer_shop | staff`.** The plan wants explicit
   appointment / hiring-request context, and there is no retention rule, no
   block/report, no rate limit, and no cursor pagination (`GET messages` takes a
   `limit` and reverses in memory).

## 6. P4-08 settings — four booleans

```text
notification_preferences: user_id, booking_reminders, chat_notifications,
                          email_updates, nearby_alerts, created_at, updated_at
```

Persisted server-side and cross-device already, via `PUT
/notification-preferences`. Missing: any distinction between mandatory
transactional notices and optional channels, quiet hours, language, text size,
contrast, reduced motion, and every accessibility preference in plan §7. There
is no `api_*` command; the route `.upsert()`s directly.

## 7. Tables with RLS on and zero policies (deny-all — intended)

18 tables, all service-role-only by design:

```text
account_capabilities, appointment_attention_items, booking_create_requests,
closeout_runs, disruption_batches, employment_join_attempts, guest_visit_claims,
notification_deliveries, notification_outbox, owner_provider_profiles,
provider_capability_events, provider_qualification_revisions,
service_qualification_requests, service_qualifications, shop_join_codes,
verification_documents, verification_events, verification_submissions
```

## 8. What Phase 4 therefore is

Finish-and-harden for ratings, conversations, and settings; **greenfield** for
the dispute/moderation case model, the analytics fact layer, and the admin
console; and one **live contract violation to remove** (the "revenue" labels).

## 9. Direct table writes still bypassing the command pattern

Measured across `apps/api/src/routes`, the full list at the start of Phase 4:

| Route | Table | Verdict |
| --- | --- | --- |
| `POST /ratings` | `ratings` | trust decision — **must become a command (P4-03)** |
| `POST /conversations`, `/conversations/staff` | `conversations` | access decision — **should become a command (P4-01)** |
| `PUT /notification-preferences` | `notification_preferences` | user preference — **command for auditability (P4-08)** |
| `POST /favorites/*/toggle` | `favorite_shops`, `favorite_barbers` | private bookmark, no trust or money implication; left as a table write deliberately |
