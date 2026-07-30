import { Router } from 'express'
import {
  createOwnerShopInputSchema,
  createShopClosureInputSchema,
  idParamsSchema,
  ownerServiceInputSchema,
  requestShopMediaUploadInputSchema,
  setAcceptingBookingsInputSchema,
  setShiftStatusInputSchema,
  setShopHoursInputSchema,
  shopVersionInputSchema,
  updateOwnerShopInputSchema,
  updateShopHiringInputSchema,
  updateServiceInputSchema,
} from '@barbershop/shared/schemas'
import { ownerShopHiringFromRow } from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams } from '../http/validation'
import { PUBLIC_SERVICE_COLUMNS } from './public-catalog'
import {
  issueShopMediaPreview,
  issueShopMediaUploadGrant,
  newShopMediaPath,
  removeShopMediaObject,
  validateShopMediaObject,
} from '../lib/shop-media'

const privateServiceColumns = `${PUBLIC_SERVICE_COLUMNS},active,created_at,updated_at`

// The owner's private projection includes lifecycle + version, never exposed
// through public discovery.
const OWNER_SHOP_COLUMNS = [
  'id', 'name', 'address', 'city', 'lat', 'lng', 'rating', 'rating_count',
  'owner_id', 'lifecycle_status', 'timezone', 'booking_mode', 'chair_count',
  'default_buffer_min', 'min_lead_minutes', 'max_advance_days',
  'description', 'public_contact_phone', 'published_at',
  'is_hiring', 'hiring_open_positions', 'hiring_note',
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
const MEDIA_COLUMNS = [
  'id', 'shop_id', 'storage_path', 'role', 'sort_order', 'alt_text',
  'declared_mime', 'declared_size_bytes', 'upload_status',
  'moderation_status', 'created_at', 'updated_at',
].join(',')

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
    const { error } = await dependencies.database.rpc('api_publish_owner_shop', {
      p_owner_id: request.auth.profile.id,
      p_expected_version: expected_version,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await loadOwnerShop(request.auth.profile.id) })
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

  // ---- Hiring state (P2-03) ----
  router.get('/owner/shop/hiring', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    response.json({
      data: shop ? ownerShopHiringFromRow({
        id: shop.id as string,
        is_hiring: shop.is_hiring as boolean,
        hiring_open_positions: shop.hiring_open_positions as number | null,
        hiring_note: shop.hiring_note as string | null,
        version: shop.version as number,
        updated_at: shop.updated_at as string,
      }) : null,
    })
  })

  router.patch('/owner/shop/hiring', async (request, response) => {
    requireRole(request, 'shop_owner')
    const input = parseBody(request, updateShopHiringInputSchema)
    const { data, error } = await dependencies.database.rpc('api_set_owner_shop_hiring', {
      p_owner_id: request.auth.profile.id,
      p_expected_version: input.expected_version,
      p_status: input.status,
      p_open_positions: input.open_positions ?? null,
      p_note: input.note ?? null,
    })
    if (error) throw fromDatabaseError(error)
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
    const input = parseBody(request, setShopHoursInputSchema)
    const rows = input.blocks.map((block, index) => {
      const closed = block.closed ?? false
      return {
        weekday: block.weekday,
        closed,
        open_time: closed ? null : (block.open_time ?? null),
        close_time: closed ? null : (block.close_time ?? null),
        block_order: block.block_order ?? index,
      }
    })
    const { data, error } = await dependencies.database.rpc('api_replace_owner_shop_hours', {
      p_owner_id: request.auth.profile.id,
      p_expected_version: input.expected_version,
      p_blocks: rows,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
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
  // Owner-scoped like hours and closures: the shop comes from the signed-in
  // owner, never from the request body, and every query is pinned to that shop
  // id so a service can not be read or written across tenants.
  const listOwnerServices = async (shopId: string) => {
    const { data, error } = await dependencies.database
      .from('services')
      .select(privateServiceColumns)
      .eq('shop_id', shopId)
      .order('created_at', { ascending: true })
    if (error) throw fromDatabaseError(error)
    return (data as unknown as Record<string, unknown>[]) ?? []
  }

  router.get('/owner/shop/services', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) {
      response.json({ data: [] })
      return
    }
    response.json({ data: await listOwnerServices(shop.id as string) })
  })

  router.post('/owner/shop/services', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'Create your shop before adding services.')
    const input = parseBody(request, ownerServiceInputSchema)
    const { data, error } = await dependencies.database
      .from('services')
      .insert({ ...input, shop_id: shop.id as string })
      .select(privateServiceColumns)
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.patch('/owner/shop/services/:id', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'No shop found for this owner account.')
    const input = parseBody(request, updateServiceInputSchema)
    const { data, error } = await dependencies.database
      .from('services')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('shop_id', shop.id as string)
      .select(privateServiceColumns)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) throw new ApiError(404, 'not_found', 'Service not found.')
    response.json({ data })
  })

  router.delete('/owner/shop/services/:id', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'No shop found for this owner account.')
    const { data, error } = await dependencies.database
      .from('services')
      .update({ active: false })
      .eq('id', id)
      .eq('shop_id', shop.id as string)
      .select(privateServiceColumns)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) throw new ApiError(404, 'not_found', 'Service not found.')
    response.json({ data })
  })

  // ================= Private shop media (signed upload grants) =================
  const ownerMediaRow = async (row: Record<string, unknown>) => {
    let previewUrl: string | null = null
    if (row.upload_status === 'ready') {
      try {
        previewUrl = await issueShopMediaPreview(dependencies, row.storage_path as string)
      } catch {
        // A missing or temporarily unavailable object must not hide the rest of
        // the owner's media library. The null preview keeps the row removable.
      }
    }
    return {
      id: row.id,
      shop_id: row.shop_id,
      role: row.role,
      sort_order: row.sort_order,
      alt_text: row.alt_text,
      upload_status: row.upload_status,
      moderation_status: row.moderation_status,
      preview_url: previewUrl,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  }

  router.get('/owner/shop/media', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) {
      response.json({ data: [] })
      return
    }
    const { data, error } = await dependencies.database
      .from('shop_media')
      .select(MEDIA_COLUMNS)
      .eq('shop_id', shop.id as string)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw fromDatabaseError(error)
    response.json({
      data: await Promise.all(((data ?? []) as unknown as Record<string, unknown>[]).map(ownerMediaRow)),
    })
  })

  router.post('/owner/shop/media/request-upload', async (request, response) => {
    requireRole(request, 'shop_owner')
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'Create your shop before uploading photos.')
    const input = parseBody(request, requestShopMediaUploadInputSchema)
    const storagePath = newShopMediaPath(shop.id as string, input.declared_mime)
    const { data, error } = await dependencies.database
      .from('shop_media')
      .insert({
        shop_id: shop.id,
        storage_path: storagePath,
        role: input.role,
        sort_order: input.sort_order ?? 0,
        alt_text: input.alt_text,
        declared_mime: input.declared_mime,
        declared_size_bytes: input.declared_size_bytes,
      })
      .select(MEDIA_COLUMNS)
      .single()
    if (error) throw fromDatabaseError(error)
    const grant = await issueShopMediaUploadGrant(dependencies, storagePath)
    response.status(201).json({
      data: {
        media: await ownerMediaRow(data as unknown as Record<string, unknown>),
        upload_url: grant.uploadUrl,
        headers: { 'x-upsert': 'false' },
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      },
    })
  })

  router.post('/owner/shop/media/:id/complete', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'No shop found for this owner account.')
    const { data: media, error: lookupError } = await dependencies.database
      .from('shop_media')
      .select(MEDIA_COLUMNS)
      .eq('id', id)
      .eq('shop_id', shop.id as string)
      .maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!media) throw new ApiError(404, 'not_found', 'Shop photo not found.')
    const mediaRow = media as unknown as Record<string, unknown>

    if (mediaRow.upload_status !== 'ready') {
      try {
        await validateShopMediaObject(
          dependencies,
          mediaRow.storage_path as string,
          mediaRow.declared_mime as string,
          Number(mediaRow.declared_size_bytes),
        )
      } catch (error) {
        await dependencies.database.from('shop_media').update({ upload_status: 'rejected' }).eq('id', id)
        await removeShopMediaObject(dependencies, mediaRow.storage_path as string)
        throw error
      }
    }

    const { data, error } = await dependencies.database
      .from('shop_media')
      .update({ upload_status: 'ready' })
      .eq('id', id)
      .eq('shop_id', shop.id as string)
      .select(MEDIA_COLUMNS)
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data: await ownerMediaRow(data as unknown as Record<string, unknown>) })
  })

  router.delete('/owner/shop/media/:id', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const shop = await loadOwnerShop(request.auth.profile.id)
    if (!shop) throw new ApiError(404, 'not_found', 'No shop found for this owner account.')
    const { data: media, error: lookupError } = await dependencies.database
      .from('shop_media')
      .select('storage_path, upload_status')
      .eq('id', id)
      .eq('shop_id', shop.id as string)
      .maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!media) throw new ApiError(404, 'not_found', 'Shop photo not found.')
    if (media.upload_status !== 'deleting') {
      const { error: markError } = await dependencies.database
        .from('shop_media')
        .update({ upload_status: 'deleting' })
        .eq('id', id)
        .eq('shop_id', shop.id as string)
      if (markError) throw fromDatabaseError(markError)
    }
    await removeShopMediaObject(dependencies, media.storage_path as string)
    const { error: deleteError } = await dependencies.database
      .from('shop_media')
      .delete()
      .eq('id', id)
      .eq('shop_id', shop.id as string)
    if (deleteError) throw fromDatabaseError(deleteError)
    response.status(204).end()
  })

  return router
}
