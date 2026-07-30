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
  // P2-07 moved slot computation out of Express and into the availability
  // engine, so this route no longer reads the appointments table itself and there
  // is no status filter here to assert. The capacity-blocking status list is now
  // enforced inside private.require_provider_gap and
  // private.require_chair_capacity, and is covered against a real database by the
  // integration matrix rather than against a fake query builder — which is the
  // stronger check, since the old assertion could pass while the SQL disagreed.
  it('serves the availability engine slots for the legacy per-barber route', async () => {
    const barberId = crypto.randomUUID()
    const serviceId = crypto.randomUUID()
    const shopId = crypto.randomUUID()
    const date = '2099-01-05'
    const engineSlots = [
      {
        provider_user_id: barberId,
        starts_at: new Date(`${date}T09:30:00+08:00`).toISOString(),
        ends_at: new Date(`${date}T10:00:00+08:00`).toISOString(),
        buffer_min: 0,
      },
    ]
    const account = profile({ id: barberId })
    const dependencies = authenticatedDependencies(account, {
      services: fakeQuery({ id: serviceId, shop_id: shopId }),
    }, { api_availability_slots: engineSlots })

    const response = await request(createApp(dependencies, { webOrigin: 'http://127.0.0.1:5174' }))
      .get('/api/v1/catalog/availability/slots')
      .query({ barberId, serviceId, date })

    expect(response.status).toBe(200)
    // The legacy shape stays a bare start/end pair; the provider and buffer the
    // engine reports are only exposed through the richer /availability contract.
    expect(response.body.data).toEqual([{
      starts_at: engineSlots[0].starts_at,
      ends_at: engineSlots[0].ends_at,
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
