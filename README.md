# Barbershop Helper

A barbershop web app that tracks customers, shows barber availability, and has live chat. Hand-drawn "doodle" theme with GSAP animations.

## Stack

- **Frontend** (`apps/web`): React 19 + Vite + TypeScript, react-router-dom, GSAP.
- **Shared** (`packages/shared`): TypeScript types, DTOs, and the data-access service interfaces shared across web (and later the mobile app + API).
- **Backend** (`apps/api`): thin Express + TypeScript API holding the Supabase service-role key server-side.
- **Data**: Supabase — Postgres + Auth secured with Row-Level Security. Chat uses authenticated polling through `ApiBackend` today.

## Phased build

- **Phase 1:** the site can run against a **mock data layer** (in-memory + `localStorage`) with no backend.
- **Phase 2 (local setup complete):** Supabase migrations, the Express API, and
  `ApiBackend` are implemented and verified against local Supabase for customer,
  barber, and owner roles. Flip `VITE_DATA_BACKEND=api` and set
  `VITE_API_BASE_URL`. See [local verification](docs/LOCAL-SUPABASE-VERIFICATION.md).

## Getting started

```bash
npm install
npm run dev        # starts the Vite dev server (apps/web)
```

Copy `.env.example` to `.env` if you want to override defaults. The app defaults
to the mock backend, so no env is required unless using the Express API.

## Project guides

- [Authoritative V1 five-phase implementation plan](plans/README.md)
- [Open product clarifications](plans/OPEN-QUESTIONS.md)
- [Interactive system visualization](docs/PROJECT-VISUALIZATION.html)
- [Documentation hub and study order](docs/README.md)
- [System flowcharts](docs/01-SYSTEM-FLOWCHARTS.md)
- [Detailed workflows](docs/04-DETAILED-WORKFLOWS.md)
- [Database design](docs/05-DATABASE-DESIGN.md)
- [Historical digital roadmap](docs/07-DIGITAL-ROADMAP.md)
- [Code patterns](docs/CODE-PATTERNS.md)
- [Security contract](docs/SECURITY.md)
- [Credential audit](docs/SECURITY-CREDENTIAL-AUDIT.md)
- [Role and location guardrails](docs/ROLE-AND-LOCATION-GUARDRAILS.md)
