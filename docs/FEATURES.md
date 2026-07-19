# Philabantay - Feature Overview

A friendly map of what this app does, every major screen, where each one lives in
the code, and how the important flows actually run start to finish.

For the technical side (state, data flow, patterns), see
[ARCHITECTURE.md](ARCHITECTURE.md). For conventions and the production security
plan, see [CODE-PATTERNS.md](CODE-PATTERNS.md), [SECURITY.md](SECURITY.md), and
[ROLE-AND-LOCATION-GUARDRAILS.md](ROLE-AND-LOCATION-GUARDRAILS.md).

---

## What the app does, in plain language

Philabantay is a barbershop helper for the Philippines. It connects three kinds
of people:

- **Customers** find nearby barbershops on a live map, see which chairs are open
  right now, book a haircut with a specific barber, chat with the shop, and rate
  the cut afterward.
- **Barbers** either look for a shop to work at (a hiring map plus join-by-code),
  or, once they belong to a shop, manage their weekly schedule and see their
  upcoming bookings and customer messages.
- **Shop owners** get a shop dashboard and a rotating join code they hand to
  barbers they have hired.

The same UI can run against the in-browser **mock backend** or the implemented
Express/Supabase backend. `VITE_DATA_BACKEND=api` selects `ApiBackend`; the
current local frontend configuration uses that real API path. See
[ARCHITECTURE.md](ARCHITECTURE.md#the-one-big-idea-the-databackend-contract).
Some screens are ahead of their durable backend contract, so the
current-versus-planned notes below remain important.

The look is a hand-drawn "doodle" theme with GSAP animations and a barber-curtain
transition between routes.

---

## Roles and how someone gets one

There are four roles in the data model (`packages/shared/src/types.ts`):
`customer`, `barber`, `shop_owner`, `admin`. In the running app you will meet the
first three (there is no admin UI; the admin demo was removed in a data
migration).

The important rule, enforced in the mock and documented for production in
[ROLE-AND-LOCATION-GUARDRAILS.md](ROLE-AND-LOCATION-GUARDRAILS.md): **signing up
always makes you a customer.** Choosing "barber" or "shop owner" during
onboarding only records a *request* (`requested_role`) and sets
`verification_status: 'pending'`. The account stays customer-level until a
trusted process promotes it. The current owner lock is implemented across UI,
Express, and RLS; the complete verification-submission/admin-review path and
consistent pending-barber lock remain planned. A join code links an already
granted barber to a shop—it must never grant the professional role itself.

### Accounts

No login is bundled with the application. Create an account through the signup
flow; local and deployed environments use the same account-creation path.

---

## Feature and screen catalog

Routes are declared in one place: `apps/web/src/App.tsx`. Signed-in navigation is
a single hamburger drawer (`components/AppMenu.tsx`), whose items come from
`config/navigation.ts`.

### Public / discovery

| Feature | What it does | Lives in |
| --- | --- | --- |
| **Landing page** | Marketing "billboard" whose hero *is* the auth form, plus an animated "how it works" street scene. `/login` and `/signup` just redirect here with a mode flag. | `pages/LandingPage.tsx`, `pages/useJourneyScroll.ts`, `components/AuthSlider.tsx`, `components/Storefront.tsx`, `components/WalkFigure.tsx` |
| **Barber directory** | Browse all barbers, filter to nearby (GPS) or favorites, see who is available now. Two entry points share one component: `BarbersPage` and `FavoriteBarbersPage`. | `pages/BarbersPage.tsx` |
| **Barber detail + booking** | A barber's public page: rating, portfolio, and the booking workspace (service, date, open time slots). Also handles reschedule. | `pages/BarberDetailPage.tsx` |
| **Shop profile** | One shop's page: services menu, barbers on duty, a live-queue widget, hours, and a "Chat shop" button. | `pages/ShopProfilePage.tsx` |

### Customer app

| Feature | What it does | Lives in |
| --- | --- | --- |
| **Customer dashboard** | Home for customers: greeting, quick stats, the live shop map with filters, nearest-shops list, appointment calendar, and a rewards/stamp card. | `components/CustomerDashboard.tsx` (rendered by `pages/AppDashboardPage.tsx`) |
| **Live shop map** | Leaflet map of shops with open/busy/closed pins and a "you are here" marker. | `components/ShopMap.tsx` |
| **Appointments** | Booking calendar with upcoming and past cuts, a detail modal to cancel or reschedule, and post-cut ratings. | `pages/AppointmentsPage.tsx`, `components/AppointmentCalendar.tsx` |
| **Chat** | Inbox + thread for messaging a shop. Mock mode uses cross-tab broadcasts; API mode uses authenticated polling behind the same subscription contract. | `pages/ChatPage.tsx` |
| **Favorites** | Heart a shop or a barber. Two separate lists (shops vs barbers). | Backed by `favorites.*`; UI on shop/barber pages and dashboard |

### Barber app

| Feature | What it does | Lives in |
| --- | --- | --- |
| **Barber home (employed)** | Once a barber belongs to a shop: next shifts, upcoming bookings, and recent customer messages. | `components/BarberDashboard.tsx` (the `EmployedBarberHome` view) |
| **Hiring map (job seeker)** | Before joining a shop: a map of shops that are hiring, an application button, and a "join with shop code" box. | `components/BarberDashboard.tsx` (the `BarberJobBoard` view) |
| **Schedule** | Set the weekly working hours and mark one-off unavailable dates. Route is `/schedule`. | `pages/DashboardPage.tsx` |

### Shop owner app

| Feature | What it does | Lives in |
| --- | --- | --- |
| **Owner overview** | Live shop bookings drive range-based completed-service-value/deal charts, top visitors, top services, and join-code controls. | `components/ShopOwnerDashboard.tsx` |
| **Owner reservations** | Searchable/filterable shop ledger with customer, barber, service, time, state, and owner booking actions. | `components/ShopOwnerDashboard.tsx` |
| **Owner staff** | Staff roster, weekly shift editing, attendance, notes, and shift-change decisions. | `components/OwnerStaffPanel.tsx` |
| **Owner barber performance** | Rating/count, completed cuts, completed service value, no-show signal, and accepting-bookings state. | `components/ShopOwnerDashboard.tsx` |
| **Owner messages** | Customer shop threads plus staff conversations in the shared notebook chat UI. | `pages/ChatPage.tsx` |

### Account and shared

| Feature | What it does | Lives in |
| --- | --- | --- |
| **Onboarding / role choice** | One-time role picker after signup, plus pending-verification states. | `pages/RoleSelectionPage.tsx`, `components/RoleAvatar.tsx` |
| **Settings shell** | Sidebar + search over five panels, each its own `/settings/*` route. | `pages/SettingsPage.tsx` |
| **Account settings** | Edit name, email, phone, and city. | `pages/settings/AccountSettingsPanel.tsx` |
| **Avatar studio** | Pick a premade doodle avatar or build a custom face. | `pages/settings/AvatarSettingsPanel.tsx`, `components/DoodleAvatar.tsx` |
| **Notifications** | Toggle reminder/chat/email/nearby prefs. Device-local only (see gotchas). | `pages/settings/NotificationSettingsPanel.tsx` |
| **Security** | Change password and sign out. | `pages/settings/SecuritySettingsPanel.tsx` |
| **Report a bug** | File a support report (category, summary, details). | `pages/settings/BugReportSettingsPanel.tsx` |
| **Shared shell** | The framed "doodle board" (teal rail + top bar) used by all three role dashboards. | `components/DoodleBoard.tsx` |
| **App menu** | The single hamburger drawer; items vary by role. | `components/AppMenu.tsx`, `config/navigation.ts` |
| **Route transition** | The barber-curtain wipe between routes. | `components/CurtainTransition.tsx` |

### Full route map (`App.tsx`)

```text
/                        Landing (public; hosts the auth form)
/login, /signup          Redirect to / with an auth mode flag
/onboarding/role         Role picker (signed in, profile may be incomplete)
/barbers                 Barber directory (public)
/barbers/favorites       Favorite barbers (public route; asks sign-in to use)
/barbers/:barberId       Barber detail + booking (public; booking asks sign-in)
/shops/:shopId           Shop profile (public)
/appointments            Booking calendar (auth; barbers get redirected away)
/chat, /chat/:id         Messages (auth)
/dashboard               Role-aware home (auth) -> customer / barber / owner board
/settings                -> /settings/account
/settings/account        Account (auth)
/settings/avatar         Avatar studio (auth)
/settings/notifications  Notification prefs (auth)
/settings/security       Password + sign out (auth)
/settings/report-bug     Bug report (auth)
/schedule                Barber weekly schedule (auth, role=barber)
/dashboard/barber        Redirects to /schedule
*                        Not found
```

`/dashboard` is deliberately one URL that renders a different board depending on
role (`pages/AppDashboardPage.tsx`): customers get `CustomerDashboard`, pending
or verified barbers get `BarberDashboard`, and shop owners get
`ShopOwnerDashboard`.

---

## User flows worth calling out

### 1. Sign up, then choose a role

```text
LandingPage / AuthSlider
  -> useAuth().signUp()  (always creates a customer, onboarding_completed=false)
  -> curtain go('/dashboard')
  -> RequireAuth sees onboarding_completed=false
       -> redirects to /onboarding/role
  -> RoleSelectionPage -> useAuth().completeRoleOnboarding({ role })
       customer  -> role stays customer, verification 'not_required'
       barber    -> requested_role='barber', verification 'pending'
       shop_owner-> requested_role='shop_owner', verification 'pending'
  -> back to /dashboard, now role-aware
```

Key files: `components/AuthSlider.tsx`, `features/auth/AuthContext.tsx`,
`components/RequireAuth.tsx`, `pages/RoleSelectionPage.tsx`. The actual rules live
in the mock's `auth.signUp` and `auth.completeRoleOnboarding`
(`services/mock/MockBackend.ts`).

### 2. Booking a haircut, start to finish

This is the core flow. It touches availability math, slot computation, and the
booking service.

```text
Customer opens /barbers/:barberId (BarberDetailPage)
  1. Load barber + services + shops + my favorite barbers (parallel)
  2. Pick a service and a date
  3. useEffect calls backend.availability.getOpenSlots(barberId, serviceId, date)
        -> computeOpenSlots() in services/mock/availability.ts:
             effective working blocks for that weekday (rules + overrides)
             minus already-booked (pending/confirmed) appointments
             minus past times, stepped every SLOT_STEP_MIN (15 min)
  4. Pick a slot, optionally add notes
  5. Click Confirm:
        not signed in -> redirect to /login with `from`
        signed in     -> backend.bookings.create({ barber_id, service_id, starts_at, notes })
  6. bookings.create re-validates the slot server-side (validateBookingInput)
        - customer role required, barber must be verified + accepting
        - slot must still be open (throws DataError 'slot_taken' otherwise)
        - appointment saved with status 'pending'
  7. Page always refetches slots so the taken time disappears
```

The same page handles **reschedule**: if the URL has `?reschedule=<id>`, step 5
calls `backend.bookings.reschedule(id, input)` instead of `create`. The old
appointment stays until the new slot succeeds.

Files: `pages/BarberDetailPage.tsx`, `services/mock/availability.ts`,
`services/mock/MockBackend.ts` (`bookings.*`), rules in
`packages/shared/src/appointments.ts`.

### 3. Managing an appointment (cancel / reschedule / rate)

```text
/appointments (AppointmentsPage)
  -> backend.bookings.listMine()  + backend.reviews.listMine()
  -> open an appointment in a modal
       upcoming & changeable (canModifyAppointment) -> Cancel or Reschedule
         Cancel     -> backend.bookings.cancel(id)
         Reschedule -> navigate to /barbers/:barberId?reschedule=<id>&service=...&date=...
       completed -> Rate: backend.reviews.rateAppointment({ appointment_id, barber_rating, shop_rating, comment })
         -> updates the barber's and shop's aggregate rating
```

"Can I still change this?" is decided by `canModifyAppointment` /
`isUpcomingAppointment` in `packages/shared/src/appointments.ts`, used by both the
page (to show buttons) and the backend (to enforce it).

### 4. Customer chats with a shop

Chat is **shop-level**. A customer talks to a shop; behind the scenes the shop
has a `barber_id` representative who receives the thread.

```text
Customer clicks "Chat shop" (ShopProfilePage or the dashboard shop popup)
  -> backend.chat.openConversation(shopId)  [customer-only]
       finds an existing customer+shop conversation or creates one,
       attaching the shop's first verified barber as representative
  -> navigate to /chat/:conversationId (ChatPage)
  -> Thread loads messages, marks them read, and subscribes for new ones
  -> sending: backend.chat.sendMessage({ conversation_id, body })
       new message is delivered to this tab's subscribers immediately
       and to other tabs via a BroadcastChannel
```

Files: `pages/ChatPage.tsx`, `services/mock/MockBackend.ts` (`chat.*`), and
`packages/shared/src/services.ts` (`ApiBackend`). Mock mode uses
`BroadcastChannel`; API mode delivers local sends immediately and polls the
protected message route behind the same `chat.subscribe()` contract.

### 5. Finding a nearby, currently-open shop or barber

```text
useLiveLocation() (hooks) watches GPS continuously
  -> CustomerDashboard filters shops within NEARBY_DISCOVERY_RADIUS_KM (10 km)
       using straightLineKm() and orders nearest-first
  -> ShopMap draws pins; status open/busy/closed comes from the backend
       (a shop is "open" if any of its barbers is on shift, within hours,
        and accepting bookings; "busy" if on shift but full; else "closed")
  -> BarbersPage re-checks backend.barbers.availableNow() every minute
```

"Available now" and shop "open" status share the same rule (`isWithinHours` +
shift + accepting), so the map and the barber list cannot disagree. See
`services/mock/MockBackend.ts` (`shopWithStatus`, `barbers.availableNow`) and
`services/mock/availability.ts`.

### 6. A barber joins a shop

```text
Pending/seeking barber lands on /dashboard -> BarberDashboard (BarberJobBoard)
  A) Apply from the hiring map:
       backend.employment.listHiringShops()  -> pick a shop -> apply(shopId)
       (creates a pending BarberApplication; approval is a shop action in prod)
  B) Join with a code the owner gave them:
       backend.employment.joinWithCode({ code })
         validates the code, adds the barber to the shop roster,
         creates a Barber record + default weekly rules,
         promotes the account: role='barber', verification 'verified'
  -> AuthContext refreshes; the dashboard flips to the employed barber home
```

Files: `components/BarberDashboard.tsx`, `services/mock/MockBackend.ts`
(`employment.*`), seed codes in `services/mock/seed.ts`
(`TONDO26`, `SOUTH26`, `MAGIN26`).

### 7. Shop owner shares a join code

```text
Owner opens /dashboard -> ShopOwnerDashboard
  -> backend.employment.getMyShopJoinCode()  (owner-only, from their verified shop)
  -> "Generate new code" -> rotateMyShopJoinCode()
       deletes old codes for that shop and mints a fresh one
```

---

## What is real vs. placeholder (so you are not surprised)

Most flows are genuinely wired through the data layer. A few pieces are
intentionally sample/placeholder for the demo and are **not** backed by the
service contract yet:

- **Owner dashboard** reservations, metrics, staff, and performance now use
  backend records. Money totals remain completed booked-service value estimates
  because payment collection is not modeled.
- **Owner Shop Setup** is incomplete in the frontend/shared contract even though
  basic Express shop/service create/update routes exist. Shop publication,
  operating hours, photos, and policies are planned.
- **Shop profile** live-queue, opening hours, photo gallery, "latest review",
  and per-barber "specialty" labels are hardcoded/local, not from the backend.
- **Notification settings** persist only to `localStorage` (`bsh_prefs`); nothing
  is sent to the backend and the "Email updates" toggle has no downstream effect.
- **Security "current session"** is static copy (no real device/session list).
- **Social sign-in buttons** in the auth slider are stubs awaiting the Supabase
  OAuth wiring.

See [ARCHITECTURE.md - Gotchas](ARCHITECTURE.md#gotchas-and-inconsistencies-to-know)
for the full list, including a password-hint mismatch worth fixing.
