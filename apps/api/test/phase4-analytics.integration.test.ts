import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

const runLocal = process.env.RUN_LOCAL_SUPABASE_TESTS === '1'
const localDescribe = runLocal ? describe : describe.skip

interface Actor {
  client: SupabaseClient
  id: string
  token: string
  email: string
}

function required(...names: string[]): string {
  const value = names.map((name) => process.env[name]).find(Boolean)
  if (!value) throw new Error(`${names.join(' or ')} is required for the Phase 4 analytics tests.`)
  return value
}

/**
 * Contract section 10 forbids "revenue" as a *label*: a field name, a metric key,
 * or a heading. It does not forbid a definition string that explains the ban, so
 * this walks keys rather than blanket-matching the serialized payload.
 */
function revenueLabels(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => revenueLabels(item, `${path}[${index}]`))
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(/revenue/i.test(key) ? [`${path}.${key}`] : []),
    ...revenueLabels(child, `${path}.${key}`),
  ])
}

localDescribe('Phase 4 analytics: reproducible figures with correct labels', () => {
  let service: SupabaseClient
  let app: ReturnType<typeof createApp>
  let customer: Actor
  let secondCustomer: Actor
  let barber: Actor
  let owner: Actor
  let otherOwner: Actor
  let shopId: string
  let serviceId: string

  const password = `Analytics!${crypto.randomUUID()}`
  const namespace = crypto.randomUUID()
  // A fixed window well away from "today" so the fixture cannot drift into or out
  // of range as the suite runs.
  const rangeFrom = '2030-04-01'
  const rangeTo = '2030-04-30'
  const priceCents = 45_000

  async function createActor(label: string): Promise<Actor> {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const email = `${slug}-${namespace}@analytics.test`
    const { data, error } = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: label },
    })
    if (error || !data.user) throw error ?? new Error(`Could not create ${label}.`)
    const client = createClient(
      required('LOCAL_SUPABASE_URL', 'SUPABASE_URL'),
      required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    )
    const signedIn = await client.auth.signInWithPassword({ email, password })
    if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error(`Could not sign in ${label}.`)
    return { client, id: data.user.id, token: signedIn.data.session.access_token, email }
  }

  async function bookAt(customerId: string, startsAt: string): Promise<{ id: string; version: number }> {
    const created = await service.rpc('api_create_appointment', {
      p_customer_id: customerId,
      p_barber_id: barber.id,
      p_service_id: serviceId,
      p_starts_at: startsAt,
      p_notes: null,
    })
    if (created.error || !created.data) throw created.error ?? new Error('No appointment row.')
    const row = created.data as { id: string; version: number }
    const accepted = await service.rpc('api_transition_appointment', {
      p_appointment_id: row.id,
      p_expected_version: row.version,
      p_action: 'accept',
      p_actor_id: owner.id,
      p_reason: null,
      p_check_in_code: null,
    })
    if (accepted.error) throw accepted.error
    return row
  }

  async function finalize(appointmentId: string, status: string, extra: Record<string, unknown> = {}) {
    const { error } = await service.from('appointments').update({ status, ...extra }).eq('id', appointmentId)
    if (error) throw error
  }

  beforeAll(async () => {
    const url = required('LOCAL_SUPABASE_URL', 'SUPABASE_URL')
    const publishableKey = required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY')
    const secretKey = required('LOCAL_SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const
    service = createClient(url, secretKey, options)
    app = createApp({ auth: createClient(url, publishableKey, options), database: service }, { webOrigin: 'http://127.0.0.1:5174' })

    customer = await createActor('Analytics Customer')
    secondCustomer = await createActor('Analytics Second')
    barber = await createActor('Analytics Barber')
    owner = await createActor('Analytics Owner')
    otherOwner = await createActor('Analytics Foreign Owner')

    const { error: profileError } = await service.from('users').upsert([
      { id: customer.id, email: customer.email, full_name: 'Analytics Customer', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: secondCustomer.id, email: secondCustomer.email, full_name: 'Analytics Second', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: barber.id, email: barber.email, full_name: 'Analytics Barber', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
      { id: owner.id, email: owner.email, full_name: 'Analytics Owner', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
      { id: otherOwner.id, email: otherOwner.email, full_name: 'Analytics Foreign Owner', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
    ])
    if (profileError) throw profileError
    const { error: barberError } = await service.from('barbers').insert({ id: barber.id, bio: 'Analytics fixture.', accepting_bookings: true })
    if (barberError) throw barberError

    const { data: shop, error: shopError } = await service.from('shops').insert({
      owner_id: owner.id,
      name: `P4 Analytics Shop ${namespace.slice(0, 8)}`,
      address: '7 Metric Street', city: 'Manila', lat: 14.6, lng: 121,
      chair_count: 2,
    }).select('*').single()
    if (shopError) throw shopError
    shopId = shop.id

    const { data: created, error: serviceError } = await service.from('services').insert({
      shop_id: shopId, name: 'Metric Cut', duration_min: 30, price_cents: priceCents,
    }).select('*').single()
    if (serviceError) throw serviceError
    serviceId = created.id

    const { data: employment, error: employmentError } = await service.from('barber_employment').insert({
      barber_id: barber.id, shop_id: shopId, status: 'active', hired_at: '2026-01-01',
    }).select('*').single()
    if (employmentError) throw employmentError

    // Exactly one open weekday with a known window, so available minutes are a
    // number the test can state rather than approximate.
    const { error: hoursError } = await service.from('shop_operating_hours').insert(
      [1, 2, 3, 4, 5].map((weekday) => ({ shop_id: shopId, weekday, open_time: '09:00', close_time: '17:00', closed: false })),
    )
    if (hoursError) throw hoursError
    const { error: patternError } = await service.from('shift_patterns').insert(
      [1, 2, 3, 4, 5].map((weekday) => ({
        employment_id: employment.id, barber_id: barber.id, shop_id: shopId,
        weekday, start_time: '09:00', end_time: '17:00',
      })),
    )
    if (patternError) throw patternError

    // P2-07: an unpublished shop refuses every slot, so the fixture has to be
    // bookable before it can generate the facts analytics reads.
    const { error: publishError } = await service.from('shops')
      .update({ lifecycle_status: 'published', published_at: new Date().toISOString() })
      .eq('id', shopId)
    if (publishError) throw publishError

    // April 2030: the 1st is a Monday, so 1-5, 8-12, 15-19, 22-26, 29-30 are
    // weekdays: 22 open days at 480 minutes each.
    const first = await bookAt(customer.id, '2030-04-01T02:00:00.000Z')
    const second = await bookAt(customer.id, '2030-04-02T02:00:00.000Z')
    const third = await bookAt(secondCustomer.id, '2030-04-03T02:00:00.000Z')
    const noShow = await bookAt(secondCustomer.id, '2030-04-04T02:00:00.000Z')
    const cancelled = await bookAt(customer.id, '2030-04-05T02:00:00.000Z')

    const finished = '2030-04-01T02:30:00.000Z'
    await finalize(first.id, 'completed', {
      checked_in_at: '2030-04-01T02:00:00.000Z',
      actual_started_at: '2030-04-01T02:00:00.000Z',
      actual_finished_at: finished,
      completed_at: finished,
    })
    await finalize(second.id, 'completed', {
      checked_in_at: '2030-04-02T02:00:00.000Z',
      actual_started_at: '2030-04-02T02:00:00.000Z',
      actual_finished_at: '2030-04-02T02:40:00.000Z',
      completed_at: '2030-04-02T02:40:00.000Z',
    })
    await finalize(third.id, 'completed', {
      checked_in_at: '2030-04-03T02:00:00.000Z',
      actual_started_at: '2030-04-03T02:00:00.000Z',
      actual_finished_at: '2030-04-03T02:20:00.000Z',
      completed_at: '2030-04-03T02:20:00.000Z',
    })
    await finalize(noShow.id, 'customer_no_show', {
      no_show_marked_at: '2030-04-04T02:20:00.000Z',
      no_show_marked_by: owner.id,
      no_show_reason: 'Customer did not arrive within the window.',
    })
    await finalize(cancelled.id, 'cancelled', {
      cancelled_at: '2030-04-05T01:00:00.000Z',
      cancelled_by: owner.id,
      cancellation_reason: 'Shop closed early for a power outage.',
    })

    // Two collections and one refund, so the ledger figures are all distinct.
    const paid = await service.rpc('api_record_offline_payment', {
      p_appointment_id: first.id,
      p_walk_in_id: null,
      p_actor_id: owner.id,
      p_method: 'cash',
      p_currency: 'PHP',
      p_amount_cents: priceCents,
      p_paid_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
    })
    if (paid.error) throw paid.error
    const secondPaid = await service.rpc('api_record_offline_payment', {
      p_appointment_id: second.id,
      p_walk_in_id: null,
      p_actor_id: owner.id,
      p_method: 'cash',
      p_currency: 'PHP',
      p_amount_cents: priceCents,
      p_paid_at: new Date().toISOString(),
      p_idempotency_key: crypto.randomUUID(),
    })
    if (secondPaid.error) throw secondPaid.error
    const refunded = await service.rpc('api_change_offline_payment', {
      p_payment_id: (secondPaid.data as { id: string }).id,
      p_expected_version: (secondPaid.data as { version: number }).version,
      p_actor_id: owner.id,
      p_action: 'refund',
      p_amount_cents: priceCents,
      p_reason: 'Customer complained and the shop returned the payment.',
    })
    if (refunded.error) throw refunded.error

    const { error: attendanceError } = await service.from('attendance_records').insert([
      { employment_id: employment.id, barber_id: barber.id, shop_id: shopId, date: '2030-04-01', status: 'present', recorded_by: owner.id },
      { employment_id: employment.id, barber_id: barber.id, shop_id: shopId, date: '2030-04-02', status: 'present', recorded_by: owner.id },
      { employment_id: employment.id, barber_id: barber.id, shop_id: shopId, date: '2030-04-03', status: 'absent', recorded_by: owner.id },
    ])
    if (attendanceError) throw attendanceError
  }, 120_000)

  afterAll(async () => {
    // Trap already paid for: a published fixture shop left behind breaks the
    // matrix's global "customer sees exactly these two shops" assertion, which is
    // scoped to the whole database rather than to its own fixtures. Archive ours.
    if (!service || !shopId) return
    await service
      .from('shops')
      .update({ lifecycle_status: 'archived', published_at: null, is_hiring: false })
      .eq('id', shopId)
  })

  async function analytics() {
    const response = await request(app)
      .get(`/api/v1/shops/${shopId}/analytics?range=custom&from=${rangeFrom}&to=${rangeTo}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(response.status).toBe(200)
    return response.body.data
  }

  it('reproduces demand counts from the fixture', async () => {
    const data = await analytics()
    expect(data.demand).toMatchObject({
      completed: 3,
      cancelled: 1,
      customer_no_show: 1,
      requested: 0,
      confirmed: 0,
      declined: 0,
      expired: 0,
      total: 5,
    })
    // Three completions on three separate local dates.
    const completedDays = data.demand.series.filter((point: { completed: number }) => point.completed > 0)
    expect(completedDays).toHaveLength(3)
  })

  it('keeps the five value concepts separate, and never reports revenue', async () => {
    const data = await analytics()
    expect(data.value).toMatchObject({
      // Booked value counts every commitment: 3 completed + 1 no-show + 1 cancelled.
      booked_value_cents: priceCents * 5,
      // Completed service value counts only visits that finished.
      completed_service_value_cents: priceCents * 3,
      completed_visits: 3,
    })
    // Service value is not money, so it is not accompanied by a collection figure
    // here: the payments were received today, not in the April visit window, and
    // the ledger is bucketed by when money changed hands.
    expect(data.value).toMatchObject({ collected_cents: 0, refunded_cents: 0, net_collected_cents: 0 })

    // Contract section 10: no field, metric key, or heading may be called revenue.
    expect(revenueLabels(data)).toEqual([])
    // The definition is allowed to say the word, because saying it is the point.
    expect(data.definitions.completed_service_value_cents).toContain('never called revenue')
  })

  it('reports collected, refunded and net collected from the payment ledger', async () => {
    // `paid_at` cannot be set in the future, so the collection facts live on the
    // day the fixture ran. Asking for the window that contains them proves the
    // three ledger figures are distinct and that a refund does not erase the
    // collection it reverses.
    const today = new Date().toISOString().slice(0, 10)
    const response = await request(app)
      .get(`/api/v1/shops/${shopId}/analytics?range=custom&from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(response.status).toBe(200)
    expect(response.body.data.value).toMatchObject({
      collected_cents: priceCents * 2,
      refunded_cents: priceCents,
      net_collected_cents: priceCents,
    })
    // Three ledger events: two collections and one refund.
    expect(response.body.data.value.payment_event_count).toBe(3)
    // And no visit value in this window, because the visits are in April 2030.
    expect(response.body.data.value.completed_service_value_cents).toBe(0)
    expect(revenueLabels(response.body)).toEqual([])
  })

  it('computes capacity from the roster, not from a guess', async () => {
    const data = await analytics()
    // 22 weekdays in April 2030 at 480 minutes each, one provider.
    expect(data.capacity.available_provider_minutes).toBe(22 * 480)
    // Two chairs over the same open window.
    expect(data.capacity.available_chair_minutes).toBe(22 * 480 * 2)
    // Five visits held a chair: 3 completed, 1 no-show, 1 cancelled. A cancelled
    // visit released its chair, so it is not assigned.
    expect(data.capacity.assigned_minutes).toBe(4 * 30)
    expect(data.capacity.provider_utilization).toBeCloseTo((4 * 30) / (22 * 480), 4)
    expect(data.capacity.rejected_demand).toBe(0)
  })

  it('never lowers barber performance for a customer no-show', async () => {
    const data = await analytics()
    const provider = data.staff.providers.find((row: { provider_id: string }) => row.provider_id === barber.id)
    expect(provider).toBeDefined()
    expect(provider.completed_cuts).toBe(3)
    // The three figures are reported side by side and never blended.
    expect(provider.customer_no_shows).toBe(1)
    expect(provider.shop_caused_failures).toBe(1)
    expect(provider.assigned_service_minutes).toBe(90)
    // Attendance: two present, one absent.
    expect(provider.attendance_present).toBe(2)
    expect(provider.attendance_absent).toBe(1)
    expect(provider.punctuality_rate).toBeCloseTo(2 / 3, 4)

    // The provider's own view agrees, and separates the same way.
    const own = await request(app)
      .get(`/api/v1/provider/performance?range=custom&from=${rangeFrom}&to=${rangeTo}`)
      .set('Authorization', `Bearer ${barber.token}`)
    expect(own.status).toBe(200)
    expect(own.body.data).toMatchObject({
      completed_cuts: 3,
      customer_no_shows: 1,
      shop_cancellations: 1,
      owner_declines: 0,
      assigned_service_minutes: 90,
    })
    expect(own.body.data.definitions.customer_no_shows).toContain('never counted against')
  })

  it('reports customer, service and walk-in sections from the same facts', async () => {
    const data = await analytics()
    expect(data.customers).toMatchObject({ unique_visitors: 2, repeat_visitors: 1 })
    expect(data.customers.repeat_rate).toBeCloseTo(0.5, 4)
    expect(data.customers.top_visitors[0]).toMatchObject({ completed_visits: 2 })

    const topService = data.services.top_services[0]
    expect(topService).toMatchObject({
      completed_count: 3,
      completed_service_value_cents: priceCents * 3,
      booked_duration_min: 30,
    })
    // 30, 40, 20 actual minutes: average 30, and the drift is visible.
    expect(topService.actual_duration_min_avg).toBeCloseTo(30, 1)
    expect(Number(topService.actual_duration_min_stddev)).toBeGreaterThan(0)

    expect(data.walk_ins).toMatchObject({ total: 0, claimed: 0, unclaimed: 0 })
    expect(data.walk_ins.conversion_rate).toBeNull()
  })

  it('ships a definition for every figure a chart can render', async () => {
    const data = await analytics()
    for (const key of [
      'booked_value_cents', 'completed_service_value_cents', 'collected_cents', 'refunded_cents',
      'net_collected_cents', 'available_provider_minutes', 'assigned_minutes', 'provider_utilization',
      'rejected_demand', 'repeat_rate', 'customer_no_shows', 'shop_caused_failures',
      'punctuality_rate', 'distribution', 'conversion_rate',
    ]) {
      expect(typeof data.definitions[key]).toBe('string')
      expect(data.definitions[key].length).toBeGreaterThan(20)
    }
    expect(typeof data.generated_at).toBe('string')
    expect(data.timezone).toBe('Asia/Manila')
  })

  it('refuses a foreign owner and an unbounded range', async () => {
    const foreign = await request(app)
      .get(`/api/v1/shops/${shopId}/analytics?range=month`)
      .set('Authorization', `Bearer ${otherOwner.token}`)
    expect(foreign.status).toBe(403)

    const tooWide = await request(app)
      .get(`/api/v1/shops/${shopId}/analytics?range=custom&from=2020-01-01&to=2030-01-01`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(tooWide.status).toBe(400)

    const backwards = await request(app)
      .get(`/api/v1/shops/${shopId}/analytics?range=custom&from=2030-05-01&to=2030-04-01`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(backwards.status).toBe(400)
  })

  it('refuses a barber reading another provider performance', async () => {
    const response = await request(app)
      .get(`/api/v1/provider/performance?range=month&provider_id=${owner.id}`)
      .set('Authorization', `Bearer ${barber.token}`)
    expect(response.status).toBe(403)
  })

  it('keeps the legacy stats route free of the revenue label', async () => {
    const response = await request(app)
      .get(`/api/v1/shops/${shopId}/stats?range=all`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(response.status).toBe(200)
    // `revenue_cents` and `revenue_is_estimate` used to live here.
    expect(revenueLabels(response.body)).toEqual([])
    expect(response.body.data.completed_service_value_cents).toBe(priceCents * 3)
  })
})
