import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type { Profile } from '@barbershop/shared'
import { createApp } from '../src/app'
import type { ApiDependencies } from '../src/lib/supabase'

type QueryResult = { data: unknown; error: unknown }

function query(result: QueryResult): Record<string, unknown> {
  const builder: Record<string, unknown> = {}
  for (const method of [
    'select', 'eq', 'neq', 'not', 'is', 'or', 'order', 'limit', 'lte',
  ]) {
    builder[method] = vi.fn(() => builder)
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject)
  return builder
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: crypto.randomUUID(),
    role: 'customer',
    requested_role: 'shop_owner',
    verification_status: 'pending',
    authorization_version: 1,
    onboarding_completed: true,
    full_name: 'Pending Professional',
    email: 'pending-professional@example.test',
    phone: '+639171234567',
    location: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function dependencies(input: {
  profile: Profile
  aal?: 'aal1' | 'aal2'
  tableResults?: Record<string, QueryResult>
  rpc?: ReturnType<typeof vi.fn>
  storage?: Record<string, unknown>
}): { dependencies: ApiDependencies; from: ReturnType<typeof vi.fn> } {
  const tableResults = input.tableResults ?? {}
  const from = vi.fn((table: string) => {
    if (table === 'users') return query({ data: input.profile, error: null })
    const result = tableResults[table]
    if (!result) throw new Error(`Unexpected table query: ${table}`)
    return query(result)
  })
  return {
    dependencies: {
      auth: {
        auth: {
          getClaims: vi.fn().mockResolvedValue({
            data: { claims: { sub: input.profile.id, aal: input.aal ?? 'aal1' } },
            error: null,
          }),
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: input.profile.id,
                email: input.profile.email,
                email_confirmed_at: new Date().toISOString(),
                phone: input.profile.phone,
                phone_confirmed_at: input.profile.phone ? new Date().toISOString() : null,
              },
            },
            error: null,
          }),
        },
      },
      database: {
        from,
        rpc: input.rpc ?? vi.fn(),
        storage: input.storage,
      },
    } as unknown as ApiDependencies,
    from,
  }
}

const authorization = () => `Bearer ${crypto.randomUUID()}`
const appOptions = { webOrigin: 'http://127.0.0.1:5174' }

describe('professional verification HTTP boundary', () => {
  it('lets a locked professional load their verification workspace but blocks operational routes', async () => {
    const pending = profile()
    const fixture = dependencies({
      profile: pending,
      tableResults: {
        verification_submissions: { data: null, error: null },
      },
    })
    const app = createApp(fixture.dependencies, appOptions)

    const workspace = await request(app)
      .get('/api/v1/verification/me')
      .set('Authorization', authorization())

    expect(workspace.status).toBe(200)
    expect(workspace.body.data).toMatchObject({
      requested_role: 'shop_owner',
      verification_status: 'pending',
      authorization_version: 1,
      submission: null,
      documents: [],
      timeline: [],
    })

    const blocked = await request(app)
      .get('/api/v1/bookings')
      .set('Authorization', authorization())

    expect(blocked.status).toBe(403)
    expect(blocked.body).toEqual({
      error: {
        code: 'verification_locked',
        message: 'Professional operations are unavailable for this account.',
      },
    })
    expect(fixture.from).not.toHaveBeenCalledWith('appointments')
  })

  it('rejects an AAL1 administrator before any capability or queue query', async () => {
    const admin = profile({
      role: 'admin',
      requested_role: null,
      verification_status: 'verified',
      full_name: 'AAL1 Administrator',
      email: 'aal1-admin@example.test',
    })
    const fixture = dependencies({ profile: admin, aal: 'aal1' })

    const response = await request(createApp(fixture.dependencies, appOptions))
      .get('/api/v1/admin/verifications')
      .set('Authorization', authorization())

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('mfa_required')
    expect(fixture.from.mock.calls.map(([table]) => table)).toEqual(['users'])
  })

  it('rejects an AAL2 administrator without queue capability before reading submissions', async () => {
    const admin = profile({
      role: 'admin',
      requested_role: null,
      verification_status: 'verified',
      full_name: 'Unprivileged Administrator',
      email: 'unprivileged-admin@example.test',
    })
    const fixture = dependencies({
      profile: admin,
      aal: 'aal2',
      tableResults: {
        account_capabilities: { data: null, error: null },
      },
    })

    const response = await request(createApp(fixture.dependencies, appOptions))
      .get('/api/v1/admin/verifications')
      .set('Authorization', authorization())

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('capability_required')
    expect(fixture.from.mock.calls.map(([table]) => table)).toEqual([
      'users',
      'account_capabilities',
    ])
    expect(fixture.from).not.toHaveBeenCalledWith('verification_submissions')
  })

  it('returns applicant-safe projections without evidence paths, hashes, or private review fields', async () => {
    const now = new Date().toISOString()
    const pending = profile()
    const submissionId = crypto.randomUUID()
    const fixture = dependencies({
      profile: pending,
      tableResults: {
        verification_submissions: {
          data: {
            id: submissionId,
            requested_role: 'shop_owner',
            status: 'pending',
            attempt_number: 1,
            supersedes_submission_id: null,
            legal_name: 'Pending Professional',
            form_schema_version: 1,
            form_data: { version: 1, role: 'shop_owner' },
            submission_round: 1,
            submitted_at: now,
            reviewed_at: null,
            retry_after: null,
            applicant_reason_code: null,
            applicant_message: null,
            private_reason_code: 'internal-risk-code',
            private_note: 'must never leave the API',
            version: 2,
            created_at: now,
            updated_at: now,
          },
          error: null,
        },
        verification_documents: {
          data: [{
            id: crypto.randomUUID(),
            submission_id: submissionId,
            document_type: 'business_registration',
            status: 'ready',
            declared_mime: 'application/pdf',
            declared_size_bytes: 512,
            detected_mime: 'application/pdf',
            size_bytes: 512,
            content_status: 'valid',
            malware_status: 'clean',
            uploaded_at: now,
            validated_at: now,
            scanned_at: now,
            purge_after: null,
            purged_at: null,
            storage_path: 'verification-evidence/private-object.pdf',
            sha256_hex: 'private-document-hash',
            version: 1,
            created_at: now,
          }],
          error: null,
        },
        verification_events: {
          data: [{
            id: crypto.randomUUID(),
            event_type: 'submission_submitted',
            from_status: 'draft',
            to_status: 'pending',
            public_reason_code: null,
            public_message: 'Submitted for review.',
            private_reason_code: 'internal-only',
            private_note: 'reviewer-only note',
            metadata: { private_signal: 'do-not-return' },
            created_at: now,
          }],
          error: null,
        },
      },
    })

    const response = await request(createApp(fixture.dependencies, appOptions))
      .get('/api/v1/verification/me')
      .set('Authorization', authorization())

    expect(response.status).toBe(200)
    expect(response.body.data.submission).not.toHaveProperty('private_reason_code')
    expect(response.body.data.submission).not.toHaveProperty('private_note')
    expect(response.body.data.documents[0]).not.toHaveProperty('storage_path')
    expect(response.body.data.documents[0]).not.toHaveProperty('sha256_hex')
    expect(response.body.data.timeline[0]).not.toHaveProperty('private_reason_code')
    expect(response.body.data.timeline[0]).not.toHaveProperty('private_note')
    expect(JSON.stringify(response.body.data)).not.toContain('do-not-return')
  })

  it('records the evidence-view audit event before creating a signed URL', async () => {
    const pending = profile()
    const submissionId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const order: string[] = []
    const rpc = vi.fn(async (command: string) => {
      order.push(`rpc:${command}`)
      return {
        data: { storage_path: `${pending.id}/${submissionId}/${documentId}.pdf` },
        error: null,
      }
    })
    const createSignedUrl = vi.fn(async () => {
      order.push('storage:createSignedUrl')
      return { data: { signedUrl: 'https://evidence.example.test/signed' }, error: null }
    })
    const fixture = dependencies({
      profile: pending,
      rpc,
      storage: {
        from: vi.fn(() => ({ createSignedUrl })),
      },
    })

    const response = await request(createApp(fixture.dependencies, appOptions))
      .post(`/api/v1/verification/submissions/${submissionId}/documents/${documentId}/view`)
      .set('Authorization', authorization())

    expect(response.status).toBe(200)
    expect(order).toEqual([
      'rpc:api_record_verification_evidence_view',
      'storage:createSignedUrl',
    ])
    expect(createSignedUrl).toHaveBeenCalledWith(
      `${pending.id}/${submissionId}/${documentId}.pdf`,
      60,
    )
  })
})
