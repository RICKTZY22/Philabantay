import { describe, expect, it } from 'vitest'
import { shopPublicationReadiness } from '../src/shops'

const READY = {
  name: 'Fresh Cuts',
  address: '1 Main Street',
  city: 'Manila',
  lat: 14.6,
  lng: 121.0,
  timezone: 'Asia/Manila',
  chair_count: 2,
}

describe('shopPublicationReadiness', () => {
  it('is ready when identity, location, timezone, chairs, and an active service are present', () => {
    expect(shopPublicationReadiness(READY, 1)).toEqual({ ready: true, missing: [] })
  })

  it('blocks publication without an active service', () => {
    const result = shopPublicationReadiness(READY, 0)
    expect(result.ready).toBe(false)
    expect(result.missing).toContain('at least one active service')
  })

  it('requires at least one chair', () => {
    const result = shopPublicationReadiness({ ...READY, chair_count: 0 }, 1)
    expect(result.ready).toBe(false)
    expect(result.missing).toContain('at least one chair')
  })

  it('requires shop identity, location, and timezone', () => {
    const result = shopPublicationReadiness({ ...READY, name: '  ', timezone: '' }, 1)
    expect(result.ready).toBe(false)
    expect(result.missing).toEqual(expect.arrayContaining(['shop name', 'timezone']))
  })
})
