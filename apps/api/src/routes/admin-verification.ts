import { Buffer } from 'node:buffer'
import { Router } from 'express'
import { z } from 'zod'
import {
  accountCapabilityGrantSchema,
  adminVerificationDetailSchema,
  adminVerificationQueueItemSchema,
  getAdminVerificationAllowedActions,
  getProfessionalAdminAllowedActions,
  professionalAccessSummarySchema,
  type AccountCapabilityGrant,
  type AdminVerificationDetail,
  type AdminVerificationQueueItem,
  type ProfessionalAccessSummary,
} from '@barbershop/shared'
import {
  approveVerificationInputSchema,
  assignVerificationReviewerInputSchema,
  listAdminVerificationsQuerySchema,
  rejectVerificationInputSchema,
  requestVerificationInformationInputSchema,
  restoreProfessionalInputSchema,
  suspendProfessionalInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import {
  requireAccountCapability,
  requireAssignedReviewer,
} from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'
import { issueEvidenceView } from '../lib/verification-evidence'
import { applicantDocument, applicantEvent, applicantSubmission } from './verification'

const idParamsSchema = z.strictObject({ id: z.string().uuid() })
const userParamsSchema = z.strictObject({ userId: z.string().uuid() })
const evidenceParamsSchema = z.strictObject({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
})
const queueCursorSchema = z.strictObject({
  submitted_at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
})

type DatabaseRow = Record<string, unknown>

function normalizedPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, '') ?? ''
  return digits.length > 0 ? digits : null
}

function encodeQueueCursor(row: { submitted_at: string; id: string }): string {
  return Buffer.from(JSON.stringify(row), 'utf8').toString('base64url')
}

function decodeQueueCursor(value: string): z.infer<typeof queueCursorSchema> {
  try {
    return queueCursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
  } catch {
    throw new ApiError(400, 'validation', 'The verification queue cursor is invalid.')
  }
}

function capabilityGrant(row: DatabaseRow): AccountCapabilityGrant {
  return accountCapabilityGrantSchema.parse({
    id: row.id,
    user_id: row.user_id,
    shop_id: row.shop_id,
    capability: row.capability,
    state: row.state,
    granted_by: row.granted_by,
    granted_at: row.granted_at,
    revoked_by: row.revoked_by,
    revoked_at: row.revoked_at,
    version: Number(row.version),
  })
}

async function listCapabilities(
  dependencies: ApiDependencies,
  userId: string,
): Promise<AccountCapabilityGrant[]> {
  const { data, error } = await dependencies.database
    .from('account_capabilities')
    .select([
      'id', 'user_id', 'shop_id', 'capability', 'state', 'granted_by',
      'granted_at', 'revoked_by', 'revoked_at', 'version',
    ].join(','))
    .eq('user_id', userId)
    .order('granted_at', { ascending: true })
  if (error) throw fromDatabaseError(error)
  return ((data ?? []) as unknown as DatabaseRow[]).map(capabilityGrant)
}

async function loadAdminDetail(
  dependencies: ApiDependencies,
  request: Express.Request,
  submissionId: string,
): Promise<AdminVerificationDetail> {
  const { data: row, error } = await dependencies.database
    .from('verification_submissions')
    .select([
      'id', 'user_id', 'requested_role', 'status', 'attempt_number',
      'supersedes_submission_id', 'legal_name', 'form_schema_version',
      'form_data', 'submission_round', 'assigned_reviewer_id', 'assigned_at',
      'submitted_at', 'reviewed_at', 'retry_after', 'applicant_reason_code',
      'applicant_message', 'version', 'created_at', 'updated_at',
      'applicant:users!verification_submissions_user_id_fkey(id,full_name,email,phone)',
    ].join(','))
    .eq('id', submissionId)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!row) throw new ApiError(404, 'not_found', 'Verification request not found.')

  const submissionRow = row as unknown as DatabaseRow
  const [documentsResult, eventsResult, reviewerCapabilities, authResult] = await Promise.all([
    dependencies.database
      .from('verification_documents')
      .select([
        'id', 'submission_id', 'document_type', 'status', 'declared_mime',
        'declared_size_bytes', 'detected_mime', 'size_bytes', 'content_status',
        'malware_status', 'uploaded_at', 'validated_at', 'scanned_at',
        'purge_after', 'purged_at', 'version', 'created_at',
      ].join(','))
      .eq('submission_id', submissionId)
      .not('status', 'in', '(superseded,purged)')
      .order('created_at', { ascending: true }),
    dependencies.database
      .from('verification_events')
      .select([
        'id', 'event_type', 'from_status', 'to_status', 'public_reason_code',
        'public_message', 'metadata', 'created_at',
      ].join(','))
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    listCapabilities(dependencies, request.auth.profile.id),
    dependencies.database.auth.admin.getUserById(submissionRow.user_id as string),
  ])
  if (documentsResult.error) throw fromDatabaseError(documentsResult.error)
  if (eventsResult.error) throw fromDatabaseError(eventsResult.error)
  if (authResult.error || !authResult.data.user) {
    throw new ApiError(409, 'verification_locked', 'The applicant Auth account is unavailable.')
  }

  const applicant = submissionRow.applicant as {
    id: string
    full_name: string
    email: string
    phone: string | null
  }
  const authUser = authResult.data.user
  return adminVerificationDetailSchema.parse({
    applicant,
    submission: applicantSubmission(submissionRow),
    documents: ((documentsResult.data ?? []) as unknown as DatabaseRow[]).map(applicantDocument),
    timeline: ((eventsResult.data ?? []) as unknown as DatabaseRow[]).map(applicantEvent),
    assigned_reviewer_id: submissionRow.assigned_reviewer_id,
    assigned_at: submissionRow.assigned_at,
    email_confirmed: Boolean(authUser.email_confirmed_at),
    professional_phone_verified: Boolean(
      authUser.phone_confirmed_at
      && normalizedPhone(authUser.phone)
      && normalizedPhone(authUser.phone) === normalizedPhone(applicant.phone),
    ),
    allowed_actions: getAdminVerificationAllowedActions({
      status: submissionRow.status as AdminVerificationDetail['submission']['status'],
      aal: request.auth.aal,
      viewer_id: request.auth.profile.id,
      assigned_reviewer_id: submissionRow.assigned_reviewer_id as string | null,
      capabilities: reviewerCapabilities,
    }),
  })
}

async function loadProfessional(
  dependencies: ApiDependencies,
  request: Express.Request,
  userId: string,
): Promise<ProfessionalAccessSummary> {
  const { data: profile, error: profileError } = await dependencies.database
    .from('users')
    .select('id,full_name,email,role,requested_role,verification_status,authorization_version')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) throw fromDatabaseError(profileError)
  if (!profile || (profile.role !== 'barber' && profile.role !== 'shop_owner')) {
    throw new ApiError(404, 'not_found', 'Professional account not found.')
  }

  const { data: submission, error: submissionError } = await dependencies.database
    .from('verification_submissions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .maybeSingle()
  if (submissionError) throw fromDatabaseError(submissionError)
  if (!submission) throw new ApiError(409, 'verification_locked', 'Approved verification history was not found.')

  const [targetCapabilities, actorCapabilities] = await Promise.all([
    listCapabilities(dependencies, userId),
    listCapabilities(dependencies, request.auth.profile.id),
  ])
  return professionalAccessSummarySchema.parse({
    user_id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role: profile.role,
    requested_role: profile.requested_role,
    verification_status: profile.verification_status,
    authorization_version: profile.authorization_version,
    approved_submission_id: submission.id,
    professional_access: targetCapabilities.some((grant) => (
      grant.capability === 'professional_access' && grant.state === 'active' && grant.shop_id === null
    )),
    capabilities: targetCapabilities,
    allowed_actions: getProfessionalAdminAllowedActions(
      profile.verification_status,
      request.auth.aal,
      actorCapabilities,
    ),
  })
}

export function createAdminVerificationRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/verifications', async (request, response) => {
    await requireAccountCapability(dependencies, request, 'verification_queue_read')
    const query = parseQuery(request, listAdminVerificationsQuerySchema)
    const limit = query.limit ?? 25
    let builder = dependencies.database
      .from('verification_submissions')
      .select([
        'id', 'requested_role', 'status', 'attempt_number', 'submitted_at',
        'assigned_reviewer_id', 'assigned_at', 'version', 'created_at', 'updated_at',
        'applicant:users!verification_submissions_user_id_fkey(id,full_name)',
      ].join(','))
      .neq('status', 'draft')
      .order('submitted_at', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })
      .limit(limit + 1)
    if (query.role) builder = builder.eq('requested_role', query.role)
    if (query.status) builder = builder.eq('status', query.status)
    if (query.assigned === 'me') builder = builder.eq('assigned_reviewer_id', request.auth.profile.id)
    if (query.assigned === 'unassigned') builder = builder.is('assigned_reviewer_id', null)
    if (query.cursor) {
      const cursor = decodeQueueCursor(query.cursor)
      builder = builder.or(
        `submitted_at.gt.${cursor.submitted_at},and(submitted_at.eq.${cursor.submitted_at},id.gt.${cursor.id})`,
      )
    }
    const { data, error } = await builder
    if (error) throw fromDatabaseError(error)
    const rows = (data ?? []) as unknown as DatabaseRow[]
    const hasNext = rows.length > limit
    const selected = rows.slice(0, limit)
    const items = selected.map((row): AdminVerificationQueueItem => adminVerificationQueueItemSchema.parse({
      id: row.id,
      applicant: row.applicant,
      requested_role: row.requested_role,
      status: row.status,
      attempt_number: Number(row.attempt_number),
      submitted_at: row.submitted_at,
      assigned_reviewer_id: row.assigned_reviewer_id,
      assigned_at: row.assigned_at,
      version: Number(row.version),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
    const last = hasNext ? selected.at(-1) : undefined
    response.json({
      data: {
        items,
        next_cursor: typeof last?.submitted_at === 'string' && typeof last.id === 'string'
          ? encodeQueueCursor({ submitted_at: last.submitted_at, id: last.id })
          : null,
      },
    })
  })

  router.get('/verifications/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireAssignedReviewer(dependencies, request, id)
    response.json({ data: await loadAdminDetail(dependencies, request, id) })
  })

  router.post('/verifications/:id/assign', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, assignVerificationReviewerInputSchema)
    await requireAccountCapability(dependencies, request, 'verification_assign')
    if (input.reviewer_id !== request.auth.profile.id) {
      throw new ApiError(400, 'validation', 'Phase 1 assignment supports claiming a case for yourself only.')
    }
    const { error } = await dependencies.database.rpc('api_assign_verification_reviewer', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_reviewer_id: input.reviewer_id,
      p_expected_version: input.expected_version,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await loadAdminDetail(dependencies, request, id) })
  })

  router.post('/verifications/:id/documents/:documentId/view', async (request, response) => {
    const { id, documentId } = parseParams(request, evidenceParamsSchema)
    await requireAssignedReviewer(dependencies, request, id)
    const { data, error } = await dependencies.database.rpc('api_record_verification_evidence_view', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_document_id: documentId,
      p_admin_view: true,
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    const view = await issueEvidenceView(dependencies, (data as { storage_path: string }).storage_path)
    response.json({ data: { url: view.url, expires_at: view.expiresAt } })
  })

  router.post('/verifications/:id/request-information', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, requestVerificationInformationInputSchema)
    await requireAssignedReviewer(dependencies, request, id)
    const { error } = await dependencies.database.rpc('api_request_verification_information', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_expected_version: input.expected_version,
      p_public_reason_code: 'missing_information',
      p_public_message: input.public_message ?? 'Please update the requested verification information.',
      p_information_items: input.information_items,
      p_private_reason_code: input.private_reason_code ?? null,
      p_private_note: input.private_note ?? null,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await loadAdminDetail(dependencies, request, id) })
  })

  router.post('/verifications/:id/approve', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, approveVerificationInputSchema)
    await requireAssignedReviewer(dependencies, request, id)
    const { error } = await dependencies.database.rpc('api_approve_verification', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_expected_version: input.expected_version,
      p_private_note: input.private_note ?? null,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await loadAdminDetail(dependencies, request, id) })
  })

  router.post('/verifications/:id/reject', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, rejectVerificationInputSchema)
    await requireAssignedReviewer(dependencies, request, id)
    const { error } = await dependencies.database.rpc('api_reject_verification', {
      p_actor_id: request.auth.profile.id,
      p_submission_id: id,
      p_expected_version: input.expected_version,
      p_public_reason_code: input.public_reason_code,
      p_public_message: input.public_message ?? 'We could not verify this professional request.',
      p_private_reason_code: input.private_reason_code,
      p_private_note: input.private_note ?? '',
      p_retry_after: null,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await loadAdminDetail(dependencies, request, id) })
  })

  router.get('/users/:userId', async (request, response) => {
    const { userId } = parseParams(request, userParamsSchema)
    await requireAccountCapability(dependencies, request, 'professional_suspend')
    response.json({ data: await loadProfessional(dependencies, request, userId) })
  })

  router.post('/users/:userId/suspend', async (request, response) => {
    const { userId } = parseParams(request, userParamsSchema)
    const input = parseBody(request, suspendProfessionalInputSchema)
    await requireAccountCapability(dependencies, request, 'professional_suspend')
    const { error } = await dependencies.database.rpc('api_suspend_professional', {
      p_actor_id: request.auth.profile.id,
      p_user_id: userId,
      p_expected_authorization_version: input.expected_authorization_version,
      p_public_reason_code: input.public_reason_code,
      p_public_message: input.public_message ?? 'Professional access has been suspended.',
      p_private_reason_code: input.private_reason_code,
      p_private_note: input.private_note ?? '',
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await loadProfessional(dependencies, request, userId) })
  })

  router.post('/users/:userId/restore', async (request, response) => {
    const { userId } = parseParams(request, userParamsSchema)
    const input = parseBody(request, restoreProfessionalInputSchema)
    await requireAccountCapability(dependencies, request, 'professional_suspend')
    const { error } = await dependencies.database.rpc('api_restore_professional', {
      p_actor_id: request.auth.profile.id,
      p_user_id: userId,
      p_expected_authorization_version: input.expected_authorization_version,
      p_public_reason_code: input.public_reason_code,
      p_public_message: input.public_message ?? 'Professional access has been restored.',
      p_private_reason_code: input.private_reason_code,
      p_private_note: input.private_note ?? null,
      p_command_id: input.command_id,
      p_request_id: null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await loadProfessional(dependencies, request, userId) })
  })

  return router
}
