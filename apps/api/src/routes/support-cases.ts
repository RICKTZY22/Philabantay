import { Router, type Request } from 'express'
import { z } from 'zod'
import {
  addCaseEvidenceInputSchema,
  caseReasonInputSchema,
  caseVersionInputSchema,
  decideAppointmentDisputeInputSchema,
  escalateRatingReportInputSchema,
  idParamsSchema,
  openAppointmentDisputeInputSchema,
  respondToDisputeDecisionInputSchema,
  resolveSupportCaseInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import {
  requireAccountCapability,
  requireActiveEmployment,
  requireOwnedShop,
  requireRole,
} from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'

const caseScopeQuerySchema = z.strictObject({ scope: z.enum(['mine', 'shop']).default('mine') })
const adminQueueQuerySchema = z.strictObject({
  status: z.enum(['escalated', 'information_requested', 'resolved']).default('escalated'),
})

type CaseRow = Record<string, unknown>

async function caseScope(dependencies: ApiDependencies, caseId: string): Promise<CaseRow> {
  const { data, error } = await dependencies.database
    .from('support_cases')
    .select('*')
    .eq('id', caseId)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(404, 'not_found', 'Support case not found.')
  return data
}

/**
 * Resolves the caller's role on a case, or refuses. Participation is the
 * authority: an admin without `dispute_review` is a stranger here, and so is an
 * owner whose shop is not on the case.
 */
async function caseActorRole(
  dependencies: ApiDependencies,
  request: Request,
  supportCase: CaseRow,
): Promise<'customer' | 'barber' | 'shop_owner' | 'admin'> {
  const actorId = request.auth.profile.id
  if (request.auth.profile.role === 'admin') {
    await requireAccountCapability(dependencies, request, 'dispute_review')
    return 'admin'
  }
  // Owner branch before barber, for the owner-provider case (D-028).
  if (request.auth.profile.role === 'shop_owner') {
    await requireOwnedShop(dependencies, request, supportCase.shop_id as string)
    return 'shop_owner'
  }
  const { data, error } = await dependencies.database
    .from('case_participants')
    .select('participant_role')
    .eq('case_id', supportCase.id as string)
    .eq('user_id', actorId)
    .is('removed_at', null)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(403, 'forbidden', 'You are not a participant in this case.')
  const role = data.participant_role as 'customer' | 'barber' | 'shop_owner' | 'admin'
  if (role === 'barber') await requireActiveEmployment(dependencies, request, supportCase.shop_id as string)
  return role
}

/** Every read of a case body is an audited access, per the phase plan. */
async function recordAccess(
  dependencies: ApiDependencies,
  caseId: string,
  actorId: string,
  actorRole: string,
): Promise<void> {
  const { error } = await dependencies.database.rpc('api_record_case_access', {
    p_case_id: caseId,
    p_actor_id: actorId,
    p_actor_role: actorRole,
  })
  if (error) throw fromDatabaseError(error)
}

export function createSupportCaseRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.post('/bookings/:id/disputes', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    requireRole(request, 'customer')
    const input = parseBody(request, openAppointmentDisputeInputSchema)
    const { data, error } = await dependencies.database.rpc('api_open_appointment_dispute', {
      p_appointment_id: id,
      p_expected_version: input.expected_version,
      p_customer_id: request.auth.profile.id,
      p_reason: input.reason,
      p_evidence_note: input.evidence_note ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.get('/support-cases', async (request, response) => {
    const { scope } = parseQuery(request, caseScopeQuerySchema)
    let query = dependencies.database.from('support_cases').select('*')
    if (scope === 'shop') {
      const shop = await requireOwnedShop(dependencies, request)
      query = query.eq('shop_id', shop.id as string)
    } else {
      // A participant list, not an ownership list, so a barber on a dispute about
      // their own visit can see it without owning the shop.
      const { data: memberships, error: membershipError } = await dependencies.database
        .from('case_participants')
        .select('case_id')
        .eq('user_id', request.auth.profile.id)
        .is('removed_at', null)
      if (membershipError) throw fromDatabaseError(membershipError)
      const caseIds = (memberships ?? []).map((row) => row.case_id as string)
      if (caseIds.length === 0) return response.json({ data: [] })
      query = query.in('id', caseIds)
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(200)
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/support-cases/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const supportCase = await caseScope(dependencies, id)
    const role = await caseActorRole(dependencies, request, supportCase)
    await recordAccess(dependencies, id, request.auth.profile.id, role)

    const [{ data: evidence, error: evidenceError }, { data: events, error: eventError }, { data: participants, error: participantError }] = await Promise.all([
      dependencies.database.from('case_evidence').select('*').eq('case_id', id).order('created_at'),
      dependencies.database.from('case_events').select('*').eq('case_id', id).order('seq'),
      dependencies.database
        .from('case_participants')
        .select('user_id,participant_role,profile:users!case_participants_user_id_fkey(full_name)')
        .eq('case_id', id)
        .is('removed_at', null),
    ])
    if (evidenceError) throw fromDatabaseError(evidenceError)
    if (eventError) throw fromDatabaseError(eventError)
    if (participantError) throw fromDatabaseError(participantError)

    response.json({
      data: {
        case: supportCase,
        // Reviewer-only notes never leave the console. This is the filter the
        // schema comment refers to; there is no RLS policy that could make this
        // distinction for a service-role read.
        evidence: (evidence ?? []).filter((row) => role === 'admin' || row.visibility === 'case'),
        events: events ?? [],
        participants: (participants ?? []).map((row) => ({
          user_id: row.user_id,
          participant_role: row.participant_role,
          full_name: (row.profile as { full_name?: string } | null)?.full_name ?? null,
        })),
      },
    })
  })

  router.post('/support-cases/:id/evidence', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, addCaseEvidenceInputSchema)
    const supportCase = await caseScope(dependencies, id)
    await caseActorRole(dependencies, request, supportCase)
    const { data, error } = await dependencies.database.rpc('api_add_case_evidence', {
      p_case_id: id,
      p_actor_id: request.auth.profile.id,
      p_note: input.note,
      p_visibility: input.visibility ?? 'case',
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/support-cases/:id/decision', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    requireRole(request, 'shop_owner')
    const input = parseBody(request, decideAppointmentDisputeInputSchema)
    const supportCase = await caseScope(dependencies, id)
    await requireOwnedShop(dependencies, request, supportCase.shop_id as string)
    const { data, error } = await dependencies.database.rpc('api_decide_appointment_dispute', {
      p_case_id: id,
      p_expected_version: input.expected_version,
      p_owner_id: request.auth.profile.id,
      p_decision: input.decision,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/support-cases/:id/response', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    requireRole(request, 'customer')
    const input = parseBody(request, respondToDisputeDecisionInputSchema)
    const { data, error } = await dependencies.database.rpc('api_respond_to_dispute_decision', {
      p_case_id: id,
      p_expected_version: input.expected_version,
      p_customer_id: request.auth.profile.id,
      p_response: input.response,
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/rating-reports/:id/escalate', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, escalateRatingReportInputSchema)
    const { data, error } = await dependencies.database.rpc('api_escalate_rating_report', {
      p_report_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  return router
}

/** Admin queue. Mounted under the AAL2 `/admin` router. */
export function createSupportCaseAdminRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/disputes', async (request, response) => {
    await requireAccountCapability(dependencies, request, 'dispute_review')
    const { status } = parseQuery(request, adminQueueQuerySchema)
    // The queue shows only escalated work. An owner-review case is the shop's
    // business and deliberately never appears here.
    const { data, error } = await dependencies.database
      .from('support_cases')
      .select('*')
      .eq('status', status)
      .order('escalated_at', { ascending: true, nullsFirst: false })
      .limit(200)
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/disputes/:id/assign', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireAccountCapability(dependencies, request, 'dispute_review')
    const input = parseBody(request, caseVersionInputSchema)
    const { data, error } = await dependencies.database.rpc('api_assign_support_case', {
      p_case_id: id,
      p_expected_version: input.expected_version,
      p_admin_id: request.auth.profile.id,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/disputes/:id/request-information', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireAccountCapability(dependencies, request, 'dispute_review')
    const input = parseBody(request, caseReasonInputSchema)
    const { data, error } = await dependencies.database.rpc('api_request_case_information', {
      p_case_id: id,
      p_expected_version: input.expected_version,
      p_admin_id: request.auth.profile.id,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/disputes/:id/resolve', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireAccountCapability(dependencies, request, 'dispute_review')
    const input = parseBody(request, resolveSupportCaseInputSchema)
    const { data, error } = await dependencies.database.rpc('api_resolve_support_case', {
      p_case_id: id,
      p_expected_version: input.expected_version,
      p_admin_id: request.auth.profile.id,
      p_resolution: input.resolution,
      p_reason: input.reason,
      p_corrected_status: input.corrected_status ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/case-audit', async (request, response) => {
    await requireAccountCapability(dependencies, request, 'dispute_review')
    // Sensitive-access view: who opened which case body, newest first.
    const { data, error } = await dependencies.database
      .from('case_events')
      .select('*')
      .eq('event_type', 'accessed')
      .order('seq', { ascending: false })
      .limit(200)
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  return router
}
