import { Router } from 'express'
import { z } from 'zod'
import {
  availabilityOverrideInputSchema,
  availabilityRulesInputSchema,
  barberIdParamsSchema,
  dateKeySchema,
  idParamsSchema,
  shopIdParamsSchema,
  uuidSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'

const slotQuerySchema = z.strictObject({
  barberId: uuidSchema,
  serviceId: uuidSchema,
  date: dateKeySchema,
})

const ownerRulesParamsSchema = shopIdParamsSchema.extend({ barberId: uuidSchema })

function manilaMoment(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00+08:00`)
}

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
    if (request.auth.profile.role === 'barber' && request.auth.profile.id === barberId) return
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
    requireRole(request, 'barber')
    const { data, error } = await dependencies.database
      .from('shift_exceptions')
      .select('id,barber_id,date,is_available,start_time,end_time,reason')
      .eq('barber_id', request.auth.profile.id)
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
    const { data, error } = await dependencies.database
      .from('shift_exceptions')
      .insert({
        ...input,
        employment_id: employment.id,
        barber_id: employment.barber_id,
        shop_id: employment.shop_id,
      })
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.delete('/shifts/exceptions/:id', async (request, response) => {
    requireRole(request, 'barber')
    const { id } = parseParams(request, idParamsSchema)
    const { data: row, error: lookupError } = await dependencies.database.from('shift_exceptions').select('barber_id').eq('id', id).maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!row) throw new ApiError(404, 'not_found', 'Shift exception not found.')
    if (row.barber_id !== request.auth.profile.id) throw new ApiError(403, 'forbidden', 'You can only remove your own exception.')
    const { error } = await dependencies.database.from('shift_exceptions').delete().eq('id', id)
    if (error) throw fromDatabaseError(error)
    response.status(204).end()
  })

  router.get('/availability/slots', async (request, response) => {
    const { barberId, serviceId, date } = parseQuery(request, slotQuerySchema)
    const [{ data: service, error: serviceError }, { data: employment, error: employmentError }] = await Promise.all([
      dependencies.database.from('services').select('shop_id,duration_min,active').eq('id', serviceId).maybeSingle(),
      dependencies.database.from('barber_employment').select('id,shop_id').eq('barber_id', barberId).eq('status', 'active').is('ended_at', null).maybeSingle(),
    ])
    if (serviceError) throw fromDatabaseError(serviceError)
    if (employmentError) throw fromDatabaseError(employmentError)
    if (!service || !service.active || !employment || service.shop_id !== employment.shop_id) {
      throw new ApiError(404, 'not_found', 'Bookable service/barber combination not found.')
    }

    const [{ data: overrides, error: overrideError }, { data: rules, error: ruleError }, { data: appointments, error: appointmentError }] = await Promise.all([
      dependencies.database.from('shift_exceptions').select('is_available,start_time,end_time').eq('employment_id', employment.id).eq('date', date),
      dependencies.database.from('shift_patterns').select('weekday,start_time,end_time').eq('employment_id', employment.id),
      dependencies.database.from('appointments').select('starts_at,ends_at').eq('barber_id', barberId).in('status', ['pending', 'confirmed']).gte('starts_at', `${date}T00:00:00+08:00`).lt('starts_at', `${date}T23:59:59+08:00`),
    ])
    if (overrideError) throw fromDatabaseError(overrideError)
    if (ruleError) throw fromDatabaseError(ruleError)
    if (appointmentError) throw fromDatabaseError(appointmentError)

    const exception = overrides?.[0]
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const blocks = exception
      ? exception.is_available ? [{ start_time: exception.start_time as string, end_time: exception.end_time as string }] : []
      : (rules ?? []).filter((rule) => rule.weekday === weekday)
    const durationMs = Number(service.duration_min) * 60_000
    const now = Date.now()
    const slots: Array<{ starts_at: string; ends_at: string }> = []

    for (const block of blocks) {
      const blockEnd = manilaMoment(date, block.end_time as string).getTime()
      for (let start = manilaMoment(date, block.start_time as string).getTime(); start + durationMs <= blockEnd; start += 15 * 60_000) {
        const end = start + durationMs
        if (start <= now) continue
        const overlaps = (appointments ?? []).some((appointment) => {
          const bookedStart = Date.parse(appointment.starts_at as string)
          const bookedEnd = Date.parse(appointment.ends_at as string)
          return start < bookedEnd && end > bookedStart
        })
        if (!overlaps) slots.push({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() })
      }
    }
    response.json({ data: slots })
  })

  return router
}
