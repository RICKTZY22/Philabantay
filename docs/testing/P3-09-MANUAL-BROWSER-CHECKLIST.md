# P3-09 product-owner browser checklist

Use normal UI actions only. Do not edit SQL. Record pass/fail, viewport, console
result, and any screenshot for each journey. A failed journey is a bug report,
not permission to repair database state by hand.

## Start the local stack and accounts

```powershell
npx supabase start
npm run seed:accounts --workspace @barbershop/api
npm run dev --workspace @barbershop/api
npm run dev --workspace @barbershop/web -- --host localhost
```

Open `http://localhost:5174`. Do not substitute another port: authenticated
CORS is allowlisted for 5174. Use `localhost`, not `127.0.0.1`, because the Vite
server may bind only to `[::1]`. The API must be reachable on port 4000.

Seeded users:

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@phila.test` | the `SEED_PASSWORD` value in the gitignored `apps/api/.env` |
| Barber | `barber@phila.test` | same seed password |
| Customer | `customer@phila.test` | same seed password |

Never paste the password into a tracked document or screenshot. After seeding,
the owner has a draft `Philabantay · Dev Shop`, Mon-Sat operating hours, two
active services, and an actively employed/qualified barber. Verify those facts
in Shop Setup and publish when a journey needs public booking. Unpublish it at
the end; leaving a
published dev shop behind breaks later matrix assertions.

## Evidence standard on every role

Repeat the relevant owner, barber, and customer surfaces at these measured
viewports: `1280x800`, `390x844`, `375x812`, and `320x800`.

- Record `visible / keyboard-reachable / disabled / unreachable / unlabelled`
  control counts, in the same style as the previous owner `47 / 39` evidence.
- Tab through every enabled control; verify visible focus, logical order,
  Enter/Space operation, modal focus containment/return, and no keyboard trap.
- At 200% zoom, verify no horizontal page overflow and no clipped required
  action, status, error, or dialog control.
- Use real DevTools media emulation for
  `prefers-reduced-motion: reduce`; confirm transitions/scrolling settle without
  essential information disappearing.
- Keep the console open. Required result: zero console errors during success,
  refusal, refresh, logout, and stale-session recovery.
- Keep a second tab open for stale-state checks. After one tab changes a record,
  the stale action in the other must refuse cleanly, reload authoritative state,
  and never duplicate the command.

## Visible journeys

### Customer booking and owner decision

- Customer opens a published shop, chooses service, exact/preferred/any intent,
  date and a real offered slot, reviews quote/policy facts, and submits once.
- Double-click/reload/retry does not create a second appointment.
- In manual mode, owner Reservations shows the request and assignment facts;
  owner accepts or declines with a reason. In instant mode, no temporary
  Requested state is exposed.
- Exact choice does not offer silent owner reassignment. Preferred/any may show
  the audited assignment action.

### Change, reschedule, cancel, delay, and disruption

- Owner proposes a provider, service, or future-time change. Customer sees the
  original and proposed facts, then rejects once and accepts a fresh proposal.
  Rejection keeps the original unchanged; acceptance updates only after consent.
- Customer reschedules using live offered availability and cancels once outside
  and once inside the displayed cutoff. Confirm the frozen shop timezone,
  cutoff, and late-policy result remain visible.
- Barber reports a delay; customer sees it in the appointment and timeline.
- Owner creates a shop closure that affects a future booking. Confirm the
  booking is not silently moved/cancelled and an attention item with suggested
  alternatives appears.

### Check-in, service, confirmation, and dispute

- Assigned barber issues a check-in code. Customer enters it once; replay must
  refuse. Owner manual check-in is a labelled fallback.
- Barber starts then finishes the service. Customer confirms completion on one
  visit; on another, customer disputes and owner resolves with a reason.
- Every state change appears once in the timeline and only role-allowed actions
  remain visible.

### No-show and appeal

- Before the displayed grace boundary, no-show action is absent or refuses.
  After grace, assigned barber or owner records the no-show with a reason.
- Customer files an appeal within the shown deadline. Owner upholds one appeal
  and waives another; customer sees the final decision and strike effect.

### Walk-in and public claim

- Owner/barber adds a guest walk-in with service/provider. Open the generated
  public claim link signed out on a mobile viewport, enter the short code and
  phone, and confirm the code cannot be reused.
- Exercise owner manual fallback, call/check-in/start/complete, and ensure queue
  order/state remain legible at 320 px.
- Sign in as a customer whose verified phone matches the claim before using
  Link to account. A non-matching account must refuse without exposing staff
  notes or creator identity.

### Offline payment, notifications, and closeout

- Grant/revoke the narrow cashier capability and confirm an unauthorized barber
  cannot record collection.
- Record a cash collection, then a separate correction, refund, and void where
  applicable. Visit status must not change merely because payment changed.
- Check each role's operational inbox, mark an item read, refresh, and confirm
  the read state persists.
- Owner runs shop/date closeout twice. The second run returns the same closeout;
  unresolved visits or payment mismatches remain unchanged and appear as
  attention items.

## Automated-only boundaries already proven

Do not wait or manipulate timestamps for these: simultaneous booking claims,
15-minute request expiry, completion timeout, exact grace instants, three
no-shows inside a rolling 90-day window, notification-provider failure/backoff,
durable failed guest-code attempts, and closeout replay races. The 91-test live
matrix covers them. Browser acceptance only needs to confirm the UI explains
the resulting state and recovery honestly.

## Cleanup and result

- Resolve/cancel temporary appointments and walk-ins where the UI allows.
- Unpublish `Philabantay · Dev Shop`.
- Sign out every role and confirm protected deep links return to authentication
  without stale private content flashing.
- Report each failure with role, route, viewport, exact action, visible message,
  console output, and screenshot. Phase 3 is accepted only after this checklist
  is recorded as passing or each failure is fixed and retested.

## Execution record — 2026-08-05 (partial; Phase 3 remains open)

Codex executed the browser handoff against the real local stack at
`http://localhost:5174` with the API on port 4000 and local Supabase running.
This run found and fixed two frontend defects, then re-ran the affected
viewports. It does **not** close P3-09 because the skipped journeys below still
need a visible browser result.

### Responsive and cross-cutting evidence

Counts are `enabled/visible`; the difference is disabled controls. Every listed
row finished with zero unlabelled controls. The final repaired rows also had
zero clipped controls and zero document horizontal overflow.

| Surface | 1280×800 | 390×844 | 375×812 | 320×800 |
| --- | ---: | ---: | ---: | ---: |
| Barber home | 37/37 | 37/37 | 37/37 | 37/37 |
| Barber chair | 7/7 | 7/7 | 7/7 | 7/7 |
| Barber schedule | 41/42 | 41/42 | 41/42 | 41/42 |
| Barber chat inbox | 4/4 | 4/4 | 4/4 | 4/4 |
| Barber settings | 13/14 | 13/14 | 13/14 | 13/14 |
| Customer discovery | 57/57 | 57/57 | 57/57 | 57/57 |
| Customer appointments | 37/37 | 37/37 | 37/37 | 37/37 |
| Customer chat inbox | 3/3 | 3/3 | 3/3 | 3/3 |
| Customer settings | 13/14 | 13/14 | 13/14 | 13/14 |
| Customer shop-detail dialog | 65/65 | 65/65 | 65/65 | 65/65 |

- `/dashboard/owner/barbers` had no heading. It now exposes the H1
  `Barber performance`; all four viewports measured 3/3 controls, zero
  unlabelled/clipped controls, zero overflow, and zero console errors.
- Barber home/schedule initially overflowed at 320 px because the 4:3 calendar
  cells imposed a 45 px intrinsic column width. The repaired calendar and
  request form re-measured at zero overflow/clipping on all four viewports.
- Real DevTools media emulation made
  `matchMedia('(prefers-reduced-motion: reduce)').matches === true`; computed
  transition and animation durations settled at `0.00001s` on the owner
  workspace without hiding information. This closes the carried P2-06
  structural-only reduced-motion caveat.
- The visible owner Staff and barber Schedule workflow review showed labelled
  capability/qualification controls, a read-only six-day barber roster,
  attendance, and a structured request/owner-decision path. This closes the
  carried P2-06 visible-workflow review item.
- A 200%-equivalent CDP reflow check (`640×400`, DPR 2) on Owner Shop Setup
  measured 59/64 controls with zero overflow, clipping, or unlabelled controls.
- The owner menu showed a 4 px visible focus outline. The browser-control layer
  did not advance focus when sending Tab, so exhaustive enabled-control
  traversal, Enter/Space operation, and modal wrap/return are explicitly
  **skipped**, not passed.
- Successful owner, barber, and customer legs recorded zero console errors.
  The dev processes exited once during cleanup; that connection-refused event
  was excluded from product evidence, both processes were restarted on the
  required ports, cleanup was repeated, and the fresh owner console was empty.
- Final deterministic gate passed on the browser-fix tree: all-workspace
  typecheck, zero-warning ESLint, 131 fast tests (62 shared, 29 API, 40 web),
  production build, and `git diff --check`. The API/RLS matrix was deliberately
  not rerun because no API, migration, or Supabase file changed.
- A stale owner tab attempted to save Shop Setup after another tab advanced the
  version. It displayed `Nabago ang shop mula sa ibang session. Ni-reload namin
  ang pinakabagong bersyon.`, reloaded the authoritative description, and did
  not apply the stale phone edit.
- After final sign-out, a protected owner deep link rendered only
  `Sandali, binubuksan ang page...` before resolving to `/login`; no owner or
  other role content flashed. This closes the carried LR-033 no-flash item.

### Journey evidence completed

- Owner readiness refused publication after both Bruno qualifications were
  removed; restoring both qualifications restored readiness. Owner provider
  capability/accepting state was enabled and restored to off. Hiring moved
  Off → Hiring → Full → Off. Details and service price edits saved and were
  restored. Publish/unpublish passed.
- Barber Schedule exposed the roster as read-only, submitted one Time off
  request, and showed attendance. Owner Staff displayed exactly one pending
  request and declined it; Barber then showed the Declined result.
- Customer discovery showed the published dev shop. The customer chose the
  default `any` intent, a real offered 9:00 AM slot, reviewed the service,
  price, manual-approval expiry, cancellation cutoff, and timezone policy, and
  submitted one request. Owner Reservations showed the audited automatic Bruno
  assignment and accepted it; Barber home/chair then showed the booking.
- Owner proposed a service change. Customer rejected it once and the original
  Classic cut/₱280 facts remained. Owner sent a fresh proposal; customer
  accepted it and the booking changed to Skin fade + beard/₱380 only after
  consent.
- Barber reported a 15-minute delay; Customer appointment details displayed the
  latest delay and timeline event. Customer rescheduled through live offered
  availability from 9:00 AM to 10:00 AM, saw the manual-mode Requested state,
  then cancelled the temporary booking outside the cutoff.
- Barber issued a six-digit check-in code and Owner exposed a labelled Manual
  check-in fallback. The fallback correctly refused before the allowed window
  with `Customer check-in is outside the allowed time window.` No timestamps
  were manipulated.
- Customer entered the shop conversation through `Chat shop`; the thread had a
  labelled message field and disabled Send action, and the removed automatic
  reply chips did not reappear. No persistent smoke message was added.

### Explicit skips and remaining gate

- Native Shop Setup date/time mutation could not be committed through this
  browser-control layer: Chromium visually accepted the value but React did not
  receive the native change event. Operating-hours change/restore and closure
  add/remove are skipped here, not reported as backend defects.
- Duplicate-create retry/double-click, exact and preferred assignment intent,
  instant mode, inside-cutoff cancellation, closure disruption, customer code
  entry/replay, start/finish/confirm/dispute, no-show/appeal, walk-in public
  claim/link, cashier/payment corrections, all-role inbox persistence, and
  closeout replay were not executed. Exact time-boundary behavior remains in
  the already-green 91-case matrix; the visible states still need browser work.
- The shop-detail slot picker is a real Phase 3 feature now and worked for this
  booking. No out-of-scope P2 backfill was made.

Cleanup is authoritative: the shop is draft, description and phone are blank,
Mon–Sat hours are 09:00–18:00, prices are ₱280/₱380, there are zero closures,
hiring and owner-provider capability are off, Bruno retains both
qualifications, the temporary appointment is cancelled, the shift request is
declined, and all roles are signed out. The cancelled appointment and declined
request remain as immutable history.
