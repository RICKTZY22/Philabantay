# Philabantay security contract

> Current status: the Express/Supabase backend and `ApiBackend` now exist. This
> file remains the concise coding contract; see
> [06-SECURITY-DESIGN.md](06-SECURITY-DESIGN.md) for the current control matrix,
> planned verification/upload design, threat model, and release gates.

## Current backend boundaries

The optional `mock` data backend runs entirely in the browser and is suitable
for local demonstrations only. Browser storage is controlled by the user and is
not an authentication or authorization boundary. Real accounts, secrets,
payments, verification evidence, and sensitive production data must not be
stored in this mode.

`VITE_DATA_BACKEND=api` (and the `supabase` alias) selects the implemented
`ApiBackend`, which calls the Express REST API. It fails closed when
`VITE_API_BASE_URL` is missing. Express verifies Supabase bearer tokens, applies
role/ownership checks, validates strict shared schemas, and uses the service-role
key only on the server. Postgres RLS, constraints, triggers, and transactional
RPCs provide the second boundary. Never silently fall back to mock mode in a
production-looking deployment, and never expose the service-role key through a
`VITE_` variable.

## XSS rules

- Render user/backend text through React text nodes. Do not add
  `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, or string-built DOM.
- Build dynamic DOM labels with `textContent`; map pins and tooltips follow this.
- Encode backend IDs before using them as route segments and build query strings
  with `URLSearchParams`.
- Keep the production CSP and response headers in `apps/web/public/_headers` in
  the actual hosting provider configuration. Vite preview also serves them.
- If rich-text input is added, sanitize it with a maintained allowlist sanitizer
  before rendering; ordinary input validation is not an HTML sanitizer.

## CSRF and authenticated request rules

The current API uses an explicit bearer token, so classic ambient-cookie CSRF is
reduced, but XSS/token theft and server authorization remain critical. Tokens
must not appear in URLs or logs. If a cookie-authenticated session is adopted,
the server must additionally enforce all of these:

1. Use a `Secure`, `HttpOnly`, `SameSite=Lax` or `Strict` `__Host-` session cookie.
2. Accept mutations only on `POST`, `PUT`, `PATCH`, or `DELETE`; never mutate on GET.
3. Validate `Origin` (and `Referer` as a fallback) against an exact allowlist.
4. Issue and validate a session-bound CSRF token on every unsafe request, normally
   sent by the frontend in `X-CSRF-Token`.
5. Accept JSON for API mutations and reject simple cross-origin form content types.
6. Use an exact CORS origin allowlist; never combine credentialed requests with `*`.
7. Recheck the authenticated identity and authorization/RLS policy server-side for
   every booking, chat, favorite, role, availability, and shop mutation.

Every authenticated mutation, bearer or cookie based, must still recheck the
identity, operational access, resource ownership/participation, and domain state.

## Deployment checklist

- Run `npm ci`, `npm audit --omit=dev`, typecheck, and build in CI.
- Serve only over HTTPS. Add HSTS only after every intended subdomain supports HTTPS.
- Verify the deployed responses contain CSP, `X-Content-Type-Options`, referrer,
  permissions, anti-framing, and cross-origin isolation headers.
- Add only the exact Supabase/API HTTPS and WSS origins required by the deployed
  adapter to `connect-src`; do not add wildcard origins.
- Run the cross-role/cross-shop Express and direct-RLS isolation suite.
- Verify the service-role key is absent from built frontend assets and source maps.
