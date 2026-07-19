# Philabantay Code Patterns

This guide records the architecture and coding conventions already used by the
repository. New work should follow these patterns so the mock backend can later
be replaced without rewriting the React application.

## Dependency direction

Dependencies point inward toward stable contracts and pure rules:

```text
pages -> components -> hooks/lib/config
  |          |
  +------> DataBackend interface <----- MockBackend or ApiBackend
                         |
                  packages/shared
```

Rules:

- `packages/shared` owns domain types, DTOs, validation, service contracts, and
  pure business rules that must agree across UI and backend implementations.
- `apps/web/src/services` implements or provides those contracts.
- Pages and components call `useBackend()` and must not import a concrete
  backend implementation from `services/mock`.
- `lib` contains pure browser-app utilities such as local-date parsing, route
  safety, display formatting, and map URL construction.
- `hooks` contains reusable React lifecycle behavior such as clocks or browser
  subscriptions. Hooks do not render UI.
- `config` contains non-sensitive static application metadata such as
  navigation and discovery limits. It must not contain accounts, credentials,
  secrets, or mutable runtime state.

## Feature implementation pattern

Implement a feature from the inside out:

1. Add or update domain types and DTO validation in `packages/shared`.
2. Extend the appropriate service interface in `packages/shared/src/services.ts`.
3. Implement the interface in the mock backend and later in every real adapter.
4. Put reusable business decisions in a pure shared function. Do not duplicate
   the same status/date rule in several pages.
5. Let the route page orchestrate loading and mutations.
6. Extract reusable or visually independent UI into `components`.
7. Keep static labels, route metadata, and menu definitions in `config`.

Example: whether a booking can still be changed belongs in
`packages/shared/src/appointments.ts`; the page uses it to show actions and the
backend uses it again to enforce the mutation.

## React page pattern

A route page should be an orchestration boundary:

```tsx
export function ExamplePage() {
  const backend = useBackend()
  const [data, setData] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setError(null)

    backend.items.list()
      .then((items) => {
        if (active) setData(items)
      })
      .catch(() => {
        if (active) setError('Hindi ma-load ang data.')
      })

    return () => { active = false }
  }, [backend])

  if (error) return <ErrorState message={error} />
  if (!data) return <Loading label="Loading..." />
  return <ItemList items={data} />
}
```

- Use `null` for "not loaded" when an empty array is a valid loaded result.
- Guard async effects against stale updates after unmount.
- Handle rejected service calls; do not leave a page permanently loading.
- Use functional state updates when the next value depends on the current one.
- Keep derived collections out of state. Compute them directly or with
  `useMemo` when the work is significant.
- Do not use non-null assertions for route parameters or profiles unless a
  route guard is the documented invariant.

## Business rules and mutations

- UI checks are for usability; service/backend checks are authoritative.
- Enforce ownership, roles, valid status transitions, dates, and input bounds in
  every backend adapter even when the button is hidden in React.
- Throw `DataError` for expected domain failures and show a user-safe message.
- A mutation button gets a busy state and must resist duplicate submission.
- Reload related server state after a mutation unless the response contains
  everything needed for a safe local update.

## Dates and time

- Calendar dates (`YYYY-MM-DD`) are not UTC timestamps. Parse and format them
  with `lib/date.ts`; do not rely on permissive string parsing.
- Persist actual moments as ISO timestamps and compare them using `Date.parse`.
- Use shared appointment helpers for upcoming/changeable booking rules.
- Time-sensitive screens must use a clock hook rather than a one-time
  `Date.now()` calculation that becomes stale while the page remains open.
- Display formatting belongs in `lib/format.ts`, not in service adapters.

## Live location and nearby discovery

- Browser geolocation subscriptions belong in `hooks`; pages consume the
  shared `useLiveLocation()` result instead of creating independent watchers.
- Use `watchPosition`, not a one-time position read, when a map or nearby list
  must follow a moving user. Always clear the watcher during effect cleanup.
- Keep a single location value as the source for map centering, hidden radius
  filtering, and nearest-first ordering so those views cannot disagree.
- Keep the shared nearby boundary in `config/discovery.ts`; map discovery and
  barber discovery must not define their own radius constants.
- Straight-line distance may be used as a private proximity boundary and sort
  signal. Do not present it as road distance; driving distance requires a real
  routing provider.
- Location denial and unsupported devices need a retry/fallback state. Public
  discovery must remain usable without forcing sign-in or location access.

## Navigation

- Routes are declared only in `App.tsx`.
- Static drawer metadata lives in `config/navigation.ts`.
- Encode backend identifiers with `routeSegment` and query strings with
  `URLSearchParams`.
- Redirect targets supplied through state/query data must pass
  `safeInternalPath`.
- Never add a menu action until its destination route and permission guard are
  real.
- Large settings areas use fixed sub-routes under `/settings/*` and share one
  navigation shell. Do not rebuild the sidebar or account tile in each panel.

## Account preferences and avatars

- Editable identity fields and password changes go through `AuthService`; the
  settings UI must never mutate mock storage or auth state directly.
- Email and location are private `Profile` fields. Keep them out of
  `PublicProfile` joins used by barber cards, bookings, and chats.
- Custom doodles are stored as a compact allowlisted configuration string. The
  renderer parses known face parts only—never store or render user-supplied SVG
  or HTML.
- Device-only notification preferences may use validated local storage while
  the production notification backend is not connected. User-submitted bug
  reports must use `SupportService` so they can move to the real backend later.

## Dialogs, drawers, and layers

- Blocking dialogs render through `ModalPortal` at `document.body`.
- Do not place a fixed overlay inside an element that uses `transform`, because
  the transformed ancestor becomes its containing block.
- Dialogs require a label, initial focus, Tab/Shift+Tab trapping, Escape and
  backdrop closing, scroll locking, background inertness, and focus restoration.
- Global layers use the tokens in `theme/doodle.css`; do not invent arbitrary
  `z-index` values.
- Only one blocking overlay may be interactive at a time.

## Interactive HTML

- Never nest a button, link, input, or other interactive control inside another
  interactive element.
- Use a separate card link and favorite/action button when a card needs both.
- Icon-only buttons require an accessible label.
- Tabs, dialogs, grids, and live status messages must keep their matching ARIA
  state synchronized with visual state.
- Keyboard and reduced-motion behavior are part of the feature, not cleanup.

## CSS pattern

- A component or page owns one colocated stylesheet.
- Use existing theme variables for color, paper, ink, shadows, and layers.
- Scope selectors under the component/page class; avoid new global element
  rules unless they are true design-system primitives.
- Prefer CSS layout and responsive media queries over viewport checks in React.
- Animate `transform` and `opacity`; provide a `prefers-reduced-motion` path.

## Security boundaries

- Render user content as React text. Do not use raw HTML APIs.
- The browser mock is demo storage, not an authentication boundary.
- Role and ownership checks in `RequireAuth` are UX only; a real backend must
  enforce them with authorization and RLS.
- Follow `docs/SECURITY.md` and `docs/ROLE-AND-LOCATION-GUARDRAILS.md` for the
  production backend.

## Definition of done

- No page imports `services/mock`.
- No duplicated business rule exists in multiple UI files.
- Loading, empty, error, success, and busy states are covered.
- Mouse, keyboard, narrow viewport, and reduced-motion behavior are checked.
- `npm run typecheck`, `npm run build`, and `git diff --check` pass.
- New behavior is reflected in this guide when it introduces a new pattern.
