import { randomInt } from 'node:crypto'
import { Router, type Request } from 'express'
import { z } from 'zod'
import {
  appointmentReasonInputSchema,
  appointmentVersionInputSchema,
  checkInAppointmentInputSchema,
  createAppointmentInputSchema,
  idParamsSchema,
  isoTimestampSchema,
  reassignAppointmentInputSchema,
  resolveAppointmentDisputeInputSchema,
  uuidSchema,
} from '@barbershop/shared/schemas'
import {
  CAPACITY_BLOCKING_APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentCheckInCode,
  type AppointmentEvent,
} from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import { manilaDateTimeParts, wallMinute } from '../lib/manila-time'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'
import { PUBLIC_BARBER_COLUMNS, PUBLIC_SERVICE_COLUMNS, PUBLIC_SHOP_COLUMNS } from './public-catalog'

const appointmentColumns = `
  id,
  customer_id,
  barber_id,
  shop_id,
  service_id,
  starts_at,
  ends_at,
  status,
  notes,
  created_at,
  updated_at,
  version,
  status_updated_at,
  expires_at,
  checked_in_at,
  actual_started_at,
  actual_finished_at,
  completion_due_at,
  completed_at,
  cancelled_at,
  cancelled_by,
  cancellation_reason,
  no_show_marked_at,
  no_show_marked_by,
  no_show_reason,
  dispute_opened_at,
  dispute_reason,
  booked_service_name,
  booked_duration_min,
  booked_price_cents,
  check_in_code_expires_at
`

const appointmentSelect = `
  ${appointmentColumns},
  service:services!appointments_service_shop_fk(${PUBLIC_SERVICE_COLUMNS}),
  barber:barbers!appointments_barber_id_fkey(${PUBLIC_BARBER_COLUMNS},profile:users!barbers_id_fkey(id,full_name,avatar_url)),
  customer:users!appointments_customer_id_fkey(id,full_name,avatar_url),
  shop:shops!appointments_shop_id_fkey(${PUBLIC_SHOP_COLUMNS})
`

const statsQuerySchema = z.strictObject({ range: z.enum(['week', 'month', 'all']).default('month') })
const rescheduleInputSchema = z.strictObject({
  expected_version: z.number().int().positive().optional(),
  barber_id: uuidSchema,
  service_id: uuidSchema,
  starts_at: isoTimestampSchema,
  notes: z.string().trim().max(1000).optional(),
})
const legacyCancelInputSchema = z.strictObject({
  expected_version: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(1000).optional(),
})

type AppointmentRecord = Appointment & { [key: string]: unknown }

function safeAppointmentRecord(raw: unknown): AppointmentRecord {
  const safe = { ...(raw as AppointmentRecord) }
  // Defense in depth: database grants hide this column from browser JWTs, and
  // the API must never serialize a password-equivalent check-in secret either.
  delete safe.check_in_code_hash
  return safe
}

function requireEligibleBookingCustomer(request: Request): void {
  requireRole(request, 'customer')
  const profile = request.auth.profile
  if (profile.requested_role !== 'customer'
      || profile.verification_status !== 'not_required'
      || !profile.onboarding_completed) {
    throw new ApiError(403, 'forbidden', 'Only completed customer accounts can create appointments.')
  }
}

async function bookingScope(
  dependencies: ApiDependencies,
  barberId: string,
  serviceId: string,
) {
  const [{ data: employment, error: employmentError }, { data: service, error: serviceError }, { data: barber, error: barberError }, { data: profile, error: profileError }] = await Promise.all([
    dependencies.database
      .from('barber_employment')
      .select('id,shop_id')
      .eq('barber_id', barberId)
      .eq('status', 'active')
      .is('ended_at', null)
      .lte('hired_at', manilaDateTimeParts().date)
      .maybeSingle(),
    dependencies.database.from('services').select('id,shop_id,duration_min,active').eq('id', serviceId).maybeSingle(),
    dependencies.database.from('barbers').select('accepting_bookings').eq('id', barberId).maybeSingle(),
    dependencies.database
      .from('users')
      .select('role,requested_role,verification_status,onboarding_completed')
      .eq('id', barberId)
      .maybeSingle(),
  ])
  if (employmentError) throw fromDatabaseError(employmentError)
  if (serviceError) throw fromDatabaseError(serviceError)
  if (barberError) throw fromDatabaseError(barberError)
  if (profileError) throw fromDatabaseError(profileError)
  const verifiedBarber = profile?.role === 'barber'
    && profile.requested_role === 'barber'
    && profile.verification_status === 'verified'
    && profile.onboarding_completed === true
  if (!employment || !service || !service.active || !barber?.accepting_bookings || !verifiedBarber
      || employment.shop_id !== service.shop_id) {
    throw new ApiError(400, 'validation', 'Barber and service must be active at the same shop.')
  }
  return { employmentId: employment.id as string, shopId: employment.shop_id as string, durationMin: Number(service.duration_min) }
}

async function reassignmentScope(
  dependencies: ApiDependencies,
  barberId: string,
  shopId: string,
  bookedDurationMin: number,
) {
  const [{ data: employment, error: employmentError }, { data: barber, error: barberError }, { data: profile, error: profileError }] = await Promise.all([
    dependencies.database
      .from('barber_employment')
      .select('id,shop_id')
      .eq('barber_id', barberId)
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .is('ended_at', null)
      .lte('hired_at', manilaDateTimeParts().date)
      .maybeSingle(),
    dependencies.database.from('barbers').select('accepting_bookings').eq('id', barberId).maybeSingle(),
    dependencies.database
      .from('users')
      .select('role,requested_role,verification_status,onboarding_completed')
      .eq('id', barberId)
      .maybeSingle(),
  ])
  if (employmentError) throw fromDatabaseError(employmentError)
  if (barberError) throw fromDatabaseError(barberError)
  if (profileError) throw fromDatabaseError(profileError)
  const verifiedBarber = profile?.role === 'barber'
    && profile.requested_role === 'barber'
    && profile.verification_status === 'verified'
    && profile.onboarding_completed === true
  if (!employment || !barber?.accepting_bookings || !verifiedBarber) {
    throw new ApiError(400, 'validation', 'The new barber must be verified, active at this shop, and accepting bookings.')
  }
  if (!Number.isInteger(bookedDurationMin) || bookedDurationMin < 5 || bookedDurationMin > 480) {
    throw new ApiError(409, 'invalid_booking_snapshot', 'The booking duration snapshot is invalid; refresh before reassigning.')
  }
  return { employmentId: employment.id as string, durationMin: bookedDurationMin }
}

async function assertBookableSlot(
  dependencies: ApiDependencies,
  scope: { employmentId: string; durationMin: number },
  barberId: string,
  startsAt: Date,
  excludeAppointmentId?: string,
): Promise<void> {
  const local = manilaDateTimeParts(startsAt)
  const [{ data: exceptions, error: exceptionError }, { data: rules, error: ruleError }] = await Promise.all([
    dependencies.database.from('shift_exceptions').select('is_available,start_time,end_time').eq('employment_id', scope.employmentId).eq('date', local.date),
    dependencies.database.from('shift_patterns').select('weekday,start_time,end_time').eq('employment_id', scope.employmentId).eq('weekday', local.weekday),
  ])
  if (exceptionError) throw fromDatabaseError(exceptionError)
  if (ruleError) throw fromDatabaseError(ruleError)
  const exception = exceptions?.[0]
  const blocks = exception ? exception.is_available ? [exception] : [] : (rules ?? [])
  const startMinute = wallMinute(local.time)
  const selectedBlock = blocks.find((block) => startMinute >= wallMinute(block.start_time)
    && startMinute + scope.durationMin <= wallMinute(block.end_time))
  if (!selectedBlock) throw new ApiError(400, 'validation', 'Selected time is outside the barber schedule.')
  const gridOffset = startMinute - wallMinute(selectedBlock.start_time)
  if (gridOffset % 15 !== 0 || startsAt.getUTCSeconds() !== 0 || startsAt.getUTCMilliseconds() !== 0) {
    throw new ApiError(400, 'validation', 'Appointment start time must use the 15-minute booking grid.')
  }

  const endAt = new Date(startsAt.getTime() + scope.durationMin * 60_000)
  let query = dependencies.database
    .from('appointments')
    .select('id')
    .eq('barber_id', barberId)
    .in('status', CAPACITY_BLOCKING_APPOINTMENT_STATUSES)
    .lt('starts_at', endAt.toISOString())
    .gt('ends_at', startsAt.toISOString())
  if (excludeAppointmentId) query = query.neq('id', excludeAppointmentId)
  const { data: overlaps, error: overlapError } = await query.limit(1)
  if (overlapError) throw fromDatabaseError(overlapError)
  if ((overlaps ?? []).length > 0) throw new ApiError(409, 'slot_taken', 'That appointment slot is already taken.')
}

async function getAppointment(dependencies: ApiDependencies, appointmentId: string): Promise<AppointmentRecord> {
  const { data, error } = await dependencies.database.from('appointments').select(appointmentColumns).eq('id', appointmentId).maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(404, 'not_found', 'Appointment not found.')
  return data as AppointmentRecord
}

async function requireAppointmentOwner(dependencies: ApiDependencies, request: Request, appointment: AppointmentRecord): Promise<void> {
  await requireOwnedShop(dependencies, request, appointment.shop_id)
}

async function requireAssignedBarber(dependencies: ApiDependencies, request: Request, appointment: AppointmentRecord): Promise<void> {
  requireRole(request, 'barber')
  if (appointment.barber_id !== request.auth.profile.id) {
    throw new ApiError(403, 'forbidden', 'Only the assigned barber may perform this action.')
  }
  await requireActiveEmployment(dependencies, request, appointment.shop_id)
}

function requireCustomer(request: Request, appointment: AppointmentRecord): void {
  requireRole(request, 'customer')
  if (appointment.customer_id !== request.auth.profile.id) {
    throw new ApiError(403, 'forbidden', 'You can only perform this action on your own appointment.')
  }
}

async function requireParticipantOrOwner(
  dependencies: ApiDependencies,
  request: Request,
  appointment: AppointmentRecord,
): Promise<void> {
  const userId = request.auth.profile.id
  if (appointment.customer_id === userId) return
  if (appointment.barber_id === userId) {
    await requireActiveEmployment(dependencies, request, appointment.shop_id)
    return
  }
  if (request.auth.profile.role === 'shop_owner') {
    await requireAppointmentOwner(dependencies, request, appointment)
    return
  }
  throw new ApiError(403, 'forbidden', 'You are not a participant in this appointment.')
}

async function transitionAppointment(
  dependencies: ApiDependencies,
  appointmentId: string,
  expectedVersion: number,
  action: string,
  actorId: string | null,
  reason?: string,
  checkInCode?: string,
): Promise<Appointment> {
  const { data, error } = await dependencies.database.rpc('api_transition_appointment', {
    p_appointment_id: appointmentId,
    p_expected_version: expectedVersion,
    p_action: action,
    p_actor_id: actorId,
    p_reason: reason ?? null,
    p_check_in_code: checkInCode ?? null,
  })
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(500, 'database_error', 'Appointment transition returned no record.')
  return safeAppointmentRecord(data) as Appointment
}

function snapshotAppointmentRows(rows: unknown[] | null): unknown[] {
  return (rows ?? []).map((raw) => {
    const row = safeAppointmentRecord(raw) as AppointmentRecord & { service?: Record<string, unknown> | null }
    if (!row.service) return row
    return {
      ...row,
      service: {
        ...row.service,
        name: row.booked_service_name ?? row.service.name,
        duration_min: row.booked_duration_min ?? row.service.duration_min,
        price_cents: row.booked_price_cents ?? row.service.price_cents,
      },
    }
  })
}

/** Idempotent worker entry point; the server scheduler invokes this once per minute. */
export async function processDueAppointmentTransitions(dependencies: ApiDependencies): Promise<void> {
  const expiry = await dependencies.database.rpc('api_expire_due_appointments')
  if (expiry.error) throw fromDatabaseError(expiry.error)
  const completion = await dependencies.database.rpc('api_finalize_due_appointments')
  if (completion.error) throw fromDatabaseError(completion.error)
}

export function createBookingsRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/bookings', async (request, response) => {
    const userId = request.auth.profile.id
    let query = dependencies.database.from('appointments').select(appointmentSelect)
    if (request.auth.profile.role === 'customer') query = query.eq('customer_id', userId)
    else if (request.auth.profile.role === 'barber') {
      const employment = await requireActiveEmployment(dependencies, request)
      query = query.eq('barber_id', userId).eq('shop_id', employment.shop_id as string)
    }
    else throw new ApiError(403, 'forbidden', 'Use the shop bookings endpoint for owner reservations.')
    const { data, error } = await query.order('starts_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: snapshotAppointmentRows(data) })
  })

  router.post('/bookings', async (request, response) => {
    requireEligibleBookingCustomer(request)
    const input = parseBody(request, createAppointmentInputSchema)
    const { data, error } = await dependencies.database.rpc('api_create_appointment', {
      p_customer_id: request.auth.profile.id,
      p_barber_id: input.barber_id,
      p_service_id: input.service_id,
      p_starts_at: input.starts_at,
      p_notes: input.notes ?? null,
    })
    if (error) throw fromDatabaseError(error)
    if (!data) throw new ApiError(500, 'database_error', 'Appointment creation returned no record.')
    response.status(201).json({ data: safeAppointmentRecord(data) })
  })

  router.patch('/bookings/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, rescheduleInputSchema)
    const appointment = await getAppointment(dependencies, id)
    requireCustomer(request, appointment)
    const scope = await bookingScope(dependencies, input.barber_id, input.service_id)
    if (scope.shopId !== appointment.shop_id) throw new ApiError(400, 'validation', 'A booking cannot be moved to another shop.')
    const startsAt = new Date(input.starts_at)
    if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      throw new ApiError(400, 'validation', 'Appointment must start in the future.')
    }
    await assertBookableSlot(dependencies, scope, input.barber_id, startsAt, id)
    const { data, error } = await dependencies.database.rpc('api_reschedule_appointment', {
      p_appointment_id: id,
      p_expected_version: input.expected_version ?? appointment.version ?? 0,
      p_customer_id: request.auth.profile.id,
      p_barber_id: input.barber_id,
      p_service_id: input.service_id,
      p_starts_at: input.starts_at,
      p_notes: input.notes ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: safeAppointmentRecord(data) })
  })

  router.post('/bookings/:id/accept', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentVersionInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireAppointmentOwner(dependencies, request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'accept', request.auth.profile.id) })
  })

  router.post('/bookings/:id/decline', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentReasonInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireAppointmentOwner(dependencies, request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'decline', request.auth.profile.id, input.reason) })
  })

  router.post('/bookings/:id/check-in-code', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentVersionInputSchema)
    const appointment = await getAppointment(dependencies, id)
    if (request.auth.profile.role === 'barber') await requireAssignedBarber(dependencies, request, appointment)
    else await requireAppointmentOwner(dependencies, request, appointment)
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const { data, error } = await dependencies.database.rpc('api_issue_appointment_check_in_code', {
      p_appointment_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_code: code,
    })
    if (error) throw fromDatabaseError(error)
    const updated = data as Appointment
    const result: AppointmentCheckInCode = {
      appointment_id: id,
      code,
      expires_at: updated.check_in_code_expires_at as string,
      appointment_version: updated.version ?? input.expected_version + 1,
    }
    response.json({ data: result })
  })

  router.post('/bookings/:id/check-in', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, checkInAppointmentInputSchema)
    const appointment = await getAppointment(dependencies, id)
    if (request.auth.profile.role === 'customer') requireCustomer(request, appointment)
    else await requireAppointmentOwner(dependencies, request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'check_in', request.auth.profile.id, input.reason, input.code) })
  })

  router.post('/bookings/:id/start', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentVersionInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireAssignedBarber(dependencies, request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'start', request.auth.profile.id) })
  })

  router.post('/bookings/:id/finish', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentVersionInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireAssignedBarber(dependencies, request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'finish', request.auth.profile.id) })
  })

  router.post('/bookings/:id/confirm-completion', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentVersionInputSchema)
    const appointment = await getAppointment(dependencies, id)
    requireCustomer(request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'confirm_completion', request.auth.profile.id) })
  })

  router.post('/bookings/:id/dispute', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentReasonInputSchema)
    const appointment = await getAppointment(dependencies, id)
    requireCustomer(request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'dispute', request.auth.profile.id, input.reason) })
  })

  router.post('/bookings/:id/cancel', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, legacyCancelInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireParticipantOrOwner(dependencies, request, appointment)
    response.json({
      data: await transitionAppointment(
        dependencies,
        id,
        input.expected_version ?? appointment.version ?? 0,
        'cancel',
        request.auth.profile.id,
        input.reason ?? 'Cancelled through the legacy client.',
      ),
    })
  })

  router.post('/bookings/:id/no-show', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentReasonInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireAssignedBarber(dependencies, request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'mark_customer_no_show', request.auth.profile.id, input.reason) })
  })

  router.post('/bookings/:id/resolve-dispute', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, resolveAppointmentDisputeInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireAppointmentOwner(dependencies, request, appointment)
    const action = input.resolution === 'completed' ? 'resolve_complete' : 'resolve_cancel'
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, action, request.auth.profile.id, input.reason) })
  })

  router.post('/bookings/:id/reassign', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, reassignAppointmentInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireAppointmentOwner(dependencies, request, appointment)
    const bookedDurationMin = Number(appointment.booked_duration_min)
    const scope = await reassignmentScope(
      dependencies,
      input.barber_id,
      appointment.shop_id,
      bookedDurationMin,
    )
    await assertBookableSlot(dependencies, scope, input.barber_id, new Date(appointment.starts_at), id)
    const { data, error } = await dependencies.database.rpc('api_reassign_appointment', {
      p_appointment_id: id,
      p_expected_version: input.expected_version,
      p_owner_id: request.auth.profile.id,
      p_barber_id: input.barber_id,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: safeAppointmentRecord(data) })
  })

  router.get('/bookings/:id/timeline', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireParticipantOrOwner(dependencies, request, appointment)
    const { data, error } = await dependencies.database
      .from('appointment_events')
      .select('*')
      .eq('appointment_id', id)
      .order('created_at', { ascending: true })
    if (error) throw fromDatabaseError(error)
    response.json({ data: (data ?? []) as AppointmentEvent[] })
  })

  router.get('/shops/:id/bookings', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, id)
    const { data, error } = await dependencies.database.from('appointments').select(appointmentSelect).eq('shop_id', id).order('starts_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: snapshotAppointmentRows(data) })
  })

  router.get('/shops/:id/stats', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, id)
    const { range } = parseQuery(request, statsQuerySchema)
    const { data: appointments, error: appointmentError } = await dependencies.database
      .from('appointments')
      .select('id,customer_id,service_id,starts_at,completed_at,status,booked_service_name,booked_price_cents')
      .eq('shop_id', id)
      .order('starts_at')
    if (appointmentError) throw fromDatabaseError(appointmentError)

    const now = Date.now()
    const cutoff = range === 'week' ? now - 7 * 86_400_000 : range === 'month' ? now - 30 * 86_400_000 : Number.NEGATIVE_INFINITY
    const all = appointments ?? []
    const completed = all.filter((appointment) => appointment.status === 'completed')
    const ranged = completed.filter((appointment) => Date.parse((appointment.completed_at ?? appointment.starts_at) as string) >= cutoff)
    const customerCounts = new Map<string, number>()
    const serviceCounts = new Map<string, { id: string; name: string; bookings: number }>()
    const daily = new Map<string, { date: string; completed_service_value_cents: number; revenue_cents: number; completed: number }>()

    for (const appointment of ranged) {
      const customerId = appointment.customer_id as string
      const serviceId = appointment.service_id as string
      const serviceName = appointment.booked_service_name as string
      const price = Number(appointment.booked_price_cents ?? 0)
      const date = ((appointment.completed_at ?? appointment.starts_at) as string).slice(0, 10)
      customerCounts.set(customerId, (customerCounts.get(customerId) ?? 0) + 1)
      const service = serviceCounts.get(serviceId) ?? { id: serviceId, name: serviceName, bookings: 0 }
      service.bookings += 1
      serviceCounts.set(serviceId, service)
      const point = daily.get(date) ?? { date, completed_service_value_cents: 0, revenue_cents: 0, completed: 0 }
      point.completed += 1
      point.completed_service_value_cents += price
      point.revenue_cents += price // Compatibility alias; payment collection is not yet modeled.
      daily.set(date, point)
    }

    const topCustomerIds = [...customerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([customerId]) => customerId)
    const { data: customerProfiles, error: customerError } = topCustomerIds.length
      ? await dependencies.database.from('users').select('id,full_name,avatar_url').in('id', topCustomerIds)
      : { data: [], error: null }
    if (customerError) throw fromDatabaseError(customerError)
    const profileMap = new Map((customerProfiles ?? []).map((profile) => [profile.id as string, profile]))
    const completedServiceValue = ranged.reduce((total, appointment) => total + Number(appointment.booked_price_cents ?? 0), 0)

    response.json({
      data: {
        range,
        upcoming_count: all.filter((appointment) => CAPACITY_BLOCKING_APPOINTMENT_STATUSES.some((status) => status === appointment.status) && Date.parse(appointment.starts_at as string) > now).length,
        completed_all_time: completed.length,
        completed_count: ranged.length,
        completed_service_value_cents: completedServiceValue,
        revenue_cents: completedServiceValue,
        revenue_is_estimate: true,
        series: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
        top_visitors: [...customerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([customerId, visits]) => ({ ...profileMap.get(customerId), visits })),
        top_services: [...serviceCounts.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 5),
      },
    })
  })

  return router
}
