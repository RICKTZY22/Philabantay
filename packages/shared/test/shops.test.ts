import { describe, expect, it } from 'vitest'
import { ownerShopHiringFromRow, shopHiringStatus, shopPublicationReadiness } from '../src/shops'

const READY = {
  name: 'Fresh Cuts',
  address: '1 Main Street',
  city: 'Manila',
  lat: 14.6,
  lng: 121.0,
  timezone: 'Asia/Manila',
  chair_count: 2,
}
const FULL = { activeServices: 1, operatingHours: 1 }

describe('shopPublicationReadiness', () => {
  it('is ready when identity, location, timezone, chairs, hours, and an active service are present', () => {
    expect(shopPublicationReadiness(READY, FULL)).toEqual({ ready: true, missing: [] })
  })

  it('blocks publication without an active service', () => {
    const result = shopPublicationReadiness(READY, { activeServices: 0, operatingHours: 1 })
    expect(result.ready).toBe(false)
    expect(result.missing).toContain('at least one active service')
  })

  it('blocks publication without an operating-hours block', () => {
    const result = shopPublicationReadiness(READY, { activeServices: 1, operatingHours: 0 })
    expect(result.ready).toBe(false)
    expect(result.missing).toContain('at least one operating-hours block')
  })

  it('requires at least one chair', () => {
    const result = shopPublicationReadiness({ ...READY, chair_count: 0 }, FULL)
    expect(result.ready).toBe(false)
    expect(result.missing).toContain('at least one chair')
  })

  it('requires shop identity, location, and timezone', () => {
    const result = shopPublicationReadiness({ ...READY, name: '  ', timezone: '' }, FULL)
    expect(result.ready).toBe(false)
    expect(result.missing).toEqual(expect.arrayContaining(['shop name', 'timezone']))
  })
})

describe('shop hiring state', () => {
  it('derives off, open, and full without exposing a stale positive claim', () => {
    expect(shopHiringStatus(false, null)).toBe('off')
    expect(shopHiringStatus(true, null)).toBe('open')
    expect(shopHiringStatus(true, 2)).toBe('open')
    expect(shopHiringStatus(false, 0)).toBe('full')
  })

  it('normalizes the private row into the versioned owner contract', () => {
    expect(ownerShopHiringFromRow({
      id: 'shop-1',
      is_hiring: true,
      hiring_open_positions: 3,
      hiring_note: 'Fade specialists welcome.',
      version: 7,
      updated_at: '2026-07-27T00:00:00.000Z',
    })).toEqual({
      shop_id: 'shop-1',
      status: 'open',
      is_hiring: true,
      open_positions: 3,
      note: 'Fade specialists welcome.',
      shop_version: 7,
      updated_at: '2026-07-27T00:00:00.000Z',
    })
  })
})
