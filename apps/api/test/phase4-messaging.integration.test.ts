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
  if (!value) throw new Error(`${names.join(' or ')} is required for the Phase 4 messaging tests.`)
  return value
}

localDescribe('Phase 4 messaging: membership, blocking, limits and retention', () => {
  let service: SupabaseClient
  let app: ReturnType<typeof createApp>
  let customer: Actor
  let stranger: Actor
  let barber: Actor
  let secondBarber: Actor
  let owner: Actor
  let shopId: string
  let employmentId: string
  let customerConversationId: string
  let staffConversationId: string

  const password = `Messaging!${crypto.randomUUID()}`
  const namespace = crypto.randomUUID()

  async function createActor(label: string): Promise<Actor> {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const email = `${slug}-${namespace}@messaging.test`
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

  /** Re-issues a token so a profile change is reflected in the JWT claims. */
  async function refresh(actor: Actor): Promise<string> {
    const signedIn = await actor.client.auth.signInWithPassword({ email: actor.email, password })
    if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error('Could not refresh.')
    return signedIn.data.session.access_token
  }

  beforeAll(async () => {
    const url = required('LOCAL_SUPABASE_URL', 'SUPABASE_URL')
    const publishableKey = required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY')
    const secretKey = required('LOCAL_SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const
    service = createClient(url, secretKey, options)
    app = createApp({ auth: createClient(url, publishableKey, options), database: service }, { webOrigin: 'http://127.0.0.1:5174' })

    customer = await createActor('Messaging Customer')
    stranger = await createActor('Messaging Stranger')
    barber = await createActor('Messaging Barber')
    secondBarber = await createActor('Messaging Second Barber')
    owner = await createActor('Messaging Owner')

    const { error: profileError } = await service.from('users').upsert([
      { id: customer.id, email: customer.email, full_name: 'Messaging Customer', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: stranger.id, email: stranger.email, full_name: 'Messaging Stranger', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: barber.id, email: barber.email, full_name: 'Messaging Barber', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
      { id: secondBarber.id, email: secondBarber.email, full_name: 'Messaging Second Barber', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
      { id: owner.id, email: owner.email, full_name: 'Messaging Owner', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
    ])
    if (profileError) throw profileError
    const { error: barberError } = await service.from('barbers').insert([
      { id: barber.id, bio: 'Messaging fixture.', accepting_bookings: true },
      { id: secondBarber.id, bio: 'Messaging second fixture.', accepting_bookings: true },
    ])
    if (barberError) throw barberError

    const { data: shop, error: shopError } = await service.from('shops').insert({
      owner_id: owner.id, name: `P4 Messaging Shop ${namespace.slice(0, 8)}`,
      address: '9 Thread Street', city: 'Manila', lat: 14.6, lng: 121,
    }).select('*').single()
    if (shopError) throw shopError
    shopId = shop.id

    // A shop needs at least one service before staff can be hired against it.
    const { error: serviceError } = await service.from('services').insert({
      shop_id: shopId, name: 'Messaging Cut', duration_min: 30, price_cents: 30000,
    })
    if (serviceError) throw serviceError

    const { data: employment, error: employmentError } = await service.from('barber_employment').insert({
      barber_id: barber.id, shop_id: shopId, status: 'active', hired_at: '2026-01-01',
    }).select('*').single()
    if (employmentError) throw employmentError
    employmentId = employment.id
    // A second active barber, hired later, so the "reach a specific provider"
    // branch is distinguishable from "first by hire date".
    const { error: secondEmploymentError } = await service.from('barber_employment').insert({
      barber_id: secondBarber.id, shop_id: shopId, status: 'active', hired_at: '2026-06-01',
    })
    if (secondEmploymentError) throw secondEmploymentError

    const { error: hoursError } = await service.from('shop_operating_hours').insert(
      [1, 2, 3, 4, 5].map((weekday) => ({ shop_id: shopId, weekday, open_time: '09:00', close_time: '18:00', closed: false })),
    )
    if (hoursError) throw hoursError
  }, 120_000)

  afterAll(async () => {
    if (!service || !shopId) return
    await service
      .from('shops')
      .update({ lifecycle_status: 'archived', published_at: null, is_hiring: false })
      .eq('id', shopId)
  })

  it('opens one customer thread idempotently and records its booking context', async () => {
    const first = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ shop_id: shopId })
    expect(first.status).toBe(201)
    customerConversationId = first.body.data.id
    // Longest-serving active barber, unless one is named.
    expect(first.body.data.barber_id).toBe(barber.id)
    expect(first.body.data.context).toBe('customer_shop')

    const second = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ shop_id: shopId })
    expect(second.status).toBe(201)
    // The old read-then-insert could produce a second row under a double tap.
    expect(second.body.data.id).toBe(customerConversationId)
    const { count } = await service
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('customer_id', customer.id)
    expect(count).toBe(1)
  })

  it('refuses to attach a booking that is not the caller own, on both paths', async () => {
    // The ownership check has to run before the existing-thread branch. When it
    // ran only on the create path, a caller could attach any appointment id that
    // happened to exist to a thread they already owned, and a non-existent id
    // surfaced as a raw foreign-key violation rather than a refusal.
    const missingOnExistingThread = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ shop_id: shopId, appointment_id: crypto.randomUUID() })
    expect(missingOnExistingThread.status).toBe(403)

    const { data: freshCustomerRow } = await service.auth.admin.createUser({
      email: `attach-probe-${namespace}@messaging.test`, password, email_confirm: true,
      user_metadata: { full_name: 'Attach Probe' },
    })
    const freshId = freshCustomerRow!.user!.id
    await service.from('users').upsert({
      id: freshId, email: `attach-probe-${namespace}@messaging.test`, full_name: 'Attach Probe',
      role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true,
    })
    const missingOnCreate = await service.rpc('api_open_customer_conversation', {
      p_customer_id: freshId,
      p_shop_id: shopId,
      p_appointment_id: crypto.randomUUID(),
      p_barber_id: null,
    })
    expect(missingOnCreate.error?.code).toBe('42501')
    // And no thread was created as a side effect of the refused attach.
    const { count } = await service
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', freshId)
    expect(count).toBe(0)
  })

  it('reaches a named active provider, and refuses one who is not active', async () => {
    // `stranger` has no thread yet, so the provider-selection branch is actually
    // reached. An existing thread short-circuits before it, which is correct but
    // would make this assertion vacuous.
    const named = await service.rpc('api_open_customer_conversation', {
      p_customer_id: stranger.id,
      p_shop_id: shopId,
      p_appointment_id: null,
      p_barber_id: secondBarber.id,
    })
    expect(named.error).toBeNull()
    expect((named.data as { barber_id: string }).barber_id).toBe(secondBarber.id)

    const { data: probeRow } = await service.auth.admin.createUser({
      email: `provider-probe-${namespace}@messaging.test`, password, email_confirm: true,
      user_metadata: { full_name: 'Provider Probe' },
    })
    const probeId = probeRow!.user!.id
    await service.from('users').upsert({
      id: probeId, email: `provider-probe-${namespace}@messaging.test`, full_name: 'Provider Probe',
      role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true,
    })
    const notActive = await service.rpc('api_open_customer_conversation', {
      p_customer_id: probeId,
      p_shop_id: shopId,
      p_appointment_id: null,
      p_barber_id: owner.id,
    })
    expect(notActive.error?.code).toBe('P4021')
  })

  it('opens a staff thread only for an active barber at the owner shop', async () => {
    const opened = await request(app)
      .post('/api/v1/conversations/staff')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ barber_id: barber.id })
    expect(opened.status).toBe(201)
    staffConversationId = opened.body.data.id
    expect(opened.body.data.context).toBe('staff')

    const foreign = await request(app)
      .post('/api/v1/conversations/staff')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ barber_id: stranger.id })
    expect(foreign.status).toBe(403)
  })

  it('refuses every direct write on conversations and messages', async () => {
    // The block and the send limit live inside `api_send_message`. They are only
    // controls if no caller can insert the row itself, including Express.
    const serviceInsert = await service.from('messages').insert({
      conversation_id: customerConversationId, sender_id: customer.id, body: 'Bypassing the command.',
    })
    expect(serviceInsert.error?.code).toBe('42501')

    const serviceConversation = await service.from('conversations').insert({
      kind: 'customer_shop', customer_id: stranger.id, barber_id: barber.id, shop_id: shopId,
    })
    expect(serviceConversation.error?.code).toBe('42501')

    // `authenticated` held INSERT on `conversations` with a permissive policy
    // before P4-01, which was a second creation path around Express.
    const browserConversation = await customer.client.from('conversations').insert({
      kind: 'customer_shop', customer_id: customer.id, barber_id: barber.id, shop_id: shopId,
    })
    expect(browserConversation.error).not.toBeNull()

    const browserMessage = await customer.client.from('messages').insert({
      conversation_id: customerConversationId, sender_id: customer.id, body: 'Direct from the browser.',
    })
    expect(browserMessage.error).not.toBeNull()
  })

  it('closes staff messages the moment employment ends, including a guessed id', async () => {
    // Required test 6. First prove the barber genuinely has access.
    const before = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${barber.token}`)
    expect(before.status).toBe(200)
    expect(before.body.data.map((row: { id: string }) => row.id)).toContain(staffConversationId)

    const beforeMessages = await request(app)
      .get(`/api/v1/conversations/${staffConversationId}/messages`)
      .set('Authorization', `Bearer ${barber.token}`)
    expect(beforeMessages.status).toBe(200)

    const ended = await request(app)
      .post(`/api/v1/employment/${employmentId}/end`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason: 'Fixture employment ended to close messaging access.' })
    expect(ended.status).toBe(200)

    const token = await refresh(barber)
    // The list closes.
    const listAfter = await request(app).get('/api/v1/conversations').set('Authorization', `Bearer ${token}`)
    expect(listAfter.status).toBe(403)

    // The known id closes.
    const knownId = await request(app)
      .get(`/api/v1/conversations/${staffConversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
    expect(knownId.status).toBe(403)

    // Sending closes, and the refusal comes from the command rather than the guard.
    const send = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ conversation_id: staffConversationId, body: 'Still here after leaving.' })
    expect(send.status).toBe(403)
    const commandDirect = await service.rpc('api_send_message', {
      p_conversation_id: staffConversationId,
      p_sender_id: barber.id,
      p_body: 'Straight at the command.',
    })
    expect(commandDirect.error?.code).toBe('42501')

    // A guessed conversation id fails the same way, not with a different code that
    // would tell an attacker whether the id exists.
    const guessed = await request(app)
      .get(`/api/v1/conversations/${crypto.randomUUID()}/messages`)
      .set('Authorization', `Bearer ${token}`)
    expect([403, 404]).toContain(guessed.status)

    // And the browser JWT cannot read the rows either.
    const browserRead = await barber.client.from('messages').select('id').eq('conversation_id', staffConversationId)
    expect(browserRead.data ?? []).toEqual([])
  })

  it('closes staff messages for a suspended barber who is still employed', async () => {
    // Rehire, so suspension is tested independently of employment ending.
    const { error: rehireError } = await service.from('barber_employment').insert({
      barber_id: barber.id, shop_id: shopId, status: 'active', hired_at: '2026-01-01',
    })
    expect(rehireError).toBeNull()
    const active = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${await refresh(barber)}`)
    expect(active.status).toBe(200)

    const { error: suspendError } = await service
      .from('users')
      .update({ verification_status: 'suspended' })
      .eq('id', barber.id)
    expect(suspendError).toBeNull()

    const suspendedToken = await refresh(barber)
    const suspended = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${suspendedToken}`)
    expect(suspended.status).toBe(403)
    expect(suspended.body.error.code).toBe('verification_locked')

    const suspendedSend = await service.rpc('api_send_message', {
      p_conversation_id: staffConversationId,
      p_sender_id: barber.id,
      p_body: 'Suspended but trying.',
    })
    expect(suspendedSend.error?.code).toBe('42501')

    const { error: restoreError } = await service
      .from('users')
      .update({ verification_status: 'verified' })
      .eq('id', barber.id)
    expect(restoreError).toBeNull()
  })

  it('blocks direct messages both ways without touching required notices', async () => {
    const blocked = await request(app)
      .put(`/api/v1/conversation-blocks/${barber.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ blocked: true, reason: 'Unwanted messages outside booking matters.' })
    expect(blocked.status).toBe(200)
    expect(blocked.body.data).toMatchObject({ blocked_id: barber.id, blocked: true })

    // The blocker cannot send either. A one-way block that still lets the blocker
    // talk at somebody is a harassment vector, not a block.
    const fromCustomer = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ conversation_id: customerConversationId, body: 'Still talking after blocking.' })
    expect(fromCustomer.status).toBe(403)
    expect(fromCustomer.body.error.code).toBe('messages_blocked')

    const fromBarber = await service.rpc('api_send_message', {
      p_conversation_id: customerConversationId,
      p_sender_id: barber.id,
      p_body: 'Replying through a block.',
    })
    expect(fromBarber.error?.code).toBe('P4036')

    // A required booking notice still reaches the customer: blocking suppresses
    // direct messages only, and notices travel through the outbox.
    const notice = await service.from('notification_outbox').insert({
      recipient_id: customer.id,
      shop_id: shopId,
      event_key: `messaging-block-check:${namespace}`,
      title: 'Your booking moved',
      body: 'The shop rescheduled your visit.',
      payload: {},
    }).select('*').single()
    expect(notice.error).toBeNull()
    expect(notice.data?.recipient_id).toBe(customer.id)

    const listed = await request(app)
      .get('/api/v1/conversation-blocks')
      .set('Authorization', `Bearer ${customer.token}`)
    expect(listed.status).toBe(200)
    expect(listed.body.data.map((row: { blocked_id: string }) => row.blocked_id)).toContain(barber.id)

    const unblocked = await request(app)
      .put(`/api/v1/conversation-blocks/${barber.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ blocked: false })
    expect(unblocked.status).toBe(200)
    const afterUnblock = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ conversation_id: customerConversationId, body: 'Talking again after unblocking.' })
    expect(afterUnblock.status).toBe(201)
  })

  it('refuses to block an account with no shared conversation', async () => {
    const probe = await request(app)
      .put(`/api/v1/conversation-blocks/${secondBarber.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ blocked: true })
    // Otherwise this control doubles as a way to probe for arbitrary account ids.
    expect(probe.status).toBe(403)
  })

  it('rate-limits sends inside the command, not only in Express', async () => {
    const sent: number[] = []
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ conversation_id: customerConversationId, body: `Burst message ${attempt}` })
      sent.push(response.status)
      if (response.status === 429) break
    }
    expect(sent).toContain(429)

    // And the limit is not a route concern: calling the command directly hits it.
    const direct = await service.rpc('api_send_message', {
      p_conversation_id: customerConversationId,
      p_sender_id: customer.id,
      p_body: 'Straight at the command during a burst.',
    })
    expect(direct.error?.code).toBe('P4037')
  })

  it('pages one thread with a cursor rather than an offset', async () => {
    const firstPage = await request(app)
      .get(`/api/v1/conversations/${customerConversationId}/messages?limit=5`)
      .set('Authorization', `Bearer ${customer.token}`)
    expect(firstPage.status).toBe(200)
    expect(firstPage.body.data.length).toBeLessThanOrEqual(5)
    expect(firstPage.body.meta).toMatchObject({ has_more: true })
    expect(firstPage.body.meta.next_cursor).toBeTruthy()

    const secondPage = await request(app)
      .get(`/api/v1/conversations/${customerConversationId}/messages?limit=5&before=${encodeURIComponent(firstPage.body.meta.next_cursor)}`)
      .set('Authorization', `Bearer ${customer.token}`)
    expect(secondPage.status).toBe(200)
    // No overlap between pages, which is the property an offset loses as soon as
    // somebody sends a message mid-scroll.
    const firstIds = new Set(firstPage.body.data.map((row: { id: string }) => row.id))
    for (const row of secondPage.body.data) expect(firstIds.has(row.id)).toBe(false)
    // Returned oldest-first inside the page, so the UI can append without sorting.
    const timestamps = secondPage.body.data.map((row: { created_at: string }) => Date.parse(row.created_at))
    expect([...timestamps].sort((left, right) => left - right)).toEqual(timestamps)
  })

  it('records a conversation report from a participant only', async () => {
    const reported = await request(app)
      .post(`/api/v1/conversations/${customerConversationId}/report`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason_category: 'off_platform_payment', reason: 'Asked me to pay through a personal account.' })
    expect(reported.status).toBe(201)
    expect(reported.body.data).toMatchObject({ status: 'open', reason_category: 'off_platform_payment' })

    const twice = await request(app)
      .post(`/api/v1/conversations/${customerConversationId}/report`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason_category: 'spam', reason: 'Second open report from the same reporter.' })
    expect(twice.status).toBe(409)

    const outsider = await request(app)
      .post(`/api/v1/conversations/${customerConversationId}/report`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ reason_category: 'abusive', reason: 'Not my conversation at all.' })
    expect(outsider.status).toBe(403)
  })

  it('purges message bodies past the two-year retention window', async () => {
    const { data: recent } = await service
      .from('messages')
      .select('id')
      .eq('conversation_id', customerConversationId)
    const recentCount = (recent ?? []).length
    expect(recentCount).toBeGreaterThan(0)

    // Nothing here is old enough yet, so the sweeper must be a no-op rather than a
    // blunt delete. That is the assertion that would catch an inverted predicate.
    const firstSweep = await service.rpc('api_purge_expired_messages', { p_limit: 500 })
    expect(firstSweep.error).toBeNull()
    const { data: afterSweep } = await service
      .from('messages')
      .select('id')
      .eq('conversation_id', customerConversationId)
    expect((afterSweep ?? []).length).toBe(recentCount)
  })
})
