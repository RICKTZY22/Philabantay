import { useEffect, useMemo, useState } from 'react'
import {
  DataError,
  type CustomerRatingWorkspace,
  type RatingDisplayMode,
  type Review,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { DoodleIcon } from '../theme/DoodleDefs'
import './RatingPanel.css'

type PendingEligibility = CustomerRatingWorkspace['pending'][number]
type SavedReview = CustomerRatingWorkspace['reviews'][number]

function ScoreRow({ label, value, onRate, disabled }: {
  label: string
  value: number
  onRate: (score: number) => void
  disabled?: boolean
}) {
  return (
    <div className="rating-score-row">
      <span className="rating-score-label">{label}</span>
      <div role="group" aria-label={`Rate ${label.toLowerCase()} from 1 to 5`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            className={score <= value ? 'is-rated' : ''}
            aria-pressed={score === value}
            disabled={disabled}
            onClick={() => onRate(score)}
          >
            <DoodleIcon name="star" size={22} />
            <span className="sr-only">{`${score} of 5 for ${label.toLowerCase()}`}</span>
          </button>
        ))}
      </div>
      {/* Not colour-only: the chosen score is also stated in text. */}
      <span className="rating-score-value">{value === 0 ? 'Not rated' : `${value}/5`}</span>
    </div>
  )
}

/** Days remaining in the seven-day window, or null once it has closed. */
function daysLeft(editableUntil: string, nowEpochMs: number): number | null {
  const remaining = Date.parse(editableUntil) - nowEpochMs
  if (Number.isNaN(remaining) || remaining <= 0) return null
  return Math.max(1, Math.ceil(remaining / 86_400_000))
}

/**
 * The one rating surface. Used on the completed-booking detail and on customer
 * home, so the prompt is not buried in history, and both places agree about the
 * edit window because neither of them computes it.
 */
export function RatingPanel({ eligibility, review, onSaved, heading }: {
  eligibility?: PendingEligibility
  review?: SavedReview | Review
  onSaved?: (saved: Review) => void
  heading?: string
}) {
  const backend = useBackend()
  const nowEpochMs = useCurrentTime()
  const [barberScore, setBarberScore] = useState(review?.barber_rating ?? 0)
  const [shopScore, setShopScore] = useState(review?.shop_rating ?? 0)
  const [comment, setComment] = useState(review?.comment ?? '')
  const [displayMode, setDisplayMode] = useState<RatingDisplayMode>(review?.display_mode ?? 'short_name')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setBarberScore(review?.barber_rating ?? 0)
    setShopScore(review?.shop_rating ?? 0)
    setComment(review?.comment ?? '')
    setDisplayMode(review?.display_mode ?? 'short_name')
  }, [review?.id, review?.version, review?.barber_rating, review?.shop_rating, review?.comment, review?.display_mode])

  const remainingDays = useMemo(
    () => (review ? daysLeft(review.editable_until, nowEpochMs) : 7),
    [review, nowEpochMs],
  )
  const locked = Boolean(review) && remainingDays === null
  const moderated = review?.text_state === 'hidden'

  async function save() {
    if (barberScore === 0 || shopScore === 0) {
      setError('Rate both the barber and the barbershop first.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const trimmed = comment.trim()
      const saved = review
        ? await backend.reviews.edit(review.id, {
          expected_version: review.version,
          barber_rating: barberScore,
          shop_rating: shopScore,
          comment: trimmed === '' ? undefined : trimmed,
          display_mode: displayMode,
        })
        : await backend.reviews.submit({
          eligibility_id: eligibility!.id,
          barber_rating: barberScore,
          shop_rating: shopScore,
          comment: trimmed === '' ? undefined : trimmed,
          display_mode: displayMode,
        })
      setMessage(review ? 'Review updated. Salamat!' : 'Review saved. Salamat!')
      onSaved?.(saved)
    } catch (caught) {
      // The server owns the eligibility and window rules, so its sentence is the
      // accurate one. A generic fallback only covers transport failures.
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-save ang review. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  if (!eligibility && !review) return null

  const visitLabel = eligibility
    ? [eligibility.service_name, eligibility.provider_name, eligibility.shop_name].filter(Boolean).join(' · ')
    : null

  return (
    <section className="rating-panel">
      <div className="rating-panel-head">
        <span className="eyebrow">AFTER YOUR CUT</span>
        <h3>{heading ?? (review ? 'Your review' : 'Rate this visit')}</h3>
        {visitLabel && <p className="rating-panel-visit">{visitLabel}</p>}
        <p className="rating-panel-hint">
          Hiwalay ang rating para sa barber at sa shop. Only a completed, verified visit unlocks a review.
        </p>
      </div>

      {moderated && (
        <p className="rating-panel-moderated" role="status">
          Your written text is hidden while a moderator reviews a report. Your score still counts.
        </p>
      )}

      <ScoreRow label="Barber" value={barberScore} onRate={setBarberScore} disabled={locked || moderated} />
      <ScoreRow label="Barbershop" value={shopScore} onRate={setShopScore} disabled={locked || moderated} />

      <label className="rating-panel-field">
        <span>Comment (optional)</span>
        <textarea
          value={comment}
          maxLength={2000}
          rows={3}
          disabled={locked || moderated}
          onChange={(event) => setComment(event.target.value)}
        />
      </label>

      <fieldset className="rating-panel-display" disabled={locked || moderated}>
        <legend>How your name appears</legend>
        <label>
          <input
            type="radio"
            name={`rating-display-${review?.id ?? eligibility?.id}`}
            value="short_name"
            checked={displayMode === 'short_name'}
            onChange={() => setDisplayMode('short_name')}
          />
          <span>First name and last initial</span>
        </label>
        <label>
          <input
            type="radio"
            name={`rating-display-${review?.id ?? eligibility?.id}`}
            value="anonymous"
            checked={displayMode === 'anonymous'}
            onChange={() => setDisplayMode('anonymous')}
          />
          <span>Anonymous</span>
        </label>
      </fieldset>

      {review && (
        <p className="rating-panel-window">
          {locked
            ? 'This review is now locked. Only a moderator or a shop response can change it.'
            : `Editable for ${remainingDays} more day${remainingDays === 1 ? '' : 's'}.`}
        </p>
      )}

      {!locked && !moderated && (
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving...' : review ? 'Update review' : 'Publish review'}
        </button>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="rating-panel-message" role="status">{message}</p>}

      {'responses' in (review ?? {}) && (review as SavedReview).responses.length > 0 && (
        <div className="rating-panel-responses">
          <h4>Shop response</h4>
          {(review as SavedReview).responses.map((response) => (
            <article key={response.id}>
              <span className="rating-response-author">
                {response.author_role === 'shop_owner' ? 'Shop owner' : 'Your barber'}
              </span>
              <p>{response.text_state === 'hidden' ? 'This response is hidden pending moderation.' : response.body}</p>
              <time dateTime={response.created_at}>{new Date(response.created_at).toLocaleDateString('en-PH')}</time>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
