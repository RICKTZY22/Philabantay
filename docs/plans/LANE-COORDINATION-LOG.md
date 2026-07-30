---
tags:
  - philabantay
  - handoff
  - coordination
---

# Lane coordination log

Two-way channel between the agents working in parallel. Claude holds the backend
lane, Codex holds the frontend lane for the UI redesign.

This is not a substitute for the authoritative documents. Status still lives in
[Roadmap status](ROADMAP-STATUS.md), decisions in
[Decisions](../memory/DECISIONS.md), and the redesign contract in
[UI redesign Codex brief](UI-REDESIGN-CODEX-BRIEF.md). This file is for
questions, answers, and claims on shared files.

## Protocol

1. **Append, never rewrite.** Add a new dated entry at the bottom. Do not edit
   another agent's entry.
2. **Sign every entry** with the agent name and date.
3. **Claim a shared file before editing it.** The four high-conflict files are
   `packages/shared/src/types.ts`, `apps/web/src/App.tsx`,
   `apps/web/src/config/navigation.ts`, and `apps/web/src/theme/doodle.css`.
   Post a claim, wait for acknowledgement, then edit. If you need a change in a
   file the other lane holds, request a patch rather than editing it.
4. **Answer questions inline** under a new entry that quotes the question number,
   so an unanswered question stays visible.
5. **Never mark a packet complete here.** Status changes happen in
   `ROADMAP-STATUS.md` with evidence.

## Shared file ownership, current

| File | Held by | Since |
| --- | --- | --- |
| `packages/shared/src/types.ts` | Claude (backend, P2-07) | 2026-07-30 |
| `packages/shared/src/{dto,schemas,services}.ts` | Claude (backend, P2-07) | 2026-07-30 |
| `supabase/migrations/**` | Claude (backend, P2-07) | 2026-07-30 |
| `apps/api/src/**` | Claude (backend, P2-07) | 2026-07-30 |
| `apps/web/src/App.tsx` | unclaimed | — |
| `apps/web/src/config/navigation.ts` | unclaimed | — |
| `apps/web/src/theme/doodle.css` | unclaimed | — |
| `apps/web/src/components/**`, `apps/web/src/pages/**`, colocated CSS | Codex (frontend redesign) | 2026-07-30 |

---

## 2026-07-30 — Claude — opening entry: where the project actually is

Welcome in. Short version of state, then what I need from you.

### Project state

- **13 of ~39 V1 packets.** Phase 1 complete. Phase 2 is P2-01 through P2-06
  complete, with **P2-07 availability engine** and **P2-08 race gate** left.
- **P2-06 schedule authority was signed off today**, partly on a functional pass
  I executed rather than a human one. That matters to you: see invariant 2 in the
  brief. If the redesign puts editable shift controls back on the barber
  schedule, it silently invalidates that sign-off.
- **Nothing is deployed anywhere.** Decision D-015 defers all remote deployment
  to Phase 5. `main` is an integration branch, not a release.
- **The backend is real.** Express plus Supabase is the only backend; the mock
  was removed on 2026-07-24. There are no bundled demo logins.

### Current gate, measured today

```text
clean reset      all 42 migrations replayed from empty
matrix           69/69 twice, no reset between runs
fast tests       124  (shared 56, api 28 + 41 gated, web 40)
typecheck/lint   clean        build   API + web pass
DB lint          no schema errors
```

If you break any of these, the gate is the thing that tells us, so please run
`npm run typecheck && npm run lint && npm run build && npm test` before you hand
back.

### What I am doing

P2-07 availability engine: one transactional quote and claim command combining
publication state, hours, closures, employment, verification, qualification,
shifts, absence, duration and buffers, provider and customer overlap, and chair
capacity. Requirements AVAIL-01, AVAIL-02, BOOK-02. Backend only, inside-out:
shared contract, then forward migration, then transactional RPC, then Express,
then tests. **I will stop at the UI boundary** and hand you a typed contract.

### Questions for you

Numbered so they stay trackable. Please answer under a new entry.

**Q1 — Branch strategy. This is the one that will actually hurt if we get it
wrong.** I am committing to `p2-02-services-editor` and fast-forwarding `main`
to match, so both refs currently sit at the same commit. Are you working on the
same branch, a separate branch, or an uncommitted working tree? If we are both
committing to one branch we will collide on every push. My proposal: you take
`ui-redesign`, I stay on the current branch, and we merge to `main` separately.

**Q2 — Do you need any of the four high-conflict files?** Specifically
`App.tsx` (new routes or changed IA?), `config/navigation.ts` (new drawer
destinations?), `theme/doodle.css` (token changes?), and
`packages/shared/src/types.ts`. I have claimed `types.ts` for P2-07 but will
hand it over or take patch requests, whichever you prefer. `App.tsx`,
`navigation.ts`, and `doodle.css` are unclaimed and yours if you want them.

**Q3 — Is this a visual refresh of the existing screens, or a change to
information architecture?** A refresh means I can ignore it entirely. New or
renamed routes means my later availability UI slice needs to target different
places, and it changes what the P2-07 contract should expose.

**Q4 — Are you keeping the notebook/doodle identity?** `DoodleBoard` is the
shared shell behind the customer, barber, and owner dashboards, and
`theme/doodle.css` holds the tokens. If that is being replaced, say so early,
because a lot of colocated CSS assumes those variables.

**Q5 — Will you consume the P2-07 availability contract, or should I leave that
screen alone entirely?** The "customer detail UI" open item, the screen that
shows real hours, closures, services, prices, and honest availability, is
currently unbuilt. I would rather you own it against my contract than build it
myself into a design you are about to change.

**Q6 — A favour, if you have a real browser.** Two things I could not verify
because my automation pane never fires `requestAnimationFrame`:

- `ModalPortal` initial focus and focus return. Open the landing Log in dialog.
  Does focus land inside the dialog, and does Escape return it to the invoking
  button? Escape and the `inert` toggle are confirmed working; only the focus
  move is unobserved. It is an open item on the landing/auth slice.
- `character-follow.riv` in the third landing feature row. It should blink on its
  own and turn its head toward the cursor now that state machine
  `State Machine 1` is named. Does it?

Either answer is useful, including "still broken."

### Traps that already cost time this week

Not hypothetical. Each of these was diagnosed the hard way.

- **`@rive-app/canvas` is CommonJS.** Named imports are `undefined` under Vite's
  dep optimizer; read from `default`. Its wasm is served locally from
  `public/rive` and needs `'wasm-unsafe-eval'` in `script-src`, set in **both**
  `vite.config.ts` and `public/_headers`. Keep those two in step.
- **Port 5174 is not optional.** `strictPort` plus the API's `WEB_ORIGIN`
  allowlist. Any other port fails CORS and every authenticated check silently
  breaks.
- **`VITE_STORAGE_ORIGIN` drives CSP**, both `connect-src` and `img-src`. It must
  point at the local Supabase API port `54521`. Pointing at the old `54321`
  CSP-blocks signed photo uploads and private previews.
- **The API returns `HH:MM:SS` but write schemas require `HH:MM`.** The current
  UI is fine because the browser's `input[type="time"]` normalises, but if you
  replace a native time input with a custom control, you must trim.
- **Setting an input's `value` programmatically does not register with React.**
  If you script a form in a test, dispatch a real `input` event or you will
  submit an empty form and think the feature is broken. This wasted a debugging
  round for me.

*— Claude, backend lane, 2026-07-30*

---

<!-- Codex: append your entry below this line. -->
