import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DataError,
  type AdminVerificationDetail,
  type AdminVerificationQueueItem,
  type ProfessionalAccessSummary,
  type VerificationApplicantReasonCode,
  type VerificationInformationItem,
  type VerificationSubmissionStatus,
} from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import { useBackend } from '../services/backend'
import { DoodleIcon } from '../theme/DoodleDefs'
import './AdminVerificationPage.css'

const QUEUE_STATUSES: Array<VerificationSubmissionStatus | 'all'> = [
  'all', 'pending', 'needs_information', 'approved', 'rejected', 'withdrawn',
]

const REASONS: VerificationApplicantReasonCode[] = [
  'documents_unreadable',
  'details_do_not_match',
  'missing_information',
  'shop_control_not_confirmed',
  'eligibility_not_met',
  'unable_to_verify',
]

function commandId(): string {
  return crypto.randomUUID()
}

function errorMessage(error: unknown): string {
  if (error instanceof DataError) {
    if (error.code === 'mfa_required') return 'Admin verification requires an AAL2 session. Complete MFA, then reload this page.'
    if (error.code === 'capability_required' || error.code === 'forbidden') return 'Your admin account does not have the required review capability.'
    return error.message
  }
  return 'The admin verification request failed.'
}

export function AdminVerificationPage() {
  const backend = useBackend()
  const [items, setItems] = useState<AdminVerificationQueueItem[]>([])
  const [status, setStatus] = useState<VerificationSubmissionStatus | 'all'>('pending')
  const [assigned, setAssigned] = useState<'all' | 'me' | 'unassigned'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    backend.admin.listVerifications({
      ...(status === 'all' ? {} : { status }),
      assigned,
      limit: 50,
    }).then((page) => {
      if (active) setItems(page.items)
    }).catch((requestError: unknown) => {
      if (active) setError(errorMessage(requestError))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [assigned, backend, status])

  return (
    <section className="admin-verification" aria-labelledby="admin-verification-title">
      <header className="admin-verification-head">
        <div><span className="eyebrow">TRUST &amp; SAFETY</span><h1 id="admin-verification-title">Professional verification queue</h1><p>Evidence access and every decision are audited. AAL2 and explicit reviewer capabilities are required by the API.</p></div>
        <DoodleIcon name="search" size={54} />
      </header>

      <div className="admin-verification-filters">
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{QUEUE_STATUSES.map((value) => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
        <label>Assignment<select value={assigned} onChange={(event) => setAssigned(event.target.value as typeof assigned)}><option value="all">All cases</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p>Loading verification queue…</p> : (
        <div className="admin-verification-table-wrap">
          <table className="admin-verification-table">
            <thead><tr><th>Applicant</th><th>Role</th><th>Status</th><th>Submitted</th><th>Assignment</th><th /></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.applicant.full_name}</strong><small>Attempt {item.attempt_number}</small></td>
                  <td>{item.requested_role.replace('_', ' ')}</td>
                  <td><span className={`pill is-${item.status}`}>{item.status.replaceAll('_', ' ')}</span></td>
                  <td>{item.submitted_at ? new Date(item.submitted_at).toLocaleString('en-PH') : 'Not submitted'}</td>
                  <td>{item.assigned_reviewer_id ? 'Assigned' : 'Unassigned'}</td>
                  <td><Link className="btn btn-sm" to={`/admin/verifications/${item.id}`}>Review</Link></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6}>No cases match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function AdminVerificationDetailPage() {
  const backend = useBackend()
  const { profile } = useAuth()
  const { submissionId = '' } = useParams()
  const [detail, setDetail] = useState<AdminVerificationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [publicMessage, setPublicMessage] = useState('')
  const [privateNote, setPrivateNote] = useState('')
  const [reason, setReason] = useState<VerificationApplicantReasonCode>('missing_information')
  const [informationField, setInformationField] = useState<Extract<VerificationInformationItem, { target: 'field' }>['field']>('legal_name')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setDetail(await backend.admin.getVerification(submissionId))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [backend, submissionId])

  async function run(label: string, action: () => Promise<AdminVerificationDetail>, success: string) {
    if (working) return
    setWorking(label)
    setError('')
    setNotice('')
    try {
      setDetail(await action())
      setNotice(success)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setWorking('')
    }
  }

  async function viewEvidence(documentId: string) {
    if (working) return
    setWorking('view')
    setError('')
    try {
      const view = await backend.admin.getVerificationEvidenceView(submissionId, documentId)
      window.open(view.url, '_blank', 'noopener,noreferrer')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setWorking('')
    }
  }

  if (loading) return <section className="admin-verification"><p>Loading case…</p></section>
  if (!detail) return <section className="admin-verification"><Link to="/admin/verifications">← Back to queue</Link>{error && <p className="form-error" role="alert">{error}</p>}</section>
  const allowed = new Set(detail.allowed_actions)

  return (
    <section className="admin-verification" aria-labelledby="admin-case-title">
      <Link to="/admin/verifications">← Back to queue</Link>
      <header className="admin-verification-head"><div><span className="eyebrow">VERIFICATION CASE</span><h1 id="admin-case-title">{detail.applicant.full_name}</h1><p>{detail.applicant.email} · {detail.submission.requested_role.replace('_', ' ')}</p></div><span className={`pill is-${detail.submission.status}`}>{detail.submission.status.replaceAll('_', ' ')}</span></header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <div className="admin-case-grid">
        <article className="admin-case-card">
          <h2>Identity and form</h2>
          <dl><dt>Legal name</dt><dd>{detail.submission.legal_name}</dd><dt>Email confirmed</dt><dd>{detail.email_confirmed ? 'Yes' : 'No'}</dd><dt>Professional phone confirmed</dt><dd>{detail.professional_phone_verified ? 'Yes' : 'No'}</dd><dt>Submission version</dt><dd>{detail.submission.version}</dd></dl>
          <pre>{JSON.stringify(detail.submission.form_data, null, 2)}</pre>
        </article>

        <article className="admin-case-card">
          <h2>Evidence</h2>
          <ul className="admin-evidence-list">
            {detail.documents.map((document) => <li key={document.id}><span><strong>{document.document_type.replaceAll('_', ' ')}</strong><small>{document.status} · content {document.content_status} · scan {document.malware_status}</small></span>{allowed.has('view_evidence') && <button type="button" className="btn btn-sm" disabled={Boolean(working)} onClick={() => void viewEvidence(document.id)}>Open audited view</button>}</li>)}
            {detail.documents.length === 0 && <li>No evidence uploaded.</li>}
          </ul>
        </article>

        <article className="admin-case-card">
          <h2>Review actions</h2>
          {!detail.assigned_reviewer_id && allowed.has('assign') && profile && <button type="button" className="btn" disabled={Boolean(working)} onClick={() => void run('assign', () => backend.admin.assignVerification(submissionId, { command_id: commandId(), expected_version: detail.submission.version, reviewer_id: profile.id }), 'Case assigned to you.')}>Assign to me</button>}
          {detail.assigned_reviewer_id && <p>Reviewer: {detail.assigned_reviewer_id === profile?.id ? 'You' : detail.assigned_reviewer_id}</p>}
          <label>Public message<textarea rows={3} value={publicMessage} onChange={(event) => setPublicMessage(event.target.value)} /></label>
          <label>Private reviewer note<textarea rows={3} value={privateNote} onChange={(event) => setPrivateNote(event.target.value)} /></label>
          {allowed.has('request_information') && <div className="admin-action-block"><label>Missing field<select value={informationField} onChange={(event) => setInformationField(event.target.value as typeof informationField)}><option value="legal_name">Legal name</option><option value="date_of_birth">Date of birth</option><option value="experience">Experience</option><option value="specialties">Specialties</option><option value="business_name">Business name</option><option value="business_contact">Business contact</option><option value="intended_shop">Intended shop</option></select></label><button type="button" className="btn" disabled={Boolean(working) || !publicMessage.trim()} onClick={() => void run('information', () => backend.admin.requestVerificationInformation(submissionId, { command_id: commandId(), expected_version: detail.submission.version, information_items: [{ target: 'field', field: informationField, message: publicMessage.trim() }], public_message: publicMessage.trim(), ...(privateNote.trim() ? { private_note: privateNote.trim(), private_reason_code: 'manual_information_request' } : {}) }), 'Information request sent.')}>Request information</button></div>}
          {allowed.has('approve') && <button type="button" className="btn btn-primary" disabled={Boolean(working)} onClick={() => void run('approve', () => backend.admin.approveVerification(submissionId, { command_id: commandId(), expected_version: detail.submission.version, ...(privateNote.trim() ? { private_note: privateNote.trim() } : {}) }), 'Professional access approved.')}>Approve professional</button>}
          {allowed.has('reject') && <div className="admin-action-block"><label>Public reason<select value={reason} onChange={(event) => setReason(event.target.value as VerificationApplicantReasonCode)}>{REASONS.map((value) => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><button type="button" className="btn btn-danger" disabled={Boolean(working)} onClick={() => void run('reject', () => backend.admin.rejectVerification(submissionId, { command_id: commandId(), expected_version: detail.submission.version, public_reason_code: reason, ...(publicMessage.trim() ? { public_message: publicMessage.trim() } : {}), private_reason_code: 'manual_rejection', ...(privateNote.trim() ? { private_note: privateNote.trim() } : {}) }), 'Application rejected.')}>Reject application</button></div>}
          {detail.submission.status === 'approved' && <Link className="btn" to={`/admin/users/${detail.applicant.id}`}>Manage professional access</Link>}
        </article>

        <article className="admin-case-card">
          <h2>Applicant-visible timeline</h2>
          <ol>{detail.timeline.map((event) => <li key={event.id}><strong>{event.event_type.replaceAll('_', ' ')}</strong><small>{new Date(event.created_at).toLocaleString('en-PH')}</small>{event.public_message && <p>{event.public_message}</p>}</li>)}</ol>
        </article>
      </div>
    </section>
  )
}

export function AdminProfessionalPage() {
  const backend = useBackend()
  const { userId = '' } = useParams()
  const [summary, setSummary] = useState<ProfessionalAccessSummary | null>(null)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [reason, setReason] = useState<VerificationApplicantReasonCode>('unable_to_verify')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    backend.admin.getProfessional(userId).then((value) => { if (active) setSummary(value) }).catch((requestError: unknown) => { if (active) setError(errorMessage(requestError)) })
    return () => { active = false }
  }, [backend, userId])

  async function changeAccess(action: 'suspend' | 'restore') {
    if (!summary || working) return
    setWorking(true)
    setError('')
    const input = { command_id: commandId(), expected_authorization_version: summary.authorization_version, public_reason_code: reason, ...(message.trim() ? { public_message: message.trim() } : {}), private_reason_code: `manual_${action}` }
    try {
      setSummary(action === 'suspend' ? await backend.admin.suspendProfessional(userId, input) : await backend.admin.restoreProfessional(userId, input))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setWorking(false)
    }
  }

  return <section className="admin-verification"><Link to="/admin/verifications">← Back to queue</Link><header className="admin-verification-head"><div><span className="eyebrow">PROFESSIONAL ACCESS</span><h1>{summary?.full_name ?? 'Loading professional…'}</h1>{summary && <p>{summary.email} · authorization version {summary.authorization_version}</p>}</div></header>{error && <p className="form-error" role="alert">{error}</p>}{summary && <article className="admin-case-card"><p>Access: <strong>{summary.professional_access ? 'Active' : 'Suspended'}</strong></p><label>Public reason<select value={reason} onChange={(event) => setReason(event.target.value as VerificationApplicantReasonCode)}>{REASONS.map((value) => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label>Public message<textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} /></label>{summary.allowed_actions.includes('suspend') && <button className="btn btn-danger" type="button" disabled={working} onClick={() => void changeAccess('suspend')}>Suspend access</button>}{summary.allowed_actions.includes('restore') && <button className="btn btn-primary" type="button" disabled={working} onClick={() => void changeAccess('restore')}>Restore access</button>}</article>}</section>
}
