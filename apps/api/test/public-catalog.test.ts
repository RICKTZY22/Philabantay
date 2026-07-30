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
  builder.order = vi.fn(() => builder)
  return builder
}

function publicDetailDependencies(options?: {
  includePrivateField?: boolean
  previewUnavailable?: boolean
}) {
  const shopId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const mediaId = crypto.randomUUID()
  const storagePath = `${shopId}/${mediaId}.jpg`
  const summary = {
    id: shopId,
    name: 'Detailed Public Shop',
    address: '10 Public Street',
    city: 'Manila',
    lat: 14.5995,
    lng: 120.9842,
    rating: 4.7,
    rating_count: 21,
  }
  const summaryShops = chain({ data: [summary], error: null })
  const profiles = chain({ data: [], error: null })
  const detail = chain({
    data: {
      description: 'A published neighbourhood shop.',
      public_contact_phone: '+639171234567',
      timezone: 'Asia/Manila',
      booking_mode: 'manual',
      chair_count: 3,
      default_buffer_min: 10,
      min_lead_minutes: 0,
      max_advance_days: null,
      ...(options?.includePrivateField ? { owner_id: crypto.randomUUID() } : {}),
    },
    error: null,
  })
  const hours = chain({ data: [{
    weekday: 1,
    open_time: '09:00:00',
    close_time: '18:00:00',
    closed: false,
    block_order: 0,
  }], error: null })
  const closures = chain({ data: [{
    local_date: '2099-01-08',
    closed: true,
    replacement_open_time: null,
    replacement_close_time: null,
    reason: 'Private staffing detail',
  }], error: null })
  const services = chain({ data: [{
    id: serviceId,
    shop_id: shopId,
    name: 'Classic cut',
    duration_min: 30,
    price_cents: 35000,
  }], error: null })
  const media = chain({ data: [{
    id: mediaId,
    storage_path: storagePath,
    role: 'storefront',
    sort_order: 0,
    alt_text: 'Shop entrance',
    moderation_status: 'approved',
  }], error: null })
  let shopRead = 0
  const from = vi.fn((table: string) => {
    if (table === 'shops') return shopRead++ === 0 ? summaryShops : detail
    if (table === 'users') return profiles
    if (table === 'shop_operating_hours') return hours
    if (table === 'shop_closures') return closures
    if (table === 'services') return services
    if (table === 'shop_media') return media
    throw new Error(`Unexpected table: ${table}`)
  })
  const createSignedUrl = vi.fn().mockResolvedValue(options?.previewUnavailable
    ? { data: null, error: new Error('Object missing') }
    : {
        data: { signedUrl: 'http://127.0.0.1:54321/storage/v1/object/sign/shop-media/example' },
        error: null,
      })
  const storageFrom = vi.fn(() => ({ createSignedUrl }))
  const dependencies = {
    auth: { auth: { getUser: vi.fn() } },
    database: {
      rpc: vi.fn().mockResolvedValue({ data: [{ shop_id: shopId }], error: null }),
      from,
      storage: { from: storageFrom },
    },
  } as unknown as ApiDependencies
  return {
    dependencies,
    shopId,
    serviceId,
    mediaId,
    storagePath,
    detail,
    hours,
    closures,
    media,
    createSignedUrl,
  }
}

function anonymousDependencies(options?: {
  eligibleShopIds?: string[]
  shops?: Array<Record<string, unknown>>
  service?: Record<string, unknown> | null
}) {
  const getUser = vi.fn()
  const shops = chain({ data: options?.shops ?? [], error: null })
  const profiles = chain({ data: [], error: null })
  // P2-07: the slot route resolves the service's shop before asking the
  // availability engine, so an anonymous fixture needs a services table. No row
  // means the route answers 404, which is what the rate-limit probe expects.
  const services = chain({ data: options?.service ?? null, error: null })
  const from = vi.fn((table: string) => {
    if (table === 'shops') return shops
    if (table === 'users') return profiles
    if (table === 'services') return services
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
  return { dependencies, getUser, from, shops, services }
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

  it('serves strict real shop facts and signs only ready approved media', async () => {
    const fixture = publicDetailDependencies()

    const response = await request(createApp(fixture.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get(`/api/v1/catalog/shops/${fixture.shopId}`)

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      id: fixture.shopId,
      description: 'A published neighbourhood shop.',
      public_contact_phone: '+639171234567',
      timezone: 'Asia/Manila',
      booking_mode: 'manual',
      chair_count: 3,
      default_buffer_min: 10,
      min_lead_minutes: 0,
      max_advance_days: null,
      operating_hours: [{
        weekday: 1,
        open_time: '09:00',
        close_time: '18:00',
        closed: false,
        block_order: 0,
      }],
      closures: [{
        local_date: '2099-01-08',
        closed: true,
        replacement_open_time: null,
        replacement_close_time: null,
      }],
      services: [{
        id: fixture.serviceId,
        shop_id: fixture.shopId,
        price_cents: 35000,
      }],
      media: [{
        id: fixture.mediaId,
        role: 'storefront',
        alt_text: 'Shop entrance',
        url: 'http://127.0.0.1:54321/storage/v1/object/sign/shop-media/example',
      }],
    })
    expect(response.body.data).not.toHaveProperty('owner_id')
    expect(response.body.data.closures[0]).not.toHaveProperty('reason')
    expect(response.body.data.media[0]).not.toHaveProperty('storage_path')
    expect(fixture.detail.select).toHaveBeenCalledWith(
      'description,public_contact_phone,timezone,booking_mode,chair_count,default_buffer_min,min_lead_minutes,max_advance_days',
    )
    expect(fixture.hours.select).toHaveBeenCalledWith('weekday,open_time,close_time,closed,block_order')
    expect(fixture.closures.select).toHaveBeenCalledWith('local_date,closed,replacement_open_time,replacement_close_time')
    expect(fixture.media.select).toHaveBeenCalledWith('id,storage_path,role,sort_order,alt_text')
    expect(fixture.media.eq).toHaveBeenCalledWith('upload_status', 'ready')
    expect(fixture.media.eq).toHaveBeenCalledWith('moderation_status', 'approved')
    expect(fixture.createSignedUrl).toHaveBeenCalledWith(fixture.storagePath, 15 * 60)
  })

  it('fails closed if a private field reaches the public shop-detail projection', async () => {
    const fixture = publicDetailDependencies({ includePrivateField: true })

    const response = await request(createApp(fixture.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get(`/api/v1/catalog/shops/${fixture.shopId}`)

    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject({ code: 'validation' })
  })

  it('omits an unavailable media object without taking down public shop detail', async () => {
    const fixture = publicDetailDependencies({ previewUnavailable: true })

    const response = await request(createApp(fixture.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get(`/api/v1/catalog/shops/${fixture.shopId}`)

    expect(response.status).toBe(200)
    expect(response.body.data.id).toBe(fixture.shopId)
    expect(response.body.data.media).toEqual([])
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
