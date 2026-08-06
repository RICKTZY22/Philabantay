---
tags:
  - philabantay
  - phase-4
  - handoff
updated: 2026-08-05
---

# Phase 4 handoff (Claude → Codex)

Deliver **Phase 4: trust, insights, settings, and workspaces**, P4-01 through
P4-09. Authority is [04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md](04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md)
and the packet rows in [06-IMPLEMENTATION-WORKBREAKDOWN.md](06-IMPLEMENTATION-WORKBREAKDOWN.md).
This card exists so you do not rediscover what I already measured.

Read `CLAUDE.md` / `AGENTS.md` and its linked documents first.
**Do not start Phase 5.**

---

## 1. Where the tree stands

Everything through Phase 3 is **pushed** as of 2026-08-05, `origin/main` at
`3082650`, fast-forward, zero merge commits, tree clean. There is no
uncommitted work to rescue this time.

Verified on that tree: clean replay through **58 migrations**, DB lint no
findings, **matrix 91/91 twice** with no reset, typecheck clean, ESLint **0/0**,
**131 fast tests**, both production builds, `git diff --check` clean.

**P2-08 and P3-09 are still formally open.** Codex's 2026-08-05 entry ran most of
the browser acceptance and fixed two real defects (missing Owner Barbers `H1`,
Barber Shift Calendar overflow at 320 px), then explicitly skipped exhaustive
Tab/Enter/Space traversal, Chromium-native hours/closure mutations, and the
remaining time-bound P3-09 rows. Those three items are still owed. Phase 4 does
not depend on them, so do not let them block you, but do not record either phase
as closed either.

---

## 2. Dependencies are satisfied, and more exists than the roadmap says

Every Phase 4 packet hangs off Phase 3, which is implemented:

```
P4-01 conversation membership  → Phase 3
P4-02 disputes/moderation      → P3-03
P4-03 ratings                  → P3-03, P4-02
P4-04 analytics facts          → P3-06
P4-05/06/07 workspaces         → P4-01, P4-03, P4-04
P4-08 settings                 → P4-05..P4-07
P4-09 experience gate          → P4-08
```

**Measure before building.** I already found these standing:

| Already present | Where |
| --- | --- |
| `ratings` table, `GET`/`POST /ratings` | `phase3-operations.ts` |
| `no_show_appeals` + resolve route | `phase3-operations.ts` |
| `payment_records` | P3-06 |
| `requireConversationAccess`, rechecking active employment | used 4× in `chat.ts` |
| Owner overview already rendering "Completed service value", "Rates", "Top services" | owner workspace |
| `GET /shops/:id/stats` | `bookings.ts` |

So Phase 4 is largely **finish and harden**, not greenfield. Do the same gap
measurement P2-07 did: prove what is missing against the live database before
writing anything, and record the measurement.

---

## 3. Start here: the one defect I found

**`POST /ratings` is the only write in the application that bypasses the SQL
command pattern.**

Every other mutation goes through a `SECURITY DEFINER` RPC — `bookings.ts` uses
9, `phase3-operations.ts` uses 19. Ratings does a direct service-role
`.upsert()` on the table, and the eligibility rule lives only in TypeScript:

```ts
if (appointment.status !== 'completed') throw new ApiError(400, ...)
```

There is **no `api_rate_*` function anywhere in the migrations**, and
`service_role` still holds `INSERT/UPDATE/DELETE` on `ratings`, where
`appointments` had exactly those revoked in P1-04 to force writes through the
command.

Consequences, all of which P4-03 must close:

- RATE-01's "only completed visits unlock a rating" exists in one place, in the
  layer this project treats as a guard rather than an authority;
- no transaction, so eligibility and the write are not atomic;
- no audit event, while the phase plan requires rating and moderation decisions
  to be auditable;
- the phase plan needs far more than the current shape anyway — a rating
  eligibility record, a seven-day edit window then immutability, shop and barber
  scored separately, public responses, reports, and moderator hide/restore that
  **preserves the score**.

Not exploitable through the API today, because the Express check does run. It is
a structural gap. Fix it by moving the rule into a versioned SQL command and
revoking the direct grants, matching every other command in the codebase.

---

## 4. Order I would work in

1. **P4-03 ratings** — closes the defect above and builds eligibility, the edit
   window, separate shop/barber scores, responses and reports.
2. **P4-02 disputes and moderation** — ratings moderation leans on it; note
   `disputes` has no table, the flow currently rides `appointments` plus
   `resolve-dispute`.
3. **P4-04 analytics facts** — the contract's metric separation is the hard part:
   booked value, completed service value, collected, refunded, net collected must
   stay distinct, and **nothing may be labelled "revenue"** (contract §10).
4. **P4-01 conversation membership** — mostly present; verify former and
   suspended staff really lose access, including a guessed conversation id.
5. **P4-05 / P4-06 / P4-07 workspaces**, then **P4-08 settings**.
6. **P4-09 experience gate** last.

---

## 5. Required tests, verbatim from the phase plan

All twelve must pass, not a subset:

1. Customer dispute → owner decision → customer escalation → admin resolution.
2. Completed appointment creates one eligibility; seven-day edit then lock.
3. Walk-in claim can rate only its completed linked visit.
4. Negative review remains scored after abusive text is hidden.
5. Owner/barber response and report/moderation/appeal are audited.
6. Former/suspended barber cannot open staff messages or a guessed conversation.
7. Owner dashboard metrics reproduce from fixture queries and use correct labels.
8. Customer no-show never lowers barber performance.
9. Notification provider fails; in-app state remains and operations sees failure.
10. Settings persist on another device and mandatory transactional notices stay
    enabled.
11. Keyboard / screen reader / contrast / reduced motion / 320 px / tablet /
    desktop pass for each role and admin.
12. Performance comparison records role bundle sizes, key render time and image
    payload; no unexplained regression is accepted.

**Exit gate:** trust decisions and sensitive access audited, rating eligibility
cannot be forged, former staff access closed, every metric has a reproducible
definition, all role settings use real backend state, and complete role
workspaces pass accessibility, responsive and performance gates.

---

## 6. Standards that are not negotiable here

- **Forward migrations only.** Never edit an applied migration; add a new one.
- **The database is the authority.** New writes go through a versioned
  `SECURITY DEFINER` command with `set search_path = ''`, not a table write.
  All 152 live functions currently satisfy this; keep it at 100%.
- **Immutable audit.** Moderation and dispute decisions append events; they do
  not overwrite history.
- **Falsify before trusting.** A new regression must be shown failing when the
  defect is reintroduced. That discipline caught three real bugs this week.
- **Never mark a packet complete without recorded evidence.** A surface nobody
  looked at is "unobserved", not "passing". An agent pass is preliminary evidence
  awaiting product-owner confirmation.

---

## 7. Traps already paid for — do not repeat

1. **Port 5174 is mandatory** (`strictPort` + the API's `WEB_ORIGIN` allowlist).
   Any other port fails CORS and every authenticated check breaks silently.
2. **The web dev server binds `[::1]` only.** `localhost:5174` works;
   `127.0.0.1:5174` is refused.
3. **Start the API on 4000**, or every screen renders while every call dies.
   This was reported as an app bug once already.
4. **Docker Desktop's service cannot be started without Administrator.**
   Launching `Docker Desktop.exe` brings the daemon up anyway; the service still
   reads `Stopped` while it works.
5. **`npm run test` does not run the matrix.** It is gated behind
   `RUN_LOCAL_SUPABASE_TESTS=1`.
6. **Reset the database after any deliberate sabotage run.** A falsification left
   one stale `requested` hold and broke two unrelated tests, including an
   alarming-looking 500 that was pure pollution.
7. **Leave no published shop behind**; return the dev shop to `draft`.
8. **Commit by path, never `git add -A`.** I swept another lane's work into a
   commit describing my own and had to split it back apart. `SESSION-LOG.md`
   takes appends from both lanes and cannot be split by path.
9. **`requestAnimationFrame` does not fire while the browser pane is not
   compositing.** rAF-gated behaviour looks broken in a hidden pane and is fine
   in a real browser. Do not file bugs from that.
10. **Wait longer than feels necessary on Shop Setup** before counting controls;
    a 1.3 s settle reported 4 controls where 3.5 s reported 63.
11. **`read_page` prints input values, not labels.** Empty fields look nameless
    and are not. Compute the accessible name properly before reporting.
12. **A bleed past the viewport edge is not automatically a defect.** Check for a
    scrollable ancestor first; 25 "bleeding" elements on settings were all inside
    legitimate scrollers, zero truly clipped.

---

## 8. Acceptance

```bash
npm run typecheck && npm run lint && npm run test && npm run build && git diff --check
```

Plus, since Phase 4 will certainly touch `apps/api` and `supabase`:

```bash
RUN_LOCAL_SUPABASE_TESTS=1 npx vitest run
```

from `apps/api`, twice back to back with no reset, on a database replayed from
empty. Plus `npx supabase db lint` with zero findings.

Then update `docs/plans/ROADMAP-STATUS.md`, `docs/testing/` (add a Phase 4 test
file), `docs/memory/CURRENT-STATE.md`, `docs/memory/SESSION-LOG.md`,
`docs/memory/DECISIONS.md` for any product or architecture call, and
`docs/plans/LANE-COORDINATION-LOG.md`.

Ask before pushing.
