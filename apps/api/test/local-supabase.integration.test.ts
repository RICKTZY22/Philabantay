import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { processDueAppointmentTransitions } from '../src/routes/bookings'

const runLocal = process.env.RUN_LOCAL_SUPABASE_TESTS === '1'
const localDescribe = runLocal ? describe : describe.skip

interface SignedInUser {
  client: SupabaseClient
  id: string
  token: string
}

interface Fixtures {
  primaryShopId: string
  secondShopId: string
  primaryServiceId: string
  primaryEmploymentId: string
  secondEmploymentId: string
  primaryPatternId: string
  secondPatternId: string
  customerAppointmentId: string
  otherCustomerAppointmentId: string
  secondShopAppointmentId: string
  customerMessageId: string
  otherCustomerMessageId: string
  secondShopMessageId: string
}

function required(...names: string[]): string {
  const value = names.map((name) => process.env[name]).find(Boolean)
  if (!value) throw new Error(`${names.join(' or ')} is required for local Supabase integration tests.`)
  return value
}

function ids(rows: Array<{ id: string }> | null): string[] {
  return (rows ?? []).map((row) => row.id).sort()
}

localDescribe('local Supabase RLS and Express authorization', () => {
  let service: SupabaseClient
  let authVerifier: SupabaseClient
  let app: ReturnType<typeof createApp>
  let customer: SignedInUser
  let barber: SignedInUser
  let owner: SignedInUser
  let otherCustomer: SignedInUser
  let otherOwner: SignedInUser
  let otherBarber: SignedInUser
  let fixtures: Fixtures
  const fixturePassword = `Integration!${crypto.randomUUID()}`
  const fixtureNamespace = crypto.randomUUID()

  function fixtureEmail(label: string): string {
    return `${label}-${fixtureNamespace}@integration.test`
  }

  async function signIn(email: string, password = fixturePassword): Promise<SignedInUser> {
    const client = createClient(
      required('LOCAL_SUPABASE_URL', 'SUPABASE_URL'),
      required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'),
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    )
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) throw error ?? new Error(`No session for ${email}.`)
    return { client, id: data.user.id, token: data.session.access_token }
  }

  async function createFixtureUser(email: string, fullName: string): Promise<string> {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: fixturePassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error || !data.user) throw error ?? new Error(`Could not create ${email}.`)
    return data.user.id
  }

  beforeAll(async () => {
    const url = required('LOCAL_SUPABASE_URL', 'SUPABASE_URL')
    const publishableKey = required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY')
    const secretKey = required(
      'LOCAL_SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SECRET_KEY',
    )
    const serverOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const
    service = createClient(url, secretKey, serverOptions)
    authVerifier = createClient(url, publishableKey, serverOptions)
    app = createApp({ auth: authVerifier, database: service }, { webOrigin: 'http://127.0.0.1:5174' })

    const customerEmail = fixtureEmail('customer-primary')
    const barberEmail = fixtureEmail('barber-primary')
    const ownerEmail = fixtureEmail('owner-primary')
    const otherCustomerEmail = fixtureEmail('customer-secondary')
    const otherOwnerEmail = fixtureEmail('owner-secondary')
    const otherBarberEmail = fixtureEmail('barber-secondary')
    await createFixtureUser(customerEmail, 'Primary Customer')
    const barberId = await createFixtureUser(barberEmail, 'Primary Barber')
    const ownerId = await createFixtureUser(ownerEmail, 'Primary Owner')
    await createFixtureUser(otherCustomerEmail, 'Secondary Customer')
    const otherOwnerId = await createFixtureUser(otherOwnerEmail, 'RLS Owner')
    const otherBarberId = await createFixtureUser(otherBarberEmail, 'RLS Barber')

    const { error: roleError } = await service.from('users').upsert([
      { id: ownerId, email: ownerEmail, full_name: 'Primary Owner', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
      { id: barberId, email: barberEmail, full_name: 'Primary Barber', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
      { id: otherOwnerId, email: otherOwnerEmail, full_name: 'RLS Owner', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
      { id: otherBarberId, email: otherBarberEmail, full_name: 'RLS Barber', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
    ])
    if (roleError) throw roleError
    const { error: barberProfileError } = await service.from('barbers').insert([
      { id: barberId, bio: 'Primary isolation fixture.' },
      { id: otherBarberId, bio: 'Secondary isolation fixture.' },
    ])
    if (barberProfileError) throw barberProfileError

    customer = await signIn(customerEmail)
    barber = await signIn(barberEmail)
    owner = await signIn(ownerEmail)
    otherCustomer = await signIn(otherCustomerEmail)
    otherOwner = await signIn(otherOwnerEmail)
    otherBarber = await signIn(otherBarberEmail)

    const { data: primaryShop, error: primaryShopError } = await service.from('shops').insert({
      owner_id: owner.id,
      name: 'RLS Primary Shop',
      address: '1 Isolation Street',
      city: 'Manila',
      lat: 14.5995,
      lng: 120.9842,
    }).select('*').single()
    if (primaryShopError) throw primaryShopError
    const { data: primaryService, error: primaryServiceError } = await service.from('services').insert({
      shop_id: primaryShop.id,
      name: 'Primary Test Cut',
      duration_min: 30,
      price_cents: 30000,
    }).select('*').single()
    if (primaryServiceError) throw primaryServiceError
    const { data: primaryEmployment, error: primaryEmploymentError } = await service.from('barber_employment').insert({
      barber_id: barber.id,
      shop_id: primaryShop.id,
      status: 'active',
      hired_at: '2026-01-01',
    }).select('*').single()
    if (primaryEmploymentError) throw primaryEmploymentError

    const { data: secondShop, error: secondShopError } = await service.from('shops').insert({
      owner_id: otherOwner.id,
      name: 'RLS Second Shop',
      address: '2 Isolation Street',
      city: 'Quezon City',
      lat: 14.676,
      lng: 121.0437,
    }).select('*').single()
    if (secondShopError) throw secondShopError
    const { data: secondService, error: secondServiceError } = await service.from('services').insert({
      shop_id: secondShop.id,
      name: 'Isolation Cut',
      duration_min: 30,
      price_cents: 25000,
    }).select('*').single()
    if (secondServiceError) throw secondServiceError
    const { data: secondEmployment, error: secondEmploymentError } = await service.from('barber_employment').insert({
      barber_id: otherBarber.id,
      shop_id: secondShop.id,
      status: 'active',
      hired_at: '2026-01-01',
    }).select('*').single()
    if (secondEmploymentError) throw secondEmploymentError

    const { data: patterns, error: patternError } = await service.from('shift_patterns').insert([
      { employment_id: primaryEmployment.id, barber_id: barber.id, shop_id: primaryShop.id, weekday: 1, start_time: '09:00', end_time: '17:00' },
      { employment_id: secondEmployment.id, barber_id: otherBarber.id, shop_id: secondShop.id, weekday: 2, start_time: '10:00', end_time: '18:00' },
    ]).select('*')
    if (patternError || !patterns || patterns.length !== 2) throw patternError ?? new Error('Could not create shift patterns.')

    const { data: appointments, error: appointmentError } = await service.from('appointments').insert([
      { customer_id: customer.id, barber_id: barber.id, shop_id: primaryShop.id, service_id: primaryService.id, starts_at: '2030-01-07T01:00:00.000Z', ends_at: '2030-01-07T01:30:00.000Z', status: 'confirmed' },
      { customer_id: otherCustomer.id, barber_id: barber.id, shop_id: primaryShop.id, service_id: primaryService.id, starts_at: '2030-01-08T01:00:00.000Z', ends_at: '2030-01-08T01:30:00.000Z', status: 'confirmed' },
      { customer_id: otherCustomer.id, barber_id: otherBarber.id, shop_id: secondShop.id, service_id: secondService.id, starts_at: '2030-01-09T02:00:00.000Z', ends_at: '2030-01-09T02:30:00.000Z', status: 'confirmed' },
    ]).select('*')
    if (appointmentError || !appointments || appointments.length !== 3) throw appointmentError ?? new Error('Could not create appointments.')

    const { data: conversations, error: conversationError } = await service.from('conversations').insert([
      { kind: 'customer_shop', customer_id: customer.id, barber_id: barber.id, shop_id: primaryShop.id },
      { kind: 'customer_shop', customer_id: otherCustomer.id, barber_id: barber.id, shop_id: primaryShop.id },
      { kind: 'customer_shop', customer_id: otherCustomer.id, barber_id: otherBarber.id, shop_id: secondShop.id },
    ]).select('*')
    if (conversationError || !conversations || conversations.length !== 3) throw conversationError ?? new Error('Could not create conversations.')
    const { data: messages, error: messageError } = await service.from('messages').insert([
      { conversation_id: conversations[0].id, sender_id: customer.id, body: 'Primary customer message' },
      { conversation_id: conversations[1].id, sender_id: otherCustomer.id, body: 'Other customer message' },
      { conversation_id: conversations[2].id, sender_id: otherCustomer.id, body: 'Second shop message' },
    ]).select('*')
    if (messageError || !messages || messages.length !== 3) throw messageError ?? new Error('Could not create messages.')

    fixtures = {
      primaryShopId: primaryShop.id,
      secondShopId: secondShop.id,
      primaryServiceId: primaryService.id,
      primaryEmploymentId: primaryEmployment.id,
      secondEmploymentId: secondEmployment.id,
      primaryPatternId: patterns.find((row) => row.shop_id === primaryShop.id)?.id as string,
      secondPatternId: patterns.find((row) => row.shop_id === secondShop.id)?.id as string,
      customerAppointmentId: appointments.find((row) => row.customer_id === customer.id)?.id as string,
      otherCustomerAppointmentId: appointments.find((row) => row.customer_id === otherCustomer.id && row.shop_id === primaryShop.id)?.id as string,
      secondShopAppointmentId: appointments.find((row) => row.shop_id === secondShop.id)?.id as string,
      customerMessageId: messages[0].id,
      otherCustomerMessageId: messages[1].id,
      secondShopMessageId: messages[2].id,
    }
  }, 60_000)

  it('customer RLS and Express routes expose only the customer booking/messages', async () => {
    const [{ data: appointments, error: appointmentError }, { data: messages, error: messageError }, { data: patterns, error: patternError }] = await Promise.all([
      customer.client.from('appointments').select('id'),
      customer.client.from('messages').select('id'),
      customer.client.from('shift_patterns').select('id'),
    ])
    expect(appointmentError).toBeNull()
    expect(messageError).toBeNull()
    expect(patternError).toBeNull()
    expect(ids(appointments)).toEqual([fixtures.customerAppointmentId])
    expect(ids(messages)).toEqual([fixtures.customerMessageId])
    expect(patterns).toEqual([])

    const ownBookings = await request(app).get('/api/v1/bookings').set('Authorization', `Bearer ${customer.token}`)
    expect(ownBookings.status).toBe(200)
    expect(ids(ownBookings.body.data)).toEqual([fixtures.customerAppointmentId])
    const ownerOnly = await request(app).get(`/api/v1/shops/${fixtures.primaryShopId}/bookings`).set('Authorization', `Bearer ${customer.token}`)
    expect(ownerOnly.status).toBe(403)
  })

  it('barber RLS is limited to assigned appointments, own shop shifts, and conversations', async () => {
    const [{ data: appointments, error: appointmentError }, { data: patterns, error: patternError }, { data: messages, error: messageError }] = await Promise.all([
      barber.client.from('appointments').select('id'),
      barber.client.from('shift_patterns').select('id'),
      barber.client.from('messages').select('id'),
    ])
    expect(appointmentError).toBeNull()
    expect(patternError).toBeNull()
    expect(messageError).toBeNull()
    expect(ids(appointments)).toEqual([fixtures.customerAppointmentId, fixtures.otherCustomerAppointmentId].sort())
    expect(ids(patterns)).toEqual([fixtures.primaryPatternId])
    expect(ids(messages)).toEqual([fixtures.customerMessageId, fixtures.otherCustomerMessageId].sort())

    const { error: attendanceError } = await barber.client.from('attendance_records').insert({
      employment_id: fixtures.primaryEmploymentId,
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      date: '2026-07-17',
      status: 'present',
      recorded_by: barber.id,
    })
    // Attendance is owner-authoritative. Barbers may view their history but
    // cannot self-certify presence or overwrite an owner-recorded absence.
    expect(attendanceError).not.toBeNull()
    const { error: crossShopAttendanceError } = await barber.client.from('attendance_records').insert({
      employment_id: fixtures.secondEmploymentId,
      barber_id: otherBarber.id,
      shop_id: fixtures.secondShopId,
      date: '2026-07-17',
      status: 'present',
      recorded_by: barber.id,
    })
    expect(crossShopAttendanceError).not.toBeNull()

    const ownRules = await request(app)
      .put('/api/v1/shifts/patterns')
      .set('Authorization', `Bearer ${barber.token}`)
      .send([{ weekday: 1, start_time: '08:00', end_time: '16:00' }])
    expect(ownRules.status).toBe(200)
    const crossShopRules = await request(app)
      .put(`/api/v1/shops/${fixtures.secondShopId}/staff/${otherBarber.id}/shifts/patterns`)
      .set('Authorization', `Bearer ${barber.token}`)
      .send([{ weekday: 2, start_time: '08:00', end_time: '16:00' }])
    expect(crossShopRules.status).toBe(403)
  })

  it('owner RLS and Express routes include the owned shop and exclude another shop', async () => {
    const [{ data: appointments, error: appointmentError }, { data: patterns, error: patternError }, { data: messages, error: messageError }] = await Promise.all([
      owner.client.from('appointments').select('id'),
      owner.client.from('shift_patterns').select('id'),
      owner.client.from('messages').select('id'),
    ])
    expect(appointmentError).toBeNull()
    expect(patternError).toBeNull()
    expect(messageError).toBeNull()
    expect(ids(appointments)).toEqual([fixtures.customerAppointmentId, fixtures.otherCustomerAppointmentId].sort())
    expect(ids(patterns)).not.toContain(fixtures.secondPatternId)
    expect(ids(messages)).toEqual([fixtures.customerMessageId, fixtures.otherCustomerMessageId].sort())
    expect(ids(messages)).not.toContain(fixtures.secondShopMessageId)
    expect(ids(appointments)).not.toContain(fixtures.secondShopAppointmentId)

    const ownedBookings = await request(app).get(`/api/v1/shops/${fixtures.primaryShopId}/bookings`).set('Authorization', `Bearer ${owner.token}`)
    expect(ownedBookings.status).toBe(200)
    expect(ids(ownedBookings.body.data)).toEqual([fixtures.customerAppointmentId, fixtures.otherCustomerAppointmentId].sort())
    const otherBookings = await request(app).get(`/api/v1/shops/${fixtures.secondShopId}/bookings`).set('Authorization', `Bearer ${owner.token}`)
    expect(otherBookings.status).toBe(403)
    const staff = await request(app).get(`/api/v1/shops/${fixtures.primaryShopId}/staff`).set('Authorization', `Bearer ${owner.token}`)
    expect(staff.status).toBe(200)
    expect(staff.body.data).toHaveLength(1)
    const otherStaff = await request(app).get(`/api/v1/shops/${fixtures.secondShopId}/staff`).set('Authorization', `Bearer ${owner.token}`)
    expect(otherStaff.status).toBe(403)
  })

  it('the second owner and barber cannot see the primary shop operational rows', async () => {
    const [{ data: ownerAppointments }, { data: barberPatterns }, { data: barberMessages }] = await Promise.all([
      otherOwner.client.from('appointments').select('id'),
      otherBarber.client.from('shift_patterns').select('id'),
      otherBarber.client.from('messages').select('id'),
    ])
    expect(ids(ownerAppointments)).toEqual([fixtures.secondShopAppointmentId])
    expect(ids(barberPatterns)).toEqual([fixtures.secondPatternId])
    expect(ids(barberMessages)).toEqual([fixtures.secondShopMessageId])
  })

  it('allows an owner to reassign a future reservation to available staff at the same shop', async () => {
    const alternateEmail = fixtureEmail('barber-alternate')
    const alternateBarberId = await createFixtureUser(alternateEmail, 'Alternate Barber')
    const { error: alternateRoleError } = await service.from('users').upsert({
      id: alternateBarberId,
      email: alternateEmail,
      full_name: 'Alternate Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(alternateRoleError).toBeNull()
    const { error: alternateProfileError } = await service.from('barbers').insert({ id: alternateBarberId, accepting_bookings: true })
    expect(alternateProfileError).toBeNull()
    const { data: employment, error: employmentError } = await service.from('barber_employment').insert({
      barber_id: alternateBarberId,
      shop_id: fixtures.primaryShopId,
      status: 'active',
      hired_at: '2026-01-01',
    }).select('*').single()
    expect(employmentError).toBeNull()
    const { error: patternError } = await service.from('shift_patterns').insert({
      employment_id: employment.id,
      barber_id: alternateBarberId,
      shop_id: fixtures.primaryShopId,
      weekday: 1,
      start_time: '08:00',
      end_time: '17:00',
    })
    expect(patternError).toBeNull()

    const reassigned = await request(app)
      .post(`/api/v1/bookings/${fixtures.customerAppointmentId}/reassign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 1,
        barber_id: alternateBarberId,
        reason: 'Original barber requested approved leave.',
      })
    expect(reassigned.status).toBe(200)
    expect(reassigned.body.data).toMatchObject({ barber_id: alternateBarberId, version: 2 })

    const timeline = await request(app)
      .get(`/api/v1/bookings/${fixtures.customerAppointmentId}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
    expect(timeline.status).toBe(200)
    expect(timeline.body.data.at(-1)).toMatchObject({
      event_type: 'reassigned',
      reason: 'Original barber requested approved leave.',
    })
  })

  it('enforces the owner-to-barber-to-customer lifecycle and records its timeline', async () => {
    const startsAt = new Date(Date.now() + 5 * 60_000)
    const { data: created, error: createError } = await service.from('appointments').insert({
      customer_id: customer.id,
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      service_id: fixtures.primaryServiceId,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
      status: 'confirmed',
    }).select('*').single()
    expect(createError).toBeNull()

    const directStatusWrite = await customer.client
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', created.id)
    expect(directStatusWrite.error).not.toBeNull()

    const checkedIn = await request(app)
      .post(`/api/v1/bookings/${created.id}/check-in`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 1, reason: 'Customer identity checked at the counter.' })
    expect(checkedIn.status).toBe(200)
    expect(checkedIn.body.data).toMatchObject({ status: 'checked_in', version: 2 })

    const started = await request(app)
      .post(`/api/v1/bookings/${created.id}/start`)
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ expected_version: 2 })
    expect(started.status).toBe(200)
    expect(started.body.data).toMatchObject({ status: 'in_progress', version: 3 })

    const finished = await request(app)
      .post(`/api/v1/bookings/${created.id}/finish`)
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ expected_version: 3 })
    expect(finished.status).toBe(200)
    expect(finished.body.data).toMatchObject({ status: 'awaiting_confirmation', version: 4 })

    const completed = await request(app)
      .post(`/api/v1/bookings/${created.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: 4 })
    expect(completed.status).toBe(200)
    expect(completed.body.data).toMatchObject({ status: 'completed', version: 5 })

    const stale = await request(app)
      .post(`/api/v1/bookings/${created.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: 4 })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('stale_appointment')

    const timeline = await request(app)
      .get(`/api/v1/bookings/${created.id}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
    expect(timeline.status).toBe(200)
    expect(timeline.body.data.map((event: { event_type: string }) => event.event_type)).toEqual([
      'created',
      'checked_in',
      'started',
      'finished',
      'completion_confirmed',
    ])

    const { data: hiddenEvents, error: hiddenEventError } = await otherCustomer.client
      .from('appointment_events')
      .select('id')
      .eq('appointment_id', created.id)
    expect(hiddenEventError).toBeNull()
    expect(hiddenEvents).toEqual([])
  }, 20_000)

  it('expires stale requests and finalizes unconfirmed finished cuts automatically', async () => {
    const baseStart = Date.now() + 4 * 86_400_000
    const { data: rows, error: createError } = await service.from('appointments').insert([
      {
        customer_id: customer.id,
        barber_id: barber.id,
        shop_id: fixtures.primaryShopId,
        service_id: fixtures.primaryServiceId,
        starts_at: new Date(baseStart).toISOString(),
        ends_at: new Date(baseStart + 30 * 60_000).toISOString(),
        status: 'requested',
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
      {
        customer_id: otherCustomer.id,
        barber_id: barber.id,
        shop_id: fixtures.primaryShopId,
        service_id: fixtures.primaryServiceId,
        starts_at: new Date(baseStart + 60 * 60_000).toISOString(),
        ends_at: new Date(baseStart + 90 * 60_000).toISOString(),
        status: 'awaiting_confirmation',
        actual_started_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
        actual_finished_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
        completion_due_at: new Date(Date.now() - 60_000).toISOString(),
      },
    ]).select('id,status')
    expect(createError).toBeNull()

    await processDueAppointmentTransitions({ auth: authVerifier, database: service })

    const { data: finalized, error: finalizedError } = await service
      .from('appointments')
      .select('id,status,version')
      .in('id', (rows ?? []).map((row) => row.id))
    expect(finalizedError).toBeNull()
    expect(new Map((finalized ?? []).map((row) => [row.id, row.status]))).toEqual(new Map([
      [rows?.[0].id, 'expired'],
      [rows?.[1].id, 'completed'],
    ]))
  })
})
