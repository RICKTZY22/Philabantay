import { Router } from 'express'
import { z } from 'zod'
import {
  barberIdParamsSchema,
  createServiceInputSchema,
  createShopInputSchema,
  idParamsSchema,
  setAcceptingBookingsInputSchema,
  setShiftStatusInputSchema,
  updateServiceInputSchema,
  updateShopInputSchema,
  uuidSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'

const publicBarberSelect = 'id,bio,rating,rating_count,shift_status,accepting_bookings,created_at,profile:users!barbers_id_fkey(id,full_name,avatar_url)'
const servicesQuerySchema = z.strictObject({ shopId: uuidSchema.optional() })

function manilaNow(): { date: string; weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '0'
  const date = `${value('year')}-${value('month')}-${value('day')}`
  return {
    date,
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    minute: Number(value('hour')) * 60 + Number(value('minute')),
  }
}

function wallMinute(time: unknown): number {
  const [hour = '0', minute = '0'] = String(time).slice(0, 5).split(':')
  return Number(hour) * 60 + Number(minute)
}

async function catalogSnapshot(dependencies: ApiDependencies): Promise<{
  shops: Array<Record<string, unknown>>
  availableBarberIds: string[]
}> {
  const [{ data: shops, error: shopError }, { data: employments, error: employmentError }, { data: barbers, error: barberError }] = await Promise.all([
    dependencies.database.from('shops').select('*').order('name'),
    dependencies.database.from('barber_employment').select('id,shop_id,barber_id').eq('status', 'active').is('ended_at', null),
    dependencies.database.from('barbers').select('id,shift_status,accepting_bookings'),
  ])
  if (shopError) throw fromDatabaseError(shopError)
  if (employmentError) throw fromDatabaseError(employmentError)
  if (barberError) throw fromDatabaseError(barberError)

  const now = manilaNow()
  const employmentIds = (employments ?? []).map((employment) => employment.id as string)
  const [{ data: patterns, error: patternError }, { data: exceptions, error: exceptionError }] = employmentIds.length > 0
    ? await Promise.all([
        dependencies.database.from('shift_patterns').select('employment_id,weekday,start_time,end_time').in('employment_id', employmentIds),
        dependencies.database.from('shift_exceptions').select('employment_id,is_available,start_time,end_time').in('employment_id', employmentIds).eq('date', now.date),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (patternError) throw fromDatabaseError(patternError)
  if (exceptionError) throw fromDatabaseError(exceptionError)

  const barberById = new Map((barbers ?? []).map((barber) => [barber.id as string, barber]))
  const availableBarberIds = (employments ?? []).flatMap((employment): string[] => {
    const barberId = employment.barber_id as string
    const barber = barberById.get(barberId)
    if (barber?.shift_status !== 'on' || barber.accepting_bookings !== true) return []
    const exception = (exceptions ?? []).find((row) => row.employment_id === employment.id)
    const blocks = exception
      ? exception.is_available ? [exception] : []
      : (patterns ?? []).filter((row) => row.employment_id === employment.id && row.weekday === now.weekday)
    const isWithinShift = blocks.some((block) => now.minute >= wallMinute(block.start_time) && now.minute < wallMinute(block.end_time))
    return isWithinShift ? [barberId] : []
  })
  const availableSet = new Set(availableBarberIds)
  const liveShops = (shops ?? []).map((shop) => {
    const barberIds = (employments ?? [])
      .filter((employment) => employment.shop_id === shop.id)
      .map((employment) => employment.barber_id as string)
    const available = barberIds.filter((id) => availableSet.has(id)).length
    return {
      ...shop,
      barber_ids: barberIds,
      status: available > 0 ? 'open' : barberIds.length > 0 ? 'busy' : 'closed',
      available_barber_count: available,
    }
  })
  return { shops: liveShops, availableBarberIds }
}

async function shopsWithLiveStatus(dependencies: ApiDependencies): Promise<Array<Record<string, unknown>>> {
  return (await catalogSnapshot(dependencies)).shops
}

export function createCatalogRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/barbers', async (_request, response) => {
    const { data, error } = await dependencies.database.from('barbers').select(publicBarberSelect).order('rating', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/barbers/available', async (_request, response) => {
    const { availableBarberIds: ids } = await catalogSnapshot(dependencies)
    if (ids.length === 0) return response.json({ data: [] })

    const { data, error } = await dependencies.database
      .from('barbers')
      .select(publicBarberSelect)
      .in('id', ids)
      .eq('shift_status', 'on')
      .eq('accepting_bookings', true)
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/barbers/:barberId', async (request, response) => {
    const { barberId } = parseParams(request, barberIdParamsSchema)
    const { data, error } = await dependencies.database.from('barbers').select(publicBarberSelect).eq('id', barberId).maybeSingle()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.patch('/barbers/me/shift-status', async (request, response) => {
    requireRole(request, 'barber')
    const input = parseBody(request, setShiftStatusInputSchema)
    const { data, error } = await dependencies.database
      .from('barbers')
      .update({ shift_status: input.on ? 'on' : 'off' })
      .eq('id', request.auth.profile.id)
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.patch('/barbers/me/accepting-bookings', async (request, response) => {
    requireRole(request, 'barber')
    const input = parseBody(request, setAcceptingBookingsInputSchema)
    const { data, error } = await dependencies.database
      .from('barbers')
      .update({ accepting_bookings: input.accepting })
      .eq('id', request.auth.profile.id)
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/shops', async (_request, response) => {
    response.json({ data: await shopsWithLiveStatus(dependencies) })
  })

  router.get('/shops/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const shop = (await shopsWithLiveStatus(dependencies)).find((row) => row.id === id) ?? null
    response.json({ data: shop })
  })

  router.post('/shops', async (request, response) => {
    requireRole(request, 'shop_owner', 'admin')
    const input = parseBody(request, createShopInputSchema)
    const { data, error } = await dependencies.database
      .from('shops')
      .insert({ ...input, owner_id: request.auth.profile.id })
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.patch('/shops/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, id)
    const input = parseBody(request, updateShopInputSchema)
    const { data, error } = await dependencies.database.from('shops').update(input).eq('id', id).select('*').single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/services', async (request, response) => {
    const { shopId } = parseQuery(request, servicesQuerySchema)
    let query = dependencies.database
      .from('services')
      .select('id,name,duration_min,price_cents,active,created_at')
      .eq('active', true)
      .order('name')
    if (shopId) query = query.eq('shop_id', shopId)
    const { data, error } = await query
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/services', async (request, response) => {
    const input = parseBody(request, createServiceInputSchema)
    await requireOwnedShop(dependencies, request, input.shop_id)
    const { data, error } = await dependencies.database.from('services').insert(input).select('*').single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.patch('/services/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { data: service, error: lookupError } = await dependencies.database.from('services').select('shop_id').eq('id', id).maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!service) throw new ApiError(404, 'not_found', 'Service not found.')
    await requireOwnedShop(dependencies, request, service.shop_id as string)
    const input = parseBody(request, updateServiceInputSchema)
    const { data, error } = await dependencies.database.from('services').update(input).eq('id', id).select('*').single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  return router
}
