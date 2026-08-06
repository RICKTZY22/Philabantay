import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { countBookableProviders, shopPublicationReadiness } from '@barbershop/shared'
import { createApp } from '../src/app'
import { processStaleShopMedia, SHOP_MEDIA_BUCKET } from '../src/lib/shop-media'
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

  /**
   * P2-07: a provider must hold an active service_qualifications row before the
   * claim gate will book them. A new hire is granted the shop's existing
   * services automatically, but a service added later is deliberately not
   * granted to anyone, because that is the gap P2-05's owner-grant and
   * barber-request flows exist to fill. Tests that mint a service mid-run
   * therefore have to qualify a provider for it, exactly as a real owner would.
   */
  async function qualifyProvider(input: {
    shopId: string
    serviceId: string
    providerId: string
    grantedBy: string
  }): Promise<void> {
    const { error } = await service.from('service_qualifications').upsert({
      shop_id: input.shopId,
      service_id: input.serviceId,
      provider_user_id: input.providerId,
      active: true,
      granted_by: input.grantedBy,
      revoked_by: null,
      revoked_at: null,
    }, { onConflict: 'shop_id,service_id,provider_user_id' })
    if (error) throw error
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

    // Crash-safe cleanup for an interrupted prior matrix. Historical fixtures
    // stay in the database, but never remain publicly discoverable.
    const { error: priorFixtureError } = await service
      .from('shops')
      .update({
        lifecycle_status: 'archived',
        published_at: null,
        is_hiring: false,
        hiring_open_positions: null,
        hiring_note: null,
      })
      .in('name', ['RLS Primary Shop', 'RLS Second Shop'])
      .eq('lifecycle_status', 'published')
    if (priorFixtureError) throw priorFixtureError

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

    const { error: shopHoursError } = await service.from('shop_operating_hours').insert([
      { shop_id: primaryShop.id, weekday: 1, open_time: '09:00', close_time: '18:00', closed: false },
      { shop_id: secondShop.id, weekday: 2, open_time: '10:00', close_time: '18:00', closed: false },
    ])
    if (shopHoursError) throw shopHoursError

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

    // P4-01 revoked every direct write on `conversations` and `messages`, including
    // from `service_role`, because a send rate limit and a block that a caller can
    // step around are not controls. The fixture therefore uses the same commands
    // the application does.
    const conversations: Array<Record<string, unknown>> = []
    for (const seed of [
      { customerId: customer.id, shopId: primaryShop.id },
      { customerId: otherCustomer.id, shopId: primaryShop.id },
      { customerId: otherCustomer.id, shopId: secondShop.id },
    ]) {
      const opened = await service.rpc('api_open_customer_conversation', {
        p_customer_id: seed.customerId,
        p_shop_id: seed.shopId,
        p_appointment_id: null,
      })
      if (opened.error || !opened.data) throw opened.error ?? new Error('Could not open a conversation.')
      conversations.push(opened.data as Record<string, unknown>)
    }
    const messages: Array<Record<string, unknown>> = []
    for (const seed of [
      { conversationId: conversations[0].id as string, senderId: customer.id, body: 'Primary customer message' },
      { conversationId: conversations[1].id as string, senderId: otherCustomer.id, body: 'Other customer message' },
      { conversationId: conversations[2].id as string, senderId: otherCustomer.id, body: 'Second shop message' },
    ]) {
      const sent = await service.rpc('api_send_message', {
        p_conversation_id: seed.conversationId,
        p_sender_id: seed.senderId,
        p_body: seed.body,
      })
      if (sent.error || !sent.data) throw sent.error ?? new Error('Could not send a fixture message.')
      messages.push(sent.data as Record<string, unknown>)
    }

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
      customerMessageId: messages[0].id as string,
      otherCustomerMessageId: messages[1].id as string,
      secondShopMessageId: messages[2].id as string,
    }
  }, 60_000)

  afterAll(async () => {
    if (!service || !fixtures) return
    const { error } = await service
      .from('shops')
      .update({
        lifecycle_status: 'archived',
        published_at: null,
        is_hiring: false,
        hiring_open_positions: null,
        hiring_note: null,
      })
      .in('id', [fixtures.primaryShopId, fixtures.secondShopId])
    if (error) throw error
  })

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

  it('projects real public shop details without private closure or media fields', async () => {
    const closureDate = '2099-01-08'
    const { error: shopUpdateError } = await service
      .from('shops')
      .update({
        description: 'A real public integration shop.',
        public_contact_phone: '+639171234567',
      })
      .eq('id', fixtures.primaryShopId)
    expect(shopUpdateError).toBeNull()
    const { error: closureError } = await service.from('shop_closures').insert({
      shop_id: fixtures.primaryShopId,
      local_date: closureDate,
      closed: true,
      reason: 'Private staffing detail',
    })
    expect(closureError).toBeNull()

    try {
      const response = await request(app).get(`/api/v1/catalog/shops/${fixtures.primaryShopId}`)
      expect(response.status).toBe(200)
      expect(response.body.data).toMatchObject({
        id: fixtures.primaryShopId,
        description: 'A real public integration shop.',
        public_contact_phone: '+639171234567',
        timezone: 'Asia/Manila',
        booking_mode: 'manual',
        chair_count: 1,
        default_buffer_min: 0,
      })
      expect(response.body.data.operating_hours).toContainEqual({
        weekday: 1,
        open_time: '09:00',
        close_time: '18:00',
        closed: false,
        block_order: 0,
      })
      expect(response.body.data.closures).toContainEqual({
        local_date: closureDate,
        closed: true,
        replacement_open_time: null,
        replacement_close_time: null,
      })
      expect(response.body.data.services).toContainEqual(expect.objectContaining({
        id: fixtures.primaryServiceId,
        shop_id: fixtures.primaryShopId,
        name: 'Primary Test Cut',
        price_cents: 30000,
      }))
      expect(response.body.data).not.toHaveProperty('owner_id')
      expect(response.body.data).not.toHaveProperty('version')
      expect(response.body.data.closures[0]).not.toHaveProperty('reason')
      for (const media of response.body.data.media as Array<Record<string, unknown>>) {
        expect(media).not.toHaveProperty('storage_path')
        expect(media).not.toHaveProperty('moderation_status')
      }
    } finally {
      await service.from('shop_closures')
        .delete()
        .eq('shop_id', fixtures.primaryShopId)
        .eq('local_date', closureDate)
    }
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
    const { error: draftHoursError } = await service.from('shop_operating_hours').insert({
      shop_id: draftShop!.id,
      weekday: 1,
      open_time: '09:00',
      close_time: '18:00',
      closed: false,
    })
    expect(draftHoursError).toBeNull()

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
      await service.from('shops').delete().eq('id', draftShop!.id)
      await service.auth.admin.deleteUser(draftOwnerId)
    }
  })

  it('lets an owner set and read shop hours and isolates them from other tenants', async () => {
    const ownerShop = await request(app)
      .get('/api/v1/owner/shop')
      .set('Authorization', `Bearer ${owner.token}`)
    expect(ownerShop.status).toBe(200)
    const put = await request(app)
      .put('/api/v1/owner/shop/hours')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: ownerShop.body.data.version, blocks: [
        { weekday: 1, open_time: '09:00', close_time: '18:00' },
        { weekday: 0, closed: true },
      ] })
    expect(put.status).toBe(200)
    expect(put.body.data.hours).toHaveLength(2)
    expect(put.body.data.shop_version).toBe(ownerShop.body.data.version + 1)

    const get = await request(app).get('/api/v1/owner/shop/hours').set('Authorization', `Bearer ${owner.token}`)
    expect(get.status).toBe(200)
    const monday = get.body.data.find((block: { weekday: number }) => block.weekday === 1)
    expect(monday.open_time).toBe('09:00')
    expect(monday.close_time).toBe('18:00')

    // A different owner sees only their own seeded hours, never this shop's.
    const otherGet = await request(app).get('/api/v1/owner/shop/hours').set('Authorization', `Bearer ${otherOwner.token}`)
    expect(otherGet.status).toBe(200)
    expect(otherGet.body.data).toHaveLength(1)
    expect(otherGet.body.data[0].shop_id).toBe(fixtures.secondShopId)
    expect(otherGet.body.data.some((block: { shop_id: string }) => block.shop_id === fixtures.primaryShopId)).toBe(false)

    // Direct RLS: a customer JWT cannot read another shop's hours rows.
    const directRead = await customer.client
      .from('shop_operating_hours')
      .select('id')
      .eq('shop_id', fixtures.primaryShopId)
    expect(directRead.data ?? []).toEqual([])
  })

  it('keeps a published shop from losing its last open-hours block or active service', async () => {
    const ownerShop = await request(app)
      .get('/api/v1/owner/shop')
      .set('Authorization', `Bearer ${owner.token}`)
    expect(ownerShop.status).toBe(200)

    const closeEveryDay = await request(app)
      .put('/api/v1/owner/shop/hours')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: ownerShop.body.data.version,
        blocks: [{ weekday: 1, closed: true }],
      })
    expect(closeEveryDay.status).toBe(409)
    // A precondition, not a stale read. The two need different codes because the
    // client's reaction is opposite: `conflict` means reload and retry, this
    // means something is missing and reloading will not change it.
    expect(closeEveryDay.body.error.code).toBe('precondition_failed')

    const hours = await request(app)
      .get('/api/v1/owner/shop/hours')
      .set('Authorization', `Bearer ${owner.token}`)
    expect(hours.status).toBe(200)
    expect(hours.body.data).toContainEqual(expect.objectContaining({
      weekday: 1,
      closed: false,
    }))

    const retireLastService = await request(app)
      .delete(`/api/v1/owner/shop/services/${fixtures.primaryServiceId}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(retireLastService.status).toBe(409)
    expect(retireLastService.body.error.code).toBe('precondition_failed')

    const { data: serviceRow, error: serviceError } = await service
      .from('services')
      .select('active')
      .eq('id', fixtures.primaryServiceId)
      .single()
    expect(serviceError).toBeNull()
    expect(serviceRow?.active).toBe(true)
  })

  it('keeps owner hiring off/open/full versioned, fresh, and outside direct-JWT access', async () => {
    const initial = await request(app)
      .get('/api/v1/owner/shop/hiring')
      .set('Authorization', `Bearer ${owner.token}`)
    expect(initial.status).toBe(200)
    expect(initial.body.data).toMatchObject({
      shop_id: fixtures.primaryShopId,
      status: 'off',
      is_hiring: false,
      open_positions: null,
    })

    const opened = await request(app)
      .patch('/api/v1/owner/shop/hiring')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: initial.body.data.shop_version,
        status: 'open',
        open_positions: 2,
        note: 'Weekend fade specialists welcome.',
      })
    expect(opened.status).toBe(200)
    expect(opened.body.data).toMatchObject({
      status: 'open',
      is_hiring: true,
      open_positions: 2,
      note: 'Weekend fade specialists welcome.',
      shop_version: initial.body.data.shop_version + 1,
    })

    const stale = await request(app)
      .patch('/api/v1/owner/shop/hiring')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: initial.body.data.shop_version, status: 'off' })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('conflict')

    const hiringShops = await request(app)
      .get('/api/v1/hiring/shops')
      .set('Authorization', `Bearer ${barber.token}`)
    expect(hiringShops.status).toBe(200)
    expect(hiringShops.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        shop_id: fixtures.primaryShopId,
        status: 'open',
        open_positions: 2,
        note: 'Weekend fade specialists welcome.',
      }),
    ]))
    expect(hiringShops.body.data.some((row: { shop_id: string }) => row.shop_id === fixtures.secondShopId)).toBe(false)

    const directRead = await customer.client.from('shops').select('id,is_hiring').eq('id', fixtures.primaryShopId)
    expect(directRead.error).not.toBeNull()
    const directWrite = await owner.client.from('shops').update({ is_hiring: false }).eq('id', fixtures.primaryShopId)
    expect(directWrite.error).not.toBeNull()

    const full = await request(app)
      .patch('/api/v1/owner/shop/hiring')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: opened.body.data.shop_version, status: 'full', note: 'Roster complete.' })
    expect(full.status).toBe(200)
    expect(full.body.data).toMatchObject({
      status: 'full',
      is_hiring: false,
      open_positions: 0,
      note: 'Roster complete.',
    })

    const afterFull = await request(app)
      .get('/api/v1/hiring/shops')
      .set('Authorization', `Bearer ${barber.token}`)
    expect(afterFull.status).toBe(200)
    expect(afterFull.body.data.some((row: { shop_id: string }) => row.shop_id === fixtures.primaryShopId)).toBe(false)

    const off = await request(app)
      .patch('/api/v1/owner/shop/hiring')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: full.body.data.shop_version, status: 'off' })
    expect(off.status).toBe(200)
    expect(off.body.data).toMatchObject({ status: 'off', is_hiring: false, open_positions: null })
  })

  it('lets an owner edit only their own service menu and retires instead of deleting history', async () => {
    const created = await request(app)
      .post('/api/v1/owner/shop/services')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: `P2 Service ${fixtureNamespace}`, duration_min: 45, price_cents: 45000 })
    expect(created.status).toBe(201)
    expect(created.body.data.shop_id).toBe(fixtures.primaryShopId)

    const edited = await request(app)
      .patch(`/api/v1/owner/shop/services/${created.body.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ price_cents: 50000 })
    expect(edited.status).toBe(200)
    expect(edited.body.data.price_cents).toBe(50000)

    const crossTenant = await request(app)
      .patch(`/api/v1/owner/shop/services/${created.body.data.id}`)
      .set('Authorization', `Bearer ${otherOwner.token}`)
      .send({ price_cents: 1 })
    expect(crossTenant.status).toBe(404)

    const retired = await request(app)
      .delete(`/api/v1/owner/shop/services/${created.body.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(retired.status).toBe(200)
    expect(retired.body.data.active).toBe(false)
  })

  it('uploads private shop media through a signed grant and isolates owner previews', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    const grant = await request(app)
      .post('/api/v1/owner/shop/media/request-upload')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        filename: 'storefront.png',
        declared_mime: 'image/png',
        declared_size_bytes: png.length,
        role: 'storefront',
        alt_text: 'Primary shop storefront',
      })
    expect(grant.status).toBe(201)
    expect(grant.body.data.media.preview_url).toBeNull()

    const upload = await fetch(grant.body.data.upload_url, {
      method: 'PUT',
      headers: { ...grant.body.data.headers, 'Content-Type': 'image/png' },
      body: png,
    })
    expect(upload.ok).toBe(true)

    const completed = await request(app)
      .post(`/api/v1/owner/shop/media/${grant.body.data.media.id}/complete`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(completed.status).toBe(200)
    expect(completed.body.data.upload_status).toBe('ready')
    expect(completed.body.data.preview_url).toContain('token=')
    const { data: mediaRow, error: mediaLookupError } = await service
      .from('shop_media')
      .select('storage_path')
      .eq('id', grant.body.data.media.id)
      .single()
    expect(mediaLookupError).toBeNull()

    const otherList = await request(app)
      .get('/api/v1/owner/shop/media')
      .set('Authorization', `Bearer ${otherOwner.token}`)
    expect(otherList.status).toBe(200)
    expect(otherList.body.data).toEqual([])

    const removed = await request(app)
      .delete(`/api/v1/owner/shop/media/${grant.body.data.media.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(removed.status).toBe(204)
    const missingObject = await service.storage
      .from(SHOP_MEDIA_BUCKET)
      .download(mediaRow!.storage_path)
    expect(missingObject.error).not.toBeNull()
    const { data: removedRow, error: removedRowError } = await service
      .from('shop_media')
      .select('id')
      .eq('id', grant.body.data.media.id)
      .maybeSingle()
    expect(removedRowError).toBeNull()
    expect(removedRow).toBeNull()
  }, 15_000)

  it('rejects content that does not match its declared image type and removes the object', async () => {
    const invalidPng = Buffer.from('This is not a PNG image.', 'utf8')
    const grant = await request(app)
      .post('/api/v1/owner/shop/media/request-upload')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        filename: 'invalid.png',
        declared_mime: 'image/png',
        declared_size_bytes: invalidPng.length,
        role: 'gallery',
        alt_text: 'Invalid content validation fixture',
      })
    expect(grant.status).toBe(201)
    const { data: mediaRow, error: mediaLookupError } = await service
      .from('shop_media')
      .select('storage_path')
      .eq('id', grant.body.data.media.id)
      .single()
    expect(mediaLookupError).toBeNull()

    const upload = await fetch(grant.body.data.upload_url, {
      method: 'PUT',
      headers: { ...grant.body.data.headers, 'Content-Type': 'image/png' },
      body: invalidPng,
    })
    expect(upload.ok).toBe(true)

    const completed = await request(app)
      .post(`/api/v1/owner/shop/media/${grant.body.data.media.id}/complete`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(completed.status).toBe(400)
    expect(completed.body.error.code).toBe('media_rejected')

    const { data: rejectedRow, error: rejectedError } = await service
      .from('shop_media')
      .select('upload_status')
      .eq('id', grant.body.data.media.id)
      .single()
    expect(rejectedError).toBeNull()
    expect(rejectedRow?.upload_status).toBe('rejected')
    const removedObject = await service.storage
      .from(SHOP_MEDIA_BUCKET)
      .download(mediaRow!.storage_path)
    expect(removedObject.error).not.toBeNull()

    const removed = await request(app)
      .delete(`/api/v1/owner/shop/media/${grant.body.data.media.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(removed.status).toBe(204)
  }, 15_000)

  it('keeps owner media listing available when one ready object is missing', async () => {
    const { data: missingMedia, error: insertError } = await service
      .from('shop_media')
      .insert({
        shop_id: fixtures.primaryShopId,
        storage_path: `${fixtures.primaryShopId}/${crypto.randomUUID()}.png`,
        role: 'gallery',
        alt_text: 'Missing preview fixture',
        declared_mime: 'image/png',
        declared_size_bytes: 1,
        upload_status: 'ready',
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    try {
      const list = await request(app)
        .get('/api/v1/owner/shop/media')
        .set('Authorization', `Bearer ${owner.token}`)
      expect(list.status).toBe(200)
      expect(list.body.data).toContainEqual(expect.objectContaining({
        id: missingMedia!.id,
        upload_status: 'ready',
        preview_url: null,
      }))
      const retryableRemoval = await request(app)
        .delete(`/api/v1/owner/shop/media/${missingMedia!.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
      expect(retryableRemoval.status).toBe(204)
    } finally {
      await service.from('shop_media').delete().eq('id', missingMedia!.id)
    }
  })

  it('cleans stale awaiting-upload metadata only after storage cleanup', async () => {
    const storagePath = `${fixtures.primaryShopId}/${crypto.randomUUID()}.png`
    const uploaded = await service.storage.from(SHOP_MEDIA_BUCKET).upload(
      storagePath,
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      { contentType: 'image/png', upsert: false },
    )
    expect(uploaded.error).toBeNull()
    const { data: staleMedia, error: insertError } = await service
      .from('shop_media')
      .insert({
        shop_id: fixtures.primaryShopId,
        storage_path: storagePath,
        role: 'gallery',
        alt_text: 'Abandoned upload fixture',
        declared_mime: 'image/png',
        declared_size_bytes: 4,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString(),
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    expect(await processStaleShopMedia({ auth: authVerifier, database: service })).toBeGreaterThanOrEqual(1)
    const { data: removedRow, error: lookupError } = await service
      .from('shop_media')
      .select('id')
      .eq('id', staleMedia!.id)
      .maybeSingle()
    expect(lookupError).toBeNull()
    expect(removedRow).toBeNull()
    const removedObject = await service.storage.from(SHOP_MEDIA_BUCKET).download(storagePath)
    expect(removedObject.error).not.toBeNull()
  }, 15_000)

  it('caps media metadata per shop and exposes a stable API error', async () => {
    const prefix = `${fixtures.secondShopId}/cap-${fixtureNamespace}-`
    const rows = Array.from({ length: 100 }, (_, index) => ({
      shop_id: fixtures.secondShopId,
      storage_path: `${prefix}${index}.png`,
      role: 'gallery',
      alt_text: `Media cap fixture ${index}`,
      declared_mime: 'image/png',
      declared_size_bytes: 1,
    }))
    try {
      const { error: fillError } = await service.from('shop_media').insert(rows)
      expect(fillError).toBeNull()

      const capped = await request(app)
        .post('/api/v1/owner/shop/media/request-upload')
        .set('Authorization', `Bearer ${otherOwner.token}`)
        .send({
          filename: 'over-limit.png',
          declared_mime: 'image/png',
          declared_size_bytes: 1,
          role: 'gallery',
          alt_text: 'Over media limit',
        })
      expect(capped.status).toBe(409)
      expect(capped.body.error.code).toBe('media_limit')
    } finally {
      await service.from('shop_media').delete().like('storage_path', `${prefix}%`)
    }
  }, 15_000)

  it('lets an owner manage shop closures and isolates them from other tenants', async () => {
    const closed = await request(app)
      .post('/api/v1/owner/shop/closures')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ local_date: '2030-12-25', closed: true, reason: 'Holiday' })
    expect(closed.status).toBe(201)
    expect(closed.body.data.closed).toBe(true)

    const shortDay = await request(app)
      .post('/api/v1/owner/shop/closures')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ local_date: '2030-12-24', closed: false, replacement_open_time: '09:00', replacement_close_time: '12:00' })
    expect(shortDay.status).toBe(201)
    expect(shortDay.body.data.replacement_close_time).toBe('12:00')

    const list = await request(app).get('/api/v1/owner/shop/closures').set('Authorization', `Bearer ${owner.token}`)
    expect(list.body.data).toHaveLength(2)

    // A different owner cannot see this shop's closures.
    const otherList = await request(app).get('/api/v1/owner/shop/closures').set('Authorization', `Bearer ${otherOwner.token}`)
    expect(otherList.body.data).toEqual([])

    // Direct RLS: a customer JWT cannot read this shop's closures.
    const directRead = await customer.client.from('shop_closures').select('id').eq('shop_id', fixtures.primaryShopId)
    expect(directRead.data ?? []).toEqual([])

    const remove = await request(app)
      .delete(`/api/v1/owner/shop/closures/${closed.body.data.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(remove.status).toBe(204)
    const after = await request(app).get('/api/v1/owner/shop/closures').set('Authorization', `Bearer ${owner.token}`)
    expect(after.body.data).toHaveLength(1)
  })

  it('counts successful join-code redemptions once and never refunds resolved requests', async () => {
    const joiningEmail = fixtureEmail('catalogue-join-barber')
    const joiningBarberId = await createFixtureUser(joiningEmail, 'Catalogue Join Barber')
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
    const joiningBarber = await signIn(joiningEmail)

    try {
      const currentHiring = await request(app).get('/api/v1/owner/shop/hiring').set('Authorization', `Bearer ${owner.token}`)
      const opened = await request(app)
        .patch('/api/v1/owner/shop/hiring')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ expected_version: currentHiring.body.data.shop_version, status: 'open', open_positions: 2 })
      expect(opened.status).toBe(200)
      const rotated = await request(app)
        .post('/api/v1/owner/shop/join-code/rotate')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ command_id: crypto.randomUUID(), expires_in_days: 7, usage_limit: 3 })
      expect(rotated.status).toBe(200)
      expect(rotated.body.data.code).toMatch(/^PB-[0-9A-F]{20}$/)

      const joinCommand = crypto.randomUUID()
      const response = await request(app)
        .post('/api/v1/employment/requests/join-code')
        .set('Authorization', `Bearer ${joiningBarber.token}`)
        .send({ code: rotated.body.data.code, idempotency_key: joinCommand })

      expect(response.status).toBe(201)
      expect(response.body.data).toMatchObject({
        barber_id: joiningBarberId,
        shop_id: fixtures.primaryShopId,
        direction: 'join_code',
        status: 'pending',
      })
      const { data: activeEmployment } = await service.from('barber_employment')
        .select('id').eq('barber_id', joiningBarberId).eq('status', 'active').is('ended_at', null)
      expect(activeEmployment).toEqual([])
      const hiddenCodes = await joiningBarber.client.from('shop_join_codes').select('code_hash')
      expect(hiddenCodes.error).not.toBeNull()
      const replay = await request(app)
        .post('/api/v1/employment/requests/join-code')
        .set('Authorization', `Bearer ${joiningBarber.token}`)
        .send({ code: rotated.body.data.code, idempotency_key: joinCommand })
      expect(replay.status).toBe(201)
      expect(replay.body.data.id).toBe(response.body.data.id)
      const metadata = await request(app).get('/api/v1/owner/shop/join-code').set('Authorization', `Bearer ${owner.token}`)
      expect(metadata.status).toBe(200)
      expect(metadata.body.data).not.toHaveProperty('code')
      expect(metadata.body.data.used_count).toBe(1)

      const declined = await request(app)
        .post(`/api/v1/employment/requests/${response.body.data.id}/decline`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ expected_version: response.body.data.version })
      expect(declined.status).toBe(200)
      expect(declined.body.data.status).toBe('declined')
      const afterDecline = await request(app)
        .get('/api/v1/owner/shop/join-code')
        .set('Authorization', `Bearer ${owner.token}`)
      expect(afterDecline.body.data.used_count).toBe(1)

      const withdrawnRequest = await request(app)
        .post('/api/v1/employment/requests/join-code')
        .set('Authorization', `Bearer ${joiningBarber.token}`)
        .send({ code: rotated.body.data.code, idempotency_key: crypto.randomUUID() })
      expect(withdrawnRequest.status).toBe(201)
      const withdrawn = await request(app)
        .post(`/api/v1/employment/requests/${withdrawnRequest.body.data.id}/withdraw`)
        .set('Authorization', `Bearer ${joiningBarber.token}`)
        .send({ expected_version: withdrawnRequest.body.data.version })
      expect(withdrawn.status).toBe(200)
      expect(withdrawn.body.data.status).toBe('withdrawn')
      const afterWithdraw = await request(app)
        .get('/api/v1/owner/shop/join-code')
        .set('Authorization', `Bearer ${owner.token}`)
      expect(afterWithdraw.body.data.used_count).toBe(2)

      const expiringRequest = await request(app)
        .post('/api/v1/employment/requests/join-code')
        .set('Authorization', `Bearer ${joiningBarber.token}`)
        .send({ code: rotated.body.data.code, idempotency_key: crypto.randomUUID() })
      expect(expiringRequest.status).toBe(201)
      const { error: expirySetupError } = await service
        .from('employment_requests')
        .update({
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString(),
          expires_at: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
        })
        .eq('id', expiringRequest.body.data.id)
      expect(expirySetupError).toBeNull()
      const expired = await service.rpc('api_expire_employment_requests')
      expect(expired.error).toBeNull()
      expect(expired.data).toBeGreaterThanOrEqual(1)
      const { data: expiredRow, error: expiredLookupError } = await service
        .from('employment_requests')
        .select('status')
        .eq('id', expiringRequest.body.data.id)
        .single()
      expect(expiredLookupError).toBeNull()
      expect(expiredRow?.status).toBe('expired')
      const afterExpire = await request(app)
        .get('/api/v1/owner/shop/join-code')
        .set('Authorization', `Bearer ${owner.token}`)
      expect(afterExpire.body.data.used_count).toBe(3)
      expect(afterExpire.body.data.remaining_uses).toBe(0)

      const exhausted = await request(app)
        .post('/api/v1/employment/requests/join-code')
        .set('Authorization', `Bearer ${joiningBarber.token}`)
        .send({ code: rotated.body.data.code, idempotency_key: crypto.randomUUID() })
      expect(exhausted.status).toBe(404)
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const invalid = await request(app)
          .post('/api/v1/employment/requests/join-code')
          .set('Authorization', `Bearer ${joiningBarber.token}`)
          .send({ code: `INVALID-${attempt}`, idempotency_key: crypto.randomUUID() })
        expect(invalid.status).toBe(attempt === 3 ? 429 : 404)
      }
      const throttled = await request(app)
        .post('/api/v1/employment/requests/join-code')
        .set('Authorization', `Bearer ${joiningBarber.token}`)
        .send({ code: rotated.body.data.code, idempotency_key: crypto.randomUUID() })
      expect(throttled.status).toBe(429)
      const revoked = await request(app)
        .post('/api/v1/owner/shop/join-code/revoke')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ expected_version: afterExpire.body.data.version, reason: 'Integration revocation check.' })
      expect(revoked.status).toBe(200)
      expect(revoked.body.data.active).toBe(false)
    } finally {
      await service.auth.admin.deleteUser(joiningBarberId)
    }
  })

  it('denies employment resolution to a verified owner who owns no shop', async () => {
    const attackerEmail = fixtureEmail('ownerless-resolution-attacker')
    const candidateEmail = fixtureEmail('ownerless-resolution-candidate')
    const attackerId = await createFixtureUser(attackerEmail, 'Ownerless Resolution Attacker')
    const candidateId = await createFixtureUser(candidateEmail, 'Ownerless Resolution Candidate')
    let requestId: string | null = null

    const { error: profilesError } = await service.from('users').upsert([
      {
        id: attackerId,
        email: attackerEmail,
        full_name: 'Ownerless Resolution Attacker',
        role: 'shop_owner',
        requested_role: 'shop_owner',
        verification_status: 'verified',
        onboarding_completed: true,
      },
      {
        id: candidateId,
        email: candidateEmail,
        full_name: 'Ownerless Resolution Candidate',
        role: 'barber',
        requested_role: 'barber',
        verification_status: 'verified',
        onboarding_completed: true,
      },
    ])
    expect(profilesError).toBeNull()
    const { error: barberError } = await service.from('barbers').insert({ id: candidateId })
    expect(barberError).toBeNull()
      const attacker = await signIn(attackerEmail)
    const candidate = await signIn(candidateEmail)

    try {
      const forgedInvitation = await service.from('employment_requests').insert({
        shop_id: fixtures.primaryShopId,
        barber_id: candidateId,
        direction: 'owner_invitation',
        created_by: attackerId,
        idempotency_key: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      expect(forgedInvitation.error?.code).toBe('42501')

      const currentHiring = await request(app)
        .get('/api/v1/owner/shop/hiring')
        .set('Authorization', `Bearer ${owner.token}`)
      const opened = await request(app)
        .patch('/api/v1/owner/shop/hiring')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          expected_version: currentHiring.body.data.shop_version,
          status: 'open',
          open_positions: 1,
        })
      expect(opened.status).toBe(200)

      const application = await request(app)
        .post('/api/v1/employment/requests')
        .set('Authorization', `Bearer ${candidate.token}`)
        .send({
          direction: 'barber_application',
          shop_id: fixtures.primaryShopId,
          idempotency_key: crypto.randomUUID(),
        })
      expect(application.status).toBe(201)
      requestId = application.body.data.id as string

      for (const action of ['accept', 'decline'] as const) {
        const response = await request(app)
          .post(`/api/v1/employment/requests/${requestId}/${action}`)
          .set('Authorization', `Bearer ${attacker.token}`)
          .send({ expected_version: application.body.data.version })
        expect(response.status).toBe(404)
        expect(response.body.error.code).toBe('not_found')

        const { data: stillPending } = await service.from('employment_requests')
          .select('status,resolved_by,version')
          .eq('id', requestId)
          .single()
        expect(stillPending).toEqual({
          status: 'pending',
          resolved_by: null,
          version: application.body.data.version,
        })
      }

      for (const action of ['accept', 'decline'] as const) {
        const direct = await service.rpc('api_resolve_employment_request', {
          p_owner_id: attacker.id,
          p_request_id: requestId,
          p_expected_version: application.body.data.version,
          p_action: action,
          p_reason: 'Unauthorized ownerless resolution attempt.',
        })
        expect(direct.error?.code).toBe('42501')
      }

      const { data: unauthorizedEmployment } = await service.from('barber_employment')
        .select('id')
        .eq('barber_id', candidateId)
        .eq('status', 'active')
        .is('ended_at', null)
      expect(unauthorizedEmployment).toEqual([])

      const legitimateDecline = await request(app)
        .post(`/api/v1/employment/requests/${requestId}/decline`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ expected_version: application.body.data.version })
      expect(legitimateDecline.status).toBe(200)
    } finally {
      if (requestId) {
        await service.from('employment_events').delete().eq('request_id', requestId)
        await service.from('employment_requests').delete().eq('id', requestId)
      }
      const currentHiring = await request(app)
        .get('/api/v1/owner/shop/hiring')
        .set('Authorization', `Bearer ${owner.token}`)
      if (currentHiring.status === 200 && currentHiring.body.data.status !== 'off') {
        await request(app)
          .patch('/api/v1/owner/shop/hiring')
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ expected_version: currentHiring.body.data.shop_version, status: 'off' })
      }
      await service.auth.admin.deleteUser(candidateId)
      await service.auth.admin.deleteUser(attackerId)
    }
  })

  it('converges application and invitation acceptance with RLS, stale, vacancy, and one-employment race safety', async () => {
    const createdIds: string[] = []
    const makeBarber = async (label: string): Promise<SignedInUser> => {
      const email = fixtureEmail(label)
      const id = await createFixtureUser(email, `${label} Barber`)
      createdIds.push(id)
      const { error: userError } = await service.from('users').upsert({
        id,
        email,
        full_name: `${label} Barber`,
        role: 'barber',
        requested_role: 'barber',
        verification_status: 'verified',
        onboarding_completed: true,
      })
      expect(userError).toBeNull()
      const { error: barberError } = await service.from('barbers').insert({ id })
      expect(barberError).toBeNull()
      return signIn(email)
    }
    const openShop = async (actor: SignedInUser, openPositions: number | null) => {
      const current = await request(app).get('/api/v1/owner/shop/hiring').set('Authorization', `Bearer ${actor.token}`)
      const opened = await request(app)
        .patch('/api/v1/owner/shop/hiring')
        .set('Authorization', `Bearer ${actor.token}`)
        .send({
          expected_version: current.body.data.shop_version,
          status: 'open',
          open_positions: openPositions,
        })
      expect(opened.status).toBe(200)
      return opened.body.data
    }

    const vacancyA = await makeBarber('vacancy-a')
    const vacancyB = await makeBarber('vacancy-b')
    const crossShop = await makeBarber('cross-shop')
    try {
      await openShop(owner, 1)
      const command = crypto.randomUUID()
      const firstApplication = await request(app)
        .post('/api/v1/employment/requests')
        .set('Authorization', `Bearer ${vacancyA.token}`)
        .send({ direction: 'barber_application', shop_id: fixtures.primaryShopId, idempotency_key: command })
      const replay = await request(app)
        .post('/api/v1/employment/requests')
        .set('Authorization', `Bearer ${vacancyA.token}`)
        .send({ direction: 'barber_application', shop_id: fixtures.primaryShopId, idempotency_key: command })
      const secondApplication = await request(app)
        .post('/api/v1/employment/requests')
        .set('Authorization', `Bearer ${vacancyB.token}`)
        .send({ direction: 'barber_application', shop_id: fixtures.primaryShopId, idempotency_key: crypto.randomUUID() })
      expect(firstApplication.status).toBe(201)
      expect(replay.body.data.id).toBe(firstApplication.body.data.id)
      expect(secondApplication.status).toBe(201)

      const stale = await request(app)
        .post(`/api/v1/employment/requests/${firstApplication.body.data.id}/accept`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ expected_version: firstApplication.body.data.version + 1 })
      expect(stale.status).toBe(409)
      expect(stale.body.error.code).toBe('conflict')

      const ownerDirect = await owner.client.from('employment_requests').select('id,shop_id')
      const otherOwnerDirect = await otherOwner.client.from('employment_requests').select('id').eq('shop_id', fixtures.primaryShopId)
      const barberDirect = await vacancyA.client.from('employment_requests').select('id,barber_id')
      const directWrite = await vacancyA.client.from('employment_requests').insert({
        shop_id: fixtures.primaryShopId,
        barber_id: vacancyA.id,
        direction: 'barber_application',
        created_by: vacancyA.id,
        idempotency_key: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      expect(ownerDirect.error).toBeNull()
      expect(ownerDirect.data?.map((row) => row.id)).toEqual(expect.arrayContaining([
        firstApplication.body.data.id,
        secondApplication.body.data.id,
      ]))
      expect(otherOwnerDirect.data).toEqual([])
      expect(barberDirect.data?.every((row) => row.barber_id === vacancyA.id)).toBe(true)
      expect(directWrite.error).not.toBeNull()

      const vacancyRace = await Promise.all([
        request(app).post(`/api/v1/employment/requests/${firstApplication.body.data.id}/accept`)
          .set('Authorization', `Bearer ${owner.token}`).send({ expected_version: firstApplication.body.data.version }),
        request(app).post(`/api/v1/employment/requests/${secondApplication.body.data.id}/accept`)
          .set('Authorization', `Bearer ${owner.token}`).send({ expected_version: secondApplication.body.data.version }),
      ])
      expect(vacancyRace.map((result) => result.status).sort()).toEqual([200, 409])
      expect(vacancyRace.find((result) => result.status === 409)?.body.error.code).toBe('hiring_full')
      const { data: vacancyEmployments } = await service.from('barber_employment')
        .select('id,barber_id').in('barber_id', [vacancyA.id, vacancyB.id]).eq('status', 'active').is('ended_at', null)
      expect(vacancyEmployments).toHaveLength(1)
      const afterVacancy = await request(app).get('/api/v1/owner/shop/hiring').set('Authorization', `Bearer ${owner.token}`)
      expect(afterVacancy.body.data).toMatchObject({ status: 'full', open_positions: 0, is_hiring: false })

      await openShop(owner, 2)
      await openShop(otherOwner, 2)
      const profile = await request(app)
        .put('/api/v1/barber/job-profile')
        .set('Authorization', `Bearer ${crossShop.token}`)
        .send({
          visible: true,
          bio: 'Concurrency-safe candidate profile.',
          experience_years: 4,
          specialties: ['Fades'],
          portfolio_media: ['https://portfolio.integration.test/fades'],
          coarse_work_area: 'Manila',
          schedule_preference: 'Weekdays',
        })
      expect(profile.status).toBe(200)
      const application = await request(app)
        .post('/api/v1/employment/requests')
        .set('Authorization', `Bearer ${crossShop.token}`)
        .send({ direction: 'barber_application', shop_id: fixtures.primaryShopId, idempotency_key: crypto.randomUUID() })
      const invitation = await request(app)
        .post('/api/v1/employment/requests')
        .set('Authorization', `Bearer ${otherOwner.token}`)
        .send({ direction: 'owner_invitation', barber_id: crossShop.id, idempotency_key: crypto.randomUUID() })
      expect(application.status).toBe(201)
      expect(invitation.status).toBe(201)
      const crossRace = await Promise.all([
        request(app).post(`/api/v1/employment/requests/${application.body.data.id}/accept`)
          .set('Authorization', `Bearer ${owner.token}`).send({ expected_version: application.body.data.version }),
        request(app).post(`/api/v1/employment/requests/${invitation.body.data.id}/accept`)
          .set('Authorization', `Bearer ${otherOwner.token}`).send({ expected_version: invitation.body.data.version }),
      ])
      expect(crossRace.map((result) => result.status).sort()).toEqual([200, 409])
      expect(['already_employed', 'request_already_resolved']).toContain(
        crossRace.find((result) => result.status === 409)?.body.error.code,
      )
      const { data: crossEmployment } = await service.from('barber_employment')
        .select('id,shop_id').eq('barber_id', crossShop.id).eq('status', 'active').is('ended_at', null)
      expect(crossEmployment).toHaveLength(1)
      const { data: crossRequests } = await service.from('employment_requests')
        .select('status').eq('barber_id', crossShop.id)
      expect(crossRequests?.map((row) => row.status).sort()).toEqual(['accepted', 'superseded'])
      const events = await crossShop.client.from('employment_events').select('event_type').eq('barber_id', crossShop.id)
      expect(events.error).toBeNull()
      expect(events.data?.map((row) => row.event_type)).toEqual(expect.arrayContaining(['request_accepted', 'request_superseded']))
      const eventMutation = await owner.client.from('employment_events').update({ reason: 'tamper' }).eq('barber_id', crossShop.id)
      expect(eventMutation.error).not.toBeNull()
    } finally {
      await service.from('barber_employment').update({
        status: 'resigned',
        ended_at: '2026-07-27',
        ended_reason: 'Integration fixture cleanup.',
      }).in('barber_id', createdIds).eq('status', 'active')
    }
  })

  it('keeps owner-provider capability and service qualifications owner-authoritative, audited, and race-safe', async () => {
    const secondService = await request(app)
      .post('/api/v1/owner/shop/services')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: `Provider Request Service ${fixtureNamespace}`, duration_min: 45, price_cents: 45000 })
    expect(secondService.status).toBe(201)

    const initial = await request(app)
      .get('/api/v1/owner/service-qualifications')
      .set('Authorization', `Bearer ${owner.token}`)
    expect(initial.status).toBe(200)
    expect(initial.body.data.owner_provider).toMatchObject({
      owner_id: owner.id,
      active: false,
      accepting_bookings: false,
      version: 0,
    })
    expect(initial.body.data.providers.map((provider: { provider_user_id: string }) => provider.provider_user_id))
      .toEqual(expect.arrayContaining([owner.id, barber.id]))

    const directReads = await Promise.all([
      owner.client.from('owner_provider_profiles').select('*'),
      owner.client.from('service_qualifications').select('*'),
      barber.client.from('service_qualification_requests').select('*'),
      owner.client.from('provider_capability_events').select('*'),
    ])
    expect(directReads.every((result) => result.error?.code === '42501')).toBe(true)
    const directRpc = await owner.client.rpc('api_set_owner_provider_capability', {
      p_actor_id: owner.id,
      p_expected_version: 0,
      p_active: true,
      p_accepting_bookings: true,
      p_reason: 'Forged direct capability call.',
      p_command_id: crypto.randomUUID(),
    })
    expect(directRpc.error?.code).toBe('42501')

    const capabilityCommand = crypto.randomUUID()
    const enabled = await request(app)
      .patch('/api/v1/owner/provider-capability')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 0,
        active: true,
        accepting_bookings: true,
        reason: 'Owner will provide selected services.',
        command_id: capabilityCommand,
      })
    expect(enabled.status).toBe(200)
    expect(enabled.body.data).toMatchObject({
      owner_id: owner.id,
      active: true,
      accepting_bookings: true,
      version: 1,
    })
    const replay = await request(app)
      .patch('/api/v1/owner/provider-capability')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 0,
        active: true,
        accepting_bookings: true,
        reason: 'Owner will provide selected services.',
        command_id: capabilityCommand,
      })
    expect(replay.status).toBe(200)
    expect(replay.body.data).toEqual(enabled.body.data)
    const reusedCommand = await request(app)
      .patch('/api/v1/owner/provider-capability')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 0,
        active: false,
        accepting_bookings: false,
        reason: 'Different input must not replay.',
        command_id: capabilityCommand,
      })
    expect(reusedCommand.status).toBe(409)
    expect(reusedCommand.body.error.code).toBe('idempotency_conflict')

    const ownerQualified = await request(app)
      .put('/api/v1/owner/service-qualifications')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        provider_user_id: owner.id,
        expected_version: 1,
        service_ids: [fixtures.primaryServiceId],
        reason: 'Owner is trained for the primary service.',
        command_id: crypto.randomUUID(),
      })
    expect(ownerQualified.status).toBe(200)
    expect(ownerQualified.body.data).toMatchObject({
      provider_user_id: owner.id,
      provider_kind: 'owner',
      eligible: true,
      qualification_version: 2,
      qualified_service_ids: [fixtures.primaryServiceId],
    })

    const barberQualified = await request(app)
      .put('/api/v1/owner/service-qualifications')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        provider_user_id: barber.id,
        expected_version: 1,
        service_ids: [fixtures.primaryServiceId],
        reason: 'Primary barber demonstrated this service.',
        command_id: crypto.randomUUID(),
      })
    expect(barberQualified.status).toBe(200)
    expect(barberQualified.body.data).toMatchObject({
      provider_user_id: barber.id,
      qualification_version: 2,
      qualified_service_ids: [fixtures.primaryServiceId],
    })

    const foreignQualification = await request(app)
      .put('/api/v1/owner/service-qualifications')
      .set('Authorization', `Bearer ${otherOwner.token}`)
      .send({
        provider_user_id: barber.id,
        expected_version: 2,
        service_ids: [fixtures.primaryServiceId],
        reason: 'Foreign owner must not grant.',
        command_id: crypto.randomUUID(),
      })
    expect([400, 403]).toContain(foreignQualification.status)

    const directGrant = await barber.client.from('service_qualifications').insert({
      shop_id: fixtures.primaryShopId,
      service_id: secondService.body.data.id,
      provider_user_id: barber.id,
      active: true,
      granted_by: barber.id,
    })
    expect(directGrant.error?.code).toBe('42501')

    const mine = await request(app)
      .get('/api/v1/barber/service-qualifications')
      .set('Authorization', `Bearer ${barber.token}`)
    expect(mine.status).toBe(200)
    expect(mine.body.data.services.find((service: { id: string }) => service.id === fixtures.primaryServiceId))
      .toMatchObject({ qualified: true, pending_request: null })

    const requestKey = crypto.randomUUID()
    const qualificationRequest = await request(app)
      .post('/api/v1/barber/service-qualification-requests')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({
        service_id: secondService.body.data.id,
        message: 'Please review my training for this service.',
        idempotency_key: requestKey,
      })
    expect(qualificationRequest.status).toBe(201)
    expect(qualificationRequest.body.data).toMatchObject({
      barber_id: barber.id,
      service_id: secondService.body.data.id,
      status: 'pending',
      version: 1,
    })
    const requestReplay = await request(app)
      .post('/api/v1/barber/service-qualification-requests')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({
        service_id: secondService.body.data.id,
        message: 'Please review my training for this service.',
        idempotency_key: requestKey,
      })
    expect(requestReplay.status).toBe(201)
    expect(requestReplay.body.data.id).toBe(qualificationRequest.body.data.id)

    const approved = await request(app)
      .post(`/api/v1/owner/service-qualification-requests/${qualificationRequest.body.data.id}/approve`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 1, reason: 'Training was reviewed in person.' })
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    expect(approved.body.data.status).toBe('approved')
    const staleApproval = await request(app)
      .post(`/api/v1/owner/service-qualification-requests/${qualificationRequest.body.data.id}/approve`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 1, reason: 'Stale duplicate approval.' })
    expect(staleApproval.status).toBe(409)
    expect(staleApproval.body.error.code).toBe('request_already_resolved')

    const afterApproval = await request(app)
      .get('/api/v1/owner/service-qualifications')
      .set('Authorization', `Bearer ${owner.token}`)
    const barberProvider = afterApproval.body.data.providers.find(
      (provider: { provider_user_id: string }) => provider.provider_user_id === barber.id,
    )
    expect(barberProvider.qualification_version).toBe(3)
    expect(barberProvider.qualified_service_ids.sort()).toEqual(
      [fixtures.primaryServiceId, secondService.body.data.id].sort(),
    )

    const race = await Promise.all([
      request(app)
        .put('/api/v1/owner/service-qualifications')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          provider_user_id: barber.id,
          expected_version: 3,
          service_ids: [fixtures.primaryServiceId],
          reason: 'First concurrent qualification set.',
          command_id: crypto.randomUUID(),
        }),
      request(app)
        .put('/api/v1/owner/service-qualifications')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          provider_user_id: barber.id,
          expected_version: 3,
          service_ids: [secondService.body.data.id],
          reason: 'Second concurrent qualification set.',
          command_id: crypto.randomUUID(),
        }),
    ])
    expect(race.map((result) => result.status).sort()).toEqual([200, 409])
    expect(race.find((result) => result.status === 409)?.body.error.code).toBe('conflict')

    const disabled = await request(app)
      .patch('/api/v1/owner/provider-capability')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 1,
        active: false,
        accepting_bookings: false,
        reason: 'Owner is pausing provider work.',
        command_id: crypto.randomUUID(),
      })
    expect(disabled.status).toBe(200)
    expect(disabled.body.data).toMatchObject({ active: false, accepting_bookings: false, version: 2 })
    const finalWorkspace = await request(app)
      .get('/api/v1/owner/service-qualifications')
      .set('Authorization', `Bearer ${owner.token}`)
    const ownerProvider = finalWorkspace.body.data.providers.find(
      (provider: { provider_user_id: string }) => provider.provider_user_id === owner.id,
    )
    expect(ownerProvider).toMatchObject({ eligible: false, accepting_bookings: false })

    const { data: events, error: eventsError } = await service.from('provider_capability_events')
      .select('id,event_type,provider_user_id')
      .eq('shop_id', fixtures.primaryShopId)
    expect(eventsError).toBeNull()
    expect(events?.map((event) => event.event_type)).toEqual(expect.arrayContaining([
      'owner_provider_enabled',
      'owner_provider_disabled',
      'qualification_granted',
      'qualification_revoked',
      'qualification_requested',
      'qualification_request_approved',
    ]))
    const eventMutation = await service.from('provider_capability_events')
      .update({ reason: 'Attempted audit rewrite.' })
      .eq('id', events?.[0]?.id)
    expect(eventMutation.error?.code).toBe('42501')

    // The race above intentionally ends on whichever concurrent set won, so the
    // fixture barber may be left revoked for the primary service. That was
    // invisible before P2-07 because nothing in the booking path read
    // qualifications; now it decides whether they can be booked at all. Restore a
    // deterministic state so the later booking tests are not order-dependent.
    await qualifyProvider({
      shopId: fixtures.primaryShopId,
      serviceId: fixtures.primaryServiceId,
      providerId: barber.id,
      grantedBy: owner.id,
    })
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

    const retiredSelfWriter = await request(app)
      .put('/api/v1/shifts/patterns')
      .set('Authorization', `Bearer ${barber.token}`)
      .send([{ weekday: 1, start_time: '08:00', end_time: '16:00' }])
    expect(retiredSelfWriter.status).toBe(404)
    const ownerOnlyRules = await request(app)
      .put(`/api/v1/owner/staff/${barber.id}/shifts`)
      .set('Authorization', `Bearer ${barber.token}`)
      .send({ expected_version: 1, blocks: [{ weekday: 2, start_time: '08:00', end_time: '16:00' }] })
    expect(ownerOnlyRules.status).toBe(403)
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
    expect(staff.body.data.some((member: { barber: { id: string } }) => member.barber.id === barber.id)).toBe(true)
    expect(staff.body.data.every(
      (member: { employment: { shop_id: string } }) => member.employment.shop_id === fixtures.primaryShopId,
    )).toBe(true)
    expect(staff.body.data.some((member: { barber: { id: string } }) => member.barber.id === otherBarber.id)).toBe(false)
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

    const ownerSchedulePath = `/api/v1/owner/staff/${barber.id}/shifts`
    const anonymousRoutes = await Promise.all([
      request(app).get(ownerSchedulePath),
      request(app).put(ownerSchedulePath).send({ expected_version: 1, blocks: [] }),
      request(app).post(`${ownerSchedulePath}/exceptions`).send({
        expected_version: 1,
        date: '2035-02-12',
        is_available: false,
      }),
      request(app).delete(`/api/v1/owner/staff/shifts/exceptions/${crypto.randomUUID()}`).send({ expected_version: 1 }),
    ])
    expect(anonymousRoutes.map((result) => result.status)).toEqual([401, 401, 401, 401])

    const barberOwnerRoutes = await Promise.all([
      request(app).get(ownerSchedulePath).set('Authorization', `Bearer ${barber.token}`),
      request(app).put(ownerSchedulePath).set('Authorization', `Bearer ${barber.token}`).send({
        expected_version: 1,
        blocks: [],
      }),
      request(app).post(`${ownerSchedulePath}/exceptions`).set('Authorization', `Bearer ${barber.token}`).send({
        expected_version: 1,
        date: '2035-02-12',
        is_available: false,
      }),
      request(app)
        .delete(`/api/v1/owner/staff/shifts/exceptions/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${barber.token}`)
        .send({ expected_version: 1 }),
    ])
    expect(barberOwnerRoutes.map((result) => result.status)).toEqual([403, 403, 403, 403])

    const initialSchedule = await request(app)
      .get(ownerSchedulePath)
      .set('Authorization', `Bearer ${owner.token}`)
    expect(initialSchedule.status, JSON.stringify(initialSchedule.body)).toBe(200)
    expect(initialSchedule.body.data).toMatchObject({
      employment_id: fixtures.primaryEmploymentId,
      barber_id: barber.id,
      schedule_version: 1,
    })
    expect(initialSchedule.body.data.patterns.length).toBeGreaterThan(0)

    const replacement = {
      expected_version: initialSchedule.body.data.schedule_version,
      blocks: [{ weekday: 1, start_time: '08:00', end_time: '16:00' }],
    }
    const scheduleRace = await Promise.all([
      request(app).put(ownerSchedulePath).set('Authorization', `Bearer ${owner.token}`).send(replacement),
      request(app).put(ownerSchedulePath).set('Authorization', `Bearer ${owner.token}`).send(replacement),
    ])
    expect(scheduleRace.map((result) => result.status).sort()).toEqual([200, 409])
    expect(scheduleRace.find((result) => result.status === 409)?.body.error.code).toBe('conflict')
    const raceWinner = scheduleRace.find((result) => result.status === 200)
    expect(raceWinner?.body.data.schedule_version).toBe(2)

    const activeBookingConflict = await request(app)
      .post(`${ownerSchedulePath}/exceptions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 2,
        date: '2030-01-07',
        is_available: false,
        reason: 'Must not erase an active booking.',
      })
    expect(activeBookingConflict.status).toBe(409)
    expect(activeBookingConflict.body.error).toMatchObject({
      code: 'schedule_has_active_bookings',
    })
    expect(activeBookingConflict.body.error.message).toContain('1 active booking(s)')

    // Narrowing a working window must be refused too, not only removing the day.
    // Before the 20260728000700 guard this silently left the booking outside the
    // barber's own availability.
    const narrowedWindowConflict = await request(app)
      .post(`${ownerSchedulePath}/exceptions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 2,
        date: '2030-01-07',
        is_available: true,
        start_time: '23:00',
        end_time: '23:30',
        reason: 'Must not orphan a booking outside the new window.',
      })
    expect(narrowedWindowConflict.status).toBe(409)
    expect(narrowedWindowConflict.body.error).toMatchObject({
      code: 'schedule_has_active_bookings',
    })

    // A window that still covers the booking is accepted, so the guard is not
    // simply refusing every edit on a booked date.
    const wideWindowAccepted = await request(app)
      .post(`${ownerSchedulePath}/exceptions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 2,
        date: '2030-01-07',
        is_available: true,
        start_time: '00:00',
        end_time: '23:59',
        reason: 'Full-day window keeps the booking inside availability.',
      })
    expect(wideWindowAccepted.status, JSON.stringify(wideWindowAccepted.body)).toBe(201)
    expect(wideWindowAccepted.body.data.schedule_version).toBe(3)

    const exception = await request(app)
      .post(`${ownerSchedulePath}/exceptions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 3,
        date: '2035-02-13',
        is_available: false,
        reason: 'Owner-authored integration fixture.',
      })
    expect(exception.status, JSON.stringify(exception.body)).toBe(201)
    expect(exception.body.data).toMatchObject({
      schedule_version: 4,
      exception: {
        barber_id: barber.id,
        is_available: false,
        source: 'owner',
      },
    })

    const removedException = await request(app)
      .delete(`/api/v1/owner/staff/shifts/exceptions/${exception.body.data.exception.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 4 })
    expect(removedException.status).toBe(200)
    expect(removedException.body.data).toMatchObject({
      removed_id: exception.body.data.exception.id,
      schedule_version: 5,
    })

    const shiftRequestKey = crypto.randomUUID()
    const shiftRequest = await request(app)
      .post('/api/v1/barber/shift-change-requests')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({
        date: '2035-02-12',
        message: 'Please adjust this future shift.',
        kind: 'time_off',
        idempotency_key: shiftRequestKey,
      })
    expect(shiftRequest.status).toBe(201)
    expect(shiftRequest.body.data).toMatchObject({
      barber_id: barber.id,
      shop_id: fixtures.primaryShopId,
      status: 'pending',
      requested_kind: 'time_off',
      version: 1,
    })

    // P2-06 idempotency: the same key returns the same request, never a second.
    const shiftRequestReplay = await request(app)
      .post('/api/v1/barber/shift-change-requests')
      .set('Authorization', `Bearer ${barber.token}`)
      .send({
        date: '2035-02-12',
        message: 'Please adjust this future shift.',
        kind: 'time_off',
        idempotency_key: shiftRequestKey,
      })
    expect(shiftRequestReplay.status).toBe(201)
    expect(shiftRequestReplay.body.data.id).toBe(shiftRequest.body.data.id)

    // P2-06 authority: approving writes the exception in the same transaction,
    // and a foreign owner cannot resolve another shop's request.
    const foreignResolve = await request(app)
      .post(`/api/v1/owner/shift-change-requests/${shiftRequest.body.data.id}/approve`)
      .set('Authorization', `Bearer ${otherOwner.token}`)
      .send({ expected_version: 1 })
    expect(foreignResolve.status).toBe(403)

    const staleResolve = await request(app)
      .post(`/api/v1/owner/shift-change-requests/${shiftRequest.body.data.id}/approve`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 99 })
    expect(staleResolve.status).toBe(409)

    const approved = await request(app)
      .post(`/api/v1/owner/shift-change-requests/${shiftRequest.body.data.id}/approve`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 1 })
    expect(approved.status).toBe(200)
    expect(approved.body.data).toMatchObject({ status: 'approved', schedule_version: 6 })
    expect(approved.body.data.exception_id).toBeTruthy()

    const { data: appliedException } = await service
      .from('shift_exceptions')
      .select('id,date,is_available,source,change_request_id')
      .eq('id', approved.body.data.exception_id as string)
      .single()
    expect(appliedException).toMatchObject({
      date: '2035-02-12',
      is_available: false,
      source: 'change_request',
      change_request_id: shiftRequest.body.data.id,
    })

    const alreadyResolved = await request(app)
      .post(`/api/v1/owner/shift-change-requests/${shiftRequest.body.data.id}/decline`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: 2 })
    expect(alreadyResolved.status).toBe(409)

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

    const { data: scheduleRevision, error: scheduleRevisionError } = await owner.client
      .from('staff_schedule_revisions')
      .select('employment_id,version')
      .eq('employment_id', fixtures.primaryEmploymentId)
      .single()
    expect(scheduleRevisionError).toBeNull()
    if (!scheduleRevision) throw new Error('A schedule revision is required for command-boundary tests.')

    const { data: scheduleEvent, error: scheduleEventError } = await owner.client
      .from('staff_schedule_events')
      .select('id,event_type')
      .eq('employment_id', fixtures.primaryEmploymentId)
      .limit(1)
      .single()
    expect(scheduleEventError).toBeNull()
    if (!scheduleEvent) throw new Error('A schedule event is required for append-only tests.')

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
      owner.client.from('shift_change_requests').update({ status: 'declined' }).eq('barber_id', barber.id),
      owner.client.from('staff_schedule_revisions').update({ version: scheduleRevision.version + 10 }).eq('employment_id', fixtures.primaryEmploymentId),
      owner.client.from('staff_schedule_events').update({ reason: 'Attempted history rewrite.' }).eq('id', scheduleEvent.id),
      owner.client.from('staff_schedule_events').delete().eq('id', scheduleEvent.id),
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

    const join = await service.rpc('api_create_join_code_request', {
      p_barber_id: suspendedBarberId,
      p_code: `SUSP${fixtureNamespace.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      p_message: null,
      p_idempotency_key: crypto.randomUUID(),
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
        idempotency_key: crypto.randomUUID(),
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

    // Opened through the command while this barber is still active, and pointed at
    // them specifically rather than at the shop's longest-serving provider.
    const { data: conversation, error: conversationError } = await service.rpc('api_open_customer_conversation', {
      p_customer_id: historyCustomerId,
      p_shop_id: fixtures.primaryShopId,
      p_appointment_id: null,
      p_barber_id: formerId,
    })
    expect(conversationError).toBeNull()
    const { data: message, error: messageError } = await service.rpc('api_send_message', {
      p_conversation_id: (conversation as { id: string }).id,
      p_sender_id: formerId,
      p_body: 'Historical message retained after departure.',
    })
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

    const currentHiring = await request(app).get('/api/v1/owner/shop/hiring').set('Authorization', `Bearer ${owner.token}`)
    const reopened = await request(app)
      .patch('/api/v1/owner/shop/hiring')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ expected_version: currentHiring.body.data.shop_version, status: 'open', open_positions: 1 })
    expect(reopened.status).toBe(200)
    const rememberedCode = await request(app)
      .post('/api/v1/owner/shop/join-code/rotate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ command_id: crypto.randomUUID(), expires_in_days: 7, usage_limit: 2 })
    expect(rememberedCode.status).toBe(200)
    const rejoin = await request(app)
      .post('/api/v1/employment/requests/join-code')
      .set('Authorization', `Bearer ${former.token}`)
      .send({ code: rememberedCode.body.data.code, idempotency_key: crypto.randomUUID() })
    expect(rejoin.status).toBe(201)
    expect(rejoin.body.data).toMatchObject({ status: 'pending', direction: 'join_code' })
    const { data: activeAfterRejoinAttempt, error: activeAfterRejoinError } = await service
      .from('barber_employment')
      .select('id')
      .eq('barber_id', formerId)
      .eq('status', 'active')
      .is('ended_at', null)
    expect(activeAfterRejoinError).toBeNull()
    expect(activeAfterRejoinAttempt).toEqual([])

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

    const exactRefusal = await request(app)
      .post(`/api/v1/bookings/${fixtures.customerAppointmentId}/reassign`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: 2,
        barber_id: alternateBarberId,
        reason: 'This must wait for customer consent.',
      })
    expect(exactRefusal.status).toBe(409)
    expect(exactRefusal.body.error.code).toBe('precondition_failed')

    const { error: preferenceError } = await service.from('appointments')
      .update({ barber_preference: 'preferred' })
      .eq('id', fixtures.customerAppointmentId)
    expect(preferenceError).toBeNull()

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

    // The fixture barber was hired before this service existed, so nothing has
    // granted it to them. The candidate barbers below are employed after it and
    // are auto-granted on hire.
    await qualifyProvider({
      shopId: fixtures.primaryShopId,
      serviceId: snapshotService.id,
      providerId: barber.id,
      grantedBy: owner.id,
    })

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
    const { error: preferredError } = await service.from('appointments')
      .update({ barber_preference: 'preferred' })
      .eq('id', booked.id as string)
    expect(preferredError).toBeNull()

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

    for (const created of [quick!, premium!]) {
      await qualifyProvider({
        shopId: fixtures.primaryShopId,
        serviceId: created.id,
        providerId: barber.id,
        grantedBy: owner.id,
      })
    }

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

    // This probe targets provider eligibility rather than exact-choice consent.
    const { error: reassignPreferenceError } = await service.from('appointments')
      .update({ barber_preference: 'preferred' })
      .eq('id', created.id as string)
    expect(reassignPreferenceError).toBeNull()

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

    // This test books "a few minutes from now", so the calendar day and clock
    // time vary with every run. The shift exception above already opens the
    // barber's schedule for that day; since P2-07 the shop's own hours are an
    // availability input too, and the fixture only publishes a Monday block, so
    // open the shop for the same date the same way.
    const { error: openShopError } = await service.from('shop_closures').insert({
      shop_id: fixtures.primaryShopId,
      local_date: appointmentDate,
      closed: false,
      replacement_open_time: '00:00',
      replacement_close_time: '23:59',
      reason: 'Integration lifecycle window.',
    })
    expect(openShopError).toBeNull()

    // Pre-existing time-of-day fragility, fixed here rather than left to fail
    // overnight. This test needs a start within check-in's 30-minute window, and
    // shift_exceptions.end_time is a time-of-day, so the whole service must also
    // fit inside one local day. With the 30-minute fixture service both
    // constraints are unsatisfiable for the last half hour before midnight. A
    // five-minute service satisfies them at every hour.
    const { data: shortService, error: shortServiceError } = await service.from('services').insert({
      shop_id: fixtures.primaryShopId,
      name: `Lifecycle Express ${fixtureNamespace}`,
      duration_min: 5,
      price_cents: 9000,
    }).select('id').single()
    expect(shortServiceError).toBeNull()
    await qualifyProvider({
      shopId: fixtures.primaryShopId,
      serviceId: shortService!.id,
      providerId: barber.id,
      grantedBy: owner.id,
    })

    const requested = await createAppointment({
      customerId: customer.id,
      barberId: barber.id,
      serviceId: shortService!.id,
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

  // ---- P2-07 availability engine (AVAIL-01, AVAIL-02, BOOK-02) -------------
  // Each input the phase contract lists gets its own refusal. Before P2-07 the
  // claim gate read none of publication, opening hours, closures, qualification,
  // buffers, the booking window, or chair capacity, so a draft shop and a closed
  // date were both bookable.
  //
  // 2030-03-04, -11, -18 and -25 are Mondays, matching the fixture's weekday-1
  // shift pattern and opening hours, and are clear of every other fixture date.
  const book = (customerId: string, barberId: string, startsAt: string, extra: Record<string, unknown> = {}) =>
    service.rpc('api_create_appointment', {
      p_customer_id: customerId,
      p_barber_id: barberId,
      p_service_id: fixtures.primaryServiceId,
      p_starts_at: startsAt,
      p_notes: null,
      ...extra,
    })

  async function withShopFields<T>(
    fields: Record<string, unknown>,
    body: () => Promise<T>,
  ): Promise<T> {
    const { data: before, error: readError } = await service
      .from('shops')
      .select(Object.keys(fields).join(','))
      .eq('id', fixtures.primaryShopId)
      .single()
    expect(readError).toBeNull()
    const { error: setError } = await service.from('shops').update(fields).eq('id', fixtures.primaryShopId)
    expect(setError).toBeNull()
    try {
      return await body()
    } finally {
      // Always restore, even on a failed assertion, so one broken expectation
      // cannot leave the shared fixture shop in a state that breaks the rest.
      await service.from('shops')
        .update(before as unknown as Record<string, unknown>)
        .eq('id', fixtures.primaryShopId)
    }
  }

  it('refuses to book a shop that is not published', async () => {
    await withShopFields({ lifecycle_status: 'suspended' }, async () => {
      const suspended = await book(customer.id, barber.id, '2030-03-04T01:00:00.000Z')
      expect(suspended.error?.code).toBe('P4027')
    })

    await withShopFields({ lifecycle_status: 'draft', published_at: null }, async () => {
      const draft = await book(customer.id, barber.id, '2030-03-04T01:00:00.000Z')
      expect(draft.error?.code).toBe('P4027')
    })

    // Positive control: the same request succeeds once the shop is published
    // again, proving the refusals above were about publication and nothing else.
    const published = await book(customer.id, barber.id, '2030-03-04T01:00:00.000Z')
    expect(published.error).toBeNull()
    await service.from('appointments').delete().eq('id', (published.data as { id: string }).id)
  })

  it('refuses times outside the shop opening hours and on closure dates', async () => {
    // The fixture shift (09:00-17:00) sits inside the fixture hours
    // (09:00-18:00), so hours are only observable once they are narrower than the
    // shift. 14:00 is inside the barber's shift and outside a 09:00-12:00 shop.
    await withShopFields({}, async () => {
      const { error: narrowError } = await service
        .from('shop_operating_hours')
        .update({ close_time: '12:00' })
        .eq('shop_id', fixtures.primaryShopId)
        .eq('weekday', 1)
      expect(narrowError).toBeNull()
      try {
        const outside = await book(customer.id, barber.id, '2030-03-11T06:00:00.000Z')
        expect(outside.error?.code).toBe('P4028')
        const inside = await book(customer.id, barber.id, '2030-03-11T01:00:00.000Z')
        expect(inside.error).toBeNull()
        await service.from('appointments').delete().eq('id', (inside.data as { id: string }).id)
      } finally {
        await service
          .from('shop_operating_hours')
          .update({ close_time: '18:00' })
          .eq('shop_id', fixtures.primaryShopId)
          .eq('weekday', 1)
      }
    })

    const { data: closure, error: closureError } = await service.from('shop_closures').insert({
      shop_id: fixtures.primaryShopId,
      local_date: '2030-03-18',
      closed: true,
      reason: 'P2-07 closure regression',
    }).select('id').single()
    expect(closureError).toBeNull()
    try {
      const closed = await book(customer.id, barber.id, '2030-03-18T01:00:00.000Z')
      expect(closed.error?.code).toBe('P4028')

      // Replacement hours reopen a narrower day: 09:00 is inside, 14:00 is not.
      const { error: replaceError } = await service.from('shop_closures').update({
        closed: false,
        replacement_open_time: '09:00',
        replacement_close_time: '12:00',
      }).eq('id', closure?.id as string)
      expect(replaceError).toBeNull()

      const outsideReplacement = await book(customer.id, barber.id, '2030-03-18T06:00:00.000Z')
      expect(outsideReplacement.error?.code).toBe('P4028')
      const insideReplacement = await book(customer.id, barber.id, '2030-03-18T01:00:00.000Z')
      expect(insideReplacement.error).toBeNull()
      await service.from('appointments').delete().eq('id', (insideReplacement.data as { id: string }).id)
    } finally {
      await service.from('shop_closures').delete().eq('id', closure?.id as string)
    }
  })

  it('requires an active service qualification before anyone can be booked', async () => {
    // 20260730000300 grants by default when an employment goes active, so the
    // fixture barber arrives already qualified. That default is the thing under
    // test as much as the refusal is.
    const { data: granted, error: grantedError } = await service
      .from('service_qualifications')
      .select('id,active')
      .eq('shop_id', fixtures.primaryShopId)
      .eq('service_id', fixtures.primaryServiceId)
      .eq('provider_user_id', barber.id)
      .single()
    expect(grantedError).toBeNull()
    expect(granted?.active).toBe(true)

    const { error: revokeError } = await service.from('service_qualifications').update({
      active: false,
      revoked_by: owner.id,
      revoked_at: new Date().toISOString(),
    }).eq('id', granted?.id as string)
    expect(revokeError).toBeNull()
    try {
      const unqualified = await book(customer.id, barber.id, '2030-03-25T01:00:00.000Z')
      expect(unqualified.error?.code).toBe('P4030')
    } finally {
      await service.from('service_qualifications').update({
        active: true,
        revoked_by: null,
        revoked_at: null,
      }).eq('id', granted?.id as string)
    }

    const requalified = await book(customer.id, barber.id, '2030-03-25T01:00:00.000Z')
    expect(requalified.error).toBeNull()
    await service.from('appointments').delete().eq('id', (requalified.data as { id: string }).id)
  })

  it('enforces the booking lead time and advance horizon', async () => {
    // The gate checks the booking window (`require_booking_window`) before it
    // ever looks at the shift, so the two refusals below do not need a slot the
    // barber actually works -- any future instant reaches the bound first.
    //
    // That matters, because the previous version snapped this to the fixture's
    // Monday and then asserted a hardcoded 10080-minute (seven day) lead. The
    // snap puts the slot 1.8 to 7.8 days out depending on the weekday, so on a
    // Sunday it lands 7.8 days out, clears the requirement, and the booking is
    // accepted. `shops_min_lead_range` caps the column at 10080, so no lead
    // value can refuse a slot that far out: the approach was unfixable on
    // Sundays rather than merely mistuned. Introduced in P2-07 and first seen
    // 2026-08-02, the first Sunday anyone ran the matrix.
    const threeDaysOut = new Date(Date.now() + 3 * 86_400_000)
    const windowProbe = `${threeDaysOut.toISOString().slice(0, 10)}T01:00:00.000Z`

    // 2 to 3 days out on every weekday: inside a seven-day lead, and beyond a
    // one-day horizon.
    await withShopFields({ min_lead_minutes: 10080 }, async () => {
      const tooSoon = await book(customer.id, barber.id, windowProbe)
      expect(tooSoon.error?.code).toBe('P4029')
    })

    await withShopFields({ max_advance_days: 1 }, async () => {
      const tooFar = await book(customer.id, barber.id, windowProbe)
      expect(tooFar.error?.code).toBe('P4029')
    })

    // The default is no lead time and a null horizon, which must be a true
    // no-op: the fixture's own 2030 appointments prove a null horizon imposes
    // nothing, and this confirms a real slot is accepted with the defaults.
    // This half does need the barber's Monday shift.
    const soon = new Date(Date.now() + 2 * 86_400_000)
    soon.setUTCDate(soon.getUTCDate() + ((8 - soon.getUTCDay()) % 7))
    const startsAt = `${soon.toISOString().slice(0, 10)}T01:00:00.000Z`
    const accepted = await book(customer.id, barber.id, startsAt)
    expect(accepted.error, JSON.stringify(accepted.error)).toBeNull()
    await service.from('appointments').delete().eq('id', (accepted.data as { id: string }).id)
  })

  it('keeps a cleanup buffer clear after a booking', async () => {
    await withShopFields({ default_buffer_min: 30 }, async () => {
      // Snapshotted at insert, so the buffer must be set before this booking.
      const first = await book(customer.id, barber.id, '2030-03-04T02:00:00.000Z')
      expect(first.error).toBeNull()
      const created = first.data as { id: string; ends_at: string; booked_buffer_min: number }
      expect(created.booked_buffer_min).toBe(30)
      // The buffer must not extend the customer-visible end of the appointment.
      expect(created.ends_at).toBe('2030-03-04T02:30:00+00:00')

      try {
        // 10:30 Manila starts exactly when the service ended, but the chair is
        // still being cleaned until 11:00.
        const inBuffer = await book(otherCustomer.id, barber.id, '2030-03-04T02:30:00.000Z')
        expect(inBuffer.error?.code).toBe('23P01')

        const afterBuffer = await book(otherCustomer.id, barber.id, '2030-03-04T03:00:00.000Z')
        expect(afterBuffer.error).toBeNull()
        await service.from('appointments').delete().eq('id', (afterBuffer.data as { id: string }).id)
      } finally {
        await service.from('appointments').delete().eq('id', created.id)
      }
    })
  })

  it('never exceeds the shop chair count across different providers', async () => {
    // Chair capacity is the one input that per-barber checks cannot express: two
    // customers booking two different barbers both pass provider and customer
    // overlap and still want the same chair.
    const chairEmail = fixtureEmail('barber-chair-capacity')
    const chairBarberId = await createFixtureUser(chairEmail, 'Chair Capacity Barber')
    const { error: roleError } = await service.from('users').upsert({
      id: chairBarberId,
      email: chairEmail,
      full_name: 'Chair Capacity Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(roleError).toBeNull()
    const { error: barberRowError } = await service.from('barbers').insert({
      id: chairBarberId,
      accepting_bookings: true,
    })
    expect(barberRowError).toBeNull()
    const { data: chairEmployment, error: employmentError } = await service
      .from('barber_employment')
      .insert({
        barber_id: chairBarberId,
        shop_id: fixtures.primaryShopId,
        status: 'active',
        hired_at: '2026-01-01',
      })
      .select('id')
      .single()
    expect(employmentError).toBeNull()
    const { error: patternError } = await service.from('shift_patterns').insert({
      employment_id: chairEmployment?.id,
      barber_id: chairBarberId,
      shop_id: fixtures.primaryShopId,
      weekday: 1,
      start_time: '09:00',
      end_time: '17:00',
    })
    expect(patternError).toBeNull()

    // The employment trigger must have qualified the new hire for the shop's
    // active service, otherwise the refusal below would be about qualification.
    const { data: autoGrant } = await service
      .from('service_qualifications')
      .select('active')
      .eq('shop_id', fixtures.primaryShopId)
      .eq('service_id', fixtures.primaryServiceId)
      .eq('provider_user_id', chairBarberId)
      .single()
    expect(autoGrant?.active).toBe(true)

    const slot = '2030-03-11T03:00:00.000Z'
    const first = await book(customer.id, barber.id, slot)
    expect(first.error).toBeNull()
    const firstId = (first.data as { id: string }).id
    try {
      // The fixture shop has chair_count 1, so the second provider has nowhere
      // to work even though nothing about them personally is unavailable.
      const second = await book(otherCustomer.id, chairBarberId, slot)
      expect(second.error?.code).toBe('P4026')

      // Two chairs make the same request legal, which proves the refusal was the
      // chair count rather than an unrelated conflict.
      await withShopFields({ chair_count: 2 }, async () => {
        const withTwoChairs = await book(otherCustomer.id, chairBarberId, slot)
        expect(withTwoChairs.error).toBeNull()
        await service.from('appointments').delete().eq('id', (withTwoChairs.data as { id: string }).id)
      })

      // AVAIL-02: concurrent claims for the last chair produce exactly one win.
      const raceSlot = '2030-03-11T04:00:00.000Z'
      const race = await Promise.all([
        book(customer.id, barber.id, raceSlot),
        book(otherCustomer.id, chairBarberId, raceSlot),
      ])
      expect(race.filter((result) => result.error === null)).toHaveLength(1)
      expect(race.filter((result) => result.error?.code === 'P4026')).toHaveLength(1)
      for (const won of race.filter((result) => result.error === null)) {
        await service.from('appointments').delete().eq('id', (won.data as { id: string }).id)
      }
    } finally {
      await service.from('appointments').delete().eq('id', firstId)
      await service.from('shift_patterns').delete().eq('employment_id', chairEmployment?.id as string)
      await service.from('barber_employment').delete().eq('id', chairEmployment?.id as string)
    }
  })

  it('offers only slots the claim command would accept', async () => {
    // AVAIL-01. The projection used to be computed independently of the claim
    // gate, so it could advertise a slot that submit then refused. Asserting that
    // every offered slot is quotable is the property that stops them drifting.
    const { data: slots, error: slotError } = await service.rpc('api_availability_slots', {
      p_shop_id: fixtures.primaryShopId,
      p_service_id: fixtures.primaryServiceId,
      p_date: '2030-03-25',
      p_customer_id: customer.id,
      p_barber_id: null,
    })
    expect(slotError).toBeNull()
    const offered = (slots ?? []) as Array<{ provider_user_id: string; starts_at: string; buffer_min: number }>
    expect(offered.length).toBeGreaterThan(0)

    // Earlier tests legitimately employ extra barbers at this shop, so assert
    // membership of the qualified set rather than one hardcoded provider.
    const { data: eligible } = await service
      .from('service_qualifications')
      .select('provider_user_id')
      .eq('shop_id', fixtures.primaryShopId)
      .eq('service_id', fixtures.primaryServiceId)
      .eq('active', true)
    const eligibleIds = new Set((eligible ?? []).map((row) => row.provider_user_id as string))
    expect(offered.every((slot) => eligibleIds.has(slot.provider_user_id))).toBe(true)

    for (const slot of [offered[0], offered[Math.floor(offered.length / 2)], offered[offered.length - 1]]) {
      const { data: quote, error: quoteError } = await service.rpc('api_quote_appointment', {
        p_customer_id: customer.id,
        p_barber_id: slot.provider_user_id,
        p_service_id: fixtures.primaryServiceId,
        p_starts_at: slot.starts_at,
        p_barber_preference: 'exact',
      })
      expect(quoteError).toBeNull()
      expect((quote as Array<{ bookable: boolean }>)[0]?.bookable).toBe(true)
    }

    // A claimed slot must leave the offer set immediately.
    const claimed = await book(customer.id, barber.id, offered[0].starts_at)
    expect(claimed.error).toBeNull()
    try {
      const { data: afterClaim } = await service.rpc('api_availability_slots', {
        p_shop_id: fixtures.primaryShopId,
        p_service_id: fixtures.primaryServiceId,
        p_date: '2030-03-25',
        p_customer_id: customer.id,
        p_barber_id: null,
      })
      expect(((afterClaim ?? []) as Array<{ starts_at: string }>)
        .some((slot) => slot.starts_at === offered[0].starts_at)).toBe(false)
    } finally {
      await service.from('appointments').delete().eq('id', (claimed.data as { id: string }).id)
    }

    // An unpublished shop is an error, not an empty day, so the caller can tell
    // "closed today" apart from "not bookable at all".
    await withShopFields({ lifecycle_status: 'suspended' }, async () => {
      const { error: suspendedError } = await service.rpc('api_availability_slots', {
        p_shop_id: fixtures.primaryShopId,
        p_service_id: fixtures.primaryServiceId,
        p_date: '2030-03-25',
        p_customer_id: null,
        p_barber_id: null,
      })
      expect(suspendedError?.code).toBe('P4027')
    })
  })

  it('records exact, preferred, and any assignment intent', async () => {
    // BOOK-02. `exact` must surface a refusal rather than quietly substitute;
    // `any` must resolve a provider and say that it did so automatically.
    const anySlot = '2030-03-04T04:00:00.000Z'
    const resolved = await book(customer.id, null as unknown as string, anySlot, {
      p_barber_preference: 'any',
      p_requested_barber_id: null,
    })
    expect(resolved.error).toBeNull()
    const anyBooking = resolved.data as Record<string, unknown>
    // The engine picks the qualified provider carrying the fewest assigned
    // minutes that day, so assert the intent it recorded rather than which of the
    // shop's barbers happened to win.
    const { data: eligible } = await service
      .from('service_qualifications')
      .select('provider_user_id')
      .eq('shop_id', fixtures.primaryShopId)
      .eq('service_id', fixtures.primaryServiceId)
      .eq('active', true)
    expect((eligible ?? []).map((row) => row.provider_user_id as string))
      .toContain(anyBooking.barber_id as string)
    expect(anyBooking.barber_preference).toBe('any')
    expect(anyBooking.requested_barber_id).toBeNull()
    expect(anyBooking.assignment_source).toBe('automatic')
    expect(anyBooking.assignment_reason).toContain('Assigned automatically')

    try {
      // `exact` on the provider who just took that slot must refuse rather than
      // quietly hand the customer somebody else.
      const exact = await book(otherCustomer.id, anyBooking.barber_id as string, anySlot, {
        p_barber_preference: 'exact',
        p_requested_barber_id: anyBooking.barber_id,
      })
      expect(exact.error?.code).toBe('23P01')

      // `preferred` may substitute, so the outcome depends on whether another
      // qualified provider is free. Either way it must be a definite answer: a
      // different provider, or the no-provider refusal — never the busy one.
      const preferred = await book(otherCustomer.id, anyBooking.barber_id as string, anySlot, {
        p_barber_preference: 'preferred',
        p_requested_barber_id: anyBooking.barber_id,
      })
      if (preferred.error) {
        expect(preferred.error.code).toBe('P4033')
      } else {
        const substitute = preferred.data as Record<string, unknown>
        expect(substitute.barber_id).not.toBe(anyBooking.barber_id)
        expect(substitute.requested_barber_id).toBe(anyBooking.barber_id)
        expect(substitute.assignment_source).toBe('automatic')
        await service.from('appointments').delete().eq('id', substitute.id as string)
      }
    } finally {
      await service.from('appointments').delete().eq('id', anyBooking.id as string)
    }

    const exactFree = await book(customer.id, barber.id, '2030-03-04T05:00:00.000Z', {
      p_barber_preference: 'exact',
      p_requested_barber_id: barber.id,
    })
    expect(exactFree.error).toBeNull()
    const exactBooking = exactFree.data as Record<string, unknown>
    expect(exactBooking.assignment_source).toBe('customer')
    expect(exactBooking.requested_barber_id).toBe(barber.id)
    await service.from('appointments').delete().eq('id', exactBooking.id as string)
  })

  it('lets a shop owner who performs services be booked, and run the visit', async () => {
    // Q20. Before this, a shop whose only provider was its owner could publish,
    // appear in the catalogue, and refuse every customer: the engine never read
    // owner_provider_profiles, and appointments.barber_id could not point at
    // someone with no barbers row. Common shape for a Philippine barbershop.
    // Read the live version: the P2-05 capability test enables and disables it
    // earlier in this file, so it is not 1 by the time this runs.
    const workspaceBefore = await request(app)
      .get('/api/v1/owner/service-qualifications')
      .set('Authorization', `Bearer ${owner.token}`)
    const capability = await request(app)
      .patch('/api/v1/owner/provider-capability')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: workspaceBefore.body.data.owner_provider.version,
        active: true,
        accepting_bookings: true,
        reason: 'Owner performs services at this shop.',
        command_id: crypto.randomUUID(),
      })
    expect(capability.status, JSON.stringify(capability.body)).toBe(200)

    try {
      // The shadow barbers row is what makes the foreign key satisfiable, and it
      // must mirror the capability rather than be authored separately.
      const { data: shadow } = await service
        .from('barbers')
        .select('id,accepting_bookings')
        .eq('id', owner.id)
        .maybeSingle()
      expect(shadow).toMatchObject({ id: owner.id, accepting_bookings: true })

      // Owners must not leak into the public barber catalogue, which filters on
      // users.role = 'barber'.
      const publicBarbers = await request(app).get('/api/v1/catalog/barbers')
      expect(publicBarbers.body.data.some((row: { id: string }) => row.id === owner.id)).toBe(false)

      const { data: ownerQualification } = await service
        .from('service_qualifications')
        .select('active')
        .eq('shop_id', fixtures.primaryShopId)
        .eq('service_id', fixtures.primaryServiceId)
        .eq('provider_user_id', owner.id)
        .maybeSingle()
      expect(ownerQualification?.active).toBe(true)

      // 2030-04-08 is a Monday: shop hours 09:00-18:00, and the owner has no
      // shift roster, so those hours are their working window.
      const booked = await book(customer.id, owner.id, '2030-04-08T01:00:00.000Z')
      expect(booked.error, JSON.stringify(booked.error)).toBeNull()
      const appointment = booked.data as Record<string, unknown>
      expect(appointment.barber_id).toBe(owner.id)

      try {
        // Express guards are a second authority, separate from the SQL command,
        // and Q20 only taught `requireAssignedProvider` about owner-providers.
        // Everything else that asks "is this person the barber on the booking?"
        // answers yes for an owner-provider and then demands the `barber` role.
        // These two go through `requireParticipantOrOwner`, and every
        // owner-provider test above this line calls the RPC directly, so no
        // test had ever driven this path over HTTP.
        const ownerTimeline = await request(app)
          .get(`/api/v1/bookings/${appointment.id}/timeline`)
          .set('Authorization', `Bearer ${owner.token}`)
        expect(ownerTimeline.status, JSON.stringify(ownerTimeline.body)).toBe(200)

        // Outside the shop's hours there is no owner slot, because the shop's
        // own hours are the roster.
        const outside = await book(otherCustomer.id, owner.id, '2030-04-08T11:00:00.000Z')
        expect(outside.error?.code).toBe('P4028')

        // The projection offers the owner too.
        const { data: slots } = await service.rpc('api_availability_slots', {
          p_shop_id: fixtures.primaryShopId,
          p_service_id: fixtures.primaryServiceId,
          p_date: '2030-04-08',
          p_customer_id: null,
          p_barber_id: owner.id,
        })
        const offered = (slots ?? []) as Array<{ provider_user_id: string; starts_at: string }>
        expect(offered.length).toBeGreaterThan(0)
        expect(offered.every((slot) => slot.provider_user_id === owner.id)).toBe(true)

        // An owner-provider must also be able to RUN the visit, otherwise a
        // booking they can take strands at checked_in. Check-in only opens
        // thirty minutes before the start, so this needs a near-now appointment
        // rather than the 2030 one above; a five-minute service keeps the whole
        // window inside one local day at any hour.
        const soon = new Date(Math.ceil((Date.now() + 5 * 60_000) / (15 * 60_000)) * (15 * 60_000))
        const soonDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(soon)

        // The owner's working window is the shop's own hours, so open the shop
        // for that date the same way the lifecycle test opens the barber's roster.
        const { data: openToday } = await service.from('shop_closures').insert({
          shop_id: fixtures.primaryShopId,
          local_date: soonDate,
          closed: false,
          replacement_open_time: '00:00',
          replacement_close_time: '23:59',
          reason: 'Owner-provider lifecycle window.',
        }).select('id').single()

        const { data: quickService } = await service.from('services').insert({
          shop_id: fixtures.primaryShopId,
          name: `Owner Express ${fixtureNamespace}`,
          duration_min: 5,
          price_cents: 12000,
        }).select('id').single()
        await qualifyProvider({
          shopId: fixtures.primaryShopId,
          serviceId: quickService!.id,
          providerId: owner.id,
          grantedBy: owner.id,
        })

        const live = await service.rpc('api_create_appointment', {
          p_customer_id: otherCustomer.id,
          p_barber_id: owner.id,
          p_service_id: quickService!.id,
          p_starts_at: soon.toISOString(),
          p_notes: null,
        })
        expect(live.error, JSON.stringify(live.error)).toBeNull()
        const visit = live.data as Record<string, unknown>

        try {
          const accepted = await acceptAppointment(visit, owner.id)
          const checkedIn = await service.rpc('api_transition_appointment', {
            p_appointment_id: visit.id as string,
            p_expected_version: accepted.version as number,
            p_action: 'check_in',
            p_actor_id: owner.id,
            p_reason: 'Customer identity checked at the counter.',
            p_check_in_code: null,
          })
          expect(checkedIn.error, JSON.stringify(checkedIn.error)).toBeNull()

          const started = await service.rpc('api_transition_appointment', {
            p_appointment_id: visit.id as string,
            p_expected_version: (checkedIn.data as { version: number }).version,
            p_action: 'start',
            p_actor_id: owner.id,
            p_reason: null,
            p_check_in_code: null,
          })
          expect(started.error, JSON.stringify(started.error)).toBeNull()
          expect((started.data as { status: string }).status).toBe('in_progress')
        } finally {
          await service.from('appointment_events').delete().eq('appointment_id', visit.id as string)
          await service.from('appointments').delete().eq('id', visit.id as string)
          await service.from('service_qualifications').delete().eq('service_id', quickService!.id)
          await service.from('services').delete().eq('id', quickService!.id)
          await service.from('shop_closures').delete().eq('id', openToday?.id as string)
        }
      } finally {
        await service.from('appointment_events').delete().eq('appointment_id', appointment.id as string)
        await service.from('appointments').delete().eq('id', appointment.id as string)
      }
    } finally {
      const workspace = await request(app)
        .get('/api/v1/owner/service-qualifications')
        .set('Authorization', `Bearer ${owner.token}`)
      await request(app)
        .patch('/api/v1/owner/provider-capability')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          expected_version: workspace.body.data.owner_provider.version,
          active: false,
          accepting_bookings: false,
          reason: 'Restoring the shared fixture state.',
          command_id: crypto.randomUUID(),
        })
    }
  })

  it('refuses to publish a shop nobody can be booked at', async () => {
    // The readiness checklist covered identity, pin, hours, chairs, and one
    // active service, but never that a provider existed, so a shop could publish
    // into the catalogue and turn away every customer.
    const { data: before } = await service
      .from('shops')
      .select('lifecycle_status,published_at,version')
      .eq('id', fixtures.primaryShopId)
      .single()

    // Park the qualifications rather than deleting them, so the exact prior set
    // is restored regardless of what earlier tests left behind.
    const { data: parked } = await service
      .from('service_qualifications')
      .select('id')
      .eq('shop_id', fixtures.primaryShopId)
      .eq('active', true)
    const parkedIds = (parked ?? []).map((row) => row.id as string)

    await service.from('shops')
      .update({ lifecycle_status: 'draft', published_at: null })
      .eq('id', fixtures.primaryShopId)
    await service.from('service_qualifications')
      .update({ active: false, revoked_by: owner.id, revoked_at: new Date().toISOString() })
      .in('id', parkedIds)

    try {
      const { data: draft } = await service
        .from('shops').select('version').eq('id', fixtures.primaryShopId).single()
      const refused = await request(app)
        .post('/api/v1/owner/shop/publish')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ expected_version: draft?.version })
      expect(refused.status).toBe(409)
      // Must not be `conflict`: Shop Setup answers that code by reloading and
      // telling the owner the shop changed elsewhere, which for a readiness
      // failure is both wrong and an infinite loop. Caught in browser smoke.
      expect(refused.body.error.code).toBe('precondition_failed')
      expect(refused.body.error.message).toContain('take bookings before publishing')

      // Restoring one qualified provider is enough to publish again, which
      // proves the refusal was about bookability and not something else.
      await service.from('service_qualifications')
        .update({ active: true, revoked_by: null, revoked_at: null })
        .in('id', parkedIds)
      const accepted = await request(app)
        .post('/api/v1/owner/shop/publish')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ expected_version: draft?.version })
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    } finally {
      await service.from('service_qualifications')
        .update({ active: true, revoked_by: null, revoked_at: null })
        .in('id', parkedIds)
      await service.from('shops')
        .update({
          lifecycle_status: before?.lifecycle_status,
          published_at: before?.published_at,
        })
        .eq('id', fixtures.primaryShopId)
    }
  })

  it('keeps the readiness checklist and the publish command agreeing', async () => {
    // The readiness rule now exists twice: shopPublicationReadiness in TypeScript
    // renders the owner's checklist, and api_publish_owner_shop enforces it in
    // SQL. Two implementations of one rule is the drift shape this packet spent
    // its time removing, so this pins them together — the checklist saying
    // "ready" and publish succeeding must always be the same answer.
    //
    // It has already caught one divergence. The workspace reported every
    // employed barber as `eligible` regardless of verification, so a suspended
    // barber still satisfied the checklist while the database refused to publish,
    // and the owner got a full checklist with a Publish button that failed every
    // press.
    async function checklistReady(): Promise<boolean> {
      const workspace = await request(app)
        .get('/api/v1/owner/service-qualifications')
        .set('Authorization', `Bearer ${owner.token}`)
      expect(workspace.status).toBe(200)
      const shopRow = await request(app)
        .get('/api/v1/owner/shop')
        .set('Authorization', `Bearer ${owner.token}`)
      const services = await request(app)
        .get('/api/v1/owner/shop/services')
        .set('Authorization', `Bearer ${owner.token}`)
      const hours = await request(app)
        .get('/api/v1/owner/shop/hours')
        .set('Authorization', `Bearer ${owner.token}`)
      const shop = shopRow.body.data
      return shopPublicationReadiness(shop, {
        activeServices: services.body.data.filter((row: { active: boolean }) => row.active).length,
        bookableProviders: countBookableProviders(services.body.data, workspace.body.data.providers),
        operatingHours: hours.body.data.filter((row: { closed: boolean }) => !row.closed).length,
      }).ready
    }

    async function publishSucceeds(): Promise<boolean> {
      const before = await request(app)
        .get('/api/v1/owner/shop')
        .set('Authorization', `Bearer ${owner.token}`)
      const attempt = await request(app)
        .post('/api/v1/owner/shop/publish')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ expected_version: before.body.data.version })
      if (attempt.status === 200) {
        const live = await request(app)
          .get('/api/v1/owner/shop')
          .set('Authorization', `Bearer ${owner.token}`)
        await request(app)
          .post('/api/v1/owner/shop/unpublish')
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ expected_version: live.body.data.version })
        return true
      }
      expect(attempt.body.error.code).toBe('precondition_failed')
      return false
    }

    const { data: shopBefore } = await service
      .from('shops')
      .select('lifecycle_status,published_at')
      .eq('id', fixtures.primaryShopId)
      .single()
    await service.from('shops')
      .update({ lifecycle_status: 'draft', published_at: null })
      .eq('id', fixtures.primaryShopId)

    try {
      expect(await checklistReady()).toBe(await publishSucceeds())
      expect(await checklistReady()).toBe(true)

      // Suspension leaves the employment row untouched and revokes the
      // professional's verification, which is precisely the state that diverged.
      // Every employed barber has to go, not just the fixture one: earlier tests
      // leave several at this shop, and one remaining eligible provider is enough
      // for both sides to say ready, which would make the assertion vacuous.
      const { data: employed } = await service
        .from('barber_employment')
        .select('barber_id')
        .eq('shop_id', fixtures.primaryShopId)
        .eq('status', 'active')
      const employedIds = (employed ?? []).map((row) => row.barber_id as string)
      expect(employedIds.length).toBeGreaterThan(0)

      await service.from('users')
        .update({ verification_status: 'suspended' })
        .in('id', employedIds)
      try {
        expect(await checklistReady()).toBe(await publishSucceeds())
        expect(await checklistReady()).toBe(false)
      } finally {
        await service.from('users')
          .update({ verification_status: 'verified' })
          .in('id', employedIds)
      }

      expect(await checklistReady()).toBe(true)
    } finally {
      await service.from('shops')
        .update({
          lifecycle_status: shopBefore?.lifecycle_status,
          published_at: shopBefore?.published_at,
        })
        .eq('id', fixtures.primaryShopId)
    }
  })

  it('refuses to store a shop timezone the engine cannot evaluate', async () => {
    // Since P2-07 every wall-clock rule runs `at time zone shop.timezone`, so an
    // unrecognised zone is not a cosmetic problem: it raises inside the gate and
    // makes the shop completely unbookable with a 500. The only prior constraint
    // was a length check, which 'Manila/NotAZone' passes.
    const { error: rejected } = await service
      .from('shops')
      .update({ timezone: 'Manila/NotAZone' })
      .eq('id', fixtures.primaryShopId)
    expect(rejected?.code).toBe('22023')

    // Even the service role cannot store it, which is the point of putting the
    // guard in the database rather than in Express.
    const { data: unchanged } = await service
      .from('shops')
      .select('timezone')
      .eq('id', fixtures.primaryShopId)
      .single()
    expect(unchanged?.timezone).toBe('Asia/Manila')

    // A real zone still round-trips, and the shop stays bookable afterwards.
    const { error: accepted } = await service
      .from('shops')
      .update({ timezone: 'Asia/Singapore' })
      .eq('id', fixtures.primaryShopId)
    expect(accepted).toBeNull()
    const { error: restored } = await service
      .from('shops')
      .update({ timezone: 'Asia/Manila' })
      .eq('id', fixtures.primaryShopId)
    expect(restored).toBeNull()
  })

  it('sends `any` to the provider with the lightest day and agrees on retry', async () => {
    // BOOK-02's actual rule, which had no coverage until this test: `any` picks
    // the qualified provider with the fewest assigned service minutes on the
    // shop's local date. Asserting only that *some* eligible provider was chosen
    // would pass even with the candidate list in arbitrary order, which is
    // exactly the defect 20260730000600 fixes.
    const lightEmail = fixtureEmail('barber-load-balance')
    const lightBarberId = await createFixtureUser(lightEmail, 'Load Balance Barber')
    const { error: roleError } = await service.from('users').upsert({
      id: lightBarberId,
      email: lightEmail,
      full_name: 'Load Balance Barber',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      onboarding_completed: true,
    })
    expect(roleError).toBeNull()
    const { error: barberRowError } = await service.from('barbers').insert({
      id: lightBarberId,
      accepting_bookings: true,
    })
    expect(barberRowError).toBeNull()
    const { data: employment, error: employmentError } = await service
      .from('barber_employment')
      .insert({
        barber_id: lightBarberId,
        shop_id: fixtures.primaryShopId,
        status: 'active',
        hired_at: '2026-01-01',
      })
      .select('id')
      .single()
    expect(employmentError).toBeNull()
    const { error: patternError } = await service.from('shift_patterns').insert({
      employment_id: employment?.id,
      barber_id: lightBarberId,
      shop_id: fixtures.primaryShopId,
      weekday: 1,
      start_time: '09:00',
      end_time: '17:00',
    })
    expect(patternError).toBeNull()

    // Earlier tests leave several barbers employed at this shop, all idle on the
    // probe date, so "pick the lightest" would be satisfied by luck. A service
    // qualified to exactly two providers makes the eligible set deterministic
    // however big the roster grows, because ordered_shop_providers filters on
    // the qualification for the requested service.
    const { data: duoService, error: duoServiceError } = await service.from('services').insert({
      shop_id: fixtures.primaryShopId,
      name: `Balance Probe ${fixtureNamespace}`,
      duration_min: 30,
      price_cents: 21000,
    }).select('id').single()
    expect(duoServiceError).toBeNull()
    for (const providerId of [barber.id, lightBarberId]) {
      await qualifyProvider({
        shopId: fixtures.primaryShopId,
        serviceId: duoService!.id,
        providerId,
        grantedBy: owner.id,
      })
    }
    const { data: eligible } = await service
      .from('service_qualifications')
      .select('provider_user_id')
      .eq('service_id', duoService!.id)
      .eq('active', true)
    expect((eligible ?? []).map((row) => row.provider_user_id as string).sort())
      .toEqual([barber.id, lightBarberId].sort())

    // 2030-04-01 is a Monday, four weeks clear of every other fixture date.
    const created: string[] = []
    const bookDuo = async (
      customerId: string,
      barberId: string | null,
      startsAt: string,
      extra: Record<string, unknown> = {},
    ) => {
      const result = await service.rpc('api_create_appointment', {
        p_customer_id: customerId,
        p_barber_id: barberId,
        p_service_id: duoService!.id,
        p_starts_at: startsAt,
        p_notes: null,
        ...extra,
      })
      const row = result.data as { id?: string } | null
      if (row?.id) created.push(row.id)
      return result
    }

    try {
      // Give the fixture barber thirty minutes that morning and the new hire
      // none. Both are free at the probe slot, so load is the only difference.
      const loadA = await bookDuo(customer.id, barber.id, '2030-04-01T01:00:00.000Z')
      expect(loadA.error).toBeNull()

      const lighter = await bookDuo(otherCustomer.id, null, '2030-04-01T04:00:00.000Z', {
        p_barber_preference: 'any',
        p_requested_barber_id: null,
      })
      expect(lighter.error).toBeNull()
      expect((lighter.data as Record<string, unknown>).barber_id).toBe(lightBarberId)

      // Tip it the other way: the new hire now carries sixty minutes to the
      // fixture barber's thirty, so the next `any` must swing back.
      const loadB = await bookDuo(customer.id, lightBarberId, '2030-04-01T02:00:00.000Z')
      expect(loadB.error).toBeNull()

      const swung = await bookDuo(customer.id, null, '2030-04-01T06:00:00.000Z', {
        p_barber_preference: 'any',
        p_requested_barber_id: null,
      })
      expect(swung.error).toBeNull()
      expect((swung.data as Record<string, unknown>).barber_id).toBe(barber.id)

      // "Tie-break ... so retries agree": while nothing changes, the read-only
      // quote must name the same provider every time.
      const quoteArgs = {
        p_customer_id: otherCustomer.id,
        p_barber_id: null,
        p_service_id: duoService!.id,
        p_starts_at: '2030-04-01T07:00:00.000Z',
        p_barber_preference: 'any',
      }
      const quotes = await Promise.all([
        service.rpc('api_quote_appointment', quoteArgs),
        service.rpc('api_quote_appointment', quoteArgs),
      ])
      const [first, second] = quotes.map(
        (result) => (result.data as Array<{ bookable: boolean; provider_user_id: string }>)[0],
      )
      expect(first?.bookable).toBe(true)
      expect(second?.provider_user_id).toBe(first?.provider_user_id)

      // And the quote must name whoever the claim actually assigns.
      const claimed = await bookDuo(otherCustomer.id, null, '2030-04-01T07:00:00.000Z', {
        p_barber_preference: 'any',
        p_requested_barber_id: null,
      })
      expect(claimed.error).toBeNull()
      expect((claimed.data as Record<string, unknown>).barber_id).toBe(first?.provider_user_id)
    } finally {
      for (const id of created) {
        await service.from('appointments').delete().eq('id', id)
      }
      await service.from('service_qualifications').delete().eq('service_id', duoService!.id)
      await service.from('services').delete().eq('id', duoService!.id)
      await service.from('shift_patterns').delete().eq('employment_id', employment?.id as string)
      await service.from('barber_employment').delete().eq('id', employment?.id as string)
    }
  })

  // ---- P3-01 request / accept / assign ------------------------------------

  it('creates manual and instant bookings idempotently, while restrictions force manual approval', async () => {
    const createdIds: string[] = []
    const keys: string[] = []
    const create = async (input: {
      customerId: string
      startsAt: string
      key: string
    }) => service.rpc('api_create_booking', {
      p_customer_id: input.customerId,
      p_barber_id: barber.id,
      p_service_id: fixtures.primaryServiceId,
      p_starts_at: input.startsAt,
      p_notes: 'P3-01 idempotency probe.',
      p_barber_preference: 'exact',
      p_requested_barber_id: barber.id,
      p_assignment_source: 'customer',
      p_assignment_reason: null,
      p_idempotency_key: input.key,
    })

    try {
      const manualKey = crypto.randomUUID()
      keys.push(manualKey)
      const manualRace = await Promise.all([
        create({ customerId: customer.id, startsAt: '2030-06-03T02:00:00.000Z', key: manualKey }),
        create({ customerId: customer.id, startsAt: '2030-06-03T02:00:00.000Z', key: manualKey }),
      ])
      for (const result of manualRace) expect(result.error, JSON.stringify(result.error)).toBeNull()
      const manualRows = manualRace.map((result) => result.data as Record<string, unknown>)
      expect(manualRows[0]?.id).toBe(manualRows[1]?.id)
      expect(manualRows[0]?.status).toBe('requested')
      expect(manualRows[0]?.expires_at).toBeTruthy()
      createdIds.push(manualRows[0]?.id as string)

      const mismatchedReplay = await create({
        customerId: customer.id,
        startsAt: '2030-06-03T02:15:00.000Z',
        key: manualKey,
      })
      expect(mismatchedReplay.error?.code).toBe('P4090')

      const { error: instantModeError } = await service.from('shops')
        .update({ booking_mode: 'instant' })
        .eq('id', fixtures.primaryShopId)
      expect(instantModeError).toBeNull()

      const instantKey = crypto.randomUUID()
      keys.push(instantKey)
      const instant = await create({ customerId: otherCustomer.id, startsAt: '2030-06-03T03:00:00.000Z', key: instantKey })
      expect(instant.error, JSON.stringify(instant.error)).toBeNull()
      const instantRow = instant.data as Record<string, unknown>
      expect(instantRow.status).toBe('confirmed')
      expect(instantRow.expires_at).toBeNull()
      createdIds.push(instantRow.id as string)
      const { data: instantEvents } = await service.from('appointment_events')
        .select('actor_role,event_type,from_status,to_status,metadata')
        .eq('appointment_id', instantRow.id as string)
        .order('created_at')
      expect(instantEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ actor_role: 'system', event_type: 'accepted', from_status: 'requested', to_status: 'confirmed' }),
      ]))

      const { error: restrictError } = await service.from('users')
        .update({ manual_approval_until: '2030-07-01T00:00:00.000Z' })
        .eq('id', customer.id)
      expect(restrictError).toBeNull()
      const restrictedKey = crypto.randomUUID()
      keys.push(restrictedKey)
      const restricted = await create({ customerId: customer.id, startsAt: '2030-06-03T04:00:00.000Z', key: restrictedKey })
      expect(restricted.error, JSON.stringify(restricted.error)).toBeNull()
      const restrictedRow = restricted.data as Record<string, unknown>
      expect(restrictedRow.status).toBe('requested')
      expect(restrictedRow.expires_at).toBeTruthy()
      createdIds.push(restrictedRow.id as string)
    } finally {
      await service.from('users').update({ manual_approval_until: null }).eq('id', customer.id)
      await service.from('shops').update({ booking_mode: 'manual' }).eq('id', fixtures.primaryShopId)
      for (const key of keys) {
        await service.from('booking_create_requests').delete().eq('idempotency_key', key)
      }
      for (const id of createdIds) {
        await service.from('appointment_events').delete().eq('appointment_id', id)
        await service.from('appointments').delete().eq('id', id)
      }
    }
  })

  // ---- P2-08 race gate -----------------------------------------------------
  // P2-07 already proves three races: two customers on one barber, one customer
  // on two barbers, and two customers on two barbers for the last chair. This
  // widens that to the classes it never touched, per the phase contract's
  // "parallel last-vacancy, provider-slot and chair-slot claims produce one
  // valid winner and stable conflicts".
  //
  // 2030-05-06, -13, -20 and -27 are Mondays, matching the fixture weekday-1
  // shift pattern and opening hours, and are clear of every other fixture date.

  it('returns a slot to the pool when its hold ends, and still admits one winner', async () => {
    // A refused or withdrawn booking must free the slot: the exclusion
    // constraints are filtered on live statuses, so this is behaviour worth
    // pinning rather than assuming. The second half is the part that matters --
    // a freed slot is exactly where two waiting customers collide.
    const slot = '2030-05-06T02:00:00.000Z'
    const held = await book(customer.id, barber.id, slot)
    expect(held.error, JSON.stringify(held.error)).toBeNull()
    const heldRow = held.data as Record<string, unknown>

    // While the hold is live the slot is genuinely taken.
    const blocked = await book(otherCustomer.id, barber.id, slot)
    expect(blocked.error?.code).toBe('23P01')

    const declined = await service.rpc('api_transition_appointment', {
      p_appointment_id: heldRow.id as string,
      p_expected_version: heldRow.version as number,
      p_action: 'decline',
      p_actor_id: owner.id,
      p_reason: 'Freeing the slot for the race probe.',
      p_check_in_code: null,
    })
    expect(declined.error, JSON.stringify(declined.error)).toBeNull()
    expect((declined.data as { status: string }).status).toBe('declined')

    // Freed, and contested by two customers at once: exactly one may take it.
    const race = await Promise.all([
      book(customer.id, barber.id, slot),
      book(otherCustomer.id, barber.id, slot),
    ])
    const winners = race.filter((result) => result.error === null)
    expect(winners).toHaveLength(1)
    expect(race.filter((result) => result.error?.code === '23P01')).toHaveLength(1)

    for (const won of winners) {
      const id = (won.data as { id: string }).id
      await service.from('appointment_events').delete().eq('appointment_id', id)
      await service.from('appointments').delete().eq('id', id)
    }
    await service.from('appointment_events').delete().eq('appointment_id', heldRow.id as string)
    await service.from('appointments').delete().eq('id', heldRow.id as string)
  })

  it('never lets expiry and a fresh claim both own the same slot', async () => {
    // The claim/expiry boundary. `api_expire_due_appointments` walks requested
    // rows with `for update skip locked`; a customer claiming the same slot in
    // the same instant must not end up alongside a row the sweeper is still
    // releasing. Either the claim loses to the live hold or it wins the freed
    // slot, never both.
    const slot = '2030-05-13T02:00:00.000Z'
    const held = await book(customer.id, barber.id, slot)
    expect(held.error, JSON.stringify(held.error)).toBeNull()
    const heldId = (held.data as { id: string }).id

    // Force the hold due without touching status, so the sweeper is the only
    // thing that may retire it.
    const { error: dueError } = await service
      .from('appointments')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', heldId)
    expect(dueError).toBeNull()

    const [sweep, claim] = await Promise.all([
      service.rpc('api_expire_due_appointments'),
      book(otherCustomer.id, barber.id, slot),
    ])
    expect(sweep.error, JSON.stringify(sweep.error)).toBeNull()

    const liveForSlot = async () => {
      const { data } = await service
        .from('appointments')
        .select('id,status')
        .eq('barber_id', barber.id)
        .eq('starts_at', slot)
        .in('status', ['requested', 'confirmed', 'checked_in', 'in_progress', 'awaiting_confirmation'])
      return data ?? []
    }

    // The invariant is "never two", not "always one". Both orderings are
    // legitimate and the empty one is the interesting case: the claim reads the
    // hold while it is still `requested`, loses on the exclusion constraint, and
    // the sweeper then retires that hold. Nobody holds the slot and the customer
    // was told it was taken. That is a transient false refusal, not a lost
    // booking, and forcing the claim to wait on the sweeper instead would be a
    // worse trade. What must never happen is two live rows on one slot.
    expect((await liveForSlot()).length).toBeLessThanOrEqual(1)

    if (claim.error === null) {
      const { data: swept } = await service
        .from('appointments').select('status').eq('id', heldId).single()
      expect(swept?.status).toBe('expired')
    } else {
      expect(claim.error?.code).toBe('23P01')
    }

    // The refusal must be transient, and that is the part worth pinning: once
    // the sweeper has finished, the freed slot is claimable again. If this ever
    // fails, a slot has been stranded by an expiring hold.
    const { data: afterSweep } = await service
      .from('appointments').select('status').eq('id', heldId).single()
    expect(afterSweep?.status).toBe('expired')
    const retry = await book(otherCustomer.id, barber.id, slot)
    const claimedId = (claim.data as { id?: string } | null)?.id
    if (claimedId) {
      // The first claim already won it, so the retry must be refused, not
      // silently allowed to double-book the same customer onto the same slot.
      expect(retry.error?.code).toBe('23P01')
    } else {
      expect(retry.error, JSON.stringify(retry.error)).toBeNull()
    }

    const retryId = (retry.data as { id?: string } | null)?.id
    for (const id of [heldId, claimedId, retryId].filter(Boolean) as string[]) {
      await service.from('appointment_events').delete().eq('appointment_id', id)
      await service.from('appointments').delete().eq('id', id)
    }
  })

  it('serializes concurrent claims on an owner-provider to one winner', async () => {
    // Owners became bookable in P2-07 (Q20/D-028) through a shadow `barbers`
    // row, and every race proved before that change involved employed barbers
    // only. The provider exclusion has to cover the owner identically.
    const workspace = await request(app)
      .get('/api/v1/owner/service-qualifications')
      .set('Authorization', `Bearer ${owner.token}`)
    const enabled = await request(app)
      .patch('/api/v1/owner/provider-capability')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: workspace.body.data.owner_provider.version,
        active: true,
        accepting_bookings: true,
        reason: 'Owner-provider race probe.',
        command_id: crypto.randomUUID(),
      })
    expect(enabled.status, JSON.stringify(enabled.body)).toBe(200)

    try {
      const slot = '2030-05-20T02:00:00.000Z'
      const race = await Promise.all([
        book(customer.id, owner.id, slot),
        book(otherCustomer.id, owner.id, slot),
      ])
      const winners = race.filter((result) => result.error === null)
      expect(winners).toHaveLength(1)
      expect(race.filter((result) => result.error?.code === '23P01')).toHaveLength(1)

      // And an owner-provider competing with an employed barber for the shop's
      // single chair is still one winner: chair capacity is an advisory-lock
      // count, not an exclusion constraint, so it needs its own proof.
      const chairSlot = '2030-05-20T04:00:00.000Z'
      const chairRace = await Promise.all([
        book(customer.id, owner.id, chairSlot),
        book(otherCustomer.id, barber.id, chairSlot),
      ])
      const chairWinners = chairRace.filter((result) => result.error === null)
      expect(chairWinners).toHaveLength(1)
      expect(chairRace.filter((result) => result.error?.code === 'P4026')).toHaveLength(1)

      for (const won of [...winners, ...chairWinners]) {
        const id = (won.data as { id: string }).id
        await service.from('appointment_events').delete().eq('appointment_id', id)
        await service.from('appointments').delete().eq('id', id)
      }
    } finally {
      const after = await request(app)
        .get('/api/v1/owner/service-qualifications')
        .set('Authorization', `Bearer ${owner.token}`)
      await request(app)
        .patch('/api/v1/owner/provider-capability')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          expected_version: after.body.data.owner_provider.version,
          active: false,
          accepting_bookings: false,
          reason: 'Restoring the shared fixture state.',
          command_id: crypto.randomUUID(),
        })
    }
  })

  // ---- Phase 3 operational completion ------------------------------------

  it('keeps the original booking until a versioned customer change approval and preserves in-app state across delivery retry', async () => {
    const created = await book(customer.id, barber.id, '2030-06-10T02:00:00.000Z')
    expect(created.error, JSON.stringify(created.error)).toBeNull()
    const accepted = await acceptAppointment(created.data as Record<string, unknown>, owner.id)

    const proposalResult = await request(app)
      .post(`/api/v1/bookings/${accepted.id as string}/change-proposals`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        expected_version: accepted.version,
        service_id: fixtures.primaryServiceId,
        provider_id: barber.id,
        starts_at: '2030-06-10T03:00:00.000Z',
        reason: 'Shop requests a one-hour move with customer approval.',
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
    expect(proposalResult.status, JSON.stringify(proposalResult.body)).toBe(201)
    const proposal = proposalResult.body.data as Record<string, unknown>

    const { data: unchanged } = await service.from('appointments').select('starts_at,version').eq('id', accepted.id as string).single()
    expect(unchanged?.starts_at).toBe('2030-06-10T02:00:00+00:00')
    expect(unchanged?.version).toBe((accepted.version as number) + 1)

    const foreignWrite = await otherCustomer.client.from('appointment_change_proposals').insert({
      appointment_id: accepted.id,
      shop_id: fixtures.primaryShopId,
      proposed_by: otherCustomer.id,
      proposed_by_role: 'shop_owner',
      reason: 'Forbidden direct proposal.',
    })
    expect(foreignWrite.error).not.toBeNull()

    const approved = await request(app)
      .post(`/api/v1/booking-change-proposals/${proposal.id as string}/respond`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        expected_proposal_version: proposal.version,
        expected_appointment_version: unchanged?.version,
        decision: 'approve',
      })
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    expect((approved.body.data as { status: string }).status).toBe('approved')
    const { data: changed } = await service.from('appointments').select('starts_at').eq('id', accepted.id as string).single()
    expect(changed?.starts_at).toBe('2030-06-10T03:00:00+00:00')

    // Scoped to this appointment and to a notice that has not been delivered
    // yet. This used to take `.at(-1)` of every notification the customer had
    // ever received, from an unordered query: on a repeat run without a reset it
    // picked up an already-delivered notice from the previous run, and recording
    // a failed attempt against it left the row `delivered`, so the retry
    // assertion failed. The queue is global and accumulates; the fixture must
    // name its own row.
    const { data: pendingOutbox } = await service
      .from('notification_outbox')
      .select('id')
      .eq('recipient_id', customer.id)
      .eq('appointment_id', accepted.id as string)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
    const outboxId = pendingOutbox?.[0]?.id as string
    expect(outboxId, 'the approved change should have queued a notice for this appointment').toBeTruthy()
    const { data: inbox } = await service.from('in_app_notifications').select('id').eq('outbox_id', outboxId)
    expect((inbox ?? []).length).toBeGreaterThan(0)
    const failed = await service.rpc('api_record_notification_attempt', {
      p_outbox_id: outboxId,
      p_provider: 'test-provider',
      p_succeeded: false,
      p_error_code: 'provider_down',
    })
    expect(failed.error, JSON.stringify(failed.error)).toBeNull()
    expect((failed.data as { status: string }).status).toBe('retry')
    const { data: stillVisible } = await service.from('in_app_notifications').select('id').eq('outbox_id', outboxId).single()
    expect(stillVisible?.id).toBeTruthy()
    const delivered = await service.rpc('api_record_notification_attempt', {
      p_outbox_id: outboxId,
      p_provider: 'test-provider',
      p_succeeded: true,
      p_error_code: null,
    })
    expect(delivered.error, JSON.stringify(delivered.error)).toBeNull()
    const { data: deliveredRow } = await service.from('notification_outbox').select('status').eq('id', outboxId).single()
    expect(deliveredRow?.status).toBe('delivered')
  })

  it('persists failed guest claim attempts, rejects replay, and keeps walk-in payment facts independent', async () => {
    const created = await service.rpc('api_create_walk_in', {
      p_shop_id: fixtures.primaryShopId,
      p_actor_id: owner.id,
      p_display_name: 'Queue Guest',
      p_service_id: fixtures.primaryServiceId,
      p_requested_barber_id: barber.id,
      p_notes: 'Phase 3 walk-in regression.',
    })
    expect(created.error, JSON.stringify(created.error)).toBeNull()
    const walkIn = created.data as Record<string, unknown>
    const code = '728194'
    const issued = await service.rpc('api_issue_walk_in_claim', {
      p_walk_in_id: walkIn.id,
      p_expected_version: walkIn.version,
      p_actor_id: owner.id,
      p_token: code,
      p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    expect(issued.error, JSON.stringify(issued.error)).toBeNull()

    const wrong = await service.rpc('api_claim_walk_in', { p_walk_in_id: walkIn.id, p_token: '000000', p_phone: '+639171234567' })
    expect(wrong.error).toBeNull()
    expect((wrong.data as { ok: boolean }).ok).toBe(false)
    const { data: attempts } = await service.from('guest_visit_claims').select('otp_attempts').eq('walk_in_id', walkIn.id as string).single()
    expect(attempts?.otp_attempts).toBe(1)

    const claimed = await request(app).post(`/api/v1/walk-ins/${walkIn.id as string}/claim`).send({ code, phone: '+639171234567' })
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200)
    const replay = await request(app).post(`/api/v1/walk-ins/${walkIn.id as string}/claim`).send({ code, phone: '+639171234567' })
    expect(replay.status).toBe(404)

    const checkedIn = claimed.body.data as Record<string, unknown>
    const started = await service.rpc('api_transition_walk_in', {
      p_walk_in_id: walkIn.id, p_expected_version: checkedIn.version, p_actor_id: barber.id,
      p_action: 'start', p_provider_id: barber.id, p_reason: null,
    })
    expect(started.error, JSON.stringify(started.error)).toBeNull()
    const completed = await service.rpc('api_transition_walk_in', {
      p_walk_in_id: walkIn.id, p_expected_version: (started.data as { version: number }).version,
      p_actor_id: barber.id, p_action: 'complete', p_provider_id: null, p_reason: null,
    })
    expect(completed.error, JSON.stringify(completed.error)).toBeNull()

    const key = crypto.randomUUID()
    const recorded = await service.rpc('api_record_offline_payment', {
      p_appointment_id: null, p_walk_in_id: walkIn.id, p_actor_id: owner.id,
      p_method: 'cash', p_currency: 'PHP', p_amount_cents: 30000,
      p_paid_at: new Date().toISOString(), p_idempotency_key: key,
    })
    expect(recorded.error, JSON.stringify(recorded.error)).toBeNull()
    const duplicate = await service.rpc('api_record_offline_payment', {
      p_appointment_id: null, p_walk_in_id: walkIn.id, p_actor_id: owner.id,
      p_method: 'cash', p_currency: 'PHP', p_amount_cents: 30000,
      p_paid_at: new Date().toISOString(), p_idempotency_key: key,
    })
    expect(duplicate.error, JSON.stringify(duplicate.error)).toBeNull()
    expect((duplicate.data as { id: string }).id).toBe((recorded.data as { id: string }).id)
    const corrected = await service.rpc('api_change_offline_payment', {
      p_payment_id: (recorded.data as { id: string }).id, p_expected_version: (recorded.data as { version: number }).version,
      p_actor_id: owner.id, p_action: 'correct', p_amount_cents: 32500,
      p_reason: 'Corrected after counting the offline cash receipt.',
    })
    expect(corrected.error, JSON.stringify(corrected.error)).toBeNull()
    expect((corrected.data as { amount_cents: number }).amount_cents).toBe(32500)

    const forbiddenPayment = await service.rpc('api_record_offline_payment', {
      p_appointment_id: null, p_walk_in_id: walkIn.id, p_actor_id: otherOwner.id,
      p_method: 'cash', p_currency: 'PHP', p_amount_cents: 1,
      p_paid_at: new Date().toISOString(), p_idempotency_key: crypto.randomUUID(),
    })
    expect(forbiddenPayment.error?.code).toBe('P4031')
    const directWrite = await customer.client.from('walk_in_entries').insert({ shop_id: fixtures.primaryShopId, created_by: customer.id, display_name: 'Bypass' })
    expect(directWrite.error).not.toBeNull()
  })

  it('lets the owner mark after grace, resolves appeals, and activates the rolling strike restriction at three', async () => {
    const strikeAppointmentIds: string[] = []
    for (const [index, slot] of ['2030-06-17T02:00:00.000Z', '2030-06-17T03:00:00.000Z', '2030-06-17T04:00:00.000Z'].entries()) {
      const created = await book(customer.id, barber.id, slot)
      expect(created.error, JSON.stringify(created.error)).toBeNull()
      const accepted = await acceptAppointment(created.data as Record<string, unknown>, owner.id)
      const pastStart = new Date(Date.now() - (3 - index) * 60 * 60_000).toISOString()
      const { data: moved, error: moveError } = await service.from('appointments').update({ starts_at: pastStart }).eq('id', accepted.id as string).select('version').single()
      expect(moveError, JSON.stringify(moveError)).toBeNull()
      const marked = await service.rpc('api_mark_customer_no_show', {
        p_appointment_id: accepted.id, p_expected_version: moved?.version,
        p_actor_id: owner.id, p_reason: 'Owner verified absence after the grace period.',
      })
      expect(marked.error, JSON.stringify(marked.error)).toBeNull()
      const appeal = await service.rpc('api_create_no_show_appeal', {
        p_appointment_id: accepted.id, p_customer_id: customer.id,
        p_reason: 'Customer requests a documented owner review.', p_evidence_note: `Appeal evidence ${index + 1}.`,
      })
      expect(appeal.error, JSON.stringify(appeal.error)).toBeNull()
      const resolved = await service.rpc('api_resolve_no_show_appeal', {
        p_appeal_id: (appeal.data as { id: string }).id,
        p_expected_version: (appeal.data as { version: number }).version,
        p_owner_id: owner.id, p_resolution: 'upheld',
        p_reason: 'Owner upheld after reviewing the recorded facts.',
      })
      expect(resolved.error, JSON.stringify(resolved.error)).toBeNull()
      strikeAppointmentIds.push(accepted.id as string)
    }
    const { data: restricted } = await service.from('users').select('manual_approval_until').eq('id', customer.id).single()
    expect(Date.parse(restricted?.manual_approval_until as string)).toBeGreaterThan(Date.now())
    const waived = await service.rpc('api_waive_customer_strike', {
      p_appointment_id: strikeAppointmentIds[0], p_owner_id: owner.id,
      p_reason: 'Owner correction removes one upheld strike after new evidence.',
    })
    expect(waived.error, JSON.stringify(waived.error)).toBeNull()
    const { data: unrestricted } = await service.from('users').select('manual_approval_until').eq('id', customer.id).single()
    expect(unrestricted?.manual_approval_until).toBeNull()
  })

  it('runs closeout twice as one run and creates attention instead of guessing an unresolved visit', async () => {
    const created = await book(otherCustomer.id, barber.id, '2030-06-24T02:00:00.000Z')
    expect(created.error, JSON.stringify(created.error)).toBeNull()
    const accepted = await acceptAppointment(created.data as Record<string, unknown>, owner.id)
    const yesterday = new Date(Date.now() - 86_400_000)
    const localDate = yesterday.toISOString().slice(0, 10)
    const startsAt = new Date(`${localDate}T02:00:00.000Z`).toISOString()
    const { error: moveError } = await service.from('appointments').update({ starts_at: startsAt }).eq('id', accepted.id as string)
    expect(moveError, JSON.stringify(moveError)).toBeNull()
    // A closeout run is a singleton per shop-day and returns immediately once it
    // is `completed`, which is correct: a day is closed once. It also means a
    // second matrix run on the same calendar day inherited the first run's
    // completed row and never processed this appointment, so the attention
    // assertion saw an empty array. The fixture clears the row it is about to
    // exercise rather than the assertion being loosened to accept nothing.
    const { error: clearRunError } = await service
      .from('closeout_runs')
      .delete()
      .eq('shop_id', fixtures.primaryShopId)
      .eq('local_date', localDate)
    expect(clearRunError, JSON.stringify(clearRunError)).toBeNull()
    const first = await service.rpc('api_run_shop_closeout', { p_shop_id: fixtures.primaryShopId, p_local_date: localDate })
    const second = await service.rpc('api_run_shop_closeout', { p_shop_id: fixtures.primaryShopId, p_local_date: localDate })
    expect(first.error, JSON.stringify(first.error)).toBeNull()
    expect(second.error, JSON.stringify(second.error)).toBeNull()
    expect((first.data as { id: string }).id).toBe((second.data as { id: string }).id)
    const { data: unchanged } = await service.from('appointments').select('status').eq('id', accepted.id as string).single()
    expect(unchanged?.status).toBe('confirmed')
    const { data: attention } = await service.from('appointment_attention_items').select('kind').eq('appointment_id', accepted.id as string)
    expect(attention).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'closeout_unresolved' })]))
  })
})
