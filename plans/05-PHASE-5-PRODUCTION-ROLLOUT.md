# Phase 5 — production hardening and rollout

## Outcome

Phase 5 turns the accepted V1 feature set into a release that can be deployed,
observed, recovered, and rolled back safely. It does not add a new product
domain. Any feature that misses its earlier gate is disabled honestly rather
than represented by a placeholder.

## 1. Final contract and scope freeze

- Freeze shared API schemas and migration order for the release candidate.
- Remove legacy appointment status aliases from storage and active queries after
  compatibility verification.
- Make API/backend mode the production default; mock remains explicit local
  development only and contains no bundled credentials or activity.
- Remove placeholder shop/queue/gallery/notification/analytics controls and
  canned conversation data.
- Confirm post-V1 items are absent or behind disabled feature flags with no
  misleading call to action.

## 2. Automated verification matrix

### Shared/unit

- Pure lifecycle, capability, availability, assignment, cancellation/no-show,
  rating eligibility, metrics, retention, and permission helpers.
- DTO/Zod boundaries, normalization, timezone/date logic, money integer logic,
  public/private projections, and stable error codes.

### Database/RLS

- Customer, barber, owner, admin, anonymous, and service worker against every
  table/view/RPC.
- Cross-shop IDs, former employment, suspended account, unpublished shop,
  unclaimed walk-in, foreign appointment, direct insert/update, and audit-event
  mutation attempts.
- Concurrency for provider, customer, chair, hiring opening, join code, request
  expiry, idempotency key, closeout, payment correction, and review uniqueness.

### Express/API

- JWT missing/expired/forged, role/capability denial, ownership, pagination,
  validation, oversized bodies/files, rate limits, stale versions, idempotent
  replay, safe error JSON, and service-role isolation.
- API contract snapshots match shared schemas and adapters.

### End-to-end/browser

- Customer, barber, owner, pending/rejected/suspended professional, and admin.
- Manual/instant booking, exact/preferred/any assignment, lifecycle, walk-in,
  change proposal, disruption, no-show/appeal, dispute/escalation, rating,
  payment record/correction, closeout, messages, settings, and notification.
- Refresh/deep link, two-tab stale state, offline/reconnect, slow network,
  duplicate click, expired session, and provider-delivery failure.

### Accessibility/browser/device

- Keyboard only, screen reader smoke, 200% zoom, reduced motion, high contrast,
  readable-font mode, mobile touch targets, chart tables, focus restoration, and
  status/error announcement.
- Current supported Chromium, Firefox, and WebKit/Safari-compatible matrix,
  Android/iOS viewport/device smoke, and 320 px minimum width.

## 3. Security release gate

- Secret and credential scan, dependency audit, lockfile review, and container
  image scan.
- Verify `.env.example` documents only placeholders and production secrets use a
  managed secret store.
- Supabase service-role key exists only in server runtime.
- CSP, CORS, security headers, upload signature/MIME/size/scan checks, XSS/input
  output review, redirect safety, and rate limiting pass.
- Admin MFA, session/device review, least privilege, sensitive-evidence access
  logs, and break-glass procedure pass.
- RLS and Express authorization matrix is run in CI against a clean database.
- Penetration test or structured security review covers IDOR, tenant crossing,
  file upload, OTP abuse, join-code brute force, spam, and command replay.

## 4. Data, migration, backup, and recovery

- Rehearse every migration from a production-like snapshot in staging.
- Run verification queries for row counts, foreign keys, canonical states,
  snapshots, aggregates, and RLS enablement after migration.
- Document forward fix/compensating migration for each non-reversible step; do
  not rely on destructive rollback.
- Enable backups/PITR appropriate to the chosen Supabase plan.
- Perform and time a restore drill, including private storage references and
  post-restore secret/session rotation.
- Test retention jobs, legal hold, anonymized account deletion, export, and
  backup-expiry behavior.

## 5. Worker and operations hardening

Move time-based work out of a fragile in-process interval into a durable,
observable scheduler/worker appropriate to deployment:

- request expiry;
- completion timeout;
- closeout;
- notification delivery/retry;
- verification evidence purge;
- retention/anonymization;
- aggregate refresh/reconciliation.

For each worker define ownership, lock/lease, idempotency key, retry/backoff,
dead-letter/attention behavior, alert threshold, runbook, and dashboard.

## 6. Observability and support

Monitor without logging secrets, OTPs, document URLs, message bodies, or other
unnecessary private data.

Required service indicators:

- API error/latency by route family;
- authorization denials and suspicious enumeration;
- booking slot conflicts and stale-command rate;
- outbox backlog, delivery failure, and OTP failure;
- closeout/retention worker lag;
- unresolved attention/dispute/moderation backlog;
- verification queue age and evidence purge failures;
- payment correction/refund volume;
- database saturation and slow queries;
- web vitals, route bundle failures, and client error rate.

Create runbooks for auth outage, database degradation, worker backlog, email/OTP
provider failure, malicious upload, leaked secret, bad migration, cross-tenant
incident, and accidental suspension/closure.

## 7. Performance budgets

Set measured budgets before final optimization. At minimum track:

- landing initial JS/CSS/image transfer and interaction time;
- customer, barber, owner, and admin lazy-route chunks independently;
- largest contentful image and map loading behavior;
- dashboard query count/latency and chart render time;
- long-list pagination and memory;
- animation CPU while scrolling and when tab is hidden.

Keep the doodle visual identity, but offscreen animation pauses, reduced-motion
is static, images are correctly sized/lazy, and heavy decorative libraries do
not enter unrelated role bundles.

## 8. Staging, release, and rollback

1. Create clean staging Supabase/API/web environments with production-like
   configuration and no real customer data.
2. Run migration, seed only non-credential reference data, and execute the full
   automated matrix.
3. Complete a multi-day soak using synthetic role activity and worker failures.
4. Review security/privacy/legal, support readiness, and product acceptance.
5. Release behind domain feature flags where a safe gradual rollout is possible.
6. Monitor defined thresholds; pause/disable a domain rather than corrupt data.
7. Use compensating migrations and feature flags for rollback. Never run a
   destructive reset against production.

Suggested rollout order:

```text
internal admin -> invited pilot shop -> small customer cohort
-> all verified pilot users -> general availability
```

## 9. Release documentation

Before launch, update:

- architecture and code patterns to match actual adapters/statuses;
- API route and error contract;
- schema/RLS catalogue and migration ledger;
- user-facing help for verification, booking, walk-in, disputes, ratings,
  payments, privacy, and account deletion;
- owner/barber operating guides;
- incident, support, recovery, and privacy runbooks;
- changelog and known limitations.

## 10. Final V1 acceptance journey

The release candidate must pass this connected story without SQL or hidden
admin fixes:

1. Owner signs up, verifies, creates/publishes shop, services, hours, chairs,
   policies, photos, and hiring state.
2. Barber verifies, creates job profile, applies/is invited/uses code, is
   approved, receives shifts and qualification.
3. Customer discovers the shop and completes exact, preferred, or any-barber
   booking under manual/instant policy.
4. Owner accepts/assigns; barber and customer receive durable state.
5. Customer checks in; barber starts, proposes an approved change, and finishes.
6. Customer confirms or disputes; dispute follows owner/admin path.
7. Staff records offline collection and a correction/refund if needed.
8. Customer leaves a verified rating; shop responds; moderation is tested.
9. A walk-in claims by QR/OTP, completes, and receives correct rating access.
10. A delayed/absent barber and a closure resolve affected bookings without
    silent changes.
11. Closeout produces only safe transitions and attention tasks.
12. Owner analytics reproduce the final facts and separate value/collection.
13. Employment end removes access and resolves future appointments.
14. Export/deletion/retention, backup restore, worker failure, and rollback drill
    pass.

## Exit gate

V1 is ready only when:

- all phase gates and the final journey pass;
- tenant, professional, admin, and public boundaries hold through Express and
  direct RLS tests;
- migrations and restore drill meet the accepted recovery targets;
- operations can detect and respond to worker/provider/security failures;
- accessibility, mobile, browser, and performance budgets pass; and
- no deferred feature is represented by fake state or a nonfunctional control.

Final production release still requires the product owner's explicit approval.
