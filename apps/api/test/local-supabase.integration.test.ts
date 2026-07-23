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

  async function createAppointment(input: {
    customerId: string
    barberId: string
    serviceId: string
    startsAt: string
    notes?: string
  }): Promise<Record<string, unknown>> {
    const { data, error } = await service.rpc('api_create_appointment', {
      p_customer_id: input.customerId,
      p_barber_id: input.barberId,
      p_service_id: input.serviceId,
      p_starts_at: input.startsAt,
      p_notes: input.notes ?? null,
    })
    if (error || !data) throw error ?? new Error('Appointment command returned no row.')
    return data as Record<string, unknown>
  }

  async function acceptAppointment(
    appointment: Record<string, unknown>,
    ownerId: string,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await service.rpc('api_transition_appointment', {
      p_appointment_id: appointment.id as string,
      p_expected_version: appointment.version as number,
      p_action: 'accept',
      p_actor_id: ownerId,
      p_reason: null,
      p_check_in_code: null,
    })
    if (error || !data) throw error ?? new Error('Appointment accept command returned no row.')
    return data as Record<string, unknown>
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
    const customerId = await createFixtureUser(customerEmail, 'Primary Customer')
    const barberId = await createFixtureUser(barberEmail, 'Primary Barber')
    const ownerId = await createFixtureUser(ownerEmail, 'Primary Owner')
    const otherCustomerId = await createFixtureUser(otherCustomerEmail, 'Secondary Customer')
    const otherOwnerId = await createFixtureUser(otherOwnerEmail, 'RLS Owner')
    const otherBarberId = await createFixtureUser(otherBarberEmail, 'RLS Barber')

    const { error: roleError } = await service.from('users').upsert([
      { id: customerId, email: customerEmail, full_name: 'Primary Customer', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: ownerId, email: ownerEmail, full_name: 'Primary Owner', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
      { id: barberId, email: barberEmail, full_name: 'Primary Barber', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
      { id: otherCustomerId, email: otherCustomerEmail, full_name: 'Secondary Customer', role: 'customer', requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true },
      { id: otherOwnerId, email: otherOwnerEmail, full_name: 'RLS Owner', role: 'shop_owner', requested_role: 'shop_owner', verification_status: 'verified', onboarding_completed: true },
      { id: otherBarberId, email: otherBarberEmail, full_name: 'RLS Barber', role: 'barber', requested_role: 'barber', verification_status: 'verified', onboarding_completed: true },
    ])
    if (roleError) throw roleError
    const { error: barberProfileError } = await service.from('barbers').insert([
      { id: barberId, bio: 'Primary isolation fixture.', accepting_bookings: true },
      { id: otherBarberId, bio: 'Secondary isolation fixture.', accepting_bookings: true },
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

    // P2-01: shops start as unpublished drafts (BEFORE INSERT trigger). Publish
    // the two catalogue fixtures so they appear in public discovery; the
    // lifecycle gate keeps unpublished shops out.
    const { error: publishError } = await service.from('shops')
      .update({ lifecycle_status: 'published', published_at: new Date().toISOString() })
      .in('id', [primaryShop.id, secondShop.id])
    if (publishError) throw publishError

    const { data: patterns, error: patternError } = await service.from('shift_patterns').insert([
      { employment_id: primaryEmployment.id, barber_id: barber.id, shop_id: primaryShop.id, weekday: 1, start_time: '09:00', end_time: '17:00' },
      { employment_id: secondEmployment.id, barber_id: otherBarber.id, shop_id: secondShop.id, weekday: 2, start_time: '10:00', end_time: '18:00' },
    ]).select('*')
    if (patternError || !patterns || patterns.length !== 2) throw patternError ?? new Error('Could not create shift patterns.')

    const appointments = [
      await acceptAppointment(await createAppointment({
        customerId: customer.id,
        barberId: barber.id,
        serviceId: primaryService.id,
        startsAt: '2030-01-07T01:00:00.000Z',
      }), owner.id),
      await acceptAppointment(await createAppointment({
        customerId: otherCustomer.id,
        barberId: barber.id,
        serviceId: primaryService.id,
        startsAt: '2030-01-14T01:00:00.000Z',
      }), owner.id),
      await acceptAppointment(await createAppointment({
        customerId: otherCustomer.id,
        barberId: otherBarber.id,
        serviceId: secondService.id,
        startsAt: '2030-01-08T02:00:00.000Z',
      }), otherOwner.id),
    ]

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

  it('keeps anon off base catalogue tables and limits authenticated SELECTs to public columns', async () => {
    const [anonShops, anonBarbers, anonServices] = await Promise.all([
      authVerifier.from('shops').select('id'),
      authVerifier.from('barbers').select('id'),
      authVerifier.from('services').select('id'),
    ])
    expect(anonShops.error).not.toBeNull()
    expect(anonBarbers.error).not.toBeNull()
    expect(anonServices.error).not.toBeNull()

    const [publicShops, publicBarbers, publicServices] = await Promise.all([
      customer.client.from('shops').select('id,name,address,city,lat,lng,rating,rating_count'),
      customer.client.from('barbers').select('id,bio,rating,rating_count,shift_status,accepting_bookings'),
      customer.client.from('services').select('id,shop_id,name,duration_min,price_cents'),
    ])
    expect(publicShops.error).toBeNull()
    expect(ids(publicShops.data)).toEqual([fixtures.primaryShopId, fixtures.secondShopId].sort())
    expect(publicBarbers.error).toBeNull()
    expect(ids(publicBarbers.data)).toEqual([barber.id, otherBarber.id].sort())
    expect(publicServices.error).toBeNull()
    expect(ids(publicServices.data)).toContain(fixtures.primaryServiceId)

    const [privateShop, privateBarber, privateService] = await Promise.all([
      customer.client.from('shops').select('owner_id'),
      customer.client.from('barbers').select('created_at'),
      customer.client.from('services').select('active'),
    ])
    expect(privateShop.error).not.toBeNull()
    expect(privateBarber.error).not.toBeNull()
    expect(privateService.error).not.toBeNull()
  })

  it('exposes only eligible shops and excludes future-dated employment from public discovery', async () => {
    const { data: incompleteShop, error: incompleteShopError } = await service.from('shops').insert({
      owner_id: null,
      name: `Incomplete Catalogue Shop ${fixtureNamespace}`,
      address: '3 Isolation Street',
      city: 'Manila',
      lat: 14.61,
      lng: 120.99,
    }).select('id').single()
    expect(incompleteShopError).toBeNull()

    const futureEmail = fixtureEmail('future-catalogue-barber')
    const futureBarberId = await createFixtureUser(futureEmail, 'Future Catalogue Barber')
    const { error: futureProfileError } = await service.from('users').upsert({
      id: futureBarberId,
      email: futureEmail,
      full_name: 'Future Catalogue Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(futureProfileError).toBeNull()
    const { error: futureBarberError } = await service.from('barbers').insert({
      id: futureBarberId,
      accepting_bookings: true,
      shift_status: 'on',
    })
    expect(futureBarberError).toBeNull()
    const { error: futureEmploymentError } = await service.from('barber_employment').insert({
      barber_id: futureBarberId,
      shop_id: fixtures.primaryShopId,
      status: 'active',
      hired_at: '2099-01-01',
    })
    expect(futureEmploymentError).toBeNull()

    try {
      const [shopResponse, barberResponse, directFutureBarber] = await Promise.all([
        request(app).get('/api/v1/catalog/shops'),
        request(app).get('/api/v1/catalog/barbers'),
        customer.client
          .from('barbers')
          .select('id,bio,rating,rating_count,shift_status,accepting_bookings')
          .eq('id', futureBarberId),
      ])
      expect(shopResponse.status).toBe(200)
      expect(shopResponse.body.data.map((shop: { id: string }) => shop.id)).not.toContain(incompleteShop?.id)
      expect(shopResponse.body.data.find((shop: { id: string }) => shop.id === fixtures.primaryShopId)?.barber_ids)
        .not.toContain(futureBarberId)
      expect(barberResponse.status).toBe(200)
      expect(barberResponse.body.data.map((listed: { id: string }) => listed.id)).not.toContain(futureBarberId)
      expect(directFutureBarber.error).toBeNull()
      expect(directFutureBarber.data).toEqual([])

      for (const listedShop of shopResponse.body.data as Array<Record<string, unknown>>) {
        expect(listedShop).not.toHaveProperty('owner_id')
        expect(listedShop).not.toHaveProperty('created_at')
      }
    } finally {
      await service.from('shops').delete().eq('id', incompleteShop?.id)
      await service.auth.admin.deleteUser(futureBarberId)
    }
  })

  it('hides an otherwise-eligible shop from discovery until it is published, and again when suspended', async () => {
    const draftOwnerEmail = fixtureEmail('draft-lifecycle-owner')
    const draftOwnerId = await createFixtureUser(draftOwnerEmail, 'Draft Lifecycle Owner')
    const { error: draftOwnerError } = await service.from('users').upsert({
      id: draftOwnerId,
      email: draftOwnerEmail,
      full_name: 'Draft Lifecycle Owner',
      role: 'shop_owner',
      requested_role: 'shop_owner',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(draftOwnerError).toBeNull()
    const { data: draftShop, error: draftShopError } = await service.from('shops').insert({
      owner_id: draftOwnerId,
      name: `Draft Lifecycle Shop ${fixtureNamespace}`,
      address: '9 Lifecycle Street',
      city: 'Manila',
      lat: 14.62,
      lng: 121.0,
      lifecycle_status: 'published',
    }).select('id,lifecycle_status').single()
    expect(draftShopError).toBeNull()
    // The BEFORE INSERT trigger forces draft even though the insert asked for published.
    expect(draftShop?.lifecycle_status).toBe('draft')
    const { error: draftServiceError } = await service.from('services').insert({
      shop_id: draftShop!.id,
      name: 'Draft Cut',
      duration_min: 30,
      price_cents: 20000,
    })
    expect(draftServiceError).toBeNull()

    const listedIds = async (): Promise<string[]> => {
      const response = await request(app).get('/api/v1/catalog/shops')
      expect(response.status).toBe(200)
      return (response.body.data as Array<{ id: string }>).map((shop) => shop.id)
    }

    try {
      // Verified owner + active service, but still a draft -> hidden.
      expect(await listedIds()).not.toContain(draftShop!.id)

      // Publishing reveals it.
      const { error: publishError } = await service.from('shops')
        .update({ lifecycle_status: 'published', published_at: new Date().toISOString() })
        .eq('id', draftShop!.id)
      expect(publishError).toBeNull()
      expect(await listedIds()).toContain(draftShop!.id)

      // Suspending hides it again without deleting anything.
      const { error: suspendError } = await service.from('shops')
        .update({ lifecycle_status: 'suspended' })
        .eq('id', draftShop!.id)
      expect(suspendError).toBeNull()
      expect(await listedIds()).not.toContain(draftShop!.id)
    } finally {
      await service.from('services').delete().eq('shop_id', draftShop!.id)
      await service.from('shops').delete().eq('id', draftShop!.id)
      await service.auth.admin.deleteUser(draftOwnerId)
    }
  })

  it('returns only the public shop summary after joining by code', async () => {
    const joiningEmail = fixtureEmail('catalogue-join-barber')
    const joiningBarberId = await createFixtureUser(joiningEmail, 'Catalogue Join Barber')
    const code = `PB${crypto.randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`
    const { error: profileError } = await service.from('users').upsert({
      id: joiningBarberId,
      email: joiningEmail,
      full_name: 'Catalogue Join Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(profileError).toBeNull()
    const { error: barberError } = await service.from('barbers').insert({ id: joiningBarberId })
    expect(barberError).toBeNull()
    const { error: codeError } = await service.from('shop_join_codes').upsert({ shop_id: fixtures.primaryShopId, code })
    expect(codeError).toBeNull()
    const joiningBarber = await signIn(joiningEmail)

    try {
      const response = await request(app)
        .post('/api/v1/employment/join')
        .set('Authorization', `Bearer ${joiningBarber.token}`)
        .send({ code })

      expect(response.status).toBe(201)
      expect(Object.keys(response.body.data).sort()).toEqual([
        'address',
        'city',
        'id',
        'lat',
        'lng',
        'name',
        'rating',
        'rating_count',
      ])
      expect(response.body.data).not.toHaveProperty('owner_id')
      expect(response.body.data).not.toHaveProperty('created_at')
    } finally {
      await service.from('shop_join_codes').delete().eq('shop_id', fixtures.primaryShopId)
      await service.auth.admin.deleteUser(joiningBarberId)
    }
  })

  it('customer RLS and Express routes expose only the customer booking/messages', async () => {
    const [{ data: appointments, error: appointmentError }, { data: messages, error: messageError }, { data: patterns, error: patternError }] = await Promise.all([
      customer.client.from('appointments').select('id,customer_id'),
      customer.client.from('messages').select('id'),
      customer.client.from('shift_patterns').select('id'),
    ])
    expect(appointmentError).toBeNull()
    expect(messageError).toBeNull()
    expect(patternError).toBeNull()
    expect((appointments ?? []).every((appointment) => appointment.customer_id === customer.id)).toBe(true)
    expect(ids(appointments)).toContain(fixtures.customerAppointmentId)
    expect(ids(appointments)).not.toContain(fixtures.otherCustomerAppointmentId)
    expect(ids(appointments)).not.toContain(fixtures.secondShopAppointmentId)
    expect(ids(messages)).toEqual([fixtures.customerMessageId])
    expect(patterns).toEqual([])

    const ownBookings = await request(app).get('/api/v1/bookings').set('Authorization', `Bearer ${customer.token}`)
    expect(ownBookings.status).toBe(200)
    expect(ownBookings.body.data.every((appointment: { customer_id: string }) => appointment.customer_id === customer.id)).toBe(true)
    expect(ids(ownBookings.body.data)).toContain(fixtures.customerAppointmentId)
    expect(ids(ownBookings.body.data)).not.toContain(fixtures.otherCustomerAppointmentId)
    const ownerOnly = await request(app).get(`/api/v1/shops/${fixtures.primaryShopId}/bookings`).set('Authorization', `Bearer ${customer.token}`)
    expect(ownerOnly.status).toBe(403)
  })

  it('barber RLS is limited to assigned appointments, own shop shifts, and conversations', async () => {
    const [{ data: appointments, error: appointmentError }, { data: patterns, error: patternError }, { data: messages, error: messageError }] = await Promise.all([
      barber.client.from('appointments').select('id,barber_id'),
      barber.client.from('shift_patterns').select('id'),
      barber.client.from('messages').select('id'),
    ])
    expect(appointmentError).toBeNull()
    expect(patternError).toBeNull()
    expect(messageError).toBeNull()
    expect((appointments ?? []).every((appointment) => appointment.barber_id === barber.id)).toBe(true)
    expect(ids(appointments)).toEqual(expect.arrayContaining([fixtures.customerAppointmentId, fixtures.otherCustomerAppointmentId]))
    expect(ids(appointments)).not.toContain(fixtures.secondShopAppointmentId)
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
      owner.client.from('appointments').select('id,shop_id'),
      owner.client.from('shift_patterns').select('id'),
      owner.client.from('messages').select('id'),
    ])
    expect(appointmentError).toBeNull()
    expect(patternError).toBeNull()
    expect(messageError).toBeNull()
    expect((appointments ?? []).every((appointment) => appointment.shop_id === fixtures.primaryShopId)).toBe(true)
    expect(ids(appointments)).toEqual(expect.arrayContaining([fixtures.customerAppointmentId, fixtures.otherCustomerAppointmentId]))
    expect(ids(patterns)).not.toContain(fixtures.secondPatternId)
    expect(ids(messages)).toEqual([fixtures.customerMessageId, fixtures.otherCustomerMessageId].sort())
    expect(ids(messages)).not.toContain(fixtures.secondShopMessageId)
    expect(ids(appointments)).not.toContain(fixtures.secondShopAppointmentId)

    const ownedBookings = await request(app).get(`/api/v1/shops/${fixtures.primaryShopId}/bookings`).set('Authorization', `Bearer ${owner.token}`)
    expect(ownedBookings.status).toBe(200)
    expect(ownedBookings.body.data.every((appointment: { shop_id: string }) => appointment.shop_id === fixtures.primaryShopId)).toBe(true)
    expect(ids(ownedBookings.body.data)).toEqual(expect.arrayContaining([fixtures.customerAppointmentId, fixtures.otherCustomerAppointmentId]))
    const otherBookings = await request(app).get(`/api/v1/shops/${fixtures.secondShopId}/bookings`).set('Authorization', `Bearer ${owner.token}`)
    expect(otherBookings.status).toBe(403)
    const staff = await request(app).get(`/api/v1/shops/${fixtures.primaryShopId}/staff`).set('Authorization', `Bearer ${owner.token}`)
    expect(staff.status).toBe(200)
    expect(staff.body.data).toHaveLength(1)
    const otherStaff = await request(app).get(`/api/v1/shops/${fixtures.secondShopId}/staff`).set('Authorization', `Bearer ${owner.token}`)
    expect(otherStaff.status).toBe(403)
  })

  it('enforces the V1 one-shop owner and one-active-employment limits atomically', async () => {
    const secondOwnedShop = await request(app)
      .post('/api/v1/owner/shop')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: `Forbidden Second Owner Shop ${fixtureNamespace}`,
        address: '99 Concurrent Street',
        city: 'Manila',
        lat: 14.6001,
        lng: 120.985,
      })
    expect(secondOwnedShop.status).toBe(409)
    expect(secondOwnedShop.body.error?.code).toBe('conflict')

    const { error: secondActiveEmploymentError } = await service
      .from('barber_employment')
      .insert({
        barber_id: barber.id,
        shop_id: fixtures.secondShopId,
        status: 'active',
        hired_at: '2026-01-01',
      })
    expect(secondActiveEmploymentError?.code).toBe('23505')
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

  it('runs current-staff writes through atomic employment-aware commands', async () => {
    const shift = await request(app)
      .patch('/api/v1/barbers/me/shift-status')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ on: true })
    expect(shift.status).toBe(200)
    expect(shift.body.data).toMatchObject({ id: barber.id, shift_status: 'on' })

    const accepting = await request(app)
      .patch('/api/v1/barbers/me/accepting-bookings')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ accepting: true })
    expect(accepting.status).toBe(200)
    expect(accepting.body.data).toMatchObject({ id: barber.id, accepting_bookings: true })

    const exception = await request(app)
      .post('/api/v1/shifts/exceptions')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({
        date: '2035-02-12',
        is_available: false,
        reason: 'Atomic command integration fixture.',
      })
    expect(exception.status).toBe(201)
    expect(exception.body.data).toMatchObject({
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      is_available: false,
    })

    const removedException = await request(app)
      .delete(`/api/v1/shifts/exceptions/${exception.body.data.id}`)
      .set('Authorization', `Bearer ${barber.token}`)
    expect(removedException.status).toBe(204)

    const shiftRequest = await request(app)
      .post('/api/v1/shift-change-requests')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ date: '2035-02-12', message: 'Please adjust this future shift.' })
    expect(shiftRequest.status).toBe(201)
    expect(shiftRequest.body.data).toMatchObject({
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      status: 'pending',
    })

    const { data: sourceMessage, error: sourceMessageError } = await service
      .from('messages')
      .select('conversation_id')
      .eq('id', fixtures.customerMessageId)
      .single()
    expect(sourceMessageError).toBeNull()
    if (!sourceMessage) throw new Error('Atomic command source message was not found.')

    const sent = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ conversation_id: sourceMessage.conversation_id, body: 'Atomic staff reply.' })
    expect(sent.status).toBe(201)
    expect(sent.body.data).toMatchObject({ sender_id: barber.id, body: 'Atomic staff reply.' })

    const markedRead = await request(app)
      .post(`/api/v1/conversations/${sourceMessage.conversation_id}/read`)
      .set('Authorization', `Bearer ${barber.token}`)
    expect(markedRead.status).toBe(204)
  })

  it('denies direct JWT writes that would bypass staff and chat commands', async () => {
    const { data: currentPattern, error: patternLookupError } = await service
      .from('shift_patterns')
      .select('id')
      .eq('employment_id', fixtures.primaryEmploymentId)
      .limit(1)
      .single()
    expect(patternLookupError).toBeNull()
    if (!currentPattern) throw new Error('A current shift pattern is required for command-boundary tests.')

    const { data: commandBoundaryException, error: commandBoundaryExceptionError } = await service
      .from('shift_exceptions')
      .insert({
        employment_id: fixtures.primaryEmploymentId,
        barber_id: barber.id,
        shop_id: fixtures.primaryShopId,
        date: '2035-03-01',
        is_available: false,
        reason: 'Direct JWT command-boundary fixture.',
      })
      .select('id')
      .single()
    expect(commandBoundaryExceptionError).toBeNull()
    if (!commandBoundaryException) throw new Error('A shift exception is required for command-boundary tests.')

    const { data: sourceMessage, error: sourceMessageError } = await service
      .from('messages')
      .select('conversation_id')
      .eq('id', fixtures.customerMessageId)
      .single()
    expect(sourceMessageError).toBeNull()
    if (!sourceMessage) throw new Error('A source message is required for command-boundary tests.')

    const attempts = await Promise.all([
      barber.client.from('barbers').update({ shift_status: 'off' }).eq('id', barber.id),
      barber.client.from('shift_patterns').insert({
        employment_id: fixtures.primaryEmploymentId,
        barber_id: barber.id,
        shop_id: fixtures.primaryShopId,
        weekday: 6,
        start_time: '09:00',
        end_time: '12:00',
      }),
      barber.client.from('shift_patterns').update({ start_time: '10:00' }).eq('id', currentPattern.id),
      barber.client.from('shift_patterns').delete().eq('id', currentPattern.id),
      barber.client.from('shift_exceptions').insert({
        employment_id: fixtures.primaryEmploymentId,
        barber_id: barber.id,
        shop_id: fixtures.primaryShopId,
        date: '2035-03-02',
        is_available: false,
      }),
      barber.client.from('shift_exceptions').update({ reason: 'Bypass attempt.' }).eq('id', commandBoundaryException.id),
      barber.client.from('shift_exceptions').delete().eq('id', commandBoundaryException.id),
      barber.client.from('shift_change_requests').insert({
        employment_id: fixtures.primaryEmploymentId,
        barber_id: barber.id,
        shop_id: fixtures.primaryShopId,
        date: '2035-03-03',
        message: 'Bypass attempt.',
      }),
      barber.client.from('messages').insert({
        conversation_id: sourceMessage.conversation_id,
        sender_id: barber.id,
        body: 'Direct message bypass attempt.',
      }),
      barber.client.from('messages').update({ read_at: new Date().toISOString() }).eq('id', fixtures.customerMessageId),
      barber.client.from('barber_applications').insert({
        barber_id: barber.id,
        shop_id: fixtures.primaryShopId,
        status: 'pending',
      }),
      barber.client.rpc('api_set_barber_shift_status', {
        p_barber_id: barber.id,
        p_on: false,
      }),
    ])
    for (const attempt of attempts) expect(attempt.error).not.toBeNull()

    const { data: retainedPattern, error: retainedPatternError } = await service
      .from('shift_patterns')
      .select('id')
      .eq('id', currentPattern.id)
      .single()
    expect(retainedPatternError).toBeNull()
    expect(retainedPattern?.id).toBe(currentPattern.id)

    const { error: cleanupError } = await service
      .from('shift_exceptions')
      .delete()
      .eq('id', commandBoundaryException.id)
    expect(cleanupError).toBeNull()
  })

  it('serializes a staff capability command against concurrent employment termination', async () => {
    const raceEmail = fixtureEmail('barber-capability-race')
    const raceBarberId = await createFixtureUser(raceEmail, 'Capability Race Barber')
    const { error: profileError } = await service.from('users').upsert({
      id: raceBarberId,
      email: raceEmail,
      full_name: 'Capability Race Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(profileError).toBeNull()
    const { error: barberError } = await service.from('barbers').insert({ id: raceBarberId })
    expect(barberError).toBeNull()
    const { data: employment, error: employmentError } = await service
      .from('barber_employment')
      .insert({
        barber_id: raceBarberId,
        shop_id: fixtures.primaryShopId,
        status: 'active',
        hired_at: '2026-01-01',
      })
      .select('id')
      .single()
    expect(employmentError).toBeNull()
    if (!employment) throw new Error('Capability race employment was not created.')

    const [termination, capability] = await Promise.all([
      service.rpc('api_end_employment', {
        p_employment_id: employment.id,
        p_owner_id: owner.id,
        p_reason: 'Concurrency test employment end.',
      }),
      service.rpc('api_set_barber_shift_status', {
        p_barber_id: raceBarberId,
        p_on: true,
      }),
    ])
    expect(termination.error).toBeNull()
    expect(capability.error === null || capability.error.code === '42501').toBe(true)

    const [{ data: finalEmployment, error: finalEmploymentError }, { data: finalBarber, error: finalBarberError }] = await Promise.all([
      service.from('barber_employment').select('status,ended_at').eq('id', employment.id).single(),
      service.from('barbers').select('shift_status,accepting_bookings').eq('id', raceBarberId).single(),
    ])
    expect(finalEmploymentError).toBeNull()
    expect(finalBarberError).toBeNull()
    if (!finalEmployment) throw new Error('Capability race employment disappeared.')
    expect(finalEmployment).toMatchObject({ status: 'resigned' })
    expect(finalEmployment.ended_at).not.toBeNull()
    expect(finalBarber).toEqual({ shift_status: 'off', accepting_bookings: false })

    await service.auth.admin.deleteUser(raceBarberId)
  })

  it('rechecks suspended professional identity inside staff and join commands', async () => {
    const suspendedEmail = fixtureEmail('barber-command-suspended')
    const suspendedBarberId = await createFixtureUser(suspendedEmail, 'Suspended Command Barber')
    const { error: profileError } = await service.from('users').upsert({
      id: suspendedBarberId,
      email: suspendedEmail,
      full_name: 'Suspended Command Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(profileError).toBeNull()
    const { error: barberError } = await service.from('barbers').insert({ id: suspendedBarberId })
    expect(barberError).toBeNull()
    const { error: employmentError } = await service.from('barber_employment').insert({
      barber_id: suspendedBarberId,
      shop_id: fixtures.primaryShopId,
      status: 'active',
      hired_at: '2026-01-01',
    })
    expect(employmentError).toBeNull()
    const { error: joinCodeError } = await service.from('shop_join_codes').upsert({
      shop_id: fixtures.secondShopId,
      code: `SUSP${fixtureNamespace.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    })
    expect(joinCodeError).toBeNull()

    const { error: suspensionError } = await service
      .from('users')
      .update({ verification_status: 'suspended' })
      .eq('id', suspendedBarberId)
    expect(suspensionError).toBeNull()

    const capability = await service.rpc('api_set_barber_shift_status', {
      p_barber_id: suspendedBarberId,
      p_on: true,
    })
    expect(capability.error?.code).toBe('42501')

    const join = await service.rpc('api_join_shop_by_code', {
      p_barber_id: suspendedBarberId,
      p_code: `SUSP${fixtureNamespace.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
    })
    expect(join.error?.code).toBe('42501')

    await service.auth.admin.deleteUser(suspendedBarberId)
  })

  it('refuses to end employment until every assigned active appointment is resolved', async () => {
    const directBypass = await owner.client
      .from('barber_employment')
      .update({
        status: 'resigned',
        ended_at: '2026-07-22',
      })
      .eq('id', fixtures.primaryEmploymentId)
    expect(directBypass.error).not.toBeNull()

    const directRpc = await barber.client.rpc('api_end_employment', {
      p_employment_id: fixtures.primaryEmploymentId,
      p_owner_id: owner.id,
      p_reason: 'Forged direct termination.',
    })
    expect(directRpc.error).not.toBeNull()

    const blocked = await request(app)
      .post(`/api/v1/employment/${fixtures.primaryEmploymentId}/end`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason: 'The staff contract has ended.' })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.code).toBe('employment_has_active_bookings')

    const { data: retained, error: retainedError } = await service
      .from('barber_employment')
      .select('status,ended_at,ended_by,ended_reason')
      .eq('id', fixtures.primaryEmploymentId)
      .single()
    expect(retainedError).toBeNull()
    expect(retained).toEqual({
      status: 'active',
      ended_at: null,
      ended_by: null,
      ended_reason: null,
    })
  })

  it('revokes a former barber from shop operations while retaining history for the owner', async () => {
    const formerEmail = fixtureEmail('barber-former')
    const historyCustomerEmail = fixtureEmail('customer-former-history')
    const formerId = await createFixtureUser(formerEmail, 'Former Barber')
    const historyCustomerId = await createFixtureUser(historyCustomerEmail, 'Former Barber Customer')
    const { error: profileError } = await service.from('users').upsert([
      {
        id: formerId,
        email: formerEmail,
        full_name: 'Former Barber',
        role: 'barber',
        requested_role: 'barber',
        verification_status: 'verified',
        onboarding_completed: true,
      },
      {
        id: historyCustomerId,
        email: historyCustomerEmail,
        full_name: 'Former Barber Customer',
        role: 'customer',
        requested_role: 'customer',
        verification_status: 'not_required',
        onboarding_completed: true,
      },
    ])
    expect(profileError).toBeNull()
    const { error: barberProfileError } = await service.from('barbers').insert({
      id: formerId,
      accepting_bookings: true,
      shift_status: 'on',
    })
    expect(barberProfileError).toBeNull()
    const former = await signIn(formerEmail)

    const { data: employment, error: employmentError } = await service
      .from('barber_employment')
      .insert({
        barber_id: formerId,
        shop_id: fixtures.primaryShopId,
        status: 'active',
        hired_at: '2026-01-01',
      })
      .select('*')
      .single()
    expect(employmentError).toBeNull()

    const { data: pattern, error: patternError } = await service
      .from('shift_patterns')
      .insert({
        employment_id: employment.id,
        barber_id: formerId,
        shop_id: fixtures.primaryShopId,
        weekday: 1,
        start_time: '08:00',
        end_time: '17:00',
      })
      .select('*')
      .single()
    expect(patternError).toBeNull()
    const { data: exception, error: exceptionError } = await service
      .from('shift_exceptions')
      .insert({
        employment_id: employment.id,
        barber_id: formerId,
        shop_id: fixtures.primaryShopId,
        date: '2031-03-10',
        is_available: true,
        start_time: '08:00',
        end_time: '17:00',
        reason: 'Historical appointment fixture.',
      })
      .select('*')
      .single()
    expect(exceptionError).toBeNull()
    const { data: attendance, error: attendanceError } = await service
      .from('attendance_records')
      .insert({
        employment_id: employment.id,
        barber_id: formerId,
        shop_id: fixtures.primaryShopId,
        date: '2026-07-22',
        status: 'present',
        recorded_by: owner.id,
      })
      .select('*')
      .single()
    expect(attendanceError).toBeNull()
    const { data: shiftRequest, error: requestError } = await service
      .from('shift_change_requests')
      .insert({
        employment_id: employment.id,
        barber_id: formerId,
        shop_id: fixtures.primaryShopId,
        date: '2026-07-29',
        message: 'Historical schedule request.',
      })
      .select('*')
      .single()
    expect(requestError).toBeNull()
    const { data: note, error: noteError } = await service
      .from('staff_notes')
      .insert({
        shop_id: fixtures.primaryShopId,
        barber_id: formerId,
        author_id: owner.id,
        body: 'Historical staff note retained after departure.',
      })
      .select('*')
      .single()
    expect(noteError).toBeNull()

    const historicalAppointment = await createAppointment({
      customerId: historyCustomerId,
      barberId: formerId,
      serviceId: fixtures.primaryServiceId,
      startsAt: '2031-03-10T01:00:00.000Z',
    })
    const { data: cancelledAppointment, error: cancellationError } = await service.rpc('api_transition_appointment', {
      p_appointment_id: historicalAppointment.id as string,
      p_expected_version: historicalAppointment.version as number,
      p_action: 'cancel',
      p_actor_id: historyCustomerId,
      p_reason: 'Fixture visit resolved before employment end.',
      p_check_in_code: null,
    })
    expect(cancellationError).toBeNull()
    expect(cancelledAppointment).toMatchObject({ status: 'cancelled' })

    const { data: conversation, error: conversationError } = await service
      .from('conversations')
      .insert({
        kind: 'customer_shop',
        customer_id: historyCustomerId,
        barber_id: formerId,
        shop_id: fixtures.primaryShopId,
      })
      .select('*')
      .single()
    expect(conversationError).toBeNull()
    const { data: message, error: messageError } = await service
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id: formerId,
        body: 'Historical message retained after departure.',
      })
      .select('*')
      .single()
    expect(messageError).toBeNull()

    const beforeRevocation = await Promise.all([
      former.client.from('appointments').select('id').eq('id', historicalAppointment.id as string),
      former.client.from('messages').select('id').eq('id', message.id),
      former.client.from('shift_patterns').select('id').eq('id', pattern.id),
      former.client.from('attendance_records').select('id').eq('id', attendance.id),
      former.client.from('staff_notes').select('id').eq('id', note.id),
    ])
    expect(beforeRevocation.every((result) => result.error === null && result.data?.length === 1)).toBe(true)

    const { error: suspensionError } = await service
      .from('users')
      .update({ verification_status: 'suspended' })
      .eq('id', formerId)
    expect(suspensionError).toBeNull()
    const [{ data: suspendedMessages, error: suspendedMessageError }, suspendedApi, suspendedBooking] = await Promise.all([
      former.client.from('messages').select('id').eq('id', message.id),
      request(app).get('/api/v1/bookings').set('Authorization', `Bearer ${former.token}`),
      service.rpc('api_create_appointment', {
        p_customer_id: historyCustomerId,
        p_barber_id: formerId,
        p_service_id: fixtures.primaryServiceId,
        p_starts_at: '2031-03-10T02:00:00.000Z',
        p_notes: null,
      }),
    ])
    expect(suspendedMessageError).toBeNull()
    expect(suspendedMessages).toEqual([])
    expect(suspendedApi.status).toBe(403)
    expect(suspendedBooking.error).not.toBeNull()

    const { error: restorationError } = await service
      .from('users')
      .update({ verification_status: 'verified' })
      .eq('id', formerId)
    expect(restorationError).toBeNull()
    const { data: restoredMessages, error: restoredMessageError } = await former.client
      .from('messages')
      .select('id')
      .eq('id', message.id)
    expect(restoredMessageError).toBeNull()
    expect(ids(restoredMessages)).toEqual([message.id])

    const ended = await request(app)
      .post(`/api/v1/employment/${employment.id}/end`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason: 'Employment concluded after every assigned visit was resolved.' })
    expect(ended.status).toBe(200)
    expect(ended.body.data).toMatchObject({
      id: employment.id,
      status: 'resigned',
      ended_by: owner.id,
      ended_reason: 'Employment concluded after every assigned visit was resolved.',
    })

    const rememberedCode = `PB${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
    const { error: rememberedCodeError } = await service
      .from('shop_join_codes')
      .upsert({ shop_id: fixtures.primaryShopId, code: rememberedCode })
    expect(rememberedCodeError).toBeNull()
    const rejoin = await request(app)
      .post('/api/v1/employment/join')
      .set('Authorization', `Bearer ${former.token}`)
      .send({ code: rememberedCode })
    expect(rejoin.status).toBe(409)
    expect(rejoin.body.error.code).toBe('rehire_requires_owner_approval')
    const { data: activeAfterRejoinAttempt, error: activeAfterRejoinError } = await service
      .from('barber_employment')
      .select('id')
      .eq('barber_id', formerId)
      .eq('status', 'active')
      .is('ended_at', null)
    expect(activeAfterRejoinError).toBeNull()
    expect(activeAfterRejoinAttempt).toEqual([])
    await service.from('shop_join_codes').delete().eq('shop_id', fixtures.primaryShopId)

    const revokedReads = await Promise.all([
      former.client.from('appointments').select('id').eq('id', historicalAppointment.id as string),
      former.client.from('appointment_events').select('id').eq('appointment_id', historicalAppointment.id as string),
      former.client.from('conversations').select('id').eq('id', conversation.id),
      former.client.from('messages').select('id').eq('id', message.id),
      former.client.from('shift_patterns').select('id').eq('id', pattern.id),
      former.client.from('shift_exceptions').select('id').eq('id', exception.id),
      former.client.from('attendance_records').select('id').eq('id', attendance.id),
      former.client.from('shift_change_requests').select('id').eq('id', shiftRequest.id),
      former.client.from('staff_notes').select('id').eq('id', note.id),
    ])
    for (const result of revokedReads) {
      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    }

    const { data: ownEmployment, error: ownEmploymentError } = await former.client
      .from('barber_employment')
      .select('id,status,ended_at,ended_by,ended_reason')
      .eq('id', employment.id)
      .single()
    expect(ownEmploymentError).toBeNull()
    expect(ownEmployment).toMatchObject({
      id: employment.id,
      status: 'resigned',
      ended_by: owner.id,
    })

    const forbiddenMessage = await former.client.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: formerId,
      body: 'Former staff must not be able to send this.',
    })
    expect(forbiddenMessage.error).not.toBeNull()

    const apiRevocationChecks = await Promise.all([
      request(app).get('/api/v1/bookings').set('Authorization', `Bearer ${former.token}`),
      request(app).get('/api/v1/conversations').set('Authorization', `Bearer ${former.token}`),
      request(app).get(`/api/v1/conversations/${conversation.id}/messages`).set('Authorization', `Bearer ${former.token}`),
      request(app).post('/api/v1/messages').set('Authorization', `Bearer ${former.token}`).send({
        conversation_id: conversation.id,
        body: 'Former staff API bypass attempt.',
      }),
      request(app).get(`/api/v1/barbers/${formerId}/shifts/patterns`).set('Authorization', `Bearer ${former.token}`),
      request(app).get('/api/v1/shifts/exceptions/me').set('Authorization', `Bearer ${former.token}`),
      request(app).get('/api/v1/employment/absences').set('Authorization', `Bearer ${former.token}`),
      request(app).patch('/api/v1/barbers/me/shift-status').set('Authorization', `Bearer ${former.token}`).send({ on: true }),
    ])
    expect(apiRevocationChecks.every((result) => result.status === 403)).toBe(true)

    const ownerRetainedReads = await Promise.all([
      owner.client.from('appointments').select('id').eq('id', historicalAppointment.id as string),
      owner.client.from('appointment_events').select('id').eq('appointment_id', historicalAppointment.id as string),
      owner.client.from('conversations').select('id').eq('id', conversation.id),
      owner.client.from('messages').select('id').eq('id', message.id),
      owner.client.from('shift_patterns').select('id').eq('id', pattern.id),
      owner.client.from('shift_exceptions').select('id').eq('id', exception.id),
      owner.client.from('attendance_records').select('id').eq('id', attendance.id),
      owner.client.from('shift_change_requests').select('id').eq('id', shiftRequest.id),
      owner.client.from('staff_notes').select('id').eq('id', note.id),
    ])
    expect(ownerRetainedReads.every((result) => result.error === null && (result.data?.length ?? 0) >= 1)).toBe(true)

    const destructiveOwnerWrite = await owner.client
      .from('barber_employment')
      .delete()
      .eq('id', employment.id)
    expect(destructiveOwnerWrite.error).not.toBeNull()

    const repeatedEnd = await request(app)
      .post(`/api/v1/employment/${employment.id}/end`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason: 'Attempt to end the same employment twice.' })
    expect(repeatedEnd.status).toBe(409)
    expect(repeatedEnd.body.error.code).toBe('employment_not_active')
  }, 30_000)

  it('locks pending, rejected, and suspended professionals in both RLS and Express', async () => {
    const cases = [
      { label: 'pending-barber', requestedRole: 'barber', role: 'customer', status: 'pending' },
      { label: 'rejected-owner', requestedRole: 'shop_owner', role: 'customer', status: 'rejected' },
      { label: 'suspended-barber', requestedRole: 'barber', role: 'barber', status: 'suspended' },
      { label: 'suspended-owner', requestedRole: 'shop_owner', role: 'shop_owner', status: 'suspended' },
    ] as const
    const lockedIds: string[] = []

    for (const fixtureCase of cases) {
      const email = fixtureEmail(fixtureCase.label)
      const userId = await createFixtureUser(email, `Locked ${fixtureCase.label}`)
      lockedIds.push(userId)
      const { error: profileError } = await service.from('users').upsert({
        id: userId,
        email,
        full_name: `Locked ${fixtureCase.label}`,
        role: fixtureCase.role,
        requested_role: fixtureCase.requestedRole,
        verification_status: fixtureCase.status,
        onboarding_completed: true,
      })
      expect(profileError).toBeNull()

      const locked = await signIn(email)
      const [{ data: shops, error: shopError }, { data: ownProfile, error: profileReadError }] = await Promise.all([
        locked.client.from('shops').select('id'),
        locked.client.from('users').select('id'),
      ])
      expect(shopError).toBeNull()
      expect(profileReadError).toBeNull()
      expect(shops).toEqual([])
      expect(ownProfile).toEqual([])

      const blocked = await request(app)
        .get('/api/v1/shops')
        .set('Authorization', `Bearer ${locked.token}`)
      expect(blocked.status).toBe(403)
      expect(blocked.body.error.code).toBe('verification_locked')

      const me = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${locked.token}`)
      expect(me.status).toBe(200)
      expect(me.body.data).toMatchObject({
        id: userId,
        requested_role: fixtureCase.requestedRole,
        verification_status: fixtureCase.status,
      })
    }

    const { data: serviceProfiles, error: serviceProfileError } = await service
      .from('users')
      .select('id')
      .in('id', lockedIds)
    expect(serviceProfileError).toBeNull()
    expect(ids(serviceProfiles)).toEqual([...lockedIds].sort())
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
        expected_version: 2,
        barber_id: alternateBarberId,
        reason: 'Original barber requested approved leave.',
      })
    expect(reassigned.status).toBe(200)
    expect(reassigned.body.data).toMatchObject({ barber_id: alternateBarberId, version: 3 })

    const timeline = await request(app)
      .get(`/api/v1/bookings/${fixtures.customerAppointmentId}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
    expect(timeline.status).toBe(200)
    expect(timeline.body.data.at(-1)).toMatchObject({
      event_type: 'reassigned',
      reason: 'Original barber requested approved leave.',
    })
  })

  it('reassigns against the immutable booking snapshot after a service changes or retires', async () => {
    const { data: snapshotService, error: snapshotServiceError } = await service
      .from('services')
      .insert({
        shop_id: fixtures.primaryShopId,
        name: `Retirable Full Service ${fixtureNamespace}`,
        duration_min: 60,
        price_cents: 76000,
      })
      .select('*')
      .single()
    expect(snapshotServiceError).toBeNull()
    if (!snapshotService) throw new Error('Snapshot reassignment service was not created.')

    const booked = await createAppointment({
      customerId: otherCustomer.id,
      barberId: barber.id,
      serviceId: snapshotService.id,
      startsAt: '2034-01-02T07:00:00.000Z',
    })
    expect(booked).toMatchObject({
      booked_service_name: snapshotService.name,
      booked_duration_min: 60,
      booked_price_cents: 76000,
      ends_at: '2034-01-02T08:00:00+00:00',
    })

    const candidateIds: string[] = []
    for (const candidate of [
      { label: 'short-shift', fullName: 'Short Shift Candidate', endTime: '15:30' },
      { label: 'full-shift', fullName: 'Full Shift Candidate', endTime: '16:00' },
    ]) {
      const email = fixtureEmail(`snapshot-${candidate.label}`)
      const id = await createFixtureUser(email, candidate.fullName)
      candidateIds.push(id)
      const { error: roleError } = await service.from('users').upsert({
        id,
        email,
        full_name: candidate.fullName,
        role: 'barber',
        requested_role: 'barber',
        verification_status: 'verified',
        onboarding_completed: true,
      })
      expect(roleError).toBeNull()
      const { error: barberError } = await service.from('barbers').insert({ id, accepting_bookings: true })
      expect(barberError).toBeNull()
      const { data: employment, error: employmentError } = await service
        .from('barber_employment')
        .insert({
          barber_id: id,
          shop_id: fixtures.primaryShopId,
          status: 'active',
          hired_at: '2026-01-01',
        })
        .select('id')
        .single()
      expect(employmentError).toBeNull()
      if (!employment) throw new Error('Snapshot reassignment employment was not created.')
      const { error: patternError } = await service.from('shift_patterns').insert({
        employment_id: employment.id,
        barber_id: id,
        shop_id: fixtures.primaryShopId,
        weekday: 1,
        start_time: '09:00',
        end_time: candidate.endTime,
      })
      expect(patternError).toBeNull()
    }

    const { error: retireError } = await service
      .from('services')
      .update({
        name: `Retired Short Service ${fixtureNamespace}`,
        duration_min: 15,
        price_cents: 9900,
        active: false,
      })
      .eq('id', snapshotService.id)
    expect(retireError).toBeNull()

    const tooShort = await request(app)
      .post(`/api/v1/bookings/${booked.id}/reassign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 1,
        barber_id: candidateIds[0],
        reason: 'This candidate cannot cover the original booked duration.',
      })
    expect(tooShort.status).toBe(400)
    expect(tooShort.body.error.message).toContain('outside the barber schedule')

    const reassigned = await request(app)
      .post(`/api/v1/bookings/${booked.id}/reassign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 1,
        barber_id: candidateIds[1],
        reason: 'Move the unchanged booking to a fully available barber.',
      })
    expect(reassigned.status).toBe(200)
    expect(reassigned.body.data).toMatchObject({
      barber_id: candidateIds[1],
      booked_service_name: snapshotService.name,
      booked_duration_min: 60,
      booked_price_cents: 76000,
      ends_at: '2034-01-02T08:00:00+00:00',
      version: 2,
    })
  }, 30_000)

  it('serializes lifecycle transitions with rescheduling instead of deadlocking', async () => {
    const requested = await createAppointment({
      customerId: customer.id,
      barberId: barber.id,
      serviceId: fixtures.primaryServiceId,
      startsAt: '2034-02-06T01:00:00.000Z',
    })

    const results = await Promise.all([
      service.rpc('api_transition_appointment', {
        p_appointment_id: requested.id,
        p_expected_version: 1,
        p_action: 'accept',
        p_actor_id: owner.id,
        p_reason: null,
        p_check_in_code: null,
      }),
      service.rpc('api_reschedule_appointment', {
        p_appointment_id: requested.id,
        p_expected_version: 1,
        p_customer_id: customer.id,
        p_barber_id: barber.id,
        p_service_id: fixtures.primaryServiceId,
        p_starts_at: '2034-02-06T02:00:00.000Z',
        p_notes: null,
      }),
    ])

    expect(results.filter((result) => result.error === null)).toHaveLength(1)
    expect(results.filter((result) => result.error?.code === 'P4090')).toHaveLength(1)
    expect(results.some((result) => result.error?.code === '40P01')).toBe(false)
  })

  it('enforces slot rules in Postgres and refreshes service snapshots in both directions', async () => {
    const { data: services, error: serviceError } = await service.from('services').insert([
      {
        shop_id: fixtures.primaryShopId,
        name: `Quick Snapshot ${fixtureNamespace}`,
        duration_min: 15,
        price_cents: 12000,
      },
      {
        shop_id: fixtures.primaryShopId,
        name: `Premium Snapshot ${fixtureNamespace}`,
        duration_min: 60,
        price_cents: 88000,
      },
    ]).select('*')
    expect(serviceError).toBeNull()
    const quick = services?.find((row) => row.duration_min === 15)
    const premium = services?.find((row) => row.duration_min === 60)
    expect(quick).toBeTruthy()
    expect(premium).toBeTruthy()

    const created = await createAppointment({
      customerId: customer.id,
      barberId: barber.id,
      serviceId: quick!.id,
      startsAt: '2032-01-05T01:00:00.000Z',
    })
    expect(created).toMatchObject({
      booked_service_name: quick!.name,
      booked_duration_min: 15,
      booked_price_cents: 12000,
      ends_at: '2032-01-05T01:15:00+00:00',
    })

    const upgraded = await request(app)
      .patch(`/api/v1/bookings/${created.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        expected_version: 1,
        barber_id: barber.id,
        service_id: premium!.id,
        starts_at: '2032-01-05T01:15:00.000Z',
        notes: 'Upgrade snapshot test.',
      })
    expect(upgraded.status).toBe(200)
    expect(upgraded.body.data).toMatchObject({
      version: 2,
      booked_service_name: premium!.name,
      booked_duration_min: 60,
      booked_price_cents: 88000,
      ends_at: '2032-01-05T02:15:00+00:00',
    })

    const downgraded = await request(app)
      .patch(`/api/v1/bookings/${created.id}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        expected_version: 2,
        barber_id: barber.id,
        service_id: quick!.id,
        starts_at: '2032-01-05T02:30:00.000Z',
        notes: 'Downgrade snapshot test.',
      })
    expect(downgraded.status).toBe(200)
    expect(downgraded.body.data).toMatchObject({
      version: 3,
      booked_service_name: quick!.name,
      booked_duration_min: 15,
      booked_price_cents: 12000,
      ends_at: '2032-01-05T02:45:00+00:00',
    })

    const offGrid = await service.rpc('api_reschedule_appointment', {
      p_appointment_id: created.id,
      p_expected_version: 3,
      p_customer_id: customer.id,
      p_barber_id: barber.id,
      p_service_id: quick!.id,
      p_starts_at: '2032-01-05T02:37:00.000Z',
      p_notes: null,
    })
    expect(offGrid.error?.code).toBe('22023')
    expect(offGrid.error?.message).toContain('15-minute booking grid')

    const { error: shiftedGridExceptionError } = await service.from('shift_exceptions').insert({
      employment_id: fixtures.primaryEmploymentId,
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      date: '2032-01-19',
      is_available: true,
      start_time: '09:05',
      end_time: '10:05',
      reason: 'Proves that the booking grid is relative to the effective shift start.',
    })
    expect(shiftedGridExceptionError).toBeNull()
    const shiftedGridValid = await createAppointment({
      customerId: customer.id,
      barberId: barber.id,
      serviceId: quick!.id,
      startsAt: '2032-01-19T01:05:00.000Z',
    })
    expect(shiftedGridValid).toMatchObject({ starts_at: '2032-01-19T01:05:00+00:00' })
    const shiftedGridInvalid = await service.rpc('api_create_appointment', {
      p_customer_id: customer.id,
      p_barber_id: barber.id,
      p_service_id: quick!.id,
      p_starts_at: '2032-01-19T01:15:00.000Z',
      p_notes: null,
    })
    expect(shiftedGridInvalid.error?.code).toBe('22023')
    expect(shiftedGridInvalid.error?.message).toContain('15-minute booking grid')

    const outsideShift = await service.rpc('api_reschedule_appointment', {
      p_appointment_id: created.id,
      p_expected_version: 3,
      p_customer_id: customer.id,
      p_barber_id: barber.id,
      p_service_id: quick!.id,
      p_starts_at: '2032-01-05T10:00:00.000Z',
      p_notes: null,
    })
    expect(outsideShift.error?.code).toBe('22023')
    expect(outsideShift.error?.message).toContain('outside the barber schedule')

    const { error: pauseError } = await service.rpc('api_set_barber_accepting_bookings', {
      p_barber_id: barber.id,
      p_accepting: false,
    })
    expect(pauseError).toBeNull()
    const pausedBarber = await service.rpc('api_reschedule_appointment', {
      p_appointment_id: created.id,
      p_expected_version: 3,
      p_customer_id: customer.id,
      p_barber_id: barber.id,
      p_service_id: quick!.id,
      p_starts_at: '2032-01-12T02:30:00.000Z',
      p_notes: null,
    })
    expect(pausedBarber.error?.code).toBe('22023')
    expect(pausedBarber.error?.message).toContain('accepting bookings')
    const { error: resumeError } = await service.rpc('api_set_barber_accepting_bookings', {
      p_barber_id: barber.id,
      p_accepting: true,
    })
    expect(resumeError).toBeNull()

    const unavailableEmail = fixtureEmail('barber-reassign-unavailable')
    const unavailableId = await createFixtureUser(unavailableEmail, 'Unavailable Reassignment Barber')
    const { error: unavailableProfileError } = await service.from('users').upsert({
      id: unavailableId,
      email: unavailableEmail,
      full_name: 'Unavailable Reassignment Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(unavailableProfileError).toBeNull()
    const { error: unavailableBarberError } = await service.from('barbers').insert({
      id: unavailableId,
      accepting_bookings: false,
    })
    expect(unavailableBarberError).toBeNull()
    const { data: unavailableEmployment, error: unavailableEmploymentError } = await service
      .from('barber_employment')
      .insert({
        barber_id: unavailableId,
        shop_id: fixtures.primaryShopId,
        status: 'active',
        hired_at: '2026-01-01',
      })
      .select('id')
      .single()
    expect(unavailableEmploymentError).toBeNull()
    if (!unavailableEmployment) throw new Error('Unavailable barber employment was not created.')
    const { error: unavailablePatternError } = await service.from('shift_patterns').insert({
      employment_id: unavailableEmployment.id,
      barber_id: unavailableId,
      shop_id: fixtures.primaryShopId,
      weekday: 1,
      start_time: '09:00',
      end_time: '17:00',
    })
    expect(unavailablePatternError).toBeNull()

    const forbiddenReassign = await service.rpc('api_reassign_appointment', {
      p_appointment_id: created.id,
      p_expected_version: 3,
      p_owner_id: owner.id,
      p_barber_id: unavailableId,
      p_reason: 'This should fail because the barber is paused.',
    })
    expect(forbiddenReassign.error?.code).toBe('22023')
    expect(forbiddenReassign.error?.message).toContain('accepting bookings')

    await service.auth.admin.deleteUser(unavailableId)
  }, 30_000)

  it('enforces the owner-to-barber-to-customer lifecycle and records its timeline', async () => {
    const now = new Date()
    const slotStepMs = 15 * 60_000
    const startsAt = new Date(Math.ceil((now.getTime() + 5 * 60_000) / slotStepMs) * slotStepMs)
    const appointmentDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(startsAt)
    const appointmentDateValue = (type: Intl.DateTimeFormatPartTypes) => appointmentDateParts.find((part) => part.type === type)?.value ?? ''
    const appointmentDate = `${appointmentDateValue('year')}-${appointmentDateValue('month')}-${appointmentDateValue('day')}`
    const { error: exceptionError } = await service.from('shift_exceptions').insert({
      employment_id: fixtures.primaryEmploymentId,
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      date: appointmentDate,
      is_available: true,
      start_time: '00:00',
      end_time: '23:59',
      reason: 'Integration lifecycle window.',
    })
    expect(exceptionError).toBeNull()

    const requested = await createAppointment({
      customerId: customer.id,
      barberId: barber.id,
      serviceId: fixtures.primaryServiceId,
      startsAt: startsAt.toISOString(),
    })
    const created = await acceptAppointment(requested, owner.id)
    expect(created).toMatchObject({ status: 'confirmed', version: 2 })

    const directStatusWrite = await customer.client
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', created.id as string)
    expect(directStatusWrite.error).not.toBeNull()

    const checkedIn = await request(app)
      .post(`/api/v1/bookings/${created.id}/check-in`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 2, reason: 'Customer identity checked at the counter.' })
    expect(checkedIn.status).toBe(200)
    expect(checkedIn.body.data).toMatchObject({ status: 'checked_in', version: 3 })

    const started = await request(app)
      .post(`/api/v1/bookings/${created.id}/start`)
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ expected_version: 3 })
    expect(started.status).toBe(200)
    expect(started.body.data).toMatchObject({ status: 'in_progress', version: 4 })

    const finished = await request(app)
      .post(`/api/v1/bookings/${created.id}/finish`)
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ expected_version: 4 })
    expect(finished.status).toBe(200)
    expect(finished.body.data).toMatchObject({ status: 'awaiting_confirmation', version: 5 })

    const completed = await request(app)
      .post(`/api/v1/bookings/${created.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: 5 })
    expect(completed.status).toBe(200)
    expect(completed.body.data).toMatchObject({ status: 'completed', version: 6 })

    const stale = await request(app)
      .post(`/api/v1/bookings/${created.id}/confirm-completion`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ expected_version: 5 })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('stale_appointment')

    const timeline = await request(app)
      .get(`/api/v1/bookings/${created.id}/timeline`)
      .set('Authorization', `Bearer ${customer.token}`)
    expect(timeline.status).toBe(200)
    expect(timeline.body.data.map((event: { event_type: string }) => event.event_type)).toEqual([
      'created',
      'accepted',
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
    const expiring = await createAppointment({
      customerId: customer.id,
      barberId: barber.id,
      serviceId: fixtures.primaryServiceId,
      startsAt: '2030-01-28T02:00:00.000Z',
    })
    const finishing = await createAppointment({
      customerId: otherCustomer.id,
      barberId: barber.id,
      serviceId: fixtures.primaryServiceId,
      startsAt: '2030-01-28T03:00:00.000Z',
    })
    const { error: expirySetupError } = await service
      .from('appointments')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', expiring.id as string)
    expect(expirySetupError).toBeNull()
    const { error: completionSetupError } = await service
      .from('appointments')
      .update({
        status: 'awaiting_confirmation',
        expires_at: null,
        actual_started_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
        actual_finished_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
        completion_due_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq('id', finishing.id as string)
    expect(completionSetupError).toBeNull()

    const rows = [expiring, finishing]

    await processDueAppointmentTransitions({ auth: authVerifier, database: service })

    const { data: finalized, error: finalizedError } = await service
      .from('appointments')
      .select('id,status,version')
      .in('id', rows.map((row) => row.id as string))
    expect(finalizedError).toBeNull()
    expect(new Map((finalized ?? []).map((row) => [row.id, row.status]))).toEqual(new Map([
      [rows[0].id, 'expired'],
      [rows[1].id, 'completed'],
    ]))
  })

  it('allows only the appointment command to create rows and keeps events append-only', async () => {
    const directRow = {
      customer_id: customer.id,
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      service_id: fixtures.primaryServiceId,
      starts_at: '2030-01-28T01:00:00.000Z',
      ends_at: '2030-01-28T01:30:00.000Z',
      status: 'requested',
      booked_service_name: 'Forged snapshot',
      booked_duration_min: 30,
      booked_price_cents: 1,
    }

    const { error: customerInsertError } = await customer.client
      .from('appointments')
      .insert(directRow)
    expect(customerInsertError).not.toBeNull()

    const { error: serviceInsertError } = await service
      .from('appointments')
      .insert(directRow)
    expect(serviceInsertError).not.toBeNull()

    const { error: customerRpcError } = await customer.client.rpc('api_create_appointment', {
      p_customer_id: customer.id,
      p_barber_id: barber.id,
      p_service_id: fixtures.primaryServiceId,
      p_starts_at: '2030-01-28T01:00:00.000Z',
      p_notes: null,
    })
    expect(customerRpcError).not.toBeNull()

    const forbiddenLifecycleCalls = await Promise.all([
      customer.client.rpc('api_transition_appointment', {
        p_appointment_id: fixtures.customerAppointmentId,
        p_expected_version: 2,
        p_action: 'cancel',
        p_actor_id: customer.id,
        p_reason: 'Forged direct lifecycle call.',
        p_check_in_code: null,
      }),
      customer.client.rpc('api_issue_appointment_check_in_code', {
        p_appointment_id: fixtures.customerAppointmentId,
        p_expected_version: 2,
        p_actor_id: customer.id,
        p_code: '123456',
      }),
      customer.client.rpc('api_reschedule_appointment', {
        p_appointment_id: fixtures.customerAppointmentId,
        p_expected_version: 2,
        p_customer_id: customer.id,
        p_barber_id: barber.id,
        p_service_id: fixtures.primaryServiceId,
        p_starts_at: '2030-01-28T01:00:00.000Z',
        p_notes: null,
      }),
      customer.client.rpc('api_expire_due_appointments', {}),
      customer.client.rpc('api_finalize_due_appointments', {}),
      customer.client.rpc('api_reassign_appointment', {
        p_appointment_id: fixtures.customerAppointmentId,
        p_expected_version: 2,
        p_owner_id: customer.id,
        p_barber_id: barber.id,
        p_reason: 'Forged direct reassignment call.',
      }),
    ])
    expect(forbiddenLifecycleCalls.every((result) => result.error !== null)).toBe(true)

    const created = await createAppointment({
      customerId: customer.id,
      barberId: barber.id,
      serviceId: fixtures.primaryServiceId,
      startsAt: '2030-01-21T01:00:00.000Z',
      notes: 'Low fade, please.',
    })
    expect(created).toMatchObject({
      customer_id: customer.id,
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      service_id: fixtures.primaryServiceId,
      starts_at: '2030-01-21T01:00:00+00:00',
      ends_at: '2030-01-21T01:30:00+00:00',
      status: 'requested',
      booked_service_name: 'Primary Test Cut',
      booked_duration_min: 30,
      booked_price_cents: 30000,
      notes: 'Low fade, please.',
      version: 1,
    })

    const { error: hashReadError } = await customer.client
      .from('appointments')
      .select('id,check_in_code_hash')
      .eq('id', created.id as string)
    expect(hashReadError?.code).toBe('42501')
    const { data: safeAppointment, error: safeReadError } = await customer.client
      .from('appointments')
      .select('id,check_in_code_expires_at')
      .eq('id', created.id as string)
      .single()
    expect(safeReadError).toBeNull()
    expect(safeAppointment).toMatchObject({ id: created.id, check_in_code_expires_at: null })

    const { data: events, error: eventReadError } = await service
      .from('appointment_events')
      .select('*')
      .eq('appointment_id', created.id as string)
    expect(eventReadError).toBeNull()
    expect(events).toHaveLength(1)
    expect(events?.[0]).toMatchObject({
      event_type: 'created',
      actor_id: customer.id,
      actor_role: 'customer',
      from_status: null,
      to_status: 'requested',
    })

    const eventId = events?.[0]?.id as string
    const { error: eventInsertError } = await service
      .from('appointment_events')
      .insert({
        appointment_id: created.id,
        shop_id: fixtures.primaryShopId,
        actor_id: customer.id,
        actor_role: 'customer',
        event_type: 'created',
        from_status: null,
        to_status: 'requested',
        metadata: { forged: true },
      })
    expect(eventInsertError).not.toBeNull()
    const { error: eventUpdateError } = await service
      .from('appointment_events')
      .update({ reason: 'Attempted history rewrite.' })
      .eq('id', eventId)
    expect(eventUpdateError).not.toBeNull()
    const { error: eventDeleteError } = await service
      .from('appointment_events')
      .delete()
      .eq('id', eventId)
    expect(eventDeleteError).not.toBeNull()

    const { error: appointmentDeleteError } = await service
      .from('appointments')
      .delete()
      .eq('id', created.id as string)
    expect(appointmentDeleteError).not.toBeNull()

    const { data: retainedEvent, error: retainedEventError } = await service
      .from('appointment_events')
      .select('id,event_type,to_status')
      .eq('id', eventId)
      .single()
    expect(retainedEventError).toBeNull()
    expect(retainedEvent).toMatchObject({ id: eventId, event_type: 'created', to_status: 'requested' })

    const { error: overlapError } = await service.rpc('api_create_appointment', {
      p_customer_id: otherCustomer.id,
      p_barber_id: barber.id,
      p_service_id: fixtures.primaryServiceId,
      p_starts_at: '2030-01-21T01:00:00.000Z',
      p_notes: null,
    })
    expect(overlapError?.code).toBe('23P01')

    const { error: scheduleError } = await service.rpc('api_create_appointment', {
      p_customer_id: otherCustomer.id,
      p_barber_id: barber.id,
      p_service_id: fixtures.primaryServiceId,
      p_starts_at: '2030-01-28T12:00:00.000Z',
      p_notes: null,
    })
    expect(scheduleError?.code).toBe('22023')

    const { error: infiniteStartError } = await service.rpc('api_create_appointment', {
      p_customer_id: otherCustomer.id,
      p_barber_id: barber.id,
      p_service_id: fixtures.primaryServiceId,
      p_starts_at: 'infinity',
      p_notes: null,
    })
    expect(infiniteStartError?.code).toBe('22023')

    const { error: customerOverlapError } = await service
      .from('appointments')
      .update({ starts_at: '2030-01-14T01:00:00.000Z' })
      .eq('id', fixtures.secondShopAppointmentId)
    expect(customerOverlapError?.code).toBe('23P01')
  })

  it('serializes concurrent provider and customer claims to one winner', async () => {
    const alternateEmail = fixtureEmail('barber-race-alternate')
    const alternateBarberId = await createFixtureUser(alternateEmail, 'Race Alternate Barber')
    const { error: alternateRoleError } = await service.from('users').upsert({
      id: alternateBarberId,
      email: alternateEmail,
      full_name: 'Race Alternate Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(alternateRoleError).toBeNull()
    const { error: alternateBarberError } = await service.from('barbers').insert({
      id: alternateBarberId,
      accepting_bookings: true,
    })
    expect(alternateBarberError).toBeNull()
    const { data: alternateEmployment, error: alternateEmploymentError } = await service
      .from('barber_employment')
      .insert({
        barber_id: alternateBarberId,
        shop_id: fixtures.primaryShopId,
        status: 'active',
        hired_at: '2026-01-01',
      })
      .select('id')
      .single()
    expect(alternateEmploymentError).toBeNull()
    const { error: alternatePatternError } = await service.from('shift_patterns').insert({
      employment_id: alternateEmployment?.id,
      barber_id: alternateBarberId,
      shop_id: fixtures.primaryShopId,
      weekday: 1,
      start_time: '09:00',
      end_time: '17:00',
    })
    expect(alternatePatternError).toBeNull()

    const providerRace = await Promise.all([
      service.rpc('api_create_appointment', {
        p_customer_id: customer.id,
        p_barber_id: barber.id,
        p_service_id: fixtures.primaryServiceId,
        p_starts_at: '2030-02-04T01:00:00.000Z',
        p_notes: null,
      }),
      service.rpc('api_create_appointment', {
        p_customer_id: otherCustomer.id,
        p_barber_id: barber.id,
        p_service_id: fixtures.primaryServiceId,
        p_starts_at: '2030-02-04T01:00:00.000Z',
        p_notes: null,
      }),
    ])
    expect(providerRace.filter((result) => result.error === null)).toHaveLength(1)
    expect(providerRace.filter((result) => result.error?.code === '23P01')).toHaveLength(1)

    const customerRace = await Promise.all([
      service.rpc('api_create_appointment', {
        p_customer_id: customer.id,
        p_barber_id: barber.id,
        p_service_id: fixtures.primaryServiceId,
        p_starts_at: '2030-02-04T02:00:00.000Z',
        p_notes: null,
      }),
      service.rpc('api_create_appointment', {
        p_customer_id: customer.id,
        p_barber_id: alternateBarberId,
        p_service_id: fixtures.primaryServiceId,
        p_starts_at: '2030-02-04T02:00:00.000Z',
        p_notes: null,
      }),
    ])
    expect(customerRace.filter((result) => result.error === null)).toHaveLength(1)
    expect(customerRace.filter((result) => result.error?.code === '23P01')).toHaveLength(1)
  })
})
