---
tags:
  - philabantay
  - phase-4
  - handoff
updated: 2026-08-05
---

# P4-09 handoff — the Phase 4 experience gate

Deliver **P4-09**, the last Phase 4 packet. Authority is
[04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md](04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md)
section 9 and required tests 11 and 12. This card exists so you do not rediscover
what the previous lane already measured.

Read `CLAUDE.md` / `AGENTS.md` and its linked documents first.
**Do not start Phase 5.** Do not begin new Phase 4 features before the gate.

---

## 1. Where the tree stands, exactly

`origin/main` is at **`3082650`** and local `HEAD` is the same commit. **All of
Phase 4 is uncommitted: 59 files in the working tree, 11 new migrations.** Nothing
has been pushed.

**Your first decision is whether to commit before touching anything.** The previous
lane deliberately stopped short of committing because the product owner asked to be
asked. If you are told to commit: commit **by path**, never `git add -A` — another
lane's work has been swept into the wrong commit before, and `SESSION-LOG.md` takes
appends from both lanes so it cannot be split by path.

Verified on this tree, from a database replayed from empty:

```text
migrations      69 applied from empty
DB lint         no schema errors
functions       219 / 219 in public+private pin `search_path = ''`  (100%)
typecheck       all workspaces passed
lint            ESLint 0/0
fast tests      131
matrix          143 / 143 twice back to back, no reset
build           API + web production build passed
diff            git diff --check clean
```

The dev servers are **not** running. Start them yourself (section 6).

---

## 2. What is already done, and what P4-09 owes

P4-01 through P4-08 are implemented and **falsified** — every regression was
observed failing with its defect reintroduced. Evidence and the full falsification
record are in [PHASE-4-TESTS.md](../testing/PHASE-4-TESTS.md). The pre-build
measurement is in [PHASE-4-GAP-MEASUREMENT.md](../testing/PHASE-4-GAP-MEASUREMENT.md).

**Ten of the twelve required tests are covered by automated regressions.** P4-09
owes exactly two:

| # | Requirement | State |
| --- | --- | --- |
| 11 | Keyboard, screen reader, contrast, reduced motion, 320 px / tablet / desktop, for **each role and admin** | **not run at all** |
| 12 | Role bundle sizes, key render time, image payload | bundle sizes recorded as a baseline; **render time and image payload not measured** |

Everything else in Phase 4 is either covered or explicitly listed as outstanding at
the end of the test catalogue. Do not re-derive that list; read it.

---

## 3. Start here: the six surfaces nobody has opened

These were built to the section 9 contract and have **never been rendered in a
browser**. Built to the contract is not the same as observed passing, and that
distinction is the entire packet.

| Surface | Route | What to look at first |
| --- | --- | --- |
| Owner **Analytics** | `/dashboard/owner/analytics` | Eight sections, each with a bar chart plus an accessible table and a CSV download. Range buttons are `aria-pressed`. Wide tables scroll inside `.analytics-table-scroll`, never the page. |
| Owner **Trust** | `/dashboard/owner/trust` | Dispute decision form (radio fieldset), one public response per review, report form in a `<details>`. |
| Barber **Performance** | barber home, below the stat row | Three separate failure figures that must never read as one score. Rating spread has bars *and* a table. |
| Customer **rating prompt** | customer home, above discovery | Only appears when an eligibility is open. Star row is a `role="group"` with a text value beside it. |
| Customer **dispute panel** | booking detail modal | Opens a dispute with the customer's own words; then accept-or-escalate with a stated window. |
| **Notification settings** | `/settings/notifications` | Mandatory notices row is a stated badge, not a dead switch. Quiet-hours time inputs, language and text-size selects, radius slider. |

A seventh thing to check, because it changed under the hood: `ChatPage` now pages
messages by cursor rather than by limit, and the response carries a `meta` block.
The screen was not rewritten to use `getMessagePage`, so confirm the existing
`getMessages` path still renders a thread correctly.

### What the contract actually requires

Section 9, and the previous lane built to all of it — verify rather than trust:

- 44 px minimum touch targets. Every new button, switch, radio row, and range
  input was sized for it; measure, do not assume.
- Visible focus, logical heading order, keyboard-complete interaction.
- No colour-only status. Every score, rate, and state also appears as text —
  `4/5`, `Not enough data`, `Required`, `No reviews yet`.
- Text alternatives for charts: every chart has a `<table>` beside it.
- `prefers-reduced-motion` path. Only `.analytics-bar-fill` and
  `.performance-bar-fill` animate, both `height` transitions guarded by a
  reduced-motion media query. **That is a size transition, not transform/opacity —
  flag it if you think the contract's "favour transform/opacity" applies here.**
- Honest empty and partial states. `null` is rendered as "Not enough data", never
  as `0%`, wherever a rate has no denominator.
- Focus-trapped portalled dialogs with restoration, one active overlay.

### Admin has no screens, so "each role and admin" is not yet possible

Three surfaces are complete and tested at the API with **no UI at all**: the admin
dispute queue, the rating-moderation queue, and the notification operations view.
Required test 11 says "for each role **and admin**", so either build those screens
first or record explicitly that the admin half of test 11 is deferred with the
console. Do not quietly count four roles as complete when the fourth has no
surface.

---

## 4. Order I would work in

1. **Decide the commit question** and act on it.
2. **Start the servers**, sign in as each role, and walk the six surfaces at
   1280×800 first — find functional defects before measuring pixels.
3. **320 px, then tablet, then desktop** for each surface. Zero horizontal
   overflow on the page; a scrollable ancestor is fine and is not a defect.
4. **Keyboard traversal** per surface: reach every control, activate it, escape
   every dialog, confirm focus returns.
5. **Reduced motion** with real media emulation, not a CSS toggle.
6. **Contrast and 200% zoom.**
7. **Required test 12's remaining half**: key render time and image payload,
   compared against the bundle table already in the test catalogue.
8. **Fix what you find, retest the affected route**, and only then update the
   status documents.

---

## 5. Standards that are not negotiable here

- **Record failures, do not smooth them.** A surface nobody looked at is
  "unobserved", not "passing". An agent pass is preliminary evidence awaiting
  product-owner confirmation.
- **Forward migrations only** if you touch SQL at all. New writes go through a
  versioned `SECURITY DEFINER` command with `set search_path = ''`. All **219**
  live functions satisfy that; keep it at 100%.
- **Falsify before trusting.** Any new regression must be shown failing with its
  defect reintroduced. Nine sabotage runs did that for Phase 4 and caught real
  bugs; one of them proved a rule was defended at three layers rather than one.
- **Reset the database after any deliberate sabotage run.**
- **Do not loosen a global assertion to make a number green.** The matrix's
  "customer sees exactly these two published shops" is deliberately database-wide
  because that is how fixture pollution gets caught.

---

## 6. Traps already paid for — do not repeat

Carried from the Phase 4 card, all still true:

1. **Port 5174 is mandatory** (`strictPort` + the API's `WEB_ORIGIN` allowlist).
   Any other port fails CORS and every authenticated check breaks silently.
2. **The web dev server binds `[::1]` only.** `localhost:5174` works;
   `127.0.0.1:5174` is refused.
3. **The API binds `127.0.0.1` only** — the exact mirror. `127.0.0.1:4000` works,
   `localhost:4000` fails from the browser because `localhost` resolves to `[::1]`.
   The app is configured for `http://127.0.0.1:4000/api/v1`, so nothing is broken;
   do not "fix" it, and do not file a bug from probing the wrong host.
4. **Start the API on 4000**, or every screen renders while every call dies.
5. **`npm run test` does not run the matrix.** It is gated behind
   `RUN_LOCAL_SUPABASE_TESTS=1`, run from `apps/api`.
6. **Reseed after any `supabase db reset`.** `npm run seed:accounts -w
   @barbershop/api`. A fresh database plus stale credentials has been mistaken for
   an app bug before.
7. **Leave no published shop behind**; return the dev shop to `draft`.
8. **Commit by path, never `git add -A`.**
9. **`requestAnimationFrame` does not fire while the browser pane is not
   compositing.** rAF-gated behaviour looks broken in a hidden pane and is fine in
   a real browser. Do not file bugs from that.
10. **Wait longer than feels necessary on Shop Setup** before counting controls; a
    1.3 s settle reported 4 controls where 3.5 s reported 63.
11. **`read_page` prints input values, not labels.** Compute the accessible name
    properly before reporting a control as unlabelled.
12. **A bleed past the viewport edge is not automatically a defect.** Check for a
    scrollable ancestor first.

New, found during Phase 4:

13. **`apps/api` test files run serially now** (`vitest.config.ts`,
    `fileParallelism: false`). They share one Postgres and several matrix
    assertions are database-wide. If you add a suite, give it an `afterAll` that
    archives any shop it published.
14. **`api_record_offline_payment` refuses a `paid_at` beyond `now() + 5 minutes`.**
    A fixture cannot put collections in the same future window as its visits, and
    the analytics ledger buckets on `paid_at`, so those assertions need two ranges.
15. **`api_deliver_due_in_app_notifications` takes the oldest due rows up to a
    limit.** A test that enqueues a notice and expects the next sweep to reach it
    silently depends on the global queue being shorter than that limit. Backdate
    the fixture's `created_at`.
16. **In-app inbox rows are created by the enqueue triggers, not by the delivery
    worker.** Assert on `notification_deliveries`, not `in_app_notifications`.
17. **`supabase db reset` restarts containers.** The first command afterwards can
    fail to connect. Give it a few seconds.
18. **`service_role` no longer has write grants** on `ratings`, `conversations`,
    `messages`, `notification_preferences`, or any new trust table. Fixtures must
    call the commands; a direct write now returns `42501`.

### Local accounts

`npm run seed:accounts -w @barbershop/api` creates three accounts sharing the
password pinned as `SEED_PASSWORD` in the gitignored `apps/api/.env` — read it from
there, it is deliberately not in this vault.

```text
owner@phila.test      shop_owner, verified, owns "Philabantay · Dev Shop" (draft)
barber@phila.test     barber, verified, active employment + both services
customer@phila.test   customer
```

There is **no usable admin account.** The five `admin` rows in the database are
test-fixture leftovers with random per-run passwords. To make a real one: sign up
through the app, enrol TOTP in Settings → Security, then
`npm run admin:provision -w @barbershop/api -- --email … --capabilities content_moderation,dispute_review`.
The script will not create an account, set a password, or print a credential, and
the command refuses anything without a confirmed email and a verified MFA factor.

---

## 7. Acceptance

```bash
npm run typecheck && npm run lint && npm run test && npm run build && git diff --check
```

Plus, if you touch `apps/api` or `supabase`, from `apps/api`:

```bash
RUN_LOCAL_SUPABASE_TESTS=1 npx vitest run
```

twice back to back with no reset, on a database replayed from empty, plus
`npx supabase db lint` with zero findings.

Then update [PHASE-4-TESTS.md](../testing/PHASE-4-TESTS.md) (rows 11 and 12, and
the outstanding list), [ROADMAP-STATUS.md](ROADMAP-STATUS.md),
[CURRENT-STATE.md](../memory/CURRENT-STATE.md),
[SESSION-LOG.md](../memory/SESSION-LOG.md),
[DECISIONS.md](../memory/DECISIONS.md) for any product or architecture call, and
[LANE-COORDINATION-LOG.md](LANE-COORDINATION-LOG.md).

**Phase 4 closes only when tests 11 and 12 actually pass and are recorded.** P2-08
and P3-09 remain separately open on their own three named items; nothing here
closes them and nothing here depends on them.

Ask before pushing.
