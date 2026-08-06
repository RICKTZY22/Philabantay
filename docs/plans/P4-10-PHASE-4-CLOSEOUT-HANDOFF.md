---
tags:
  - philabantay
  - phase-4
  - handoff
updated: 2026-08-06
---

# P4-10 handoff, closing Phase 4 and what follows

Phase 4 is **one item** from closing. This card exists so you do not rediscover
what the previous lane already measured, and so you do not repeat the mistakes it
made.

Read `CLAUDE.md` / `AGENTS.md` and its linked documents first. Authority for the
remaining work is
[04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md](04-PHASE-4-TRUST-INSIGHTS-EXPERIENCE.md)
section 9, required test 11.

**Do not start Phase 5.**

---

## 1. Where the tree stands, exactly

`origin/main` is at **`d02cf30`**. Local `HEAD` is at **`e3b8e33`**, four commits
ahead, **none pushed**. The product owner has not yet released them.

```text
e3b8e33  fix: close the 2026-08-06 repo audit
3230ab6  feat(auth): TOTP enrolment and a step-up challenge
8f0c938  docs: record the admin console, the provisioning gap, and the MFA blocker
fbd113b  feat(phase4): staff admin console, and repair two repeat-run matrix flakes
```

The working tree is clean. Verified on this tree, from a database replayed from
empty:

```text
migrations      70 applied from empty
DB lint         no schema errors
functions       219 / 219 pin `search_path = ''`   (100%)
typecheck       all workspaces passed
lint            ESLint 0/0
fast tests      131
matrix          143 / 143 twice back to back, no reset
build           API + web production build passed
diff            git diff --check clean
```

**Ask before pushing.**

---

## 2. The one thing that closes Phase 4

**Required test 11, the admin quarter.** Customer, barber and owner passed on
2026-08-06 and are recorded in
[PHASE-4-TESTS.md](../testing/PHASE-4-TESTS.md#p4-09-execution-record--2026-08-06).
Admin was deferred at that point for a good reason: three of its four surfaces did
not exist, and no admin surface was reachable in a browser by anyone because the
product had no MFA at all.

Both of those are now fixed. The console is built and MFA works. So the sweep is
finally possible, and it is the only thing keeping the phase open.

Six surfaces to sweep, to the same standard as the other three roles:

| Surface | Route |
| --- | --- |
| Verification queue and its detail | `/admin/verifications`, `/admin/verifications/:submissionId` |
| Dispute review and its case detail | `/admin/disputes`, `/admin/disputes/:caseId` |
| Rating moderation | `/admin/moderation` |
| Notification delivery | `/admin/operations` |
| Authenticator enrolment card | `/settings/security` |
| The AAL2 step-up gate | any `/admin` route on an AAL1 session |

For each: zero page-level horizontal overflow at 320 px, tablet and desktop; the
200 % zoom equivalent; keyboard traversal reaching every control with visible
focus; a correct accessible name on every control; 44 px targets; contrast at AA;
and no colour-only status.

The dispute queue and the operations view were already measured clean at desktop
and 320 px during the build, and two defects found there were fixed (18 px
disclosure summaries, and grid children that could not shrink below a table's
`min-width`). **Re-measure rather than trust that.**

### Then, and only if it actually passes

Update [PHASE-4-TESTS.md](../testing/PHASE-4-TESTS.md) row 11 and the outstanding
list, [ROADMAP-STATUS.md](ROADMAP-STATUS.md),
[CURRENT-STATE.md](../memory/CURRENT-STATE.md),
[SESSION-LOG.md](../memory/SESSION-LOG.md), and
[LANE-COORDINATION-LOG.md](LANE-COORDINATION-LOG.md).

If a surface fails, record it as failing and fix it. A surface nobody looked at is
"unobserved", not "passing".

---

## 3. One correction to make while you are in the documents

[CURRENT-STATE.md](../memory/CURRENT-STATE.md) still carries an open item saying
the customer detail screen does not consume `/availability` or `/bookings/quote`.
**That is stale.** `CustomerDashboard.tsx` calls `backend.availability.getDay` and
`backend.bookings.quote` in its booking workspace, and `AppointmentsPage.tsx`
calls `getDay` for reschedule. Verified 2026-08-06. Remove the item.

---

## 4. Traps already paid for, do not repeat

Carried forward, all still true:

1. **Port 5174 is mandatory** (`strictPort` plus the API's `WEB_ORIGIN`
   allowlist). Any other port fails CORS and every authenticated check breaks
   silently.
2. **The web dev server binds `[::1]` only**; `localhost:5174` works,
   `127.0.0.1:5174` is refused. **The API binds `127.0.0.1` only**, the exact
   mirror. The app is configured for `http://127.0.0.1:4000/api/v1`. Nothing is
   broken; do not "fix" it.
3. **`npm run test` does not run the matrix.** It is gated behind
   `RUN_LOCAL_SUPABASE_TESTS=1`, run from `apps/api`.
4. **Reseed after any `supabase db reset`**: `npm run seed:accounts -w
   @barbershop/api`.
5. **Leave no published shop behind**; return the dev shop to `draft`.
6. **Commit by path, never `git add -A`.**
7. **`apps/api` test files run serially** and share one Postgres. A new suite needs
   an `afterAll` that archives any shop it published.
8. **`supabase db reset` restarts containers.** The first command afterwards can
   fail to connect. Give it a few seconds. Docker Desktop itself stopped twice
   during the last session; if the CLI reports it cannot reach the daemon, restart
   Docker and wait rather than assuming the database is broken.

New, found while building the console and MFA:

9. **A `min-height` on `.something .btn` inside the workspace is dead CSS.**
   `.app-shell.is-workspace .btn` and `.btn-sm` are three classes and win on
   specificity. Five Phase 4 rules lost silently and measured 36 px against a
   stated 44 px. Scope target-size rules under `.app-shell.is-workspace`, and
   **measure in the browser**; do not trust that the declaration applied.
10. **`ModalPortal` renders outside `.app-shell`**, so a portalled dialog does not
    inherit the workspace token remap and falls back to the base doodle palette.
    Anything checked for contrast must be checked with a dialog open too.
11. **PostgREST embed hints are the highest-yield bug class in this repo.** Two
    were found in one day. `rating_eligibilities.provider_id` targets `barbers`,
    not `users`. `barber_employment` has no relationship to `users` at all; it goes
    through `barbers`. A wrong hint typechecks, builds, passes lint, and answers
    `PGRST200` at runtime, which Express turns into a 500. **Probe every new embed
    directly against PostgREST before trusting it.**
12. **`document.scrollWidth` lies under viewport emulation.** When content is wider
    than the real window, it reports the window width and looks like page overflow.
    Check `window.scrollX` after `scrollTo(400, 0)`: if it stays 0, the page cannot
    scroll sideways and there is no defect.
13. **`read_page` only reports controls inside the visual viewport.** Scroll the
    section into view first, or a full page looks like it has three controls.
14. **The browser pane can stop delivering synthetic mouse and key input.**
    Screenshots then fail with "the pane is not displayed". `form.requestSubmit()`
    and `element.click()` still work. Do not file a bug from a click that was never
    delivered.
15. **A closeout run is a singleton per shop and local date** and returns
    immediately once `completed`. A fixture that runs closeout on a shared shop and
    date must clear its own row first, or a repeat run processes nothing.
16. **The notification outbox is global and accumulates.** A fixture must name the
    row it created, scoped to its own appointment and still pending. Taking
    `.at(-1)` of an unordered query picks up a delivered notice from the previous
    run.
17. **The assignment guard refuses a visit dated before the provider was hired**
    (`hired_at <= starts_at::date`), and only fires for non-terminal statuses. A
    fixture can backdate a `completed` visit freely but not an
    `awaiting_confirmation` one.

New, specific to MFA and the admin console:

18. **GoTrue's `GET /factors` answers 405.** Factors live on `GET /user` as
    `factors`. The obvious guess is wrong and costs a 502.
19. **`api_provision_verification_admin` refuses any profile with a non-null
    `requested_role`**, including `'customer'`. Set it to `null` before
    provisioning, or you get "A professional or pending-professional account cannot
    become an administrator."
20. **Every `/admin` route requires AAL2.** A password-only session lands at AAL1
    and gets the step-up gate. That is correct behaviour, not a bug.

---

## 5. Local accounts, and the one you have to create

`npm run seed:accounts -w @barbershop/api` creates three accounts sharing the
password pinned as `SEED_PASSWORD` in the gitignored `apps/api/.env`. Read it from
there; it is deliberately not in this vault.

```text
owner@phila.test      shop_owner, verified, owns "Philabantay · Dev Shop" (draft)
barber@phila.test     barber, verified, active employment + both services
customer@phila.test   customer
```

**There is no admin account, and the seed script does not make one.** The last
`supabase db reset` wiped the one the previous lane created. You need one for this
packet, and the path now works end to end through the UI:

1. Sign up through the app, or create the identity with the service role.
2. Make sure the profile's `requested_role` is `null` (trap 19).
3. Sign in, go to **Settings, Security**, and set up an authenticator app. The
   secret is shown once as text; keep it, you will need it to compute codes.
4. `npm run admin:provision -w @barbershop/api -- --email <email> --capabilities
   content_moderation,dispute_review,verification_queue_read --operator "<ticket>"`
5. Sign in again. You land at AAL1. Open any `/admin` route, enter a code, and the
   console renders.

To compute a TOTP code from the secret for automated testing, mirror the helper in
`apps/api/test/phase4-trust.integration.test.ts`.

---

## 6. Acceptance

```bash
npm run typecheck && npm run lint && npm run test && npm run build && git diff --check
```

Plus, if you touch `apps/api` or `supabase`, from `apps/api`:

```bash
RUN_LOCAL_SUPABASE_TESTS=1 npx vitest run
```

twice back to back with no reset, on a database replayed from empty, plus
`npx supabase db lint` with zero findings.

**Phase 4 closes only when test 11's admin quarter actually passes and is
recorded.**

---

## 7. What comes after, in the order I would do it

Not part of this packet. Listed so the next card is easy to write.

1. **Stand up the web component test harness.** `apps/web` has 15k lines of React
   and three test files, all covering pure helpers. No `@testing-library/react`, no
   jsdom. The MFA enrolment card and the AAL2 gate are what stand between a
   password and every staff console surface, and they shipped with **zero**
   automated frontend coverage. Phase 5's release gates assume the app is
   verifiable. This is the highest-value packet on the board.
2. **Finish P2-08's two browser rows**: native date and time mutation on Shop
   Setup hours and closures, and exhaustive keyboard traversal.
3. **Finish P3-09's remaining journey rows**: duplicate, exact, preferred and
   instant booking, plus the time-bound, walk-in, payment, notification and
   closeout journeys. See the consolidated browser checklist.
4. **Three high-severity `npm audit` advisories**, `postcss` and `react-router`.
   A router upgrade is its own change with its own gate.
5. **Then Phase 5**, production hardening and rollout, P5-01 to P5-06. It needs a
   deploy target decision from the product owner first: `apps/web/scripts/check-csp.mjs`
   will now fail the build the moment a non-local `VITE_API_BASE_URL` is
   configured while `public/_headers` still says `connect-src 'self'`. That is
   deliberate. Somebody has to supply the real origins.

Two items are decisions rather than code:

- **D-052, the palette change.** Three colour tokens were darkened so the app
  meets WCAG AA at default settings; the old values measured 2.64:1 and 4.06:1.
  It changes the look of every signed-in surface and reverts in three lines. The
  product owner should look at it on a real screen.
- **The app-wide 44 px floor.** `.app-shell.is-workspace .btn-sm` pins every small
  workspace button to 36 px, including pre-existing controls. Raising it changes
  the look of every signed-in screen, so it is a product decision, not a gate fix.
