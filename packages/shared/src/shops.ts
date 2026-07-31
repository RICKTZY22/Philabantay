import type {
  OwnerShop,
  OwnerShopHiring,
  ServiceProviderQualification,
  ShopHiringStatus,
  StoredService,
} from './types'

/** Result of checking whether a draft shop may be published. */
export interface ShopPublicationReadiness {
  ready: boolean
  /** Human-readable, ordered list of what still blocks publication. */
  missing: string[]
}

/** Counts of related records the readiness rule needs beyond the shop row. */
export interface ShopPublicationCounts {
  activeServices: number
  bookableProviders: number
  operatingHours: number
}

/**
 * Count providers who are eligible for the shop and qualified for at least one
 * active service. `accepting_bookings` is intentionally ignored: publication
 * should not fail merely because every provider is temporarily paused.
 */
export function countBookableProviders(
  services: Pick<StoredService, 'id' | 'active'>[],
  providers: Pick<ServiceProviderQualification, 'eligible' | 'qualified_service_ids'>[],
): number {
  const activeServiceIds = new Set(
    services.filter((service) => service.active).map((service) => service.id),
  )
  return providers.filter((provider) => (
    provider.eligible
    && provider.qualified_service_ids.some((serviceId) => activeServiceIds.has(serviceId))
  )).length
}

/**
 * Publication-readiness rule for the owner's checklist.
 *
 * **This is a preview, not the enforcement.** The authority is
 * `api_publish_owner_shop`, which re-checks everything inside the transaction
 * that flips the lifecycle; nothing in `apps/api` imports this function. The two
 * therefore have to be kept in step by hand, and they have already drifted once:
 * the SQL began requiring a bookable provider while this rule did not, so the
 * checklist showed complete and Publish failed every press. This docstring used
 * to claim the backend enforced through here, which is exactly why that went
 * unnoticed.
 *
 * `apps/api/test/local-supabase.integration.test.ts` pins the two together by
 * asserting that this rule and the real publish command always give the same
 * answer. Change one side and that test should fail; if it does not, widen it
 * rather than trusting the agreement.
 *
 * Requires shop identity, a map location, a timezone, at least one chair, at
 * least one operating-hours block, at least one active service, and at least
 * one eligible provider qualified for an active service. Media requirements
 * are layered in later by P2-02 once that editor exists.
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
  if (counts.bookableProviders < 1) missing.push('at least one bookable provider')
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
