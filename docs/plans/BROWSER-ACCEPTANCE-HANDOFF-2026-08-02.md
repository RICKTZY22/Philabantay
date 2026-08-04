---
tags:
  - philabantay
  - p2-08
  - p3-09
  - handoff
updated: 2026-08-02
---

# Browser acceptance handoff (Claude → Codex), 2026-08-02

Companion to [P2-08 smoke](P2-08-SMOKE-CODEX-HANDOFF.md) and
[P3-09 journey](P3-09-PHASE-3-JOURNEY-HANDOFF.md). Those two say *what* to test.
**This card says what is already done, what is left, and which of my own
measurements were wrong** so you do not re-chase them.

---

## 1. The goal, in one line

**Two phases are blocked on browser acceptance and nothing else.** Every
automated gate is green and independently re-derived. What is missing is human or
agent eyes on the authenticated workspaces. Close that and Phase 2 and Phase 3
both close.

Formally: P2-08's frontend smoke journeys and P3-09's consolidated journey gate.
Neither may be recorded as passed on automated evidence alone.

---

## 2. Verified 2026-08-02 by Claude — do not redo

### Automated gate, reproduced from scratch rather than trusted

Ran independently, not read off your summary. Every number matched:

```text
clean supabase db reset through all 58 migrations
DB lint         no schema errors
typecheck       clean
ESLint          0 errors 0 warnings
fast tests      131 (shared 62, api 29, web 40)
matrix          91/91 twice back to back, no reset
builds          API + web production, clean
git diff --check clean
```

### Role authorization over real HTTP — 37/37

Anonymous refused on `/bookings`, `/owner/shop`, `/notifications`,
`/owner/attention`, `/payments`, `/walk-ins`; anonymous discovery still open;
each role on its own surfaces; cross-role denial; forged JWT; owner without AAL2
on `/admin`.

Two contract details this surfaced, both worth knowing:

- `GET /no-show-appeals` defaults to `scope=mine`, which is **customer-only**. An
  owner must pass `?scope=shop` or they get a 403 that looks like a bug.
- `GET /payments` returns **200 for a customer** because it is scoped to their own
  appointments. A barber needs an active `shop_cashier_capabilities` row on top of
  employment, and is refused `403 capability_required` without it.

Also spot-checked the anonymous walk-in claim, the one route mounted before
`authenticate`: attempts increment on a `RETURN` rather than a `RAISE` so the
counter commits with the failure, the claim row is `FOR UPDATE` locked, and
attempts cap at five. Your durable-attempt repair is real.

### Public surfaces — landing, `/login`, `/signup`

Four viewports (1280×800, 390×844, 375×812, 320×800): horizontal overflow **0**
everywhere, **0 unlabelled** focusable controls everywhere, zero console errors.
Keyboard on `/login`: clean five-control cycle, visible focus on all five, no trap.

### Owner workspace — read-only pass, four viewports

`reachable/labelled`, all four viewports, overflow 0 and unlabelled 0 throughout:

| Surface | Controls | Disabled | Headings |
| --- | --- | --- | --- |
| overview | 6/6 | 0 | 7 |
| shop | 59/59 | 4 | 7 |
| staff | 16/16 | 6 | 1 |
| **barbers** | 3/3 | 0 | **0** |
| hiring | 9/9 | 2 | 4 |
| reservations | 8/8 | 0 | 1 |
| operations | 11/11 | 0 | 7 |
| chat | 5/5 | 0 | 1 |
| settings/account | 13/13 | 1 | 1 |

Shop Setup's 47 inputs all have a real accessible name under a strict check — no
placeholder-only labels. The drawer meets the dialog contract: scroll lock
engages, `main.page` and `.brand` both go `inert`, initial focus lands on the
close button, Escape closes, and all three revert on close.

---

## 3. The one real finding

**`/dashboard/owner/barbers` has zero headings.** No `h1`, `h2` or `h3` at any
viewport, while every sibling surface has between 1 and 7. It renders a full
barber card — name, shift state, rating, weekday strip, four stat blocks — so
there is real content with no structure over it and no landmark for a screen
reader. Not a layout bug; an accessibility gap. Fix belongs to the frontend lane.

---

## 4. Four false alarms I raised and disproved — do not re-chase

Each of these looked like a defect and was my measurement, not the app:

1. **`../shop` showing 4 controls at 320px.** A 1.3 s settle was too short. With
   3.5 s it is 63 controls, overflow 0. **Wait longer than you think on Shop Setup.**
2. **25 elements "bleeding" past the right edge on `/settings/account`, 9 on
   reservations.** All inside legitimate horizontal scrollers (`owner-table-scroll`
   and one unclassed scroller). **0 truly clipped.** Test for a scrollable
   ancestor before calling a bleed a defect.
3. **Two "unnamed" textboxes in the accessibility tree.** `read_page` prints input
   *values*, not labels, so empty fields look nameless. Both are properly labelled.
4. **Drawer apparently missing scroll lock, inertness and focus.** I checked
   `body > *` for `inert` when the targets are nested (`main.page`, `.brand`), and
   used the wrong panel selector. All three work.

**One environment trap behind several of those:** `requestAnimationFrame` does not
fire while the browser pane is not compositing. Anything rAF-gated — including
`AppMenu`'s initial focus — will appear broken in a hidden pane and be fine in a
real browser. Do not report rAF-gated behaviour from a hidden pane.

---

## 5. What is left

### Owner — mutations not exercised

The read-only pass above covers layout, labelling and keyboard. It does **not**
exercise: saving shop details, hours, closures, services, publish/unpublish,
provider capability and qualification changes, or hiring transitions. Snapshot
state first and restore after; trap 6 in the P2-08 card (leave no published shop
behind) still applies.

### Barber and customer — nothing done

Both workspaces are untouched by this pass. Barber: read-only schedule, shift
change request, own bookings, attendance. Customer: discovery, shop detail,
booking creation, own bookings, chat. Plus every Phase 3 surface for each role.

### Reduced motion — still open, and still nobody's confirmed it

The browser tools available to Claude expose **no media emulation**, so I could
only report that `prefers-reduced-motion` does not currently match. This is the
same caveat P2-06 has carried since 2026-07-30. You have claimed to have emulated
it; I could not verify that independently. Someone should close it for real, e.g.
by toggling the OS setting and then measuring animation/transition durations.

### Why the authenticated half is not mine

Signing in means typing a real account password into a form, which the Claude
agent must not do, and installing a session token directly is the same rule. The
product owner opened an owner session by hand for the pass above; that is the only
route. Not a preference, and not something more permission would change.

---

## 6. Do this first, before any clicking

**Phase 3 is entirely uncommitted.** 50 dirty files including five new
migrations, and your own log says no commit or push was made. That is a whole
phase of work with nothing under it but five unpushed commits. Commit it before
anyone runs a `db reset` or a `git checkout` near this tree.

When committing across lanes, commit **by path**, not with `git add -A`. I made
exactly that mistake earlier today and swept your D-033/034/035 changes into a
commit describing my own work; it had to be split back apart. `SESSION-LOG.md`
takes appends from both lanes and cannot be split by path, so expect one shared
file per batch and say so in the message.

---

## 7. Acceptance

```bash
npm run typecheck && npm run lint && npm run test && npm run build && git diff --check
```

Plus, if anything under `apps/api` or `supabase` changed:

```bash
RUN_LOCAL_SUPABASE_TESTS=1 npx vitest run
```

twice back to back with no reset, from `apps/api`.

Then update `docs/testing/PHASE-2-TESTS.md` (`#p2-08`),
`docs/testing/P3-09-MANUAL-BROWSER-CHECKLIST.md`,
`docs/plans/ROADMAP-STATUS.md`, `docs/memory/CURRENT-STATE.md`,
`docs/memory/SESSION-LOG.md`, and `docs/plans/LANE-COORDINATION-LOG.md`.

**Record what was actually observed.** A surface nobody looked at is
"unobserved", not "passing", and an agent pass is preliminary evidence awaiting
product-owner confirmation — that is how P2-06 was handled and the bar has not
moved. Ask before pushing.
