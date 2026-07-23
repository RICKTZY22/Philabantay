import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { Profile } from '@barbershop/shared'
import type { ApiDependencies } from '../src/lib/supabase'
import { createApp } from '../src/app'
import { PUBLIC_SHOP_COLUMNS } from '../src/routes/public-catalog'

type QueryResult = { data: unknown; error: null }

function chain(result: QueryResult) {
  const promise = Promise.resolve(result)
  const builder: Record<string, unknown> = {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  for (const method of ['select', 'in', 'eq', 'is', 'lte', 'gte', 'lt', 'limit', 'maybeSingle', 'single']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.order = vi.fn(() => promise)
  return builder
}

function anonymousDependencies(options?: {
  eligibleShopIds?: string[]
  shops?: Array<Record<string, unknown>>
}) {
  const getUser = vi.fn()
  const shops = chain({ data: options?.shops ?? [], error: null })
  const profiles = chain({ data: [], error: null })
  const from = vi.fn((table: string) => {
    if (table === 'shops') return shops
    if (table === 'users') return profiles
    throw new Error(`Unexpected table: ${table}`)
  })
  const database = {
    rpc: vi.fn().mockResolvedValue({
      data: (options?.eligibleShopIds ?? []).map((shop_id) => ({ shop_id })),
      error: null,
    }),
    from,
  }
  const dependencies = {
    auth: { auth: { getUser } },
    database,
  } as unknown as ApiDependencies
  return { dependencies, getUser, from, shops }
}

function authenticatedDependencies() {
  const profile: Profile = {
    id: crypto.randomUUID(),
    role: 'customer',
    requested_role: 'customer',
    verification_status: 'not_required',
    authorization_version: 1,
    onboarding_completed: true,
    full_name: 'Catalogue Customer',
    email: 'catalogue-customer@example.test',
    phone: null,
    location: null,
    avatar_url: null,
    created_at: '2026-07-22T00:00:00.000Z',
  }
  const profileLookup = chain({ data: profile, error: null })
  const from = vi.fn((table: string) => {
    if (table === 'users') return profileLookup
    throw new Error(`A removed legacy GET queried ${table}.`)
  })
  return {
    dependencies: {
      auth: {
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: { claims: { sub: profile.id, aal: 'aal1' } },
            error: null,
          }),
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: profile.id } }, error: null }),
        },
      },
      database: { from, rpc: vi.fn() },
    } as unknown as ApiDependencies,
    from,
  }
}

describe('public catalogue API boundary', () => {
  it('serves the catalogue without authentication and selects only public shop columns', async () => {
    const shopId = crypto.randomUUID()
    const shop = {
      id: shopId,
      name: 'Public Shop',
      address: '1 Test Street',
      city: 'Manila',
      lat: 14.5995,
      lng: 120.9842,
      rating: 4.5,
      rating_count: 8,
    }
    const { dependencies, getUser, shops } = anonymousDependencies({ eligibleShopIds: [shopId], shops: [shop] })

    const response = await request(createApp(dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get('/api/v1/catalog/shops')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: [{
      ...shop,
      barber_ids: [],
      status: 'closed',
      available_barber_count: 0,
    }] })
    expect(getUser).not.toHaveBeenCalled()
    expect(shops.select).toHaveBeenCalledWith(PUBLIC_SHOP_COLUMNS)
  })

  it('fails closed when a database response contains a non-public shop field', async () => {
    const shopId = crypto.randomUUID()
    const { dependencies } = anonymousDependencies({
      eligibleShopIds: [shopId],
      shops: [{
        id: shopId,
        name: 'Unsafe Shop',
        address: '2 Test Street',
        city: 'Manila',
        lat: 14.5995,
        lng: 120.9842,
        rating: 0,
        rating_count: 0,
        owner_id: crypto.randomUUID(),
      }],
    })

    const response = await request(createApp(dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get('/api/v1/catalog/shops')

    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject({ code: 'validation' })
  })

  it('does not retain the old authenticated catalogue GET backdoor', async () => {
    const { dependencies, from } = authenticatedDependencies()

    const response = await request(createApp(dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get('/api/v1/shops')
      .set('Authorization', 'Bearer valid-test-token')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      error: { code: 'route_not_found', message: 'No route for GET /api/v1/shops.' },
    })
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('users')
  })

  it('rate-limits expensive anonymous slot computation at 60 requests per minute', async () => {
    const { dependencies } = anonymousDependencies()
    const app = createApp(dependencies, { webOrigin: 'http://127.0.0.1:5174' })
    const query = `barberId=${crypto.randomUUID()}&serviceId=${crypto.randomUUID()}&date=2030-01-08`

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await request(app).get(`/api/v1/catalog/availability/slots?${query}`)
      expect(response.status).toBe(404)
    }
    const limited = await request(app).get(`/api/v1/catalog/availability/slots?${query}`)

    expect(limited.status).toBe(429)
    expect(limited.body).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many availability requests. Please slow down and try again shortly.',
      },
    })
  })
})
