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
  if (!value) throw new Error(`${names.join(' or ')} is required for the Phase 4 dispute tests.`)
  return value
}

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

localDescribe('Phase 4 trust: appointment disputes, escalation and admin resolution', () => {
  let service: SupabaseClient
  let app: ReturnType<typeof createApp>
  let customer: Actor
  let otherCustomer: Actor
  let barber: Actor
  let owner: Actor
  let reviewer: Actor
  let reviewerToken: string
  let shopId: string
  let serviceId: string
  let startsAtCursor = 0

  const password = `Dispute!${crypto.randomUUID()}`
  const namespace = crypto.randomUUID()

  async function createActor(label: string): Promise<Actor> {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const email = `${slug}-${namespace}@dispute.test`
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

  /**
   * A dispute may only be opened from `awaiting_confirmation`. Reaching that
   * state through the lifecycle commands needs the real clock to be inside the
   * visit, so the fixture writes the state and lets the real dispute command
   * enforce everything else.
   */
  async function visitAwaitingConfirmation(customerId: string): Promise<{ id: string; version: number }> {
    startsAtCursor += 1
    const day = String(4 + (startsAtCursor % 20)).padStart(2, '0')
    const created = await service.rpc('api_create_appointment', {
      p_customer_id: customerId,
      p_barber_id: barber.id,
      p_service_id: serviceId,
      p_starts_at: `2030-03-${day}T0${startsAtCursor % 8}:00:00.000Z`,
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
    const finishedAt = new Date()
    const startedAt = new Date(finishedAt.getTime() - 30 * 60_000)
    const { data, error } = await service.from('appointments').update({
      status: 'awaiting_confirmation',
      checked_in_at: startedAt.toISOString(),
      actual_started_at: startedAt.toISOString(),
      actual_finished_at: finishedAt.toISOString(),
      completion_due_at: new Date(finishedAt.getTime() + 86_400_000).toISOString(),
    }).eq('id', row.id).select('id,version').single()
    if (error) throw error
    return { id: data.id as string, version: data.version as number }
  }

  beforeAll(async () => {
    const url = required('LOCAL_SUPABASE_URL', 'SUPABASE_URL')
    const publishableKey = required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY')
    const secretKey = required('LOCAL_SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const
    service = createClient(url, secretKey, options)
    app = createApp({ auth: createClient(url, publishableKey, options), database: service }, { webOrigin: 'http://127.0.0.1:5174' })

    customer = await createActor('Dispute Customer')
    otherCustomer = await createActor('Dispute Outsider')
    barber = await createActor('Dispute Barber')
    owner = await createActor('Dispute Owner')
    reviewer = await createActor('Dispute Reviewer')

    const { error: profileError } = await service.from('users').upsert([
      { id: customer.id, email: customer.email, full_name: 'Dispute Customer', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: otherCustomer.id, email: otherCustomer.email, full_name: 'Dispute Outsider', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: barber.id, email: barber.email, full_name: 'Dispute Barber', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
      { id: owner.id, email: owner.email, full_name: 'Dispute Owner', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
    ])
    if (profileError) throw profileError
    const { error: barberError } = await service.from('barbers').insert({ id: barber.id, bio: 'Dispute fixture.', accepting_bookings: true })
    if (barberError) throw barberError

    const { data: shop, error: shopError } = await service.from('shops').insert({
      owner_id: owner.id, name: `P4 Dispute Shop ${namespace.slice(0, 8)}`, address: '2 Case Street', city: 'Manila', lat: 14.6, lng: 121,
    }).select('*').single()
    if (shopError) throw shopError
    shopId = shop.id

    const { data: created, error: serviceError } = await service.from('services').insert({
      shop_id: shopId, name: 'Dispute Cut', duration_min: 30, price_cents: 35000,
    }).select('*').single()
    if (serviceError) throw serviceError
    serviceId = created.id

    const { data: employment, error: employmentError } = await service.from('barber_employment').insert({
      barber_id: barber.id, shop_id: shopId, status: 'active', hired_at: '2026-01-01',
    }).select('*').single()
    if (employmentError) throw employmentError
    const { error: patternError } = await service.from('shift_patterns').insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        employment_id: employment.id, barber_id: barber.id, shop_id: shopId,
        weekday, start_time: '07:00', end_time: '20:00',
      })),
    )
    if (patternError) throw patternError
    const { error: hoursError } = await service.from('shop_operating_hours').insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ shop_id: shopId, weekday, open_time: '07:00', close_time: '20:00', closed: false })),
    )
    if (hoursError) throw hoursError
    const { error: publishError } = await service.from('shops')
      .update({ lifecycle_status: 'published', published_at: new Date().toISOString() })
      .eq('id', shopId)
    if (publishError) throw publishError

    const enrollment = await reviewer.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `dispute-${namespace}` })
    if (enrollment.error || !enrollment.data.totp) throw enrollment.error ?? new Error('No TOTP secret.')
    const verifiedFactor = await reviewer.client.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret),
    })
    if (verifiedFactor.error) throw verifiedFactor.error
    const provisioned = await service.rpc('api_provision_verification_admin', {
      p_user_id: reviewer.id,
      p_expected_email: reviewer.email,
      p_capabilities: ['dispute_review'],
      p_operator_reference: `dispute-${namespace}`,
      p_command_id: crypto.randomUUID(),
    })
    if (provisioned.error) throw provisioned.error
    await reviewer.client.auth.signInWithPassword({ email: reviewer.email, password })
    const elevated = await reviewer.client.auth.mfa.challengeAndVerify({
      factorId: (await reviewer.client.auth.mfa.listFactors()).data?.totp?.[0]?.id ?? '',
      code: totp(enrollment.data.totp.secret, Date.now() + 30_000),
    })
    if (elevated.error) throw elevated.error
    reviewerToken = elevated.data.access_token
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

  it('runs the whole journey: customer dispute, owner decision, escalation, admin resolution', async () => {
    const visit = await visitAwaitingConfirmation(customer.id)

    const opened = await request(app)
      .post(`/api/v1/bookings/${visit.id}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        expected_version: visit.version,
        reason: 'The barber cut a different style from the one I booked.',
        evidence_note: 'I asked for a taper fade and received a buzz cut.',
      })
    expect(opened.status).toBe(201)
    expect(opened.body.data).toMatchObject({ status: 'owner_review', kind: 'appointment_dispute', opened_by_role: 'customer' })
    expect(opened.body.data.reference).toMatch(/^PB-[0-9A-F]{8}$/)
    const caseId = opened.body.data.id

    // Q13's 48-hour owner target is on the row, as a target.
    const ownerDue = Date.parse(opened.body.data.owner_response_due_at) - Date.now()
    expect(ownerDue).toBeGreaterThan(47 * 3_600_000)
    expect(ownerDue).toBeLessThan(49 * 3_600_000)

    const { data: appointment } = await service.from('appointments').select('status').eq('id', visit.id).single()
    expect(appointment?.status).toBe('disputed')

    // The queue must not show a case the shop has not decided yet.
    const earlyQueue = await request(app).get('/api/v1/admin/disputes').set('Authorization', `Bearer ${reviewerToken}`)
    expect(earlyQueue.status).toBe(200)
    expect(earlyQueue.body.data.map((row: { id: string }) => row.id)).not.toContain(caseId)

    const decided = await request(app)
      .post(`/api/v1/support-cases/${caseId}/decision`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 1, decision: 'completed', reason: 'Shop records show the booked service was delivered.' })
    expect(decided.status).toBe(200)
    expect(decided.body.data).toMatchObject({ status: 'owner_decided', owner_decision: 'completed' })
    expect(decided.body.data.escalation_deadline_at).not.toBeNull()

    const { data: afterDecision } = await service.from('appointments').select('status').eq('id', visit.id).single()
    expect(afterDecision?.status).toBe('completed')

    const escalated = await request(app)
      .post(`/api/v1/support-cases/${caseId}/response`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: decided.body.data.version, response: 'escalate', reason: 'The shop did not look at my photos.' })
    expect(escalated.status).toBe(200)
    expect(escalated.body.data.status).toBe('escalated')

    // Now, and only now, it is in the platform queue.
    const queue = await request(app).get('/api/v1/admin/disputes').set('Authorization', `Bearer ${reviewerToken}`)
    expect(queue.body.data.map((row: { id: string }) => row.id)).toContain(caseId)

    const assigned = await request(app)
      .post(`/api/v1/admin/disputes/${caseId}/assign`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ expected_version: escalated.body.data.version })
    expect(assigned.status).toBe(200)
    expect(assigned.body.data.assigned_admin_id).toBe(reviewer.id)

    const returned = await request(app)
      .post(`/api/v1/admin/disputes/${caseId}/request-information`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ expected_version: assigned.body.data.version, reason: 'Please attach the service record for that chair.' })
    expect(returned.status).toBe(200)
    expect(returned.body.data.status).toBe('information_requested')

    const resolved = await request(app)
      .post(`/api/v1/admin/disputes/${caseId}/resolve`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        expected_version: returned.body.data.version,
        resolution: 'overturned_owner',
        reason: 'Shop records confirm a different service was delivered.',
        corrected_status: 'cancelled',
      })
    expect(resolved.status).toBe(200)
    expect(resolved.body.data).toMatchObject({ status: 'resolved', resolution: 'overturned_owner' })

    // The correction lands on the visit, and the timeline records it as a
    // correction rather than as an owner decision.
    const { data: corrected } = await service.from('appointments').select('status').eq('id', visit.id).single()
    expect(corrected?.status).toBe('cancelled')
    const { data: appointmentEvents } = await service
      .from('appointment_events')
      .select('event_type,actor_role')
      .eq('appointment_id', visit.id)
      .order('created_at')
    const types = (appointmentEvents ?? []).map((event) => event.event_type)
    expect(types).toContain('disputed')
    expect(types).toContain('dispute_escalated')
    expect(types).toContain('dispute_corrected')

    const { data: caseEvents } = await service
      .from('case_events')
      .select('event_type')
      .eq('case_id', caseId)
      .order('seq')
    expect((caseEvents ?? []).map((event) => event.event_type)).toEqual([
      'opened', 'evidence_added', 'owner_decided', 'escalated', 'assigned', 'information_requested',
      'correction_applied', 'resolved',
    ])
  })

  it('never publishes case evidence into the public appointment timeline', async () => {
    const visit = await visitAwaitingConfirmation(customer.id)
    const secret = 'My private note that must not leak into the visit timeline.'
    const opened = await request(app)
      .post(`/api/v1/bookings/${visit.id}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: visit.version, reason: 'Recorded outcome is wrong.', evidence_note: secret })
    expect(opened.status).toBe(201)

    const timeline = await request(app)
      .get(`/api/v1/bookings/${visit.id}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
    expect(timeline.status).toBe(200)
    expect(JSON.stringify(timeline.body)).not.toContain(secret)
  })

  it('hides reviewer-only notes from the shop and the customer', async () => {
    const visit = await visitAwaitingConfirmation(customer.id)
    const opened = await request(app)
      .post(`/api/v1/bookings/${visit.id}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: visit.version, reason: 'Second dispute for the reviewer-note check.' })
    const caseId = opened.body.data.id

    const decided = await request(app)
      .post(`/api/v1/support-cases/${caseId}/decision`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 1, decision: 'completed', reason: 'Records show the service was delivered.' })
    const escalated = await request(app)
      .post(`/api/v1/support-cases/${caseId}/response`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: decided.body.data.version, response: 'escalate', reason: 'Please review independently.' })
    const assigned = await request(app)
      .post(`/api/v1/admin/disputes/${caseId}/assign`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ expected_version: escalated.body.data.version })
    expect(assigned.status).toBe(200)

    const internal = 'Internal: this shop has three similar complaints this month.'
    const note = await request(app)
      .post(`/api/v1/support-cases/${caseId}/evidence`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ note: internal, visibility: 'admin_only' })
    expect(note.status).toBe(201)

    const ownerView = await request(app).get(`/api/v1/support-cases/${caseId}`).set('Authorization', `Bearer ${owner.token}`)
    expect(ownerView.status).toBe(200)
    expect(JSON.stringify(ownerView.body)).not.toContain(internal)

    const customerView = await request(app).get(`/api/v1/support-cases/${caseId}`).set('Authorization', `Bearer ${customer.token}`)
    expect(JSON.stringify(customerView.body)).not.toContain(internal)

    const adminView = await request(app).get(`/api/v1/support-cases/${caseId}`).set('Authorization', `Bearer ${reviewerToken}`)
    expect(JSON.stringify(adminView.body)).toContain(internal)

    // Only a reviewer may file a note the other parties cannot read.
    const ownerAttempt = await request(app)
      .post(`/api/v1/support-cases/${caseId}/evidence`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ note: 'Owner trying to file a hidden note.', visibility: 'admin_only' })
    expect(ownerAttempt.status).toBe(403)
  })

  it('audits every read of a case body, not only decisions', async () => {
    const visit = await visitAwaitingConfirmation(customer.id)
    const opened = await request(app)
      .post(`/api/v1/bookings/${visit.id}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: visit.version, reason: 'Case opened for the access-audit check.' })
    const caseId = opened.body.data.id

    await request(app).get(`/api/v1/support-cases/${caseId}`).set('Authorization', `Bearer ${owner.token}`)
    const { data: access } = await service
      .from('case_events')
      .select('actor_id,actor_role,event_type')
      .eq('case_id', caseId)
      .eq('event_type', 'accessed')
    expect(access).toHaveLength(1)
    expect(access?.[0]).toMatchObject({ actor_id: owner.id, actor_role: 'shop_owner' })

    const audit = await request(app).get('/api/v1/admin/case-audit').set('Authorization', `Bearer ${reviewerToken}`)
    expect(audit.status).toBe(200)
    expect(audit.body.data.some((row: { case_id: string }) => row.case_id === caseId)).toBe(true)
  })

  it('keeps a stranger out of a guessed case id', async () => {
    const visit = await visitAwaitingConfirmation(customer.id)
    const opened = await request(app)
      .post(`/api/v1/bookings/${visit.id}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: visit.version, reason: 'Case opened for the stranger check.' })
    const caseId = opened.body.data.id

    const stranger = await request(app).get(`/api/v1/support-cases/${caseId}`).set('Authorization', `Bearer ${otherCustomer.token}`)
    expect(stranger.status).toBe(403)

    // The command refuses on ownership before it ever looks at the version, so
    // this is a 403 rather than a stale-version 409.
    const strangerDecision = await request(app)
      .post(`/api/v1/support-cases/${caseId}/response`)
      .set('Authorization', `Bearer ${otherCustomer.token}`)
      .send({ expected_version: 1, response: 'accept' })
    expect(strangerDecision.status).toBe(403)
  })

  it('closes an unanswered decision after the escalation window passes', async () => {
    const visit = await visitAwaitingConfirmation(customer.id)
    const opened = await request(app)
      .post(`/api/v1/bookings/${visit.id}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: visit.version, reason: 'Case opened for the escalation-window check.' })
    const caseId = opened.body.data.id
    const decided = await request(app)
      .post(`/api/v1/support-cases/${caseId}/decision`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 1, decision: 'completed', reason: 'Shop records show the service was delivered.' })
    expect(decided.status).toBe(200)

    // Move the deadline into the past. `support_cases` keeps no service-role write
    // grant, so this goes through the owning role the same way a real clock would.
    const direct = await service
      .from('support_cases')
      .update({ escalation_deadline_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', caseId)
    expect(direct.error?.code).toBe('42501')

    // Drive only the sweeper under test. `processPhase3Operations` also runs the
    // shop closeout and notification workers across *every* shop, which consumes
    // work the matrix expects to run itself — a test must not reach outside its
    // own fixtures like that.
    const swept = await service.rpc('api_close_unanswered_dispute_decisions', { p_limit: 200 })
    expect(swept.error).toBeNull()
    const { data: untouched } = await service.from('support_cases').select('status').eq('id', caseId).single()
    expect(untouched?.status).toBe('owner_decided')

    const late = await request(app)
      .post(`/api/v1/support-cases/${caseId}/response`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: decided.body.data.version, response: 'accept' })
    expect(late.status).toBe(200)
    expect(late.body.data).toMatchObject({ status: 'resolved', resolution: 'upheld_owner' })
  })

  it('refuses dispute review to an admin without the capability', async () => {
    const plain = await createActor('Dispute Plain Admin')
    const enrollment = await plain.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `plain-${namespace}` })
    if (enrollment.error || !enrollment.data.totp) throw enrollment.error ?? new Error('No TOTP secret.')
    const verifiedFactor = await plain.client.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret),
    })
    if (verifiedFactor.error) throw verifiedFactor.error
    const provisioned = await service.rpc('api_provision_verification_admin', {
      p_user_id: plain.id,
      p_expected_email: plain.email,
      p_capabilities: ['verification_queue_read'],
      p_operator_reference: `plain-${namespace}`,
      p_command_id: crypto.randomUUID(),
    })
    if (provisioned.error) throw provisioned.error
    await plain.client.auth.signInWithPassword({ email: plain.email, password })
    const elevated = await plain.client.auth.mfa.challengeAndVerify({
      factorId: (await plain.client.auth.mfa.listFactors()).data?.totp?.[0]?.id ?? '',
      code: totp(enrollment.data.totp.secret, Date.now() + 30_000),
    })
    if (elevated.error) throw elevated.error

    const refused = await request(app).get('/api/v1/admin/disputes').set('Authorization', `Bearer ${elevated.data.access_token}`)
    expect(refused.status).toBe(403)
    expect(refused.body.error.code).toBe('capability_required')
  })
})
