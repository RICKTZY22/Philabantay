# Role and Location Guardrails

This is the production security contract for the Supabase/Express phase. The
frontend can improve UX, but it must never be the authority that grants roles,
verifies shops, or publishes locations.

## Non-negotiable Rules

1. Every signup starts with customer-level permissions.
2. `barber` and `shop_owner` are requests until a trusted server review grants them.
3. A user cannot update `profiles.role`, application status, or verification fields.
4. A shop is not searchable or bookable until its status is `verified`.
5. A shop owner is authorized through a verified shop membership, not by a global role alone.
6. The Supabase secret/service key stays in Express or an Edge Function and never enters Vite.
7. Never authorize from `user_metadata`; users can edit it. Use database records,
   RLS, and server-written claims only.

## Suggested Tables

### `profiles`

- `id uuid primary key references auth.users`
- `role customer | barber | shop_owner | admin`
- `onboarding_completed boolean`
- Public profile fields only

The browser may edit safe profile fields such as display name. It cannot edit `role`.

### `role_applications`

- `id`, `user_id`, `requested_role`
- `status pending | approved | rejected | suspended`
- `submitted_at`, `reviewed_at`, `reviewed_by`
- `phone_verified_at`, `email_verified_at`
- Evidence references and reviewer notes

Add a partial unique constraint so one user cannot have multiple pending
applications. Approval must be an atomic server/database transaction that closes
the application, grants the role, and writes an audit event.

### `shops`

- `id`, `legal_name`, `display_name`, `owner_user_id`
- `status draft | pending | verified | rejected | suspended`
- Structured address fields
- Provider `place_id` or equivalent stable location ID
- A PostGIS `geography(Point, 4326)` value derived by the server
- `location_verified_at`, `verified_by`

Only verified rows are public. Do not accept final latitude/longitude as truth
from the browser.

### `shop_memberships`

- `shop_id`, `user_id`
- `role owner | manager | barber`
- `status invited | pending | active | suspended`

Every shop-scoped RLS policy must check an active membership for that exact shop.

### `security_events`

Append-only events for role decisions, location changes, repeated submissions,
suspensions, and admin actions. Never let clients update or delete these rows.

## Signup and Role Flow

1. Protect signup with Cloudflare Turnstile or hCaptcha and Supabase Auth rate limits.
2. Require email confirmation for all accounts.
3. Customer selection activates immediately.
4. Barber/shop owner selection creates one pending role application.
5. Require verified phone OTP before accepting professional evidence.
6. Apply cooldowns and per-user/per-IP limits to application and shop endpoints.
7. Approval runs only in Express/Edge Function using a server secret.

## Location Verification

1. Client submits an address search result and provider place ID, not trusted coordinates.
2. Express geocodes the place ID again and stores server-derived coordinates.
3. Reject duplicate active `place_id` values and suspiciously repeated addresses.
4. Require proof of shop ownership or a manual/video review before publishing.
5. Material address or coordinate changes return the shop to `pending`.
6. Use PostGIS + a GIST index for radius searches and geographic constraints.

GPS proves where a device was at one moment; it does not prove shop ownership.
Treat GPS as supporting evidence only.

## RLS Baseline

- Enable RLS on every exposed table.
- Profiles: owner can update only an allowlist of non-privileged columns.
- Role applications: user can insert/read their own; only server/admin can change status.
- Shops: public can read verified shops; members can read their own pending shop.
- Memberships: users can read their own; only trusted invitation/approval flow can write.
- Bookings: both sides can read only rows they participate in.
- Security events: server/admin insert and read only.

The React `RequireAuth` component is navigation UX, not a security boundary.

## Abuse Controls

- CAPTCHA on signup, sign-in, and password recovery.
- Auth rate limits plus API rate limits by account, IP, and action.
- Idempotency keys for role application and shop creation.
- One pending professional application per account.
- Cooldown after rejection and escalating limits for repeated failures.
- Email/phone uniqueness where product policy permits it.
- Report, suspend, and appeal workflows with an audit trail.
- Alerts for many shops at one coordinate, rapid coordinate changes, or many
  accounts from the same device/network. Use risk signals for review, not automatic
  guilt, because shared networks are common.

## Official Supabase References

- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- RBAC/custom claims: https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac
- CAPTCHA: https://supabase.com/docs/guides/auth/auth-captcha
- Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
- PostGIS: https://supabase.com/docs/guides/database/extensions/postgis
