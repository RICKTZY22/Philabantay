import type { OwnerShop, OwnerShopHiring, ShopHiringStatus } from './types'

/** Result of checking whether a draft shop may be published. */
export interface ShopPublicationReadiness {
  ready: boolean
  /** Human-readable, ordered list of what still blocks publication. */
  missing: string[]
}

/** Counts of related records the readiness rule needs beyond the shop row. */
export interface ShopPublicationCounts {
  activeServices: number
  operatingHours: number
}

/**
 * Pure publication-readiness rule shared by the owner UI (to render the
 * checklist) and the backend (to enforce it before flipping to `published`).
 *
 * Requires shop identity, a map location, a timezone, at least one chair, at
 * least one operating-hours block, and at least one active service. Media
 * requirements are layered in later by P2-02 once that editor exists.
 */
export function shopPublicationReadiness(
  shop: Pick<OwnerShop, 'name' | 'address' | 'city' | 'lat' | 'lng' | 'timezone' | 'chair_count'>,
  counts: ShopPublicationCounts,
): ShopPublicationReadiness {
  const missing: string[] = []
  if (!shop.name?.trim()) missing.push('shop name')
  if (!shop.address?.trim()) missing.push('street address')
  if (!shop.city?.trim()) missing.push('city')
  if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) missing.push('map location')
  if (!shop.timezone?.trim()) missing.push('timezone')
  if (!(shop.chair_count >= 1)) missing.push('at least one chair')
  if (counts.operatingHours < 1) missing.push('at least one operating-hours block')
  if (counts.activeServices < 1) missing.push('at least one active service')
  return { ready: missing.length === 0, missing }
}

export function shopHiringStatus(
  isHiring: boolean,
  openPositions: number | null,
): ShopHiringStatus {
  if (isHiring) return 'open'
  if (openPositions === 0) return 'full'
  return 'off'
}

/** Normalize a private shop row into the stable owner hiring contract. */
export function ownerShopHiringFromRow(row: {
  id: string
  is_hiring: boolean
  hiring_open_positions: number | null
  hiring_note: string | null
  version: number
  updated_at: string
}): OwnerShopHiring {
  return {
    shop_id: row.id,
    status: shopHiringStatus(row.is_hiring, row.hiring_open_positions),
    is_hiring: row.is_hiring,
    open_positions: row.hiring_open_positions,
    note: row.hiring_note,
    shop_version: row.version,
    updated_at: row.updated_at,
  }
}
