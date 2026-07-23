import { Router } from 'express'
import {
  availabilityOverrideInputSchema,
  availabilityRulesInputSchema,
  barberIdParamsSchema,
  idParamsSchema,
  shopIdParamsSchema,
  uuidSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'
import { publicSlotQuerySchema, publicSlots } from './public-catalog'

const ownerRulesParamsSchema = shopIdParamsSchema.extend({ barberId: uuidSchema })

async function replaceRules(
  dependencies: ApiDependencies,
  employment: Record<string, unknown>,
  rules: Array<{ weekday: number; start_time: string; end_time: string }>,
) {
  const { data, error } = await dependencies.database.rpc('api_replace_shift_patterns', {
    p_employment_id: employment.id as string,
    p_rules: rules,
  })
  if (error) throw fromDatabaseError(error)
  return data ?? []
}

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

  router.put('/shifts/patterns', async (request, response) => {
    const rules = parseBody(request, availabilityRulesInputSchema)
    const employment = await requireActiveEmployment(dependencies, request)
    response.json({ data: await replaceRules(dependencies, employment, rules) })
  })

  router.put('/shops/:shopId/staff/:barberId/shifts/patterns', async (request, response) => {
    const { shopId, barberId } = parseParams(request, ownerRulesParamsSchema)
    await requireOwnedShop(dependencies, request, shopId)
    const rules = parseBody(request, availabilityRulesInputSchema)
    const { data: employment, error } = await dependencies.database
      .from('barber_employment')
      .select('*')
      .eq('shop_id', shopId)
      .eq('barber_id', barberId)
      .eq('status', 'active')
      .is('ended_at', null)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!employment) throw new ApiError(404, 'not_found', 'Active staff employment not found.')
    response.json({ data: await replaceRules(dependencies, employment, rules) })
  })

  router.post('/shifts/exceptions', async (request, response) => {
    const input = parseBody(request, availabilityOverrideInputSchema)
    const employment = await requireActiveEmployment(dependencies, request)
    const { data, error } = await dependencies.database.rpc('api_create_shift_exception', {
      p_employment_id: employment.id as string,
      p_date: input.date,
      p_is_available: input.is_available,
      p_start_time: input.start_time ?? null,
      p_end_time: input.end_time ?? null,
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.delete('/shifts/exceptions/:id', async (request, response) => {
    requireRole(request, 'barber')
    const { id } = parseParams(request, idParamsSchema)
    const { data: row, error: lookupError } = await dependencies.database
      .from('shift_exceptions')
      .select('employment_id,barber_id,shop_id')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!row) throw new ApiError(404, 'not_found', 'Shift exception not found.')
    if (row.barber_id !== request.auth.profile.id) throw new ApiError(403, 'forbidden', 'You can only remove your own exception.')
    const employment = await requireActiveEmployment(dependencies, request, row.shop_id as string)
    if (employment.id !== row.employment_id) {
      throw new ApiError(403, 'forbidden', 'This exception does not belong to your active employment.')
    }
    const { error } = await dependencies.database.rpc('api_remove_shift_exception', {
      p_exception_id: id,
      p_barber_id: request.auth.profile.id,
    })
    if (error) throw fromDatabaseError(error)
    response.status(204).end()
  })

  router.get('/availability/slots', async (request, response) => {
    response.json({ data: await publicSlots(dependencies, parseQuery(request, publicSlotQuerySchema)) })
  })

  return router
}
