import { randomUUID } from 'node:crypto'
import type { ApiDependencies } from './supabase'
import { ApiError, fromDatabaseError } from '../http/errors'

export const SHOP_MEDIA_BUCKET = 'shop-media'
const SHOP_MEDIA_VIEW_SECONDS = 15 * 60
const SHOP_MEDIA_MAX_BYTES = 8 * 1024 * 1024
const STALE_SHOP_MEDIA_AGE_MS = 24 * 60 * 60 * 1000
const STALE_SHOP_MEDIA_BATCH_SIZE = 100

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

export function newShopMediaPath(shopId: string, mime: string): string {
  return `${shopId}/${randomUUID()}.${extensionForMime(mime)}`
}

export async function issueShopMediaUploadGrant(
  dependencies: ApiDependencies,
  storagePath: string,
): Promise<{ uploadUrl: string }> {
  const { data, error } = await dependencies.database.storage
    .from(SHOP_MEDIA_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })
  if (error || !data) {
    throw new ApiError(503, 'media_processing', 'A shop-photo upload grant could not be created.')
  }
  return { uploadUrl: data.signedUrl }
}

export async function issueShopMediaPreview(
  dependencies: ApiDependencies,
  storagePath: string,
): Promise<string> {
  const { data, error } = await dependencies.database.storage
    .from(SHOP_MEDIA_BUCKET)
    .createSignedUrl(storagePath, SHOP_MEDIA_VIEW_SECONDS)
  if (error || !data) {
    throw new ApiError(503, 'media_processing', 'A shop-photo preview could not be created.')
  }
  return data.signedUrl
}

function detectedImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

export async function validateShopMediaObject(
  dependencies: ApiDependencies,
  storagePath: string,
  declaredMime: string,
  declaredSize: number,
): Promise<void> {
  const { data, error } = await dependencies.database.storage
    .from(SHOP_MEDIA_BUCKET)
    .download(storagePath)
  if (error || !data) {
    throw new ApiError(409, 'media_processing', 'The uploaded shop photo is not available yet.')
  }
  const bytes = new Uint8Array(await data.arrayBuffer())
  const detectedMime = detectedImageMime(bytes)
  if (bytes.length < 1 || bytes.length > SHOP_MEDIA_MAX_BYTES
    || bytes.length !== declaredSize || detectedMime !== declaredMime) {
    throw new ApiError(400, 'media_rejected', 'The uploaded file does not match its declared image type or size.')
  }
}

export async function removeShopMediaObject(
  dependencies: ApiDependencies,
  storagePath: string,
): Promise<void> {
  const { error } = await dependencies.database.storage
    .from(SHOP_MEDIA_BUCKET)
    .remove([storagePath])
  if (error) {
    throw new ApiError(503, 'media_processing', 'Shop-photo cleanup could not finish; metadata was retained for retry.')
  }
}

/**
 * Bounded, idempotent cleanup for upload grants that were never completed.
 * Metadata is deleted only after object removal succeeds, so failures remain
 * discoverable and retryable instead of creating untracked objects.
 */
export async function processStaleShopMedia(dependencies: ApiDependencies): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SHOP_MEDIA_AGE_MS).toISOString()
  const { data, error } = await dependencies.database
    .from('shop_media')
    .select('id,storage_path')
    .eq('upload_status', 'awaiting_upload')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(STALE_SHOP_MEDIA_BATCH_SIZE)
  if (error) throw fromDatabaseError(error)

  let cleaned = 0
  for (const row of data ?? []) {
    try {
      await removeShopMediaObject(dependencies, row.storage_path as string)
    } catch {
      continue
    }
    const { error: deleteError } = await dependencies.database
      .from('shop_media')
      .delete()
      .eq('id', row.id as string)
      .eq('upload_status', 'awaiting_upload')
    if (deleteError) throw fromDatabaseError(deleteError)
    cleaned += 1
  }
  return cleaned
}
