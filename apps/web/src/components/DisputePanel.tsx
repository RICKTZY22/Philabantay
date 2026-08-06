import { useCallback, useEffect, useState } from 'react'
import { DataError, type SupportCase, type SupportCaseDetail } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useCurrentTime } from '../hooks/useCurrentTime'
import './DisputePanel.css'

const STATUS_LABEL: Record<SupportCase['status'], string> = {
  owner_review: 'The shop is reviewing your dispute',
  owner_decided: 'The shop decided — your turn',
  escalated: 'Escalated to platform review',
  information_requested: 'The reviewer asked the shop for more information',
  resolved: 'Resolved',
  withdrawn: 'Withdrawn',
}

function hoursUntil(when: string | null, nowEpochMs: number): number | null {
  if (!when) return null
  const remaining = Date.parse(when) - nowEpochMs
  if (Number.isNaN(remaining)) return null
  return Math.max(0, Math.round(remaining / 3_600_000))
}

/**
 * The customer half of a dispute: open one with a real reason and optional safe
 * evidence, then accept or escalate the shop's decision inside the stated window.
 * The old control posted a hardcoded sentence on the customer's behalf, which is
 * not a reason anybody wrote.
 */
export function DisputePanel({ appointmentId, appointmentVersion, canOpen, onChanged }: {
  appointmentId: string
  appointmentVersion: number
  canOpen: boolean
  onChanged: () => void
}) {
  const backend = useBackend()
  const nowEpochMs = useCurrentTime()
  const [existing, setExisting] = useState<SupportCaseDetail | null>(null)
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [escalationReason, setEscalationReason] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const mine = await backend.supportCases.listMine()
      const match = mine.find((entry) => entry.appointment_id === appointmentId)
      // Opening the detail is an audited access, so it is only fetched when there
      // is actually a case to show.
      setExisting(match ? await backend.supportCases.get(match.id) : null)
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-load ang dispute.')
    }
  }, [backend, appointmentId])

  useEffect(() => {
    void load()
  }, [load])

  async function run(key: string, operation: () => Promise<unknown>, success: string) {
    setBusy(key)
    setError('')
    setMessage('')
    try {
      await operation()
      setMessage(success)
      await load()
      onChanged()
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi matuloy. Subukan ulit.')
    } finally {
      setBusy('')
    }
  }

  if (!existing && !canOpen) return null

  if (!existing) {
    return (
      <section className="dispute-panel">
        <div className="dispute-head">
          <span className="eyebrow">SOMETHING WRONG?</span>
          <h3>Dispute the recorded result</h3>
          <p>
            Sabihin kung ano talaga ang nangyari. Titingnan ito ng shop mo, at kung hindi ka pa rin
            sang-ayon sa desisyon nila, pwede mo pang iakyat sa platform review.
          </p>
        </div>
        <form
          className="dispute-form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(
              'open',
              () => backend.supportCases.openAppointmentDispute(appointmentId, {
                expected_version: appointmentVersion,
                reason,
                evidence_note: evidence.trim() === '' ? undefined : evidence.trim(),
              }),
              'Dispute opened. The shop has been notified.',
            )
          }}
        >
          <label>
            <span>What happened</span>
            <textarea value={reason} rows={3} required minLength={3} maxLength={2000} onChange={(event) => setReason(event.target.value)} />
          </label>
          <label>
            <span>Anything that helps (optional)</span>
            <textarea value={evidence} rows={2} maxLength={4000} onChange={(event) => setEvidence(event.target.value)} />
            <small>Text only. Keep out payment details and anybody else&rsquo;s private information.</small>
          </label>
          <button type="submit" className="btn btn-danger" disabled={busy === 'open'}>
            {busy === 'open' ? 'Opening...' : 'Open dispute'}
          </button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    )
  }

  const supportCase = existing.case
  const ownerHours = hoursUntil(supportCase.owner_response_due_at, nowEpochMs)
  const escalationHours = hoursUntil(supportCase.escalation_deadline_at, nowEpochMs)

  return (
    <section className="dispute-panel">
      <div className="dispute-head">
        <span className="eyebrow">DISPUTE {supportCase.reference}</span>
        <h3>{STATUS_LABEL[supportCase.status]}</h3>
        <p className="dispute-reason">{supportCase.reason}</p>
      </div>

      {supportCase.status === 'owner_review' && (
        <p className="dispute-note" role="status">
          {/* Q13 target, said as a target. */}
          {ownerHours === null
            ? 'The shop will review this.'
            : `The shop aims to respond within ${ownerHours} more hour${ownerHours === 1 ? '' : 's'}. This is a target, not a guarantee.`}
        </p>
      )}

      {supportCase.owner_decision && (
        <div className="dispute-decision">
          <span className="dispute-decision-label">Shop decision</span>
          <p>
            Recorded as <strong>{supportCase.owner_decision}</strong>. {supportCase.owner_decision_reason}
          </p>
        </div>
      )}

      {supportCase.status === 'owner_decided' && (
        <>
          <p className="dispute-note" role="status">
            {escalationHours === null
              ? 'You can accept this or escalate it.'
              : escalationHours === 0
                ? 'The window to respond has closed. The decision stands.'
                : `You have ${escalationHours} more hour${escalationHours === 1 ? '' : 's'} to accept this or escalate it.`}
          </p>
          <div className="dispute-actions">
            <button
              type="button"
              className="btn"
              disabled={busy !== ''}
              onClick={() => void run(
                'accept',
                () => backend.supportCases.respond(supportCase.id, {
                  expected_version: supportCase.version,
                  response: 'accept',
                }),
                'Accepted. The case is closed.',
              )}
            >
              {busy === 'accept' ? 'Accepting...' : 'Accept the decision'}
            </button>
          </div>
          <form
            className="dispute-form"
            onSubmit={(event) => {
              event.preventDefault()
              void run(
                'escalate',
                () => backend.supportCases.respond(supportCase.id, {
                  expected_version: supportCase.version,
                  response: 'escalate',
                  reason: escalationReason,
                }),
                'Escalated for platform review.',
              )
            }}
          >
            <label>
              <span>Or escalate, and say why the decision is wrong</span>
              <textarea value={escalationReason} rows={2} required minLength={3} maxLength={2000} onChange={(event) => setEscalationReason(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-danger" disabled={busy === 'escalate'}>
              {busy === 'escalate' ? 'Escalating...' : 'Escalate for review'}
            </button>
          </form>
        </>
      )}

      {supportCase.status === 'escalated' && (
        <p className="dispute-note" role="status">
          A platform reviewer will look at this. Target is five business days, and it is a target.
        </p>
      )}

      {supportCase.resolution && (
        <p className="dispute-resolved" role="status">
          Final: {supportCase.resolution.replaceAll('_', ' ')}. {supportCase.resolution_reason}
        </p>
      )}

      <details className="dispute-timeline">
        <summary>Case history ({existing.events.length})</summary>
        <ol>
          {existing.events.map((event) => (
            <li key={event.id}>
              <strong>{event.event_type.replaceAll('_', ' ')}</strong>
              {event.reason && <span>{event.reason}</span>}
              <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('en-PH')}</time>
            </li>
          ))}
        </ol>
      </details>

      {existing.evidence.length > 0 && (
        <details className="dispute-timeline">
          <summary>Notes on this case ({existing.evidence.length})</summary>
          <ol>
            {existing.evidence.map((note) => (
              <li key={note.id}>
                <strong>{note.author_role.replaceAll('_', ' ')}</strong>
                <span>{note.note}</span>
                <time dateTime={note.created_at}>{new Date(note.created_at).toLocaleString('en-PH')}</time>
              </li>
            ))}
          </ol>
        </details>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="dispute-resolved" role="status">{message}</p>}
    </section>
  )
}
