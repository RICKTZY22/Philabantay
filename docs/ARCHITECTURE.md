# Philabantay - Architecture Overview

A practical technical map: the stack, the folder layout, where state lives, how
data flows, what talks to what, and the gotchas worth knowing before you change
things.

Pair this with [FEATURES.md](FEATURES.md) (what each screen does) and the
existing [CODE-PATTERNS.md](CODE-PATTERNS.md), [SECURITY.md](SECURITY.md), and
[ROLE-AND-LOCATION-GUARDRAILS.md](ROLE-AND-LOCATION-GUARDRAILS.md).

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript (strict, `noUnusedLocals`, `verbatimModuleSyntax`; see `tsconfig.base.json`) |
| UI framework | React 19 |
| Build/dev | Vite (`apps/web/vite.config.ts`) |
| Routing | `react-router-dom` v7 (`BrowserRouter`, declared in `App.tsx`) |
| State management | React Context + local component state. No Redux/Zustand/RTK. |
| Server data | An in-app **mock backend** (in-memory + `localStorage`). No network calls today. |
| Realtime | `BroadcastChannel` across tabs (mock stand-in for Supabase Realtime) |
| Maps | Leaflet + OpenStreetMap tiles |
| Animation | GSAP + ScrollTrigger (dynamically imported), plus CSS transitions |
| Styling | Plain CSS, one colocated stylesheet per component/page, shared tokens in `theme/doodle.css` |
| Monorepo | npm workspaces: `apps/*` and `packages/*` |

**Planned (Phase 2, not in the repo yet):** a thin Express API (`apps/api`) and
Supabase (Postgres + Auth + Realtime + RLS). The README describes it, but only
`apps/web` and `packages/shared` currently exist.

---

## Monorepo layout

```text
barbersalonhelp/
├─ package.json            npm workspaces; root scripts (dev/build/lint/typecheck)
├─ tsconfig.base.json      shared strict TS config
├─ docs/                   these guides
├─ packages/
│  └─ shared/              @barbershop/shared: the contract everyone agrees on
│     └─ src/
│        ├─ types.ts         domain entities (Profile, Barber, Shop, Appointment, ...)
│        ├─ dto.ts           request/response shapes + DataError
│        ├─ services.ts      the DataBackend interface (the seam)
│        ├─ validation.ts    field rules shared by form + backend
│        ├─ appointments.ts  pure booking rules (isUpcoming / canModify)
│        ├─ constants.ts     SHOP_NAME, timezone, weekday labels, slot step
│        └─ index.ts         re-exports everything
└─ apps/
   └─ web/                 @barbershop/web: the React app (the only runtime today)
      └─ src/ ...          see next table
```

Root scripts (`package.json`): `npm run dev` runs the web app; `npm run build`
typechecks `shared` then builds `web`; `typecheck`/`lint` fan out across
workspaces.

### `apps/web/src` structure

| Directory | What it is for |
| --- | --- |
| `main.tsx` | Entry point. Mounts the provider tree (see below). |
| `App.tsx` | All routes. Lazy-loads every page except the landing page. |
| `pages/` | Route-level screens. Each orchestrates loading + mutations for its route. |
| `pages/settings/` | The five settings panels rendered inside the settings shell. |
| `components/` | Reusable and route-specific UI (dashboards, map, chat pieces, avatars, modal, curtain). |
| `features/auth/` | `AuthContext` - the signed-in profile + auth actions. |
| `services/` | The data layer. `backend.tsx` is the provider/switchboard; `services/mock/` is the current implementation. |
| `services/mock/` | `MockBackend.ts` (all service logic), `seed.ts` (initial data + schema), `availability.ts` (slot math), `passwords.ts` (PBKDF2). |
| `hooks/` | Reusable lifecycle behavior: `useLiveLocation`, `useCurrentTime`. |
| `lib/` | Pure utilities: `date`, `geo`, `format`, `security`, `profile`. |
| `config/` | Static metadata: `navigation`, `demoAccounts`, `discovery` (nearby radius). |
| `theme/` | `doodle.css` (tokens + global styles), `DoodleDefs` (SVG icon sprite + rough filters), GSAP animation runtime + hook. |

---

## The one big idea: the `DataBackend` contract

Everything the UI needs from "the server" is expressed as one TypeScript
interface in `packages/shared/src/services.ts`:

```ts
export interface DataBackend {
  auth: AuthService
  barbers: BarberService
  availability: AvailabilityService
  services: ServiceCatalog
  bookings: BookingService
  chat: ChatService
  shops: ShopService
  favorites: FavoriteService
  reviews: ReviewService
  employment: BarberEmploymentService
  support: SupportService
}
```

Pages and components **only ever call this interface**. They never import
anything from `services/mock`. That is the seam that lets Phase 2 replace the
mock with a Supabase adapter without editing a single screen.

```mermaid
flowchart TD
  Pages[pages + components] -->|useBackend()| Contract[DataBackend interface\npackages/shared]
  Pages -->|useAuth()| AuthCtx[AuthContext]
  AuthCtx -->|delegates auth.* to| Contract
  Contract -.implemented today by.-> Mock[createMockBackend\nservices/mock]
  Contract -.implemented later by.-> Supa[SupabaseBackend\n(Phase 2)]
  Mock --> LS[(localStorage + sessionStorage)]
```

The switchboard is `services/backend.tsx`:

```ts
const kind = import.meta.env.VITE_DATA_BACKEND ?? 'mock'
// 'mock'     -> createMockBackend()
// 'supabase' -> throws (fails closed; not implemented yet)
```

So today only `mock` works, and asking for `supabase` intentionally throws rather
than silently shipping a fake backend to production.

---

## Bootstrap and provider tree

`main.tsx` wires the providers in a deliberate order (do not reorder):

```tsx
<StrictMode>
  <BackendProvider>        {/* creates one DataBackend for the app */}
    <AuthProvider>         {/* uses the backend -> must be inside it */}
      <BrowserRouter>      {/* router hooks used by App + curtain */}
        <App />
      </BrowserRouter>
    </AuthProvider>
  </BackendProvider>
</StrictMode>
```

`App.tsx` then renders one `<Layout>` route with all pages nested inside it.
`Layout` (`components/Layout.tsx`) provides the sticky header, the hamburger
`AppMenu`, the background, the doodle SVG defs, the `CurtainProvider`, and a
`Suspense` + `RouteErrorBoundary` around the lazy `<Outlet/>`.

---

## Where state lives

There are only three kinds of state, which keeps things easy to reason about:

1. **The signed-in user** - React Context.
   `features/auth/AuthContext.tsx` holds `{ profile, loading, isBarber,
   isShopOwner, isAdmin, signIn, signUp, ... }`. It restores the session once on
   mount and subscribes to `auth.onAuthChange` so the header and route guards
   update together on login/logout. Auth mutations go through here, not through
   `useBackend()` directly.

2. **The data backend instance** - React Context.
   `services/backend.tsx` builds one `DataBackend` with `useMemo` and hands it
   down via `useBackend()`.

3. **Everything else** - local component state.
   Each page fetches what it needs in a `useEffect`, stores it in `useState`, and
   derives the rest with `useMemo`. There is no global cache. If two pages need
   the same data, they each fetch it. The persistent store is the mock DB in
   `localStorage`; React state is just a per-screen view of it.

The convention (from [CODE-PATTERNS.md](CODE-PATTERNS.md)): use `null` for "not
loaded yet" when an empty array is a valid loaded result, and guard async effects
with an `active` flag against stale updates.

---

## How data flows

### Reads (the standard page pattern)

```mermaid
sequenceDiagram
  participant P as Page (useEffect)
  participant B as useBackend()
  participant M as MockBackend
  participant S as localStorage
  P->>B: backend.bookings.listMine()
  B->>M: (same call)
  M->>S: reloadFromStorage()
  M-->>P: AppointmentDetailed[] (deep-cloned)
  P->>P: setState + render (Loading / empty / list)
```

Every mock method starts with an artificial `await delay(...)` and calls
`reloadFromStorage()` so it sees writes from other tabs. Return values are always
`structuredClone`d, so the UI can never mutate the store by reference.

### Mutations

```mermaid
sequenceDiagram
  participant P as Page
  participant M as MockBackend
  participant S as localStorage
  participant BC as BroadcastChannel
  P->>M: backend.bookings.create(input)
  M->>M: withDatabaseWrite():
  Note over M: navigator.locks serializes writes,\nreloadFromStorage(), run mutation, persist()
  M->>M: validate role + ownership + slot (throws DataError on failure)
  M->>S: persist() writes JSON
  M-->>BC: postMessage({type:'db'}) so other tabs reload
  M-->>P: cloned result
  P->>P: refetch related data / update local state
```

Two rules that hold everywhere:

- **The backend is authoritative.** Even if the UI hides a button, the mock
  re-checks role, ownership, status transitions, dates, and input bounds, and
  throws a typed `DataError` (`dto.ts`) for expected failures. Pages catch it and
  show `error.message`.
- **Business rules are shared, not duplicated.** For example "can this booking
  still change?" is `canModifyAppointment` in
  `packages/shared/src/appointments.ts`, used by both the page (to show actions)
  and the backend (to enforce them).

### Realtime (chat)

`chat.subscribe(conversationId, cb)` registers an in-tab listener. `sendMessage`
delivers to this tab's listeners immediately and posts to a `BroadcastChannel` so
other tabs re-read and fire their listeners. `ChatPage`'s `Thread` subscribes on
mount and unsubscribes on unmount. Phase 2 replaces the channel with Supabase
Realtime behind the same method signature.

---

## Routing and the auth guard

- Routes live only in `App.tsx`. Pages are `React.lazy` with an explicit
  `.then(m => ({ default: m.Named }))` bridge because the pages use named
  exports. The landing page is eager for a fast first paint.
- `components/RequireAuth.tsx` guards private routes in this order: wait for
  session restore (`loading`), then require a profile (redirect to `/login` with
  a `from`), then require completed onboarding (redirect to `/onboarding/role`),
  then optionally require a specific `role`.
- Important: `RequireAuth` is **UX only**. It is explicitly documented as *not* a
  security boundary; production security is Supabase RLS
  ([ROLE-AND-LOCATION-GUARDRAILS.md](ROLE-AND-LOCATION-GUARDRAILS.md)).
- Navigation between routes usually goes through the barber-curtain transition
  (`useCurtain().go(to)`), which closes a curtain, navigates behind it, and
  reopens. Redirect targets from query/state are sanitized with
  `safeInternalPath` (`lib/security.ts`) to prevent open redirects.

---

## Key components and what they connect to

The "what reads from what / calls what" table. Auth actions (`signIn`, `signUp`,
`updateProfile`, `changePassword`, `signOut`, `completeRoleOnboarding`) go through
`useAuth()`; all other data goes through `useBackend()`.

| Component / page | Reads / calls | Notable dependencies |
| --- | --- | --- |
| `AuthContext` | `auth.getCurrentProfile`, `auth.onAuthChange`, and all `auth.*` mutations | Wraps the whole app; source of `profile` + role flags |
| `AppDashboardPage` | nothing itself; picks a dashboard by `requested_role`/`role` | Renders `CustomerDashboard` / `BarberDashboard` / `ShopOwnerDashboard` |
| `CustomerDashboard` | `shops.list`, `barbers.list`, `barbers.availableNow`, `bookings.listMine`, `chat.listConversations`, `favorites.list`, `services.list`, `favorites.toggle`, `chat.openConversation` | `useLiveLocation`, `useCurrentTime`, `ShopMap` (lazy), `AppointmentCalendar`, `DoodleBoard`, `ModalPortal` |
| `BarberDashboard` | `employment.getMyShop`, `employment.listHiringShops`, `employment.listMyApplications`, `employment.apply`, `employment.joinWithCode`, `bookings.listMine`, `chat.listConversations`, `availability.getRules` | `useLiveLocation`, `ShopMap` (lazy), `DoodleBoard` |
| `ShopOwnerDashboard` | `employment.getMyShopJoinCode`, `employment.rotateMyShopJoinCode` (rest is sample data) | `DoodleBoard` |
| `BarberDetailPage` | `barbers.get`, `services.list`, `shops.list`, `favorites.listBarbers`, `availability.getOpenSlots`, `bookings.create`, `bookings.reschedule`, `favorites.toggleBarber` | `useAuth`, `lib/date`, `lib/format`, `lib/security` |
| `AppointmentsPage` | `bookings.listMine`, `reviews.listMine`, `bookings.cancel`, `reviews.rateAppointment` | `AppointmentCalendar`, `ModalPortal`, `useCurrentTime`, shared appointment rules |
| `BarbersPage` | `barbers.list`, `shops.list`, `favorites.listBarbers`, `barbers.availableNow`, `favorites.toggleBarber` | `useLiveLocation`, `useCurrentTime`, `useDoodleAnimations` |
| `ShopProfilePage` | `shops.get`, `barbers.list`, `services.list`, `favorites.list`, `favorites.toggle`, `chat.openConversation` | `useAuth`; queue/hours/gallery are local mock UI |
| `ChatPage` / `Thread` | `chat.listConversations`, `chat.getMessages`, `chat.markRead`, `chat.sendMessage`, `chat.subscribe` | `useCurrentTime`; memoized `Thread`/`MessageList`/`MessageComposer` |
| `DashboardPage` (Schedule) | `barbers.get`, `availability.getRules`, `availability.getMyOverrides`, `availability.setRules`, `availability.addOverride`, `availability.removeOverride`, `barbers.setShiftStatus`, `barbers.setAcceptingBookings` | `useAuth` |
| `AppMenu` | `useAuth` (`signOut`), `config/navigation` | `useCurtain`, `DoodleAvatar`, portal drawer with focus trap |
| `ShopMap` | none (presentational) | Leaflet; `React.lazy`-loaded to keep Leaflet out of the entry chunk |
| `CurtainTransition` | none | Provider behind `useCurtain()`; `go()` drives the wipe + navigation |
| `ModalPortal` | none | `createPortal` to `document.body`, focus trap, scroll lock, `inert` background |
| settings panels | `updateProfile` / `changePassword` (auth) and `support.reportBug`; notifications is local only | Share `SettingsHeading`/`SettingsActionRow` (see gotchas) |

---

## Inside the mock backend

`services/mock/MockBackend.ts` is the single ~1,500-line implementation of
`DataBackend`. Worth understanding because it stands in for the whole server.

- **Storage:** the entire DB is one JSON blob in `localStorage` under
  `bsh_mock_db_v1`. Shape is `MockDB` in `seed.ts`.
- **Sessions are per-tab:** the signed-in user id is in `sessionStorage`
  (`bsh_session`), so two tabs can be two different users at once. `setSession`
  fires `onAuthChange` listeners.
- **Cross-tab consistency:** every write goes through `withDatabaseWrite`, which
  uses the **Web Locks API** (`navigator.locks`) to serialize read-modify-write
  across tabs, reloads from storage first, mutates, then `persist()`s and
  broadcasts a `{type:'db'}` message so other tabs reload. Reads call
  `reloadFromStorage()` first.
- **Immutability:** every value handed to the UI is `structuredClone`d, so pages
  cannot mutate the store by holding a reference.
- **Validation on load:** `isStoredMockDB` (shape check) and `hasValidReferences`
  (no dangling foreign keys) run before trusting persisted data; bad data falls
  back to a fresh seed.
- **Migrations:** `migrateDB` upgrades old browser data across versions 2 to 14
  (adding shops, favorites, the owner account, hashed passwords, shop-level chat,
  doodle avatars, reviews, private contact fields, employment, shop ownership).
  Current seed version is 14.
- **Passwords:** `passwords.ts` uses PBKDF2-SHA256 (600k iterations) via WebCrypto
  with constant-time comparison and a dummy hash to equalize unknown-account
  timing. Legacy plaintext is upgraded on the fly. This is described as
  *demo protection only*, not a real auth boundary.
- **Availability math** lives in `services/mock/availability.ts`:
  `effectiveBlocks` (weekly rules with date overrides winning), `computeOpenSlots`
  (step through blocks, drop past times and booked overlaps), and `isWithinHours`
  (used for live "open/available" status). Times are treated as device-local for
  this single-shop MVP.
- **Seed data** (`seed.ts`): one demo customer, ~11 barbers, one shop owner, 10
  shops nationwide (real street coordinates), 6 services, weekly rules, 3 hiring
  listings, 3 join codes, and one completed appointment so the ratings flow is
  testable.

---

## Domain model quick reference

Defined in `packages/shared/src/types.ts`. The `*Detailed` / `*WithStatus`
variants are the "joined" shapes the UI usually consumes.

```text
Profile           id, role, requested_role, verification_status, onboarding_completed,
                  full_name, email(private), phone(private), location(private), avatar_url
PublicProfile     id, full_name, avatar_url        (the allowlisted, shareable subset)
Barber            id(=profile id), bio, rating, shift_status, accepting_bookings
  BarberWithProfile = Barber + { profile: PublicProfile }
Shop              id, owner_id, name, address, city, lat, lng, rating, barber_ids[]
  ShopWithStatus  = Shop + { status: open|busy|closed, available_barber_count }
Service           id, name, duration_min, price_cents, active
AvailabilityRule  barber_id, weekday(0-6), start_time, end_time     (weekly)
AvailabilityOverride  barber_id, date, is_available, start/end, reason(private)
Appointment       customer_id, barber_id, service_id, starts_at, ends_at, status, notes
  AppointmentDetailed = + service, barber, customer, shop
Conversation      customer_id, shop_id, barber_id(representative)
  ConversationDetailed = + customer, shop, barber, last_message, unread_count
Message           conversation_id, sender_id, body, read_at
Review            appointment_id, customer_id, barber_id, shop_id, barber_rating, shop_rating
HiringListing / BarberApplication / ShopJoinCodeDetails   (employment)
```

Two enums drive most conditionals: `AppointmentStatus`
(`pending | confirmed | cancelled | completed | no_show`) and `ShopStatus`
(`open | busy | closed`, derived, never stored).

---

## Notable patterns and conventions

- **Inside-out feature work.** Add a type/DTO in `shared`, extend the service
  interface, implement it in the mock, put shared rules in a pure function, then
  let the page orchestrate. (See [CODE-PATTERNS.md](CODE-PATTERNS.md).)
- **Two-language codebase.** Comments and user-facing copy are often Taglish
  (Tagalog + English). Code identifiers are English.
- **Bilingual, safe error handling.** Services throw `DataError` with a
  user-friendly message; pages render `error.message`.
- **Dates:** calendar keys (`YYYY-MM-DD`) are parsed strictly with `lib/date.ts`
  (never `new Date(string)`), and moments are ISO timestamps.
- **Location:** one shared `useLiveLocation` feeds the map, nearby filtering, and
  ordering, so they cannot disagree. The 10 km radius is a single constant in
  `config/discovery.ts`. Straight-line distance is a private sort/boundary signal,
  never shown as travel distance.
- **Security hygiene in the UI:** user text is rendered as React text nodes (map
  tooltips build with `textContent`), IDs are encoded with `routeSegment`, and
  query strings use `URLSearchParams`.
- **Accessibility + motion:** modals trap focus and lock scroll; animations honor
  `prefers-reduced-motion`; GSAP is dynamically imported so it never bloats the
  entry chunk.
- **One stylesheet per component/page**, using tokens from `theme/doodle.css`.
- **`DoodleBoard`** is the shared dashboard shell (teal rail + top bar) used by
  the customer, barber, and owner dashboards, so all three share one look.

---

## Gotchas and inconsistencies to know

Things that surprised me while reading, worth keeping in mind (or fixing):

1. **`apps/api` and Supabase do not exist yet.** The README and docs describe
   Phase 2, but the repo is `apps/web` + `packages/shared` only.
   `VITE_DATA_BACKEND=supabase` throws by design.
2. **Password hint mismatch.** `SecuritySettingsPanel.tsx` tells users "at least
   10 characters and one special character," but the enforced rule
   (`validation.ts`, used by `changePassword`) is `MIN_PASSWORD_LENGTH = 6` plus
   one special character. The hint text is stricter than reality.
3. **`/schedule` is served by `DashboardPage`.** The barber weekly-schedule screen
   is the file named `DashboardPage.tsx`, while the role-aware home is
   `AppDashboardPage.tsx`. `/dashboard/barber` redirects to `/schedule`. The
   naming does not match the routes.
4. **Two favorite domains.** Shops use `favorites.list` / `favorites.toggle`;
   barbers use `favorites.listBarbers` / `favorites.toggleBarber`. Easy to grab
   the wrong pair.
5. **Sample-only UI.** The owner dashboard's reservations/metrics/charts, and the
   shop profile's queue/hours/gallery/latest-review/specialties, are hardcoded,
   not backend-driven. See [FEATURES.md](FEATURES.md#what-is-real-vs-placeholder-so-you-are-not-surprised).
6. **Notification prefs are device-local** (`localStorage: bsh_prefs`) and never
   reach the backend; the "Email updates" toggle has no downstream effect.
7. **Shared settings helpers live in a panel.** `SettingsHeading` and
   `SettingsActionRow` are exported from `AccountSettingsPanel.tsx` and imported by
   the other panels, which is a surprising home for shared UI.
8. **`avatarRole()` is duplicated** in `SettingsPage.tsx`,
   `AccountSettingsPanel.tsx`, and `AvatarSettingsPanel.tsx` with slightly
   different signatures.
9. **`admin` role has no UI.** It exists in the type union and role flags
   (`isAdmin`), but the admin demo account was removed in migration v7 and there
   are no admin screens.
10. **`effectiveBlocks` is re-exported from `MockBackend.ts`** "so pages can
    preview next open slot," but pages actually use `availability.getOpenSlots`;
    the re-export appears unused.
11. **Landing owns auth.** There is no dedicated login/signup page; `/login` and
    `/signup` redirect to `/` and the `AuthSlider` reads the mode from router
    state. Losing that state (deep link) just lands on the default sign-in view.
12. **Animation-by-attribute contract.** `useJourneyScroll.ts` and
    `theme/doodleAnimationRuntime.ts` target elements by `data-*` attributes and
    CSS class names. Renaming a class in the markup silently breaks animations
    with no TypeScript error (both files warn about this).

---

## Phase 2 swap plan (how the seam pays off)

To go from demo to real, the intended path is:

1. Implement `DataBackend` (`packages/shared/src/services.ts`) against Supabase in
   a new adapter, and add the Express API that holds the service-role key.
2. Wire it in `services/backend.tsx` under the `supabase` case (which currently
   throws).
3. Flip `VITE_DATA_BACKEND=supabase`.
4. Enforce every rule the mock enforces (roles, ownership, status transitions,
   slot validation) again in Postgres/RLS, because the browser is never the
   authority. Follow [ROLE-AND-LOCATION-GUARDRAILS.md](ROLE-AND-LOCATION-GUARDRAILS.md)
   and [SECURITY.md](SECURITY.md).

Because pages only ever touched the interface, no screen should need to change.
