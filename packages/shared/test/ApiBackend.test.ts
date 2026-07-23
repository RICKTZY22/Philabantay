import { describe, expect, it, vi } from 'vitest'
import { ApiBackend, DataError, type Message, type Profile } from '../src/index'

const fixturePassword = `Test!${crypto.randomUUID()}`
const primaryAccessToken = crypto.randomUUID()
const primaryRefreshToken = crypto.randomUUID()
const refreshedAccessToken = crypto.randomUUID()
const refreshedRefreshToken = crypto.randomUUID()

const profile: Profile = {
  id: crypto.randomUUID(),
  role: 'customer',
  requested_role: 'customer',
  verification_status: 'not_required',
  authorization_version: 1,
  onboarding_completed: true,
  full_name: 'Test Customer',
  email: `customer-${crypto.randomUUID()}@example.test`,
  phone: null,
  location: null,
  avatar_url: null,
  created_at: '2026-07-17T00:00:00.000Z',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function memoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    values,
  }
}

describe('ApiBackend', () => {
  it('persists a sign-in session, emits the profile, and authenticates later calls', async () => {
    const storage = memoryStorage()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: {
        profile,
        session: { access_token: primaryAccessToken, refresh_token: primaryRefreshToken },
      } }))
      .mockResolvedValueOnce(json({ data: [] }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1/', fetch: fetchMock, storage })
    const listener = vi.fn()
    backend.auth.onAuthChange(listener)

    await expect(backend.auth.signIn({ email: profile.email, password: fixturePassword })).resolves.toEqual(profile)
    await expect(backend.bookings.listMine()).resolves.toEqual([])

    expect(listener).toHaveBeenCalledWith(profile)
    expect(storage.values.get('philabantay.api.session.v1')).toContain(primaryAccessToken)
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('authorization')).toBe(`Bearer ${primaryAccessToken}`)
  })

  it('refreshes an expired access token once and retries the protected request', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: crypto.randomUUID(), refresh_token: primaryRefreshToken }),
    })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: 'not_authenticated', message: 'Expired.' } }, 401))
      .mockResolvedValueOnce(json({ data: { session: { access_token: refreshedAccessToken, refresh_token: refreshedRefreshToken } } }))
      .mockResolvedValueOnce(json({ data: [] }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await expect(backend.bookings.listMine()).resolves.toEqual([])

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.test/api/v1/bookings',
      'http://api.test/api/v1/auth/refresh',
      'http://api.test/api/v1/bookings',
    ])
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get('authorization')).toBe(`Bearer ${refreshedAccessToken}`)
  })

  it('maps the central API error shape to DataError', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      error: { code: 'forbidden', message: 'Wrong shop.' },
    }, 403))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await expect(backend.favorites.list()).rejects.toMatchObject<DataError>({
      name: 'DataError',
      code: 'forbidden',
      message: 'Wrong shop.',
    })
  })

  it('loads strict public catalogue DTOs without a session or Authorization header', async () => {
    const shopId = crypto.randomUUID()
    const barberId = crypto.randomUUID()
    const serviceId = crypto.randomUUID()
    const publicShop = {
      id: shopId,
      name: 'Public Shop',
      address: '1 Test Street',
      city: 'Manila',
      lat: 14.5995,
      lng: 120.9842,
      rating: 4.5,
      rating_count: 8,
      barber_ids: [barberId],
      status: 'open',
      available_barber_count: 1,
    }
    const publicBarber = {
      id: barberId,
      bio: 'Fade specialist',
      rating: 4.8,
      rating_count: 12,
      shift_status: 'on',
      accepting_bookings: true,
      profile: { id: barberId, full_name: 'Public Barber', avatar_url: null },
    }
    const publicService = {
      id: serviceId,
      shop_id: shopId,
      name: 'Haircut',
      duration_min: 30,
      price_cents: 35000,
    }
    const publicSlot = {
      starts_at: '2030-01-08T02:00:00.000Z',
      ends_at: '2030-01-08T02:30:00.000Z',
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [publicShop] }))
      .mockResolvedValueOnce(json({ data: [publicBarber] }))
      .mockResolvedValueOnce(json({ data: [publicService] }))
      .mockResolvedValueOnce(json({ data: [publicSlot] }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage: memoryStorage() })

    await expect(backend.shops.list()).resolves.toEqual([publicShop])
    await expect(backend.barbers.list()).resolves.toEqual([publicBarber])
    await expect(backend.services.list(shopId)).resolves.toEqual([publicService])
    await expect(backend.availability.getOpenSlots(barberId, serviceId, '2030-01-08')).resolves.toEqual([publicSlot])

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.test/api/v1/catalog/shops',
      'http://api.test/api/v1/catalog/barbers',
      `http://api.test/api/v1/catalog/services?shopId=${shopId}`,
      `http://api.test/api/v1/catalog/availability/slots?barberId=${barberId}&serviceId=${serviceId}&date=2030-01-08`,
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
    }
  })

  it('rejects private fields smuggled into a public catalogue response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [{
      id: crypto.randomUUID(),
      name: 'Unsafe Shop',
      address: '2 Test Street',
      city: 'Manila',
      lat: 14.5995,
      lng: 120.9842,
      rating: 0,
      rating_count: 0,
      barber_ids: [],
      status: 'closed',
      available_barber_count: 0,
      owner_id: crypto.randomUUID(),
    }] }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage: memoryStorage() })

    await expect(backend.shops.list()).rejects.toThrow()
  })

  it('rejects the internal active flag from a public service response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [{
      id: crypto.randomUUID(),
      shop_id: crypto.randomUUID(),
      name: 'Unsafe Service',
      duration_min: 30,
      price_cents: 30000,
      active: true,
    }] }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage: memoryStorage() })

    await expect(backend.services.list()).rejects.toThrow()
  })

  it('delivers a sent message through the active subscription and cleans up polling', async () => {
    vi.useFakeTimers()
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const message: Message = {
      id: 'message-1',
      conversation_id: 'conversation-1',
      sender_id: profile.id,
      body: 'Hello',
      read_at: null,
      created_at: '2026-07-17T01:00:00.000Z',
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ data: message }, 201))
    const backend = new ApiBackend({
      baseUrl: 'http://api.test/api/v1',
      fetch: fetchMock,
      storage,
      chatPollIntervalMs: 1_000,
    })
    const listener = vi.fn()
    const unsubscribe = backend.chat.subscribe(message.conversation_id, listener)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await backend.chat.sendMessage({ conversation_id: message.conversation_id, body: message.body })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(message)

    unsubscribe()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
