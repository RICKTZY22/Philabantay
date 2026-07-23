import { Router } from 'express'
import {
  createOwnerShopInputSchema,
  createShopClosureInputSchema,
  createServiceInputSchema,
  idParamsSchema,
  setAcceptingBookingsInputSchema,
  setShiftStatusInputSchema,
  setShopHoursInputSchema,
  shopVersionInputSchema,
  updateOwnerShopInputSchema,
  updateServiceInputSchema,
} from '@barbershop/shared/schemas'
import { shopPublicationReadiness } from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams } from '../http/validation'
import { PUBLIC_SERVICE_COLUMNS } from './public-catalog'

const privateServiceColumns = `${PUBLIC_SERVICE_COLUMNS},active,created_at,updated_at`

// The owner's private projection includes lifecycle + version, never exposed
// through public discovery.
const OWNER_SHOP_COLUMNS = [
  'id', 'name', 'address', 'city', 'lat', 'lng', 'rating', 'rating_count',
  'owner_id', 'lifecycle_status', 'timezone', 'booking_mode', 'chair_count',
  'default_buffer_min', 'description', 'public_contact_phone', 'published_at',
  'version', 'created_at', 'updated_at',
].join(',')

const HOURS_COLUMNS = 'id,shop_id,weekday,open_time,close_time,closed,block_order'

function normalizeHoursRow(row: Record<string, unknown>) {
  const time = (value: unknown) => (typeof value === 'string' ? value.slice(0, 5) : null)
  return {
    id: row.id,
    shop_id: row.shop_id,
    weekday: row.weekday,
    open_time: time(row.open_time),
    close_time: time(row.close_time),
    closed: row.closed,
    block_order: row.block_order,
  }
}

const CLOSURE_COLUMNS = 'id,shop_id,local_date,closed,replacement_open_time,replacement_close_time,reason'

function normalizeClosureRow(row: Record<string, unknown>) {
  const time = (value: unknown) => (typeof value === 'string' ? value.slice(0, 5) : null)
  return {
    id: row.id,
    shop_id: row.shop_id,
    local_date: row.local_date,
    closed: row.closed,
    replacement_open_time: time(row.replacement_open_time),
    replacement_close_time: time(row.replacement_close_time),
    reason: row.reason ?? null,
  }
}

export function createCatalogRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.patch('/barbers/me/shift-status', async (request, response) => {
    await requireActiveEmployment(dependencies, request)
    const input = parseBody(request, setShiftStatusInputSchema)
    const { data, error } = await dependencies.database.rpc('api_set_barber_shift_status', {
      p_barber_id: request.auth.profile.id,
      p_on: input.on,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.patch('/barbers/me/accepting-bookings', async (request, response) => {
    await requireActiveEmployment(dependencies, request)
    const input = parseBody(request, setAcceptingBookingsInputSchema)
    const { data, error } = await dependencies.database.rpc('api_set_barber_accepting_bookings', {
      p_barber_id: request.auth.profile.id,
      p_accepting: input.accepting,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  // ================= Owner shop lifecycle (P2-01) =================
  // One shop per owner; created as an unpublished draft. Publication and every
  // lifecycle move is an optimistic-version command guarded here (service role);
  // the browser cannot set lifecycle columns directly (see RLS grants).
  const loadOwnerShop = async (ownerId: string): Promise<Record<string, unknown> | null> => {
    const { data, error } = await dependencies.database
      .from('shops')
      .select(OWNER_SHOP_COLUMNS)
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    return (data as unknown as Record<string, unknown> | null) ?? null
  }

  // A no-op version-guarded update means either the shop is gone or the version
  // moved under us. Distinguish so the client shows the right recovery.
  const versionConflict = async (ownerId: string): Promise<ApiError> => {
    const existing = await loadOwnerShop(ownerId)
    return existing
      ? new ApiError(409, 'conflict', 'This shop changed since you loaded it. Reload and try again.')
      : new ApiError(404, 'not_found', 'No shop found for this owner account.')
  }

  router.get('/owner/shop', async (request, response) => {
    requireRole(request, 'shop_owner')
    response.json({ data: await loadOwnerShop(request.auth.profile.id) })
  })

  router.post('/owner/shop', async (request, response) => {
    requireRole(request, 'shop_owner')
    const input = parseBody(request, createOwnerShopInputSchema)
    const { data, error } = await dependencies.database
      .from('shops')
      .insert({ ...input, owner_id: request.auth.profile.id })
      .select(OWNER_SHOP_COLUMNS)
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.patch('/owner/shop', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { expected_version, ...fields } = parseBody(request, updateOwnerShopInputSchema)
    const { data, error } = await dependencies.database
      .from('shops')
      .update({ ...fields, version: expected_version + 1, updated_at: new Date().toISOString() })
      .eq('owner_id', request.auth.profile.id)
      .eq('version', expected_version)
      .select(OWNER_SHOP_COLUMNS)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) throw await versionConflict(request.auth.profile.id)
    response.json({ data })
  })

  router.post('/owner/shop/publish', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { expected_version } = parseBody(request, shopVersionInputSchema)
    const current = await loadOwnerShop(request.auth.profile.id)
    if (!current) throw new ApiError(404, 'not_found', 'Create your shop before publishing.')

    const { count, error: countError } = await dependencies.database
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', current.id as string)
      .eq('active', true)
    if (countError) throw fromDatabaseError(countError)

    const { count: hoursCount, error: hoursCountError } = await dependencies.database
      .from('shop_operating_hours')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', current.id as string)
      .eq('closed', false)
    if (hoursCountError) throw fromDatabaseError(hoursCountError)

    const readiness = shopPublicationReadiness({
      name: current.name as string,
      address: current.address as string,
      city: current.city as string,
      lat: current.lat as number,
      lng: current.lng as number,
      timezone: current.timezone as string,
      chair_count: current.chair_count as number,
    }, { activeServices: count ?? 0, operatingHours: hoursCount ?? 0 })
    if (!readiness.ready) {
      throw new ApiError(422, 'validation', `This shop is not ready to publish. Add: ${readiness.missing.join(', ')}.`)
    }

    const { data, error } = await dependencies.database
      .from('shops')
      .update({
        lifecycle_status: 'published',
        published_at: (current.published_at as string | null) ?? new Date().toISOString(),
        version: expected_version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('owner_id', request.auth.profile.id)
      .eq('version', expected_version)
      .select(OWNER_SHOP_COLUMNS)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) throw await versionConflict(request.auth.profile.id)
    response.json({ data })
  })

  router.post('/owner/shop/unpublish', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { expected_version } = parseBody(request, shopVersionInputSchema)
    const { data, error } = await dependencies.database
      .from('shops')
      .update({
        lifecycle_status: 'draft',
        published_at: null,
        version: expected_version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('owner_id', request.auth.profile.id)
      .eq('version', expected_version)
      .select(OWNER_SHOP_COLUMNS)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) throw await versionConflict(request.auth.profile.id)
    response.json({ data })
  })

  // ---- Operating hours (replace-all) ----
  const listShopHours = async (shopId: string) => {
    const { data, error } = await dependencies.database
      .from('shop_operating_hours')
      .select(HOURS_COLUMNS)
      .eq('shop_id', shopId)
      .order('weekday', { ascending: true })
      .order('block_order', { ascending: true })
    if (error) throw fromDatabaseError(error)
    return ((data as unknown as Record<string, unknown>[]) ?? []).map(normalizeHoursRow)
  }

  router.get('/owner/shop/hours', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) {
      response.json({ data: [] })
      return
    }
    response.json({ data: await listShopHours(shop.id as string) })
  })

  router.put('/owner/shop/hours', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'Create your shop before setting hours.')
    const shopId = shop.id as string
    const input = parseBody(request, setShopHoursInputSchema)
    const rows = input.blocks.map((block, index) => {
      const closed = block.closed ?? false
      return {
        shop_id: shopId,
        weekday: block.weekday,
        closed,
        open_time: closed ? null : (block.open_time ?? null),
        close_time: closed ? null : (block.close_time ?? null),
        block_order: block.block_order ?? index,
      }
    })
    const { error: deleteError } = await dependencies.database
      .from('shop_operating_hours').delete().eq('shop_id', shopId)
    if (deleteError) throw fromDatabaseError(deleteError)
    if (rows.length > 0) {
      const { error: insertError } = await dependencies.database
        .from('shop_operating_hours').insert(rows)
      if (insertError) throw fromDatabaseError(insertError)
    }
    response.json({ data: await listShopHours(shopId) })
  })

  // ---- Date-specific closures (upsert by date) ----
  router.get('/owner/shop/closures', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) {
      response.json({ data: [] })
      return
    }
    const { data, error } = await dependencies.database
      .from('shop_closures')
      .select(CLOSURE_COLUMNS)
      .eq('shop_id', shop.id as string)
      .order('local_date', { ascending: true })
    if (error) throw fromDatabaseError(error)
    response.json({ data: ((data as unknown as Record<string, unknown>[]) ?? []).map(normalizeClosureRow) })
  })

  router.post('/owner/shop/closures', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'Create your shop before adding closures.')
    const input = parseBody(request, createShopClosureInputSchema)
    const closed = input.closed ?? true
    const row = {
      shop_id: shop.id as string,
      local_date: input.local_date,
      closed,
      replacement_open_time: closed ? null : (input.replacement_open_time ?? null),
      replacement_close_time: closed ? null : (input.replacement_close_time ?? null),
      reason: input.reason ?? null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await dependencies.database
      .from('shop_closures')
      .upsert(row, { onConflict: 'shop_id,local_date' })
      .select(CLOSURE_COLUMNS)
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data: normalizeClosureRow(data as unknown as Record<string, unknown>) })
  })

  router.delete('/owner/shop/closures/:id', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'No shop found for this owner account.')
    const { error } = await dependencies.database
      .from('shop_closures')
      .delete()
      .eq('id', id)
      .eq('shop_id', shop.id as string)
    if (error) throw fromDatabaseError(error)
    response.status(204).end()
  })

  // ================= Services (owner-managed) =================
  router.post('/services', async (request, response) => {
    const input = parseBody(request, createServiceInputSchema)
    await requireOwnedShop(dependencies, request, input.shop_id)
    const { data, error } = await dependencies.database.from('services').insert(input).select(privateServiceColumns).single()
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
    const { data, error } = await dependencies.database.from('services').update(input).eq('id', id).select(privateServiceColumns).single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  return router
}
