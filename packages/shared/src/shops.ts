import type { OwnerShop } from './types'

/** Result of checking whether a draft shop may be published. */
export interface ShopPublicationReadiness {
  ready: boolean
  /** Human-readable, ordered list of what still blocks publication. */
  missing: string[]
}

/**
 * Pure publication-readiness rule shared by the owner UI (to render the
 * checklist) and the backend (to enforce it before flipping to `published`).
 *
 * P2-01 requires shop identity, a map location, a timezone, at least one chair,
 * and at least one active service. Operating-hours and media requirements are
 * layered in by P2-02 once those editors exist.
 */
export function shopPublicationReadiness(
  shop: Pick<OwnerShop, 'name' | 'address' | 'city' | 'lat' | 'lng' | 'timezone' | 'chair_count'>,
  activeServiceCount: number,
): ShopPublicationReadiness {
  const missing: string[] = []
  if (!shop.name?.trim()) missing.push('shop name')
  if (!shop.address?.trim()) missing.push('street address')
  if (!shop.city?.trim()) missing.push('city')
  if (!Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) missing.push('map location')
  if (!shop.timezone?.trim()) missing.push('timezone')
  if (!(shop.chair_count >= 1)) missing.push('at least one chair')
  if (activeServiceCount < 1) missing.push('at least one active service')
  return { ready: missing.length === 0, missing }
}
