# Philabantay security contract

## Current demo boundary

The current `mock` data backend runs entirely in the browser. It is suitable for
local demonstrations only: browser storage is controlled by the user and is not
an authentication or authorization boundary. The app now hashes mock passwords
instead of persisting plaintext, but real accounts, secrets, payments, and
sensitive personal data must not be stored in this mode.

`VITE_DATA_BACKEND=supabase` deliberately fails closed until a real adapter is
implemented. Never silently fall back to the mock backend in a production-looking
deployment, and never expose a Supabase service-role key through a `VITE_` variable.

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

## CSRF rules for the future backend

The mock backend makes no authenticated HTTP mutations, so there is currently no
network CSRF endpoint. A frontend-generated token by itself would not add security.
When a cookie-authenticated backend is added, the server must enforce all of these:

1. Use a `Secure`, `HttpOnly`, `SameSite=Lax` or `Strict` `__Host-` session cookie.
2. Accept mutations only on `POST`, `PUT`, `PATCH`, or `DELETE`; never mutate on GET.
3. Validate `Origin` (and `Referer` as a fallback) against an exact allowlist.
4. Issue and validate a session-bound CSRF token on every unsafe request, normally
   sent by the frontend in `X-CSRF-Token`.
5. Accept JSON for API mutations and reject simple cross-origin form content types.
6. Use an exact CORS origin allowlist; never combine credentialed requests with `*`.
7. Recheck the authenticated identity and authorization/RLS policy server-side for
   every booking, chat, favorite, role, availability, and shop mutation.

If the production client uses an explicit bearer token instead of ambient cookies,
classic CSRF is reduced, but XSS/token theft and server-side authorization remain
critical. Tokens should still be short-lived and never logged or embedded in URLs.

## Deployment checklist

- Run `npm ci`, `npm audit --omit=dev`, typecheck, and build in CI.
- Serve only over HTTPS. Add HSTS only after every intended subdomain supports HTTPS.
- Verify the deployed responses contain CSP, `X-Content-Type-Options`, referrer,
  permissions, anti-framing, and cross-origin isolation headers.
- Add only the exact Supabase/API HTTPS and WSS origins to `connect-src` when the
  real adapter exists; do not add wildcard origins.
