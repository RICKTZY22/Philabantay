---
tags:
  - philabantay
  - p2-08
  - handoff
updated: 2026-08-01
---

# P2-08 smoke journeys handoff (Claude → Codex)

P2-08 is half done. The **backend race gate** is finished and proven. The
**responsive owner/barber/customer smoke journeys** are not, and they are the
last thing standing between the project and a closed Phase 2.

Read `CLAUDE.md` / `AGENTS.md` and its linked documents first. **Do not start
Phase 3.**

---

## 1. Why this is yours and not mine

Not a scoping preference. Driving these journeys needs an authenticated browser
session, and signing in means typing a real account password into a form, which
the Claude agent must not do. Installing a session token directly was attempted
and correctly blocked by the safety classifier. You are at a keyboard with the
credentials, so this is genuinely a human-lane task.

The equivalent **authorization** surface is already exercised over real HTTP for
all three roles (ten calls, all 200). What is missing is everything only a
browser can show: layout, focus, labelling, reduced motion, console health.

---

## 2. What is already landed and verified

Do not redo or "improve" these.

**P2-08 backend race gate — proven 2026-08-01, no migrations needed.** Matrix
82 → 85, green twice back to back on a database replayed from empty through all
53 migrations.

| Race class | Outcome |
| --- | --- |
| Hold released by a decline, then two customers contest the freed slot | slot returns to the pool, exactly one winner |
| Claim/expiry boundary (sweeper vs fresh claim) | never two live rows; refusal is transient and a retry after the sweep succeeds |
| Two customers racing an owner-provider | one winner, loser `23P01` |
| Owner-provider vs employed barber, one chair | one winner, loser `P4026` |

All three new regressions were falsified before being trusted. Tests live at
`apps/api/test/local-supabase.integration.test.ts:4539`, `:4582`, `:4657`.

**Changes since you last had the tree** — read these before you judge anything
as a regression:

- **The landing page is the hero and nothing else (D-031).** `#how`,
  `#services`, `#contact` and the footer are deleted, along with the header
  nav's Services/Contact Us links and the hero's "Watch the Video" button.
  `LandingPage.tsx` is 112 lines, from 729. `LandingPage.css` is 977, from 3602.
- **Rive is deleted (D-032)**, and `'wasm-unsafe-eval'` is gone from both CSP
  definitions. If you re-add Rive you must re-add the token in **both**
  `vite.config.ts` and `public/_headers`.
- **`npm run lint` is now a real ESLint 9 run** (`eslint . --max-warnings 0`)
  over all three workspaces. Warnings fail. Before 2026-08-01 it was
  `tsc --noEmit` over `apps/api` only, so any older "lint clean" means nothing.
- **The dev CSP is built by directive merge, not string replace**, and the dev
  server sends `Cache-Control: no-store`. Do not reintroduce `.replace()` there.
- **An owner-provider can now read and cancel their own booking.** A guard bug
  returned `403 "This action requires one of these roles: barber."` on
  `GET /bookings/:id/timeline`. If any owner screen still hides timeline or
  cancel for owner-run visits as a workaround, remove the workaround.

---

## 3. What you own

Deliver the packet's frontend half from
`docs/plans/06-IMPLEMENTATION-WORKBREAKDOWN.md`: **"responsive owner/barber/
customer smoke journeys"**, at the same evidence standard as P2-02 through
P2-06. Nothing less counts, because those packets set the bar.

### Journeys

| Role | Must cover |
| --- | --- |
| Owner | Shop Setup (details, hours, closures, services, publish/unpublish), Staff panel including provider capability and per-service qualifications, Hiring, bookings list, and the readiness checklist refusing Publish with nobody bookable |
| Barber | Read-only schedule, submitting a shift change request, own bookings, attendance |
| Customer | Discovery, shop detail, creating a booking, own bookings, chat |

### Evidence standard, per surface

1. **Responsive:** no horizontal overflow and no clipped or unusable control at
   **1280×800, 390×844, 375×812 and 320×800**. Report measured numbers, not
   "looks fine".
2. **Accessibility:** count interactive controls and report
   **0 unreachable and 0 unlabelled**, in the `owner 47/39` style P2-06 used
   (reachable/labelled, with disabled controls called out).
3. **Keyboard:** native `Tab` / `Shift+Tab` traversal reaches every control with
   visible focus; Enter activates; Escape dismisses; no focus trap.
4. **Reduced motion:** verify with real browser media emulation of
   `prefers-reduced-motion: reduce`, not by reading CSS. P2-06 left this as a
   structural-only check and it is still an open caveat — please close it.
5. **Console:** zero errors on every journey.
6. **Stale session:** a second tab holding an old version gets the conflict
   message and does not overwrite the first.

### Also close, while you are in there

Two carried items that are the same kind of work:

- **P2-06 human visible-workflow review** of the owner staff panel and barber
  schedule. Currently unobserved, not known-broken.
- **P1-02 LR-033**: session-restore smoke with no public/dashboard flash.

---

## 4. Explicitly not in scope

- **The customer detail slot picker.** The screen still does not consume
  `/availability` or `/bookings/quote`; a customer reads "Busy — puno ang
  chairs" off the barber's live shift status, which says nothing about whether
  tomorrow at 14:00 is free. This is real, tracked as open item 6, and is a
  **feature**, not smoke-test polish. Report it, do not build it here.
- Any backend, migration, or SQL change. If a journey exposes a backend defect,
  write it up and hand it back rather than fixing it in this packet.
- Phase 3.

---

## 5. Traps already hit — do not repeat

1. **Port 5174 is not optional.** `vite.config.ts` uses `strictPort` and the
   API's `WEB_ORIGIN` allowlist trusts only `localhost:5174` and
   `127.0.0.1:5174`. Any other port fails CORS and every authenticated check
   breaks silently. Recorded as D-018.
2. **The web dev server binds `[::1]` only.** `http://localhost:5174` works;
   `http://127.0.0.1:5174` is refused. Not a bug, but it will waste ten minutes.
3. **Start the API.** `apps/api` on port 4000 must be running or every screen
   renders while every call dies. This exact thing was reported as an app bug
   on 2026-08-01.
4. **`VITE_STORAGE_ORIGIN` must be `http://127.0.0.1:54521`.** It feeds
   `connect-src` and `img-src`; the old `54321` CSP-blocks signed photo uploads
   and private previews.
5. **An empty public catalogue is expected**, not a bug. The matrix archives the
   fixture shops on teardown, so discovery is empty until you publish something.
6. **Leave no published shop behind.** The suite archives
   `primaryShopId`/`secondShopId` on teardown and later assertions depend on
   that. If you publish a shop by hand, return it to `draft` and re-run the
   matrix to confirm it still passes.
7. **Reset the database after any deliberate sabotage run.** The suite shares
   fixtures. A falsification run on 2026-08-01 left one stale `requested` hold
   and it broke two unrelated tests, including a `500` that looked alarming and
   was pure pollution.
8. **`npm run test` does not run the matrix.** The integration suite is gated
   behind `RUN_LOCAL_SUPABASE_TESTS=1`.

---

## 6. Acceptance

```bash
npm run typecheck && npm run lint && npm run test && npm run build && git diff --check
```

Plus, if and only if you touched anything under `apps/api` or `supabase`:

```bash
RUN_LOCAL_SUPABASE_TESTS=1 npx vitest run
```

run twice back to back with no reset, from `apps/api`.

Then update, in this order:

1. `docs/testing/PHASE-2-TESTS.md` — add the journey evidence under the
   `#p2-08` section that already exists, in the per-scenario table style P2-02
   uses.
2. `docs/plans/ROADMAP-STATUS.md` — flip the P2-08 row from 🔨 and update the
   "Progress at a glance" and "Latest automated gate" blocks.
3. `docs/memory/CURRENT-STATE.md` — active packet and exact next action.
4. `docs/memory/SESSION-LOG.md` — one concise entry.
5. `docs/plans/LANE-COORDINATION-LOG.md` — anything the other lane must know.
6. `docs/memory/DECISIONS.md` — only if you make a product or architecture call.

**Do not mark P2-08 or Phase 2 complete without recorded evidence**, and say so
plainly if a check was skipped or only partially done. A scenario nobody looked
at is "unobserved", not "passing". Ask before pushing.
