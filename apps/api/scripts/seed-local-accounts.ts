/**
 * Local-only demo account seeder.
 *
 * Creates one owner, one barber, and one customer in a LOCAL Supabase stack so
 * the team can sign straight in while testing the Express + Supabase backend.
 *
 * Design rules (do not weaken):
 *  - Auth users are created through the Supabase Auth admin API, exactly like a
 *    real signup would. The `handle_auth_user_change` trigger creates the
 *    matching public.users row; we then set roles/verification via the service
 *    role (the same state an admin approval produces — no check is removed or
 *    bypassed, no RLS/trigger/Express guard is touched).
 *  - Passwords are NEVER committed. They come from environment variables
 *    (gitignored .env) or are generated at runtime and printed once.
 *  - Refuses to run against a non-local Supabase unless explicitly overridden,
 *    so this can never touch a hosted/production project by accident.
 *  - Idempotent: re-running updates in place instead of duplicating.
 *
 * Run it (local Supabase must be started — `supabase start`):
 *   npm run seed:accounts -w @barbershop/api
 * Optionally pin passwords instead of generating them (in apps/api/.env):
 *   SEED_PASSWORD=... (applies to all) or SEED_OWNER_PASSWORD / SEED_BARBER_PASSWORD / SEED_CUSTOMER_PASSWORD
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl) throw new Error('SUPABASE_URL is required (see apps/api/.env).')
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is required (see apps/api/.env).')

// --- safety: never seed a remote/production project unless explicitly forced ---
const host = new URL(supabaseUrl).hostname
const isLocalHost = host === '127.0.0.1' || host === 'localhost' || host.endsWith('.local')
const forced = process.env.SEED_ALLOW_REMOTE === 'true'
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run the account seeder with NODE_ENV=production.')
}
if (!isLocalHost && !forced) {
  throw new Error(
    `Refusing to seed a non-local Supabase (${supabaseUrl}). This seeder is for local development only.\n` +
    'Set SEED_ALLOW_REMOTE=true only if you truly intend to write to this project.',
  )
}

const db: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

/** Meets the app's password rule: length >= 6 and at least one special character. */
function generatePassword(): string {
  return `Phila-${randomBytes(9).toString('base64url')}!`
}

const sharedPassword = process.env.SEED_PASSWORD
function resolvePassword(envName: string): { password: string; generated: boolean } {
  const provided = process.env[envName] ?? sharedPassword
  if (provided) return { password: provided, generated: false }
  return { password: generatePassword(), generated: true }
}

interface AccountSpec {
  key: 'owner' | 'barber' | 'customer'
  label: string
  email: string
  fullName: string
  location: string
  avatar: string
  password: string
  generated: boolean
}

const accounts: AccountSpec[] = [
  {
    key: 'owner',
    label: 'Owner',
    email: (process.env.SEED_OWNER_EMAIL ?? 'owner@phila.test').toLowerCase(),
    fullName: 'Olivia Owner',
    location: 'Parañaque City',
    avatar: 'doodle:owner-1',
    ...resolvePassword('SEED_OWNER_PASSWORD'),
  },
  {
    key: 'barber',
    label: 'Barber',
    email: (process.env.SEED_BARBER_EMAIL ?? 'barber@phila.test').toLowerCase(),
    fullName: 'Bruno Barber',
    location: 'Parañaque City',
    avatar: 'doodle:barber-1',
    ...resolvePassword('SEED_BARBER_PASSWORD'),
  },
  {
    key: 'customer',
    label: 'Customer',
    email: (process.env.SEED_CUSTOMER_EMAIL ?? 'customer@phila.test').toLowerCase(),
    fullName: 'Cara Customer',
    location: 'Parañaque City',
    avatar: 'doodle:customer-1',
    ...resolvePassword('SEED_CUSTOMER_PASSWORD'),
  },
]

async function findAuthUserByEmail(email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const match = data.users.find((user) => (user.email ?? '').toLowerCase() === email)
    if (match) return match
    if (data.users.length < 200) break
  }
  return null
}

/** Create the auth user if missing; only reset an existing password when one was explicitly supplied. */
async function ensureAuthUser(account: AccountSpec): Promise<{ id: string; created: boolean }> {
  const existing = await findAuthUserByEmail(account.email)
  if (existing) {
    // Always (re)set the password so the value we print is guaranteed to work,
    // whether it was supplied via env or generated on this run.
    const { error } = await db.auth.admin.updateUserById(existing.id, { password: account.password })
    if (error) throw new Error(`updateUserById failed for ${account.email}: ${error.message}`)
    return { id: existing.id, created: false }
  }
  const { data, error } = await db.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.fullName },
  })
  if (error || !data.user) throw new Error(`createUser failed for ${account.email}: ${error?.message ?? 'no user returned'}`)
  return { id: data.user.id, created: true }
}

type ProfileRole = 'shop_owner' | 'barber' | 'customer'
type ProfileVerification = 'verified' | 'not_required'

async function upsertProfile(id: string, account: AccountSpec, role: ProfileRole, verification: ProfileVerification): Promise<void> {
  const { error } = await db.from('users').upsert(
    {
      id,
      role,
      requested_role: role,
      verification_status: verification,
      onboarding_completed: true,
      full_name: account.fullName,
      email: account.email,
      phone: null,
      location: account.location,
      avatar_url: account.avatar,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`users upsert failed for ${account.email}: ${error.message}`)
}

async function ensureBarberRecord(id: string): Promise<void> {
  const { error } = await db.from('barbers').upsert(
    { id, bio: 'Fades, tapers, and beard work. (Local demo barber.)', accepting_bookings: true },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`barbers upsert failed: ${error.message}`)
}

async function ensureShop(ownerId: string): Promise<string> {
  const name = 'Philabantay · Dev Shop'
  const { data: existing, error: findError } = await db
    .from('shops')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('name', name)
    .maybeSingle()
  if (findError) throw new Error(`shops lookup failed: ${findError.message}`)
  if (existing) return existing.id as string
  const { data, error } = await db
    .from('shops')
    .insert({ owner_id: ownerId, name, address: '123 Test Street, Barangay Demo', city: 'Parañaque City', lat: 14.4793, lng: 121.0198 })
    .select('id')
    .single()
  if (error) throw new Error(`shops insert failed: ${error.message}`)
  return data.id as string
}

interface ServiceSpec { name: string; duration_min: number; price_cents: number }
async function ensureService(shopId: string, service: ServiceSpec): Promise<void> {
  const { data: existing, error: findError } = await db
    .from('services')
    .select('id')
    .eq('shop_id', shopId)
    .eq('name', service.name)
    .maybeSingle()
  if (findError) throw new Error(`services lookup failed: ${findError.message}`)
  if (existing) return
  const { error } = await db.from('services').insert({ shop_id: shopId, active: true, ...service })
  if (error) throw new Error(`services insert failed (${service.name}): ${error.message}`)
}

async function ensureActiveEmployment(barberId: string, shopId: string): Promise<string> {
  const { data: existing, error: findError } = await db
    .from('barber_employment')
    .select('id, shop_id')
    .eq('barber_id', barberId)
    .eq('status', 'active')
    .maybeSingle()
  if (findError) throw new Error(`employment lookup failed: ${findError.message}`)
  if (existing) return existing.id as string
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await db
    .from('barber_employment')
    .insert({ barber_id: barberId, shop_id: shopId, status: 'active', hired_at: today })
    .select('id')
    .single()
  if (error) throw new Error(`employment insert failed: ${error.message}`)
  return data.id as string
}

async function ensureShiftPatterns(employmentId: string, barberId: string, shopId: string): Promise<void> {
  const { data: existing, error: findError } = await db
    .from('shift_patterns')
    .select('id')
    .eq('employment_id', employmentId)
    .limit(1)
  if (findError) throw new Error(`shift_patterns lookup failed: ${findError.message}`)
  if (existing && existing.length > 0) return
  const rows = [1, 2, 3, 4, 5, 6].map((weekday) => ({
    employment_id: employmentId,
    barber_id: barberId,
    shop_id: shopId,
    weekday,
    start_time: '09:00',
    end_time: '18:00',
  }))
  const { error } = await db.from('shift_patterns').insert(rows)
  if (error) throw new Error(`shift_patterns insert failed: ${error.message}`)
}

async function main(): Promise<void> {
  console.log(`Seeding local demo accounts into ${supabaseUrl} ...`)

  const byKey: Record<AccountSpec['key'], { id: string; created: boolean }> = {} as never
  for (const account of accounts) {
    const result = await ensureAuthUser(account)
    byKey[account.key] = result
    console.log(`  ${result.created ? 'created' : 'exists '} auth user  ${account.email}`)
  }

  const owner = accounts.find((a) => a.key === 'owner')!
  const barber = accounts.find((a) => a.key === 'barber')!
  const customer = accounts.find((a) => a.key === 'customer')!

  // Roles + verification. Owner/barber become verified (an approved account,
  // exactly what admin review sets); customer needs no verification.
  await upsertProfile(byKey.owner.id, owner, 'shop_owner', 'verified')
  await upsertProfile(byKey.barber.id, barber, 'barber', 'verified')
  await upsertProfile(byKey.customer.id, customer, 'customer', 'not_required')

  // Barber trade record must exist and be verified before employment (DB trigger).
  await ensureBarberRecord(byKey.barber.id)

  const shopId = await ensureShop(byKey.owner.id)
  await ensureService(shopId, { name: 'Classic cut', duration_min: 30, price_cents: 28000 })
  await ensureService(shopId, { name: 'Skin fade + beard', duration_min: 45, price_cents: 38000 })

  const employmentId = await ensureActiveEmployment(byKey.barber.id, shopId)
  await ensureShiftPatterns(employmentId, byKey.barber.id, shopId)

  console.log('\nDone. Local demo accounts (sign in with VITE_DATA_BACKEND=api):')
  const generatedAny = accounts.some((a) => a.generated)
  for (const account of accounts) {
    const secret = account.generated ? `${account.password}   <- generated, save it now` : '(password from env)'
    console.log(`  ${account.label.padEnd(9)}${account.email.padEnd(24)}${secret}`)
  }
  if (generatedAny) {
    console.log('\nGenerated passwords are shown only once and are not stored anywhere.')
    console.log('Pin them by setting SEED_PASSWORD (or SEED_<ROLE>_PASSWORD) in apps/api/.env and re-running.')
  }
}

main().catch((error) => {
  console.error('\nSeeding failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
