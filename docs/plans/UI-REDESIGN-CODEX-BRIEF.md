---
tags:
  - philabantay
  - handoff
  - ui-redesign
---

# UI redesign brief — Codex frontend lane — 2026-07-30

The product owner is running a UI redesign with Codex in the frontend lane while
the backend lane continues on P2-07. This brief is the contract-first handshake
required by [Agent handoff §3](AGENT-HANDOFF.md), written before either lane
touches shared files.

Read [the standard frontend prompt](AGENT-HANDOFF.md#6-frontend-prompt-for-claude)
first. Everything below is additional and specific to the current state of the
repository.

## Scope owned

- **Lane:** frontend. Routes, pages, components, CSS, responsive and
  accessibility states.
- **Files in scope:** `apps/web/src/components/**`, `apps/web/src/pages/**`, all
  colocated CSS, `apps/web/src/theme/**`.
- **Explicitly out of scope:** `supabase/migrations/**`,
  `packages/shared/src/{types,dto,schemas,services}.ts`, `apps/api/src/**`, and
  the test suites. The backend lane owns those for P2-07.

## Shared files: nominate one editor

These are on the high-conflict list in [Agent handoff §4](AGENT-HANDOFF.md). If
the redesign needs one, say so before editing and the backend lane will send a
patch request instead of editing in parallel:

- `packages/shared/src/types.ts` — the one real collision risk this week
- `apps/web/src/App.tsx` — routes are declared only here
- `apps/web/src/config/navigation.ts`
- `apps/web/src/theme/doodle.css` — global tokens

## Invariants the redesign must not regress

These are not style preferences. Each one is either a signed-off packet gate or a
deliberate correction that cost real debugging time to establish.

### 1. No invented data, ever

Every customer-facing fact comes from `DataBackend`. On 2026-07-28 the project
deleted hardcoded price bands, service maps, and wait estimates from
`CustomerDashboard`, and deleted the shop-profile page that carried fake
queue/hours/gallery/specialty data. Do not reintroduce placeholder operational
data, even as a visual stand-in. If a contract method, error, or action you need
does not exist, **stop that path and report the exact missing contract**.

Queue positions and wait estimates stay hidden until Phase 3 has real walk-in
data. There is no honest source for them today.

### 2. The barber schedule is read-only

P2-06 was signed off on this. `/schedule` must render **zero** editable shift
controls. The barber views the authoritative roster and submits structured
time-off or different-hours requests; only the owner writes. Verified 2026-07-30:
`/schedule` rendered 0 `input[type="time"]`, and a barber token on
`PUT /owner/staff/:id/shifts` returns `403`.

### 3. Keyboard and labelling are part of the feature

[Code patterns](../systemarch/CODE-PATTERNS.md) states this outright:
"Keyboard and reduced-motion behavior are part of the feature, not cleanup."
The current measured baseline on the P2-06 surfaces, which the redesign must
hold or improve:

| Surface | Visible interactive | Keyboard reachable | Unreachable | Unlabelled |
| --- | --- | --- | --- | --- |
| `/dashboard/owner/staff` | 47 | 39 (8 disabled) | 0 | 0 |
| `/schedule` | 41 | 40 (1 disabled) | 0 | 0 |

Also required: no interactive element nested inside another, icon-only buttons
carry an accessible label, and ARIA state stays synchronized with visual state.

### 4. Reduced motion

`BarberShiftCalendar.css` and `DashboardPage.css` currently declare **zero**
transitions or animations, so there is nothing to suppress. If the redesign adds
motion to either, it must add a `prefers-reduced-motion: reduce` guard in the
same commit. `OwnerStaffPanel.css` already carries a blanket guard; keep it.

### 5. Dialogs go through `ModalPortal`

Do not hand-roll an overlay. `ModalPortal` supplies the portal to
`document.body`, focus trap, Escape and backdrop close, scroll lock, background
`inert`, and focus restoration. Note a real constraint: it moves initial focus
inside a `requestAnimationFrame`, which is **unverified rather than broken** and
is an open item on the landing/auth slice. If you can confirm initial focus and
focus return with a real keyboard, please record it.

Never place a fixed overlay inside a transformed ancestor; the transform becomes
its containing block.

### 6. Publication is self-service

Decision **D-019** (2026-07-30) reversed Q4. A verified owner publishes directly
once the readiness checklist passes. Do **not** build an admin shop-review queue
or a "pending review" state into the UI. `pending_review` still exists in the
enum and in shared types deliberately, so the gate is cheap to enable later with
the Phase 4 staff admin console, but nothing sets it today.

### 7. Appointment status has one presentation helper

`apps/web/src/lib/appointmentStatus.ts` owns the label and class for every
canonical state. Do not reintroduce a local `STATUS_CLASS` map in a component;
that duplication was removed on purpose.

### 8. The lower landing is one continuous notebook page

`.phil-notebook` in `LandingPage.css` paints white ruled paper with a red margin
rule once, and the How-it-works chapters and feature rows are transparent so the
single sheet reads through them. Two details that will look like bugs if you
"fix" them:

- The hero's right-hand grid track is **intentionally empty**. The scene art
  paints through the transparent section, and filling that track would cover the
  right-side barbershop in the artwork.
- `character-follow.riv` has a near-white card baked into its artboard. It is
  left alone because the notebook page is white, so it reads as a frame. Its
  motion requires naming state machine `State Machine 1`; without that the figure
  loads and sits still.

`.phil-notebook` uses `overflow: clip` rather than `hidden` on purpose, so that
`position: sticky` still works for anything placed inside it.

## Environment

- Web dev server must stay on **port 5174**. `vite.config.ts` uses `strictPort`
  and the API's `WEB_ORIGIN` allowlist trusts only that port, so any other port
  fails CORS. Recorded as **D-018**.
- `VITE_STORAGE_ORIGIN` feeds `connect-src` and `img-src` in the dev and
  production CSP. Point it at the local Supabase API port (`54321`), or signed
  shop-photo uploads and private previews are CSP-blocked.
- Local accounts: `owner@phila.test`, `barber@phila.test`,
  `customer@phila.test`. The password is pinned via `SEED_PASSWORD` in the
  gitignored `apps/api/.env`, so `npm run seed:accounts -w @barbershop/api` no
  longer rotates it.
- Current fixtures, kept deliberately: the dev shop is **published** with
  08:00-21:00 Mon-Sat hours, a customer booking sits on `2026-08-05` 10:00
  Manila, and a pending `different_hours` request sits on `2026-08-10`. These
  keep the P4025 conflict guard reproducible; please do not clear them.

## Definition of done for this redesign

Per [Code patterns](../systemarch/CODE-PATTERNS.md):

- no page imports `services/mock`;
- no business rule duplicated across UI files;
- loading, empty, validation, forbidden, stale, offline, busy, and success states
  all covered;
- mouse, keyboard, narrow viewport, and reduced motion all checked;
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`
  pass;
- no horizontal overflow from 320 px upward.

## Handoff report expected

Use the format in [Agent handoff §8](AGENT-HANDOFF.md): requirements addressed,
changed files, routes and components changed, contract assumptions, browser
widths tested, accessibility checks, exact command output, and remaining
blockers. "Works on my screen" is not evidence.

Do not mark any packet complete. The redesign is a polish slice, not a packet,
and it does not change packet status.
