import 'dotenv/config'
import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

const runLocal = process.env.RUN_LOCAL_SUPABASE_TESTS === '1'
const localDescribe = runLocal ? describe : describe.skip

function required(...names: string[]): string {
  const value = names.map((name) => process.env[name]).find(Boolean)
  if (!value) throw new Error(`${names.join(' or ')} is required for the Phase 4 settings tests.`)
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

localDescribe('Phase 4 settings: real backend state across devices', () => {
  let service: SupabaseClient
  let app: ReturnType<typeof createApp>
  let userId: string
  let email: string
  /** Two independent sign-ins of the same account: two devices, in effect. */
  let deviceOne: SupabaseClient
  let deviceTwo: SupabaseClient
  let tokenOne: string
  let tokenTwo: string

  const password = `Settings!${crypto.randomUUID()}`
  const namespace = crypto.randomUUID()

  function client(): SupabaseClient {
    return createClient(
      required('LOCAL_SUPABASE_URL', 'SUPABASE_URL'),
      required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    )
  }

  beforeAll(async () => {
    const url = required('LOCAL_SUPABASE_URL', 'SUPABASE_URL')
    const publishableKey = required('LOCAL_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY')
    const secretKey = required('LOCAL_SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const
    service = createClient(url, secretKey, options)
    app = createApp({ auth: createClient(url, publishableKey, options), database: service }, { webOrigin: 'http://127.0.0.1:5174' })

    email = `settings-${namespace}@settings.test`
    const created = await service.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: 'Settings Customer' },
    })
    if (created.error || !created.data.user) throw created.error ?? new Error('Could not create the user.')
    userId = created.data.user.id
    const { error: profileError } = await service.from('users').upsert({
      id: userId, email, full_name: 'Settings Customer', role: 'customer',
      requested_role: 'customer', verification_status: 'not_required', onboarding_completed: true,
    })
    if (profileError) throw profileError

    deviceOne = client()
    deviceTwo = client()
    const first = await deviceOne.auth.signInWithPassword({ email, password })
    const second = await deviceTwo.auth.signInWithPassword({ email, password })
    if (first.error || !first.data.session) throw first.error ?? new Error('Device one has no session.')
    if (second.error || !second.data.session) throw second.error ?? new Error('Device two has no session.')
    tokenOne = first.data.session.access_token
    tokenTwo = second.data.session.access_token
  }, 120_000)

  it('returns documented defaults for an account with nothing stored yet', async () => {
    const response = await request(app)
      .get('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      booking_reminders: true,
      chat_notifications: true,
      email_updates: false,
      nearby_alerts: false,
      language: 'en',
      text_size: 'default',
      high_contrast: false,
      reduce_motion: false,
      quiet_hours_start: null,
      // Mandatory, and true even before anything is saved.
      transactional_notices: true,
      version: 0,
    })
  })

  it('persists a choice made on one device to another device', async () => {
    // Required test 10. The old screen wrote `localStorage`, so this was
    // impossible: device two saw defaults no matter what device one chose.
    const saved = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        booking_reminders: false,
        chat_notifications: true,
        email_updates: true,
        nearby_alerts: true,
        nearby_radius_km: 12,
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
        language: 'fil',
        text_size: 'large',
        high_contrast: true,
        reduce_motion: true,
      })
    expect(saved.status).toBe(200)
    expect(saved.body.data).toMatchObject({ version: 1, language: 'fil', booking_reminders: false })

    const onDeviceTwo = await request(app)
      .get('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenTwo}`)
    expect(onDeviceTwo.status).toBe(200)
    expect(onDeviceTwo.body.data).toMatchObject({
      booking_reminders: false,
      chat_notifications: true,
      email_updates: true,
      nearby_alerts: true,
      nearby_radius_km: 12,
      quiet_hours_start: '22:00:00',
      quiet_hours_end: '07:00:00',
      language: 'fil',
      text_size: 'large',
      high_contrast: true,
      reduce_motion: true,
      transactional_notices: true,
      version: 1,
    })
  })

  it('keeps mandatory transactional notices enabled no matter what is sent', async () => {
    // Not offered in the schema, so a strict object rejects it outright.
    const rejected = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        booking_reminders: true,
        chat_notifications: true,
        email_updates: false,
        nearby_alerts: false,
        transactional_notices: false,
      })
    expect(rejected.status).toBe(400)
    expect(rejected.body.error.code).toBe('validation')

    // And the database refuses it even reached directly, so no command with a bug
    // in it could switch it off either.
    const direct = await service
      .from('notification_preferences')
      .update({ transactional_notices: false })
      .eq('user_id', userId)
    // Write grants are revoked, which is the first refusal.
    expect(direct.error).not.toBeNull()

    const still = await request(app)
      .get('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
    expect(still.body.data.transactional_notices).toBe(true)
  })

  it('refuses every direct write, including a browser DELETE that would reset to defaults', async () => {
    const browserUpdate = await deviceOne
      .from('notification_preferences')
      .update({ booking_reminders: true })
      .eq('user_id', userId)
    expect(browserUpdate.error).not.toBeNull()

    // `authenticated` held DELETE with a self-scoped policy before P4-08. Deleting
    // the row silently resets somebody to defaults with no version check.
    const browserDelete = await deviceOne.from('notification_preferences').delete().eq('user_id', userId)
    expect(browserDelete.error).not.toBeNull()

    const browserInsert = await deviceOne
      .from('notification_preferences')
      .insert({ user_id: userId, booking_reminders: false })
    expect(browserInsert.error).not.toBeNull()

    // Reading your own row stays allowed.
    const browserRead = await deviceOne.from('notification_preferences').select('user_id').eq('user_id', userId)
    expect(browserRead.error).toBeNull()
    expect(browserRead.data).toHaveLength(1)
  })

  it('refuses a stale save from a second device instead of overwriting silently', async () => {
    const current = await request(app)
      .get('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
    const version = current.body.data.version as number

    const first = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        expected_version: version,
        booking_reminders: true, chat_notifications: false, email_updates: false, nearby_alerts: false,
      })
    expect(first.status).toBe(200)

    const stale = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenTwo}`)
      .send({
        expected_version: version,
        booking_reminders: false, chat_notifications: true, email_updates: false, nearby_alerts: false,
      })
    expect(stale.status).toBe(409)
    expect(stale.body.error.code).toBe('stale_appointment')

    // Device one's choice survived rather than being clobbered.
    const after = await request(app)
      .get('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenTwo}`)
    expect(after.body.data).toMatchObject({ booking_reminders: true, chat_notifications: false })
  })

  it('validates quiet hours as a pair and rejects unsupported values', async () => {
    const halfWindow = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        booking_reminders: true, chat_notifications: true, email_updates: false, nearby_alerts: false,
        quiet_hours_start: '22:00',
      })
    expect(halfWindow.status).toBe(400)

    const badLanguage = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        booking_reminders: true, chat_notifications: true, email_updates: false, nearby_alerts: false,
        language: 'de',
      })
    expect(badLanguage.status).toBe(400)

    const badRadius = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        booking_reminders: true, chat_notifications: true, email_updates: false, nearby_alerts: false,
        nearby_radius_km: 500,
      })
    expect(badRadius.status).toBe(400)
  })

  it('delays an optional reminder during quiet hours but never a required notice', async () => {
    // A window that certainly contains "now", whatever time the suite runs.
    const wide = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        booking_reminders: true, chat_notifications: true, email_updates: false, nearby_alerts: false,
        quiet_hours_start: '00:00', quiet_hours_end: '23:59',
      })
    expect(wide.status).toBe(200)

    const { data: queued, error: queueError } = await service.from('notification_outbox').insert([
      {
        recipient_id: userId,
        event_key: `quiet-optional:${namespace}`,
        title: 'A chair opened up nearby',
        body: 'Optional discovery nudge.',
        payload: {},
        required_operational: false,
      },
      {
        recipient_id: userId,
        event_key: `quiet-required:${namespace}`,
        title: 'Your booking moved',
        body: 'The shop rescheduled your visit.',
        payload: {},
        required_operational: true,
      },
    ]).select('*')
    expect(queueError).toBeNull()
    const optional = queued!.find((row) => row.required_operational === false)!
    const requiredNotice = queued!.find((row) => row.required_operational === true)!

    // The sweeper takes the oldest due rows up to a limit. Without this the test
    // silently depends on the global queue being shorter than that limit, and it
    // starts failing once other suites have enqueued a hundred notices first —
    // which is exactly how it failed the first time. Backdating makes these two
    // the oldest due rows, which is also what a genuinely queued notice looks like.
    const backdated = new Date(Date.now() - 60 * 60_000).toISOString()
    const { error: ageError } = await service
      .from('notification_outbox')
      .update({ created_at: backdated, available_at: backdated })
      .in('id', [optional.id, requiredNotice.id])
    expect(ageError).toBeNull()

    const delivered = await service.rpc('api_deliver_due_in_app_notifications', { p_limit: 100 })
    expect(delivered.error).toBeNull()

    const { data: afterOptional } = await service
      .from('notification_outbox')
      .select('status,available_at,delivered_at')
      .eq('id', optional.id)
      .single()
    // Delayed, not dropped: still pending, and due again when the window ends.
    expect(afterOptional?.status).toBe('pending')
    expect(afterOptional?.delivered_at).toBeNull()
    expect(Date.parse(afterOptional!.available_at as string)).toBeGreaterThan(Date.now())

    const { data: afterRequired } = await service
      .from('notification_outbox')
      .select('status,delivered_at')
      .eq('id', requiredNotice.id)
      .single()
    // A required operational notice is never held by a preference.
    expect(afterRequired?.delivered_at).not.toBeNull()
    // Delivery evidence is a `notification_deliveries` attempt row. The in-app
    // inbox row is created by the enqueue triggers alongside the outbox row, not
    // by the delivery worker, so it is not the right thing to assert here.
    const { data: attempts } = await service
      .from('notification_deliveries')
      .select('outbox_id,status')
      .in('outbox_id', [optional.id, requiredNotice.id])
    expect(attempts).toHaveLength(1)
    expect(attempts?.[0]).toMatchObject({ outbox_id: requiredNotice.id, status: 'delivered' })

    // Clearing quiet hours lets the held reminder through on the next cycle.
    const cleared = await request(app)
      .put('/api/v1/notification-preferences')
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        expected_version: wide.body.data.version,
        booking_reminders: true, chat_notifications: true, email_updates: false, nearby_alerts: false,
        quiet_hours_start: null, quiet_hours_end: null,
      })
    expect(cleared.status).toBe(200)
    // The held row's `available_at` is in the future, so make it due again the way
    // the passage of time would.
    await service.from('notification_outbox').update({ available_at: new Date().toISOString() }).eq('id', optional.id)
    const second = await service.rpc('api_deliver_due_in_app_notifications', { p_limit: 100 })
    expect(second.error).toBeNull()
    const { data: eventually } = await service
      .from('notification_outbox')
      .select('delivered_at')
      .eq('id', optional.id)
      .single()
    expect(eventually?.delivered_at).not.toBeNull()
  })

  it('shows a provider failure to operations while in-app state survives', async () => {
    // Required test 9. The in-app half was already true since Phase 3; the
    // operations half had nowhere to look until P4-08 added this view.
    const operatorEmail = `ops-${namespace}@settings.test`
    const operator = await service.auth.admin.createUser({
      email: operatorEmail, password, email_confirm: true, user_metadata: { full_name: 'Ops Operator' },
    })
    if (operator.error || !operator.data.user) throw operator.error ?? new Error('Could not create the operator.')
    await service.from('users').upsert({
      id: operator.data.user.id, email: operatorEmail, full_name: 'Ops Operator', role: 'customer',
      requested_role: null, verification_status: 'not_required', onboarding_completed: true,
    })
    const operatorClient = client()
    await operatorClient.auth.signInWithPassword({ email: operatorEmail, password })
    const enrollment = await operatorClient.auth.mfa.enroll({ factorType: 'totp', friendlyName: `ops-${namespace}` })
    if (enrollment.error || !enrollment.data.totp) throw enrollment.error ?? new Error('No TOTP secret.')
    const verifiedFactor = await operatorClient.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret),
    })
    if (verifiedFactor.error) throw verifiedFactor.error
    const provisioned = await service.rpc('api_provision_verification_admin', {
      p_user_id: operator.data.user.id,
      p_expected_email: operatorEmail,
      p_capabilities: ['content_moderation'],
      p_operator_reference: `ops-${namespace}`,
      p_command_id: crypto.randomUUID(),
    })
    if (provisioned.error) throw provisioned.error
    await operatorClient.auth.signInWithPassword({ email: operatorEmail, password })
    const elevated = await operatorClient.auth.mfa.challengeAndVerify({
      factorId: (await operatorClient.auth.mfa.listFactors()).data?.totp?.[0]?.id ?? '',
      code: totp(enrollment.data.totp.secret, Date.now() + 30_000),
    })
    if (elevated.error) throw elevated.error
    const operatorToken = elevated.data.access_token

    const { data: queued, error: queueError } = await service.from('notification_outbox').insert({
      recipient_id: userId,
      event_key: `provider-failure:${namespace}`,
      title: 'Your booking moved',
      body: 'The shop rescheduled your visit.',
      payload: {},
      required_operational: true,
    }).select('*').single()
    expect(queueError).toBeNull()

    const failed = await service.rpc('api_record_notification_attempt', {
      p_outbox_id: queued!.id,
      p_provider: 'test-provider',
      p_succeeded: false,
      p_error_code: 'provider_down',
    })
    expect(failed.error).toBeNull()
    expect((failed.data as { status: string }).status).toBe('retry')

    const health = await request(app)
      .get('/api/v1/admin/notifications/health')
      .set('Authorization', `Bearer ${operatorToken}`)
    expect(health.status).toBe(200)
    expect(health.body.data.failures_last_24h).toBeGreaterThan(0)
    expect(health.body.data.failure_rate_last_24h).toBeGreaterThan(0)
    expect(health.body.data.last_failure_at).not.toBeNull()
    expect(health.body.data.recent_error_codes.map((row: { error_code: string }) => row.error_code))
      .toContain('provider_down')
    // Every figure ships its definition, like the analytics payload.
    expect(typeof health.body.data.definitions.failure_rate_last_24h).toBe('string')

    const failedList = await request(app)
      .get('/api/v1/admin/notifications/failed')
      .set('Authorization', `Bearer ${operatorToken}`)
    expect(failedList.status).toBe(200)
    const listed = failedList.body.data.find((row: { id: string }) => row.id === queued!.id)
    expect(listed).toMatchObject({ status: 'retry', last_error: 'provider_down' })

    // The operator can put it back in the queue with its attempts reset.
    const retried = await request(app)
      .post(`/api/v1/admin/notifications/${queued!.id}/retry`)
      .set('Authorization', `Bearer ${operatorToken}`)
    expect(retried.status).toBe(200)
    expect(retried.body.data).toMatchObject({ status: 'pending', attempt_count: 0, last_error: null })

    // And a signed-in customer cannot read the operations view at all.
    const refused = await request(app)
      .get('/api/v1/admin/notifications/health')
      .set('Authorization', `Bearer ${tokenOne}`)
    expect(refused.status).toBe(403)
  })
})
