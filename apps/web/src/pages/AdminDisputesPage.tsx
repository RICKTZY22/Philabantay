import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DataError,
  type ResolveSupportCaseInput,
  type SupportCase,
  type SupportCaseDetail,
  type SupportCaseStatus,
} from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import { useBackend } from '../services/backend'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { DoodleIcon } from '../theme/DoodleDefs'
import './AdminConsole.css'

type QueueStatus = 'escalated' | 'information_requested' | 'resolved'

const QUEUE_TABS: Array<{ value: QueueStatus; label: string }> = [
  { value: 'escalated', label: 'Escalated' },
  { value: 'information_requested', label: 'Waiting on the shop' },
  { value: 'resolved', label: 'Resolved' },
]

const STATUS_LABEL: Record<SupportCaseStatus, string> = {
  owner_review: 'With the shop',
  owner_decided: 'With the customer',
  escalated: 'Escalated to platform review',
  information_requested: 'Information requested from the shop',
  resolved: 'Resolved',
  withdrawn: 'Withdrawn',
}

const RESOLUTIONS: Array<{ value: ResolveSupportCaseInput['resolution']; label: string; note: string }> = [
  { value: 'upheld_owner', label: 'Uphold the shop decision', note: 'The recorded visit result stands.' },
  { value: 'overturned_owner', label: 'Overturn the shop decision', note: 'Applies an audited visit correction, so derived metrics recompute.' },
  { value: 'no_action', label: 'No action', note: 'Closes the case without changing the visit.' },
]

/**
 * Admin errors are worth translating, because the two that matter here are
 * capability and MFA problems that a stack trace would hide behind "forbidden".
 */
export function adminErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DataError) {
    if (error.code === 'mfa_required') return 'This console needs an AAL2 session. Complete MFA in Settings, then reload.'
    if (error.code === 'capability_required' || error.code === 'forbidden') {
      return 'Your admin account does not hold the capability this queue requires.'
    }
    return error.message
  }
  return fallback
}

function hoursUntil(when: string | null, nowEpochMs: number): number | null {
  if (!when) return null
  const remaining = Date.parse(when) - nowEpochMs
  if (Number.isNaN(remaining)) return null
  return Math.round(remaining / 3_600_000)
}

export function AdminDisputesPage() {
  const backend = useBackend()
  const nowEpochMs = useCurrentTime()
  const [status, setStatus] = useState<QueueStatus>('escalated')
  const [cases, setCases] = useState<SupportCase[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setCases(await backend.supportCaseAdmin.listQueue(status))
    } catch (caught) {
      setError(adminErrorMessage(caught, 'The dispute queue could not be loaded.'))
      setCases([])
    }
  }, [backend, status])

  useEffect(() => { void load() }, [load])

  return (
    <section className="admin-console" aria-labelledby="admin-disputes-title">
      <header className="admin-console-head">
        <div>
          <span className="eyebrow">TRUST &amp; SAFETY</span>
          <h1 id="admin-disputes-title">Dispute review</h1>
          <p>
            Escalated cases only. A case still with the shop or with the customer never appears here.
            Opening a case body is recorded as an access event, and every decision is audited.
          </p>
        </div>
        <DoodleIcon name="search" size={48} />
      </header>

      {/* A queue filter, not a tab widget: these are three separate reads. */}
      <div className="admin-filters" role="group" aria-label="Dispute queue filter">
        {QUEUE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`btn btn-sm ${status === tab.value ? 'btn-primary' : ''}`}
            aria-pressed={status === tab.value}
            onClick={() => { setCases(null); setStatus(tab.value) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error} <button type="button" className="btn btn-sm" onClick={() => void load()}>Retry</button>
        </p>
      )}

      {cases === null && <p className="admin-empty" role="status">Binubuklat ang queue…</p>}

      {cases !== null && cases.length === 0 && (
        <p className="admin-empty" role="status">
          <DoodleIcon name="check" size={20} />
          <span>Walang case sa queue na ito ngayon.</span>
        </p>
      )}

      {cases !== null && cases.length > 0 && (
        <section className="admin-section" aria-labelledby="admin-dispute-queue">
          <h2 id="admin-dispute-queue">{QUEUE_TABS.find((tab) => tab.value === status)?.label} ({cases.length})</h2>
          <div className="admin-scroll">
            <table>
              <caption>Escalated appointment disputes awaiting platform review</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Status</th>
                  <th scope="col">Escalated</th>
                  <th scope="col">Target</th>
                  <th scope="col">Assignment</th>
                  <th scope="col"><span className="sr-only">Open case</span></th>
                </tr>
              </thead>
              <tbody>
                {cases.map((entry) => {
                  const target = hoursUntil(entry.admin_target_at, nowEpochMs)
                  return (
                    <tr key={entry.id}>
                      <th scope="row">{entry.reference}</th>
                      <td>
                        {entry.subject}
                        <small>{entry.reason.slice(0, 90)}{entry.reason.length > 90 ? '…' : ''}</small>
                      </td>
                      <td><span className={`admin-pill is-${entry.status}`}>{STATUS_LABEL[entry.status]}</span></td>
                      <td>{entry.escalated_at ? new Date(entry.escalated_at).toLocaleDateString('en-PH') : 'Not escalated'}</td>
                      {/* A target, said as a target. Q13 windows are effort, not SLAs. */}
                      <td>{target === null ? 'No target set' : target > 0 ? `${target} h left` : `${Math.abs(target)} h over`}</td>
                      <td>{entry.assigned_admin_id ? 'Assigned' : 'Unassigned'}</td>
                      <td><Link className="btn btn-sm" to={`/admin/disputes/${entry.id}`}>Open {entry.reference}</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  )
}

export function AdminDisputeDetailPage() {
  const backend = useBackend()
  const { profile } = useAuth()
  const { caseId = '' } = useParams()
  const nowEpochMs = useCurrentTime()
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [infoReason, setInfoReason] = useState('')
  const [resolution, setResolution] = useState<ResolveSupportCaseInput['resolution']>('upheld_owner')
  const [resolutionReason, setResolutionReason] = useState('')
  const [correctedStatus, setCorrectedStatus] = useState<'completed' | 'cancelled'>('completed')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Reading a case body is itself an audited access, so this is fetched once
      // per view rather than polled.
      setDetail(await backend.supportCases.get(caseId))
    } catch (caught) {
      setError(adminErrorMessage(caught, 'This case could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [backend, caseId])

  useEffect(() => { void load() }, [load])

  async function run(key: string, operation: () => Promise<unknown>, success: string) {
    if (busy) return
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await operation()
      setNotice(success)
      await load()
    } catch (caught) {
      setError(adminErrorMessage(caught, 'That action could not be completed.'))
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <section className="admin-console">
        <p className="admin-empty" role="status">Binubuklat ang case…</p>
      </section>
    )
  }

  if (!detail) {
    return (
      <section className="admin-console">
        <Link className="btn btn-sm admin-back" to="/admin/disputes">Back to the dispute queue</Link>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    )
  }

  const supportCase = detail.case
  const target = hoursUntil(supportCase.admin_target_at, nowEpochMs)
  const isOpen = supportCase.status === 'escalated' || supportCase.status === 'information_requested'
  const mine = supportCase.assigned_admin_id === profile?.id

  return (
    <section className="admin-console admin-case" aria-labelledby="admin-dispute-title">
      <Link className="btn btn-sm admin-back" to="/admin/disputes">Back to the dispute queue</Link>

      <header className="admin-case-header">
        <div>
          <span className="eyebrow">DISPUTE {supportCase.reference}</span>
          <h1 id="admin-dispute-title">{supportCase.subject}</h1>
          <p>
            {STATUS_LABEL[supportCase.status]}
            {target !== null && ` · ${target > 0 ? `${target} h left against the review target` : `${Math.abs(target)} h past the review target`}`}
          </p>
        </div>
        <span className={`admin-pill is-${supportCase.status}`}>{STATUS_LABEL[supportCase.status]}</span>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <section className="admin-section" aria-labelledby="admin-dispute-facts">
        <h2 id="admin-dispute-facts">What the customer said</h2>
        <p className="admin-case-reason">{supportCase.reason}</p>
        {supportCase.escalation_reason && (
          <>
            <h3>Why they escalated</h3>
            <p className="admin-case-reason">{supportCase.escalation_reason}</p>
          </>
        )}
        <h3>What the shop decided</h3>
        {supportCase.owner_decision
          ? (
            <p className="admin-case-reason">
              Recorded <strong>{supportCase.owner_decision}</strong>. {supportCase.owner_decision_reason}
            </p>
          )
          : <p className="admin-empty" role="status">The shop did not record a decision before this escalated.</p>}
        <dl className="admin-grid">
          <div className="admin-metric">
            <dt>Participants</dt>
            <dd>{detail.participants.length}</dd>
            <p className="admin-metric-hint">
              {detail.participants.map((person) => person.full_name ?? person.participant_role).join(', ')}
            </p>
          </div>
          <div className="admin-metric">
            <dt>Case version</dt>
            <dd>{supportCase.version}</dd>
            <p className="admin-metric-hint">Every action below sends this version and fails if it moved.</p>
          </div>
          <div className="admin-metric">
            <dt>Assignment</dt>
            <dd>{supportCase.assigned_admin_id ? (mine ? 'You' : 'Another reviewer') : 'Unassigned'}</dd>
          </div>
        </dl>
      </section>

      {detail.evidence.length > 0 && (
        <section className="admin-section" aria-labelledby="admin-dispute-evidence">
          <h2 id="admin-dispute-evidence">Notes on this case ({detail.evidence.length})</h2>
          <p className="admin-section-note">
            Reviewer-only notes are visible here and are filtered out of every participant view.
          </p>
          <div className="admin-scroll">
            <table>
              <caption>Case notes, newest last</caption>
              <thead>
                <tr>
                  <th scope="col">Author</th>
                  <th scope="col">Visibility</th>
                  <th scope="col">Note</th>
                  <th scope="col">Added</th>
                </tr>
              </thead>
              <tbody>
                {detail.evidence.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">{item.author_role.replaceAll('_', ' ')}</th>
                    <td>{item.visibility === 'admin_only' ? 'Reviewers only' : 'All participants'}</td>
                    <td>{item.note}</td>
                    <td>{new Date(item.created_at).toLocaleString('en-PH')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isOpen && (
        <section className="admin-section" aria-labelledby="admin-dispute-actions">
          <h2 id="admin-dispute-actions">Review actions</h2>

          {!supportCase.assigned_admin_id && (
            <div className="admin-actions">
              <button
                type="button"
                className="btn"
                disabled={Boolean(busy)}
                onClick={() => void run(
                  'assign',
                  () => backend.supportCaseAdmin.assign(supportCase.id, { expected_version: supportCase.version }),
                  'Case assigned to you.',
                )}
              >
                {busy === 'assign' ? 'Assigning...' : 'Assign to me'}
              </button>
            </div>
          )}

          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault()
              void run(
                'note',
                () => backend.supportCases.addEvidence(supportCase.id, { note, visibility: 'admin_only' }),
                'Reviewer note added.',
              )
              setNote('')
            }}
          >
            <label>
              <span>Reviewer-only note</span>
              <textarea value={note} rows={2} required minLength={3} maxLength={4000} onChange={(event) => setNote(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-sm" disabled={Boolean(busy)}>
              {busy === 'note' ? 'Saving...' : 'Add note'}
            </button>
          </form>

          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault()
              void run(
                'information',
                () => backend.supportCaseAdmin.requestInformation(supportCase.id, {
                  expected_version: supportCase.version,
                  reason: infoReason,
                }),
                'Information requested from the shop.',
              )
            }}
          >
            <label>
              <span>Ask the shop for more information</span>
              <textarea value={infoReason} rows={2} required minLength={3} maxLength={2000} onChange={(event) => setInfoReason(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-sm" disabled={Boolean(busy)}>
              {busy === 'information' ? 'Sending...' : 'Request information'}
            </button>
          </form>

          {/* Resolution is separated from the ordinary actions above on purpose:
              it closes the case and can rewrite a visit. */}
          <div className="admin-danger-zone">
            <h3>Resolve this case</h3>
            <p className="admin-audit-note">
              A resolution is final and appends an immutable decision event. Overturning the shop also
              applies an audited visit correction, so ratings and analytics recompute from the corrected fact.
            </p>
            <form
              className="admin-form"
              onSubmit={(event) => {
                event.preventDefault()
                void run(
                  'resolve',
                  () => backend.supportCaseAdmin.resolve(supportCase.id, {
                    expected_version: supportCase.version,
                    resolution,
                    reason: resolutionReason,
                    ...(resolution === 'overturned_owner' ? { corrected_status: correctedStatus } : {}),
                  }),
                  'Case resolved.',
                )
              }}
            >
              <fieldset>
                <legend>Decision</legend>
                {RESOLUTIONS.map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="dispute-resolution"
                      checked={resolution === option.value}
                      onChange={() => setResolution(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
              <p className="admin-audit-note">{RESOLUTIONS.find((option) => option.value === resolution)?.note}</p>

              {resolution === 'overturned_owner' && (
                <label>
                  <span>Corrected final visit status</span>
                  <select value={correctedStatus} onChange={(event) => setCorrectedStatus(event.target.value as 'completed' | 'cancelled')}>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
              )}

              <label>
                <span>Reason (both sides see this)</span>
                <textarea value={resolutionReason} rows={3} required minLength={3} maxLength={2000} onChange={(event) => setResolutionReason(event.target.value)} />
              </label>
              <button type="submit" className="btn btn-danger" disabled={Boolean(busy)}>
                {busy === 'resolve' ? 'Resolving...' : 'Resolve case'}
              </button>
            </form>
          </div>
        </section>
      )}

      {supportCase.resolution && (
        <section className="admin-section" aria-labelledby="admin-dispute-outcome">
          <h2 id="admin-dispute-outcome">Outcome</h2>
          <p className="admin-case-reason">
            <strong>{supportCase.resolution.replaceAll('_', ' ')}</strong>. {supportCase.resolution_reason}
          </p>
        </section>
      )}

      <details className="admin-timeline">
        <summary>Case history ({detail.events.length}), including every read</summary>
        <ol>
          {detail.events.map((event) => (
            <li key={event.id}>
              <strong>{event.event_type.replaceAll('_', ' ')}</strong>
              <span>{event.reason ?? `Recorded for ${event.actor_role}.`}</span>
              <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('en-PH')}</time>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}
