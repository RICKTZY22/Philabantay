# P1-02 / P1-05 professional verification contract

> **Contract freeze: 2026-07-22**  
> Status: implementation-ready for the Phase-1 backend and frontend lanes. Any
> behavior change must update this file, the shared contract, tests, and the
> dated decision log together.

This contract covers professional applicant access, barber/owner verification,
assigned administrator review, approval/rejection, suspension/restoration, and
private evidence handling. It does not implement employment/chat revocation
(P1-03) or the shop lifecycle (Phase 2).

**UI copy must derive from `verification_submissions.status`, not from the
profile-level `verification_status` lock.** A profile marked `pending` means the
professional request is locked; it does not prove evidence was submitted or a
reviewer has started work.

## 1. Sources and fixed decisions

This contract applies the accepted defaults in `OPEN-QUESTIONS.md`:

- Pending, rejected, and suspended barbers/owners have an absolute operational
  lock: verification/status, Help, and Sign out only.
- Admins are provisioned only by a secure server-side process.
- Admin MFA (`aal2`) is mandatory before evidence view or a decision.
- Every evidence view, assignment, decision, suspension, and restoration is
  audited.
- Owner identity approval does not publish or automatically create a shop.

## 2. Separate sources of truth

Keep these facts separate:

1. `users.verification_status` controls the account-wide professional lock.
2. `verification_submissions.status` controls the application/review workflow.
3. `account_capabilities` grants narrow, server-controlled authority.

The frontend may render server-returned `allowed_actions`; it must not recreate
approval, reviewer, evidence, or suspension rules locally.

## 3. State model

```text
draft
  -> pending              submit
  -> withdrawn            withdraw

pending
  -> needs_information    assigned reviewer requests changes
  -> approved             assigned reviewer approves
  -> rejected             assigned reviewer rejects
  -> withdrawn            applicant withdraws

needs_information
  -> pending              applicant resubmits the same case
  -> withdrawn

rejected
  -> new draft            after retry_after; new linked attempt

withdrawn
  -> new draft            immediately; new linked attempt

approved
  -> terminal             never rewritten
```

Rules:

- Reviewer assignment does not add a status. `assigned_reviewer_id` separates
  queued from assigned `pending` cases.
- A needs-information resubmission keeps the same row and increments both
  `submission_round` and `version`.
- A rejected or withdrawn retry creates a new row linked with
  `supersedes_submission_id`; the prior row stays terminal.
- Suspension/restoration changes account access, not approved submission
  history.
- Applicant edits and document replacement are allowed only in `draft` or
  `needs_information`.
- `pending`, `approved`, `rejected`, and `withdrawn` submissions are not
  applicant-editable.

Profile mapping:

| Submission/account state | `users.verification_status` |
| --- | --- |
| Professional role selected, draft, pending, or needs information | `pending` |
| Approved | `verified` |
| Rejected | `rejected` |
| Withdrawn with no active case | `unverified` |
| Suspended approved professional | `suspended` |
| Restored approved professional | `verified` |

## 4. Phase-1 minimum schema

Use the next available forward migration after concurrent Phase-1 migrations
merge. Never edit an already-applied migration.

### 4.1 Enums

```text
verification_submission_status
  draft | pending | needs_information | approved | rejected | withdrawn

verification_document_type
  government_id_front | government_id_back | selfie |
  certificate | portfolio | business_registration |
  proof_of_shop_control | proof_of_business_address

verification_document_status
  awaiting_upload | processing | ready | rejected | superseded | purged

verification_content_status
  pending | valid | invalid

verification_malware_status
  pending | clean | infected | failed | unavailable

account_capability
  professional_access | verification_queue_read | verification_assign |
  verification_review | professional_suspend

account_capability_state
  active | revoked
```

### 4.2 `verification_submissions`

```text
id uuid primary key
user_id uuid not null references users
requested_role onboarding_role not null check barber/shop_owner only
status verification_submission_status not null default draft
attempt_number integer not null
supersedes_submission_id uuid null references verification_submissions
legal_name text not null
form_schema_version smallint not null
form_data jsonb not null
submission_round integer not null default 0
assigned_reviewer_id uuid null references users
assigned_by uuid null references users
assigned_at timestamptz null
submitted_at timestamptz null
reviewed_at timestamptz null
reviewed_by uuid null references users
retry_after timestamptz null
applicant_reason_code text null
applicant_message text null
version integer not null default 1
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Required constraints/indexes:

- Unique `(user_id, requested_role, attempt_number)`.
- Partial unique active row for `draft | pending | needs_information` per
  user/requested role.
- Partial unique `approved` row per user/requested role.
- Assigned/reviewing administrator cannot equal the applicant.
- Superseded row must be terminal and belong to the same user and role.
- State/timestamp consistency checks.
- `jsonb_typeof(form_data) = 'object'` and a bounded serialized size.
- Queue index `(status, submitted_at, id)` for stable cursor pagination.

### 4.3 `verification_documents`

```text
id uuid primary key
submission_id uuid not null references verification_submissions
document_type verification_document_type not null
storage_path text null unique                    -- server-only
status verification_document_status not null
declared_mime text null
declared_size_bytes bigint null
detected_mime text null                          -- server-controlled
size_bytes bigint null                           -- server-controlled
sha256 bytea null                                -- server-controlled
content_status verification_content_status not null
malware_status verification_malware_status not null
scanner_provider text null
scanner_reference text null
uploaded_at timestamptz null
validated_at timestamptz null
scanned_at timestamptz null
purge_after timestamptz null
purged_at timestamptz null
legal_hold_at timestamptz null
legal_hold_by uuid null references users
legal_hold_reason text null
version integer not null default 1
created_at timestamptz not null default now()
```

V1 permits one current document per `(submission_id, document_type)`.
Replacement atomically marks the old row `superseded`, removes its raw object,
and creates the new upload request. Audit metadata remains. After retention
purge, remove the object and null raw path/hash while retaining the minimal
decision/audit fact.

### 4.4 `verification_events`

```text
id uuid primary key
submission_id uuid not null references verification_submissions
applicant_id uuid not null references users
actor_id uuid null references users
actor_role user_role or system
event_type text not null
from_status verification_submission_status null
to_status verification_submission_status null
public_reason_code text null
public_message text null
private_reason_code text null
private_note text null
metadata jsonb not null default '{}'
command_id uuid not null unique
request_id uuid null
created_at timestamptz not null default now()
```

The event table is append-only, including for service-role maintenance. Reject
`UPDATE`, `DELETE`, and `TRUNCATE` with triggers. Never put evidence paths,
hashes, raw form/evidence content, credentials, or unrestricted PII in metadata.

### 4.5 `account_capabilities`

```text
id uuid primary key
user_id uuid not null references users
shop_id uuid null
capability account_capability not null
state account_capability_state not null
granted_by uuid null references users
granted_at timestamptz not null
revoked_by uuid null references users
revoked_at timestamptz null
version integer not null default 1
```

All Phase-1 capabilities above require `shop_id is null`. Add a partial unique
index for one active grant per user/capability/scope. Restoration inserts a new
active grant rather than rewriting a revoked grant.

Add `users.authorization_version integer not null default 1` for stale-safe
suspension/restoration.

## 5. Role-specific form and evidence contract

```ts
type BarberVerificationFormDataV1 = {
  version: 1
  role: 'barber'
  date_of_birth: string
  years_experience?: number
  specialties: string[]
  professional_summary?: string
}

type OwnerVerificationFormDataV1 = {
  version: 1
  role: 'shop_owner'
  date_of_birth: string
  business: {
    legal_name: string
    display_name: string
    contact_email: string
    contact_phone: string
    control_basis: 'owned' | 'leased' | 'managed' | 'family_business' | 'other'
  }
  intended_shop: {
    name: string
    address_line: string
    city: string
    provider_place_id?: string
  }
}
```

Required current documents:

- Barber: `government_id_front` and `selfie`.
- Owner: `government_id_front`, `selfie`, and one of
  `proof_of_shop_control | proof_of_business_address`.
- ID back, certificate, portfolio, and business registration are optional in
  V1 unless policy is deliberately changed.

Do not collect a plaintext government-ID number without a separately approved
legal/business need.

### Owner shop claim is not a shop

The owner form is private identity/business evidence. Saving, submitting, or
approving it must not insert into `shops`, store trusted coordinates, or expose
a catalogue row. Approval grants owner role plus `professional_access` only.

Phase 2 Shop Setup may prefill from the approved claim, but the owner confirms
it again. A separate command creates one private `draft` shop, resolves its
provider place ID server-side, and passes first-publication review. Rejected
owners therefore leave no orphan/public shop.

## 6. Applicant-safe decisions

Allowed public reason codes:

```text
documents_unreadable
details_do_not_match
missing_information
shop_control_not_confirmed
eligibility_not_met
unable_to_verify
```

Internal fraud, duplication, abuse, and risk signals map to one safe public
reason. They and private reviewer notes never enter applicant responses.

Needs-information items are a strict discriminated union:

```ts
type VerificationInformationItem =
  | {
      target: 'field'
      field:
        | 'legal_name' | 'date_of_birth' | 'experience' | 'specialties'
        | 'business_name' | 'business_contact' | 'intended_shop'
      message: string
    }
  | {
      target: 'document'
      document_type: VerificationDocumentType
      message: string
    }
```

Do not accept arbitrary field paths.

## 7. Shared contract freeze

### Types

```text
ProfessionalVerificationRole
VerificationSubmissionStatus
VerificationDocumentType
VerificationDocumentStatus
VerificationContentStatus
VerificationMalwareStatus
VerificationApplicantReasonCode
VerificationSubmission
VerificationDocumentMetadata
VerificationApplicantTimelineEvent
VerificationWorkspace
VerificationAllowedAction
AdminVerificationQueueItem
AdminVerificationDetail
AdminVerificationAllowedAction
AccountCapabilityName
AccountCapabilityGrant
ProfessionalAccessSummary
VerificationEvidenceUploadGrant
ShortLivedEvidenceView
```

### DTOs

```text
CreateVerificationSubmissionInput
UpdateVerificationSubmissionInput
RequestVerificationEvidenceUploadInput
CompleteVerificationEvidenceUploadInput
RemoveVerificationEvidenceInput
SubmitVerificationInput
WithdrawVerificationInput
StartProfessionalPhoneVerificationInput
ConfirmProfessionalPhoneVerificationInput
ListAdminVerificationsQuery
AssignVerificationReviewerInput
RequestVerificationInformationInput
ApproveVerificationInput
RejectVerificationInput
SuspendProfessionalInput
RestoreProfessionalInput
```

Every replayable mutation carries `command_id: uuid`. Every mutation after
creation carries `expected_version`; suspension/restoration instead carry
`expected_authorization_version`.

### Zod schemas

```text
professionalVerificationRoleSchema
verificationSubmissionStatusSchema
verificationDocumentTypeSchema
barberVerificationFormDataV1Schema
ownerVerificationFormDataV1Schema
verificationFormDataSchema
createVerificationSubmissionInputSchema
updateVerificationSubmissionInputSchema
requestVerificationEvidenceUploadInputSchema
completeVerificationEvidenceUploadInputSchema
removeVerificationEvidenceInputSchema
submitVerificationInputSchema
withdrawVerificationInputSchema
startProfessionalPhoneVerificationInputSchema
confirmProfessionalPhoneVerificationInputSchema
listAdminVerificationsQuerySchema
assignVerificationReviewerInputSchema
requestVerificationInformationInputSchema
approveVerificationInputSchema
rejectVerificationInputSchema
suspendProfessionalInputSchema
restoreProfessionalInputSchema
verificationSubmissionSchema
verificationDocumentMetadataSchema
verificationWorkspaceSchema
adminVerificationQueueItemSchema
adminVerificationDetailSchema
```

Use strict objects, bounded values, UUID command IDs, and a discriminated
form-data union. Reject a requested-role/form-role mismatch.

Add `verification: VerificationService` and `admin: AdminService` to
`DataBackend`:

```ts
interface VerificationService {
  getMine(): Promise<VerificationWorkspace>
  createSubmission(input: CreateVerificationSubmissionInput): Promise<VerificationWorkspace>
  updateSubmission(id: string, input: UpdateVerificationSubmissionInput): Promise<VerificationWorkspace>
  requestEvidenceUpload(id: string, input: RequestVerificationEvidenceUploadInput): Promise<VerificationEvidenceUploadGrant>
  completeEvidenceUpload(id: string, documentId: string, input: CompleteVerificationEvidenceUploadInput): Promise<VerificationWorkspace>
  removeEvidence(id: string, documentId: string, input: RemoveVerificationEvidenceInput): Promise<VerificationWorkspace>
  getEvidenceView(id: string, documentId: string): Promise<ShortLivedEvidenceView>
  submit(id: string, input: SubmitVerificationInput): Promise<VerificationWorkspace>
  withdraw(id: string, input: WithdrawVerificationInput): Promise<VerificationWorkspace>
}

interface AdminService {
  listVerifications(query: ListAdminVerificationsQuery): Promise<CursorPage<AdminVerificationQueueItem>>
  getVerification(id: string): Promise<AdminVerificationDetail>
  assignVerification(id: string, input: AssignVerificationReviewerInput): Promise<AdminVerificationDetail>
  getVerificationEvidenceView(id: string, documentId: string): Promise<ShortLivedEvidenceView>
  requestVerificationInformation(id: string, input: RequestVerificationInformationInput): Promise<AdminVerificationDetail>
  approveVerification(id: string, input: ApproveVerificationInput): Promise<AdminVerificationDetail>
  rejectVerification(id: string, input: RejectVerificationInput): Promise<AdminVerificationDetail>
  getProfessional(userId: string): Promise<ProfessionalAccessSummary>
  suspendProfessional(userId: string, input: SuspendProfessionalInput): Promise<ProfessionalAccessSummary>
  restoreProfessional(userId: string, input: RestoreProfessionalInput): Promise<ProfessionalAccessSummary>
}
```

Add safe error codes:

```text
verification_locked | stale_verification | idempotency_conflict |
mfa_required | capability_required | evidence_processing |
evidence_rejected | cooldown_active
```

## 8. REST surface

Mount `/verification` after authentication but before the global
`requireOperationalAccess` middleware.

```text
GET    /api/v1/verification/me
POST   /api/v1/verification/submissions
PATCH  /api/v1/verification/submissions/:id
POST   /api/v1/verification/submissions/:id/documents/request-upload
POST   /api/v1/verification/submissions/:id/documents/:documentId/complete
POST   /api/v1/verification/submissions/:id/documents/:documentId/remove
POST   /api/v1/verification/submissions/:id/documents/:documentId/view
POST   /api/v1/verification/submissions/:id/submit
POST   /api/v1/verification/submissions/:id/withdraw
POST   /api/v1/verification/phone/challenge
POST   /api/v1/verification/phone/confirm

GET    /api/v1/admin/verifications?role=&status=&assigned=&cursor=
GET    /api/v1/admin/verifications/:id
POST   /api/v1/admin/verifications/:id/assign
POST   /api/v1/admin/verifications/:id/documents/:documentId/view
POST   /api/v1/admin/verifications/:id/request-information
POST   /api/v1/admin/verifications/:id/approve
POST   /api/v1/admin/verifications/:id/reject
GET    /api/v1/admin/users/:userId
POST   /api/v1/admin/users/:userId/suspend
POST   /api/v1/admin/users/:userId/restore
```

Queue/detail responses never contain bytes, storage paths, reusable URLs,
private notes in applicant projections, or unrestricted risk signals. Evidence
view returns a signed URL valid for no more than 60 seconds after the access
event commits.

## 9. Transactional command surface

Implement as `SECURITY DEFINER`, `set search_path=''`, fully-qualified SQL,
service-role-only functions:

```text
api_begin_professional_verification
api_create_verification_submission
api_update_verification_submission
api_register_verification_upload
api_complete_verification_upload
api_remove_verification_document
api_submit_verification
api_withdraw_verification
api_assign_verification_reviewer
api_request_verification_information
api_approve_verification
api_reject_verification
api_suspend_professional
api_restore_professional
api_record_verification_scan           worker only
api_purge_due_verification_evidence    worker/manual in Phase 1
```

Revoke execute from `public`, `anon`, and `authenticated`; grant only to
`service_role`. Express supplies the authenticated actor ID and never accepts
actor, role, capability, or applicant ID from a mutation body. SQL repeats the
actor/capability/assignment check because service role bypasses RLS.

### Approval invariants

`api_approve_verification` must atomically:

1. Replay a completed result for the same `command_id`; reject reuse for a
   different command.
2. Lock submission, applicant, and active capability rows.
3. Require the expected version and `pending` state.
4. Require a different actor with admin role and active
   `verification_review` capability.
5. Require that actor to be the assigned reviewer.
6. Require profile requested role to match the submission.
7. Require confirmed email and the agreed professional-phone proof.
8. Require every role-required current document to be content-valid and
   malware `clean`.
9. Reject processing/rejected/superseded/purged required evidence.
10. Mark the submission approved and increment its version.
11. Promote the profile role, set verification to `verified`, and increment
    `authorization_version`.
12. Insert `barbers` exactly once for a barber; create no shop or employment.
13. Insert one active `professional_access` capability.
14. Append one immutable approval event with command/request ID.
15. Return the promoted profile/submission.

Any failure rolls back every change.

### Suspension/restoration invariants

- Target must be a verified barber/owner backed by an approved submission.
- Actor needs AAL2, `professional_suspend`, a safe public reason, private
  reason, and matching authorization version.
- Suspension atomically sets profile `suspended`, revokes
  `professional_access`, increments authorization version, turns barber live
  accepting/shift state off, and appends an event.
- It does not rewrite the approved submission, end employment, or modify chat.
- Restoration returns profile to `verified`, inserts a new active capability,
  increments authorization version, and appends an event. Barber live state
  stays off until intentionally re-enabled.
- Authentication reloads profile/capabilities on every request, so an old JWT
  never preserves operational access. Refresh-session revocation is additional
  defense, not the authorization boundary.

## 10. RLS, grants, storage, and MFA

### Raw tables

- Enable and force RLS on all new tables.
- Revoke every raw-table privilege from `anon` and `authenticated`.
- Grant required CRUD only to `service_role`.
- Direct JWT tests must prove both own and foreign raw rows are inaccessible;
  applicants receive allowlisted Express projections.
- Existing self-profile column grants must continue excluding `role`,
  `requested_role`, `verification_status`, and `authorization_version`.
- Capabilities come from database records, never editable `user_metadata`.

Private helper functions:

```text
private.has_account_capability(user_id, capability, shop_id)
private.is_assigned_verification_reviewer(submission_id, user_id)
private.can_upload_verification_object(storage_path, user_id)
```

### Private evidence bucket

```text
bucket: verification-evidence
public: false
maximum object: 10 MiB
preliminary MIME allowlist: image/jpeg, image/png, application/pdf
generated key: {user_uuid}/{submission_uuid}/{document_uuid}/blob
```

Never use the original filename. Allow authenticated `INSERT` into
`storage.objects` only when the exact path was pre-registered, the first path
segment is `auth.uid()`, the user owns the submission, the submission is
editable, and the document is `awaiting_upload`. Grant no direct applicant or
admin object `SELECT`, `UPDATE`, or `DELETE`. Views/removal go through Express.

### Admin MFA/capabilities

- No public admin onboarding and no seeded admin credential.
- Provision an existing Auth user by an audited server/operations script.
- Admin role alone grants nothing.
- Queue: `verification_queue_read`.
- Assignment: `verification_assign`.
- Assigned detail/evidence/decision: `verification_review`.
- Suspension/restoration: `professional_suspend`.
- Every `/admin/*` request requires a verified JWT whose `aal` is `aal2`.
- Express should use Supabase `auth.getClaims(token)` and attach the verified
  AAL, then re-read capability state from Postgres.
- Every evidence view also requires the exact active assignment and commits an
  audit event before URL issuance.
- AAL1 returns `403 mfa_required` without a partial detail response.
- Refresh the admin session immediately after factor changes.

## 11. Honest upload and scan behavior

Content validation and malware scanning are different facts:

- Upload completion computes actual size, signature-detected MIME, and SHA-256
  server-side. Declared MIME is never trusted.
- An applicant may submit after required files are content-valid while malware
  scanning is pending.
- Approval is impossible until every required current file is malware `clean`.
- Invalid/infected evidence becomes rejected and produces a safe replacement
  request/event.

Local development must not pretend an unavailable scanner returned clean:

- Upload and signature validation work normally.
- Without a scanner, use `malware_status='unavailable'`; show an honest blocked
  scan state and deny approval.
- An optional local ClamAV adapter may produce real clean/infected results.
- Integration tests may insert labeled synthetic scanner fixtures through a
  test-only harness; no runtime endpoint or production flag may mark arbitrary
  evidence clean.

## 12. Delivery split

### Phase 1 minimum

- Shared types, DTOs, strict Zod schemas, services, projections, and errors.
- Forward schema, constraints, indexes, RLS/grants, private bucket policy.
- Atomic onboarding, submission, upload metadata, assignment, review decision,
  suspension/restoration, scan-result, and manual purge commands.
- Express authorization/routing, `ApiBackend`, AAL2 and capability checks.
- Real content signature/size/hash validation and fail-closed malware states.
- Secure credential-free admin provisioning script.
- Manual/idempotent evidence-purge command and integration tests.
- Applicant/admin UI only after the shared contract is frozen.

### Phase 5 operational hardening

- Production malware-scanner provider/worker fleet, retries, dead letter,
  monitoring, and service target.
- Durable scheduled evidence purge, legal-hold runbook, deletion reports, and
  operational alerts.
- Production phone/SMS configuration and delivery monitoring.
- CAPTCHA/rate-limit tuning, reviewer SOP/staffing, backup/restore, and final
  privacy/legal approval.

Phase-1 states and UI must not claim those operational dependencies exist.

## 13. Required tests

### Shared

- Strict schemas reject unknown keys and role/form mismatch.
- Barber/owner required-document rules.
- Applicant projection excludes reviewer IDs, private notes/reasons, paths, and
  hashes.
- Allowed actions for every state and safe internal-to-public reason mapping.
- Capability predicates.

### Database/commands

- Unique active submission and approved request.
- Same command replay; conflicting command-ID reuse denied.
- Concurrent approvals: one result, stale/consistent loser.
- Forced event failure rolls back profile, capability, and extension changes.
- Request-information/resubmit versions and rounds.
- Rejection cooldown and linked new attempt.
- Terminal history and append-only event triggers.
- Barber extension exactly once; owner approval creates no shop.
- Suspension/restoration state/capability/event atomicity.
- Scan-clean approval gate.
- Purge skips legal hold and removes raw object/path/hash.

### Direct JWT/RLS/storage

Exercise anonymous, own/foreign applicant, customer, AAL1 assigned admin, AAL2
unassigned admin, AAL2 assigned reviewer, missing-capability admin, and
suspended identities. Verify raw-table default denial, privileged-profile write
denial, RPC execution denial, cross-user/unregistered upload denial, and no
direct evidence read/update/delete.

### Express/API

- Locked professionals reach only auth restore/sign-out, verification, and
  Help.
- Guessed cross-user submission/document IDs fail.
- AAL/capability/assignment checks run before detail/evidence/decision.
- Signed evidence view is short-lived and audited.
- Stale, replay, cooldown, scan-pending, validation, and safe error mappings.
- Errors expose no SQL, storage path, hash, private note, or internal risk.
- Queue cursor is stable with an ID tie-breaker.

### Adapter/browser/security

- Barber and owner draft/upload/submit.
- Needs-information edit/resubmit and reject reason/retry date.
- Admin MFA, assignment, evidence view, request, approve, and reject.
- Lock-to-unlock refresh after approval and immediate suspension lock.
- Owner approval routes to Shop Setup without creating a public shop.
- No privileged-content flash and no fake review/submission copy.
- Oversize, spoofed MIME, polyglot, signed-URL expiry, and frontend secret-bundle
  tests.

## 14. Implementation boundary

P1-02/P1-05 may check account status/capabilities but must not alter employment
or conversation authorization. P1-03 owns active-employment and chat revocation.
Phase 2 owns shop draft/publication, location verification, staff membership,
and shop-scoped provider capabilities.
