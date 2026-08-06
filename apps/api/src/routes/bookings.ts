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
  type AppointmentAllowedAction,
} from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import { manilaDateTimeParts } from '../lib/manila-time'
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
  booked_buffer_min,
  barber_preference,
  requested_barber_id,
  assignment_source,
  assignment_reason,
  booked_timezone,
  booked_cancellation_cutoff_minutes,
  late_policy_action,
  no_show_appeal_deadline,
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

/**
 * Resolve the shop a provider serves, for the cross-shop guard on reschedule.
 *
 * Since Q20/D-028 a provider is either an employed barber **or** an owner with
 * an active provider capability at their own shop. This used to require a
 * `barber_employment` row and `role = 'barber'`, which an owner-provider has
 * neither of by design, so `GET /availability` advertised their slots (it reads
 * `owner_provider_profiles`), the claim gate would have accepted them (it reads
 * the same table), and this pre-check refused with "Barber and service must be
 * active at the same shop." The seam was completed in the database and in
 * authorization but not here.
 *
 * Authority still lives in `private.require_bookable_appointment_slot`. This
 * only answers "which shop is this provider serving", so the caller can refuse a
 * cross-shop move with a useful message.
 */
async function bookingScope(
  dependencies: ApiDependencies,
  barberId: string,
  serviceId: string,
) {
  const [
    { data: employment, error: employmentError },
    { data: ownerCapability, error: ownerError },
    { data: service, error: serviceError },
  ] = await Promise.all([
    dependencies.database
      .from('barber_employment')
      .select('id,shop_id,barber:barbers!barber_employment_barber_id_fkey(accepting_bookings,profile:users!barbers_id_fkey(role,requested_role,verification_status,onboarding_completed))')
      .eq('barber_id', barberId)
      .eq('status', 'active')
      .is('ended_at', null)
      .lte('hired_at', manilaDateTimeParts().date)
      .maybeSingle(),
    dependencies.database
      .from('owner_provider_profiles')
      .select('shop_id,shop:shops!owner_provider_profiles_shop_id_fkey(owner_id),profile:users!owner_provider_profiles_owner_id_fkey(role,requested_role,verification_status,onboarding_completed)')
      .eq('owner_id', barberId)
      .eq('active', true)
      .eq('accepting_bookings', true)
      .maybeSingle(),
    dependencies.database.from('services').select('id,shop_id,duration_min,active').eq('id', serviceId).maybeSingle(),
  ])
  if (employmentError) throw fromDatabaseError(employmentError)
  if (ownerError) throw fromDatabaseError(ownerError)
  if (serviceError) throw fromDatabaseError(serviceError)

  const providerShopId = resolveProviderShopId(barberId, employment, ownerCapability)
  if (!service || !service.active || providerShopId === null || providerShopId !== service.shop_id) {
    throw new ApiError(400, 'validation', 'Barber and service must be active at the same shop.')
  }
  return { shopId: providerShopId, durationMin: Number(service.duration_min) }
}

/**
 * `barber_employment` has no direct relationship to `users`: it points at
 * `barbers`, and `barbers.id` points at `users.id`. The profile is one hop
 * further out, the same shape the appointment selects already use. Embedding
 * `users` directly here answers PGRST200 and surfaces as a 500.
 */
type EmploymentProviderRow = {
  shop_id: string
  barber: {
    accepting_bookings?: boolean
    profile?: { role?: string; requested_role?: string | null; verification_status?: string; onboarding_completed?: boolean } | null
  } | null
} | null

type OwnerProviderRow = {
  shop_id: string
  shop: { owner_id?: string } | null
  profile: { role?: string; requested_role?: string | null; verification_status?: string; onboarding_completed?: boolean } | null
} | null

/**
 * Mirrors the two branches of `private.lock_appointment_barber_assignment`: an
 * employed, verified, accepting barber, or a verified owner with an active
 * provider capability at the shop they own. Returns null when neither holds.
 */
function resolveProviderShopId(
  providerId: string,
  employment: unknown,
  ownerCapability: unknown,
): string | null {
  const employed = employment as EmploymentProviderRow
  const employedProfile = employed?.barber?.profile
  if (employed?.barber?.accepting_bookings
    && employedProfile?.role === 'barber'
    && employedProfile.requested_role === 'barber'
    && employedProfile.verification_status === 'verified'
    && employedProfile.onboarding_completed === true) {
    return employed.shop_id
  }
  const owner = ownerCapability as OwnerProviderRow
  if (owner?.shop?.owner_id === providerId
    && owner.profile?.role === 'shop_owner'
    && owner.profile.requested_role === 'shop_owner'
    && owner.profile.verification_status === 'verified'
    && owner.profile.onboarding_completed === true) {
    return owner.shop_id
  }
  return null
}

/** Same two provider branches as `bookingScope`, pinned to one shop. */
async function reassignmentScope(
  dependencies: ApiDependencies,
  barberId: string,
  shopId: string,
  bookedDurationMin: number,
) {
  const [{ data: employment, error: employmentError }, { data: ownerCapability, error: ownerError }] = await Promise.all([
    dependencies.database
      .from('barber_employment')
      .select('id,shop_id,barber:barbers!barber_employment_barber_id_fkey(accepting_bookings,profile:users!barbers_id_fkey(role,requested_role,verification_status,onboarding_completed))')
      .eq('barber_id', barberId)
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .is('ended_at', null)
      .lte('hired_at', manilaDateTimeParts().date)
      .maybeSingle(),
    dependencies.database
      .from('owner_provider_profiles')
      .select('shop_id,shop:shops!owner_provider_profiles_shop_id_fkey(owner_id),profile:users!owner_provider_profiles_owner_id_fkey(role,requested_role,verification_status,onboarding_completed)')
      .eq('owner_id', barberId)
      .eq('shop_id', shopId)
      .eq('active', true)
      .eq('accepting_bookings', true)
      .maybeSingle(),
  ])
  if (employmentError) throw fromDatabaseError(employmentError)
  if (ownerError) throw fromDatabaseError(ownerError)

  if (resolveProviderShopId(barberId, employment, ownerCapability) !== shopId) {
    throw new ApiError(400, 'validation', 'The new provider must be verified, active at this shop, and accepting bookings.')
  }
  if (!Number.isInteger(bookedDurationMin) || bookedDurationMin < 5 || bookedDurationMin > 480) {
    throw new ApiError(409, 'invalid_booking_snapshot', 'The booking duration snapshot is invalid; refresh before reassigning.')
  }
  return { durationMin: bookedDurationMin }
}

/*
 * `assertBookableSlot` was deleted here during the 2026-08-06 audit.
 *
 * It re-implemented, in Express and approximately, two of the six checks the
 * authoritative claim gate already performs under lock: shift blocks and the
 * 15-minute grid, plus a same-provider overlap probe. It did not check shop
 * hours, closures, the lead/advance window, qualification, buffer, or chair
 * capacity. Worse, it derived weekday, local date and the grid offset from
 * `manilaDateTimeParts`, while `private.require_bookable_appointment_slot`
 * evaluates the same rules in `shops.timezone` — a per-shop, owner-editable
 * value. For any non-Manila shop it compared the wrong wall clock and rejected
 * slots the gate would have accepted.
 *
 * Both write paths call the real gate anyway, so its only remaining effect was
 * to refuse valid requests early, with a different message, in the wrong
 * timezone. `errors.ts` maps every `P40xx` the gate raises to a specific client
 * code, so deleting it does not degrade the error the customer sees.
 */

async function getAppointment(dependencies: ApiDependencies, appointmentId: string): Promise<AppointmentRecord> {
  const { data, error } = await dependencies.database.from('appointments').select(appointmentColumns).eq('id', appointmentId).maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(404, 'not_found', 'Appointment not found.')
  return data as AppointmentRecord
}

async function requireAppointmentOwner(dependencies: ApiDependencies, request: Request, appointment: AppointmentRecord): Promise<void> {
  await requireOwnedShop(dependencies, request, appointment.shop_id)
}

/**
 * The person actually performing the visit. Since Q20 that is either the
 * assigned employed barber or an owner who performs services at their own shop,
 * so this can no longer require the `barber` role: an owner-provider who could
 * be booked but could not start or finish the visit would strand the
 * appointment at `checked_in`.
 *
 * The database is still the authority. `api_transition_appointment` recomputes
 * the same predicate through `private.is_bookable_provider_for_shop`, so this
 * check is a fast, useful error rather than the security boundary.
 */
async function requireAssignedProvider(dependencies: ApiDependencies, request: Request, appointment: AppointmentRecord): Promise<void> {
  if (appointment.barber_id !== request.auth.profile.id) {
    throw new ApiError(403, 'forbidden', 'Only the assigned provider may perform this action.')
  }
  if (request.auth.profile.role === 'barber') {
    await requireActiveEmployment(dependencies, request, appointment.shop_id)
    return
  }
  // An owner-provider reaches this only for their own shop's appointment, and
  // requireOwnedShop raises when the shop is not theirs.
  requireRole(request, 'shop_owner')
  await requireOwnedShop(dependencies, request, appointment.shop_id)
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
  // The owner branch has to come before the provider branch. Since Q20 an owner
  // can BE the assigned provider on their own shop's booking, and the provider
  // branch below ends in `requireActiveEmployment`, which hard-requires the
  // `barber` role. Checking the provider first therefore answered "you are the
  // barber here" and then refused them for not being a barber, so an owner who
  // could start and finish a visit could not read its timeline or cancel it.
  if (request.auth.profile.role === 'shop_owner') {
    await requireAppointmentOwner(dependencies, request, appointment)
    return
  }
  if (appointment.barber_id === userId) {
    await requireActiveEmployment(dependencies, request, appointment.shop_id)
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

function allowedAppointmentActions(row: AppointmentRecord, request: Request): AppointmentAllowedAction[] {
  const actions: AppointmentAllowedAction[] = []
  const status = row.status === 'pending' ? 'requested' : row.status === 'no_show' ? 'customer_no_show' : row.status
  const now = Date.now()
  const startsAt = Date.parse(row.starts_at)
  const isCustomer = request.auth.profile.role === 'customer' && row.customer_id === request.auth.profile.id
  // Derived from the assignment, not from the role, to match
  // `requireAssignedProvider`. Since Q20 an owner can be the assigned provider,
  // and gating this on `role === 'barber'` meant the authorization layer
  // accepted `start`/`finish` from an owner-provider while nothing ever rendered
  // the control: their own visit stranded at `checked_in` with no way forward.
  const isProvider = row.barber_id === request.auth.profile.id
  const isOwner = request.auth.profile.role === 'shop_owner'
  if (isCustomer) {
    if ((status === 'requested' || status === 'confirmed') && startsAt > now) actions.push('cancel', 'reschedule')
    if (status === 'confirmed' && now >= startsAt - 30 * 60_000 && now <= Date.parse(row.ends_at)) actions.push('check_in')
    if (status === 'awaiting_confirmation') actions.push('confirm_completion', 'dispute')
    if (status === 'customer_no_show' && row.no_show_appeal_deadline && Date.parse(row.no_show_appeal_deadline) > now) actions.push('appeal_no_show')
  }
  if (isProvider) {
    if (status === 'confirmed') actions.push('issue_check_in_code', 'report_delay', 'propose_change')
    if (status === 'confirmed' && now >= startsAt + 15 * 60_000) actions.push('mark_customer_no_show')
    if (status === 'checked_in') actions.push('start', 'report_delay', 'propose_change')
    if (status === 'in_progress') actions.push('finish', 'report_delay', 'propose_change')
  }
  if (isOwner) {
    if (status === 'requested') actions.push('accept', 'decline', 'cancel', 'propose_change')
    if ((status === 'requested' || status === 'confirmed') && row.barber_preference !== 'exact' && startsAt > now) actions.push('reassign')
    if (status === 'confirmed') actions.push('issue_check_in_code', 'check_in', 'report_delay', 'propose_change')
    if (status === 'confirmed' && now >= startsAt + 15 * 60_000) actions.push('mark_customer_no_show')
    if (status === 'checked_in' || status === 'in_progress') actions.push('report_delay', 'propose_change')
    if (status === 'disputed') actions.push('resolve_dispute')
  }
  // An owner-provider matches both branches, so the overlapping affordances
  // (`report_delay`, `propose_change`) would otherwise appear twice.
  return [...new Set(actions)]
}

function snapshotAppointmentRows(rows: unknown[] | null, request: Request): unknown[] {
  return (rows ?? []).map((raw) => {
    const row = safeAppointmentRecord(raw) as AppointmentRecord & { service?: Record<string, unknown> | null }
    const allowed_actions = allowedAppointmentActions(row, request)
    if (!row.service) return { ...row, allowed_actions }
    return {
      ...row,
      allowed_actions,
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
    response.json({ data: snapshotAppointmentRows(data, request) })
  })

  router.post('/bookings', async (request, response) => {
    requireEligibleBookingCustomer(request)
    const input = parseBody(request, createAppointmentInputSchema)
    // The command resolves `preferred` and `any` itself, inside the same
    // transaction that claims the slot. Resolving out here would let the chosen
    // provider be taken between the decision and the write.
    const { data, error } = await dependencies.database.rpc('api_create_booking', {
      p_customer_id: request.auth.profile.id,
      p_barber_id: input.barber_id ?? null,
      p_service_id: input.service_id,
      p_starts_at: input.starts_at,
      p_notes: input.notes ?? null,
      p_barber_preference: input.barber_preference ?? 'exact',
      p_requested_barber_id: input.barber_id ?? null,
      p_assignment_source: 'customer',
      p_assignment_reason: null,
      p_idempotency_key: input.idempotency_key,
    })
    if (error) throw fromDatabaseError(error)
    if (!data) throw new ApiError(500, 'database_error', 'Appointment creation returned no record.')
    response.status(201).json({ data: safeAppointmentRecord(data) })
  })

  /**
   * BOOK-02 quote. Answers "could I claim this, and who would I get" without
   * writing anything, using the same gate as the claim. A quote is advisory: the
   * slot can still be taken before the customer confirms, which is exactly why
   * the claim re-checks rather than trusting this answer.
   */
  router.post('/bookings/quote', async (request, response) => {
    requireEligibleBookingCustomer(request)
    const input = parseBody(request, createAppointmentInputSchema)
    const { data, error } = await dependencies.database.rpc('api_quote_appointment', {
      p_customer_id: request.auth.profile.id,
      p_barber_id: input.barber_id ?? null,
      p_service_id: input.service_id,
      p_starts_at: input.starts_at,
      p_barber_preference: input.barber_preference ?? 'exact',
    })
    if (error) throw fromDatabaseError(error)
    // The command is set-returning, so PostgREST hands back a one-row array. A
    // quote is a single answer about a single slot, so unwrap it rather than
    // making every caller remember to read index zero.
    const quote = Array.isArray(data) ? data[0] : data
    if (!quote) throw new ApiError(500, 'database_error', 'Quote returned no row.')

    const { data: service, error: serviceError } = await dependencies.database
      .from('services')
      .select('shop_id')
      .eq('id', input.service_id)
      .maybeSingle()
    if (serviceError) throw fromDatabaseError(serviceError)
    if (!service) throw new ApiError(404, 'not_found', 'Service not found.')

    const [{ data: shop, error: shopError }, { data: customer, error: customerError }] = await Promise.all([
      dependencies.database.from('shops').select('booking_mode,timezone').eq('id', service.shop_id as string).maybeSingle(),
      dependencies.database.from('users').select('manual_approval_until').eq('id', request.auth.profile.id).maybeSingle(),
    ])
    if (shopError) throw fromDatabaseError(shopError)
    if (customerError) throw fromDatabaseError(customerError)
    if (!shop) throw new ApiError(404, 'not_found', 'Shop not found.')
    const restricted = customer?.manual_approval_until != null
      && Date.parse(customer.manual_approval_until as string) > Date.now()
    const bookingMode = shop.booking_mode === 'instant' ? 'instant' : 'manual'
    const effectiveMode = bookingMode === 'instant' && !restricted ? 'instant' : 'manual'

    response.json({
      data: {
        ...quote,
        booking_mode: bookingMode,
        effective_mode: effectiveMode,
        request_expires_at: effectiveMode === 'manual'
          ? new Date(Date.now() + 15 * 60_000).toISOString()
          : null,
        timezone: shop.timezone,
        cancellation_cutoff_minutes: 120,
        idempotency_key: input.idempotency_key,
      },
    })
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
    if (request.auth.profile.role === 'barber') await requireAssignedProvider(dependencies, request, appointment)
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
    await requireAssignedProvider(dependencies, request, appointment)
    response.json({ data: await transitionAppointment(dependencies, id, input.expected_version, 'start', request.auth.profile.id) })
  })

  router.post('/bookings/:id/finish', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, appointmentVersionInputSchema)
    const appointment = await getAppointment(dependencies, id)
    await requireAssignedProvider(dependencies, request, appointment)
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
    if (request.auth.profile.role === 'barber') await requireAssignedProvider(dependencies, request, appointment)
    else await requireAppointmentOwner(dependencies, request, appointment)
    const { data, error } = await dependencies.database.rpc('api_mark_customer_no_show', {
      p_appointment_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: safeAppointmentRecord(data) })
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
    // Still called for its guards: it refuses a provider who is not bookable at
    // this shop and an invalid duration snapshot, both with clearer messages than
    // the gate's. It no longer returns a scope, because nothing needs one.
    await reassignmentScope(
      dependencies,
      input.barber_id,
      appointment.shop_id,
      bookedDurationMin,
    )
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
    response.json({ data: snapshotAppointmentRows(data, request) })
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
    const daily = new Map<string, { date: string; completed_service_value_cents: number; completed: number }>()

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
      const point = daily.get(date) ?? { date, completed_service_value_cents: 0, completed: 0 }
      point.completed += 1
      point.completed_service_value_cents += price
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
        // `revenue_cents` and `revenue_is_estimate` are deliberately gone. Contract
        // section 10 forbids calling any of these figures revenue, and an estimate
        // labelled revenue was the specific mistake it names. Collected, refunded,
        // and net collected now come from the payment ledger through
        // `GET /shops/:id/analytics`; this route reports service value only.
        completed_service_value_cents: completedServiceValue,
        series: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
        top_visitors: [...customerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([customerId, visits]) => ({ ...profileMap.get(customerId), visits })),
        top_services: [...serviceCounts.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 5),
      },
    })
  })

  return router
}
