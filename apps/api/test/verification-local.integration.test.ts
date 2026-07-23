import 'dotenv/config'
import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

const runLocal = process.env.RUN_LOCAL_SUPABASE_TESTS === '1'
const localDescribe = runLocal ? describe : describe.skip

interface SignedInUser {
  client: SupabaseClient
  id: string
  token: string
  email: string
}

interface SubmissionRow {
  id: string
  user_id: string
  requested_role: 'barber' | 'shop_owner'
  status: string
  form_data: Record<string, unknown>
  version: number
}

interface DocumentRow {
  id: string
  storage_path: string
}

function required(...names: string[]): string {
  const value = names.map((name) => process.env[name]).find(Boolean)
  if (!value) throw new Error(`${names.join(' or ')} is required for local Supabase verification tests.`)
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

localDescribe('professional verification commands and RLS', () => {
  let service: SupabaseClient
  let applicant: SignedInUser
  let outsider: SignedInUser
  let administrator: SignedInUser
  let submission: SubmissionRow
  const password = `Verification!${crypto.randomUUID()}`
  const namespace = crypto.randomUUID()
  const applicantPhone = `+639${(
    BigInt(`0x${namespace.replaceAll('-', '').slice(0, 12)}`) % 1_000_000_000n
  ).toString().padStart(9, '0')}`

  async function createUser(label: string, phone?: string): Promise<SignedInUser> {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const email = `${slug}-${namespace}@verification.test`
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

  beforeAll(async () => {
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const
    service = createClient(
      required('LOCAL_SUPABASE_URL', 'SUPABASE_URL'),
      required('LOCAL_SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY'),
      options,
    )
    applicant = await createUser('Verification Applicant', applicantPhone)
    outsider = await createUser('Verification Outsider')
    administrator = await createUser('Verification Administrator')

    const enrollment = await administrator.client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `verification-${namespace}`,
    })
    if (enrollment.error || !enrollment.data.totp) {
      throw enrollment.error ?? new Error('TOTP enrollment did not return a secret.')
    }
    const verification = await administrator.client.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id,
      code: totp(enrollment.data.totp.secret),
    })
    if (verification.error) throw verification.error

    const provisioned = await service.rpc('api_provision_verification_admin', {
      p_user_id: administrator.id,
      p_expected_email: administrator.email,
      p_capabilities: [
        'verification_queue_read',
        'verification_assign',
        'verification_review',
        'professional_suspend',
      ],
      p_operator_reference: `integration-${namespace}`,
      p_command_id: crypto.randomUUID(),
    })
    if (provisioned.error) throw provisioned.error

    const begin = await service.rpc('api_begin_professional_verification', {
      p_actor_id: applicant.id,
      p_requested_role: 'barber',
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    if (begin.error || !begin.data) throw begin.error ?? new Error('Verification onboarding returned no data.')
    submission = (begin.data as { submission: SubmissionRow }).submission
  }, 30_000)

  it('creates a role-discriminated draft and replays only an identical command', async () => {
    expect(submission).toMatchObject({
      user_id: applicant.id,
      requested_role: 'barber',
      status: 'draft',
      version: 1,
      form_data: { version: 1, role: 'barber' },
    })

    const commandId = crypto.randomUUID()
    const initial = await service.rpc('api_update_verification_submission', {
      p_actor_id: applicant.id,
      p_submission_id: submission.id,
      p_expected_version: submission.version,
      p_legal_name: 'Verification Applicant',
      p_form_data: {
        version: 1,
        role: 'barber',
        date_of_birth: '1995-04-12',
        years_experience: 4,
        specialties: ['fades'],
      },
      p_command_id: commandId,
      p_request_id: null,
    })
    expect(initial.error).toBeNull()
    const replay = await service.rpc('api_update_verification_submission', {
      p_actor_id: applicant.id,
      p_submission_id: submission.id,
      p_expected_version: submission.version,
      p_legal_name: 'Verification Applicant',
      p_form_data: {
        version: 1,
        role: 'barber',
        date_of_birth: '1995-04-12',
        years_experience: 4,
        specialties: ['fades'],
      },
      p_command_id: commandId,
      p_request_id: null,
    })
    expect(replay.error).toBeNull()
    expect(replay.data).toEqual(initial.data)

    const conflicting = await service.rpc('api_update_verification_submission', {
      p_actor_id: applicant.id,
      p_submission_id: submission.id,
      p_expected_version: submission.version,
      p_legal_name: 'Different Name',
      p_form_data: { version: 1, role: 'barber' },
      p_command_id: commandId,
      p_request_id: null,
    })
    expect(conflicting.error?.code).toBe('P4096')
    submission = (initial.data as { submission: SubmissionRow }).submission
  })

  it('denies raw verification/profile authority and service RPCs to browser JWTs', async () => {
    const [ownSubmission, foreignSubmission, privilegedProfile, directCommand] = await Promise.all([
      applicant.client.from('verification_submissions').select('id'),
      outsider.client.from('verification_submissions').select('id'),
      applicant.client.from('users').select('id,role,requested_role,verification_status,authorization_version'),
      applicant.client.rpc('api_submit_verification', {
        p_actor_id: applicant.id,
        p_submission_id: submission.id,
        p_expected_version: submission.version,
        p_command_id: crypto.randomUUID(),
        p_request_id: null,
      }),
    ])
    expect(ownSubmission.error).not.toBeNull()
    expect(foreignSubmission.error).not.toBeNull()
    expect(privilegedProfile.error).not.toBeNull()
    expect(directCommand.error).not.toBeNull()

  })

  it('submits content-valid evidence, blocks unscanned approval, then approves and audits', async () => {
    const documents: DocumentRow[] = []

    // Register an upload that the next registration supersedes. Replacement
    // evidence is immediately purge-eligible, which lets this suite exercise
    // retention without weakening raw-table privileges or waiting 90 days.
    const staleRegistration = await service.rpc('api_register_verification_upload', {
      p_actor_id: applicant.id,
      p_submission_id: submission.id,
      p_expected_version: submission.version,
      p_document_type: 'government_id_front',
      p_declared_mime: 'image/png',
      p_declared_size_bytes: 128,
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    expect(staleRegistration.error).toBeNull()
    const staleRegistrationData = staleRegistration.data as {
      submission: SubmissionRow
      document: DocumentRow
    }
    submission = staleRegistrationData.submission
    const supersededDocument = staleRegistrationData.document

    for (const [index, documentType] of ['government_id_front', 'selfie'].entries()) {
      const registered = await service.rpc('api_register_verification_upload', {
        p_actor_id: applicant.id,
        p_submission_id: submission.id,
        p_expected_version: submission.version,
        p_document_type: documentType,
        p_declared_mime: 'image/png',
        p_declared_size_bytes: 128,
        p_command_id: crypto.randomUUID(),
        p_request_id: null,
      })
      expect(registered.error).toBeNull()
      const registeredData = registered.data as { submission: SubmissionRow; document: DocumentRow }
      submission = registeredData.submission
      documents.push(registeredData.document)

      const completed = await service.rpc('api_complete_verification_upload', {
        p_actor_id: applicant.id,
        p_submission_id: submission.id,
        p_document_id: registeredData.document.id,
        p_expected_version: submission.version,
        p_detected_mime: 'image/png',
        p_size_bytes: 128,
        p_sha256_hex: String(index + 1).repeat(64),
        p_content_status: 'valid',
        p_malware_status: 'unavailable',
        p_command_id: crypto.randomUUID(),
        p_request_id: null,
      })
      expect(completed.error).toBeNull()
      submission = (completed.data as { submission: SubmissionRow }).submission
    }

    const submitted = await service.rpc('api_submit_verification', {
      p_actor_id: applicant.id,
      p_submission_id: submission.id,
      p_expected_version: submission.version,
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    expect(submitted.error).toBeNull()
    submission = (submitted.data as { submission: SubmissionRow }).submission
    expect(submission.status).toBe('pending')

    const assigned = await service.rpc('api_assign_verification_reviewer', {
      p_actor_id: administrator.id,
      p_submission_id: submission.id,
      p_reviewer_id: administrator.id,
      p_expected_version: submission.version,
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    expect(assigned.error).toBeNull()
    submission = (assigned.data as { submission: SubmissionRow }).submission

    const approvalCommand = crypto.randomUUID()
    const blocked = await service.rpc('api_approve_verification', {
      p_actor_id: administrator.id,
      p_submission_id: submission.id,
      p_expected_version: submission.version,
      p_private_note: 'Identity and professional evidence manually reviewed.',
      p_command_id: approvalCommand,
      p_request_id: null,
    })
    expect(blocked.error?.code).toBe('P4098')

    for (const document of documents) {
      const scan = await service.rpc('api_record_verification_scan', {
        p_document_id: document.id,
        p_malware_status: 'clean',
        p_scanner_provider: 'integration-fixture',
        p_scanner_reference: `fixture-${document.id}`,
        p_command_id: crypto.randomUUID(),
        p_request_id: null,
      })
      expect(scan.error).toBeNull()
    }

    const approved = await service.rpc('api_approve_verification', {
      p_actor_id: administrator.id,
      p_submission_id: submission.id,
      p_expected_version: submission.version,
      p_private_note: 'Identity and professional evidence manually reviewed.',
      p_command_id: approvalCommand,
      p_request_id: null,
    })
    expect(approved.error).toBeNull()
    const approvedData = approved.data as { submission: SubmissionRow; profile: { authorization_version: number } }
    submission = approvedData.submission

    const replay = await service.rpc('api_approve_verification', {
      p_actor_id: administrator.id,
      p_submission_id: submission.id,
      p_expected_version: submission.version - 1,
      p_private_note: 'Identity and professional evidence manually reviewed.',
      p_command_id: approvalCommand,
      p_request_id: null,
    })
    expect(replay.error).toBeNull()
    expect(replay.data).toEqual(approved.data)

    const [profileResult, barberResult, shopResult, capabilityResult, eventResult] = await Promise.all([
      service.from('users').select('role,verification_status,authorization_version').eq('id', applicant.id).single(),
      service.from('barbers').select('id').eq('id', applicant.id),
      service.from('shops').select('id').eq('owner_id', applicant.id),
      service.from('account_capabilities').select('capability,state').eq('user_id', applicant.id),
      service.from('verification_events')
        .select('event_type,private_note')
        .eq('submission_id', submission.id)
        .eq('event_type', 'verification_approved')
        .single(),
    ])
    expect(profileResult.data).toMatchObject({ role: 'barber', verification_status: 'verified' })
    expect(barberResult.data).toHaveLength(1)
    expect(shopResult.data).toEqual([])
    expect(capabilityResult.data).toContainEqual({ capability: 'professional_access', state: 'active' })
    expect(eventResult.data?.private_note).toBe('Identity and professional evidence manually reviewed.')

    const eventMutation = await service.from('verification_events')
      .update({ private_note: 'rewritten' })
      .eq('submission_id', submission.id)
    expect(eventMutation.error).not.toBeNull()

    const suspended = await service.rpc('api_suspend_professional', {
      p_actor_id: administrator.id,
      p_user_id: applicant.id,
      p_expected_authorization_version: profileResult.data?.authorization_version,
      p_public_reason_code: 'unable_to_verify',
      p_public_message: 'Professional access is temporarily suspended.',
      p_private_reason_code: 'integration_security_review',
      p_private_note: 'Suspension integration fixture.',
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    expect(suspended.error).toBeNull()
    const suspendedProfile = (suspended.data as { profile: { authorization_version: number } }).profile

    const restored = await service.rpc('api_restore_professional', {
      p_actor_id: administrator.id,
      p_user_id: applicant.id,
      p_expected_authorization_version: suspendedProfile.authorization_version,
      p_public_reason_code: 'unable_to_verify',
      p_public_message: 'Professional access has been restored.',
      p_private_reason_code: 'integration_review_cleared',
      p_private_note: 'Restoration integration fixture.',
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    expect(restored.error).toBeNull()

    const { data: grants, error: grantsError } = await service
      .from('account_capabilities')
      .select('capability,state')
      .eq('user_id', applicant.id)
      .eq('capability', 'professional_access')
      .order('granted_at')
    expect(grantsError).toBeNull()
    expect(grants).toEqual([
      { capability: 'professional_access', state: 'revoked' },
      { capability: 'professional_access', state: 'active' },
    ])

    const { data: restoredEvent, error: restoredEventError } = await service
      .from('verification_events')
      .select('public_reason_code,private_reason_code,private_note')
      .eq('submission_id', submission.id)
      .eq('event_type', 'professional_restored')
      .single()
    expect(restoredEventError).toBeNull()
    expect(restoredEvent).toEqual({
      public_reason_code: 'unable_to_verify',
      private_reason_code: 'integration_review_cleared',
      private_note: 'Restoration integration fixture.',
    })

    const { data: retentionRows, error: retentionError } = await service
      .from('verification_documents')
      .select('id,storage_path,purge_after')
      .in('id', documents.map((document) => document.id))
      .order('id')
    expect(retentionError).toBeNull()
    expect(retentionRows).toHaveLength(2)
    expect(retentionRows?.every((document) => document.purge_after !== null)).toBe(true)

    const { data: dueDocument, error: dueDocumentError } = await service
      .from('verification_documents')
      .select('id,submission_id,status,storage_path,purge_after')
      .eq('id', supersededDocument.id)
      .single()
    expect(dueDocumentError).toBeNull()
    expect(dueDocument).toMatchObject({
      submission_id: submission.id,
      status: 'superseded',
      storage_path: supersededDocument.storage_path,
    })
    expect(dueDocument?.purge_after).not.toBeNull()

    const setHold = await service.rpc('api_set_verification_evidence_legal_hold', {
      p_actor_id: administrator.id,
      p_document_id: supersededDocument.id,
      p_hold: true,
      p_reason: 'Integration retention hold.',
      p_operator_reference: `integration-${namespace}`,
      p_command_id: crypto.randomUUID(),
    })
    expect(setHold.error).toBeNull()

    const heldClaim = await service.rpc('api_claim_due_verification_evidence', {
      p_limit: 100,
      p_command_id: crypto.randomUUID(),
    })
    expect(heldClaim.error).toBeNull()
    expect((heldClaim.data as { jobs: unknown[] }).jobs).toEqual([])

    const releaseHold = await service.rpc('api_set_verification_evidence_legal_hold', {
      p_actor_id: administrator.id,
      p_document_id: supersededDocument.id,
      p_hold: false,
      p_reason: 'Integration retention hold released.',
      p_operator_reference: `integration-${namespace}`,
      p_command_id: crypto.randomUUID(),
    })
    expect(releaseHold.error).toBeNull()

    const claimCommandId = crypto.randomUUID()
    const claim = await service.rpc('api_claim_due_verification_evidence', {
      p_limit: 100,
      p_command_id: claimCommandId,
    })
    expect(claim.error).toBeNull()
    expect(claim.data).toEqual({
      claim_id: claimCommandId,
      jobs: [{
        document_id: supersededDocument.id,
        submission_id: submission.id,
        storage_path: supersededDocument.storage_path,
      }],
    })

    const finalized = await service.rpc('api_finalize_verification_evidence_purge', {
      p_document_id: supersededDocument.id,
      p_claim_id: claimCommandId,
      p_expected_storage_path: supersededDocument.storage_path,
      p_command_id: crypto.randomUUID(),
      p_request_id: null,
    })
    expect(finalized.error).toBeNull()

    const { data: retentionResult, error: retentionResultError } = await service
      .from('verification_documents')
      .select('id,status,storage_path,sha256,purged_at,legal_hold_at')
      .in('id', [...documents.map((document) => document.id), supersededDocument.id])
      .order('id')
    expect(retentionResultError).toBeNull()
    expect(retentionResult?.find((document) => document.id === supersededDocument.id)).toMatchObject({
      status: 'purged',
      storage_path: null,
      sha256: null,
      legal_hold_at: null,
    })
    expect(retentionResult?.find((document) => document.id === supersededDocument.id)?.purged_at).not.toBeNull()
    expect(documents.every((current) => retentionResult?.some((row) => (
      row.id === current.id && row.status === 'ready' && row.storage_path === current.storage_path
    )))).toBe(true)
  }, 30_000)
})
