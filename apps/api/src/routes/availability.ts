import { Router } from 'express'
import {
  availabilityQuerySchema,
  barberIdParamsSchema,
  idParamsSchema,
  removeStaffShiftExceptionInputSchema,
  replaceStaffShiftsInputSchema,
  upsertStaffShiftExceptionInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'
import { availabilitySlots, publicSlotQuerySchema, publicSlots } from './public-catalog'

export function createAvailabilityRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  async function authorizeScheduleRead(request: Parameters<typeof parseParams>[0], barberId: string) {
    if (request.auth.profile.role === 'barber' && request.auth.profile.id === barberId) {
      await requireActiveEmployment(dependencies, request)
      return
    }
    const { data: employment, error } = await dependencies.database
      .from('barber_employment')
      .select('shop_id')
      .eq('barber_id', barberId)
      .eq('status', 'active')
      .is('ended_at', null)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!employment) throw new ApiError(404, 'not_found', 'Active barber schedule not found.')
    await requireOwnedShop(dependencies, request, employment.shop_id as string)
  }

  async function requireOwnedStaff(
    request: Parameters<typeof parseParams>[0],
    barberId: string,
  ): Promise<Record<string, unknown>> {
    const shop = await requireOwnedShop(dependencies, request)
    const { data: employment, error } = await dependencies.database
      .from('barber_employment')
      .select('*')
      .eq('shop_id', shop.id as string)
      .eq('barber_id', barberId)
      .eq('status', 'active')
      .is('ended_at', null)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!employment) throw new ApiError(404, 'not_found', 'Active staff employment not found.')
    return employment
  }

  router.get('/barbers/:barberId/shifts/patterns', async (request, response) => {
    const { barberId } = parseParams(request, barberIdParamsSchema)
    await authorizeScheduleRead(request, barberId)
    const { data, error } = await dependencies.database
      .from('shift_patterns')
      .select('id,barber_id,weekday,start_time,end_time,created_at')
      .eq('barber_id', barberId)
      .order('weekday')
      .order('start_time')
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/barbers/:barberId/shifts/exceptions', async (request, response) => {
    const { barberId } = parseParams(request, barberIdParamsSchema)
    await authorizeScheduleRead(request, barberId)
    const { data, error } = await dependencies.database
      .from('shift_exceptions')
      .select('id,barber_id,date,is_available,start_time,end_time')
      .eq('barber_id', barberId)
      .order('date')
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/shifts/exceptions/me', async (request, response) => {
    const employment = await requireActiveEmployment(dependencies, request)
    const { data, error } = await dependencies.database
      .from('shift_exceptions')
      .select('id,barber_id,date,is_available,start_time,end_time,reason')
      .eq('employment_id', employment.id as string)
      .order('date')
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/owner/staff/:barberId/shifts', async (request, response) => {
    const { barberId } = parseParams(request, barberIdParamsSchema)
    const employment = await requireOwnedStaff(request, barberId)
    const [patternResult, exceptionResult, revisionResult] = await Promise.all([
      dependencies.database
        .from('shift_patterns')
        .select('id,barber_id,weekday,start_time,end_time,created_at')
        .eq('employment_id', employment.id as string)
        .order('weekday')
        .order('start_time'),
      dependencies.database
        .from('shift_exceptions')
        .select('id,barber_id,date,is_available,start_time,end_time,reason')
        .eq('employment_id', employment.id as string)
        .order('date'),
      dependencies.database
        .from('staff_schedule_revisions')
        .select('version')
        .eq('employment_id', employment.id as string)
        .maybeSingle(),
    ])
    for (const result of [patternResult, exceptionResult, revisionResult]) {
      if (result.error) throw fromDatabaseError(result.error)
    }
    response.json({
      data: {
        employment_id: employment.id,
        barber_id: barberId,
        schedule_version: revisionResult.data?.version ?? 1,
        patterns: patternResult.data ?? [],
        exceptions: exceptionResult.data ?? [],
      },
    })
  })

  router.put('/owner/staff/:barberId/shifts', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { barberId } = parseParams(request, barberIdParamsSchema)
    const input = parseBody(request, replaceStaffShiftsInputSchema)
    const { data, error } = await dependencies.database.rpc('api_replace_staff_shift_patterns', {
      p_owner_id: request.auth.profile.id,
      p_barber_id: barberId,
      p_expected_version: input.expected_version,
      p_blocks: input.blocks,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/owner/staff/:barberId/shifts/exceptions', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { barberId } = parseParams(request, barberIdParamsSchema)
    const input = parseBody(request, upsertStaffShiftExceptionInputSchema)
    const { data, error } = await dependencies.database.rpc('api_upsert_staff_shift_exception', {
      p_owner_id: request.auth.profile.id,
      p_barber_id: barberId,
      p_expected_version: input.expected_version,
      p_date: input.date,
      p_is_available: input.is_available,
      p_start_time: input.start_time ?? null,
      p_end_time: input.end_time ?? null,
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.delete('/owner/staff/shifts/exceptions/:id', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, removeStaffShiftExceptionInputSchema)
    const { data, error } = await dependencies.database.rpc('api_remove_staff_shift_exception', {
      p_owner_id: request.auth.profile.id,
      p_exception_id: id,
      p_expected_version: input.expected_version,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/availability/slots', async (request, response) => {
    response.json({ data: await publicSlots(dependencies, parseQuery(request, publicSlotQuerySchema)) })
  })

  /**
   * AVAIL-01. Every slot returned here has already passed the same gate the
   * booking command applies, including the caller's own overlapping bookings, so
   * a signed-in customer is never offered a slot they cannot claim.
   */
  router.get('/availability', async (request, response) => {
    const query = parseQuery(request, availabilityQuerySchema)
    const customerId = request.auth.profile.role === 'customer' ? request.auth.profile.id : undefined
    const slots = await availabilitySlots(dependencies, query, customerId)
    response.json({
      data: {
        shop_id: query.shopId,
        service_id: query.serviceId,
        date: query.date,
        slots,
      },
    })
  })

  return router
}
