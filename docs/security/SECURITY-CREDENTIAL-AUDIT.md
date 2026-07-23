# Credential and bundled-account audit

Section 1 of the July 2026 security pass removed every reusable account and
credential from version-controlled application data.

## Findings and resolution

| Finding | Previous location | Resolution |
| --- | --- | --- |
| Three reusable account emails and one shared password | `apps/web/src/config/demoAccounts.ts` | File deleted; the login form no longer contains one-click credential autofill. |
| The same accounts, a reusable PBKDF2 verifier, profile details, and a dependent shop catalogue | `apps/web/src/services/mock/seed.ts` | Seed is empty and credential-free at database version 19. Signup is the only account-creation path. |
| A fixed dummy password verifier used to equalize unknown-account timing | `apps/web/src/services/mock/passwords.ts` | The dummy salt and expected bytes are randomized at module startup; no reusable verifier remains in source. |
| Historical mock migrations referenced bundled account identifiers | `apps/web/src/services/mock/MockBackend.ts` | Exact account references were removed. The v19 migration detects the retired development email namespace, removes those accounts and dependent catalogue rows, and preserves user-created accounts. |
| Password-capable Auth users and identities | `supabase/seed.sql` | Seed is intentionally empty. It no longer creates Auth users, public profiles, shops, services, or employment rows. |
| Integration tests signed into seeded accounts with a shared password | `apps/api/test/local-supabase.integration.test.ts` | Tests generate unique users, emails, and a password at runtime through the Auth Admin API. Supabase URL and keys remain environment-only. |
| Unit fixtures embedded an account, password, and access/refresh-token strings | `packages/shared/test/ApiBackend.test.ts`, `apps/api/test/app.test.ts` | Identity, password, and token values are generated at test runtime. |
| Documentation published the reusable credentials | project guides and audit notes | Credential values and login instructions were removed; guides now describe signup and the credential-free seed. |

Removing the Supabase accounts also required removing their shop, services, and
employment rows because those records were foreign-key dependent. This is
intentional: Section 3 will add owner-driven shop creation instead of restoring
version-controlled shop data.

## Environment contract

The Express server reads `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` from its runtime environment. The service-role key
is server-only and must never use a `VITE_` prefix. `API_PORT` and `WEB_ORIGIN`
configure the listener and CORS origin.

The browser receives only `VITE_DATA_BACKEND` and `VITE_API_BASE_URL`; neither
is a credential. Docker-backed integration tests use the optional
`LOCAL_SUPABASE_URL`, `LOCAL_SUPABASE_PUBLISHABLE_KEY`, and
`LOCAL_SUPABASE_SECRET_KEY` variables documented in `.env.example`.

Real local values may exist in ignored `.env` files. `.gitignore` excludes
`.env` and `.env.*` while explicitly allowing only blank `.env.example` files.
No real key is present in an example file.

## Git-history note

All six reachable commits were scanned. No Supabase key, JWT, service-role
value, or credential-bearing database URL was found in Git history. Retired
development account names and their shared local-only password do remain in old
commits. They no longer correspond to seeded accounts after a database reset,
but removing the text from history would require a destructive history rewrite;
that rewrite was intentionally not performed as part of this source-tree pass.
