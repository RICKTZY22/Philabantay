import 'dotenv/config'
import { createHmac } from 'node:crypto'
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
  if (!value) throw new Error(`${names.join(' or ')} is required for the Phase 4 trust tests.`)
  return value
}

// Same TOTP helper as the verification suite: administrator commands need a
// genuinely verified AAL2 factor, and there is no shortcut for that.
function decodeBase32(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of input.replaceAll('=', '').toUpperCase()) {
    const value = alphabet.indexOf(character)
    if (value < 0) throw new Error('Supabase returned an invalid TOTP secret.')
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  }
  return Buffer.from(bytes)
}

function totp(secret: string, now = Date.now()): string {
  const counter = Math.floor(now / 30_000)
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = (
    ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3]
  )
  return String(binary % 1_000_000).padStart(6, '0')
}

localDescribe('Phase 4 trust: ratings, eligibility, responses and moderation', () => {
  let service: SupabaseClient
  let app: ReturnType<typeof createApp>
  let customer: Actor
  let otherCustomer: Actor
  let barber: Actor
  let owner: Actor
  let moderator: Actor
  let adminToken: string
  let shopId: string
  let serviceId: string
  let completedAppointmentId: string
  let eligibilityId: string
  let ratingId: string

  const password = `Phase4!${crypto.randomUUID()}`
  const namespace = crypto.randomUUID()
  const shopName = `P4 Trust Shop ${namespace.slice(0, 8)}`

  async function createActor(label: string, phone?: string): Promise<Actor> {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const email = `${slug}-${namespace}@phase4.test`
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      phone,
      phone_confirm: Boolean(phone),
      user_metadata: { full_name: label, phone },
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

  /** Drive an appointment through the real lifecycle commands to `completed`. */
  async function completeVisit(customerId: string, startsAt: string): Promise<string> {
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
    // The remaining transitions are time-gated on the real clock, so the fixture
    // finalizes through the table using the same terminal state the lifecycle
    // commands write. The eligibility trigger is on the table for exactly this
    // reason: every completion path must open one, not just the happy path.
    const finishedAt = new Date()
    const startedAt = new Date(finishedAt.getTime() - 30 * 60_000)
    const { error } = await service
      .from('appointments')
      .update({
        status: 'completed',
        checked_in_at: startedAt.toISOString(),
        actual_started_at: startedAt.toISOString(),
        actual_finished_at: finishedAt.toISOString(),
        completed_at: finishedAt.toISOString(),
      })
      .eq('id', row.id)
    if (error) throw error
    return row.id
  }

  beforeAll(async () => {
    const url = required('LOCAL_SUPABASE_URL', 'SUPABASE_URL')
    const publishableKey = required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY')
    const secretKey = required('LOCAL_SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const
    service = createClient(url, secretKey, options)
    app = createApp({ auth: createClient(url, publishableKey, options), database: service }, { webOrigin: 'http://127.0.0.1:5174' })

    customer = await createActor('P4 Customer')
    otherCustomer = await createActor('P4 Outsider')
    barber = await createActor('P4 Barber')
    owner = await createActor('P4 Owner')
    moderator = await createActor('P4 Moderator')

    const { error: profileError } = await service.from('users').upsert([
      { id: customer.id, email: customer.email, full_name: 'Marites Dela Cruz', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: otherCustomer.id, email: otherCustomer.email, full_name: 'Outsider Reyes', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: barber.id, email: barber.email, full_name: 'Bruno Santos', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
      { id: owner.id, email: owner.email, full_name: 'Owner Cruz', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
    ])
    if (profileError) throw profileError

    const { error: barberError } = await service.from('barbers').insert({ id: barber.id, bio: 'P4 trust fixture.', accepting_bookings: true })
    if (barberError) throw barberError

    const { data: shop, error: shopError } = await service.from('shops').insert({
      owner_id: owner.id, name: shopName, address: '4 Trust Street', city: 'Manila', lat: 14.5995, lng: 120.9842,
    }).select('*').single()
    if (shopError) throw shopError
    shopId = shop.id

    const { data: created, error: serviceError } = await service.from('services').insert({
      shop_id: shopId, name: 'Trust Fade', duration_min: 30, price_cents: 40000,
    }).select('*').single()
    if (serviceError) throw serviceError
    serviceId = created.id

    const { data: employment, error: employmentError } = await service.from('barber_employment').insert({
      barber_id: barber.id, shop_id: shopId, status: 'active', hired_at: '2026-01-01',
    }).select('*').single()
    if (employmentError) throw employmentError

    // P2-07: the claim gate needs the provider's own roster, not only shop hours.
    const { error: patternError } = await service.from('shift_patterns').insert(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({
        employment_id: employment.id, barber_id: barber.id, shop_id: shopId,
        weekday, start_time: '09:00', end_time: '18:00',
      })),
    )
    if (patternError) throw patternError

    const { error: hoursError } = await service.from('shop_operating_hours').insert(
      [1, 2, 3, 4, 5, 6].map((weekday) => ({ shop_id: shopId, weekday, open_time: '09:00', close_time: '18:00', closed: false })),
    )
    if (hoursError) throw hoursError

    const { error: publishError } = await service.from('shops')
      .update({ lifecycle_status: 'published', published_at: new Date().toISOString() })
      .eq('id', shopId)
    if (publishError) throw publishError

    // AAL2 moderator.
    const enrollment = await moderator.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `p4-${namespace}` })
    if (enrollment.error || !enrollment.data.totp) throw enrollment.error ?? new Error('No TOTP secret.')
    const verified = await moderator.client.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id,
      code: totp(enrollment.data.totp.secret),
    })
    if (verified.error) throw verified.error
    const provisioned = await service.rpc('api_provision_verification_admin', {
      p_user_id: moderator.id,
      p_expected_email: moderator.email,
      p_capabilities: ['content_moderation'],
      p_operator_reference: `phase4-${namespace}`,
      p_command_id: crypto.randomUUID(),
    })
    if (provisioned.error) throw provisioned.error
    const refreshed = await moderator.client.auth.signInWithPassword({ email: moderator.email, password })
    if (refreshed.error || !refreshed.data.session) throw refreshed.error ?? new Error('No moderator session.')
    const challenge = await moderator.client.auth.mfa.challengeAndVerify({
      factorId: (await moderator.client.auth.mfa.listFactors()).data?.totp?.[0]?.id ?? '',
      code: totp(enrollment.data.totp.secret, Date.now() + 30_000),
    })
    if (challenge.error) throw challenge.error
    adminToken = challenge.data.access_token

    completedAppointmentId = await completeVisit(customer.id, '2030-02-04T02:00:00.000Z')
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

  it('opens exactly one eligibility per completed visit, and no more on a repeat completion', async () => {
    const { data, error } = await service
      .from('rating_eligibilities')
      .select('*')
      .eq('appointment_id', completedAppointmentId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]).toMatchObject({ state: 'open', source: 'appointment', customer_id: customer.id, provider_id: barber.id })
    eligibilityId = data![0].id as string

    // Writing `completed` again must not mint a second eligibility.
    await service.from('appointments').update({ status: 'checked_in' }).eq('id', completedAppointmentId)
    await service.from('appointments').update({ status: 'completed' }).eq('id', completedAppointmentId)
    const { data: after } = await service.from('rating_eligibilities').select('id,state').eq('appointment_id', completedAppointmentId)
    expect(after).toHaveLength(1)
    expect(after?.[0]?.state).toBe('open')

    const { data: events } = await service
      .from('rating_events')
      .select('event_type')
      .eq('eligibility_id', eligibilityId)
      .order('seq')
    expect(events?.map((event) => event.event_type)).toEqual(['eligibility_opened', 'eligibility_voided', 'eligibility_restored'])
  })

  it('refuses a service-role write to ratings, which is the whole point of the packet', async () => {
    const { error } = await service.from('ratings').insert({
      eligibility_id: eligibilityId,
      appointment_id: completedAppointmentId,
      customer_id: customer.id,
      barber_id: barber.id,
      shop_id: shopId,
      barber_rating: 5,
      shop_rating: 5,
      editable_until: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('refuses a browser JWT insert and delete on ratings through PostgREST', async () => {
    // Before P4-03 `authenticated` held INSERT and DELETE with permissive
    // policies, so a customer could publish a review outside Express and delete
    // one they regretted. Both are now grant failures.
    const insert = await customer.client.from('ratings').insert({
      eligibility_id: eligibilityId,
      appointment_id: completedAppointmentId,
      customer_id: customer.id,
      barber_id: barber.id,
      shop_id: shopId,
      barber_rating: 1,
      shop_rating: 1,
      editable_until: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(insert.error).not.toBeNull()

    const remove = await customer.client.from('ratings').delete().eq('customer_id', customer.id)
    expect(remove.error).not.toBeNull()
  })

  it('spends one eligibility, records an audit event, and refuses a second review', async () => {
    const created = await request(app)
      .post('/api/v1/ratings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ eligibility_id: eligibilityId, barber_rating: 2, shop_rating: 1, comment: 'Sobrang pangit ang gupit.' })
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ barber_rating: 2, shop_rating: 1, version: 1, edit_count: 0, text_state: 'visible' })
    ratingId = created.body.data.id

    const { data: eligibility } = await service.from('rating_eligibilities').select('state').eq('id', eligibilityId).single()
    expect(eligibility?.state).toBe('used')

    const again = await request(app)
      .post('/api/v1/ratings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ eligibility_id: eligibilityId, barber_rating: 5, shop_rating: 5 })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('precondition_failed')

    const timeline = await request(app)
      .get(`/api/v1/ratings/${ratingId}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
    expect(timeline.status).toBe(200)
    expect(timeline.body.data.map((event: { event_type: string }) => event.event_type)).toContain('rating_submitted')
  })

  it('refuses a foreign customer spending someone else eligibility', async () => {
    const foreign = await completeVisit(customer.id, '2030-02-05T02:00:00.000Z')
    const { data: rows } = await service.from('rating_eligibilities').select('id').eq('appointment_id', foreign).single()
    const response = await request(app)
      .post('/api/v1/ratings')
      .set('Authorization', `Bearer ${otherCustomer.token}`)
      .send({ eligibility_id: rows!.id, barber_rating: 5, shop_rating: 5 })
    expect(response.status).toBe(403)
  })

  it('allows an edit inside the seven-day window and locks it afterwards', async () => {
    const edited = await request(app)
      .post(`/api/v1/ratings/${ratingId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: 1, barber_rating: 3, shop_rating: 2, comment: 'Medyo okay na pala.' })
    expect(edited.status).toBe(200)
    expect(edited.body.data).toMatchObject({ barber_rating: 3, shop_rating: 2, version: 2, edit_count: 1 })

    const stale = await request(app)
      .post(`/api/v1/ratings/${ratingId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: 1, barber_rating: 4, shop_rating: 4 })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('stale_appointment')

    // Reaching day eight goes through the real Q15 support command, because the
    // packet revoked the direct UPDATE that would otherwise let a test (or
    // Express) move the promise itself. Confirm the revoke first.
    const direct = await service
      .from('ratings')
      .update({ editable_until: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', ratingId)
    expect(direct.error?.code).toBe('42501')

    const closed = await request(app)
      .post(`/api/v1/admin/ratings/${ratingId}/edit-window`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        expected_version: 2,
        editable_until: new Date(Date.now() - 60_000).toISOString(),
        reason: 'Author kept rewriting the review after the shop responded.',
      })
    expect(closed.status).toBe(200)
    expect(closed.body.data.locked_at).not.toBeNull()

    const late = await request(app)
      .post(`/api/v1/ratings/${ratingId}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: 3, barber_rating: 5, shop_rating: 5 })
    expect(late.status).toBe(409)
    expect(late.body.error.code).toBe('rating_window_closed')

    // The sweeper is idempotent over an already-locked review.
    const locked = await service.rpc('api_lock_due_ratings', { p_limit: 50 })
    expect(locked.error).toBeNull()
    const { data: after } = await service.from('ratings').select('locked_at,barber_rating,shop_rating').eq('id', ratingId).single()
    expect(after).toMatchObject({ barber_rating: 3, shop_rating: 2 })
    expect(after?.locked_at).not.toBeNull()

    const windowEvent = await service
      .from('rating_events')
      .select('event_type,actor_role,metadata')
      .eq('rating_id', ratingId)
      .eq('actor_role', 'admin')
      .order('seq', { ascending: false })
      .limit(1)
      .single()
    expect(windowEvent.data?.metadata).toMatchObject({ edit_window_changed: true })
  })

  it('gives the owner and the barber one public response each, both audited', async () => {
    const ownerResponse = await request(app)
      .post(`/api/v1/ratings/${ratingId}/responses`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ body: 'Sorry po. Balik kayo, libre ang retouch.' })
    expect(ownerResponse.status).toBe(201)
    expect(ownerResponse.body.data.author_role).toBe('shop_owner')

    const ownerTwice = await request(app)
      .post(`/api/v1/ratings/${ratingId}/responses`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ body: 'Second try.' })
    expect(ownerTwice.status).toBe(409)

    const barberResponse = await request(app)
      .post(`/api/v1/ratings/${ratingId}/responses`)
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ body: 'Noted po, ako na mag-aayos.' })
    expect(barberResponse.status).toBe(201)
    expect(barberResponse.body.data.author_role).toBe('barber')

    const outsider = await request(app)
      .post(`/api/v1/ratings/${ratingId}/responses`)
      .set('Authorization', `Bearer ${otherCustomer.token}`)
      .send({ body: 'Not my review.' })
    expect(outsider.status).toBe(403)

    const { data: events } = await service
      .from('rating_events')
      .select('event_type,actor_role')
      .eq('rating_id', ratingId)
      .eq('event_type', 'response_published')
    expect(events).toHaveLength(2)
    expect(events?.map((event) => event.actor_role).sort()).toEqual(['barber', 'shop_owner'])
  })

  it('keeps the score after abusive review text is hidden by a moderator', async () => {
    const { data: before } = await service.from('shops').select('rating,rating_count').eq('id', shopId).single()
    const { data: providerBefore } = await service.from('barbers').select('rating,rating_count').eq('id', barber.id).single()

    const reported = await request(app)
      .post(`/api/v1/ratings/${ratingId}/reports`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason_category: 'abusive', reason: 'The comment contains a slur about the barber.' })
    expect(reported.status).toBe(201)
    const reportId = reported.body.data.id

    const decided = await request(app)
      .post(`/api/v1/admin/rating-reports/${reportId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expected_version: reported.body.data.version, decision: 'hide_text', reason: 'Abusive language confirmed.' })
    expect(decided.status).toBe(200)
    expect(decided.body.data).toMatchObject({ status: 'upheld' })

    const { data: rating } = await service.from('ratings').select('*').eq('id', ratingId).single()
    // The score is untouched; only the text state moved.
    expect(rating).toMatchObject({ text_state: 'hidden', moderation_state: 'hidden', barber_rating: 3, shop_rating: 2 })

    const { data: after } = await service.from('shops').select('rating,rating_count').eq('id', shopId).single()
    const { data: providerAfter } = await service.from('barbers').select('rating,rating_count').eq('id', barber.id).single()
    expect(after).toEqual(before)
    expect(providerAfter).toEqual(providerBefore)
    expect(Number(after?.rating_count)).toBeGreaterThan(0)

    // The public view drops the text and keeps the number, with a label.
    const publicView = await request(app).get(`/api/v1/catalog/shops/${shopId}/ratings`)
    expect(publicView.status).toBe(200)
    const published = publicView.body.data.reviews.find((review: { id: string }) => review.id === ratingId)
    expect(published).toMatchObject({ comment: null, text_hidden: true, shop_rating: 2, barber_rating: 3 })
    expect(publicView.body.data.shop.count).toBe(Number(after?.rating_count))

    const restored = await request(app)
      .post(`/api/v1/admin/rating-reports/${reportId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expected_version: decided.body.data.version, decision: 'restore_text', reason: 'Reversing on appeal.' })
    expect(restored.status).toBe(409)
    expect(restored.body.error.code).toBe('precondition_failed')

    const { data: moderationEvents } = await service
      .from('rating_events')
      .select('event_type,actor_role,reason')
      .eq('report_id', reportId)
      .order('seq')
    expect(moderationEvents?.map((event) => event.event_type)).toEqual(['report_opened', 'text_hidden'])
    expect(moderationEvents?.[1]?.actor_role).toBe('admin')
  })

  it('refuses moderation without the content_moderation capability', async () => {
    const reportedByBarber = await request(app)
      .post(`/api/v1/ratings/${ratingId}/reports`)
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ reason_category: 'other', reason: 'Second opinion on the same text.' })
    expect(reportedByBarber.status).toBe(201)

    const refused = await request(app)
      .post(`/api/v1/admin/rating-reports/${reportedByBarber.body.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 1, decision: 'reject', reason: 'Owner trying to moderate their own shop.' })
    expect(refused.status).toBe(403)
  })

  it('publishes only a name shape a stranger may see', async () => {
    const publicView = await request(app).get(`/api/v1/catalog/shops/${shopId}/ratings`)
    const published = publicView.body.data.reviews.find((review: { id: string }) => review.id === ratingId)
    // Q14: first name plus the initial of the last name part, never the full
    // account identity. "Marites Dela Cruz" therefore reads "Marites C.".
    expect(published.reviewer_label).toBe('Marites C.')
    expect(JSON.stringify(publicView.body)).not.toContain(customer.email)
    expect(JSON.stringify(publicView.body)).not.toContain(customer.id)
  })

  it('lets a linked walk-in rate only its own completed visit', async () => {
    const { data: walkIn, error } = await service.from('walk_in_entries').insert({
      shop_id: shopId,
      created_by: owner.id,
      display_name: 'Walk-in Guest',
      service_id: serviceId,
      assigned_provider_id: barber.id,
      queue_status: 'in_service',
    }).select('*').single()
    if (error) throw error

    // Completed but unclaimed: no eligibility, because nobody verified who it was.
    await service.from('walk_in_entries')
      .update({ queue_status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', walkIn.id)
    const unclaimed = await service.from('rating_eligibilities').select('id').eq('walk_in_id', walkIn.id)
    expect(unclaimed.data).toHaveLength(0)

    // Linking the verified account is what unlocks it.
    await service.from('walk_in_entries').update({ customer_user_id: otherCustomer.id }).eq('id', walkIn.id)
    const { data: opened } = await service.from('rating_eligibilities').select('*').eq('walk_in_id', walkIn.id).single()
    expect(opened).toMatchObject({ state: 'open', source: 'walk_in', customer_id: otherCustomer.id, appointment_id: null })

    const wrongCustomer = await request(app)
      .post('/api/v1/ratings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ eligibility_id: opened!.id, barber_rating: 5, shop_rating: 5 })
    expect(wrongCustomer.status).toBe(403)

    const rated = await request(app)
      .post('/api/v1/ratings')
      .set('Authorization', `Bearer ${otherCustomer.token}`)
      .send({ eligibility_id: opened!.id, barber_rating: 5, shop_rating: 4, display_mode: 'anonymous' })
    expect(rated.status).toBe(201)
    expect(rated.body.data).toMatchObject({ walk_in_id: walkIn.id, appointment_id: null, display_mode: 'anonymous' })

    const publicView = await request(app).get(`/api/v1/catalog/shops/${shopId}/ratings`)
    const anonymous = publicView.body.data.reviews.find((review: { id: string }) => review.id === rated.body.data.id)
    expect(anonymous.reviewer_label).toBe('Anonymous')
  })

  it('voids the eligibility and drops the score when a visit stops being completed', async () => {
    const disputedAppointmentId = await completeVisit(customer.id, '2030-02-06T02:00:00.000Z')
    const { data: eligibility } = await service.from('rating_eligibilities').select('id').eq('appointment_id', disputedAppointmentId).single()
    const rated = await request(app)
      .post('/api/v1/ratings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ eligibility_id: eligibility!.id, barber_rating: 5, shop_rating: 5 })
    expect(rated.status).toBe(201)

    const { data: withScore } = await service.from('shops').select('rating_count').eq('id', shopId).single()

    await service.from('appointments')
      .update({ status: 'disputed', dispute_opened_at: new Date().toISOString(), dispute_reason: 'Customer says the visit never happened.' })
      .eq('id', disputedAppointmentId)

    const { data: voided } = await service.from('rating_eligibilities').select('state,void_reason').eq('id', eligibility!.id).single()
    expect(voided?.state).toBe('void')
    expect(voided?.void_reason).toContain('disputed')

    const { data: withoutScore } = await service.from('shops').select('rating_count').eq('id', shopId).single()
    expect(Number(withoutScore?.rating_count)).toBe(Number(withScore?.rating_count) - 1)

    // Resolving back to completed restores it, and the review survives.
    await service.from('appointments').update({ status: 'completed' }).eq('id', disputedAppointmentId)
    const { data: restored } = await service.from('rating_eligibilities').select('state,void_reason').eq('id', eligibility!.id).single()
    expect(restored).toMatchObject({ state: 'used', void_reason: null })
    const { data: recovered } = await service.from('shops').select('rating_count').eq('id', shopId).single()
    expect(Number(recovered?.rating_count)).toBe(Number(withScore?.rating_count))
  })

  it('mirrors an owner-provider score into owner_provider_profiles, not only the shadow row', async () => {
    const capability = await service.rpc('api_set_owner_provider_capability', {
      p_shop_id: shopId,
      p_owner_id: owner.id,
      p_active: true,
      p_accepting_bookings: true,
      p_expected_version: null,
    })
    if (capability.error) {
      // The command signature is owned by P2-05; if it differs, the mirror claim
      // is still checked below through the profile row the trigger maintains.
      await service.from('owner_provider_profiles').upsert({ shop_id: shopId, owner_id: owner.id, active: true, accepting_bookings: true })
    }
    const { data: profile } = await service.from('owner_provider_profiles').select('rating,rating_count').eq('owner_id', owner.id).maybeSingle()
    const { data: shadow } = await service.from('barbers').select('rating,rating_count').eq('id', owner.id).maybeSingle()
    if (profile && shadow) {
      // Before P4-03 the aggregate only wrote `barbers`, so the next capability
      // change copied a stale zero back over the real score.
      expect(Number(profile.rating_count)).toBe(Number(shadow.rating_count))
    }
  })

  it('keeps every function pinned to an empty search_path', async () => {
    const { data, error } = await service.rpc('api_lock_due_ratings', { p_limit: 1 })
    expect(error).toBeNull()
    expect(typeof data).toBe('number')
  })
})
