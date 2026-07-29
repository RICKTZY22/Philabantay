# Test catalog and findings

This folder documents **every automated test in the project**, grouped by the
phase and packet it protects, plus the findings that came out of writing and
running them. It is the human-readable companion to
[../plans/ROADMAP-STATUS.md](../plans/ROADMAP-STATUS.md) and
[../plans/QA-TRACEABILITY-MATRIX.md](../plans/QA-TRACEABILITY-MATRIX.md).

Legend: ✅ passing · ⏭️ gated (needs local Supabase) · ⬜ not written yet.

## Files

- [PHASE-1-TESTS.md](PHASE-1-TESTS.md) - foundation and identity (P1-01…P1-07).
- [PHASE-2-TESTS.md](PHASE-2-TESTS.md) - shops, workforce, availability (P2-01…P2-08).
- [PHASES-3-5-PLANNED.md](PHASES-3-5-PLANNED.md) - booking, trust, rollout (no tests yet).

## How the suites are wired

The project runs three Vitest projects plus one gated integration layer.

| Suite | Command | Environment | Notes |
| --- | --- | --- | --- |
| Shared logic | `npm run test -w @barbershop/shared` | node | Pure functions, schemas, DTO guards, ApiBackend client. |
| API boundary | `npm run test -w @barbershop/api` | node | Express routes with Supabase mocked; integration files are skipped unless enabled. |
| Web guards | `npm run test -w @barbershop/web` | node | Access-lock predicates. |
| Local Supabase matrix | `RUN_LOCAL_SUPABASE_TESTS=1 npm run test -w @barbershop/api` | Docker + `supabase start` | Real Postgres, real RLS, real JWTs. Requires a clean `supabase db reset`. |

Integration tests are gated behind `RUN_LOCAL_SUPABASE_TESTS=1` so a normal
`npm test` stays fast and never needs Docker. When the flag is off, those files
report as **skipped**, not failed.

## Latest authoritative run (2026-07-29)

Measured this session against a local database carrying every migration
through `20260728000700_p2_06_narrowed_hours_conflict_guard.sql`:

```text
shared   56 passed  (6 files)
api      28 passed | 41 skipped  (integration gated off)
web      40 passed  (3 files)
-------------------------------------------------
default fast total           124 passed

api with RUN_LOCAL_SUPABASE_TESTS=1 + Docker
         69 passed  (28 boundary + 41 local-Supabase integration)
         run twice back to back, no reset between runs
```

So the full picture with the integration layer enabled is **shared 56 + api 69 +
web 40 = 165 passing**, zero failing. Typecheck, lint, API/web production
builds, and `supabase db lint` (no schema errors) passed in the same session.

Web moved from 32 to 40 with the 2026-07-29 landing work: the
`philippineHeroTime` schedule gained its own suite. The older 116 / 157 totals
still appear in dated evidence blocks below and in the session log, which are
historical records and are left as written.

### Why "69/69" and "124" both appear

- **124** is the everyday fast total (`npm test` with no Docker): 56 + 28 + 40.
- **69** is the API workspace when the gate is on: the same 28 boundary tests
  plus the 41 integration tests that are otherwise skipped. That 69 is the
  security "matrix" number quoted in the roadmap.

### Open gap: clean-replay proof stops at `20260728000600`

The last recorded clean `supabase db reset` was on 2026-07-28 through
`20260728000600`. `20260728000700` arrived afterwards and is applied locally,
but no run has yet proven the full chain replays from an empty database through
it. Close this with a reset before P2-07 is called done. It was deliberately
not run on 2026-07-29 because a reset would destroy the seeded owner/barber
accounts and the dev shop that the pending P2-06 product-owner pass needs.

## Reproducing the full matrix

```bash
supabase start
supabase db reset            # proves clean migration replay
RUN_LOCAL_SUPABASE_TESTS=1 npm run test -w @barbershop/api
RUN_LOCAL_SUPABASE_TESTS=1 npm run test -w @barbershop/api  # repeatability proof
```

The matrix archives exact-name fixtures before setup and archives the current
published fixtures in `afterAll`. This makes an immediate rerun deterministic
and also recovers from an interrupted previous run.
