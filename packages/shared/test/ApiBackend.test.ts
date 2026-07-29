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

  it('surfaces the shop-media cap message instead of a generic failure', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    // P4022 maps to `media_limit`; if that code is missing from the shared
    // allowlist the owner sees a generic error rather than the real reason.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      error: { code: 'media_limit', message: 'A shop can retain at most 100 photo records.' },
    }, 409))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await expect(backend.ownerShop.listMedia()).rejects.toMatchObject<DataError>({
      name: 'DataError',
      code: 'media_limit',
      message: 'A shop can retain at most 100 photo records.',
    })
  })

  it('surfaces the active-booking schedule guard with its exact count', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      error: {
        code: 'schedule_has_active_bookings',
        message: 'This date still has 2 active booking(s). Resolve them before removing availability.',
      },
    }, 409))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await expect(backend.employment.upsertStaffShiftException(crypto.randomUUID(), {
      expected_version: 3,
      date: '2030-01-07',
      is_available: false,
    })).rejects.toMatchObject<DataError>({
      code: 'schedule_has_active_bookings',
      message: expect.stringContaining('2 active booking(s)'),
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

  it('normalizes legacy appointment statuses at the API boundary', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({
        access_token: primaryAccessToken,
        refresh_token: primaryRefreshToken,
      }),
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(json({
      data: [
        { id: 'legacy-pending', status: 'pending' },
        { id: 'legacy-no-show', status: 'no_show' },
      ],
    }))
    const backend = new ApiBackend({
      baseUrl: 'http://api.test/api/v1',
      fetch: fetchMock,
      storage,
    })

    await expect(backend.bookings.listMine()).resolves.toEqual([
      { id: 'legacy-pending', status: 'requested' },
      { id: 'legacy-no-show', status: 'customer_no_show' },
    ])
  })

  it('normalizes legacy appointment statuses on command responses too', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({
        access_token: primaryAccessToken,
        refresh_token: primaryRefreshToken,
      }),
    })
    // Reads were already normalized; commands returned the raw wire value, so a
    // cancelled-from-pending booking could still surface a legacy alias.
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { id: 'cmd-1', status: 'pending' } }, 201))
      .mockResolvedValueOnce(json({ data: { id: 'cmd-1', status: 'no_show' } }))
    const backend = new ApiBackend({
      baseUrl: 'http://api.test/api/v1',
      fetch: fetchMock,
      storage,
    })

    await expect(backend.bookings.create({
      barber_id: 'barber-1',
      service_id: 'service-1',
      starts_at: '2026-08-01T10:00:00.000Z',
    })).resolves.toEqual({ id: 'cmd-1', status: 'requested' })

    await expect(backend.bookings.markCustomerNoShow('cmd-1', { expected_version: 1 }))
      .resolves.toEqual({ id: 'cmd-1', status: 'customer_no_show' })
  })

  it('loads a strict public shop detail without authentication', async () => {
    const shopId = crypto.randomUUID()
    const serviceId = crypto.randomUUID()
    const mediaId = crypto.randomUUID()
    const detail = {
      id: shopId,
      name: 'Detailed Public Shop',
      address: '10 Public Street',
      city: 'Manila',
      lat: 14.5995,
      lng: 120.9842,
      rating: 4.7,
      rating_count: 21,
      barber_ids: [],
      status: 'closed',
      available_barber_count: 0,
      description: 'A published neighbourhood shop.',
      public_contact_phone: '+639171234567',
      timezone: 'Asia/Manila',
      booking_mode: 'manual',
      chair_count: 3,
      default_buffer_min: 10,
      operating_hours: [{
        weekday: 1,
        open_time: '09:00',
        close_time: '18:00',
        closed: false,
        block_order: 0,
      }],
      closures: [{
        local_date: '2030-01-08',
        closed: true,
        replacement_open_time: null,
        replacement_close_time: null,
      }],
      services: [{
        id: serviceId,
        shop_id: shopId,
        name: 'Classic cut',
        duration_min: 30,
        price_cents: 35000,
      }],
      media: [{
        id: mediaId,
        role: 'storefront',
        sort_order: 0,
        alt_text: 'Shop entrance',
        url: 'http://127.0.0.1:54321/storage/v1/object/sign/shop-media/example',
      }],
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ data: detail }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage: memoryStorage() })

    await expect(backend.shops.get(shopId)).resolves.toEqual(detail)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`http://api.test/api/v1/catalog/shops/${shopId}`)
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false)
  })

  it('rejects private fields smuggled into a public shop detail', async () => {
    const shopId = crypto.randomUUID()
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ data: {
      id: shopId,
      name: 'Unsafe detail',
      address: '11 Public Street',
      city: 'Manila',
      lat: 14.5995,
      lng: 120.9842,
      rating: 0,
      rating_count: 0,
      barber_ids: [],
      status: 'closed',
      available_barber_count: 0,
      description: null,
      public_contact_phone: null,
      timezone: 'Asia/Manila',
      booking_mode: 'manual',
      chair_count: 1,
      default_buffer_min: 0,
      operating_hours: [],
      closures: [],
      services: [],
      media: [],
      owner_id: crypto.randomUUID(),
    } }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage: memoryStorage() })

    await expect(backend.shops.get(shopId)).rejects.toThrow()
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

  it('keeps shop-photo storage behind the owner backend upload workflow', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const shopId = crypto.randomUUID()
    const mediaId = crypto.randomUUID()
    const pendingMedia = {
      id: mediaId,
      shop_id: shopId,
      role: 'storefront' as const,
      sort_order: 0,
      alt_text: 'Front entrance',
      upload_status: 'awaiting_upload' as const,
      moderation_status: 'pending' as const,
      preview_url: null,
      created_at: '2026-07-26T00:00:00.000Z',
      updated_at: '2026-07-26T00:00:00.000Z',
    }
    const readyMedia = {
      ...pendingMedia,
      upload_status: 'ready' as const,
      preview_url: 'https://storage.test/signed-preview',
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: {
        media: pendingMedia,
        upload_url: 'https://storage.test/signed-upload',
        headers: { 'x-upsert': 'false' },
        expires_at: '2026-07-26T02:00:00.000Z',
      } }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ data: readyMedia }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })
    const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })

    await expect(backend.ownerShop.uploadMedia({
      filename: 'front.jpg',
      declared_mime: 'image/jpeg',
      declared_size_bytes: file.size,
      role: 'storefront',
      alt_text: 'Front entrance',
    }, file)).resolves.toEqual(readyMedia)

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.test/api/v1/owner/shop/media/request-upload',
      'https://storage.test/signed-upload',
      `http://api.test/api/v1/owner/shop/media/${mediaId}/complete`,
    ])
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PUT')
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-upsert')).toBe('false')
  })

  it('keeps owner hiring reads and versioned writes behind the canonical routes', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const shopId = crypto.randomUUID()
    const before = {
      shop_id: shopId,
      status: 'off' as const,
      is_hiring: false,
      open_positions: null,
      note: null,
      shop_version: 3,
      updated_at: '2026-07-27T00:00:00.000Z',
    }
    const after = {
      ...before,
      status: 'open' as const,
      is_hiring: true,
      open_positions: 2,
      note: 'Weekend barbers welcome.',
      shop_version: 4,
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: before }))
      .mockResolvedValueOnce(json({ data: after }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await expect(backend.ownerShop.getHiring()).resolves.toEqual(before)
    await expect(backend.ownerShop.updateHiring({
      expected_version: 3,
      status: 'open',
      open_positions: 2,
      note: 'Weekend barbers welcome.',
    })).resolves.toEqual(after)

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.test/api/v1/owner/shop/hiring',
      'http://api.test/api/v1/owner/shop/hiring',
    ])
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PATCH')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      expected_version: 3,
      status: 'open',
      open_positions: 2,
      note: 'Weekend barbers welcome.',
    })
  })

  it('uses the converged employment-request and professional-profile routes', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const shopId = crypto.randomUUID()
    const requestId = crypto.randomUUID()
    const commandId = crypto.randomUUID()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { id: requestId } }, 201))
      .mockResolvedValueOnce(json({ data: { request: { id: requestId } } }))
      .mockResolvedValueOnce(json({ data: { barber_id: profile.id, visible: true } }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await backend.employment.createRequest({
      direction: 'barber_application',
      shop_id: shopId,
      message: 'Available weekends.',
      idempotency_key: commandId,
    })
    await backend.employment.acceptRequest(requestId, { expected_version: 2 })
    await backend.employment.updateJobProfile({
      visible: true,
      bio: 'Four years behind the chair.',
      experience_years: 4,
      specialties: ['Fades'],
      portfolio_media: ['https://portfolio.test/fades'],
      coarse_work_area: 'Manila',
      schedule_preference: 'Weekends',
    })

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.test/api/v1/employment/requests',
      `http://api.test/api/v1/employment/requests/${requestId}/accept`,
      'http://api.test/api/v1/barber/job-profile',
    ])
    expect(fetchMock.mock.calls.map(([, options]) => options?.method)).toEqual(['POST', 'POST', 'PUT'])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      direction: 'barber_application',
      shop_id: shopId,
      idempotency_key: commandId,
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ expected_version: 2 })
  })

  it('keeps provider capabilities and qualification requests behind one typed service', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const providerId = crypto.randomUUID()
    const serviceId = crypto.randomUUID()
    const requestId = crypto.randomUUID()
    const commandId = crypto.randomUUID()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: { shop_id: crypto.randomUUID(), providers: [] } }))
      .mockResolvedValueOnce(json({ data: { owner_id: profile.id, active: true } }))
      .mockResolvedValueOnce(json({ data: { provider_user_id: providerId, qualified_service_ids: [serviceId] } }))
      .mockResolvedValueOnce(json({ data: { shop_id: crypto.randomUUID(), services: [] } }))
      .mockResolvedValueOnce(json({ data: { id: requestId, status: 'pending' } }, 201))
      .mockResolvedValueOnce(json({ data: { id: requestId, status: 'approved' } }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await backend.qualifications.getOwnerWorkspace()
    await backend.qualifications.updateOwnerCapability({
      expected_version: 0,
      active: true,
      accepting_bookings: true,
      reason: 'Owner is ready to provide services.',
      command_id: commandId,
    })
    await backend.qualifications.setProviderQualifications({
      provider_user_id: providerId,
      expected_version: 1,
      service_ids: [serviceId],
      reason: 'Training verified by owner.',
      command_id: crypto.randomUUID(),
    })
    await backend.qualifications.getMine()
    await backend.qualifications.request({
      service_id: serviceId,
      idempotency_key: crypto.randomUUID(),
    })
    await backend.qualifications.resolveRequest(requestId, 'approve', {
      expected_version: 1,
      reason: 'Owner approved after review.',
    })

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.test/api/v1/owner/service-qualifications',
      'http://api.test/api/v1/owner/provider-capability',
      'http://api.test/api/v1/owner/service-qualifications',
      'http://api.test/api/v1/barber/service-qualifications',
      'http://api.test/api/v1/barber/service-qualification-requests',
      `http://api.test/api/v1/owner/service-qualification-requests/${requestId}/approve`,
    ])
    expect(fetchMock.mock.calls.map(([, options]) => options?.method ?? 'GET'))
      .toEqual(['GET', 'PATCH', 'PUT', 'GET', 'POST', 'POST'])
  })

  it('uses only the canonical versioned owner schedule routes', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const barberId = crypto.randomUUID()
    const exceptionId = crypto.randomUUID()
    const rule = {
      id: crypto.randomUUID(),
      barber_id: barberId,
      weekday: 1 as const,
      start_time: '08:00:00',
      end_time: '16:00:00',
      created_at: '2026-07-28T00:00:00.000Z',
    }
    const exception = {
      id: exceptionId,
      barber_id: barberId,
      date: '2035-02-13',
      is_available: false,
      start_time: null,
      end_time: null,
      reason: 'Owner-authored.',
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: {
        employment_id: crypto.randomUUID(),
        barber_id: barberId,
        schedule_version: 1,
        patterns: [rule],
        exceptions: [],
      } }))
      .mockResolvedValueOnce(json({ data: { schedule_version: 2, patterns: [rule] } }))
      .mockResolvedValueOnce(json({ data: { schedule_version: 3, exception } }, 201))
      .mockResolvedValueOnce(json({ data: { schedule_version: 4, removed_id: exceptionId } }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await expect(backend.employment.getStaffSchedule(barberId)).resolves.toMatchObject({
      schedule_version: 1,
      patterns: [{ start_time: '08:00', end_time: '16:00' }],
    })
    await backend.employment.replaceStaffShifts(barberId, {
      expected_version: 1,
      blocks: [{ weekday: 1, start_time: '08:00', end_time: '16:00' }],
    })
    await backend.employment.upsertStaffShiftException(barberId, {
      expected_version: 2,
      date: exception.date,
      is_available: false,
      reason: exception.reason,
    })
    await backend.employment.removeStaffShiftException(exceptionId, { expected_version: 3 })

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `http://api.test/api/v1/owner/staff/${barberId}/shifts`,
      `http://api.test/api/v1/owner/staff/${barberId}/shifts`,
      `http://api.test/api/v1/owner/staff/${barberId}/shifts/exceptions`,
      `http://api.test/api/v1/owner/staff/shifts/exceptions/${exceptionId}`,
    ])
    expect(fetchMock.mock.calls.map(([, options]) => options?.method ?? 'GET'))
      .toEqual(['GET', 'PUT', 'POST', 'DELETE'])
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
