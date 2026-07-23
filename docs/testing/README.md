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

## Latest authoritative run (2026-07-24)

Measured this session, on branch `phase-2-shops`:

```text
shared   42 passed  (6 files)
api      25 passed | 29 skipped  (integration gated off)
web      19 passed  (1 file)
-------------------------------------------------
default unit total            86 passed

api with RUN_LOCAL_SUPABASE_TESTS=1 + Docker
         54 passed  (25 boundary + 29 local-Supabase integration)
```

So the full picture with the integration layer enabled is **shared 42 + api 54 +
web 19 = 115 passing**, zero failing, on a clean local-Supabase reset (migrations
through `20260722002000`).

### Why "54/54" and "86" both appear

- **86** is the everyday unit total (`npm test` with no Docker): 42 + 25 + 19.
- **54** is the API workspace when the gate is on: the same 25 boundary tests
  plus the 29 integration tests that are otherwise skipped. That 54 is the
  security "matrix" number quoted in the roadmap.

## Reproducing the full matrix

```bash
supabase start
supabase db reset            # clean migration replay; required for exact-set assertions
RUN_LOCAL_SUPABASE_TESTS=1 npm run test -w @barbershop/api
```

A clean reset matters: the integration fixtures create shops in `beforeAll` but
do not delete them in an `afterAll`, and a few catalogue assertions check the
**exact set** of public shops. Running the matrix twice without a reset makes
those exact-set checks see leftover rows and fail. That is a test-hygiene
artifact, not a product defect (see the findings section of each phase file).
