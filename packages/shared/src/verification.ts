import { z } from 'zod'
import type { Role, VerificationStatus } from './types'

export type ProfessionalVerificationRole = 'barber' | 'shop_owner'

export type VerificationSubmissionStatus =
  | 'draft'
  | 'pending'
  | 'needs_information'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export type VerificationDocumentType =
  | 'government_id_front'
  | 'government_id_back'
  | 'selfie'
  | 'certificate'
  | 'portfolio'
  | 'business_registration'
  | 'proof_of_shop_control'
  | 'proof_of_business_address'

export type VerificationDocumentStatus =
  | 'awaiting_upload'
  | 'processing'
  | 'ready'
  | 'rejected'
  | 'superseded'
  | 'purged'

export type VerificationContentStatus = 'pending' | 'valid' | 'invalid'

export type VerificationMalwareStatus =
  | 'pending'
  | 'clean'
  | 'infected'
  | 'failed'
  | 'unavailable'

export type VerificationApplicantReasonCode =
  | 'documents_unreadable'
  | 'details_do_not_match'
  | 'missing_information'
  | 'shop_control_not_confirmed'
  | 'eligibility_not_met'
  | 'unable_to_verify'

export interface BarberVerificationFormDataV1 {
  version: 1
  role: 'barber'
  date_of_birth: string
  years_experience?: number
  specialties: string[]
  professional_summary?: string
}

export interface OwnerVerificationFormDataV1 {
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

export type VerificationFormDataV1 =
  | BarberVerificationFormDataV1
  | OwnerVerificationFormDataV1

export type VerificationFormData = VerificationFormDataV1

/**
 * Drafts remain role-discriminated but may be incomplete. Submission commands
 * must validate the stored value with `verificationFormDataSchema` before a
 * case can leave draft/needs-information.
 */
export type BarberVerificationDraftFormDataV1 = Pick<
  BarberVerificationFormDataV1,
  'version' | 'role'
> & Partial<Omit<BarberVerificationFormDataV1, 'version' | 'role'>>

export type OwnerVerificationDraftFormDataV1 = Pick<
  OwnerVerificationFormDataV1,
  'version' | 'role'
> & {
  date_of_birth?: string
  business?: Partial<OwnerVerificationFormDataV1['business']>
  intended_shop?: Partial<OwnerVerificationFormDataV1['intended_shop']>
}

export type VerificationDraftFormDataV1 =
  | BarberVerificationDraftFormDataV1
  | OwnerVerificationDraftFormDataV1

export type VerificationDraftFormData = VerificationDraftFormDataV1

export type VerificationInformationItem =
  | {
      target: 'field'
      field:
        | 'legal_name'
        | 'date_of_birth'
        | 'experience'
        | 'specialties'
        | 'business_name'
        | 'business_contact'
        | 'intended_shop'
      message: string
    }
  | {
      target: 'document'
      document_type: VerificationDocumentType
      message: string
    }

/** Applicant-safe submission projection. Reviewer identity is intentionally absent. */
export interface VerificationSubmission {
  id: string
  requested_role: ProfessionalVerificationRole
  status: VerificationSubmissionStatus
  attempt_number: number
  supersedes_submission_id: string | null
  legal_name: string
  form_schema_version: 1
  form_data: VerificationDraftFormDataV1
  submission_round: number
  submitted_at: string | null
  reviewed_at: string | null
  retry_after: string | null
  applicant_reason_code: VerificationApplicantReasonCode | null
  applicant_message: string | null
  version: number
  created_at: string
  updated_at: string
}

/** Safe document metadata; object paths, hashes, and scanner references are absent. */
export interface VerificationDocumentMetadata {
  id: string
  submission_id: string
  document_type: VerificationDocumentType
  status: VerificationDocumentStatus
  declared_mime: string | null
  declared_size_bytes: number | null
  detected_mime: string | null
  size_bytes: number | null
  content_status: VerificationContentStatus
  malware_status: VerificationMalwareStatus
  uploaded_at: string | null
  validated_at: string | null
  scanned_at: string | null
  purge_after: string | null
  purged_at: string | null
  version: number
  created_at: string
}

/** Applicant-visible audit event; actor and all private decision fields are absent. */
export interface VerificationApplicantTimelineEvent {
  id: string
  event_type: string
  from_status: VerificationSubmissionStatus | null
  to_status: VerificationSubmissionStatus | null
  public_reason_code: VerificationApplicantReasonCode | null
  public_message: string | null
  information_items: VerificationInformationItem[]
  created_at: string
}

export type VerificationAllowedAction =
  | 'create_submission'
  | 'update_submission'
  | 'request_evidence_upload'
  | 'complete_evidence_upload'
  | 'remove_evidence'
  | 'view_evidence'
  | 'submit'
  | 'withdraw'
  | 'start_phone_verification'
  | 'confirm_phone_verification'

export interface VerificationWorkspace {
  requested_role: ProfessionalVerificationRole | null
  verification_status: VerificationStatus
  authorization_version: number
  email_confirmed: boolean
  professional_phone_verified: boolean
  evidence_requirements: VerificationDocumentRequirements | null
  submission: VerificationSubmission | null
  documents: VerificationDocumentMetadata[]
  timeline: VerificationApplicantTimelineEvent[]
  allowed_actions: VerificationAllowedAction[]
}

export interface AdminVerificationApplicant {
  id: string
  full_name: string
  email: string
  phone: string | null
}

export interface AdminVerificationQueueItem {
  id: string
  applicant: Pick<AdminVerificationApplicant, 'id' | 'full_name'>
  requested_role: ProfessionalVerificationRole
  status: VerificationSubmissionStatus
  attempt_number: number
  submitted_at: string | null
  assigned_reviewer_id: string | null
  assigned_at: string | null
  version: number
  created_at: string
  updated_at: string
}

export type AdminVerificationAllowedAction =
  | 'assign'
  | 'view_evidence'
  | 'request_information'
  | 'approve'
  | 'reject'
  | 'suspend'
  | 'restore'

export interface AdminVerificationDetail {
  applicant: AdminVerificationApplicant
  submission: VerificationSubmission
  documents: VerificationDocumentMetadata[]
  timeline: VerificationApplicantTimelineEvent[]
  assigned_reviewer_id: string | null
  assigned_at: string | null
  email_confirmed: boolean
  professional_phone_verified: boolean
  allowed_actions: AdminVerificationAllowedAction[]
}

export type AccountCapabilityName =
  | 'professional_access'
  | 'verification_queue_read'
  | 'verification_assign'
  | 'verification_review'
  | 'professional_suspend'

export type AccountCapabilityState = 'active' | 'revoked'

export interface AccountCapabilityGrant {
  id: string
  user_id: string
  shop_id: string | null
  capability: AccountCapabilityName
  state: AccountCapabilityState
  granted_by: string | null
  granted_at: string
  revoked_by: string | null
  revoked_at: string | null
  version: number
}

export interface ProfessionalAccessSummary {
  user_id: string
  full_name: string
  email: string
  role: Extract<Role, 'barber' | 'shop_owner'>
  requested_role: ProfessionalVerificationRole
  verification_status: VerificationStatus
  authorization_version: number
  approved_submission_id: string
  professional_access: boolean
  capabilities: AccountCapabilityGrant[]
  allowed_actions: AdminVerificationAllowedAction[]
}

export interface VerificationEvidenceUploadGrant {
  document: VerificationDocumentMetadata
  /** Submission version after the upload reservation command committed. */
  submission_version: number
  upload_url: string
  headers: Record<string, string>
  expires_at: string
}

export interface ShortLivedEvidenceView {
  url: string
  expires_at: string
}

export interface ProfessionalPhoneVerificationChallenge {
  challenge_id: string
  masked_phone: string
  expires_at: string
  resend_after: string
}

export interface CursorPage<T> {
  items: T[]
  next_cursor: string | null
}

export interface CreateVerificationSubmissionInput {
  command_id: string
  requested_role: ProfessionalVerificationRole
  legal_name: string
  form_data: VerificationDraftFormDataV1
}

export interface UpdateVerificationSubmissionInput {
  command_id: string
  expected_version: number
  legal_name?: string
  form_data?: VerificationDraftFormDataV1
}

export interface RequestVerificationEvidenceUploadInput {
  command_id: string
  expected_version: number
  document_type: VerificationDocumentType
  declared_mime: 'image/jpeg' | 'image/png' | 'application/pdf'
  declared_size_bytes: number
}

export interface CompleteVerificationEvidenceUploadInput {
  command_id: string
  expected_version: number
}

export interface RemoveVerificationEvidenceInput {
  command_id: string
  expected_version: number
}

export interface SubmitVerificationInput {
  command_id: string
  expected_version: number
}

export interface WithdrawVerificationInput {
  command_id: string
  expected_version: number
}

export interface StartProfessionalPhoneVerificationInput {
  command_id: string
  phone: string
}

export interface ConfirmProfessionalPhoneVerificationInput {
  command_id: string
  challenge_id: string
  code: string
}

export interface ListAdminVerificationsQuery {
  role?: ProfessionalVerificationRole
  status?: VerificationSubmissionStatus
  assigned?: 'all' | 'me' | 'unassigned'
  cursor?: string
  limit?: number
}

export interface AssignVerificationReviewerInput {
  command_id: string
  expected_version: number
  reviewer_id: string
}

export interface RequestVerificationInformationInput {
  command_id: string
  expected_version: number
  information_items: VerificationInformationItem[]
  public_message?: string
  private_reason_code?: string
  private_note?: string
}

export interface ApproveVerificationInput {
  command_id: string
  expected_version: number
  private_note?: string
}

export interface RejectVerificationInput {
  command_id: string
  expected_version: number
  public_reason_code: VerificationApplicantReasonCode
  public_message?: string
  private_reason_code: string
  private_note?: string
}

export interface SuspendProfessionalInput {
  command_id: string
  expected_authorization_version: number
  public_reason_code: VerificationApplicantReasonCode
  public_message?: string
  private_reason_code: string
  private_note?: string
}

export interface RestoreProfessionalInput {
  command_id: string
  expected_authorization_version: number
  public_reason_code: VerificationApplicantReasonCode
  public_message?: string
  private_reason_code: string
  private_note?: string
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const PHONE = /^\+?[0-9]{7,15}$/
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const nullableTimestamp = timestamp.nullable()
const commandFields = { command_id: uuid }
const expectedVersionFields = {
  ...commandFields,
  expected_version: z.number().int().positive(),
}
const shortText = z.string().trim().min(1).max(160)
const publicMessage = z.string().trim().min(1).max(1000)
const privateReasonCode = z.string().trim().min(1).max(100)
const privateNote = z.string().trim().min(1).max(4000)

export const professionalVerificationRoleSchema = z.enum(['barber', 'shop_owner'])
export const verificationSubmissionStatusSchema = z.enum([
  'draft',
  'pending',
  'needs_information',
  'approved',
  'rejected',
  'withdrawn',
])
export const verificationDocumentTypeSchema = z.enum([
  'government_id_front',
  'government_id_back',
  'selfie',
  'certificate',
  'portfolio',
  'business_registration',
  'proof_of_shop_control',
  'proof_of_business_address',
])
export const verificationDocumentStatusSchema = z.enum([
  'awaiting_upload',
  'processing',
  'ready',
  'rejected',
  'superseded',
  'purged',
])
export const verificationContentStatusSchema = z.enum(['pending', 'valid', 'invalid'])
export const verificationMalwareStatusSchema = z.enum([
  'pending',
  'clean',
  'infected',
  'failed',
  'unavailable',
])
export const verificationApplicantReasonCodeSchema = z.enum([
  'documents_unreadable',
  'details_do_not_match',
  'missing_information',
  'shop_control_not_confirmed',
  'eligibility_not_met',
  'unable_to_verify',
])

const dateOfBirthSchema = z.string().regex(DATE_KEY, 'Expected YYYY-MM-DD.')
const specialtiesSchema = z.array(z.string().trim().min(1).max(80)).min(1).max(20)
  .refine((values) => new Set(values.map((value) => value.toLocaleLowerCase())).size === values.length, {
    message: 'Specialties must be unique.',
  })

export const barberVerificationFormDataV1Schema = z.strictObject({
  version: z.literal(1),
  role: z.literal('barber'),
  date_of_birth: dateOfBirthSchema,
  years_experience: z.number().int().min(0).max(80).optional(),
  specialties: specialtiesSchema,
  professional_summary: z.string().trim().min(1).max(2000).optional(),
}) satisfies z.ZodType<BarberVerificationFormDataV1>

const ownerBusinessSchema = z.strictObject({
  legal_name: z.string().trim().min(1).max(160),
  display_name: z.string().trim().min(1).max(160),
  contact_email: z.string().trim().toLowerCase().email().max(254),
  contact_phone: z.string().trim().regex(PHONE),
  control_basis: z.enum(['owned', 'leased', 'managed', 'family_business', 'other']),
})

const intendedShopSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  address_line: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  provider_place_id: z.string().trim().min(1).max(256).optional(),
})

export const ownerVerificationFormDataV1Schema = z.strictObject({
  version: z.literal(1),
  role: z.literal('shop_owner'),
  date_of_birth: dateOfBirthSchema,
  business: ownerBusinessSchema,
  intended_shop: intendedShopSchema,
}) satisfies z.ZodType<OwnerVerificationFormDataV1>

export const verificationFormDataSchema: z.ZodType<VerificationFormDataV1> = z.discriminatedUnion('role', [
  barberVerificationFormDataV1Schema,
  ownerVerificationFormDataV1Schema,
])

export const barberVerificationDraftFormDataV1Schema = z.strictObject({
  version: z.literal(1),
  role: z.literal('barber'),
  date_of_birth: dateOfBirthSchema.optional(),
  years_experience: z.number().int().min(0).max(80).optional(),
  specialties: specialtiesSchema.optional(),
  professional_summary: z.string().trim().min(1).max(2000).optional(),
}) satisfies z.ZodType<BarberVerificationDraftFormDataV1>

export const ownerVerificationDraftFormDataV1Schema = z.strictObject({
  version: z.literal(1),
  role: z.literal('shop_owner'),
  date_of_birth: dateOfBirthSchema.optional(),
  business: ownerBusinessSchema.partial().optional(),
  intended_shop: intendedShopSchema.partial().optional(),
}) satisfies z.ZodType<OwnerVerificationDraftFormDataV1>

export const verificationDraftFormDataSchema: z.ZodType<VerificationDraftFormDataV1> = z.discriminatedUnion('role', [
  barberVerificationDraftFormDataV1Schema,
  ownerVerificationDraftFormDataV1Schema,
])

export const verificationInformationItemSchema: z.ZodType<VerificationInformationItem> = z.discriminatedUnion('target', [
  z.strictObject({
    target: z.literal('field'),
    field: z.enum([
      'legal_name',
      'date_of_birth',
      'experience',
      'specialties',
      'business_name',
      'business_contact',
      'intended_shop',
    ]),
    message: publicMessage,
  }),
  z.strictObject({
    target: z.literal('document'),
    document_type: verificationDocumentTypeSchema,
    message: publicMessage,
  }),
])

export const createVerificationSubmissionInputSchema: z.ZodType<CreateVerificationSubmissionInput> = z.strictObject({
  ...commandFields,
  requested_role: professionalVerificationRoleSchema,
  legal_name: z.string().trim().min(1).max(160),
  form_data: verificationDraftFormDataSchema,
}).superRefine((value, context) => {
  if (value.requested_role !== value.form_data.role) {
    context.addIssue({
      code: 'custom',
      path: ['form_data', 'role'],
      message: 'The form role must match requested_role.',
    })
  }
})

export const updateVerificationSubmissionInputSchema: z.ZodType<UpdateVerificationSubmissionInput> = z.strictObject({
  ...expectedVersionFields,
  legal_name: z.string().trim().min(1).max(160).optional(),
  form_data: verificationDraftFormDataSchema.optional(),
}).refine((value) => value.legal_name !== undefined || value.form_data !== undefined, {
  message: 'At least one editable field is required.',
})

export const requestVerificationEvidenceUploadInputSchema: z.ZodType<RequestVerificationEvidenceUploadInput> = z.strictObject({
  ...expectedVersionFields,
  document_type: verificationDocumentTypeSchema,
  declared_mime: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  declared_size_bytes: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
})

export const completeVerificationEvidenceUploadInputSchema: z.ZodType<CompleteVerificationEvidenceUploadInput> = z.strictObject({
  ...expectedVersionFields,
})

export const removeVerificationEvidenceInputSchema: z.ZodType<RemoveVerificationEvidenceInput> = z.strictObject({
  ...expectedVersionFields,
})

export const submitVerificationInputSchema: z.ZodType<SubmitVerificationInput> = z.strictObject({
  ...expectedVersionFields,
})

export const withdrawVerificationInputSchema: z.ZodType<WithdrawVerificationInput> = z.strictObject({
  ...expectedVersionFields,
})

export const startProfessionalPhoneVerificationInputSchema: z.ZodType<StartProfessionalPhoneVerificationInput> = z.strictObject({
  ...commandFields,
  phone: z.string().trim().regex(PHONE),
})

export const confirmProfessionalPhoneVerificationInputSchema: z.ZodType<ConfirmProfessionalPhoneVerificationInput> = z.strictObject({
  ...commandFields,
  challenge_id: uuid,
  code: z.string().regex(/^\d{6}$/, 'Expected a six-digit confirmation code.'),
})

export const listAdminVerificationsQuerySchema: z.ZodType<ListAdminVerificationsQuery> = z.strictObject({
  role: professionalVerificationRoleSchema.optional(),
  status: verificationSubmissionStatusSchema.optional(),
  assigned: z.enum(['all', 'me', 'unassigned']).optional(),
  cursor: z.string().trim().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const assignVerificationReviewerInputSchema: z.ZodType<AssignVerificationReviewerInput> = z.strictObject({
  ...expectedVersionFields,
  reviewer_id: uuid,
})

export const requestVerificationInformationInputSchema: z.ZodType<RequestVerificationInformationInput> = z.strictObject({
  ...expectedVersionFields,
  information_items: z.array(verificationInformationItemSchema).min(1).max(50),
  public_message: publicMessage.optional(),
  private_reason_code: privateReasonCode.optional(),
  private_note: privateNote.optional(),
})

export const approveVerificationInputSchema: z.ZodType<ApproveVerificationInput> = z.strictObject({
  ...expectedVersionFields,
  private_note: privateNote.optional(),
})

export const rejectVerificationInputSchema: z.ZodType<RejectVerificationInput> = z.strictObject({
  ...expectedVersionFields,
  public_reason_code: verificationApplicantReasonCodeSchema,
  public_message: publicMessage.optional(),
  private_reason_code: privateReasonCode,
  private_note: privateNote.optional(),
})

const professionalAccessChangeFields = {
  ...commandFields,
  expected_authorization_version: z.number().int().positive(),
  public_reason_code: verificationApplicantReasonCodeSchema,
  public_message: publicMessage.optional(),
  private_reason_code: privateReasonCode,
  private_note: privateNote.optional(),
}

export const suspendProfessionalInputSchema: z.ZodType<SuspendProfessionalInput> = z.strictObject({
  ...professionalAccessChangeFields,
})

export const restoreProfessionalInputSchema: z.ZodType<RestoreProfessionalInput> = z.strictObject({
  ...professionalAccessChangeFields,
})

export const verificationAllowedActionSchema = z.enum([
  'create_submission',
  'update_submission',
  'request_evidence_upload',
  'complete_evidence_upload',
  'remove_evidence',
  'view_evidence',
  'submit',
  'withdraw',
  'start_phone_verification',
  'confirm_phone_verification',
])

export const adminVerificationAllowedActionSchema = z.enum([
  'assign',
  'view_evidence',
  'request_information',
  'approve',
  'reject',
  'suspend',
  'restore',
])

export const verificationSubmissionSchema: z.ZodType<VerificationSubmission> = z.strictObject({
  id: uuid,
  requested_role: professionalVerificationRoleSchema,
  status: verificationSubmissionStatusSchema,
  attempt_number: z.number().int().positive(),
  supersedes_submission_id: uuid.nullable(),
  legal_name: z.string().trim().min(1).max(160),
  form_schema_version: z.literal(1),
  form_data: verificationDraftFormDataSchema,
  submission_round: z.number().int().nonnegative(),
  submitted_at: nullableTimestamp,
  reviewed_at: nullableTimestamp,
  retry_after: nullableTimestamp,
  applicant_reason_code: verificationApplicantReasonCodeSchema.nullable(),
  applicant_message: z.string().max(1000).nullable(),
  version: z.number().int().positive(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const verificationDocumentMetadataSchema: z.ZodType<VerificationDocumentMetadata> = z.strictObject({
  id: uuid,
  submission_id: uuid,
  document_type: verificationDocumentTypeSchema,
  status: verificationDocumentStatusSchema,
  declared_mime: z.string().max(128).nullable(),
  declared_size_bytes: z.number().int().nonnegative().max(MAX_EVIDENCE_BYTES).nullable(),
  detected_mime: z.string().max(128).nullable(),
  size_bytes: z.number().int().nonnegative().max(MAX_EVIDENCE_BYTES).nullable(),
  content_status: verificationContentStatusSchema,
  malware_status: verificationMalwareStatusSchema,
  uploaded_at: nullableTimestamp,
  validated_at: nullableTimestamp,
  scanned_at: nullableTimestamp,
  purge_after: nullableTimestamp,
  purged_at: nullableTimestamp,
  version: z.number().int().positive(),
  created_at: timestamp,
})

export const verificationApplicantTimelineEventSchema: z.ZodType<VerificationApplicantTimelineEvent> = z.strictObject({
  id: uuid,
  event_type: z.string().trim().min(1).max(100),
  from_status: verificationSubmissionStatusSchema.nullable(),
  to_status: verificationSubmissionStatusSchema.nullable(),
  public_reason_code: verificationApplicantReasonCodeSchema.nullable(),
  public_message: z.string().max(1000).nullable(),
  information_items: z.array(verificationInformationItemSchema).max(50),
  created_at: timestamp,
})

export const verificationDocumentRequirementsSchema: z.ZodType<VerificationDocumentRequirements> = z.strictObject({
  all_of: z.array(verificationDocumentTypeSchema).max(8),
  one_of: z.array(z.array(verificationDocumentTypeSchema).min(1).max(8)).max(8),
})

export const verificationWorkspaceSchema: z.ZodType<VerificationWorkspace> = z.strictObject({
  requested_role: professionalVerificationRoleSchema.nullable(),
  verification_status: z.enum(['unverified', 'not_required', 'pending', 'verified', 'rejected', 'suspended']),
  authorization_version: z.number().int().positive(),
  email_confirmed: z.boolean(),
  professional_phone_verified: z.boolean(),
  evidence_requirements: verificationDocumentRequirementsSchema.nullable(),
  submission: verificationSubmissionSchema.nullable(),
  documents: z.array(verificationDocumentMetadataSchema).max(50),
  timeline: z.array(verificationApplicantTimelineEventSchema).max(500),
  allowed_actions: z.array(verificationAllowedActionSchema),
})

const adminVerificationApplicantSchema: z.ZodType<AdminVerificationApplicant> = z.strictObject({
  id: uuid,
  full_name: shortText,
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(PHONE).nullable(),
})

export const adminVerificationQueueItemSchema: z.ZodType<AdminVerificationQueueItem> = z.strictObject({
  id: uuid,
  applicant: z.strictObject({
    id: uuid,
    full_name: shortText,
  }),
  requested_role: professionalVerificationRoleSchema,
  status: verificationSubmissionStatusSchema,
  attempt_number: z.number().int().positive(),
  submitted_at: nullableTimestamp,
  assigned_reviewer_id: uuid.nullable(),
  assigned_at: nullableTimestamp,
  version: z.number().int().positive(),
  created_at: timestamp,
  updated_at: timestamp,
})

export const adminVerificationDetailSchema: z.ZodType<AdminVerificationDetail> = z.strictObject({
  applicant: adminVerificationApplicantSchema,
  submission: verificationSubmissionSchema,
  documents: z.array(verificationDocumentMetadataSchema).max(50),
  timeline: z.array(verificationApplicantTimelineEventSchema).max(500),
  assigned_reviewer_id: uuid.nullable(),
  assigned_at: nullableTimestamp,
  email_confirmed: z.boolean(),
  professional_phone_verified: z.boolean(),
  allowed_actions: z.array(adminVerificationAllowedActionSchema),
})

export const accountCapabilityNameSchema = z.enum([
  'professional_access',
  'verification_queue_read',
  'verification_assign',
  'verification_review',
  'professional_suspend',
])

export const accountCapabilityGrantSchema: z.ZodType<AccountCapabilityGrant> = z.strictObject({
  id: uuid,
  user_id: uuid,
  shop_id: uuid.nullable(),
  capability: accountCapabilityNameSchema,
  state: z.enum(['active', 'revoked']),
  granted_by: uuid.nullable(),
  granted_at: timestamp,
  revoked_by: uuid.nullable(),
  revoked_at: nullableTimestamp,
  version: z.number().int().positive(),
})

export const professionalAccessSummarySchema: z.ZodType<ProfessionalAccessSummary> = z.strictObject({
  user_id: uuid,
  full_name: shortText,
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(['barber', 'shop_owner']),
  requested_role: professionalVerificationRoleSchema,
  verification_status: z.enum(['unverified', 'not_required', 'pending', 'verified', 'rejected', 'suspended']),
  authorization_version: z.number().int().positive(),
  approved_submission_id: uuid,
  professional_access: z.boolean(),
  capabilities: z.array(accountCapabilityGrantSchema).max(50),
  allowed_actions: z.array(adminVerificationAllowedActionSchema),
})

export const verificationEvidenceUploadGrantSchema: z.ZodType<VerificationEvidenceUploadGrant> = z.strictObject({
  document: verificationDocumentMetadataSchema,
  submission_version: z.number().int().positive(),
  upload_url: z.string().url().max(4096),
  headers: z.record(z.string().max(100), z.string().max(4096)),
  expires_at: timestamp,
})

export const shortLivedEvidenceViewSchema: z.ZodType<ShortLivedEvidenceView> = z.strictObject({
  url: z.string().url().max(4096),
  expires_at: timestamp,
})

export const professionalPhoneVerificationChallengeSchema: z.ZodType<ProfessionalPhoneVerificationChallenge> = z.strictObject({
  challenge_id: uuid,
  masked_phone: z.string().trim().min(3).max(32),
  expires_at: timestamp,
  resend_after: timestamp,
})

export function cursorPageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.strictObject({
    items: z.array(itemSchema),
    next_cursor: z.string().max(2048).nullable(),
  })
}

export interface VerificationDocumentRequirements {
  all_of: readonly VerificationDocumentType[]
  one_of: readonly (readonly VerificationDocumentType[])[]
}

const BARBER_DOCUMENT_REQUIREMENTS: VerificationDocumentRequirements = Object.freeze({
  all_of: Object.freeze(['government_id_front', 'selfie'] as const),
  one_of: Object.freeze([]),
})

const OWNER_DOCUMENT_REQUIREMENTS: VerificationDocumentRequirements = Object.freeze({
  all_of: Object.freeze(['government_id_front', 'selfie'] as const),
  one_of: Object.freeze([
    Object.freeze(['proof_of_shop_control', 'proof_of_business_address'] as const),
  ]),
})

export function getVerificationDocumentRequirements(
  role: ProfessionalVerificationRole,
): VerificationDocumentRequirements {
  return role === 'barber' ? BARBER_DOCUMENT_REQUIREMENTS : OWNER_DOCUMENT_REQUIREMENTS
}

export const requiredDocumentsForRole = getVerificationDocumentRequirements

export function hasRequiredVerificationDocuments(
  role: ProfessionalVerificationRole,
  documentTypes: Iterable<VerificationDocumentType>,
): boolean {
  const present = new Set(documentTypes)
  const requirements = getVerificationDocumentRequirements(role)
  return requirements.all_of.every((type) => present.has(type))
    && requirements.one_of.every((group) => group.some((type) => present.has(type)))
}

export const hasRequiredDocumentsForRole = hasRequiredVerificationDocuments

function currentDocumentTypes(
  documents: readonly Pick<
    VerificationDocumentMetadata,
    'document_type' | 'status' | 'content_status' | 'malware_status'
  >[],
  requireCleanScan: boolean,
): VerificationDocumentType[] {
  return documents
    .filter((document) => (
      document.status === 'ready'
      && document.content_status === 'valid'
      && (!requireCleanScan || document.malware_status === 'clean')
    ))
    .map((document) => document.document_type)
}

/** Submission permits a pending/unavailable scan after real content validation. */
export function hasSubmissionReadyVerificationDocuments(
  role: ProfessionalVerificationRole,
  documents: readonly Pick<
    VerificationDocumentMetadata,
    'document_type' | 'status' | 'content_status' | 'malware_status'
  >[],
): boolean {
  return hasRequiredVerificationDocuments(role, currentDocumentTypes(documents, false))
}

/** Approval additionally requires every role-required current file to scan clean. */
export function hasApprovalReadyVerificationDocuments(
  role: ProfessionalVerificationRole,
  documents: readonly Pick<
    VerificationDocumentMetadata,
    'document_type' | 'status' | 'content_status' | 'malware_status'
  >[],
): boolean {
  return hasRequiredVerificationDocuments(role, currentDocumentTypes(documents, true))
}

export function formMatchesVerificationRole(
  role: ProfessionalVerificationRole,
  formData: Pick<VerificationDraftFormDataV1, 'role'>,
): boolean {
  return role === formData.role
}

export function isCompleteVerificationFormData(value: unknown): value is VerificationFormDataV1 {
  return verificationFormDataSchema.safeParse(value).success
}

export function isCompleteVerificationFormForRole(
  role: ProfessionalVerificationRole,
  value: unknown,
): value is VerificationFormDataV1 {
  const parsed = verificationFormDataSchema.safeParse(value)
  return parsed.success && parsed.data.role === role
}

const SAFE_REASON_CODES = new Set<VerificationApplicantReasonCode>([
  'documents_unreadable',
  'details_do_not_match',
  'missing_information',
  'shop_control_not_confirmed',
  'eligibility_not_met',
  'unable_to_verify',
])

const SAFE_INTERNAL_REASON_MAP: Readonly<Record<string, VerificationApplicantReasonCode>> = Object.freeze({
  document_blurry: 'documents_unreadable',
  document_corrupt: 'documents_unreadable',
  identity_mismatch: 'details_do_not_match',
  profile_mismatch: 'details_do_not_match',
  missing_required_data: 'missing_information',
  shop_control_unverified: 'shop_control_not_confirmed',
  ineligible: 'eligibility_not_met',
})

/** Unknown or risk-sensitive internal codes collapse to one non-revealing reason. */
export function mapVerificationReasonForApplicant(
  internalReasonCode: string | null | undefined,
): VerificationApplicantReasonCode {
  if (!internalReasonCode) return 'unable_to_verify'
  if (SAFE_REASON_CODES.has(internalReasonCode as VerificationApplicantReasonCode)) {
    return internalReasonCode as VerificationApplicantReasonCode
  }
  return SAFE_INTERNAL_REASON_MAP[internalReasonCode] ?? 'unable_to_verify'
}

export const toApplicantSafeVerificationReason = mapVerificationReasonForApplicant

export function getVerificationAllowedActions(
  submission: Pick<VerificationSubmission, 'status' | 'retry_after'> | null,
  now: Date = new Date(),
  options: {
    requested_role?: ProfessionalVerificationRole | null
    documents?: readonly Pick<VerificationDocumentMetadata, 'status'>[]
    professional_phone_verified?: boolean
    phone_challenge_active?: boolean
  } = {},
): VerificationAllowedAction[] {
  if (!submission) {
    if (options.requested_role === null) return []
    return ['create_submission']
  }

  const documentActions = (): VerificationAllowedAction[] => {
    if (!options.documents?.length) return []
    return [
      ...(options.documents.some((document) => document.status === 'awaiting_upload')
        ? ['complete_evidence_upload' as const]
        : []),
      'remove_evidence',
      'view_evidence',
    ]
  }

  const phoneActions = (): VerificationAllowedAction[] => {
    if (options.professional_phone_verified !== false) return []
    return [options.phone_challenge_active ? 'confirm_phone_verification' : 'start_phone_verification']
  }

  switch (submission.status) {
    case 'draft':
    case 'needs_information':
      return [
        'update_submission',
        'request_evidence_upload',
        ...documentActions(),
        'submit',
        'withdraw',
        ...phoneActions(),
      ]
    case 'pending':
      return [...documentActions().filter((action) => action === 'view_evidence'), 'withdraw', ...phoneActions()]
    case 'approved':
      return documentActions().filter((action) => action === 'view_evidence')
    case 'withdrawn':
      return [...documentActions().filter((action) => action === 'view_evidence'), 'create_submission']
    case 'rejected': {
      const retryAt = submission.retry_after ? Date.parse(submission.retry_after) : 0
      return Number.isFinite(retryAt) && retryAt > now.getTime()
        ? documentActions().filter((action) => action === 'view_evidence')
        : [...documentActions().filter((action) => action === 'view_evidence'), 'create_submission']
    }
  }
}

export function hasActiveAccountCapability(
  grants: readonly Pick<AccountCapabilityGrant, 'capability' | 'state' | 'shop_id'>[],
  capability: AccountCapabilityName,
  shopId: string | null = null,
): boolean {
  return grants.some((grant) => (
    grant.capability === capability
    && grant.state === 'active'
    && grant.shop_id === shopId
  ))
}

export const hasAccountCapability = hasActiveAccountCapability

export function canReadVerificationQueue(
  grants: readonly Pick<AccountCapabilityGrant, 'capability' | 'state' | 'shop_id'>[],
): boolean {
  return hasActiveAccountCapability(grants, 'verification_queue_read')
}

export function canAssignVerification(
  grants: readonly Pick<AccountCapabilityGrant, 'capability' | 'state' | 'shop_id'>[],
): boolean {
  return hasActiveAccountCapability(grants, 'verification_assign')
}

export function canReviewVerification(
  grants: readonly Pick<AccountCapabilityGrant, 'capability' | 'state' | 'shop_id'>[],
): boolean {
  return hasActiveAccountCapability(grants, 'verification_review')
}

export function canSuspendProfessional(
  grants: readonly Pick<AccountCapabilityGrant, 'capability' | 'state' | 'shop_id'>[],
): boolean {
  return hasActiveAccountCapability(grants, 'professional_suspend')
}

export interface AdminVerificationActionContext {
  status: VerificationSubmissionStatus
  aal: 'aal1' | 'aal2'
  viewer_id: string
  assigned_reviewer_id: string | null
  capabilities: readonly Pick<AccountCapabilityGrant, 'capability' | 'state' | 'shop_id'>[]
}

export function getAdminVerificationAllowedActions(
  context: AdminVerificationActionContext,
): AdminVerificationAllowedAction[] {
  if (context.aal !== 'aal2') return []
  const actions: AdminVerificationAllowedAction[] = []
  if (context.status === 'pending' && canAssignVerification(context.capabilities)) {
    actions.push('assign')
  }

  const isAssignedReviewer = context.assigned_reviewer_id === context.viewer_id
  if (!isAssignedReviewer || !canReviewVerification(context.capabilities)) return actions

  if (context.status === 'pending') {
    actions.push('view_evidence', 'request_information', 'approve', 'reject')
  } else if (context.status === 'needs_information') {
    actions.push('view_evidence')
  }
  return actions
}

export function getProfessionalAdminAllowedActions(
  verificationStatus: VerificationStatus,
  aal: 'aal1' | 'aal2',
  capabilities: readonly Pick<AccountCapabilityGrant, 'capability' | 'state' | 'shop_id'>[],
): AdminVerificationAllowedAction[] {
  if (aal !== 'aal2' || !canSuspendProfessional(capabilities)) return []
  if (verificationStatus === 'verified') return ['suspend']
  if (verificationStatus === 'suspended') return ['restore']
  return []
}

/** Explicit copy prevents raw reviewer, private-note, path, and hash fields leaking. */
export function projectVerificationSubmissionForApplicant<T extends VerificationSubmission>(
  submission: T,
): VerificationSubmission {
  return {
    id: submission.id,
    requested_role: submission.requested_role,
    status: submission.status,
    attempt_number: submission.attempt_number,
    supersedes_submission_id: submission.supersedes_submission_id,
    legal_name: submission.legal_name,
    form_schema_version: submission.form_schema_version,
    form_data: structuredClone(submission.form_data),
    submission_round: submission.submission_round,
    submitted_at: submission.submitted_at,
    reviewed_at: submission.reviewed_at,
    retry_after: submission.retry_after,
    applicant_reason_code: submission.applicant_reason_code,
    applicant_message: submission.applicant_message,
    version: submission.version,
    created_at: submission.created_at,
    updated_at: submission.updated_at,
  }
}

export function projectVerificationDocumentMetadata<T extends VerificationDocumentMetadata>(
  document: T,
): VerificationDocumentMetadata {
  return {
    id: document.id,
    submission_id: document.submission_id,
    document_type: document.document_type,
    status: document.status,
    declared_mime: document.declared_mime,
    declared_size_bytes: document.declared_size_bytes,
    detected_mime: document.detected_mime,
    size_bytes: document.size_bytes,
    content_status: document.content_status,
    malware_status: document.malware_status,
    uploaded_at: document.uploaded_at,
    validated_at: document.validated_at,
    scanned_at: document.scanned_at,
    purge_after: document.purge_after,
    purged_at: document.purged_at,
    version: document.version,
    created_at: document.created_at,
  }
}

export function projectVerificationTimelineEvent<T extends VerificationApplicantTimelineEvent>(
  event: T,
): VerificationApplicantTimelineEvent {
  return {
    id: event.id,
    event_type: event.event_type,
    from_status: event.from_status,
    to_status: event.to_status,
    public_reason_code: event.public_reason_code,
    public_message: event.public_message,
    information_items: structuredClone(event.information_items),
    created_at: event.created_at,
  }
}
