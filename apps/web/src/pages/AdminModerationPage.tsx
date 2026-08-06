import { useCallback, useEffect, useState } from 'react'
import {
  type ModerateRatingReportInput,
  type RatingReport,
  type RatingReportCategory,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { DoodleIcon } from '../theme/DoodleDefs'
import { adminErrorMessage } from './AdminDisputesPage'
import './AdminConsole.css'

type ReportStatus = 'open' | 'upheld' | 'rejected'

const QUEUE_TABS: Array<{ value: ReportStatus; label: string }> = [
  { value: 'open', label: 'Open reports' },
  { value: 'upheld', label: 'Upheld' },
  { value: 'rejected', label: 'Rejected' },
]

const CATEGORY_LABEL: Record<RatingReportCategory, string> = {
  abusive: 'Abusive language',
  spam: 'Spam',
  private_information: 'Private information',
  off_topic: 'Off topic',
  not_a_customer: 'Not a real customer',
  other: 'Other',
}

const DECISIONS: Array<{ value: ModerateRatingReportInput['decision']; label: string; note: string }> = [
  { value: 'hide_text', label: 'Hide the text', note: 'The written text stops being public. The score is untouched and still counts toward the average.' },
  { value: 'restore_text', label: 'Restore the text', note: 'Reverses an earlier hide. The score was never affected either way.' },
  { value: 'reject', label: 'Reject the report', note: 'The text stays public and the report is closed with your reason.' },
]

function ReportCard({ report, onChanged }: { report: RatingReport; onChanged: () => void }) {
  const backend = useBackend()
  const [decision, setDecision] = useState<ModerateRatingReportInput['decision']>('hide_text')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  return (
    <article className="admin-section">
      <div className="admin-case-header">
        <div>
          <h3>{CATEGORY_LABEL[report.reason_category]}</h3>
          <p className="admin-section-note">
            Reported by a {report.reporter_role.replaceAll('_', ' ')} against{' '}
            {report.target === 'review' ? 'review text' : 'a shop response'} on{' '}
            {new Date(report.created_at).toLocaleDateString('en-PH')}.
          </p>
        </div>
        <span className={`admin-pill is-${report.status}`}>
          {report.status === 'open' ? 'Open' : report.status === 'upheld' ? 'Upheld' : 'Rejected'}
        </span>
      </div>

      <p className="admin-case-reason">{report.reason}</p>

      {/* The rule the whole moderation model rests on, said in the UI as well as
          enforced in the database: text visibility and score are independent. */}
      <p className="admin-audit-note">
        Moderating text never changes a score. A hidden review still counts toward the shop and
        provider averages, and the decision history stays immutable.
      </p>

      {report.status === 'open'
        ? (
          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault()
              setBusy(true)
              setError('')
              setNotice('')
              backend.ratingModeration
                .decide(report.id, { expected_version: report.version, decision, reason })
                .then(() => {
                  setNotice('Decision recorded.')
                  onChanged()
                })
                .catch((caught: unknown) => setError(adminErrorMessage(caught, 'The decision could not be recorded.')))
                .finally(() => setBusy(false))
            }}
          >
            <fieldset>
              <legend>Decision</legend>
              {DECISIONS.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name={`moderation-${report.id}`}
                    checked={decision === option.value}
                    onChange={() => setDecision(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            <p className="admin-audit-note">{DECISIONS.find((option) => option.value === decision)?.note}</p>
            <label>
              <span>Reason (recorded in the immutable history)</span>
              <textarea value={reason} rows={2} required minLength={3} maxLength={2000} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              {busy ? 'Recording...' : 'Record decision'}
            </button>
          </form>
        )
        : (
          <p className="admin-case-reason">
            <strong>{report.status === 'upheld' ? 'Upheld' : 'Rejected'}</strong>
            {report.resolution_reason ? `. ${report.resolution_reason}` : '.'}
            {report.resolved_at && ` (${new Date(report.resolved_at).toLocaleString('en-PH')})`}
          </p>
        )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </article>
  )
}

export function AdminModerationPage() {
  const backend = useBackend()
  const [status, setStatus] = useState<ReportStatus>('open')
  const [reports, setReports] = useState<RatingReport[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setReports(await backend.ratingModeration.listReports(status))
    } catch (caught) {
      setError(adminErrorMessage(caught, 'The moderation queue could not be loaded.'))
      setReports([])
    }
  }, [backend, status])

  useEffect(() => { void load() }, [load])

  return (
    <section className="admin-console" aria-labelledby="admin-moderation-title">
      <header className="admin-console-head">
        <div>
          <span className="eyebrow">TRUST &amp; SAFETY</span>
          <h1 id="admin-moderation-title">Rating moderation</h1>
          <p>
            Reports against review text and against shop responses, across every shop. You can hide
            text, restore it, or reject the report. None of those touch a score.
          </p>
        </div>
        <DoodleIcon name="star" size={48} />
      </header>

      <div className="admin-filters" role="group" aria-label="Report queue filter">
        {QUEUE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`btn btn-sm ${status === tab.value ? 'btn-primary' : ''}`}
            aria-pressed={status === tab.value}
            onClick={() => { setReports(null); setStatus(tab.value) }}
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

      {reports === null && <p className="admin-empty" role="status">Binubuklat ang mga report…</p>}

      {reports !== null && reports.length === 0 && (
        <p className="admin-empty" role="status">
          <DoodleIcon name="check" size={20} />
          <span>Walang report sa queue na ito ngayon.</span>
        </p>
      )}

      {reports !== null && reports.length > 0 && (
        <>
          <h2>{QUEUE_TABS.find((tab) => tab.value === status)?.label} ({reports.length})</h2>
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} onChanged={() => void load()} />
          ))}
        </>
      )}
    </section>
  )
}
