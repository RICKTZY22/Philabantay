import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  DataError,
  type ProfessionalVerificationRole,
  type VerificationDocumentMetadata,
  type VerificationDocumentType,
  type VerificationDraftFormDataV1,
  type VerificationWorkspace,
} from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import { isProfessionalLocked, professionalRoleOf } from '../lib/access'
import { useBackend } from '../services/backend'
import { DoodleIcon } from '../theme/DoodleDefs'
import './VerificationLockPage.css'

const DOCUMENT_LABELS: Record<VerificationDocumentType, string> = {
  government_id_front: 'Government ID (front)',
  government_id_back: 'Government ID (back)',
  selfie: 'Selfie holding your ID',
  certificate: 'Certificate',
  portfolio: 'Portfolio sample',
  business_registration: 'Business registration',
  proof_of_shop_control: 'Proof of shop control',
  proof_of_business_address: 'Proof of business address',
}

const ROLE_DOCUMENTS: Record<ProfessionalVerificationRole, VerificationDocumentType[]> = {
  barber: ['government_id_front', 'selfie', 'government_id_back', 'certificate', 'portfolio'],
  shop_owner: [
    'government_id_front',
    'selfie',
    'government_id_back',
    'proof_of_shop_control',
    'proof_of_business_address',
    'business_registration',
  ],
}

type FormState = {
  legalName: string
  dateOfBirth: string
  yearsExperience: string
  specialties: string
  professionalSummary: string
  businessLegalName: string
  businessDisplayName: string
  contactEmail: string
  contactPhone: string
  controlBasis: 'owned' | 'leased' | 'managed' | 'family_business' | 'other'
  shopName: string
  addressLine: string
  city: string
}

const EMPTY_FORM: FormState = {
  legalName: '',
  dateOfBirth: '',
  yearsExperience: '',
  specialties: '',
  professionalSummary: '',
  businessLegalName: '',
  businessDisplayName: '',
  contactEmail: '',
  contactPhone: '',
  controlBasis: 'owned',
  shopName: '',
  addressLine: '',
  city: '',
}

function commandId(): string {
  return crypto.randomUUID()
}

function errorMessage(error: unknown): string {
  if (error instanceof DataError) return error.message
  return 'Something went wrong. Please refresh and try again.'
}

function formFromWorkspace(workspace: VerificationWorkspace, profileName: string, profileEmail: string): FormState {
  const draft = workspace.submission?.form_data
  const base = { ...EMPTY_FORM, legalName: workspace.submission?.legal_name ?? profileName, contactEmail: profileEmail }
  if (!draft) return base
  if (draft.role === 'barber') {
    return {
      ...base,
      dateOfBirth: draft.date_of_birth ?? '',
      yearsExperience: draft.years_experience === undefined ? '' : String(draft.years_experience),
      specialties: draft.specialties?.join(', ') ?? '',
      professionalSummary: draft.professional_summary ?? '',
    }
  }
  return {
    ...base,
    dateOfBirth: draft.date_of_birth ?? '',
    businessLegalName: draft.business?.legal_name ?? '',
    businessDisplayName: draft.business?.display_name ?? '',
    contactEmail: draft.business?.contact_email ?? profileEmail,
    contactPhone: draft.business?.contact_phone ?? '',
    controlBasis: draft.business?.control_basis ?? 'owned',
    shopName: draft.intended_shop?.name ?? '',
    addressLine: draft.intended_shop?.address_line ?? '',
    city: draft.intended_shop?.city ?? '',
  }
}

function draftFromForm(role: ProfessionalVerificationRole, form: FormState): VerificationDraftFormDataV1 {
  if (role === 'barber') {
    const years = form.yearsExperience.trim() === '' ? undefined : Number(form.yearsExperience)
    return {
      version: 1,
      role,
      ...(form.dateOfBirth ? { date_of_birth: form.dateOfBirth } : {}),
      ...(Number.isInteger(years) ? { years_experience: years } : {}),
      specialties: form.specialties.split(',').map((value) => value.trim()).filter(Boolean),
      ...(form.professionalSummary.trim() ? { professional_summary: form.professionalSummary.trim() } : {}),
    }
  }
  return {
    version: 1,
    role,
    ...(form.dateOfBirth ? { date_of_birth: form.dateOfBirth } : {}),
    business: {
      legal_name: form.businessLegalName.trim(),
      display_name: form.businessDisplayName.trim(),
      contact_email: form.contactEmail.trim(),
      contact_phone: form.contactPhone.trim(),
      control_basis: form.controlBasis,
    },
    intended_shop: {
      name: form.shopName.trim(),
      address_line: form.addressLine.trim(),
      city: form.city.trim(),
    },
  }
}

function documentState(document: VerificationDocumentMetadata): string {
  if (document.status === 'ready' && document.content_status === 'valid') {
    return document.malware_status === 'clean' ? 'Validated and scanned' : 'Validated; security scan pending'
  }
  if (document.status === 'rejected' || document.content_status === 'invalid') return 'File rejected'
  if (document.status === 'awaiting_upload') return 'Upload not completed'
  return document.status.replaceAll('_', ' ')
}

export function VerificationLockPage() {
  const backend = useBackend()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [workspace, setWorkspace] = useState<VerificationWorkspace | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [phone, setPhone] = useState('')

  const role = profile ? professionalRoleOf(profile) : null

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const next = await backend.verification.getMine()
      setWorkspace(next)
      if (profile) setForm(formFromWorkspace(next, profile.full_name, profile.email))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    backend.verification.getMine().then((next) => {
      if (!active || !profile) return
      setWorkspace(next)
      setForm(formFromWorkspace(next, profile.full_name, profile.email))
    }).catch((requestError: unknown) => {
      if (active) setError(errorMessage(requestError))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [backend, profile])

  const allowed = useMemo(() => new Set(workspace?.allowed_actions ?? []), [workspace])
  const canEdit = allowed.has('create_submission') || allowed.has('update_submission')
  const submission = workspace?.submission ?? null
  const currentDocuments = (workspace?.documents ?? []).filter((document) => (
    !['superseded', 'purged'].includes(document.status)
  ))

  if (!profile) return null
  if (!isProfessionalLocked(profile)) return <Navigate to="/dashboard" replace />
  if (!role) return <Navigate to="/dashboard" replace />
  const applicantProfile = profile
  const requestedRole = role

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function run(label: string, action: () => Promise<VerificationWorkspace>, success: string) {
    if (working) return
    setWorking(label)
    setError('')
    setNotice('')
    try {
      const next = await action()
      setWorkspace(next)
      setForm(formFromWorkspace(next, applicantProfile.full_name, applicantProfile.email))
      setNotice(success)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setWorking('')
    }
  }

  async function saveDraft() {
    const input = {
      command_id: commandId(),
      requested_role: requestedRole,
      legal_name: form.legalName.trim(),
      form_data: draftFromForm(requestedRole, form),
    }
    if (allowed.has('create_submission')) {
      await run('save', () => backend.verification.createSubmission(input), 'Your verification draft was created.')
      return
    }
    if (!submission || !allowed.has('update_submission')) return
    await run('save', () => backend.verification.updateSubmission(submission.id, {
      command_id: input.command_id,
      expected_version: submission.version,
      legal_name: input.legal_name,
      form_data: input.form_data,
    }), 'Your details were saved.')
  }

  async function uploadDocument(documentType: VerificationDocumentType, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !submission || !allowed.has('request_evidence_upload') || working) return
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      setError('Use a JPEG, PNG, or PDF file.')
      return
    }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError('Evidence files must be 10 MB or smaller.')
      return
    }
    setWorking(`upload-${documentType}`)
    setError('')
    setNotice('')
    try {
      const grant = await backend.verification.requestEvidenceUpload(submission.id, {
        command_id: commandId(),
        expected_version: submission.version,
        document_type: documentType,
        declared_mime: file.type as 'image/jpeg' | 'image/png' | 'application/pdf',
        declared_size_bytes: file.size,
      })
      const response = await fetch(grant.upload_url, {
        method: 'PUT',
        headers: { ...grant.headers, 'Content-Type': file.type },
        body: file,
      })
      if (!response.ok) throw new Error('The secure evidence upload failed.')
      const next = await backend.verification.completeEvidenceUpload(submission.id, grant.document.id, {
        command_id: commandId(),
        expected_version: grant.submission_version,
      })
      setWorkspace(next)
      setNotice(`${DOCUMENT_LABELS[documentType]} uploaded and validated.`)
    } catch (requestError) {
      setError(errorMessage(requestError))
      await refresh()
    } finally {
      setWorking('')
    }
  }

  async function removeDocument(document: VerificationDocumentMetadata) {
    if (!submission) return
    await run('remove', () => backend.verification.removeEvidence(submission.id, document.id, {
      command_id: commandId(),
      expected_version: submission.version,
    }), 'Evidence removed.')
  }

  async function viewDocument(document: VerificationDocumentMetadata) {
    if (!submission || working) return
    setWorking('view')
    setError('')
    try {
      const view = await backend.verification.getEvidenceView(submission.id, document.id)
      window.open(view.url, '_blank', 'noopener,noreferrer')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setWorking('')
    }
  }

  async function startPhoneVerification() {
    if (!phone.trim()) {
      setError('Enter the phone number you want us to verify.')
      return
    }
    setWorking('phone')
    setError('')
    try {
      await backend.verification.startProfessionalPhoneVerification({ command_id: commandId(), phone: phone.trim() })
      setNotice('A phone verification code was sent.')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setWorking('')
    }
  }

  async function handleSignOut() {
    if (working) return
    setWorking('signout')
    setError('')
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(errorMessage(requestError))
      setWorking('')
    }
  }

  const status = submission?.status ?? workspace?.verification_status ?? 'unverified'
  const underReview = submission?.status === 'pending'
  const editableStatus = submission?.status === 'draft' || submission?.status === 'needs_information' || !submission

  return (
    <section className="verification" aria-labelledby="verification-title">
      <div className="verification-head">
        <div className={`verification-stamp is-${status}`} aria-hidden="true">
          <DoodleIcon name={underReview ? 'clock' : 'user'} size={60} />
        </div>
        <div className="verification-head-copy">
          <span className="eyebrow">PROFESSIONAL VERIFICATION</span>
          <h1 id="verification-title">{underReview ? 'Your application is under review.' : 'Verify your professional account.'}</h1>
          <p>
            Your {requestedRole === 'barber' ? 'barber' : 'shop owner'} tools are fully locked until a trusted reviewer approves your evidence.
            You can only manage this application or sign out from this screen.
          </p>
        </div>
      </div>

      <div className="verification-status" role="status">
        <span className={`verification-badge is-${status}`}><span className="verification-badge-dot" />{String(status).replaceAll('_', ' ')}</span>
        <span className="verification-status-meta">Signed in as <strong>{applicantProfile.full_name}</strong> · {requestedRole === 'barber' ? 'Barber' : 'Shop owner'} request</span>
      </div>

      {loading && <article className="verification-panel"><p>Loading your secure verification workspace…</p></article>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {!loading && !workspace && (
        <article className="verification-panel">
          <h2>Verification workspace unavailable</h2>
          <p>Your professional tools remain locked. You can retry this secure request or sign out; no other account area is available.</p>
          <div className="verification-action-row">
            <button type="button" className="btn" disabled={Boolean(working)} onClick={() => void refresh()}>Retry</button>
            <button type="button" className="btn btn-danger" disabled={Boolean(working)} onClick={() => void handleSignOut()}>Sign out</button>
          </div>
        </article>
      )}

      {!loading && workspace && (
        <div className="verification-body">
          <div className="verification-main">
            {editableStatus ? (
              <article className="verification-panel">
                <div className="verification-panel-head"><h2>1. Your details</h2><span className="pill">Draft first</span></div>
                {submission?.status === 'needs_information' && submission.applicant_message && (
                  <p className="verification-callout">Reviewer request: {submission.applicant_message}</p>
                )}
                <div className="verification-form-grid">
                  <label className="verification-field is-wide">Legal name<input value={form.legalName} disabled={!canEdit} onChange={(event) => setField('legalName', event.target.value)} /></label>
                  <label className="verification-field">Date of birth<input type="date" value={form.dateOfBirth} disabled={!canEdit} onChange={(event) => setField('dateOfBirth', event.target.value)} /></label>
                  {requestedRole === 'barber' ? (
                    <>
                      <label className="verification-field">Years of experience<input type="number" min="0" max="80" value={form.yearsExperience} disabled={!canEdit} onChange={(event) => setField('yearsExperience', event.target.value)} /></label>
                      <label className="verification-field is-wide">Specialties <small>comma separated</small><input value={form.specialties} disabled={!canEdit} placeholder="Fades, beard styling" onChange={(event) => setField('specialties', event.target.value)} /></label>
                      <label className="verification-field is-wide">Professional summary<textarea rows={4} value={form.professionalSummary} disabled={!canEdit} onChange={(event) => setField('professionalSummary', event.target.value)} /></label>
                    </>
                  ) : (
                    <>
                      <label className="verification-field">Business legal name<input value={form.businessLegalName} disabled={!canEdit} onChange={(event) => setField('businessLegalName', event.target.value)} /></label>
                      <label className="verification-field">Business display name<input value={form.businessDisplayName} disabled={!canEdit} onChange={(event) => setField('businessDisplayName', event.target.value)} /></label>
                      <label className="verification-field">Contact email<input type="email" value={form.contactEmail} disabled={!canEdit} onChange={(event) => setField('contactEmail', event.target.value)} /></label>
                      <label className="verification-field">Contact phone<input value={form.contactPhone} disabled={!canEdit} placeholder="+63…" onChange={(event) => setField('contactPhone', event.target.value)} /></label>
                      <label className="verification-field">Your relationship to the shop<select value={form.controlBasis} disabled={!canEdit} onChange={(event) => setField('controlBasis', event.target.value as FormState['controlBasis'])}><option value="owned">Owned</option><option value="leased">Leased</option><option value="managed">Managed</option><option value="family_business">Family business</option><option value="other">Other</option></select></label>
                      <label className="verification-field">Intended shop name<input value={form.shopName} disabled={!canEdit} onChange={(event) => setField('shopName', event.target.value)} /></label>
                      <label className="verification-field is-wide">Shop address<input value={form.addressLine} disabled={!canEdit} onChange={(event) => setField('addressLine', event.target.value)} /></label>
                      <label className="verification-field is-wide">City / municipality<input value={form.city} disabled={!canEdit} onChange={(event) => setField('city', event.target.value)} /></label>
                    </>
                  )}
                </div>
                {canEdit && <button type="button" className="btn btn-primary" disabled={Boolean(working)} onClick={() => void saveDraft()}>{working === 'save' ? 'Saving…' : submission ? 'Save details' : 'Create verification draft'}</button>}
              </article>
            ) : (
              <article className="verification-panel">
                <h2>Application status</h2>
                <p>{underReview ? 'Your evidence was submitted successfully. A reviewer has not approved or rejected it yet.' : submission?.applicant_message ?? 'This application is no longer editable.'}</p>
                <ol className="verification-timeline">
                  {(workspace.timeline.length ? workspace.timeline : [{ id: 'created', event_type: 'Application created', created_at: submission?.created_at ?? '', from_status: null, to_status: submission?.status ?? null, public_reason_code: null, public_message: null, information_items: [] }]).map((event) => (
                    <li key={event.id}><DoodleIcon name="check" size={18} /><span>{event.public_message ?? event.event_type.replaceAll('_', ' ')}{event.created_at && <small>{new Date(event.created_at).toLocaleString('en-PH')}</small>}</span></li>
                  ))}
                </ol>
              </article>
            )}

            {submission && (
              <article className="verification-panel">
                <div className="verification-panel-head"><h2>2. Identity evidence</h2><span className="pill">JPEG, PNG, or PDF · 10 MB max</span></div>
                <p className="verification-muted">Files are private, short-lived views are audited, and approval requires a clean security scan. Local development currently reports scans honestly as unavailable.</p>
                <div className="verification-documents">
                  {ROLE_DOCUMENTS[requestedRole].map((documentType) => {
                    const document = currentDocuments.find((candidate) => candidate.document_type === documentType)
                    const required = workspace.evidence_requirements?.all_of.includes(documentType)
                      || workspace.evidence_requirements?.one_of.some((group) => group.includes(documentType))
                    return (
                      <div className="verification-document" key={documentType}>
                        <div><strong>{DOCUMENT_LABELS[documentType]} {required && <span aria-label="required">*</span>}</strong><small>{document ? documentState(document) : 'Not uploaded'}</small></div>
                        <div className="verification-document-actions">
                          {document && allowed.has('view_evidence') && <button type="button" className="btn btn-sm" disabled={Boolean(working)} onClick={() => void viewDocument(document)}>View</button>}
                          {document && allowed.has('remove_evidence') && <button type="button" className="btn btn-sm btn-pink" disabled={Boolean(working)} onClick={() => void removeDocument(document)}>Remove</button>}
                          {allowed.has('request_evidence_upload') && <label className="btn btn-sm btn-primary verification-file-button">{working === `upload-${documentType}` ? 'Uploading…' : document ? 'Replace' : 'Upload'}<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={Boolean(working)} onChange={(event) => void uploadDocument(documentType, event)} /></label>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>
            )}
          </div>

          <aside className="verification-aside">
            <article className="verification-panel">
              <h2>3. Confirm your phone</h2>
              {workspace.professional_phone_verified ? <p className="verification-ok"><DoodleIcon name="check" size={18} /> Phone verified</p> : (
                <>
                  <p>A verified professional phone is required before approval.</p>
                  <label className="verification-field">Mobile number<input value={phone} placeholder="+639…" onChange={(event) => setPhone(event.target.value)} /></label>
                  {allowed.has('start_phone_verification') && <button type="button" className="btn" disabled={Boolean(working)} onClick={() => void startPhoneVerification()}>Send verification code</button>}
                  <p className="verification-muted">If SMS is not configured, the server will say it is unavailable. It will never pretend your phone is verified.</p>
                </>
              )}
            </article>

            <article className="verification-panel verification-submit-panel">
              <h2>4. Submit for review</h2>
              <p>Save complete details, upload the required evidence, and verify your phone before submitting.</p>
              {submission && allowed.has('submit') && <button type="button" className="btn btn-primary" disabled={Boolean(working)} onClick={() => void run('submit', () => backend.verification.submit(submission.id, { command_id: commandId(), expected_version: submission.version }), 'Application submitted for review.')}>{working === 'submit' ? 'Submitting…' : 'Submit application'}</button>}
              {submission && allowed.has('withdraw') && <button type="button" className="btn btn-pink" disabled={Boolean(working)} onClick={() => void run('withdraw', () => backend.verification.withdraw(submission.id, { command_id: commandId(), expected_version: submission.version }), 'Application withdrawn.')}>Withdraw application</button>}
              {!allowed.has('submit') && underReview && <p className="verification-ok"><DoodleIcon name="clock" size={18} /> Waiting for reviewer decision</p>}
            </article>

            <article className="verification-panel">
              <h2>Account lock</h2>
              <p>Dashboard, messages, bookings, shop setup, staff, and settings remain unavailable until approval.</p>
              <button type="button" className="btn" disabled={loading || Boolean(working)} onClick={() => void refresh()}>Refresh status</button>
              <button type="button" className="btn btn-danger" disabled={Boolean(working)} onClick={() => void handleSignOut()}>{working === 'signout' ? 'Signing out…' : 'Sign out'}</button>
            </article>
          </aside>
        </div>
      )}
    </section>
  )
}
