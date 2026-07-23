import { Router } from 'express'
import { z } from 'zod'
import { CAPACITY_BLOCKING_APPOINTMENT_STATUSES } from '@barbershop/shared'
import {
  barberIdParamsSchema,
  dateKeySchema,
  idParamsSchema,
  publicBarberSchema,
  publicServiceSchema,
  publicShopWithStatusSchema,
  publicSlotSchema,
  uuidSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { manilaMoment, manilaNow, wallMinute } from '../lib/manila-time'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseParams, parseQuery } from '../http/validation'

export const PUBLIC_SHOP_COLUMNS = 'id,name,address,city,lat,lng,rating,rating_count'
export const PUBLIC_BARBER_COLUMNS = 'id,bio,rating,rating_count,shift_status,accepting_bookings'
export const PUBLIC_SERVICE_COLUMNS = 'id,shop_id,name,duration_min,price_cents'

const servicesQuerySchema = z.strictObject({ shopId: uuidSchema.optional() })
export const publicSlotQuerySchema = z.strictObject({
  barberId: uuidSchema,
  serviceId: uuidSchema,
  date: dateKeySchema,
})

interface CatalogueEmployment {
  id: string
  shop_id: string
  barber_id: string
  hired_at: string
}

export interface PublicCatalogueSnapshot {
  shops: z.infer<typeof publicShopWithStatusSchema>[]
  barbers: z.infer<typeof publicBarberSchema>[]
  availableBarberIds: Set<string>
  employmentByBarberId: Map<string, CatalogueEmployment>
}

async function eligibleShopIds(dependencies: ApiDependencies): Promise<string[]> {
  // This RPC is service-role-only. Phase 1 provides a conservative legacy
  // eligibility floor; Phase 2 must replace it with the real publication state.
  const { data, error } = await dependencies.database.rpc('api_catalogue_shop_ids')
  if (error) throw fromDatabaseError(error)
  return (data ?? []).map((row: Record<string, unknown>) => row.shop_id as string)
}

export async function catalogueSnapshotForShopIds(
  dependencies: ApiDependencies,
  shopIds: string[],
): Promise<PublicCatalogueSnapshot> {
  if (shopIds.length === 0) {
    return { shops: [], barbers: [], availableBarberIds: new Set(), employmentByBarberId: new Map() }
  }

  const now = manilaNow()
  const [
    { data: shops, error: shopError },
    { data: profiles, error: profileError },
  ] = await Promise.all([
    dependencies.database.from('shops').select(PUBLIC_SHOP_COLUMNS).in('id', shopIds).order('name'),
    dependencies.database
      .from('users')
      .select('id,full_name,avatar_url')
      .eq('role', 'barber')
      .eq('requested_role', 'barber')
      .eq('verification_status', 'verified')
      .eq('onboarding_completed', true),
  ])
  if (shopError) throw fromDatabaseError(shopError)
  if (profileError) throw fromDatabaseError(profileError)

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]))
  const verifiedBarberIds = [...profileById.keys()]
  if (verifiedBarberIds.length === 0) {
    const publicShops = (shops ?? []).map((shop) => ({
      ...shop,
      barber_ids: [],
      status: 'closed' as const,
      available_barber_count: 0,
    }))
    return {
      shops: publicShopWithStatusSchema.array().parse(publicShops),
      barbers: [],
      availableBarberIds: new Set(),
      employmentByBarberId: new Map(),
    }
  }

  const [
    { data: employments, error: employmentError },
    { data: barberRows, error: barberError },
  ] = await Promise.all([
    dependencies.database
      .from('barber_employment')
      .select('id,shop_id,barber_id,hired_at')
      .in('shop_id', shopIds)
      .in('barber_id', verifiedBarberIds)
      .eq('status', 'active')
      .is('ended_at', null)
      .lte('hired_at', now.date),
    dependencies.database
      .from('barbers')
      .select(PUBLIC_BARBER_COLUMNS)
      .in('id', verifiedBarberIds),
  ])
  if (employmentError) throw fromDatabaseError(employmentError)
  if (barberError) throw fromDatabaseError(barberError)

  const employmentRows = (employments ?? []) as unknown as CatalogueEmployment[]
  const employedBarberIds = new Set(employmentRows.map((employment) => employment.barber_id))
  const employmentByBarberId = new Map(employmentRows.map((employment) => [employment.barber_id, employment]))
  const eligibleBarberRows = (barberRows ?? []).filter((barber) => employedBarberIds.has(barber.id as string))
  const barberById = new Map(eligibleBarberRows.map((barber) => [barber.id as string, barber]))

  const employmentIds = employmentRows.map((employment) => employment.id)
  const [{ data: patterns, error: patternError }, { data: exceptions, error: exceptionError }] = employmentIds.length > 0
    ? await Promise.all([
        dependencies.database.from('shift_patterns').select('employment_id,weekday,start_time,end_time').in('employment_id', employmentIds),
        dependencies.database.from('shift_exceptions').select('employment_id,is_available,start_time,end_time').in('employment_id', employmentIds).eq('date', now.date),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (patternError) throw fromDatabaseError(patternError)
  if (exceptionError) throw fromDatabaseError(exceptionError)

  const availableBarberIds = new Set(employmentRows.flatMap((employment): string[] => {
    const barber = barberById.get(employment.barber_id)
    if (barber?.shift_status !== 'on' || barber.accepting_bookings !== true) return []
    const exception = (exceptions ?? []).find((row) => row.employment_id === employment.id)
    const blocks = exception
      ? exception.is_available ? [exception] : []
      : (patterns ?? []).filter((row) => row.employment_id === employment.id && row.weekday === now.weekday)
    return blocks.some((block) => now.minute >= wallMinute(block.start_time) && now.minute < wallMinute(block.end_time))
      ? [employment.barber_id]
      : []
  }))

  const publicBarbers = eligibleBarberRows.map((barber) => ({
    id: barber.id,
    bio: barber.bio,
    rating: barber.rating,
    rating_count: barber.rating_count,
    shift_status: barber.shift_status,
    accepting_bookings: barber.accepting_bookings,
    profile: profileById.get(barber.id as string),
  }))
  const publicShops = (shops ?? []).map((shop) => {
    const barberIds = employmentRows
      .filter((employment) => employment.shop_id === shop.id && barberById.has(employment.barber_id))
      .map((employment) => employment.barber_id)
    const available = barberIds.filter((barberId) => availableBarberIds.has(barberId)).length
    return {
      ...shop,
      barber_ids: barberIds,
      status: available > 0 ? 'open' as const : barberIds.length > 0 ? 'busy' as const : 'closed' as const,
      available_barber_count: available,
    }
  })

  return {
    shops: publicShopWithStatusSchema.array().parse(publicShops),
    barbers: publicBarberSchema.array().parse(publicBarbers),
    availableBarberIds,
    employmentByBarberId,
  }
}

export async function publicCatalogueSnapshot(dependencies: ApiDependencies): Promise<PublicCatalogueSnapshot> {
  return catalogueSnapshotForShopIds(dependencies, await eligibleShopIds(dependencies))
}

async function publicServices(dependencies: ApiDependencies, shopId?: string) {
  const shopIds = await eligibleShopIds(dependencies)
  const selectedShopIds = shopId ? shopIds.filter((id) => id === shopId) : shopIds
  if (selectedShopIds.length === 0) return []
  const { data, error } = await dependencies.database
    .from('services')
    .select(PUBLIC_SERVICE_COLUMNS)
    .in('shop_id', selectedShopIds)
    .eq('active', true)
    .order('name')
  if (error) throw fromDatabaseError(error)
  return publicServiceSchema.array().parse(data ?? [])
}

export async function publicSlots(
  dependencies: ApiDependencies,
  input: z.infer<typeof publicSlotQuerySchema>,
) {
  const snapshot = await publicCatalogueSnapshot(dependencies)
  const barber = snapshot.barbers.find((candidate) => candidate.id === input.barberId)
  const employment = snapshot.employmentByBarberId.get(input.barberId)
  if (!barber || !employment || !barber.accepting_bookings) {
    throw new ApiError(404, 'not_found', 'Bookable service/barber combination not found.')
  }

  const { data: service, error: serviceError } = await dependencies.database
    .from('services')
    .select('id,shop_id,duration_min')
    .eq('id', input.serviceId)
    .eq('active', true)
    .maybeSingle()
  if (serviceError) throw fromDatabaseError(serviceError)
  if (!service || service.shop_id !== employment.shop_id) {
    throw new ApiError(404, 'not_found', 'Bookable service/barber combination not found.')
  }

  const [{ data: overrides, error: overrideError }, { data: rules, error: ruleError }, { data: appointments, error: appointmentError }] = await Promise.all([
    dependencies.database.from('shift_exceptions').select('is_available,start_time,end_time').eq('employment_id', employment.id).eq('date', input.date),
    dependencies.database.from('shift_patterns').select('weekday,start_time,end_time').eq('employment_id', employment.id),
    dependencies.database
      .from('appointments')
      .select('starts_at,ends_at')
      .eq('barber_id', input.barberId)
      .in('status', CAPACITY_BLOCKING_APPOINTMENT_STATUSES)
      .gte('starts_at', `${input.date}T00:00:00+08:00`)
      .lt('starts_at', `${input.date}T23:59:59+08:00`),
  ])
  if (overrideError) throw fromDatabaseError(overrideError)
  if (ruleError) throw fromDatabaseError(ruleError)
  if (appointmentError) throw fromDatabaseError(appointmentError)

  const exception = overrides?.[0]
  const weekday = new Date(`${input.date}T00:00:00Z`).getUTCDay()
  const blocks = exception
    ? exception.is_available ? [{ start_time: exception.start_time as string, end_time: exception.end_time as string }] : []
    : (rules ?? []).filter((rule) => rule.weekday === weekday)
  const durationMs = Number(service.duration_min) * 60_000
  const now = Date.now()
  const slots: Array<{ starts_at: string; ends_at: string }> = []

  for (const block of blocks) {
    const blockEnd = manilaMoment(input.date, block.end_time as string).getTime()
    for (let start = manilaMoment(input.date, block.start_time as string).getTime(); start + durationMs <= blockEnd; start += 15 * 60_000) {
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
  return publicSlotSchema.array().parse(slots)
}

export function createPublicCatalogRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/shops', async (_request, response) => {
    response.json({ data: (await publicCatalogueSnapshot(dependencies)).shops })
  })

  router.get('/shops/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const shop = (await publicCatalogueSnapshot(dependencies)).shops.find((candidate) => candidate.id === id) ?? null
    response.json({ data: shop })
  })

  router.get('/barbers', async (_request, response) => {
    response.json({ data: (await publicCatalogueSnapshot(dependencies)).barbers })
  })

  router.get('/barbers/available', async (_request, response) => {
    const snapshot = await publicCatalogueSnapshot(dependencies)
    response.json({ data: snapshot.barbers.filter((barber) => snapshot.availableBarberIds.has(barber.id)) })
  })

  router.get('/barbers/:barberId', async (request, response) => {
    const { barberId } = parseParams(request, barberIdParamsSchema)
    const barber = (await publicCatalogueSnapshot(dependencies)).barbers.find((candidate) => candidate.id === barberId) ?? null
    response.json({ data: barber })
  })

  router.get('/services', async (request, response) => {
    const { shopId } = parseQuery(request, servicesQuerySchema)
    response.json({ data: await publicServices(dependencies, shopId) })
  })

  router.get('/availability/slots', async (request, response) => {
    response.json({ data: await publicSlots(dependencies, parseQuery(request, publicSlotQuerySchema)) })
  })

  return router
}
