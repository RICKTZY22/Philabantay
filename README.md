# Barbershop Helper

A barbershop web app that tracks customers, shows barber availability, and has live chat. Hand-drawn "doodle" theme with GSAP animations.

## Stack

- **Frontend** (`apps/web`): React 19 + Vite + TypeScript, react-router-dom, GSAP.
- **Shared** (`packages/shared`): TypeScript types, DTOs, and the data-access service interfaces shared across web (and later the mobile app + API).
- **Backend** (`apps/api`, Phase 2): thin Express + TypeScript API holding the Supabase service_role key.
- **Data** (Phase 2): Supabase — Postgres + Auth + Realtime, secured with Row-Level Security.

## Phased build

- **Phase 1 (current): frontend-first.** The whole site runs against a **mock data layer** (in-memory + `localStorage`), so every feature works with no backend. Components only call the service interfaces in `packages/shared`.
- **Phase 2:** implement those same interfaces against real Supabase + add the Express API. Flip `VITE_DATA_BACKEND=supabase`. No component changes.

## Getting started

```bash
npm install
npm run dev        # starts the Vite dev server (apps/web)
```

Copy `.env.example` to `.env` if you want to override defaults. In Phase 1 the app defaults to the mock backend, so no env is required.

## Project guides

- [Code patterns](docs/CODE-PATTERNS.md)
- [Security contract](docs/SECURITY.md)
- [Role and location guardrails](docs/ROLE-AND-LOCATION-GUARDRAILS.md)
