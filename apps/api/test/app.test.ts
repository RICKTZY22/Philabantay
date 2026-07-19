import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { ApiDependencies } from '../src/lib/supabase'
import { createApp } from '../src/app'

function dependencies(overrides?: Partial<ApiDependencies>): ApiDependencies {
  return {
    auth: {
      auth: {
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

function pendingOwnerDependencies(): { dependencies: ApiDependencies; signOut: ReturnType<typeof vi.fn> } {
  const profile = {
    id: crypto.randomUUID(),
    role: 'customer',
    requested_role: 'shop_owner',
    verification_status: 'pending',
    onboarding_completed: true,
    full_name: 'Pending Owner',
    email: 'pending-owner@example.test',
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
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: ownerId } }, error: null }),
    },
  }
  return {
    dependencies: { auth, database } as unknown as ApiDependencies,
    appointmentId,
    transitionAppointment,
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
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
    const deps = dependencies({ auth: { auth: { getUser } } as unknown as ApiDependencies['auth'] })
    const response = await request(createApp(deps, { webOrigin: 'http://127.0.0.1:5174' }))
      .get('/api/v1/shops')
      .set('Authorization', `Bearer ${invalidToken}`)
    expect(getUser).toHaveBeenCalledWith(invalidToken)
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
    const pending = pendingOwnerDependencies()
    const app = createApp(pending.dependencies, { webOrigin: 'http://127.0.0.1:5174' })
    const authorization = `Bearer ${crypto.randomUUID()}`

    const blockedSettings = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', authorization)
      .send({ full_name: 'Changed while pending' })
    expect(blockedSettings.status).toBe(403)
    expect(blockedSettings.body).toEqual({
      error: { code: 'forbidden', message: 'This owner account is locked until verification is approved.' },
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
})
