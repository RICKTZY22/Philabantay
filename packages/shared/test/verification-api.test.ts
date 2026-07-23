import { describe, expect, it, vi } from 'vitest'
import { ApiBackend, type VerificationWorkspace } from '../src/index'

const timestamp = '2026-07-22T04:00:00.000Z'

function json(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function memoryStorage(accessToken: string, refreshToken: string) {
  const values = new Map([[
    'philabantay.api.session.v1',
    JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
  ]])
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('ApiBackend verification HTTP contract', () => {
  it('uses the frozen applicant and administrator methods and paths', async () => {
    const submissionId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const reviewerId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const commandId = crypto.randomUUID()
    const challengeId = crypto.randomUUID()
    const accessToken = crypto.randomUUID()
    const refreshToken = crypto.randomUUID()

    const workspace: VerificationWorkspace = {
      requested_role: 'barber',
      verification_status: 'pending',
      authorization_version: 1,
      email_confirmed: true,
      professional_phone_verified: false,
      evidence_requirements: {
        all_of: ['government_id_front', 'selfie'],
        one_of: [],
      },
      submission: {
        id: submissionId,
        requested_role: 'barber',
        status: 'draft',
        attempt_number: 1,
        supersedes_submission_id: null,
        legal_name: 'Test Barber',
        form_schema_version: 1,
        form_data: { version: 1, role: 'barber' },
        submission_round: 0,
        submitted_at: null,
        reviewed_at: null,
        retry_after: null,
        applicant_reason_code: null,
        applicant_message: null,
        version: 1,
        created_at: timestamp,
        updated_at: timestamp,
      },
      documents: [],
      timeline: [],
      allowed_actions: ['update_submission'],
    }
    const view = { url: 'https://evidence.example.test/view', expires_at: timestamp }
    const uploadGrant = {
      document: {
        id: documentId,
        submission_id: submissionId,
        document_type: 'government_id_front',
        status: 'awaiting_upload',
        declared_mime: 'image/jpeg',
        declared_size_bytes: 100,
        detected_mime: null,
        size_bytes: null,
        content_status: 'pending',
        malware_status: 'pending',
        uploaded_at: null,
        validated_at: null,
        scanned_at: null,
        purge_after: null,
        purged_at: null,
        version: 1,
        created_at: timestamp,
      },
      submission_version: 2,
      upload_url: 'https://evidence.example.test/upload',
      headers: { 'x-upload-token': 'token' },
      expires_at: timestamp,
    }
    const adminDetail = {
      applicant: {
        id: userId,
        full_name: 'Test Barber',
        email: 'barber@example.test',
        phone: '+639171234567',
      },
      submission: workspace.submission,
      documents: [],
      timeline: [],
      assigned_reviewer_id: reviewerId,
      assigned_at: timestamp,
      email_confirmed: true,
      professional_phone_verified: true,
      allowed_actions: ['view_evidence', 'approve'],
    }
    const queueItem = {
      id: submissionId,
      applicant: { id: userId, full_name: 'Test Barber' },
      requested_role: 'barber',
      status: 'pending',
      attempt_number: 1,
      submitted_at: timestamp,
      assigned_reviewer_id: reviewerId,
      assigned_at: timestamp,
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    }
    const professional = {
      user_id: userId,
      full_name: 'Test Barber',
      email: 'barber@example.test',
      role: 'barber',
      requested_role: 'barber',
      verification_status: 'verified',
      authorization_version: 2,
      approved_submission_id: submissionId,
      professional_access: true,
      capabilities: [],
      allowed_actions: ['suspend'],
    }

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input))
      const path = `${url.pathname}${url.search}`
      if (path.endsWith('/documents/request-upload')) return json(uploadGrant)
      if (path.endsWith('/view')) return json(view)
      if (path.endsWith('/phone/challenge')) {
        return json({
          challenge_id: challengeId,
          masked_phone: '+63*******4567',
          expires_at: timestamp,
          resend_after: timestamp,
        })
      }
      if (path.startsWith('/api/v1/admin/verifications?')) {
        return json({ items: [queueItem], next_cursor: null })
      }
      if (path.startsWith('/api/v1/admin/verifications/')) return json(adminDetail)
      if (path.startsWith('/api/v1/admin/users/')) return json(professional)
      return json(workspace)
    })
    const backend = new ApiBackend({
      baseUrl: 'http://api.test/api/v1',
      fetch: fetchMock,
      storage: memoryStorage(accessToken, refreshToken),
    })

    const versionInput = { command_id: commandId, expected_version: 1 }
    await backend.verification.getMine()
    await backend.verification.createSubmission({
      command_id: commandId,
      requested_role: 'barber',
      legal_name: 'Test Barber',
      form_data: { version: 1, role: 'barber' },
    })
    await backend.verification.updateSubmission(submissionId, {
      ...versionInput,
      legal_name: 'Updated Barber',
    })
    await backend.verification.requestEvidenceUpload(submissionId, {
      ...versionInput,
      document_type: 'government_id_front',
      declared_mime: 'image/jpeg',
      declared_size_bytes: 100,
    })
    await backend.verification.completeEvidenceUpload(submissionId, documentId, versionInput)
    await backend.verification.removeEvidence(submissionId, documentId, versionInput)
    await backend.verification.getEvidenceView(submissionId, documentId)
    await backend.verification.submit(submissionId, versionInput)
    await backend.verification.withdraw(submissionId, versionInput)
    await backend.verification.startProfessionalPhoneVerification({
      command_id: commandId,
      phone: '+639171234567',
    })
    await backend.verification.confirmProfessionalPhoneVerification({
      command_id: commandId,
      challenge_id: challengeId,
      code: '123456',
    })

    await backend.admin.listVerifications({
      role: 'barber',
      status: 'pending',
      assigned: 'me',
      cursor: 'cursor:1',
      limit: 25,
    })
    await backend.admin.getVerification(submissionId)
    await backend.admin.assignVerification(submissionId, {
      ...versionInput,
      reviewer_id: reviewerId,
    })
    await backend.admin.getVerificationEvidenceView(submissionId, documentId)
    await backend.admin.requestVerificationInformation(submissionId, {
      ...versionInput,
      information_items: [{
        target: 'field',
        field: 'legal_name',
        message: 'Please use your legal name.',
      }],
    })
    await backend.admin.approveVerification(submissionId, versionInput)
    await backend.admin.rejectVerification(submissionId, {
      ...versionInput,
      public_reason_code: 'unable_to_verify',
      private_reason_code: 'fixture',
    })
    await backend.admin.getProfessional(userId)
    await backend.admin.suspendProfessional(userId, {
      command_id: commandId,
      expected_authorization_version: 2,
      public_reason_code: 'unable_to_verify',
      private_reason_code: 'fixture',
    })
    await backend.admin.restoreProfessional(userId, {
      command_id: commandId,
      expected_authorization_version: 3,
      public_reason_code: 'unable_to_verify',
      private_reason_code: 'fixture',
    })

    expect(fetchMock.mock.calls.map(([input, init]) => [
      init?.method,
      `${new URL(String(input)).pathname}${new URL(String(input)).search}`,
    ])).toEqual([
      ['GET', '/api/v1/verification/me'],
      ['POST', '/api/v1/verification/submissions'],
      ['PATCH', `/api/v1/verification/submissions/${submissionId}`],
      ['POST', `/api/v1/verification/submissions/${submissionId}/documents/request-upload`],
      ['POST', `/api/v1/verification/submissions/${submissionId}/documents/${documentId}/complete`],
      ['POST', `/api/v1/verification/submissions/${submissionId}/documents/${documentId}/remove`],
      ['POST', `/api/v1/verification/submissions/${submissionId}/documents/${documentId}/view`],
      ['POST', `/api/v1/verification/submissions/${submissionId}/submit`],
      ['POST', `/api/v1/verification/submissions/${submissionId}/withdraw`],
      ['POST', '/api/v1/verification/phone/challenge'],
      ['POST', '/api/v1/verification/phone/confirm'],
      ['GET', '/api/v1/admin/verifications?role=barber&status=pending&assigned=me&cursor=cursor%3A1&limit=25'],
      ['GET', `/api/v1/admin/verifications/${submissionId}`],
      ['POST', `/api/v1/admin/verifications/${submissionId}/assign`],
      ['POST', `/api/v1/admin/verifications/${submissionId}/documents/${documentId}/view`],
      ['POST', `/api/v1/admin/verifications/${submissionId}/request-information`],
      ['POST', `/api/v1/admin/verifications/${submissionId}/approve`],
      ['POST', `/api/v1/admin/verifications/${submissionId}/reject`],
      ['GET', `/api/v1/admin/users/${userId}`],
      ['POST', `/api/v1/admin/users/${userId}/suspend`],
      ['POST', `/api/v1/admin/users/${userId}/restore`],
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${accessToken}`)
    }
  })
})
