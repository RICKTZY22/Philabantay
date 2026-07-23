/**
 * Provision an existing Supabase Auth identity as a narrowly-capable admin.
 *
 * This script never creates an account, accepts a password, changes a password,
 * or prints a credential.  The database command additionally requires the
 * target identity to have a confirmed email and a verified MFA factor.
 *
 * Example:
 *   npm run admin:provision -w @barbershop/api -- \
 *     --email reviewer@example.com \
 *     --capabilities verification_queue_read,verification_assign,verification_review \
 *     --operator "ops-ticket-1234"
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient, type User } from '@supabase/supabase-js'

const ADMIN_CAPABILITIES = new Set([
  'verification_queue_read',
  'verification_assign',
  'verification_review',
  'professional_suspend',
] as const)

type AdminCapability = typeof ADMIN_CAPABILITIES extends Set<infer Value> ? Value : never

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is required.`)
  return normalized
}

const supabaseUrl = required(process.env.SUPABASE_URL, 'SUPABASE_URL')
const serviceRoleKey = required(
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)',
)
const email = required(argument('email') ?? process.env.ADMIN_PROVISION_EMAIL, '--email').toLowerCase()
const operatorReference = required(
  argument('operator') ?? process.env.ADMIN_PROVISION_OPERATOR_REFERENCE,
  '--operator',
)
const capabilityInput = required(
  argument('capabilities') ?? process.env.ADMIN_PROVISION_CAPABILITIES,
  '--capabilities',
)
const capabilities = [...new Set(capabilityInput.split(',').map((value) => value.trim()).filter(Boolean))]

if (capabilities.length === 0 || capabilities.some((value) => !ADMIN_CAPABILITIES.has(value as AdminCapability))) {
  throw new Error(`--capabilities must contain only: ${[...ADMIN_CAPABILITIES].join(', ')}`)
}

const database = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

async function findAuthUserByEmail(expectedEmail: string): Promise<User | null> {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await database.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`Unable to list Auth users: ${error.message}`)
    const match = data.users.find((user) => user.email?.toLowerCase() === expectedEmail)
    if (match) return match
    if (data.users.length < 200) return null
  }
  throw new Error('Auth user lookup exceeded the safety page limit.')
}

async function main(): Promise<void> {
  const authUser = await findAuthUserByEmail(email)
  if (!authUser) throw new Error('No existing Supabase Auth user matches that email.')

  const commandId = randomUUID()
  const { data, error } = await database.rpc('api_provision_verification_admin', {
    p_user_id: authUser.id,
    p_expected_email: email,
    p_capabilities: capabilities,
    p_operator_reference: operatorReference,
    p_command_id: commandId,
  })
  if (error) throw new Error(`Administrator provisioning was rejected: ${error.message}`)

  const result = data as {
    user_id: string
    role: string
    authorization_version: number
    capabilities: string[]
  }
  console.log('Administrator provisioning completed.')
  console.log(`User: ${result.user_id}`)
  console.log(`Role: ${result.role}`)
  console.log(`Authorization version: ${result.authorization_version}`)
  console.log(`Capabilities: ${result.capabilities.join(', ')}`)
  console.log(`Audit command: ${commandId}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
