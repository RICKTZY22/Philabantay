import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { Profile } from '@barbershop/shared'
import type { ApiDependencies } from '../src/lib/supabase'
import { createApp } from '../src/app'

function dependencies(overrides?: Partial<ApiDependencies>): ApiDependencies {
  return {
    auth: {
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: null, error: { message: 'invalid' } }),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        refreshSession: vi.fn(),
      },
    } as unknown as ApiDependencies['auth'],
    database: {} as ApiDependencies['database'],
    ...overrides,
  }
}

function lockedProfessionalDependencies(
  requestedRole: 'barber' | 'shop_owner' = 'shop_owner',
  verificationStatus: Profile['verification_status'] = 'pending',
): { dependencies: ApiDependencies; signOut: ReturnType<typeof vi.fn> } {
  const profile: Profile = {
    id: crypto.randomUUID(),
    role: verificationStatus === 'suspended' ? requestedRole : 'customer',
    requested_role: requestedRole,
    verification_status: verificationStatus,
    authorization_version: 1,
    onboarding_completed: true,
    full_name: 'Locked Professional',
    email: `locked-${requestedRole}-${verificationStatus}@example.test`,
    phone: null,
    location: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
  }
  const signOut = vi.fn().mockResolvedValue({ error: null })
  const database = {
    auth: { admin: { signOut } },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
        }),
      }),
    }),
  }
  const auth = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: profile.id, aal: 'aal1' } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: profile.id } }, error: null }),
    },
  }
  return {
    dependencies: { auth, database } as unknown as ApiDependencies,
    signOut,
  }
}

function ownerBookingDependencies(ownsShop: boolean): {
  dependencies: ApiDependencies
  appointmentId: string
  transitionAppointment: ReturnType<typeof vi.fn>
} {
  const ownerId = crypto.randomUUID()
  const appointmentId = crypto.randomUUID()
  const shopId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const profile = {
    id: ownerId,
    role: 'shop_owner',
    requested_role: 'shop_owner',
    verification_status: 'verified',
    authorization_version: 1,
    onboarding_completed: true,
    full_name: 'Verified Owner',
    email: 'verified-owner@example.test',
    phone: null,
    location: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
  }
  const appointment = {
    id: appointmentId,
    customer_id: crypto.randomUUID(),
    barber_id: barberId,
    shop_id: shopId,
    service_id: crypto.randomUUID(),
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 90_000_000).toISOString(),
    status: 'requested',
    version: 1,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const profileBuilder: Record<string, unknown> = {}
  profileBuilder.eq = vi.fn().mockReturnValue(profileBuilder)
  profileBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null })

  const appointmentLookupBuilder: Record<string, unknown> = {}
  appointmentLookupBuilder.eq = vi.fn().mockReturnValue(appointmentLookupBuilder)
  appointmentLookupBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: appointment, error: null })

  const shopBuilder: Record<string, unknown> = {}
  shopBuilder.eq = vi.fn().mockReturnValue(shopBuilder)
  shopBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: ownsShop ? { id: shopId, owner_id: ownerId } : null, error: null })

  const transitionAppointment = vi.fn().mockResolvedValue({
    data: { ...appointment, status: 'confirmed', version: 1 },
    error: null,
  })

  const database = {
    from: vi.fn((table: string) => {
      if (table === 'users') return { select: vi.fn().mockReturnValue(profileBuilder) }
      if (table === 'shops') return { select: vi.fn().mockReturnValue(shopBuilder) }
      if (table === 'appointments') {
        return {
          select: vi.fn().mockReturnValue(appointmentLookupBuilder),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
    rpc: transitionAppointment,
  }
  const auth = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: ownerId, aal: 'aal1' } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: ownerId } }, error: null }),
    },
  }
  return {
    dependencies: { auth, database } as unknown as ApiDependencies,
    appointmentId,
    transitionAppointment,
  }
}

function customerCreateBookingDependencies(profileOverrides: Partial<Profile> = {}): {
  dependencies: ApiDependencies
  profileId: string
  barberId: string
  serviceId: string
  shopId: string
  startsAt: string
  createAppointment: ReturnType<typeof vi.fn>
} {
  const profileId = crypto.randomUUID()
  const barberId = crypto.randomUUID()
  const serviceId = crypto.randomUUID()
  const shopId = crypto.randomUUID()
  const startsAt = new Date(Date.now() + 86_400_000).toISOString()
  const profile: Profile = {
    id: profileId,
    role: 'customer',
    requested_role: 'customer',
    verification_status: 'not_required',
    authorization_version: 1,
    onboarding_completed: true,
    full_name: 'Booking Customer',
    email: 'booking-customer@example.test',
    phone: null,
    location: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    ...profileOverrides,
  }
  const appointment = {
    id: crypto.randomUUID(),
    customer_id: profileId,
    barber_id: barberId,
    shop_id: shopId,
    service_id: serviceId,
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
    status: 'requested',
    version: 1,
    notes: 'Low fade.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    check_in_code_hash: '$2a$06$must-never-leave-the-api-boundary',
  }

  const profileBuilder: Record<string, unknown> = {}
  profileBuilder.eq = vi.fn().mockReturnValue(profileBuilder)
  profileBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null })
  const serviceBuilder: Record<string, unknown> = {}
  serviceBuilder.eq = vi.fn().mockReturnValue(serviceBuilder)
  serviceBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: { shop_id: shopId }, error: null })
  const shopBuilder: Record<string, unknown> = {}
  shopBuilder.eq = vi.fn().mockReturnValue(shopBuilder)
  shopBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: { booking_mode: 'instant', timezone: 'Asia/Manila' }, error: null })
  const createAppointment = vi.fn().mockResolvedValue({ data: appointment, error: null })
  const database = {
    from: vi.fn((table: string) => {
      if (table === 'users') return { select: vi.fn().mockReturnValue(profileBuilder) }
      if (table === 'services') return { select: vi.fn().mockReturnValue(serviceBuilder) }
      if (table === 'shops') return { select: vi.fn().mockReturnValue(shopBuilder) }
      throw new Error(`Unexpected direct table access: ${table}`)
    }),
    rpc: createAppointment,
  }
  const auth = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: profileId, aal: 'aal1' } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: profileId } }, error: null }),
    },
  }
  return {
    dependencies: { auth, database } as unknown as ApiDependencies,
    profileId,
    barberId,
    serviceId,
    shopId,
    startsAt,
    createAppointment,
  }
}

describe('Express API boundary', () => {
  it('serves an unauthenticated health check', async () => {
    const response = await request(createApp(dependencies(), { webOrigin: 'http://127.0.0.1:5174' })).get('/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { status: 'ok' } })
  })

  it('rejects protected routes without a bearer token', async () => {
    const response = await request(createApp(dependencies(), { webOrigin: 'http://127.0.0.1:5174' })).get('/api/v1/shops')
    expect(response.status).toBe(401)
    expect(response.body).toEqual({
      error: { code: 'not_authenticated', message: 'A bearer token is required.' },
    })
  })

  it('verifies bearer tokens with Supabase Auth', async () => {
    const invalidToken = crypto.randomUUID()
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: { message: 'invalid' } })
    const getUser = vi.fn()
    const deps = dependencies({ auth: { auth: { getClaims, getUser } } as unknown as ApiDependencies['auth'] })
    const response = await request(createApp(deps, { webOrigin: 'http://127.0.0.1:5174' }))
      .get('/api/v1/shops')
      .set('Authorization', `Bearer ${invalidToken}`)
    expect(getClaims).toHaveBeenCalledWith(invalidToken)
    expect(getUser).not.toHaveBeenCalled()
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('not_authenticated')
  })

  it('rejects unknown and malformed sign-in fields before calling Auth', async () => {
    const signInWithPassword = vi.fn()
    const deps = dependencies({ auth: { auth: { signInWithPassword } } as unknown as ApiDependencies['auth'] })
    const response = await request(createApp(deps, { webOrigin: 'http://127.0.0.1:5174' }))
      .post('/api/v1/auth/signin')
      .send({ email: 'not-an-email', password: '', role: 'admin' })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('validation')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('returns the consistent error shape for invalid JSON', async () => {
    const response = await request(createApp(dependencies(), { webOrigin: 'http://127.0.0.1:5174' }))
      .post('/api/v1/auth/signin')
      .set('Content-Type', 'application/json')
      .send('{bad json')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: { code: 'invalid_json', message: 'Request body contains invalid JSON.' },
    })
  })

  it('locks pending owner operations while keeping session restore and sign-out available', async () => {
    const pending = lockedProfessionalDependencies()
    const app = createApp(pending.dependencies, { webOrigin: 'http://127.0.0.1:5174' })
    const authorization = `Bearer ${crypto.randomUUID()}`

    const blockedSettings = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', authorization)
      .send({ full_name: 'Changed while pending' })
    expect(blockedSettings.status).toBe(403)
    expect(blockedSettings.body).toEqual({
      error: { code: 'verification_locked', message: 'Professional operations are unavailable for this account.' },
    })

    const blockedApp = await request(app)
      .get('/api/v1/shops')
      .set('Authorization', authorization)
    expect(blockedApp.status).toBe(403)

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authorization)
    expect(me.status).toBe(200)
    expect(me.body.data.verification_status).toBe('pending')

    const signedOut = await request(app)
      .post('/api/v1/auth/signout')
      .set('Authorization', authorization)
    expect(signedOut.status).toBe(204)
    expect(pending.signOut).toHaveBeenCalledOnce()
  })

  it.each([
    ['barber', 'pending'],
    ['barber', 'rejected'],
    ['barber', 'suspended'],
    ['shop_owner', 'rejected'],
    ['shop_owner', 'suspended'],
  ] satisfies Array<['barber' | 'shop_owner', Profile['verification_status']]>)(
    'blocks a %s request in the %s state before any application route runs',
    async (requestedRole, status) => {
      const locked = lockedProfessionalDependencies(requestedRole, status)
      const response = await request(createApp(locked.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
        .get('/api/v1/shops')
        .set('Authorization', `Bearer ${crypto.randomUUID()}`)

      expect(response.status).toBe(403)
      expect(response.body).toEqual({
        error: { code: 'verification_locked', message: 'Professional operations are unavailable for this account.' },
      })
      expect(locked.dependencies.database.from).toHaveBeenCalledTimes(1)
      expect(locked.dependencies.database.from).toHaveBeenCalledWith('users')
    },
  )

  it('lets an owner accept only a reservation from their own shop', async () => {
    const owned = ownerBookingDependencies(true)
    const authorization = `Bearer ${crypto.randomUUID()}`
    const accepted = await request(createApp(owned.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .post(`/api/v1/bookings/${owned.appointmentId}/accept`)
      .set('Authorization', authorization)
      .send({ expected_version: 1 })
    expect(accepted.status).toBe(200)
    expect(accepted.body.data.status).toBe('confirmed')
    expect(owned.transitionAppointment).toHaveBeenCalledWith('api_transition_appointment', {
      p_appointment_id: owned.appointmentId,
      p_expected_version: 1,
      p_action: 'accept',
      p_actor_id: expect.any(String),
      p_reason: null,
      p_check_in_code: null,
    })

    const foreign = ownerBookingDependencies(false)
    const denied = await request(createApp(foreign.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .post(`/api/v1/bookings/${foreign.appointmentId}/accept`)
      .set('Authorization', authorization)
      .send({ expected_version: 1 })
    expect(denied.status).toBe(403)
    expect(foreign.transitionAppointment).not.toHaveBeenCalled()
  })

  it('creates bookings only through the transactional database command', async () => {
    const fixture = customerCreateBookingDependencies()
    const idempotencyKey = crypto.randomUUID()
    const response = await request(createApp(fixture.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${crypto.randomUUID()}`)
      .send({
        barber_id: fixture.barberId,
        service_id: fixture.serviceId,
        starts_at: fixture.startsAt,
        notes: 'Low fade.',
        idempotency_key: idempotencyKey,
      })

    expect(response.status).toBe(201)
    expect(response.body.data).toMatchObject({
      customer_id: fixture.profileId,
      barber_id: fixture.barberId,
      service_id: fixture.serviceId,
      status: 'requested',
    })
    expect(response.body.data).not.toHaveProperty('check_in_code_hash')
    expect(fixture.createAppointment).toHaveBeenCalledWith('api_create_booking', {
      p_customer_id: fixture.profileId,
      p_barber_id: fixture.barberId,
      p_service_id: fixture.serviceId,
      p_starts_at: fixture.startsAt,
      p_notes: 'Low fade.',
      // P2-07 assignment intent. Naming a barber without a preference is `exact`,
      // which is the pre-P2-07 behaviour, and the request is recorded so a later
      // owner substitution can still show who the customer asked for.
      p_barber_preference: 'exact',
      p_requested_barber_id: fixture.barberId,
      p_assignment_source: 'customer',
      p_assignment_reason: null,
      p_idempotency_key: idempotencyKey,
    })
  })

  it('rejects a pending professional account before the booking command runs', async () => {
    const fixture = customerCreateBookingDependencies({
      requested_role: 'barber',
      verification_status: 'pending',
    })
    const response = await request(createApp(fixture.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${crypto.randomUUID()}`)
      .send({
        barber_id: fixture.barberId,
        service_id: fixture.serviceId,
        starts_at: fixture.startsAt,
        idempotency_key: crypto.randomUUID(),
      })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('verification_locked')
    expect(fixture.createAppointment).not.toHaveBeenCalled()
  })

  it('quotes the effective booking mode and returns the submitted idempotency key', async () => {
    const fixture = customerCreateBookingDependencies()
    const idempotencyKey = crypto.randomUUID()
    fixture.createAppointment.mockResolvedValueOnce({
      data: [{
        bookable: true,
        reason: null,
        provider_user_id: fixture.barberId,
        requested_barber_id: fixture.barberId,
        substituted: false,
        service_name: 'Classic cut',
        duration_min: 30,
        price_cents: 35000,
        buffer_min: 10,
        starts_at: fixture.startsAt,
        ends_at: new Date(Date.parse(fixture.startsAt) + 30 * 60_000).toISOString(),
      }],
      error: null,
    })

    const response = await request(createApp(fixture.dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .post('/api/v1/bookings/quote')
      .set('Authorization', `Bearer ${crypto.randomUUID()}`)
      .send({
        barber_id: fixture.barberId,
        service_id: fixture.serviceId,
        starts_at: fixture.startsAt,
        barber_preference: 'exact',
        idempotency_key: idempotencyKey,
      })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      bookable: true,
      booking_mode: 'instant',
      effective_mode: 'instant',
      request_expires_at: null,
      timezone: 'Asia/Manila',
      cancellation_cutoff_minutes: 120,
      idempotency_key: idempotencyKey,
    })
  })
})
