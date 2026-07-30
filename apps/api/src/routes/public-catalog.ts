import { Router } from 'express'
import { z } from 'zod'
import type { AvailabilitySlot } from '@barbershop/shared'
import {
  availabilitySlotSchema,
  barberIdParamsSchema,
  dateKeySchema,
  idParamsSchema,
  publicBarberSchema,
  publicServiceSchema,
  publicShopDetailSchema,
  publicShopWithStatusSchema,
  publicSlotSchema,
  uuidSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { manilaNow, wallMinute } from '../lib/manila-time'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseParams, parseQuery } from '../http/validation'
import { issueShopMediaPreview } from '../lib/shop-media'

export const PUBLIC_SHOP_COLUMNS = 'id,name,address,city,lat,lng,rating,rating_count'
// The booking window is public on purpose: a customer needs to know why a slot
// is missing, and "this shop needs 48 hours' notice" is only explainable if the
// number crosses the seam. It reveals nothing private.
export const PUBLIC_SHOP_DETAIL_COLUMNS =
  'description,public_contact_phone,timezone,booking_mode,chair_count,default_buffer_min,min_lead_minutes,max_advance_days'
export const PUBLIC_BARBER_COLUMNS = 'id,bio,rating,rating_count,shift_status,accepting_bookings'
export const PUBLIC_SERVICE_COLUMNS = 'id,shop_id,name,duration_min,price_cents'
const PUBLIC_HOURS_COLUMNS = 'weekday,open_time,close_time,closed,block_order'
const PUBLIC_CLOSURE_COLUMNS = 'local_date,closed,replacement_open_time,replacement_close_time'
const PUBLIC_MEDIA_COLUMNS = 'id,storage_path,role,sort_order,alt_text'

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

function publicWallTime(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, 5) : null
}

export async function publicShopDetail(dependencies: ApiDependencies, shopId: string) {
  const summary = (await publicCatalogueSnapshot(dependencies)).shops
    .find((candidate) => candidate.id === shopId)
  if (!summary) return null

  // Recheck publication on the detail row itself so an unpublish between the
  // eligibility RPC and this read cannot expose a now-private shop.
  const { data: detailFields, error: detailError } = await dependencies.database
    .from('shops')
    .select(PUBLIC_SHOP_DETAIL_COLUMNS)
    .eq('id', shopId)
    .eq('lifecycle_status', 'published')
    .maybeSingle()
  if (detailError) throw fromDatabaseError(detailError)
  if (!detailFields) return null

  const [
    { data: hourRows, error: hoursError },
    { data: closureRows, error: closuresError },
    services,
    { data: mediaRows, error: mediaError },
  ] = await Promise.all([
    dependencies.database
      .from('shop_operating_hours')
      .select(PUBLIC_HOURS_COLUMNS)
      .eq('shop_id', shopId)
      .order('weekday', { ascending: true })
      .order('block_order', { ascending: true })
      .limit(64),
    dependencies.database
      .from('shop_closures')
      .select(PUBLIC_CLOSURE_COLUMNS)
      .eq('shop_id', shopId)
      .gte('local_date', manilaNow().date)
      .order('local_date', { ascending: true })
      .limit(366),
    publicServices(dependencies, shopId),
    dependencies.database
      .from('shop_media')
      .select(PUBLIC_MEDIA_COLUMNS)
      .eq('shop_id', shopId)
      .eq('upload_status', 'ready')
      .eq('moderation_status', 'approved')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(100),
  ])
  if (hoursError) throw fromDatabaseError(hoursError)
  if (closuresError) throw fromDatabaseError(closuresError)
  if (mediaError) throw fromDatabaseError(mediaError)

  const operatingHours = (hourRows ?? []).map((row) => ({
    weekday: row.weekday,
    open_time: publicWallTime(row.open_time),
    close_time: publicWallTime(row.close_time),
    closed: row.closed,
    block_order: row.block_order,
  }))
  const closures = (closureRows ?? []).map((row) => ({
    local_date: row.local_date,
    closed: row.closed,
    replacement_open_time: publicWallTime(row.replacement_open_time),
    replacement_close_time: publicWallTime(row.replacement_close_time),
  }))
  const media = (await Promise.all((mediaRows ?? []).map(async (row) => {
    try {
      return {
        id: row.id,
        role: row.role,
        sort_order: row.sort_order,
        alt_text: row.alt_text,
        url: await issueShopMediaPreview(dependencies, row.storage_path as string),
      }
    } catch {
      // One stale storage object must not take down an otherwise valid public
      // shop detail response.
      return null
    }
  }))).filter((item) => item !== null)

  return publicShopDetailSchema.parse({
    ...summary,
    ...detailFields,
    operating_hours: operatingHours,
    closures,
    services,
    media,
  })
}

/**
 * Bookable slots straight from the availability engine.
 *
 * This used to be computed here from shift patterns and barber overlap alone,
 * which meant a shown slot could still be refused on submit for publication,
 * opening hours, a date closure, qualification, or chair capacity. The engine now
 * decides, so the offered slots and the claimable slots are the same set by
 * construction rather than by two implementations agreeing.
 *
 * `customerId` is optional because the public route is anonymous. When present,
 * the engine also excludes slots that clash with that customer's own bookings.
 */
export async function availabilitySlots(
  dependencies: ApiDependencies,
  input: { shopId: string; serviceId: string; date: string; barberId?: string },
  customerId?: string,
): Promise<AvailabilitySlot[]> {
  const { data, error } = await dependencies.database.rpc('api_availability_slots', {
    p_shop_id: input.shopId,
    p_service_id: input.serviceId,
    p_date: input.date,
    p_customer_id: customerId ?? null,
    p_barber_id: input.barberId ?? null,
  })
  if (error) throw fromDatabaseError(error)
  return availabilitySlotSchema.array().parse(data ?? [])
}

/**
 * Legacy per-barber slot shape, kept so existing clients of
 * `/catalog/availability/slots` keep working while the customer UI moves to the
 * richer contract. It resolves the barber's shop itself and then defers to the
 * engine, so it can no longer offer a slot the booking command would reject.
 */
export async function publicSlots(
  dependencies: ApiDependencies,
  input: z.infer<typeof publicSlotQuerySchema>,
) {
  const { data: service, error: serviceError } = await dependencies.database
    .from('services')
    .select('id,shop_id')
    .eq('id', input.serviceId)
    .eq('active', true)
    .maybeSingle()
  if (serviceError) throw fromDatabaseError(serviceError)
  if (!service) {
    throw new ApiError(404, 'not_found', 'Bookable service/barber combination not found.')
  }

  const slots = await availabilitySlots(dependencies, {
    shopId: service.shop_id as string,
    serviceId: input.serviceId,
    date: input.date,
    barberId: input.barberId,
  })
  return publicSlotSchema.array().parse(
    slots.map((slot) => ({ starts_at: slot.starts_at, ends_at: slot.ends_at })),
  )
}

export function createPublicCatalogRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/shops', async (_request, response) => {
    response.json({ data: (await publicCatalogueSnapshot(dependencies)).shops })
  })

  router.get('/shops/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    response.json({ data: await publicShopDetail(dependencies, id) })
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
