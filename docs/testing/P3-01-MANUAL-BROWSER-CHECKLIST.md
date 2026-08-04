# P3-01 product-owner browser checklist

Status: not run by Codex; product-owner execution pending
Technical gate: green 2026-08-02

## Setup

1. Local Supabase must be running on the configured `5432x` ports.
2. API must run on port `4000`.
3. Open the web app as `http://localhost:5174` (not `127.0.0.1`, because Vite
   binds `[::1]` on this machine).
4. Seed accounts if the clean reset removed them:
   `npm run seed:accounts -w @barbershop/api`.
5. Use `owner@phila.test`, `barber@phila.test`, and `customer@phila.test`.
   The password comes from the gitignored `SEED_PASSWORD`/seed output and must
   not be copied into this document.
6. Publish the dev shop only for this test, then return it to draft afterward.

Record every scenario at 1280x800, 390x844, 375x812, and 320x800. At each size,
note horizontal overflow, clipped controls, unreachable controls, unlabelled
controls, and console errors.

## Customer booking journey

1. Sign in as the customer and open a published shop from Discover.
2. Confirm the booking area retains the selected shop and shows real services,
   durations, and prices.
3. Test `Any available barber`:
   choose a date, load times, select a slot, add an optional note, and review.
   Verify the review shows service, time, manual/instant behavior, cleanup buffer
   when non-zero, and the two-hour cancellation cutoff.
4. Submit once. In manual mode, verify the result says the request was sent and
   the appointment appears as `Requested` with an expiry/deadline.
5. Repeat with `Prefer a barber; allow replacement`. If the preferred barber is
   unavailable and another is free, verify the replacement is disclosed before
   submit and the eventual assignment reason remains visible.
6. Repeat with `Only this barber`. A taken exact slot must fail instead of
   silently assigning somebody else.
7. While the review is open, make the slot unavailable from another session,
   then submit. Verify the stale quote fails clearly and the customer can refresh
   available times; no duplicate booking should appear.
8. Rapidly click the final action. It must disable while saving and produce one
   appointment only. Reload after success and confirm the same appointment is
   still shown.

## Owner request and assignment journey

1. Sign in as the owner and open Reservations.
2. Confirm the manual request shows customer, actual provider, customer choice
   (`exact`, `preferred`, or `any`), service snapshot, note, time, and status.
3. Accept one request and verify it becomes `Confirmed` without a stale duplicate.
4. Decline another request. Enter a real reason and verify the reason is required
   and the row becomes `Declined`.
5. For `preferred` or `any`, open Assign/reassign, choose a different active
   barber, provide a reason, and save. Verify the actual provider and assignment
   reason update.
6. For `exact`, verify Assign/reassign is absent and the UI says customer
   approval is required. This is the P3-02 consent boundary.
7. Open the same request in two owner tabs. Act in the first, then act in the
   stale tab. The stale action must fail clearly and must not overwrite the first.

## Instant mode

1. In Shop Setup change booking mode to Instant and save.
2. As the customer, repeat an `Any available barber` booking.
3. Verify the review says `Instant confirmation`; submitting creates a single
   `Confirmed` appointment with no 15-minute requested state exposed.
4. Switch the shop back to Manual after the check.

The restricted-customer instant fallback is covered by the database matrix; its
strike-management UI belongs to P3-04 and cannot yet be prepared through normal
browser controls.

## Keyboard, motion, and stale session

1. Complete service, preference, barber, date, slot, notes, review, and submit
   using Tab/Shift+Tab, arrows for native selects, Space/Enter, and Escape.
2. Confirm focus remains inside the shop dialog, Escape closes it, and focus
   returns to the shop trigger.
3. Enable real `prefers-reduced-motion: reduce` media emulation and confirm the
   booking/assignment interactions remain usable with no meaningful motion.
4. Expire or invalidate a customer and owner session, then attempt a quote or
   decision. Verify the app returns to login through the neutral restore shell
   without flashing another role's workspace.
5. Record console errors for clean customer and owner journeys; expected result
   is zero.

## Cleanup

- Cancel/decline test appointments where possible.
- Return booking mode to `manual`.
- Return the dev shop to `draft`/unpublished.
- Leave no pending request, closure, or published shop behind.
