import { describe, expect, it } from 'vitest'
import {
  canReadVerificationQueue,
  createVerificationSubmissionInputSchema,
  getAdminVerificationAllowedActions,
  getProfessionalAdminAllowedActions,
  getVerificationAllowedActions,
  getVerificationDocumentRequirements,
  hasActiveAccountCapability,
  hasApprovalReadyVerificationDocuments,
  hasRequiredVerificationDocuments,
  hasSubmissionReadyVerificationDocuments,
  isCompleteVerificationFormForRole,
  mapVerificationReasonForApplicant,
  ownerVerificationFormDataV1Schema,
  projectVerificationDocumentMetadata,
  projectVerificationSubmissionForApplicant,
  projectVerificationTimelineEvent,
  requestVerificationInformationInputSchema,
  verificationDocumentMetadataSchema,
  verificationFormDataSchema,
  verificationInformationItemSchema,
  verificationSubmissionSchema,
  type AccountCapabilityGrant,
  type VerificationDocumentMetadata,
  type VerificationSubmission,
} from '../src/index'

const timestamp = '2026-07-22T04:00:00.000Z'

const barberForm = {
  version: 1 as const,
  role: 'barber' as const,
  date_of_birth: '1995-03-14',
  years_experience: 8,
  specialties: ['Fades', 'Classic cuts'],
  professional_summary: 'Eight years serving local clients.',
}

const ownerForm = {
  version: 1 as const,
  role: 'shop_owner' as const,
  date_of_birth: '1988-05-12',
  business: {
    legal_name: 'Example Grooming Corporation',
    display_name: 'Example Grooming',
    contact_email: 'owner@example.test',
    contact_phone: '+639171234567',
    control_basis: 'leased' as const,
  },
  intended_shop: {
    name: 'Example Grooming',
    address_line: '1 Example Street',
    city: 'Quezon City',
  },
}

function submission(
  status: VerificationSubmission['status'] = 'draft',
  retryAfter: string | null = null,
): VerificationSubmission {
  return {
    id: crypto.randomUUID(),
    requested_role: 'barber',
    status,
    attempt_number: 1,
    supersedes_submission_id: null,
    legal_name: 'Test Barber',
    form_schema_version: 1,
    form_data: barberForm,
    submission_round: 0,
    submitted_at: status === 'draft' ? null : timestamp,
    reviewed_at: null,
    retry_after: retryAfter,
    applicant_reason_code: null,
    applicant_message: null,
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

function document(
  documentType: VerificationDocumentMetadata['document_type'],
  malwareStatus: VerificationDocumentMetadata['malware_status'] = 'clean',
  status: VerificationDocumentMetadata['status'] = 'ready',
): VerificationDocumentMetadata {
  return {
    id: crypto.randomUUID(),
    submission_id: crypto.randomUUID(),
    document_type: documentType,
    status,
    declared_mime: 'image/jpeg',
    declared_size_bytes: 100,
    detected_mime: 'image/jpeg',
    size_bytes: 100,
    content_status: 'valid',
    malware_status: malwareStatus,
    uploaded_at: timestamp,
    validated_at: timestamp,
    scanned_at: malwareStatus === 'clean' ? timestamp : null,
    purge_after: null,
    purged_at: null,
    version: 1,
    created_at: timestamp,
  }
}

function capability(
  name: AccountCapabilityGrant['capability'],
  state: AccountCapabilityGrant['state'] = 'active',
  shopId: string | null = null,
): AccountCapabilityGrant {
  return {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    shop_id: shopId,
    capability: name,
    state,
    granted_by: null,
    granted_at: timestamp,
    revoked_by: null,
    revoked_at: null,
    version: 1,
  }
}

describe('verification schemas', () => {
  it('rejects unknown keys at the top level and inside nested form objects', () => {
    expect(verificationFormDataSchema.safeParse({ ...barberForm, government_id_number: 'secret' }).success).toBe(false)
    expect(ownerVerificationFormDataV1Schema.safeParse({
      ...ownerForm,
      business: { ...ownerForm.business, private_note: 'not allowed' },
    }).success).toBe(false)

    const submissionInput = {
      command_id: crypto.randomUUID(),
      requested_role: 'barber',
      legal_name: 'Test Barber',
      form_data: barberForm,
    }
    expect(createVerificationSubmissionInputSchema.safeParse({ ...submissionInput, actor_id: crypto.randomUUID() }).success).toBe(false)
  })

  it('rejects requested-role/form-role mismatches while permitting an incomplete strict draft', () => {
    const command_id = crypto.randomUUID()
    expect(createVerificationSubmissionInputSchema.safeParse({
      command_id,
      requested_role: 'shop_owner',
      legal_name: 'Test Owner',
      form_data: barberForm,
    }).success).toBe(false)

    const draft = { version: 1 as const, role: 'barber' as const, specialties: ['Fades'] }
    expect(createVerificationSubmissionInputSchema.safeParse({
      command_id,
      requested_role: 'barber',
      legal_name: 'Test Barber',
      form_data: draft,
    }).success).toBe(true)
    expect(isCompleteVerificationFormForRole('barber', draft)).toBe(false)
    expect(isCompleteVerificationFormForRole('barber', barberForm)).toBe(true)
    expect(isCompleteVerificationFormForRole('shop_owner', barberForm)).toBe(false)
  })

  it('accepts only fixed needs-information field names and strict item bodies', () => {
    expect(verificationInformationItemSchema.safeParse({
      target: 'field',
      field: 'business.contact_email',
      message: 'Please correct this value.',
    }).success).toBe(false)
    expect(verificationInformationItemSchema.safeParse({
      target: 'document',
      document_type: 'selfie',
      message: 'Please replace this image.',
      storage_path: 'private/path',
    }).success).toBe(false)
    expect(requestVerificationInformationInputSchema.safeParse({
      command_id: crypto.randomUUID(),
      expected_version: 1,
      information_items: [{
        target: 'field',
        field: 'legal_name',
        message: 'Please use your full legal name.',
      }],
    }).success).toBe(true)
  })
})

describe('role evidence requirements', () => {
  it('models the owner proof as one-of instead of requiring both documents', () => {
    expect(getVerificationDocumentRequirements('barber')).toEqual({
      all_of: ['government_id_front', 'selfie'],
      one_of: [],
    })
    expect(getVerificationDocumentRequirements('shop_owner')).toEqual({
      all_of: ['government_id_front', 'selfie'],
      one_of: [['proof_of_shop_control', 'proof_of_business_address']],
    })

    expect(hasRequiredVerificationDocuments('barber', ['government_id_front', 'selfie'])).toBe(true)
    expect(hasRequiredVerificationDocuments('barber', ['government_id_front'])).toBe(false)
    expect(hasRequiredVerificationDocuments('shop_owner', [
      'government_id_front',
      'selfie',
      'proof_of_shop_control',
    ])).toBe(true)
    expect(hasRequiredVerificationDocuments('shop_owner', [
      'government_id_front',
      'selfie',
    ])).toBe(false)
  })

  it('distinguishes content-valid submission readiness from clean-scan approval readiness', () => {
    const documents = [
      document('government_id_front', 'unavailable'),
      document('selfie', 'pending'),
    ]
    expect(hasSubmissionReadyVerificationDocuments('barber', documents)).toBe(true)
    expect(hasApprovalReadyVerificationDocuments('barber', documents)).toBe(false)

    const cleanDocuments = documents.map((item) => ({ ...item, malware_status: 'clean' as const }))
    expect(hasApprovalReadyVerificationDocuments('barber', cleanDocuments)).toBe(true)
    expect(hasSubmissionReadyVerificationDocuments('barber', [
      document('government_id_front'),
      document('selfie', 'clean', 'superseded'),
    ])).toBe(false)
  })
})

describe('safe verification helpers', () => {
  it('maps internal and unknown risk signals to an applicant-safe reason', () => {
    expect(mapVerificationReasonForApplicant('documents_unreadable')).toBe('documents_unreadable')
    expect(mapVerificationReasonForApplicant('identity_mismatch')).toBe('details_do_not_match')
    expect(mapVerificationReasonForApplicant('suspected_fraud_ring')).toBe('unable_to_verify')
    expect(mapVerificationReasonForApplicant(null)).toBe('unable_to_verify')
  })

  it('returns state-, cooldown-, document-, and phone-safe applicant actions', () => {
    expect(getVerificationAllowedActions(null, new Date(timestamp), { requested_role: null })).toEqual([])
    expect(getVerificationAllowedActions(null, new Date(timestamp), { requested_role: 'barber' })).toEqual(['create_submission'])

    expect(getVerificationAllowedActions(submission('draft'), new Date(timestamp), {
      requested_role: 'barber',
      documents: [{ status: 'awaiting_upload' }],
      professional_phone_verified: false,
      phone_challenge_active: true,
    })).toEqual([
      'update_submission',
      'request_evidence_upload',
      'complete_evidence_upload',
      'remove_evidence',
      'view_evidence',
      'submit',
      'withdraw',
      'confirm_phone_verification',
    ])

    expect(getVerificationAllowedActions(
      submission('rejected', '2026-08-01T00:00:00.000Z'),
      new Date(timestamp),
    )).toEqual([])
    expect(getVerificationAllowedActions(
      submission('rejected', '2026-07-01T00:00:00.000Z'),
      new Date(timestamp),
    )).toEqual(['create_submission'])
  })

  it('requires an exact active capability scope and AAL2 assignment for admin actions', () => {
    const reviewerId = crypto.randomUUID()
    const queue = capability('verification_queue_read')
    const assign = capability('verification_assign')
    const review = capability('verification_review')
    const revokedReview = capability('verification_review', 'revoked')
    const scopedQueue = capability('verification_queue_read', 'active', crypto.randomUUID())

    expect(hasActiveAccountCapability([queue], 'verification_queue_read')).toBe(true)
    expect(canReadVerificationQueue([revokedReview, scopedQueue])).toBe(false)
    expect(hasActiveAccountCapability([scopedQueue], 'verification_queue_read', scopedQueue.shop_id)).toBe(true)

    expect(getAdminVerificationAllowedActions({
      status: 'pending',
      aal: 'aal1',
      viewer_id: reviewerId,
      assigned_reviewer_id: reviewerId,
      capabilities: [assign, review],
    })).toEqual([])
    expect(getAdminVerificationAllowedActions({
      status: 'pending',
      aal: 'aal2',
      viewer_id: reviewerId,
      assigned_reviewer_id: reviewerId,
      capabilities: [assign, review],
    })).toEqual(['assign', 'view_evidence', 'request_information', 'approve', 'reject'])
    expect(getAdminVerificationAllowedActions({
      status: 'pending',
      aal: 'aal2',
      viewer_id: reviewerId,
      assigned_reviewer_id: crypto.randomUUID(),
      capabilities: [assign, review],
    })).toEqual(['assign'])

    const suspend = capability('professional_suspend')
    expect(getProfessionalAdminAllowedActions('verified', 'aal2', [suspend])).toEqual(['suspend'])
    expect(getProfessionalAdminAllowedActions('suspended', 'aal2', [suspend])).toEqual(['restore'])
    expect(getProfessionalAdminAllowedActions('verified', 'aal1', [suspend])).toEqual([])
  })

  it('projects only applicant-safe submission, document, and timeline fields', () => {
    const rawSubmission = {
      ...submission(),
      user_id: crypto.randomUUID(),
      assigned_reviewer_id: crypto.randomUUID(),
      private_note: 'never return this',
    }
    const safeSubmission = projectVerificationSubmissionForApplicant(rawSubmission)
    expect(safeSubmission).not.toHaveProperty('user_id')
    expect(safeSubmission).not.toHaveProperty('assigned_reviewer_id')
    expect(safeSubmission).not.toHaveProperty('private_note')
    expect(verificationSubmissionSchema.safeParse(rawSubmission).success).toBe(false)

    const rawDocument = {
      ...document('government_id_front'),
      storage_path: 'private/path',
      sha256: 'not-for-clients',
      scanner_reference: 'private-reference',
    }
    const safeDocument = projectVerificationDocumentMetadata(rawDocument)
    expect(safeDocument).not.toHaveProperty('storage_path')
    expect(safeDocument).not.toHaveProperty('sha256')
    expect(verificationDocumentMetadataSchema.safeParse(rawDocument).success).toBe(false)

    const safeEvent = projectVerificationTimelineEvent({
      id: crypto.randomUUID(),
      event_type: 'information_requested',
      from_status: 'pending',
      to_status: 'needs_information',
      public_reason_code: 'missing_information',
      public_message: 'Please update the requested items.',
      information_items: [{ target: 'field', field: 'legal_name', message: 'Use your full name.' }],
      created_at: timestamp,
      actor_id: crypto.randomUUID(),
      private_note: 'never return this',
    })
    expect(safeEvent).not.toHaveProperty('actor_id')
    expect(safeEvent).not.toHaveProperty('private_note')
    expect(safeEvent.information_items).toHaveLength(1)
  })
})
