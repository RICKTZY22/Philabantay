# Philabantay Code Audit

**Date:** 2026-07-14
**Scope:** `apps/web` and `packages/shared`, audited as three independent passes: security, logic/correctness, and performance.
**Method:** Each pass read the actual source and every finding cites file and line. The two High correctness findings and S-7 were re-verified by hand before publishing. Note that the audit ran against the working tree while bug fixes were in progress, so line numbers are a snapshot and may drift a little as fixes land.

**How to use this file:** Findings are numbered (S = security, L = logic, P = performance) so you can reference them in commits, e.g. `fix: guard signUp mutation across hash await (L-1)`. There is a prioritized checklist at the bottom.

---

## Executive summary

The codebase is in genuinely good shape for a Phase 1 mock-backed app. XSS hygiene is excellent (zero HTML injection sinks, Leaflet labels built with `textContent`), ownership checks exist on every mutating endpoint, password handling is far more careful than a demo needs (PBKDF2 600k iterations, constant-time compare), and React effect cleanup is consistently correct.

The real risk clusters in two places:

1. **Cross-tab concurrency over localStorage.** The whole database is one JSON blob with read-modify-write and no locking. Two tabs can silently erase each other's writes, and `signUp` can corrupt an account permanently if a broadcast lands during the password hash. These are the only two High correctness findings and they share a root cause.
2. **Patterns that must not survive the Supabase swap.** All authorization lives in client code, the session is a bare user id, and one public endpoint leaks barbers' private day-off reasons at the contract level. Harmless today, real vulnerabilities in Phase 2. They are collected in the Phase 2 checklist at the end.

On performance, the single biggest cost is the hand-drawn `#rough` SVG filter applied to 80+ elements per list page. Everything else is modest at demo scale.

| Area | Critical | High | Medium | Low | Info | Total |
|---|---|---|---|---|---|---|
| Security | 0 | 1 | 2 | 5 | 3 | 11 |
| Logic / correctness | 0 | 2 | 3 | 6 | 0 | 11 |
| Performance | 0 | 1 | 4 | 6 | 0 | 11 |

---

## 1. Security

### S-1 [High] All authorization decisions execute in client-controlled code against client-writable state
- **File:** `apps/web/src/services/mock/MockBackend.ts:307`
- **Category:** authz | **Phase:** Phase 2 carryover
- **What:** Every guard in the app (`requireUser` at MockBackend.ts:307-312, role checks in `validateBookingInput` at :793, barber checks at :518/:695, and the route guard in `apps/web/src/components/RequireAuth.tsx:37`) runs in the browser and reads from the localStorage DB, which the user fully controls. `isStoredMockDB` (:198-216) only validates the container shape, not record contents.
- **Failure scenario:** A user edits `bsh_mock_db_v1` in devtools, sets their profile role to `barber` with `verification_status: 'verified'`, appends a matching barber record, reloads, and passes every check. Harmless today (they only corrupt their own browser), catastrophic if these checks are assumed to be the boundary in Phase 2.
- **Fix:** Accepted for the mock. For Phase 2, re-implement every check in Supabase RLS or an API layer and treat client-side versions strictly as UX. The comment at RequireAuth.tsx:36 already says this; hold the team to it.

### S-2 [Medium] Session is a bare user id with no secret or integrity
- **File:** `apps/web/src/services/mock/MockBackend.ts:298`
- **Category:** auth | **Phase:** Phase 2 carryover
- **What:** `getSessionId`/`setSession` (:298-306) persist just the profile id under sessionStorage key `bsh_session`, and `requireUser` (:307-312) trusts it as proof of identity. No token, signature, or expiry.
- **Failure scenario:** Anyone at the keyboard runs `sessionStorage.setItem('bsh_session', 'u-miguel')` and is signed in as Miguel with no password, bypassing the PBKDF2 work entirely.
- **Fix:** Fine for the demo. The Supabase adapter must use the SDK session (JWT with expiry) and never read or honor `bsh_session`; consider deleting the key in the Phase 2 adapter.

### S-3 [Medium] Public availability endpoint leaks barbers' private day-off reasons
- **File:** `apps/web/src/services/mock/MockBackend.ts:686`
- **Category:** data-exposure | **Phase:** Phase 2 carryover
- **What:** `availability.getOverrides(barberId)` requires no authentication and returns full `AvailabilityOverride` records including the free-text `reason` field (set from the barber dashboard, DashboardPage.tsx:186-189). The contract at `packages/shared/src/services.ts:64` bakes this public read into the Phase 2 interface. The UI only shows `reason` to the barber themself, so the exposure is contract-level.
- **Failure scenario:** A barber blocks a date with reason "medical appointment, chemo follow-up". Any visitor calls `backend.availability.getOverrides('u-miguel')` from the console and reads it. Ported to Supabase as-is, that becomes a real PII leak over the network.
- **Fix:** Split the shape: public reads return only date/is_available/hours; keep `reason` on a barber-only read (or strip it via select/RLS in Phase 2).

### S-4 [Low] Shallow stored-DB validation lets one malformed record wedge the whole app
- **File:** `apps/web/src/services/mock/MockBackend.ts:198`
- **Category:** storage | **Phase:** now
- **What:** `isStoredMockDB` (:198-216) checks only that top-level arrays and maps exist. `appointmentDetailed` (:326-338) and `conversationDetailed` (:347-349) then use non-null assertions (`db.services.find(...)!` etc.), so a single row referencing a missing service, profile, or shop throws a TypeError. `reloadFromStorage` (:257-267) adopts such data from any other tab via the BroadcastChannel handler (:281-295).
- **Failure scenario:** A stray devtools edit appends an appointment with `service_id: 'nope'`. Every subsequent `bookings.listMine()` or `chat.listConversations()` throws, and since the data persists, the app stays broken on every reload until localStorage is cleared. (No prototype pollution risk; JSON.parse creates own properties only.)
- **Fix:** Make the detail builders defensive (skip rows with dangling references) or deep-validate in `isStoredMockDB` and fall back to reseeding.

### S-5 [Low] Data layer accepts unvalidated email and duplicate/free-form phone at signup
- **File:** `apps/web/src/services/mock/MockBackend.ts:360`
- **Category:** validation | **Phase:** Phase 2 carryover
- **What:** `signUp` validates full name and password through shared validators (:366-369) but email gets only non-empty and length checks (:361-362) and phone only a 32-char cap (:363). No format check, and phone uniqueness is never enforced even though `signIn` supports phone as an identifier (:401-402). See L-10 for the concrete lockout this causes.
- **Fix:** Add email format and phone normalization plus uniqueness rules to `packages/shared/src/validation.ts` and enforce them in `signUp`, mirroring `validateFullName`.

### S-6 [Low] Sign-in timing oracle reveals whether an account exists
- **File:** `apps/web/src/services/mock/MockBackend.ts:406`
- **Category:** auth | **Phase:** Phase 2 carryover
- **What:** The check `!id || !email || !storedPassword || !(await verifyPassword(...))` short-circuits, so PBKDF2 (deliberately 100ms+) only runs when the identifier exists. Unknown accounts return the uniform error noticeably faster. `signUp` also returns a distinct `email_taken` error (:371).
- **Failure scenario:** Irrelevant locally, but if this control flow is copied into a Phase 2 API handler, an attacker measures response times to enumerate registered emails/phones, then credential-stuffs only real accounts.
- **Fix:** In the server implementation, run hash verification against a dummy verifier when the account is missing, and rate-limit sign-in.

### S-7 [Low] Barber can cancel an already-started appointment through setStatus, bypassing the cancel-time rule
- **File:** `apps/web/src/services/mock/MockBackend.ts:924` (verified by hand)
- **Category:** authz | **Phase:** now
- **What:** `bookings.cancel` enforces `canModifyAppointment` (:896-898), which forbids cancelling once the cut has started. But `setStatus` allows `confirmed -> cancelled` (:924-930) with the start-time check applied only to `completed` and `no_show` (:934-936). Two paths, two different rules for the same state change.
- **Failure scenario:** A confirmed appointment started an hour ago. The customer's cancel correctly fails, yet the barber can `setStatus(id, 'cancelled')` and erase what should have become a completed or no_show record (which feeds ratings and history). In Phase 2 this would let barbers scrub no-shows.
- **Fix:** In `setStatus`, apply `canModifyAppointment` (or an equivalent time gate) to the `cancelled` transition too, or route barber cancellations through `cancel()`.

### S-8 [Low] IDs generated with Math.random are predictable and low-entropy
- **File:** `apps/web/src/services/mock/MockBackend.ts:38`
- **Category:** other | **Phase:** now
- **What:** `uid()` builds every entity id from `Math.random().toString(36).slice(2, 10)`, roughly 41 bits from a non-cryptographic PRNG, with no collision check. Today nothing treats ids as secrets, but the helper looks reusable. The correctness audit also flagged the collision angle: a colliding message id would make the Thread dedupe guard (ChatPage.tsx:162) permanently suppress a real message.
- **Fix:** Use `crypto.randomUUID()` in `uid()` (the codebase already relies on `crypto` in passwords.ts); in Phase 2 let Postgres generate ids.

### S-9 [Info] Thirteen seeded accounts all accept the password demo1234, ten of them undocumented
- **File:** `apps/web/src/services/mock/seed.ts:38`
- **What:** Every entry in the seed passwords map (:204-218) reuses one `DEMO_PASSWORD_HASH`, so all seeded barbers and the owner sign in with `demo1234`. The login screen only advertises three (`DEMO_ACCOUNTS` :250-254).
- **Fix:** Keep for Phase 1. Make the Phase 2 seed generate per-account random passwords or create demo users only behind an explicit dev flag.

### S-10 [Info] Entire mock DB, including all users' password verifiers and phone numbers, is readable client-side
- **File:** `apps/web/src/services/mock/MockBackend.ts:34`
- **What:** The single `bsh_mock_db_v1` key holds every profile (with phone), message, appointment, and the email-to-PBKDF2-verifier map. Any user of the same browser profile can read data belonging to every other local account.
- **Fix:** No change needed for Phase 1. Preserve the fail-closed guard in `apps/web/src/services/backend.tsx:19-21` until a real adapter exists.

### S-11 [Info] Strict CSP and security headers exist only on the Vite dev/preview server
- **File:** `apps/web/vite.config.ts:54`
- **What:** A well-constructed CSP (:4-19) and companion headers (:21-28) are applied via Vite server config only. Static production hosting will serve the built files with none of them; index.html has no CSP meta fallback.
- **Failure scenario:** The team deploys `dist`, assumes the CSP from preview is live, and ships with no CSP right when a real backend and real user content arrive.
- **Fix:** Copy the production CSP string into the real host's header config (`_headers`, `vercel.json`, etc.) as part of the Phase 2 deployment checklist.

### Security: what already looks good
- Zero XSS sinks: no `dangerouslySetInnerHTML`/`innerHTML` anywhere; chat bodies (ChatPage.tsx:228) and notes (AppointmentsPage.tsx:164) render through React escaping; Leaflet tooltips built with `textContent` (ShopMap.tsx:118-125).
- `safeInternalPath` is a solid open-redirect guard (rejects `//`, backslashes, control chars, cross-origin; lib/security.ts:7-24) and is applied at every dynamic navigation entry (AuthSlider.tsx:29, :269-272; CurtainTransition.tsx:35). `routeSegment` encoding is used consistently.
- Privilege escalation is closed at the data layer: signup always creates role `customer` (MockBackend.ts:373-384), onboarding only records `requested_role` as `pending` (:438-446), `updateProfile` accepts one allowlisted field with a strict avatar regex (:456-459).
- Ownership and state checks on every mutating endpoint: reschedule (:864), cancel (:891), setStatus (:921), all chat methods, `rateAppointment` (:642-643); `getOpenSlots` (:761-767) and booking (:798-803) re-check barber verification in the data layer rather than trusting the UI.
- Credential handling: PBKDF2-SHA256 at 600k iterations, per-hash random salt, constant-time compare, automatic upgrade of legacy plaintext entries (passwords.ts; MockBackend.ts:269-279), input length caps (:397-399), seeds store verifiers not plaintext.
- Cross-user data consistently uses the `PublicProfile` allowlist (id, name, avatar only; MockBackend.ts:316-320), so phone numbers never cross the trust boundary; the backend switchboard fails closed if `VITE_DATA_BACKEND=supabase` is set before an adapter exists (backend.tsx:19-21).

---

## 2. Logic and correctness

### L-1 [High] signUp can corrupt the account record if the in-memory DB is swapped during the password hash await
- **File:** `apps/web/src/services/mock/MockBackend.ts:385-388` (verified by hand)
- **Category:** race-condition
- **What:** `signUp` mutates `db` across an `await` boundary: `db.profiles.push(profile)` (:385) runs, then `db.passwords[email] = await hashPassword(...)` (:386) suspends for a slow PBKDF2 (~100-500ms). The assignment target `db.passwords` is evaluated before the await, so it captures the old object. If a BroadcastChannel message arrives during the await, `channel.onmessage` (:282) calls `reloadFromStorage()`, which reassigns `db`. The pushed profile and hashed password land in the discarded old object, while `db.emailToId[email] = id` (:387) and `persist()` (:388) write to the new one.
- **Failure scenario:** App open in tab A (any activity that persists), user signs up in tab B. Tab A broadcasts during tab B's hash await. Persisted result: `emailToId` contains the new email with no matching profile and no password entry. The email is permanently unusable: sign-in fails and re-registration fails with `email_taken`. `setSession(id)` also points at a profile that no longer resolves, so `requireUser()` throws on every call in that tab.
- **Fix:** `await hashPassword()` first into a local variable, then do all `db` mutations plus `persist()` synchronously in one block (the booking code already uses this pattern). Or re-run `reloadFromStorage()` and the uniqueness check after the hash, then mutate.

### L-2 [High] Cross-tab read-modify-write over localStorage can silently drop a confirmed booking (or any other write)
- **File:** `apps/web/src/services/mock/MockBackend.ts:252-255, 835-855`
- **Category:** race-condition
- **What:** Every mutation is read-whole-DB, mutate, write-whole-DB (`persist()` :253) with no locking or merge. `bookings.create` (:835-855) does `reloadFromStorage()` then validates and persists, but two tabs can interleave: tab B's reload can run before tab A's persist lands.
- **Failure scenario:** Two tabs book the same barber slot within the ~240ms `delay()` window. Both validate against a snapshot lacking the other's appointment; tab A persists appointment A; tab B then persists its DB (loaded before A's write), overwriting storage without appointment A. Tab A's UI says "Booked", but the appointment vanishes on the next reload. The same clobbering applies to any pair of concurrent writes, including two signups with the same email both passing the uniqueness check.
- **Fix:** For the mock, re-run `reloadFromStorage()` plus the conflict check immediately before `persist()` in one synchronous block, and/or version-stamp the stored DB and retry on version mismatch. For Phase 2, enforce it server-side (exclusion constraint on `barber_id` + `tstzrange`).

### L-3 [Medium] BroadcastChannel 'message' handler delivers only the newest message, dropping earlier ones in rapid succession
- **File:** `apps/web/src/services/mock/MockBackend.ts:287-293`
- **Category:** race-condition
- **What:** On a `{type:'message'}` broadcast, the receiving tab reloads storage and delivers `db.messages.filter(...).at(-1)`, i.e. always the latest message in that conversation, not the message the broadcast was about.
- **Failure scenario:** Barber sends two quick replies back to back. The customer tab processes both broadcasts after both writes landed: both deliver message 2. The Thread dedupe guard (ChatPage.tsx:162) hides the duplicate, so message 1 never appears until the user reopens the conversation.
- **Fix:** Include the message id (or the full message) in the broadcast payload and deliver exactly that message, or deliver every message newer than the last-delivered id per conversation.

### L-4 [Medium] Several mutating endpoints skip reloadFromStorage before persisting, widening the clobber window
- **File:** `apps/web/src/services/mock/MockBackend.ts:515-523, 525-533, 585-597, 692-713, 715-743, 745-752`
- **Category:** data-integrity
- **What:** `setShiftStatus`, `setAcceptingBookings`, `favorites.toggle`, `setRules`, `addOverride`, and `removeOverride` mutate `db` and `persist()` without first reloading, unlike their siblings (`favorites.toggleBarber` at :609 reloads; `toggle` at :585 does not, an inconsistency inside the same service).
- **Failure scenario:** Customer books in tab A. Barber tab B (broadcast not yet processed, e.g. throttled background tab) toggles "accepting bookings". Tab B persists its stale DB and the customer's new appointment is erased.
- **Fix:** Call `reloadFromStorage()` at the top of every mutator, matching `bookings.*` and `toggleBarber`. Fix together with L-2.

### L-5 [Medium] Booking finally-block refetch races the date/service change effect; a refetch failure permanently sticks the Booking state
- **File:** `apps/web/src/pages/BarberDetailPage.tsx:131-137`
- **Category:** state
- **What:** `book()`'s finally block awaits `getOpenSlots` using the closure's captured `date`/`serviceId` and calls `setSlots(fresh)` with no staleness guard. The date chips and service select are not disabled while `booking` is true, and changing them triggers the slots effect for the new selection. If the finally-block fetch rejects, `setBooking(false)` and `setSelectedSlot(null)` are skipped and the rejection is unhandled.
- **Failure scenario:** User clicks "Confirm booking", then immediately clicks a different date chip. The new-date fetch resolves first (mock delays are randomized 80-240ms), then the old-date fetch overwrites `slots`. The page shows the old day's times under the new day's chip; picking one submits `starts_at` for a day the user did not select, and the backend accepts it. In the error sub-case, the button stays disabled on "Booking..." forever.
- **Fix:** Disable date/service controls while `booking` is true or track a request sequence number and ignore stale responses; wrap the refetch in try/catch so `setBooking(false)` always runs.

### L-6 [Low] Rating aggregates are recomputed from the rounded stored average, so they drift from the true mean
- **File:** `apps/web/src/services/mock/MockBackend.ts:55-70, 648-650`
- **Category:** data-integrity
- **What:** `updateAggregate` reconstructs the running total as `entity.rating * rating_count`, but `entity.rating` was rounded to 1 decimal on every previous write. Each create/edit reintroduces up to 0.05 error scaled by count, accumulating across writes.
- **Fix:** Store the raw sum, or keep full precision in `rating` and round only for display.

### L-7 [Low] Overlapping weekly rules produce duplicate slots and duplicate React keys
- **File:** `apps/web/src/services/mock/availability.ts:69-81`; `MockBackend.ts:697-699`
- **Category:** validation
- **What:** `setRules` never checks that same-weekday blocks do not overlap, and `computeOpenSlots` iterates blocks independently with no dedupe. Overlapping blocks emit the same `starts_at` twice; BarberDetailPage renders slots with `key={slot.starts_at}` (:244), so duplicates collide. API-reachable today (the dashboard UI only writes one block per day).
- **Fix:** Merge overlapping blocks in `effectiveBlocks` or dedupe emitted slots by `starts_at`; ideally reject overlapping same-weekday rules in `setRules`.

### L-8 [Low] Cancel from the booking modal has no error handling, so a failed cancel gives zero feedback
- **File:** `apps/web/src/pages/AppointmentsPage.tsx:61-65, 173`
- **Category:** state
- **What:** `cancel()` awaits `backend.bookings.cancel(id)` with no try/catch, invoked via `void cancel(selected.id)`. On rejection (appointment just started, or status changed in another tab), the modal stays open and the user sees nothing.
- **Fix:** try/catch around cancel, surface the DataError message in the modal, refresh the list on failure too.

### L-9 [Low] Chat-open handlers use try/finally without catch, so shop-chat failures are swallowed
- **File:** `apps/web/src/components/CustomerDashboard.tsx:265-274`; `apps/web/src/pages/ShopProfilePage.tsx:76-90`
- **Category:** state
- **What:** `openShopChat`/`chatWithShop` guard the zero-barbers case, but `openConversation` can still throw: a shop whose barbers are all unverified throws `validation` (MockBackend.ts:972), and a signed-in barber/owner clicking "Chat shop" throws `forbidden` (:960-962). No catch, so the button just resets.
- **Failure scenario:** The demo barber account (miguel@demo.test) opens a shop profile and clicks "Chat shop": nothing happens except a console error.
- **Fix:** Add a catch that surfaces the DataError message near the button.

### L-10 [Low] Duplicate phone numbers silently lock later accounts out of phone sign-in
- **File:** `apps/web/src/services/mock/MockBackend.ts:381, 402-407`
- **Category:** validation
- **What:** `signUp` never checks phone uniqueness, while `signIn` resolves a phone identifier with `db.profiles.find(...)`, taking the first match, and verifies the password against that profile's hash only. (Validation-rule side of this is S-5.)
- **Failure scenario:** Two users register the same phone. The second signs in with phone + their correct password: lookup resolves to the first user's id, verification fails against the wrong hash, and they get "Wrong email/phone or password" forever, with no hint that email sign-in still works.
- **Fix:** Enforce phone uniqueness at signup, or verify the password against every phone-matching candidate.

### L-11 [Low] isWithinHours treats the block end as inclusive, so barbers and shops read as open at exactly closing time
- **File:** `apps/web/src/services/mock/availability.ts:90-94`
- **Category:** date-time
- **What:** `when >= b.start && when <= b.end` includes the closing instant, while slot generation (`t + durationMs <= blockEnd`, :73) correctly treats the end as exclusive. `availableNow` (MockBackend.ts:499-513) and `shopWithStatus` (:549-559) therefore report open at, e.g., exactly 22:00 for an 08:00-22:00 rule. One-minute window, self-heals.
- **Fix:** Use `when < b.end`.

### Logic: what already looks good
- Slot overlap math uses correct half-open comparison (`t < be && end > bs`), so back-to-back appointments at shared boundaries work (availability.ts:76).
- Reschedule is atomic: all validation happens before any field is mutated, and the mutation block is fully synchronous (MockBackend.ts:858-883).
- Status transitions are gated by an explicit allowed-transition map plus a not-before-start check for completed/no_show (MockBackend.ts:924-936).
- RequireAuth waits for session restore before deciding, avoiding the bounce-to-login flash; onboarding gets `allowIncomplete` to prevent redirect loops (RequireAuth.tsx:24-37).
- Thread remounts per conversation via `key={conversationId}` and dedupes subscription deliveries by message id (ChatPage.tsx:105-107, 162).
- `parseLocalDateKey` strictly validates YYYY-MM-DD and rejects rollover dates like 2026-02-31; day math consistently stays in device-local time (lib/date.ts:12-22).

---

## 3. Performance

### P-1 [High] SVG #rough displacement filter is applied to dozens of elements per page
- **File:** `apps/web/src/theme/doodle.css:164, 284, 322, 344, 405, 427` (also ShopOwnerDashboard.css:58, 126, 233)
- **Category:** rendering
- **Impact:** Mid and low-end phones on every list-heavy page; first paint and the GSAP staggered reveal are the worst moments; `.btn` hover re-rasterizes the filter for the 120ms shadow transition.
- **What:** `filter: url('#rough')` (feTurbulence + feDisplacementMap, DoodleDefs.tsx:13-15) is on `.doodle-icon`, `.btn`, `.rough-card`, `.pill`, `.eyebrow`, and `.avatar-blob`. On BarbersPage each of the 11 cards renders roughly 7 filtered elements, so 80+ independent filter rasterizations per paint. The reset at doodle.css:325 (`.rough-card > * { filter: none }`) only covers direct children, so nested pills and icons keep their own filter. Any style invalidation re-runs it.
- **Fix:** Drop the filter from high-count small elements (`.doodle-icon`, `.pill`, `.avatar-blob`) where the wobbly border-radius already sells the look; keep it on large one-per-section surfaces (`.rough-card`, `.eyebrow`). Move `.btn` hover feedback to transform only so the filter output stays cached.

### P-2 [Medium] Opening a chat runs listConversations three times with stacked mock delays
- **File:** `apps/web/src/pages/ChatPage.tsx:150-152` (also 30-31, 108, 158)
- **Category:** data-layer
- **Impact:** Every user, every thread open, right now: roughly 200-500ms of pure artificial wait before the header and read-state settle. At real-backend scale this is a textbook N+1.
- **What:** ChatPage loads `listConversations` to gate the thread, then `Thread` calls it again just to resolve its header (:150), then `markRead(...).then(onActivity)` (:158) triggers a third call. Each pays `delay()` of 80-240ms plus a full-DB reparse, and `conversationDetailed` rescans and resorts all messages per conversation per call.
- **Fix:** Pass the already-loaded `ConversationDetailed` into `Thread` as a prop, and make `onActivity` update just the affected conversation (or debounce) instead of re-deriving the whole inbox.

### P-3 [Medium] Chat thread re-renders every message bubble on each keystroke, with per-row Date parsing
- **File:** `apps/web/src/pages/ChatPage.tsx:140, 219-234, 246`
- **Category:** re-render
- **Impact:** Typing in the composer or inbox search. Harmless at demo scale, but with the 100-200 messages `getMessages` can return, every keystroke reconciles the full bubble list.
- **What:** `draft` state lives in `Thread`, so every keystroke re-renders the whole `messages.map(...)`; each row constructs 2-3 `new Date()` objects plus uncached Intl formatter calls per render. The inbox `query` state re-renders the mounted Thread too, and `onBack={() => navigate('/chat')}` gets a new identity each time. No row memoization or virtualization.
- **Fix:** Extract the compose form into its own component (or memoize a `MessageList` on `messages`), precompute per-row formatted timestamps when messages change, wrap `Thread` in `memo` with a stable `onBack`.

### P-4 [Medium] 138KB background texture is the single largest asset, for a 7 percent opacity pattern
- **File:** `apps/web/src/theme/doodle.css:88-97` (asset: `apps/web/public/barber-pattern.avif`, 138,534 bytes)
- **Category:** assets
- **Impact:** Every first-time visitor. It is bigger than the gzipped entry JS (34KB) and the react vendor chunk (74KB).
- **What:** `.bg-pattern` tiles `barber-pattern.avif` at 330px behind everything at 0.07 opacity, where compression artifacts are invisible; the file is encoded at far higher quality than needed.
- **Fix:** Re-encode at aggressive AVIF quality and/or a smaller tile (target 20-40KB). The fixed-position div approach itself is fine (own compositor layer, no repaint on scroll).

### P-5 [Medium] MockBackend reparses and restringifies the entire database around every operation
- **File:** `apps/web/src/services/mock/MockBackend.ts:257-267` (also :37, :252-255)
- **Category:** data-layer
- **Impact:** Honest caveat: the seed DB is ~20KB, so each parse is well under a millisecond today. It becomes jank only as messages/appointments accumulate in a long session, and disappears entirely at the Supabase swap.
- **What:** Nearly every read calls `reloadFromStorage()` (full JSON.parse plus migrate), every write calls `persist()` (full stringify), and `clone()` is a JSON round-trip per returned entity. The dashboard's 7-call `Promise.all` (CustomerDashboard.tsx:126-134) means 7 full parses per open; the `db` broadcast makes every other tab reparse too.
- **Fix:** Reload only when the broadcast/storage event says another tab wrote; keep the in-memory `db` authoritative within a tab; swap `clone` for `structuredClone`. Coordinate with the L-2/L-4 fix since both touch the same code.

### P-6 [Low] Booking form re-runs ~60 uncached Intl formats on every notes keystroke
- **File:** `apps/web/src/pages/BarberDetailPage.tsx:235-238` (also :59, :222, :247)
- **Category:** re-render
- **What:** `notes`, `selectedSlot`, and `message` state live at page level; each render rebuilds 21 `new Date(...)` objects with 3 `toLocaleDateString` calls apiece (each constructing a fresh Intl.DateTimeFormat).
- **Fix:** Precompute day-button labels inside the existing `nextDays`/`useMemo`, or hoist shared Intl.DateTimeFormat instances like CustomerDashboard.tsx:57-61 already does.

### P-7 [Low] Landing storefront outro animations keep running while off-screen
- **File:** `apps/web/src/pages/useJourneyScroll.ts:26-28` (also LandingPage.tsx:353-355, Storefront.tsx:102-106, LandingPage.css:888-890)
- **Category:** rendering
- **What:** The IntersectionObserver pauses only `.phil-hero-main` children, and the paused rule fires only when the tab is hidden. The Storefront outro's dozens of infinite animations (walk cycle, birds, clouds, lamps, wheel spins) run whenever the landing is mounted, even scrolled out of view. Battery/CPU drain while idling.
- **Fix:** Observe the outro section with the same `data-animation-paused` mechanism, or gate `Storefront` rendering on an IntersectionObserver.

### P-8 [Low] Each cursor-tracking DoodleAvatar adds a window pointermove listener doing layout reads per frame
- **File:** `apps/web/src/components/DoodleAvatar.tsx:102` (also :81-88; instances at SettingsPage.tsx:106, 124 and CustomerDashboard.tsx:368)
- **Category:** rendering
- **What:** The listener is on `window`, so it fires even when the avatar is off-screen; each instance does a `getBoundingClientRect` forced-layout read plus 5 style writes per frame. Cleanup is correct and it is rAF-throttled, so at 2-3 instances this is minor; it bites only if `trackCursor` ever lands in a list.
- **Fix:** Share one module-level pointermove listener that fans out to registered avatars (visible ones only); never enable `trackCursor` on repeated list items.

### P-9 [Low] Fonts are not preloaded, so all UI text flashes fallback cursive on first visit
- **File:** `apps/web/src/theme/doodle.css:7-37` (also index.html:3-9)
- **Category:** bundle
- **What:** Every glyph uses one of 4 handwritten woff2 files (88KB total), discovered only after CSS parse with `font-display: swap`, causing a visible full-layout font swap on first load.
- **Fix:** Preload the two above-the-fold families (Patrick Hand body, Kalam headings) in index.html with `rel="preload" as="font" crossorigin`.

### P-10 [Low] Dashboard chunk bundles all three role dashboards
- **File:** `apps/web/src/pages/AppDashboardPage.tsx:2-4`
- **Category:** bundle
- **What:** CustomerDashboard, BarberDashboard, and ShopOwnerDashboard are static imports inside the lazily loaded AppDashboardPage (38KB JS + 31KB CSS, ~10.6KB gzipped), though exactly one renders. Nice-to-have.
- **Fix:** `lazy()` the two non-customer dashboards inside AppDashboardPage (the pattern already exists for ShopMap at CustomerDashboard.tsx:25).

### P-11 [Low] ShopMap tears down and rebuilds every marker on each selection change
- **File:** `apps/web/src/components/ShopMap.tsx:103-129`
- **Category:** rendering
- **What:** The markers effect depends on `selectedId`, so selecting a pin recreates all markers. Not felt at 10 pins (the code comment acknowledges this), but at real scale with hundreds of shops every tap would recreate every DivIcon and drop tooltips mid-interaction.
- **Fix:** Keep markers keyed in `markersRef` across selection changes and only `setIcon` on the two affected markers; rebuild only when `shopSignature` changes.

### Performance: what already looks good
- Route-level code splitting is real and verified in the build: Leaflet (152KB) and GSAP/ScrollTrigger (70KB + 43KB) are async chunks, dynamically imported post-paint (App.tsx:14-23, CustomerDashboard.tsx:25, useDoodleAnimations.ts:27, useJourneyScroll.ts:51).
- The backend is created once via `useMemo` (backend.tsx:31), and AuthProvider only re-renders on actual auth changes.
- Effect hygiene is consistently strong: GSAP contexts reverted with StrictMode guards, chat subscriptions and BroadcastChannel listeners cleaned up, pointer/scroll listeners all removed.
- Icons ship as one sprite consumed via `<use>` (DoodleDefs.tsx:22-88).
- Chat autoscroll uses container `scrollTop` instead of `scrollIntoView`, avoiding whole-page scroll jank (ChatPage.tsx:174-180); `getMessages` caps reads at 200 rows.
- Cursor and pointer effects are rAF-throttled with reduced-motion and coarse-pointer bailouts (DoodleAvatar.tsx:70-93, RoleSelectionPage.tsx:75-90).

---

## Fix-now checklist (suggested order)

Ordered by real-world impact and how much they protect the demo from embarrassing states. IDs link back to the findings above.

- [x] **L-1** Move the `hashPassword` await before any `db` mutation in `signUp` (permanent account corruption, small fix)
- [x] **L-2 + L-4** Reload-then-persist in one synchronous block in every mutator; consider a version stamp on the stored DB (silent data loss across tabs)
- [x] **L-5** Disable date/service controls while booking, guard the finally-block refetch (user can book the wrong day; button can stick forever)
- [x] **S-7** Apply the start-time gate to the `cancelled` transition in `setStatus` (one-line rule fix)
- [x] **L-3** Put the message id in the broadcast payload so rapid sends are not dropped
- [x] **P-1** Remove `#rough` from `.doodle-icon`, `.pill`, `.avatar-blob`; move `.btn` hover to transform-only (biggest perf win, CSS-only)
- [x] **P-2** Pass the conversation into `Thread` as a prop; stop refetching the inbox three times per thread open
- [x] **S-4** Make `appointmentDetailed`/`conversationDetailed` skip rows with dangling references instead of throwing
- [x] **P-4 + P-9** Re-encode `barber-pattern.avif` (target under 40KB) and preload Patrick Hand + Kalam
- [x] **L-8 + L-9** Surface DataError messages on cancel and chat-open failures
- [x] **L-11** `when < b.end` in `isWithinHours`
- [x] **S-8 / uid** Switch `uid()` to `crypto.randomUUID()`
- [x] **L-6, L-7, P-3, P-6, P-7, P-8, P-10, P-11** Remaining Low items as time allows

### Resolution update — July 14, 2026

- All fix-now correctness and performance findings above are implemented and verified by web typecheck and production build.
- The mock adapter now also applies the shared email/phone rules, constant-work unknown-user password verification, private availability-reason filtering, documented-demo-only credentials, and production security headers described in S-3, S-5, S-6, S-9, and S-11.
- S-1, S-2, and S-10 remain deliberate architecture boundaries: browser-only mock authentication and `localStorage` cannot provide server-enforced authorization or secret storage. They must be closed by the Supabase adapter, RLS policies, and server-managed sessions rather than by misleading frontend-only checks.
- Phase 2 items stay unchecked below because their server/database enforcement still has to be verified after the Supabase swap, even where the frontend contract is already hardened.

## Phase 2 (Supabase swap) checklist

These are not bugs today, but each one becomes a real vulnerability or outage if the pattern is ported as-is. Keep this list next to the swap plan.

- [ ] **S-1** Re-implement every authz check in RLS or an API layer; client checks are UX only
- [ ] **S-2** Use the Supabase SDK session; never read `bsh_session`; delete the key in the new adapter
- [ ] **S-3** Strip `reason` from public availability reads (select list or RLS)
- [ ] **S-5 / L-10** Add email format + phone normalization and uniqueness to shared validation before the server enforces it
- [ ] **S-6** Dummy-verifier hashing and rate limits on the server sign-in path
- [ ] **S-9** Per-account random passwords in any real-database seed script, behind a dev flag
- [ ] **S-11** Ship the production CSP via the hosting platform's header config
- [ ] **L-2** Enforce booking exclusivity in Postgres (exclusion constraint on `barber_id` + `tstzrange`), not application code
- [ ] **S-10** Retire the localStorage blob entirely; keep the fail-closed guard in `backend.tsx` until the adapter is complete
