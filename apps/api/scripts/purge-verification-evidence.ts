/**
 * Manual, idempotent verification-evidence retention worker.
 *
 * The database first claims eligible rows and immediately blocks future signed
 * views.  This worker then deletes the opaque Storage object and finalizes the
 * metadata tombstone. Legal holds are excluded by the command itself. A failed
 * worker claim can be reclaimed after the database safety timeout.
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

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
const requestedLimit = Number(argument('limit') ?? process.env.VERIFICATION_PURGE_LIMIT ?? '25')
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
  throw new Error('--limit must be an integer from 1 through 100.')
}

const database = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

interface PurgeJob {
  document_id: string
  submission_id: string
  storage_path: string
}

interface PurgeClaim {
  claim_id: string
  jobs: PurgeJob[]
}

async function main(): Promise<void> {
  const claimCommandId = randomUUID()
  const { data, error } = await database.rpc('api_claim_due_verification_evidence', {
    p_limit: requestedLimit,
    p_command_id: claimCommandId,
  })
  if (error) throw new Error(`Unable to claim evidence for purge: ${error.message}`)

  const claim = data as PurgeClaim
  let purged = 0
  const failed: string[] = []

  for (const job of claim.jobs) {
    const { error: storageError } = await database.storage
      .from('verification-evidence')
      .remove([job.storage_path])
    if (storageError) {
      failed.push(job.document_id)
      continue
    }

    const { error: finalizeError } = await database.rpc('api_finalize_verification_evidence_purge', {
      p_document_id: job.document_id,
      p_claim_id: claim.claim_id,
      p_expected_storage_path: job.storage_path,
      p_command_id: randomUUID(),
      p_request_id: null,
    })
    if (finalizeError) {
      failed.push(job.document_id)
      continue
    }
    purged += 1
  }

  console.log(`Claimed: ${claim.jobs.length}`)
  console.log(`Purged: ${purged}`)
  if (failed.length > 0) {
    console.error(`Failed document IDs: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
