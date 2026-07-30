---
tags:
  - philabantay
  - handoff
  - ui-redesign
  - feature-preservation
updated: 2026-07-30
---

# Premium Studio UI redesign — implementation and preservation handoff

This is the reviewer contract for the signed-in customer, barber, and owner UI
redesign approved by the product owner on 2026-07-30.

The selected direction is **Style C — Premium Studio**:

- charcoal foundation and navigation surfaces;
- copper as the primary action/accent color;
- warm white or very light neutral work surfaces;
- compact, mostly square cards with quiet borders and little shadow;
- pastel only for status, selection, contextual emphasis, and the avatar;
- one small hand-drawn detail per view, not a doodle texture on every surface;
- professional typography for headings and body copy; handwritten type is
  limited to a tiny annotation or accent when it adds identity.

This is a visual and responsive redesign of the existing application. It does
not authorize route, permission, contract, or product-policy changes. It also
does not change the current packet status.

## 1. Reviewer verdict and source order

Implementation may proceed, subject to this document and
[UI redesign Codex brief](UI-REDESIGN-CODEX-BRIEF.md).

When sources disagree, use this order:

1. security and data-integrity invariants;
2. the V1 product contract and active phase plan;
3. current shared contracts, migrations, and protected API behavior;
4. this preservation handoff;
5. the Premium Studio prototype as a visual reference only.

The prototype deliberately contains illustrative facts and controls. It is not
runtime authority. In particular, do not copy its unsupported “next
availability,” “Start service,” live capacity, or “Add walk-in” examples into
the application before their protected contracts exist.

The prototype also shows a permanent dark left navigation rail. That is a style
reference, not approved information architecture. The application keeps one
global hamburger drawer. Apply the dark navigation treatment to the app header
and drawer; keep `DoodleBoard`'s rail decorative and non-interactive.

## 2. Non-negotiable feature-preservation contract

### Cross-application

- Preserve every current route, role guard, owner/no-shop redirect,
  professional lock, legacy redirect, and hamburger destination.
- Keep the existing hamburger drawer as the only global navigation. Do not add a
  second permanent row or sidebar of global role destinations.
- Keep all reads and mutations behind `DataBackend`. Do not call Supabase
  directly, import a mock, or add page-local operational facts.
- Preserve loading, honest empty, retry/error, validation, busy, success,
  forbidden/not-found, stale-conflict, and partial-data states already present.
  New presentation must make them at least as visible as before.
- Preserve `ModalPortal` for blocking dialogs and its initial-focus, focus trap,
  Escape/backdrop close, scroll lock, inert background, and focus-return
  contract.
- Preserve semantic controls, visible focus, accessible names, ARIA state, live
  status/alert announcements, and reduced-motion behavior.
- Preserve current Taglish-friendly product voice. Reduce decorative copy, not
  meaningful instructions, deadlines, reasons, or consequences.
- Do not remove a feature merely because it makes a card dense. Reorganize it
  into a compact list/detail, disclosure, or mobile full-screen state.
- Preserve real empty states. Do not add sample appointments, people, services,
  prices, ratings, wait estimates, queue positions, charts, or capacity.
- Use the shared appointment-status presentation helper. Do not create another
  local status map.
- Keep the public landing/auth presentation outside this signed-in redesign.
  Workspace CSS must be scoped so it cannot flatten the landing notebook,
  time-of-day hero, or Rive scene.

### Customer features that must remain

- Dashboard greeting, upcoming booking count, unread-chat count, profile avatar
  shortcut, discover map/list, appointment calendar, and cut-stamp/reward area.
- One discovery data set shared by search, filtering, sorting, map, list, and
  selected-shop detail.
- Location permission request, retry, denial/unsupported fallback, “Near me”
  versus “All PH,” map reset, and discovery without forced location.
- Search by available shop facts; area/status/service filters; nearest, rating,
  and name sorting; Map/List toggle.
- Published shop cards/details with real name, address/city, map pin, status,
  rating/count, services, duration, price, and available staff facts exposed by
  the current contract.
- Favorites, selected-shop detail dialog, safe external driving route, shop
  conversation entry, and the unavailable/no-staff states.
- Bookings list and calendar, upcoming/history separation, booking detail,
  canonical status, service/barber/shop/time/price/notes, allowed cancellation,
  authoritative refresh after a failed mutation, separate barber/shop rating,
  and rating edit.
- Messages search, unread counts, list/detail layout, thread context, realtime
  subscription, message-ID deduplication, read marking, quick replies, draft
  restoration on send failure, and safe access-denied/not-found recovery.
- Settings Account, Doodle avatar, Notifications, Security, and Report a bug,
  including settings search and the shared settings shell.

### Barber features that must remain

- The job-seeker branch: hiring map/list, location fallback, published hiring
  shop details, applications/invitations timeline, apply, join-code request,
  pending/failed states, and Professional profile.
- The employed branch: shop context, today/next-work summary, upcoming assigned
  bookings, message summary, authoritative roster/calendar, date exceptions,
  absence markers, attendance, and shift-request status.
- Start-shift and accepting-new-bookings controls remain available where the
  current protected commands allow them.
- `/schedule` remains owner-authoritative and read-only for roster data. It must
  render no unrestricted barber shift editor.
- A barber may submit structured `time_off` or `different_hours` requests with
  dates, times, reason, validation, busy state, and owner-decision status.
- Weekly pattern, owner-approved exceptions, employment milestone, absence, and
  attendance information must remain visible.

### Owner features that must remain

- Owner overview metrics and all real-data summaries: needs attention, upcoming,
  checked in, in progress, awaiting confirmation, completed, completed service
  value, completed deals, booking health, coming up, top services, top visitors,
  and join-code status.
- Reservations search, upcoming/all/completed/cancelled filters, customer,
  barber, service, price, duration, date/time, notes, canonical status, and
  protected accept/decline with busy/conflict/error handling.
- Staff provider capability, owner-as-provider toggle, accepting-bookings state,
  provider qualifications, qualification requests, roster cards, editable
  owner-controlled weekly shifts, date exceptions, shift-change decisions,
  attendance, and private notes.
- Hiring off/open/full state, optional position count/note, pending requests,
  accept/decline, visible job seekers, portfolio links, invite flow, join-code
  one-time reveal/copy, use/expiry facts, rotate, and revoke.
- Barber performance remains separate from Staff. Keep rating/count, shift and
  accepting state, scheduled days, completed cuts, upcoming work, service-value
  fact, and no-show fact.
- Shop Setup draft creation/edit, version/status display, identity and public
  contact, address/city/timezone, map/coordinate fallback, chair count, default
  buffer, booking mode, service create/edit/retire/restore, photo upload/status/
  retryable removal, hours, date closures/exceptions, readiness checklist,
  self-service publish, and unpublish.
- A verified owner without a shop continues to land in Shop Setup, not an empty
  owner dashboard.

## 3. Avatar and profile-picture contract

### Product meaning

The saved doodle avatar is the user's profile picture. It is not an ornamental
dashboard mascot and must not be replaced by initials on the user's own primary
identity surfaces.

The current persisted field is `profile.avatar_url`, but its normal value is an
allowlisted doodle configuration string such as a premade ID or
`doodle:custom:...`. The legacy field name does not authorize arbitrary SVG or
HTML rendering.

### Required placement

- **Global app header:** show the signed-in user's saved avatar beside the
  hamburger. It is a link to `/settings/avatar` with an accessible label such as
  “Edit [name]'s profile avatar.”
- **Hamburger drawer account block:** show the same saved avatar, name, and role
  label. Do not allow the header and drawer to resolve different defaults.
- **Settings shell/account panel:** show the saved avatar beside the user's
  identity. The Avatar item remains a first-class settings destination.
- **Customer home:** keep the self-avatar shortcut to `/settings/avatar`, but
  reduce its visual weight so discovery and the next valid action lead.
- **Public/participant identity surfaces:** when a returned `PublicProfile`
  includes `avatar_url`, render that saved profile picture where a person image
  is appropriate; fall back to initials only when the value is null or invalid.
  A shop is not a person and should use a shop mark/icon until a real shop-logo
  contract exists.
- The avatar should not be duplicated as a large decorative illustration on
  every screen. One small identity rendering in the global shell is enough for
  most operational views.

### Avatar-creation behavior that must remain

- `/settings/avatar` keeps both **Premade** and **Create your own** modes.
- Preserve live preview and the current face shape, skin tone, hair, eyes, nose,
  mouth, accessory, accent/background, and gear choices.
- Preserve role-suggested premade ordering without hiding other current premade
  choices.
- Preserve role-scoped gear presentation: customer rewards, barber professional
  gear, and no owner gear catalogue.
- Preserve locked-state labels, completed-cut progress, reset, save-disabled
  when unchanged, saving state, success, and safe error message.
- Saving continues through `AuthService.updateProfile`; on success every
  self-avatar surface must update from the returned/authenticated profile.
- Cursor-following is optional enhancement only. It must remain disabled for
  reduced motion and non-fine pointers, and must never block choosing or saving.
- `DoodleAvatar` remains a safe allowlisted renderer with a useful `role="img"`
  label. Never store or render user-supplied SVG/HTML.

### Avatar integrity flag

Current code comments say the backend rejects cross-role gear and authoritatively
controls unlocks, but current technical truth does not show that enforcement:
`updateProfileInputSchema` accepts any trimmed `avatar_url` string up to 2048
characters, and `/auth/profile` writes it. The React renderer safely falls back
for unknown strings, but the completed-cut threshold and role lock are presently
UI-derived.

Therefore:

- preserve the existing UI in this visual slice;
- do not strengthen copy to claim that a reward is server-verified;
- do not add new reward value or competitive status based on the client count;
- ask the backend/shared-contract lane for an allowlisted avatar schema and
  authoritative gear eligibility before treating gear as protected progression.

## 4. Screen-by-screen redesign guidance

### Customer — Discover

Use the existing customer dashboard's discover section; a new `/discover` route
is not authorized in this pass.

- Lead with search, Map/List, and a single compact filter row.
- Desktop may use a list/map plus selected-detail arrangement. Mobile uses an
  explicit Map/List switch and a full-width selected-shop sheet/dialog.
- Use warm neutral cards and thin borders. Copper indicates the active view,
  selected shop, and primary action.
- Use pastel once: selected-shop context or a semantic open/closed/status cue,
  not a different pastel background for every card.
- Keep map, list, filters, favorites, real prices/services/ratings, driving
  route, and Chat shop behavior unchanged.
- Do not show the prototype's distance, next availability, popular-service
  claim, or availability copy unless returned honestly by the current/P2-07
  contract. Straight-line distance remains a private sort/boundary fact.
- Do not show queue or wait estimates.
- Keep the appointment calendar and reward card below/alongside discovery, but
  visually subordinate them to the current discovery task.

### Customer — Bookings

- Keep the list and calendar relationship. On desktop use a compact
  list/calendar or list/detail composition; on mobile use stacked cards and the
  existing portalled detail.
- Put the next valid action and canonical status before decorative calendar
  detail.
- Preserve upcoming/history, booking facts, cancel eligibility, separate shop
  and barber ratings, and all mutation states.
- Do not add “Book a cut,” deep timeline events, reschedule, or message actions
  merely because the prototype shows them; wire only existing routes/contracts.
- Status cannot be communicated by color alone.

### Shared — Messages

- Keep the two-pane inbox/thread layout on desktop and one pane at a time on
  mobile.
- Use charcoal only for shell/navigation; keep the reading pane light.
- Preserve one subtle notebook trait: softly asymmetric message corners, a
  quiet ruled divider, or one hand-mark. Remove heavy paper texture and large
  decorative labels.
- Keep participant, shop/staff context, search, unread count, realtime
  subscription/deduplication, mark-read, quick replies, retry/error, and draft
  recovery.
- Owner staff quick-start remains visible but compact. Former/unauthorized
  thread errors remain safe and recoverable.
- Person rows should adopt the saved profile avatar when available; shop rows
  keep a shop icon.

### Shared — Settings and avatar studio

- Keep the current settings subroutes and search. Desktop uses a compact
  category column plus main panel; mobile uses a horizontally scrollable or
  compact category selector without losing labels.
- Use small pastel category markers only. Active destination and primary save
  action use copper.
- Account remains the identity/contact home; Avatar remains the profile-picture
  creator, not a decorative subsection hidden under Appearance.
- The avatar screen should use a stable two-column preview/workbench on wide
  screens and preview-first stacking on mobile. The preview may carry the
  screen's single pastel panel.
- Keep native form semantics, field hints, sensitive email-change confirmation,
  notification state, password/session information, and bug-report behavior.
- Do not remove settings search, reset, status messages, or disabled/unchanged
  states to make the panel look sparse.

### Barber — Today's Chair / employed home

Current route truth is `/dashboard` for the employed barber home and
`/schedule` for the authoritative roster. `/dashboard/barber` redirects to
`/schedule`; there is no separate `/chair` route in this slice.

- The employed home may be titled “Today's Chair” visually, but it must remain
  an honest summary of current shop, next assigned bookings, messages, and
  schedule.
- Use chronological density: next booking/shift first, then compact upcoming
  rows, messages, and the schedule preview.
- Preserve real appointment and schedule facts. An empty agenda is a short
  in-column state, not a tall decorative panel.
- The prototype's current-customer progress, “Start service,” break, and
  visit-action controls are Phase 3 ideas. Do not add them without protected
  lifecycle commands and allowed-action data.
- Keep job-seeker behavior untouched when no active shop exists.

### Barber — Schedule

- Lead with the current shift/accepting state and the owner-authoritative
  calendar.
- Keep Start shift and Accept new bookings only where already protected.
- Make read-only ownership explicit near the schedule title and request form.
- Preserve weekly pattern, exceptions, absence/milestone markers, attendance,
  day detail, request kind/times/reason, pending/approved/declined state, and
  request validation.
- Do not turn calendar cells, weekly rows, or time displays into direct edit
  controls for a barber.
- Avoid motion by default. Any newly introduced motion needs a same-commit
  reduced-motion path.

### Owner — Overview

- Priority order: attention requiring an owner decision, today's known
  operations, then longer-range summaries.
- Use fewer visible cards by grouping related metrics, but keep every existing
  fact accessible. Collapsing secondary analytics is acceptable; deleting it is
  not.
- Use copper for attention/primary action. Pastel is reserved for one capacity
  or context panel and semantic statuses.
- Preserve range control, coming-up list, service/deal charts, booking health,
  rankings, and join-code status.
- Do not implement the prototype's live chair-capacity bands until P2-07/Phase 3
  supplies an honest projection. Existing booking counts are not equivalent to
  live chair use.
- Keep money terminology truthful: “completed service value” is not revenue or
  collected amount.

### Owner — Reservations

- Desktop target is a dense queue/table plus focused booking detail; mobile
  target is filterable cards followed by a full-screen detail.
- Preserve the current search and four filters, all row facts, canonical status,
  and protected accept/decline.
- Keep action busy state, conflict refresh, error announcement, and no-result
  state close to the queue.
- Do not add “Add walk-in,” countdown deadlines, reschedule, or lifecycle
  actions until their protected contracts exist.
- A future detail pane may be added without a new route only if it uses existing
  DTO facts and keeps the current actions available.

### Owner — Staff

- Use a compact roster/list and selected-person detail on desktop. Mobile shows
  one staff card/detail at a time.
- Preserve owner provider capability and accepting-bookings settings,
  qualifications, qualification requests, weekly schedule editing, exceptions,
  request decisions, attendance, and private notes.
- A selected-person design must not drop controls from non-selected staff; they
  remain reachable by keyboard and screen reader.
- Keep native time controls or normalize API `HH:MM:SS` to write-safe `HH:MM`
  if replaced.
- Approving a shift request must continue to apply the exception
  transactionally. Do not present it as a label-only decision.
- Keep stale/version conflict recovery and reason requirements.

### Owner — Hiring

- Lead with Off/Hiring/Full status and opening count, followed by pending
  requests, visible candidates, then join-code management.
- Preserve optional hiring note, request direction/context, accept/decline,
  candidate specialty/area/bio/portfolio, invite, and all conflict/full/already
  employed states.
- The one-time plaintext join code must remain visually distinct with “copy
  now” behavior; status, use count, expiry, rotate, and revoke remain available.
- Do not expose exact job-seeker location or imply that invitation directly
  creates employment.
- Use one restrained pastel cue for the current hiring state; do not create a
  different full-card color for every request direction.

### Owner — Shop Setup

- Keep the current single canonical route and independent save operations.
- A visual step index may group Identity, Location, Services, Photos, Hours &
  exceptions, and Review & publish. It must not hide an existing field or imply
  unsaved cross-step progress.
- Desktop can use step index + current form + customer-facing preview/readiness.
  Mobile uses one clear group at a time with saved-state visibility.
- Preserve map click/drag, coordinates and location-denial fallback, all
  services, media statuses, hours, closures, readiness, publish, and unpublish.
- The readiness checklist must continue to use saved server state, not unsaved
  form values.
- Publication is self-service once ready. Do not surface `pending_review` as a
  required owner workflow.
- The public preview may carry this screen's one pastel/sketch detail. It must
  use real saved facts and clearly distinguish preview from live publication.

### Owner — Barbers performance

This destination is not shown in the short prototype but is part of the current
owner workspace and must remain.

- Keep it separate from Staff.
- Preserve rating/count, shift/booking state, scheduled days, completed cuts,
  upcoming bookings, service-value fact, and no-show fact.
- Rename any visible “Revenue” label to “Completed service value” unless and
  until an authoritative collection/revenue contract exists.

## 5. Responsive and visual-system rules

- Validate at 320, 375, 640, 768, 1024, 1366, and 1920 px.
- No horizontal page overflow from 320 px upward. Tables may use an explicitly
  labelled local scroll region when card conversion would lose meaning.
- The header keeps brand, concise context/title where space allows, profile
  avatar, and hamburger. It must not crowd out the menu at 320 px.
- The hamburger drawer is the charcoal navigation surface. Keep focus trap,
  Escape, inert background, body scroll lock, and focus return.
- The decorative DoodleBoard rail may become charcoal/copper but stays
  `aria-hidden` and non-interactive; it collapses on narrow screens.
- Warm white/neutral is the default content background. Avoid black content
  cards except for one genuinely active operational focus such as a future
  protected in-service card.
- Copper is the primary action and active-selection color. Destructive actions
  retain an explicit danger treatment.
- Pastels are semantic accents, not page themes: selected context, open/success,
  warning/pending, error, or avatar preview.
- Prefer 3–6 px radii, fine borders, subtle or no shadow, and content-sized
  panels. Avoid rotated cards, dashed borders everywhere, thick black outlines,
  and large offset shadows.
- Keep one handmade detail per view: a short sketch underline, the avatar,
  barber-pole mark, or one note. Do not stack all four.
- Do not rely on color alone. Maintain text/icon/status labels and sufficient
  contrast, including copper on light surfaces and muted copy on charcoal.

## 6. Questions and risks for the implementing agent

### Critical flags

1. **Avatar reward enforcement is not authoritative yet.** The renderer is
   allowlisted, but the write schema and API accept a general string and the
   unlock count is derived in the client. Preserve, do not expand, and request a
   shared/backend contract before treating gear as protected progression.
2. **No new fake availability.** P2-07 is active in the backend lane. Do not
   infer next slots, distance, capacity, or wait time from current counts.
3. **No unsupported chair/walk-in actions.** “Start service,” “Add walk-in,” and
   similar prototype controls wait for Phase 3 protected commands.
4. **No literal prototype sidebar.** Global navigation remains the hamburger
   drawer.
5. **Scope global CSS.** A new Premium Studio stylesheet must be restricted to
   signed-in workspaces so it cannot change the public landing/auth notebook.
6. **Do not cut hidden-but-real workflows.** Job-seeker barber, owner provider,
   qualifications, shift requests, staff notes, join-code lifecycle, media
   moderation states, closures, ratings, and bug reporting all remain.
7. **Money copy must stay honest.** Do not use “revenue” for booked or completed
   service value.

### Questions that need an explicit answer before expanding scope

1. Should avatar gear remain a light visual reward for this release, or should
   the backend lane add an allowlisted avatar DTO and authoritative eligibility
   before the redesign is considered complete?
2. After P2-07 hands over its typed contract, should customer Discover remain a
   section of `/dashboard` for V1, or should a separate `/discover` route be a
   later information-architecture packet? This pass assumes the existing route.
3. Should `/dashboard` be relabelled “Today's Chair” in barber navigation later,
   or should “Today's Chair” remain an on-page heading until Phase 3 provides
   the actual chair lifecycle? This pass assumes no navigation change.
4. When other participants have a valid doodle `avatar_url`, should every
   booking/chat/staff person row migrate from initials immediately, or should
   that be a bounded follow-up after the shell and self-avatar are stable?

No question above blocks the first visual implementation pass under the stated
assumptions.

## 7. Reviewer checklist

### Feature preservation

- [ ] Routes, redirects, role locks, owner/no-shop behavior, and hamburger
  destinations are unchanged.
- [ ] Customer discovery keeps map/list, location fallback, search/filters/sort,
  favorites, details, directions, chat, real services/prices/ratings, calendar,
  and rewards.
- [ ] Bookings keep calendar/list, detail, cancellation, refresh, and separate
  ratings.
- [ ] Messages keep role context, unread/search, owner staff start, realtime
  dedup/read marking, quick replies, draft recovery, and safe unauthorized state.
- [ ] Settings keeps every subroute, search, account, avatar creator,
  notifications, security/session, and bug reporting.
- [ ] Barber job-seeker and employed branches both remain.
- [ ] Barber schedule is read-only except structured change requests.
- [ ] Owner overview, reservations, staff, hiring, barbers performance, and Shop
  Setup retain every existing real workflow.

### Avatar

- [ ] Header and drawer show the same saved `profile.avatar_url`.
- [ ] Header avatar links to `/settings/avatar` and is keyboard/screen-reader
  clear.
- [ ] Customer home and Settings use the same saved value.
- [ ] Premade/custom modes and all current parts, gear, preview, reset, save,
  disabled, busy, success, and error states remain.
- [ ] Invalid/null values fall back safely; no raw SVG/HTML is rendered.
- [ ] Cursor following is absent under reduced motion/non-fine pointer.
- [ ] No copy claims server-verified gear eligibility before the contract exists.

### Visual direction

- [ ] Signed-in shell is charcoal/copper/warm-neutral Premium Studio.
- [ ] Pastels are limited to status, selection, context, or avatar preview.
- [ ] Each view uses no more than one quiet hand-drawn accent.
- [ ] Cards are compact, bordered, and minimally shadowed; body/display copy is
  professional rather than handwritten.
- [ ] Landing/auth remains visually unchanged.

### Accessibility and responsive behavior

- [ ] Keyboard traversal reaches every enabled control; disabled controls are
  correctly exposed.
- [ ] Visible focus, accessible names, ARIA state, and status/alert
  announcements remain.
- [ ] Drawer and dialogs trap focus, close with Escape, restore focus, lock
  scroll, and inert the background.
- [ ] No nested interactive elements.
- [ ] Status is not communicated by color alone.
- [ ] Reduced motion is verified.
- [ ] 320, 375, 640, 768, 1024, 1366, and 1920 px are checked with no page-level
  horizontal overflow.

### Data and verification

- [ ] No invented wait, queue, distance, next-slot, capacity, money, or sample
  operational data is introduced.
- [ ] No page imports a concrete backend or bypasses `DataBackend`.
- [ ] Busy state prevents duplicate submit; stale conflict reloads authoritative
  state where supported.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and
  `git diff --check` results are recorded exactly.
- [ ] Browser console, narrow layout, keyboard, and reduced-motion evidence is
  recorded before the redesign is called ready for product review.

## 8. Handoff status

Requirements addressed: Premium Studio direction, feature-preservation review,
avatar/profile-picture placement and creator behavior, per-screen guidance,
risk/questions, and reviewer checklist.

Outcome: **READY FOR IMPLEMENTATION; NOT COMPLETE.**

Application-code changes in this review: none.

Packet status: unchanged. The redesign remains a frontend polish slice and does
not complete P2-07 or Phase 2.
