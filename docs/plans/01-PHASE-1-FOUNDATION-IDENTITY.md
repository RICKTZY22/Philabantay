# Phase 1 — foundation, contracts, and verified identities

## Outcome

At the end of Phase 1, professional access is impossible to self-grant, every
protected command has a clear capability and tenant rule, an administrator can
review evidence without SQL, and the existing appointment lifecycle has one
canonical contract across shared code, Express, and Postgres.

This phase stabilizes the foundation. It does **not** redesign every dashboard
or rebuild lifecycle work already present.

## Current foundation to preserve

- Supabase Auth, public profiles, Express JWT verification, service-role server
  client, RLS, and three-role local verification are present.
- Canonical appointment lifecycle, versioned command RPCs, events, check-in,
  start/finish, completion confirmation/timeout, dispute, no-show, snapshots,
  and owner reassignment exist in migrations/API.
- React uses `DataBackend`; pages must remain adapter-independent.
- Demo accounts and fake transactional seeds were removed. Do not add them back.

## Known Phase 1 defects

1. Shared/UI compatibility still accepts legacy `pending` and `no_show`; some
   API queries use them even though Postgres now uses `requested` and
   `customer_no_show`.
2. `/availability/slots` queries `pending`, which can fail against the migrated
   enum; performance analytics also counts legacy `no_show`.
3. Direct authenticated appointment inserts can bypass parts of Express
   bookability validation.
4. Owner applicants are locked more strictly than barber applicants; there is
   no complete evidence submission or resubmission workflow.
5. `admin` exists as a role but has no UI, review queue, or audited platform
   authorization path.
6. A scalar role alone cannot safely express "owner who also performs cuts."
7. Former or suspended staff can retain access through relationships that are
   not rechecked at command time.
8. The shared contract lacks several owner, verification, preferences, and
   admin operations already needed by real UI.
9. Several older docs describe the pre-2026-07-18 lifecycle and can mislead an
   agent into rebuilding working code.

## Work packages

### P1.1 — checkpoint and contract freeze

- Record the current dirty worktree and identify which changes belong to other
  agents. Never reset or overwrite unrelated work.
- Add one canonical appointment status type for new writes. Keep a narrow input
  normalizer only during the compatibility window; no new UI branch may use
  legacy names.
- Reconcile shared entity fields with migrations, including explicit shop IDs,
  employment IDs, versions, and public/private projections.
- Define capability helpers in shared code instead of scattered role checks.
- Define command error codes for stale state, verification lock, shop scope,
  policy denial, idempotent replay, and capacity conflict.
- Add contract tests that run against `ApiBackend` and any retained mock adapter.
  The mock is a development aid, never the security or production default.

### P1.2 — authorization and tenancy repair

- Keep primary account role for navigation, but add shop-scoped service-provider
  and narrow cashier capabilities. Never implement unsafe role switching.
- Enforce V1 constraints: one shop owned by one owner account and one active
  employment for an ordinary barber.
- Create shared authorization predicates and mirror them in Express and SQL.
- Revoke direct appointment insert/update policies that bypass command RPCs, or
  route all permitted direct creation through an RPC that proves the complete
  invariant. Prefer the command-only path for sensitive tables.
- Make appointment events append-only for all normal principals; service-role
  maintenance must be explicit and audited.
- Recheck active employment, verification, and suspension on every staff/chat/
  booking command. Closing employment removes staff-thread authorization.
- Add direct-RLS and Express tests for cross-shop IDs, stale sessions, suspended
  professionals, forged roles, and guessed resource IDs.

### P1.3 — verification data and private storage

Add forward-only migrations for:

```text
verification_submissions
- id, user_id, requested_role
- status: draft | pending | needs_information | approved | rejected | withdrawn
- legal_name, versioned form_data
- submitted_at, reviewed_at, reviewed_by, review_reason, version

verification_documents
- id, submission_id, document_type, storage_path
- detected_mime, size_bytes, sha256, scan_status, uploaded_at, purge_after

verification_events
- id, submission_id, actor_id, event_type, reason, metadata, created_at

account_capabilities
- id, user_id, shop_id nullable, capability, state, granted_by, granted_at, revoked_at
```

Required properties:

- At most one active draft/pending/needs-information submission per user/role.
- Applicant cannot review their own submission.
- Evidence bucket is private; signed URLs are short-lived and only issued after
  an audited reviewer authorization check.
- File signature, detected MIME, maximum size, malware/scan state, checksum, and
  duplicate handling are server-controlled.
- Approval transaction grants the professional role/capability and creates the
  barber extension or owner eligibility exactly once.
- Rejection, request-information, suspension, restoration, and withdrawal append
  events and require reason codes.
- A scheduled retention job deletes raw evidence 90 days after final decision,
  except an explicit legal hold; decision/audit facts remain.

### P1.4 — Express and `DataBackend` contract

Add versioned operations equivalent to:

```text
GET    /api/v1/verification/me
POST   /api/v1/verification/submissions
PATCH  /api/v1/verification/submissions/:id
POST   /api/v1/verification/submissions/:id/documents/request-upload
POST   /api/v1/verification/submissions/:id/submit
POST   /api/v1/verification/submissions/:id/withdraw

GET    /api/v1/admin/verifications?role=&status=&cursor=
GET    /api/v1/admin/verifications/:id
POST   /api/v1/admin/verifications/:id/request-information
POST   /api/v1/admin/verifications/:id/approve
POST   /api/v1/admin/verifications/:id/reject
POST   /api/v1/admin/users/:id/suspend
POST   /api/v1/admin/users/:id/restore
```

Rules:

- Every body/query/response projection has a shared Zod schema.
- Admin list responses never include document bytes or reusable public URLs.
- Review commands use expected versions and idempotency keys.
- Public rejection text is separated from private reviewer notes.
- Audit log includes viewer access to sensitive evidence, not only decisions.
- `VerificationService` and `AdminService` are added to `DataBackend`; pages do
  not call fetch directly.

## Frontend build contract

### Routes

```text
/onboarding/role
/verification
/verification/application
/verification/evidence
/verification/status
/admin/verifications
/admin/verifications/:submissionId
/admin/users/:userId
```

All role bundles remain lazy. `/admin/*` is an isolated, admin-guarded bundle.
Legacy verification links redirect to the canonical route.

### Hamburger navigation by account state

| State | Visible destinations |
| --- | --- |
| Customer | Existing customer menu. |
| Pending/rejected/suspended barber or owner | Verification/status, Help, Sign out only. |
| Verified owner without shop | Shop setup (Phase 2), Verification status, Notifications, Settings. |
| Admin | Review queues, Disputes (Phase 4), Moderation (Phase 4), Suspensions, Audit/operations, Settings, Sign out. |

Pending professionals must not see a flash of privileged or customer-dashboard
content while the session loads.

### Verification workspace

Desktop uses a wide application card with form/status in the main column and a
compact checklist/help panel. Mobile presents one logical section per screen.
The UI supports:

- role-specific requirements before upload;
- save/resume draft;
- document upload progress, cancel, individual retry, replace, and delete;
- submitted/under-review timeline;
- needs-information response and resubmission;
- rejection reason and permitted retry date;
- suspended state and appeal/help route; and
- sign out from every locked state.

It must render loading, empty draft, validation error, upload error, scan
pending/failed, stale version, forbidden, network retry, and success states.
Local component state may hold unsaved form text, never the approval truth.

### Admin verification workspace

- Queue filters: role, status, age, resubmission, and assigned reviewer.
- Table/list rows: applicant, requested role, submitted time, status, risk flags.
- Detail: applicant form, document checklist, decision/event timeline, public
  reason, private note, and decision controls.
- Evidence is loaded on demand into a protected viewer; it is not prefetched.
- Approve/reject/request-information dialogs require explicit reason where
  appropriate and show the exact capability change.
- Mobile uses full-screen detail and evidence view; desktop uses queue + detail.

### Frontend acceptance checks

- Directly opening an owner/barber/admin URL while unverified produces the lock,
  not hidden content and not an endless redirect.
- Refreshing after admin approval obtains the new trusted profile once and sends
  the owner to Shop Setup or barber to the verified job-seeker home.
- Duplicate submit/approve taps create one submission/decision.
- Keyboard focus, labels, upload error association, status announcements,
  reduced motion, and 320 px layout pass.
- Sign out always works even when every other account operation is denied.

## Test matrix

| Layer | Required tests |
| --- | --- |
| Shared | Status normalization, capability predicates, validation, public projections. |
| Database | Unique active submissions, atomic promotion, RLS isolation, append-only events, evidence metadata, retention legal hold. |
| Express | Applicant/admin authorization, cross-user IDs, stale versions, idempotent replay, safe error shape. |
| Adapter | `VerificationService` and `AdminService` contract parity. |
| Browser | Barber and owner submit/resubmit; admin approve/reject/request info; lock and unlock; direct URL denial. |
| Security | File polyglot/oversize/spoof tests, signed-URL expiry, evidence-view audit, no service key in web bundle. |

## Recommended execution order

1. Freeze canonical statuses and fix legacy production queries.
2. Define capability and tenant contract.
3. Close direct-write, former-staff, suspension, and event immutability gaps.
4. Migrate verification schema and private bucket policies.
5. Build Express commands and shared adapters.
6. Build applicant UI, then admin UI.
7. Run RLS/API/browser/security matrix and update current-state docs.

## Exit gate

Phase 1 is complete only when:

- barber and owner can submit evidence and be approved without SQL/dashboard
  edits;
- pending/rejected/suspended professionals cannot reach operational features;
- owner-as-service-provider is possible only through an explicit shop-scoped
  capability, not a client-selected role;
- a second V1 owner shop and second active ordinary-barber employment are denied;
- all known legacy-status queries use canonical values;
- direct-table and Express cross-tenant/bypass tests fail closed;
- evidence access and retention cleanup are tested; and
- no seeded account, password, API key, JWT secret, database password, or
  service-role value is committed.

The product owner reviews this checkpoint before Phase 2 begins.
