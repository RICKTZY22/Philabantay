import { useCallback, useEffect, useState } from 'react'
import {
  DataError,
  type RatingReport,
  type RatingResponse,
  type Review,
  type SupportCase,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { DoodleIcon } from '../theme/DoodleDefs'
import './OwnerTrustPanel.css'

type ShopReview = Review & { responses: RatingResponse[]; reports: RatingReport[] }

const REPORT_CATEGORIES = [
  { value: 'abusive', label: 'Abusive language' },
  { value: 'spam', label: 'Spam' },
  { value: 'private_information', label: 'Private information' },
  { value: 'off_topic', label: 'Off topic' },
  { value: 'not_a_customer', label: 'Not a real customer' },
  { value: 'other', label: 'Other' },
] as const

const CASE_STATUS_LABEL: Record<SupportCase['status'], string> = {
  owner_review: 'Waiting on your decision',
  owner_decided: 'Customer deciding whether to escalate',
  escalated: 'Escalated to platform review',
  information_requested: 'Platform asked for more information',
  resolved: 'Resolved',
  withdrawn: 'Withdrawn',
}

/** Hours left against a stated target. Q13 targets are promises of effort, not SLAs. */
function hoursUntil(when: string | null, nowEpochMs: number): number | null {
  if (!when) return null
  const remaining = Date.parse(when) - nowEpochMs
  if (Number.isNaN(remaining)) return null
  return Math.round(remaining / 3_600_000)
}

function stars(score: number): string {
  // Text, not colour or shape alone. A screen reader gets the number too.
  return `${score}/5`
}

function ReviewCard({ review, onChanged }: { review: ShopReview; onChanged: () => void }) {
  const backend = useBackend()
  const [body, setBody] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [reportCategory, setReportCategory] = useState<typeof REPORT_CATEGORIES[number]['value']>('abusive')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const ownerResponse = review.responses.find((response) => response.author_role === 'shop_owner')
  const openReport = review.reports.find((report) => report.status === 'open')

  async function run(key: string, operation: () => Promise<unknown>, success: string) {
    setBusy(key)
    setError('')
    setMessage('')
    try {
      await operation()
      setMessage(success)
      onChanged()
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi matuloy. Subukan ulit.')
    } finally {
      setBusy('')
    }
  }

  return (
    <article className="trust-review">
      <header>
        <div>
          <strong>Shop {stars(review.shop_rating)}</strong>
          <span className="trust-review-sub">Barber {stars(review.barber_rating)}</span>
        </div>
        <time dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString('en-PH')}</time>
      </header>

      {review.text_state === 'hidden' ? (
        <p className="trust-moderation-label" role="status">
          <DoodleIcon name="x" size={18} />
          <span>Text hidden by moderation. The score still counts toward your average.</span>
        </p>
      ) : (
        <p className="trust-review-body">{review.comment ?? <em>No written comment.</em>}</p>
      )}

      {ownerResponse ? (
        <div className="trust-response">
          <span className="trust-response-label">Your response</span>
          <p>{ownerResponse.text_state === 'hidden' ? 'Hidden pending moderation.' : ownerResponse.body}</p>
        </div>
      ) : (
        <form
          className="trust-form"
          onSubmit={(event) => {
            event.preventDefault()
            void run('respond', () => backend.reviews.respond(review.id, { body }), 'Response published.')
          }}
        >
          <label>
            <span>Your one public response</span>
            <textarea
              value={body}
              rows={2}
              maxLength={2000}
              required
              minLength={3}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy === 'respond'}>
            {busy === 'respond' ? 'Publishing...' : 'Publish response'}
          </button>
        </form>
      )}

      {openReport ? (
        <p className="trust-report-open" role="status">
          Reported as {openReport.reason_category.replaceAll('_', ' ')}. A moderator is reviewing it.
        </p>
      ) : review.text_state === 'visible' && review.comment ? (
        <details className="trust-report">
          <summary>Report this text</summary>
          <form
            className="trust-form"
            onSubmit={(event) => {
              event.preventDefault()
              void run(
                'report',
                () => backend.reviews.report(review.id, { reason_category: reportCategory, reason: reportReason }),
                'Report sent to moderation. The score is unaffected.',
              )
            }}
          >
            <label>
              <span>Why</span>
              <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value as typeof reportCategory)}>
                {REPORT_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>What is wrong with it</span>
              <textarea value={reportReason} rows={2} required minLength={3} maxLength={1000} onChange={(event) => setReportReason(event.target.value)} />
            </label>
            <p className="trust-hint">
              Reporting hides nothing by itself. A moderator decides, and a hidden comment keeps its score.
            </p>
            <button type="submit" className="btn btn-sm" disabled={busy === 'report'}>
              {busy === 'report' ? 'Sending...' : 'Send report'}
            </button>
          </form>
        </details>
      ) : null}

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="trust-message" role="status">{message}</p>}
    </article>
  )
}

function CaseCard({ supportCase, onChanged }: { supportCase: SupportCase; onChanged: () => void }) {
  const backend = useBackend()
  const nowEpochMs = useCurrentTime()
  const [decision, setDecision] = useState<'completed' | 'cancelled'>('completed')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ownerHoursLeft = hoursUntil(supportCase.owner_response_due_at, nowEpochMs)

  return (
    <article className="trust-case">
      <header>
        <div>
          <strong>{supportCase.reference}</strong>
          <span className="trust-review-sub">{CASE_STATUS_LABEL[supportCase.status]}</span>
        </div>
        <time dateTime={supportCase.created_at}>{new Date(supportCase.created_at).toLocaleDateString('en-PH')}</time>
      </header>
      <p className="trust-case-subject">{supportCase.subject}</p>
      <p className="trust-review-body">{supportCase.reason}</p>

      {supportCase.status === 'owner_review' && (
        <>
          <p className="trust-hint">
            {/* Q13: a target, stated as a target. */}
            {ownerHoursLeft === null
              ? 'Please respond as soon as you can.'
              : ownerHoursLeft > 0
                ? `Target: respond within ${ownerHoursLeft} more hour${ownerHoursLeft === 1 ? '' : 's'}.`
                : 'The 48-hour response target has passed. You can still decide.'}
          </p>
          <form
            className="trust-form"
            onSubmit={(event) => {
              event.preventDefault()
              setBusy(true)
              setError('')
              backend.supportCases
                .decide(supportCase.id, { expected_version: supportCase.version, decision, reason })
                .then(onChanged)
                .catch((caught: unknown) => {
                  setError(caught instanceof DataError ? caught.message : 'Hindi matuloy ang desisyon.')
                })
                .finally(() => setBusy(false))
            }}
          >
            <fieldset>
              <legend>What actually happened</legend>
              <label>
                <input type="radio" name={`decision-${supportCase.id}`} checked={decision === 'completed'} onChange={() => setDecision('completed')} />
                <span>The service was delivered — record it completed</span>
              </label>
              <label>
                <input type="radio" name={`decision-${supportCase.id}`} checked={decision === 'cancelled'} onChange={() => setDecision('cancelled')} />
                <span>It was not delivered — record it cancelled</span>
              </label>
            </fieldset>
            <label>
              <span>Reason (the customer sees this)</span>
              <textarea value={reason} rows={2} required minLength={3} maxLength={2000} onChange={(event) => setReason(event.target.value)} />
            </label>
            <p className="trust-hint">
              After your decision the customer has 48 hours to accept it or escalate to platform review.
            </p>
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              {busy ? 'Recording...' : 'Record decision'}
            </button>
          </form>
        </>
      )}

      {supportCase.status !== 'owner_review' && supportCase.owner_decision && (
        <p className="trust-response">
          <span className="trust-response-label">Your decision</span>
          {supportCase.owner_decision === 'completed' ? 'Recorded completed. ' : 'Recorded cancelled. '}
          {supportCase.owner_decision_reason}
        </p>
      )}
      {supportCase.resolution && (
        <p className="trust-message" role="status">
          Final: {supportCase.resolution.replaceAll('_', ' ')}. {supportCase.resolution_reason}
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </article>
  )
}

/**
 * Trust is a separate owner destination from operations and from analytics: it is
 * where a decision gets made, not where a number gets read.
 */
export function OwnerTrustPanel() {
  const backend = useBackend()
  const [reviews, setReviews] = useState<ShopReview[] | null>(null)
  const [cases, setCases] = useState<SupportCase[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [shopReviews, shopCases] = await Promise.all([
        backend.reviews.listForShop(),
        backend.supportCases.listForShop(),
      ])
      setReviews(shopReviews as ShopReview[])
      setCases(shopCases)
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-load ang trust workspace.')
      setReviews([])
    }
  }, [backend])

  useEffect(() => {
    void load()
  }, [load])

  const openCases = cases.filter((entry) => entry.status !== 'resolved' && entry.status !== 'withdrawn')
  const closedCases = cases.filter((entry) => entry.status === 'resolved' || entry.status === 'withdrawn')

  return (
    <div className="owner-trust">
      <header className="trust-head">
        <span className="eyebrow">TRUST &amp; DISPUTES</span>
        <h1>Trust</h1>
        <p>
          Mga verified review at disputes ng shop mo. Hindi mo pwedeng burahin ang score, pero pwede kang
          sumagot nang publiko at mag-report ng abusive text para tingnan ng moderator.
        </p>
      </header>

      {error && (
        <p className="form-error" role="alert">
          {error} <button type="button" className="btn btn-sm" onClick={() => void load()}>Retry</button>
        </p>
      )}

      <section aria-labelledby="trust-cases">
        <h2 id="trust-cases">Disputes needing a decision ({openCases.length})</h2>
        {openCases.length === 0
          ? <p className="trust-empty" role="status">Walang open dispute. Lalabas dito ang bagong case kapag may customer na nag-dispute.</p>
          : openCases.map((entry) => <CaseCard key={entry.id} supportCase={entry} onChanged={() => void load()} />)}
      </section>

      {closedCases.length > 0 && (
        <details className="trust-closed">
          <summary>Resolved disputes ({closedCases.length})</summary>
          {closedCases.map((entry) => <CaseCard key={entry.id} supportCase={entry} onChanged={() => void load()} />)}
        </details>
      )}

      <section aria-labelledby="trust-reviews">
        <h2 id="trust-reviews">Verified reviews ({reviews?.length ?? 0})</h2>
        {reviews === null && <p className="trust-empty" role="status">Binubuklat ang reviews…</p>}
        {reviews !== null && reviews.length === 0 && (
          <p className="trust-empty" role="status">
            Wala pang review. Isang completed at verified na visit lang ang nagbubukas ng review.
          </p>
        )}
        {(reviews ?? []).map((review) => (
          <ReviewCard key={review.id} review={review} onChanged={() => void load()} />
        ))}
      </section>
    </div>
  )
}
