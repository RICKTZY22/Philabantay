import { Router } from 'express'
import { z } from 'zod'
import {
  getVerificationAllowedActions,
  getVerificationDocumentRequirements,
  projectVerificationDocumentMetadata,
  projectVerificationSubmissionForApplicant,
  projectVerificationTimelineEvent,
  verificationInformationItemSchema,
  verificationWorkspaceSchema,
  type VerificationApplicantTimelineEvent,
  type VerificationDocumentMetadata,
  type VerificationSubmission,
  type VerificationWorkspace,
} from '@barbershop/shared'
import {
  completeVerificationEvidenceUploadInputSchema,
  createVerificationSubmissionInputSchema,
  removeVerificationEvidenceInputSchema,
  requestVerificationEvidenceUploadInputSchema,
  startProfessionalPhoneVerificationInputSchema,
  confirmProfessionalPhoneVerificationInputSchema,
  submitVerificationInputSchema,
  updateVerificationSubmissionInputSchema,
  withdrawVerificationInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams } from '../http/validation'
import {
  downloadAndValidateEvidence,
  issueEvidenceUploadGrant,
  issueEvidenceView,
  removeEvidenceObject,
} from '../lib/verification-evidence'

const submissionParamsSchema = z.strictObject({ id: z.string().uuid() })
const documentParamsSchema = z.strictObject({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
})

type DatabaseRow = Record<string, unknown>

function safeDraftForm(row: DatabaseRow): VerificationSubmission['form_data'] {
  const raw = row.form_data
  if (typeof raw === 'object' && raw !== null && 'version' in raw && 'role' in raw) {
    return raw as VerificationSubmission['form_data']
  }
  return {
    version: 1,
    role: row.requested_role as VerificationSubmission['requested_role'],
  }
}

export function applicantSubmission(row: DatabaseRow): VerificationSubmission {
  return projectVerificationSubmissionForApplicant({
    id: row.id as string,
    requested_role: row.requested_role as VerificationSubmission['requested_role'],
    status: row.status as VerificationSubmission['status'],
    attempt_number: Number(row.attempt_number),
    supersedes_submission_id: row.supersedes_submission_id as string | null,
    legal_name: row.legal_name as string,
    form_schema_version: 1,
    form_data: safeDraftForm(row),
    submission_round: Number(row.submission_round),
    submitted_at: row.submitted_at as string | null,
    reviewed_at: row.reviewed_at as string | null,
    retry_after: row.retry_after as string | null,
    applicant_reason_code: row.applicant_reason_code as VerificationSubmission['applicant_reason_code'],
    applicant_message: row.applicant_message as string | null,
    version: Number(row.version),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  })
}

export function applicantDocument(row: DatabaseRow): VerificationDocumentMetadata {
  return projectVerificationDocumentMetadata({
    id: row.id as string,
    submission_id: row.submission_id as string,
    document_type: row.document_type as VerificationDocumentMetadata['document_type'],
    status: row.status as VerificationDocumentMetadata['status'],
    declared_mime: row.declared_mime as string | null,
    declared_size_bytes: row.declared_size_bytes == null ? null : Number(row.declared_size_bytes),
    detected_mime: row.detected_mime as string | null,
    size_bytes: row.size_bytes == null ? null : Number(row.size_bytes),
    content_status: row.content_status as VerificationDocumentMetadata['content_status'],
    malware_status: row.malware_status as VerificationDocumentMetadata['malware_status'],
    uploaded_at: row.uploaded_at as string | null,
    validated_at: row.validated_at as string | null,
    scanned_at: row.scanned_at as string | null,
    purge_after: row.purge_after as string | null,
    purged_at: row.purged_at as string | null,
    version: Number(row.version),
    created_at: row.created_at as string,
  })
}

export function applicantEvent(row: DatabaseRow): VerificationApplicantTimelineEvent {
  const metadata = typeof row.metadata === 'object' && row.metadata !== null
    ? row.metadata as Record<string, unknown>
    : {}
  const parsedItems = verificationInformationItemSchema.array().safeParse(metadata.information_items)
  return projectVerificationTimelineEvent({
    id: row.id as string,
    event_type: row.event_type as string,
    from_status: row.from_status as VerificationApplicantTimelineEvent['from_status'],
    to_status: row.to_status as VerificationApplicantTimelineEvent['to_status'],
    public_reason_code: row.public_reason_code as VerificationApplicantTimelineEvent['public_reason_code'],
    public_message: row.public_message as string | null,
    information_items: parsedItems.success ? parsedItems.data : [],
    created_at: row.created_at as string,
  })
}

async function loadWorkspace(
  dependencies: ApiDependencies,
  userId: string,
  authUser: Express.Request['auth']['user'],
  profile: Express.Request['auth']['profile'],
): Promise<VerificationWorkspace> {
  const { data: submissionRow, error: submissionError } = await dependencies.database
    .from('verification_submissions')
    .select([
      'id', 'requested_role', 'status', 'attempt_number', 'supersedes_submission_id',
      'legal_name', 'form_schema_version', 'form_data', 'submission_round',
      'submitted_at', 'reviewed_at', 'retry_after', 'applicant_reason_code',
      'applicant_message', 'version', 'created_at', 'updated_at',
    ].join(','))
    .eq('user_id', userId)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (submissionError) throw fromDatabaseError(submissionError)

  const submission = submissionRow
    ? applicantSubmission(submissionRow as unknown as DatabaseRow)
    : null
  let documents: VerificationDocumentMetadata[] = []
  let timeline: VerificationApplicantTimelineEvent[] = []
  if (submission) {
    const [documentsResult, eventsResult] = await Promise.all([
      dependencies.database
        .from('verification_documents')
        .select([
          'id', 'submission_id', 'document_type', 'status', 'declared_mime',
          'declared_size_bytes', 'detected_mime', 'size_bytes', 'content_status',
          'malware_status', 'uploaded_at', 'validated_at', 'scanned_at',
          'purge_after', 'purged_at', 'version', 'created_at',
        ].join(','))
        .eq('submission_id', submission.id)
        .not('status', 'in', '(superseded,purged)')
        .order('created_at', { ascending: true }),
      dependencies.database
        .from('verification_events')
        .select([
          'id', 'event_type', 'from_status', 'to_status', 'public_reason_code',
          'public_message', 'metadata', 'created_at',
        ].join(','))
        .eq('submission_id', submission.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ])
    if (documentsResult.error) throw fromDatabaseError(documentsResult.error)
    if (eventsResult.error) throw fromDatabaseError(eventsResult.error)
    documents = ((documentsResult.data ?? []) as unknown as DatabaseRow[]).map(applicantDocument)
    timeline = ((eventsResult.data ?? []) as unknown as DatabaseRow[]).map(applicantEvent)
  }

  const professionalPhoneVerified = Boolean(
    authUser.phone_confirmed_at
    && authUser.phone
    && profile.phone
    && authUser.phone === profile.phone,
  )
  const requestedRole = profile.requested_role === 'barber' || profile.requested_role === 'shop_owner'
    ? profile.requested_role
    : null

  return verificationWorkspaceSchema.parse({
    requested_role: requestedRole,
    verification_status: profile.verification_status,
    authorization_version: profile.authorization_version,
    email_confirmed: Boolean(authUser.email_confirmed_at),
    professional_phone_verified: professionalPhoneVerified,
    evidence_requirements: requestedRole ? getVerificationDocumentRequirements(requestedRole) : null,
    submission,
    documents,
    timeline,
    allowed_actions: getVerificationAllowedActions(submission, new Date(), {
      requested_role: requestedRole,
      documents,
      professional_phone_verified: professionalPhoneVerified,
      phone_challenge_active: false,
    }),
  })
}

async function currentOwnedSubmission(
  dependencies: ApiDependencies,
  userId: string,
  submissionId: string,
): Promise<DatabaseRow> {
  const { data, error } = await dependencies.database
    .from('verification_submissions')
    .select('id,user_id,requested_role,legal_name,form_data,status,version')
    .eq('id', submissionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(404, 'not_found', 'Verification request not found.')
  return data
}

export function createVerificationRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/me', async (request, response) => {
    response.json({
      data: await loadWorkspace(
        dependencies,
        request.auth.profile.id,
        request.auth.user,
        request.auth.profile,
      ),
    })
  })

  router.post('/submissions', async (request, response) => {
    const input = parseBody(request, createVerificationSubmissionInputSchema)
    const { error } = await dependencies.database.rpc('api_create_verification_submission', {
      p_actor_id: request.auth.profile.id,
      p_requested_role: input.requested_role,
      p_legal_name: input.legal_name,
      p_form_data: input.form_data,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({
      data: await loadWorkspace(dependencies, request.auth.profile.id, request.auth.user, request.auth.profile),
    })
  })

  router.patch('/submissions/:id', async (request, response) => {
    const { id } = parseParams(request, submissionParamsSchema)
    const input = parseBody(request, updateVerificationSubmissionInputSchema)
    const current = await currentOwnedSubmission(dependencies, request.auth.profile.id, id)
    const { error } = await dependencies.database.rpc('api_update_verification_submission', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_expected_version: input.expected_version,
      p_legal_name: input.legal_name ?? current.legal_name,
      p_form_data: input.form_data ?? current.form_data,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({
      data: await loadWorkspace(dependencies, request.auth.profile.id, request.auth.user, request.auth.profile),
    })
  })

  router.post('/submissions/:id/documents/request-upload', async (request, response) => {
    const { id } = parseParams(request, submissionParamsSchema)
    const input = parseBody(request, requestVerificationEvidenceUploadInputSchema)
    const { data, error } = await dependencies.database.rpc('api_register_verification_upload', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_expected_version: input.expected_version,
      p_document_type: input.document_type,
      p_declared_mime: input.declared_mime,
      p_declared_size_bytes: input.declared_size_bytes,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    const raw = data as {
      submission: { version: number }
      document: DatabaseRow
      storage_path: string
      superseded_storage_paths?: string[]
    }
    for (const oldPath of raw.superseded_storage_paths ?? []) {
      await removeEvidenceObject(dependencies, oldPath)
    }
    const grant = await issueEvidenceUploadGrant(dependencies, raw.storage_path)
    response.status(201).json({
      data: {
        document: applicantDocument(raw.document),
        submission_version: raw.submission.version,
        upload_url: grant.uploadUrl,
        headers: { 'x-upsert': 'false' },
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    })
  })

  router.post('/submissions/:id/documents/:documentId/complete', async (request, response) => {
    const { id, documentId } = parseParams(request, documentParamsSchema)
    const input = parseBody(request, completeVerificationEvidenceUploadInputSchema)
    await currentOwnedSubmission(dependencies, request.auth.profile.id, id)
    const { data: document, error: documentError } = await dependencies.database
      .from('verification_documents')
      .select('id,submission_id,storage_path,declared_mime,status')
      .eq('id', documentId)
      .eq('submission_id', id)
      .maybeSingle()
    if (documentError) throw fromDatabaseError(documentError)
    if (!document?.storage_path || !document.declared_mime) {
      throw new ApiError(404, 'not_found', 'Verification document not found.')
    }
    const validation = await downloadAndValidateEvidence(
      dependencies,
      document.storage_path as string,
      document.declared_mime as string,
    )
    const { error } = await dependencies.database.rpc('api_complete_verification_upload', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_document_id: documentId,
      p_expected_version: input.expected_version,
      p_detected_mime: validation.detectedMime,
      p_size_bytes: validation.bytes,
      p_sha256_hex: validation.sha256Hex,
      p_content_status: validation.valid ? 'valid' : 'invalid',
      // No scanner is configured in Phase 1 local development. Never mark a
      // file clean merely because its signature parsed correctly.
      p_malware_status: 'unavailable',
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    if (!validation.valid) {
      throw new ApiError(400, 'evidence_rejected', 'The evidence content does not match its declared file type.')
    }
    response.json({
      data: await loadWorkspace(dependencies, request.auth.profile.id, request.auth.user, request.auth.profile),
    })
  })

  router.post('/submissions/:id/documents/:documentId/remove', async (request, response) => {
    const { id, documentId } = parseParams(request, documentParamsSchema)
    const input = parseBody(request, removeVerificationEvidenceInputSchema)
    const { data, error } = await dependencies.database.rpc('api_remove_verification_document', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_document_id: documentId,
      p_expected_version: input.expected_version,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    await removeEvidenceObject(dependencies, (data as { storage_path?: string | null }).storage_path)
    response.json({
      data: await loadWorkspace(dependencies, request.auth.profile.id, request.auth.user, request.auth.profile),
    })
  })

  router.post('/submissions/:id/documents/:documentId/view', async (request, response) => {
    const { id, documentId } = parseParams(request, documentParamsSchema)
    const { data, error } = await dependencies.database.rpc('api_record_verification_evidence_view', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_document_id: documentId,
      p_admin_view: false,
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    const view = await issueEvidenceView(dependencies, (data as { storage_path: string }).storage_path)
    response.json({ data: { url: view.url, expires_at: view.expiresAt } })
  })

  router.post('/submissions/:id/submit', async (request, response) => {
    const { id } = parseParams(request, submissionParamsSchema)
    const input = parseBody(request, submitVerificationInputSchema)
    const { error } = await dependencies.database.rpc('api_submit_verification', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_expected_version: input.expected_version,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({
      data: await loadWorkspace(dependencies, request.auth.profile.id, request.auth.user, request.auth.profile),
    })
  })

  router.post('/submissions/:id/withdraw', async (request, response) => {
    const { id } = parseParams(request, submissionParamsSchema)
    const input = parseBody(request, withdrawVerificationInputSchema)
    const { error } = await dependencies.database.rpc('api_withdraw_verification', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_expected_version: input.expected_version,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    const { data: profile, error: profileError } = await dependencies.database
      .from('users').select('*').eq('id', request.auth.profile.id).single()
    if (profileError) throw fromDatabaseError(profileError)
    response.json({ data: await loadWorkspace(dependencies, profile.id, request.auth.user, profile) })
  })

  router.post('/phone/challenge', (request) => {
    parseBody(request, startProfessionalPhoneVerificationInputSchema)
    throw new ApiError(503, 'server', 'Professional phone verification is unavailable until an SMS provider is configured.')
  })

  router.post('/phone/confirm', (request) => {
    parseBody(request, confirmProfessionalPhoneVerificationInputSchema)
    throw new ApiError(503, 'server', 'Professional phone verification is unavailable until an SMS provider is configured.')
  })

  return router
}
