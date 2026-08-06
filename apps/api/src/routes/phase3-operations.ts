import { randomInt } from 'node:crypto'
import { Router, type Request } from 'express'
import { z } from 'zod'
import {
  appointmentVersionInputSchema,
  changeOfflinePaymentInputSchema,
  claimWalkInInputSchema,
  createAppointmentChangeProposalInputSchema,
  createNoShowAppealInputSchema,
  createWalkInInputSchema,
  dateKeySchema,
  idParamsSchema,
  recordOfflinePaymentInputSchema,
  reportAppointmentDelayInputSchema,
  respondAppointmentChangeProposalInputSchema,
  resolveNoShowAppealInputSchema,
  setCashierCapabilityInputSchema,
  transitionWalkInInputSchema,
  uuidSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'

const proposalParamsSchema = z.strictObject({ id: uuidSchema })
const scopeQuerySchema = z.strictObject({ scope: z.enum(['mine', 'shop']).default('mine') })
const reasonOnlySchema = z.strictObject({ reason: z.string().trim().min(3).max(1000) })
const closeoutSchema = z.strictObject({ local_date: dateKeySchema })

type AppointmentScope = {
  id: string
  customer_id: string
  barber_id: string
  shop_id: string
  version: number
}

function guestWalkInProjection(raw: unknown) {
  const row = raw as Record<string, unknown>
  return {
    id: row.id, shop_id: row.shop_id, customer_user_id: row.customer_user_id,
    service_id: row.service_id, assigned_provider_id: row.assigned_provider_id,
    display_name: row.display_name, queue_status: row.queue_status,
    quoted_at: row.quoted_at, checked_in_at: row.checked_in_at,
    started_at: row.started_at, completed_at: row.completed_at,
    manually_verified: row.manually_verified, version: row.version, updated_at: row.updated_at,
  }
}

async function appointmentScope(dependencies: ApiDependencies, appointmentId: string): Promise<AppointmentScope> {
  const { data, error } = await dependencies.database
    .from('appointments')
    .select('id,customer_id,barber_id,shop_id,version')
    .eq('id', appointmentId)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(404, 'not_found', 'Appointment not found.')
  return data as AppointmentScope
}

async function requireAppointmentParticipant(
  dependencies: ApiDependencies,
  request: Request,
  appointment: AppointmentScope,
): Promise<void> {
  const actorId = request.auth.profile.id
  if (request.auth.profile.role === 'customer' && appointment.customer_id === actorId) return
  if (request.auth.profile.role === 'shop_owner') {
    await requireOwnedShop(dependencies, request, appointment.shop_id)
    return
  }
  if (request.auth.profile.role === 'barber' && appointment.barber_id === actorId) {
    await requireActiveEmployment(dependencies, request, appointment.shop_id)
    return
  }
  throw new ApiError(403, 'forbidden', 'You are not a participant in this appointment.')
}

async function requireShopStaff(dependencies: ApiDependencies, request: Request, shopId: string): Promise<void> {
  if (request.auth.profile.role === 'shop_owner') {
    await requireOwnedShop(dependencies, request, shopId)
    return
  }
  requireRole(request, 'barber')
  await requireActiveEmployment(dependencies, request, shopId)
}

async function ownedShopId(dependencies: ApiDependencies, request: Request): Promise<string> {
  requireRole(request, 'shop_owner')
  const { data, error } = await dependencies.database.from('shops').select('id').eq('owner_id', request.auth.profile.id).maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(404, 'not_found', 'Owner shop not found.')
  return data.id as string
}

/** Narrow anonymous route: possession of a short-lived single-use code is the boundary. */
export function createPublicWalkInClaimRouter(dependencies: ApiDependencies): Router {
  const router = Router()
  router.post('/:id/claim', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, claimWalkInInputSchema)
    const { data, error } = await dependencies.database.rpc('api_claim_walk_in', {
      p_walk_in_id: id,
      p_token: input.code,
      p_phone: input.phone,
    })
    if (error) throw fromDatabaseError(error)
    const result = data as { ok?: boolean; code?: string; message?: string; walk_in?: unknown } | null
    if (!result?.ok) throw new ApiError(result?.code === 'too_many_attempts' ? 409 : 404, result?.code ?? 'invalid_code', result?.message ?? 'Claim code is invalid or expired.')
    response.json({ data: guestWalkInProjection(result.walk_in) })
  })
  return router
}

export function createPhase3OperationsRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/bookings/:id/change-proposals', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const appointment = await appointmentScope(dependencies, id)
    await requireAppointmentParticipant(dependencies, request, appointment)
    const { data, error } = await dependencies.database.from('appointment_change_proposals').select('*').eq('appointment_id', id).order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/bookings/:id/change-proposals', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, createAppointmentChangeProposalInputSchema)
    const appointment = await appointmentScope(dependencies, id)
    await requireShopStaff(dependencies, request, appointment.shop_id)
    if (request.auth.profile.role === 'barber' && appointment.barber_id !== request.auth.profile.id) {
      throw new ApiError(403, 'forbidden', 'Only the assigned provider may propose this change.')
    }
    const { data, error } = await dependencies.database.rpc('api_create_appointment_change_proposal', {
      p_appointment_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_service_id: input.service_id,
      p_provider_id: input.provider_id,
      p_starts_at: input.starts_at,
      p_reason: input.reason,
      p_expires_at: input.expires_at,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/booking-change-proposals/:id/respond', async (request, response) => {
    const { id } = parseParams(request, proposalParamsSchema)
    const input = parseBody(request, respondAppointmentChangeProposalInputSchema)
    requireRole(request, 'customer')
    const { data, error } = await dependencies.database.rpc('api_respond_appointment_change_proposal', {
      p_proposal_id: id,
      p_expected_proposal_version: input.expected_proposal_version,
      p_expected_appointment_version: input.expected_appointment_version,
      p_customer_id: request.auth.profile.id,
      p_decision: input.decision,
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/bookings/:id/delays', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const appointment = await appointmentScope(dependencies, id)
    await requireAppointmentParticipant(dependencies, request, appointment)
    const { data, error } = await dependencies.database.from('appointment_delays').select('*').eq('appointment_id', id).order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/bookings/:id/delays', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, reportAppointmentDelayInputSchema)
    const appointment = await appointmentScope(dependencies, id)
    await requireShopStaff(dependencies, request, appointment.shop_id)
    const { data, error } = await dependencies.database.rpc('api_report_appointment_delay', {
      p_appointment_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_category: input.category,
      p_estimate_minutes: input.estimate_minutes,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/bookings/:id/no-show-appeal', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, createNoShowAppealInputSchema)
    requireRole(request, 'customer')
    const appointment = await appointmentScope(dependencies, id)
    if (appointment.customer_id !== request.auth.profile.id) throw new ApiError(403, 'forbidden', 'You may only appeal your own no-show.')
    const { data, error } = await dependencies.database.rpc('api_create_no_show_appeal', {
      p_appointment_id: id,
      p_customer_id: request.auth.profile.id,
      p_reason: input.reason,
      p_evidence_note: input.evidence_note ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.get('/no-show-appeals', async (request, response) => {
    const { scope } = parseQuery(request, scopeQuerySchema)
    let query = dependencies.database.from('no_show_appeals').select('*')
    if (scope === 'mine') {
      requireRole(request, 'customer')
      query = query.eq('customer_id', request.auth.profile.id)
    } else {
      const shopId = await ownedShopId(dependencies, request)
      query = query.eq('shop_id', shopId)
    }
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/no-show-appeals/:id/resolve', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, resolveNoShowAppealInputSchema)
    requireRole(request, 'shop_owner')
    const { data: appeal, error: appealError } = await dependencies.database.from('no_show_appeals').select('shop_id').eq('id', id).maybeSingle()
    if (appealError) throw fromDatabaseError(appealError)
    if (!appeal) throw new ApiError(404, 'not_found', 'No-show appeal not found.')
    await requireOwnedShop(dependencies, request, appeal.shop_id as string)
    const { data, error } = await dependencies.database.rpc('api_resolve_no_show_appeal', {
      p_appeal_id: id,
      p_expected_version: input.expected_version,
      p_owner_id: request.auth.profile.id,
      p_resolution: input.resolution,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/bookings/:id/strike/waive', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, reasonOnlySchema)
    const appointment = await appointmentScope(dependencies, id)
    await requireOwnedShop(dependencies, request, appointment.shop_id)
    const { data, error } = await dependencies.database.rpc('api_waive_customer_strike', {
      p_appointment_id: id,
      p_owner_id: request.auth.profile.id,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/owner/attention', async (request, response) => {
    const shopId = await ownedShopId(dependencies, request)
    const { data, error } = await dependencies.database.from('appointment_attention_items').select('*').eq('shop_id', shopId).order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/walk-ins', async (request, response) => {
    let shopId: string
    if (request.auth.profile.role === 'shop_owner') shopId = await ownedShopId(dependencies, request)
    else shopId = (await requireActiveEmployment(dependencies, request)).shop_id as string
    const { data, error } = await dependencies.database.from('walk_in_entries').select('*').eq('shop_id', shopId).order('created_at')
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/walk-ins/:id/link', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    requireRole(request, 'customer')
    const { data, error } = await dependencies.database.rpc('api_link_walk_in_customer', {
      p_walk_in_id: id, p_customer_id: request.auth.profile.id,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: guestWalkInProjection(data) })
  })

  router.post('/walk-ins', async (request, response) => {
    const input = parseBody(request, createWalkInInputSchema)
    let shopId: string
    if (request.auth.profile.role === 'shop_owner') shopId = await ownedShopId(dependencies, request)
    else shopId = (await requireActiveEmployment(dependencies, request)).shop_id as string
    const { data, error } = await dependencies.database.rpc('api_create_walk_in', {
      p_shop_id: shopId,
      p_actor_id: request.auth.profile.id,
      p_display_name: input.display_name,
      p_service_id: input.service_id ?? null,
      p_requested_barber_id: input.requested_barber_id ?? null,
      p_notes: input.notes ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/walk-ins/:id/claim-code', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentVersionInputSchema)
    const { data: walkIn, error: walkInError } = await dependencies.database.from('walk_in_entries').select('shop_id').eq('id', id).maybeSingle()
    if (walkInError) throw fromDatabaseError(walkInError)
    if (!walkIn) throw new ApiError(404, 'not_found', 'Walk-in not found.')
    await requireShopStaff(dependencies, request, walkIn.shop_id as string)
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    const { error } = await dependencies.database.rpc('api_issue_walk_in_claim', {
      p_walk_in_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_token: code,
      p_expires_at: expiresAt,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: { walk_in_id: id, code, expires_at: expiresAt, walk_in_version: input.expected_version + 1 } })
  })

  router.post('/walk-ins/:id/transition', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, transitionWalkInInputSchema)
    const { data: walkIn, error: walkInError } = await dependencies.database.from('walk_in_entries').select('shop_id').eq('id', id).maybeSingle()
    if (walkInError) throw fromDatabaseError(walkInError)
    if (!walkIn) throw new ApiError(404, 'not_found', 'Walk-in not found.')
    await requireShopStaff(dependencies, request, walkIn.shop_id as string)
    const { data, error } = await dependencies.database.rpc('api_transition_walk_in', {
      p_walk_in_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_action: input.action,
      p_provider_id: input.provider_id ?? null,
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/walk-ins/:id/timeline', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { data: walkIn, error: walkInError } = await dependencies.database.from('walk_in_entries').select('shop_id').eq('id', id).maybeSingle()
    if (walkInError) throw fromDatabaseError(walkInError)
    if (!walkIn) throw new ApiError(404, 'not_found', 'Walk-in not found.')
    await requireShopStaff(dependencies, request, walkIn.shop_id as string)
    const { data, error } = await dependencies.database.from('queue_events').select('*').eq('walk_in_id', id).order('created_at')
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/payments', async (request, response) => {
    let query = dependencies.database.from('payment_records').select('*')
    if (request.auth.profile.role === 'customer') {
      const { data: appointments, error } = await dependencies.database.from('appointments').select('id').eq('customer_id', request.auth.profile.id)
      if (error) throw fromDatabaseError(error)
      const appointmentIds = (appointments ?? []).map((row) => row.id as string)
      if (appointmentIds.length === 0) return response.json({ data: [] })
      query = query.in('appointment_id', appointmentIds)
    } else if (request.auth.profile.role === 'shop_owner') {
      query = query.eq('shop_id', await ownedShopId(dependencies, request))
    } else {
      const employment = await requireActiveEmployment(dependencies, request)
      const { data: capability, error } = await dependencies.database.from('shop_cashier_capabilities').select('active').eq('shop_id', employment.shop_id as string).eq('user_id', request.auth.profile.id).maybeSingle()
      if (error) throw fromDatabaseError(error)
      if (!capability?.active) throw new ApiError(403, 'capability_required', 'Payment-record capability is required.')
      query = query.eq('shop_id', employment.shop_id as string)
    }
    const { data, error } = await query.order('paid_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/payments', async (request, response) => {
    const input = parseBody(request, recordOfflinePaymentInputSchema)
    const { data, error } = await dependencies.database.rpc('api_record_offline_payment', {
      p_appointment_id: input.appointment_id ?? null,
      p_walk_in_id: input.walk_in_id ?? null,
      p_actor_id: request.auth.profile.id,
      p_method: input.method,
      p_currency: input.currency,
      p_amount_cents: input.amount_cents,
      p_paid_at: input.paid_at,
      p_idempotency_key: input.idempotency_key,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/payments/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, changeOfflinePaymentInputSchema)
    const { data, error } = await dependencies.database.rpc('api_change_offline_payment', {
      p_payment_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_action: input.action,
      p_amount_cents: input.amount_cents,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/payments/:id/timeline', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { data: payment, error: paymentError } = await dependencies.database.from('payment_records').select('shop_id,appointment_id').eq('id', id).maybeSingle()
    if (paymentError) throw fromDatabaseError(paymentError)
    if (!payment) throw new ApiError(404, 'not_found', 'Payment record not found.')
    if (request.auth.profile.role === 'customer') {
      if (!payment.appointment_id) throw new ApiError(403, 'forbidden', 'This receipt is not linked to your account.')
      const appointment = await appointmentScope(dependencies, payment.appointment_id as string)
      if (appointment.customer_id !== request.auth.profile.id) throw new ApiError(403, 'forbidden', 'This receipt is not yours.')
    } else await requireShopStaff(dependencies, request, payment.shop_id as string)
    const { data, error } = await dependencies.database.from('payment_events').select('*').eq('payment_id', id).order('created_at')
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.put('/owner/cashiers/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, setCashierCapabilityInputSchema)
    const shopId = await ownedShopId(dependencies, request)
    const { data, error } = await dependencies.database.rpc('api_set_cashier_capability', {
      p_shop_id: shopId, p_owner_id: request.auth.profile.id, p_user_id: id, p_active: input.active,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/notifications', async (request, response) => {
    const { data, error } = await dependencies.database.from('in_app_notifications').select('*').eq('recipient_id', request.auth.profile.id).order('created_at', { ascending: false }).limit(100)
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })
  router.post('/notifications/:id/read', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { data, error } = await dependencies.database.rpc('api_mark_notification_read', { p_notification_id: id, p_recipient_id: request.auth.profile.id })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/owner/closeouts', async (request, response) => {
    const shopId = await ownedShopId(dependencies, request)
    const { data, error } = await dependencies.database.from('closeout_runs').select('*').eq('shop_id', shopId).order('local_date', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })
  router.post('/owner/closeouts', async (request, response) => {
    const input = parseBody(request, closeoutSchema)
    const shopId = await ownedShopId(dependencies, request)
    const { data, error } = await dependencies.database.rpc('api_run_shop_closeout', { p_shop_id: shopId, p_local_date: input.local_date })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  return router
}

export async function processPhase3Operations(dependencies: ApiDependencies): Promise<void> {
  const results = await Promise.all([
    dependencies.database.rpc('api_process_due_no_show_reviews'),
    dependencies.database.rpc('api_deliver_due_in_app_notifications', { p_limit: 100 }),
    dependencies.database.rpc('api_run_due_closeouts'),
    // The seven-day review lock is enforced by `api_edit_rating` regardless of
    // this sweep; the sweep exists so "then lock" becomes a recorded event
    // instead of an inference from a timestamp.
    dependencies.database.rpc('api_lock_due_ratings', { p_limit: 200 }),
    // A shop decision the customer never answered becomes final, and the closure
    // is a recorded fact rather than an open case nobody is working.
    dependencies.database.rpc('api_close_unanswered_dispute_decisions', { p_limit: 200 }),
    // Message retention is two years (plan section 3). Bounded per cycle so a
    // long-neglected deployment cannot turn one worker tick into a table scan.
    dependencies.database.rpc('api_purge_expired_messages', { p_limit: 500 }),
  ])
  for (const result of results) {
    if (result.error) throw fromDatabaseError(result.error)
  }
}
