# Hands-on change log (for Codex / next AI session)

Quick orientation for whoever picks this repo up next. This documents the two
big frontend passes done in July 2026 on top of the Phase 1 mock-backend app.
Read `docs/ARCHITECTURE.md` and `docs/CODE-PATTERNS.md` first for the big
picture; this file is only "what changed recently and where."

Everything below runs against the mock backend (`localStorage`, DB version
now **15**). The `DataBackend` contract in `packages/shared/src/services.ts`
is still the only thing the UI talks to.

## Customer-side pass

1. **Search bar** (`components/CustomerDashboard.tsx`, `components/DoodleBoard.tsx`)
   - Text search is fully decoupled from "Near me" GPS logic. Results appear
     in a dropdown box under the top-bar search input (`.cd-search-results`),
     not in the Discover map/list. Picking a result opens that shop's popup
     (switches to All PH if the shop is outside the nearby radius).
2. **Map** (`components/ShopMap.tsx`)
   - `scrollWheelZoom`, `touchZoom`, `dragging` enabled.
   - Hover on a pin shows a notebook-styled preview card (rating stars,
     status, city) — gated behind a `hoverPreview` prop that only the
     customer dashboard passes. Click still opens the full popup.
3. **Header** — customer top bar chip removed (`showUserChip={false}` on
   `DoodleBoard`), avatar label shows the user's name, Philabantay wordmark
   hidden on `/chat` for customer-role users only (`components/Layout.tsx`).
4. **Avatar studio** (`components/DoodleAvatar.tsx`,
   `pages/settings/AvatarSettingsPanel.tsx`)
   - New options: spiky hair, sleepy eyes, open mouth, blush, teal/red
     accents, and a 5-value **skin tone** category.
   - Avatar string format grew from 9 to 11 segments
     (`doodle:custom:...:skin:gear`); 9-part legacy strings still decode.
5. **Notebook UI** — chat (`pages/ChatPage.css`) and bookings
   (`pages/AppointmentsPage.css`) share the spiral-margin/ruled-cream-paper
   style of the map's shop popup (`.cd-shop-popup`).
6. **"Nearest barbers"** — the dashboard side list is barber-first
   (individual barbers + availability dot + their rating), not shop-first.

## Barber-side pass

1. **Stacked-notebook cards** — `.barber-paper-stack` / `-sm` utilities live
   in `theme/doodle.css`; applied across `BarberDashboard` and the Schedule
   page. Cards look like the top sheet of a paper stack.
2. **Shift calendar** (`components/BarberShiftCalendar.tsx`) — month grid
   generated from weekly rules + employment record. Markers: happy-face SVG
   on hire/stint-end dates, "Absent" labels, request-status dots. Day click
   opens a detail card. Used on the barber home (read-only) and the Schedule
   page (with a change-request form).
3. **Barber home** — bookings list shows only customer/service/time; the
   Shop conversations card was removed entirely.
4. **Barber chat** — same notebook treatment as customers but green "shop
   desk" scheme. Mechanism: `data-notebook="customer|barber"` attribute +
   CSS variables (`--nb-*`) in `pages/ChatPage.css`.
5. **Schedule page** (`pages/DashboardPage.tsx` — yes, that file is the
   /schedule route) — notebook redesign, shift calendar with per-day
   **shift change requests** (owner approves; see gaps below), and an
   **attendance card** (this month + whole tenure, present/absent + rate).
6. **Automatic shift end** — the "End shift" button is gone. Barbers only
   "Start shift"; being on the chair = started AND within scheduled hours
   (live-derived). `MockBackend.setShiftStatus(false)` throws during
   scheduled hours.
7. **Barber avatar gear** — separate catalogue from customer gear:
   shears (1 cut served), shoulder towel (3), shop badge (10). Role-gated in
   the studio AND in `MockBackend.updateProfile` (customer gear counts cuts
   received; barber gear counts cuts served).

## Data model additions (mock DB v15)

New shared types (`packages/shared/src/types.ts`):
- `BarberEmployment` — one record per shop stint (`hired_at`, `ended_at`).
  `joinWithCode` closes the old stint and opens a new one → per-shop
  attendance reset happens structurally.
- `BarberAbsence` — barber + shop + date (+ private reason).
- `ShiftChangeRequest` — barber + shop + date + message + status
  (`pending|approved|declined`).

New service methods on `BarberEmploymentService`: `getMyEmployment`,
`listMyAbsences`, `listMyShiftChangeRequests`, `requestShiftChange` — all
scoped to the ACTIVE employment record.

New pure rule: `summarizeBarberAttendance` in
`packages/shared/src/attendance.ts` (present = scheduled day without an
absence record; returns month + tenure summaries).

Seed (`services/mock/seed.ts`): employment stints for all 11 roster barbers;
demo Miguel has an ~8-month tenure, 3 absences, and 1 pending shift request.
Absence/hire dates are generated relative to the real clock (`demoDate`)
so the demo stays alive. Migration v15 upgrades existing browser data.

## Known gaps / intentional mock limitations

- **No owner approval UI**: shift change requests stay `pending` forever in
  the mock. The status model is ready for Phase 2 owner tools.
- **"Owner-assigned" shifts** are actually the barber's own weekly rules —
  the mock has no owner assignment flow.
- **Attendance is derived** (schedule minus absences), not clock-in based.
- **Gear unlock thresholds are duplicated** between `DoodleAvatar.tsx`
  (UI catalogues) and `MockBackend.ts` (enforcement) — same precedent as
  `DOODLE_AVATAR_PATTERN`; comments on both sides point at each other.
- Owner dashboard reservations/metrics/charts are still static sample data.

## Demo accounts

`customer@demo.test`, `miguel@demo.test` (barber), `owner@demo.test` —
password `demo1234`. Barber join codes: `TONDO26`, `SOUTH26`, `MAGIN26`.
