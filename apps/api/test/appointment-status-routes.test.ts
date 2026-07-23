import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { Profile } from '@barbershop/shared'
import { createApp } from '../src/app'
import type { ApiDependencies } from '../src/lib/supabase'

interface FakeQueryResult {
  data: unknown
  error: null
}

interface FakeQueryLog {
  inFilters: Array<{ column: string; values: readonly unknown[] }>
}

interface FakeQueryBuilder extends PromiseLike<FakeQueryResult> {
  select: (...args: unknown[]) => FakeQueryBuilder
  eq: (...args: unknown[]) => FakeQueryBuilder
  is: (...args: unknown[]) => FakeQueryBuilder
  in: (column: string, values: readonly unknown[]) => FakeQueryBuilder
  gte: (...args: unknown[]) => FakeQueryBuilder
  lt: (...args: unknown[]) => FakeQueryBuilder
  lte: (...args: unknown[]) => FakeQueryBuilder
  limit: (...args: unknown[]) => FakeQueryBuilder
  order: (...args: unknown[]) => FakeQueryBuilder
  maybeSingle: () => Promise<FakeQueryResult>
}

function fakeQuery(data: unknown, log?: FakeQueryLog): FakeQueryBuilder {
  const result: FakeQueryResult = { data, error: null }
  const builder = {} as FakeQueryBuilder
  builder.select = () => builder
  builder.eq = () => builder
  builder.is = () => builder
  builder.in = (column, values) => {
    log?.inFilters.push({ column, values })
    return builder
  }
  builder.gte = () => builder
  builder.lt = () => builder
  builder.lte = () => builder
  builder.limit = () => builder
  builder.order = () => builder
  builder.maybeSingle = async () => result
  builder.then = (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected)
  return builder
}

function authenticatedDependencies(
  profile: Profile,
  tables: Record<string, FakeQueryBuilder>,
  rpcRows: Record<string, unknown> = {},
): ApiDependencies {
  return {
    auth: {
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: profile.id, aal: 'aal1' } },
          error: null,
        }),
        getUser: async () => ({ data: { user: { id: profile.id } }, error: null }),
      },
    } as unknown as ApiDependencies['auth'],
    database: {
      rpc: async (name: string) => ({ data: rpcRows[name] ?? null, error: null }),
      from: (table: string) => {
        const query = tables[table]
        if (!query) throw new Error(`Unexpected table: ${table}`)
        return query
      },
    } as unknown as ApiDependencies['database'],
  }
}

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: crypto.randomUUID(),
    role: 'customer',
    requested_role: 'customer',
    verification_status: 'not_required',
    authorization_version: 1,
    onboarding_completed: true,
    full_name: 'Status Test User',
    email: 'status-test@example.test',
    phone: null,
    location: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('canonical appointment status routes', () => {
  it('filters availability with every capacity-blocking lifecycle state', async () => {
    const barberId = crypto.randomUUID()
    const serviceId = crypto.randomUUID()
    const shopId = crypto.randomUUID()
    const employmentId = crypto.randomUUID()
    const date = '2099-01-05'
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    const appointmentLog: FakeQueryLog = { inFilters: [] }
    const appointmentQuery = fakeQuery([
      {
        starts_at: new Date(`${date}T09:00:00+08:00`).toISOString(),
        ends_at: new Date(`${date}T09:30:00+08:00`).toISOString(),
      },
    ], appointmentLog)
    const account = profile({ id: barberId })
    const dependencies = authenticatedDependencies(account, {
      users: fakeQuery([{ id: barberId, full_name: 'Slot Barber', avatar_url: null }]),
      shops: fakeQuery([{ id: shopId, name: 'Slot Shop', address: '1 Test Street', city: 'Manila', lat: 14.6, lng: 120.98, rating: 0, rating_count: 0 }]),
      services: fakeQuery({ shop_id: shopId, duration_min: 30, active: true }),
      barber_employment: fakeQuery([{ id: employmentId, shop_id: shopId, barber_id: barberId, hired_at: '2090-01-01' }]),
      barbers: fakeQuery([{ id: barberId, bio: null, rating: 0, rating_count: 0, shift_status: 'off', accepting_bookings: true }]),
      shift_exceptions: fakeQuery([]),
      shift_patterns: fakeQuery([{ employment_id: employmentId, weekday, start_time: '09:00', end_time: '10:00' }]),
      appointments: appointmentQuery,
    }, { api_catalogue_shop_ids: [{ shop_id: shopId }] })

    const response = await request(createApp(dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get('/api/v1/catalog/availability/slots')
      .query({ barberId, serviceId, date })

    expect(response.status).toBe(200)
    expect(appointmentLog.inFilters).toEqual([{
      column: 'status',
      values: [
        'requested',
        'confirmed',
        'checked_in',
        'in_progress',
        'awaiting_confirmation',
      ],
    }])
    expect(response.body.data).toEqual([{
      starts_at: new Date(`${date}T09:30:00+08:00`).toISOString(),
      ends_at: new Date(`${date}T10:00:00+08:00`).toISOString(),
    }])
  })

  it('reports canonical customer no-shows without attributing them as barber no-shows', async () => {
    const owner = profile({
      role: 'shop_owner',
      requested_role: 'shop_owner',
      verification_status: 'verified',
    })
    const shopId = crypto.randomUUID()
    const barberId = crypto.randomUUID()
    const dependencies = authenticatedDependencies(owner, {
      users: fakeQuery(owner),
      shops: fakeQuery({ id: shopId, owner_id: owner.id }),
      barber_employment: fakeQuery([{ barber_id: barberId }]),
      barbers: fakeQuery([{
        id: barberId,
        rating: 4.5,
        rating_count: 2,
        profile: { id: barberId, full_name: 'Canonical Barber', avatar_url: null },
      }]),
      appointments: fakeQuery([
        { barber_id: barberId, status: 'completed' },
        { barber_id: barberId, status: 'completed' },
        { barber_id: barberId, status: 'customer_no_show' },
        { barber_id: barberId, status: 'cancelled' },
        { barber_id: barberId, status: 'no_show' },
      ]),
    })

    const response = await request(createApp(dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get(`/api/v1/shops/${shopId}/barbers/performance`)
      .set('Authorization', 'Bearer status-test-token')

    expect(response.status).toBe(200)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({
      completed_cuts: 2,
      customer_no_show_count: 1,
      customer_no_show_rate: 1 / 3,
    })
    expect(response.body.data[0]).not.toHaveProperty('no_show_count')
    expect(response.body.data[0]).not.toHaveProperty('no_show_rate')
  })
})
