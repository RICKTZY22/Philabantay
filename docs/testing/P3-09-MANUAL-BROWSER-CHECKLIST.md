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
