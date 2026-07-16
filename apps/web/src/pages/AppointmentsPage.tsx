import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  APPOINTMENT_STATUS_LABELS,
  canModifyAppointment,
  DataError,
  isUpcomingAppointment,
  type AppointmentDetailed,
  type Review,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { Loading } from '../components/Loading'
import { AppointmentCalendar } from '../components/AppointmentCalendar'
import { ModalPortal } from '../components/ModalPortal'
import { DoodleIcon } from '../theme/DoodleDefs'
import { money, timeOfDay, dayLabel } from '../lib/format'
import { todayLocalDateKey } from '../lib/date'
import { routeSegment } from '../lib/security'
import './AppointmentsPage.css'

const STATUS_CLASS: Record<string, string> = {
  pending: 'pill-yellow',
  confirmed: 'pill-on',
  completed: 'pill-blue',
  cancelled: 'pill-off',
  no_show: 'pill-off',
}

export function AppointmentsPage() {
  const backend = useBackend()
  const { isBarber } = useAuth()
  const nowEpochMs = useCurrentTime()
  const [appts, setAppts] = useState<AppointmentDetailed[] | null>(null)
  const [selected, setSelected] = useState<AppointmentDetailed | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [drafts, setDrafts] = useState<Record<string, { barber_rating: number; shop_rating: number }>>({})
  const [savingReview, setSavingReview] = useState<string | null>(null)
  const [reviewMessage, setReviewMessage] = useState<Record<string, string>>({})
  const [plannedDate, setPlannedDate] = useState(todayLocalDateKey)
  const [cancelError, setCancelError] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    const [appointments, savedReviews] = await Promise.all([
      backend.bookings.listMine(),
      backend.reviews.listMine(),
    ])
    setAppts(appointments)
    setReviews(savedReviews)
    setDrafts(Object.fromEntries(savedReviews.map((review) => [review.appointment_id, {
      barber_rating: review.barber_rating,
      shop_rating: review.shop_rating,
    }])))
    return appointments
  }, [backend])

  useEffect(() => {
    void load()
  }, [load])

  const closeSelected = useCallback(() => {
    setSelected(null)
    setCancelError('')
  }, [])

  const openSelected = useCallback((appointment: AppointmentDetailed) => {
    setCancelError('')
    setSelected(appointment)
  }, [])

  async function cancel(id: string) {
    setCancelling(true)
    setCancelError('')
    try {
      await backend.bookings.cancel(id)
      setSelected(null)
      await load()
    } catch (error) {
      setCancelError(error instanceof DataError ? error.message : 'Hindi ma-cancel ang booking. Subukan ulit.')
      try {
        const refreshed = await load()
        setSelected(refreshed.find((appointment) => appointment.id === id) ?? null)
      } catch {
        // Keep the original actionable error if the background refresh fails.
      }
    } finally {
      setCancelling(false)
    }
  }

  function setRating(id: string, target: 'barber_rating' | 'shop_rating', score: number) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        barber_rating: current[id]?.barber_rating ?? 0,
        shop_rating: current[id]?.shop_rating ?? 0,
        [target]: score,
      },
    }))
    setReviewMessage((current) => ({ ...current, [id]: '' }))
  }

  async function saveRating(appointment: AppointmentDetailed) {
    const draft = drafts[appointment.id]
    if (!draft?.barber_rating || !draft.shop_rating) {
      setReviewMessage((current) => ({ ...current, [appointment.id]: 'Rate both the barber and barbershop first.' }))
      return
    }
    setSavingReview(appointment.id)
    try {
      const saved = await backend.reviews.rateAppointment({ appointment_id: appointment.id, ...draft })
      setReviews((current) => [...current.filter((review) => review.appointment_id !== appointment.id), saved])
      setReviewMessage((current) => ({ ...current, [appointment.id]: 'Rating saved. Salamat!' }))
    } catch {
      setReviewMessage((current) => ({ ...current, [appointment.id]: 'Hindi ma-save ang rating. Subukan ulit.' }))
    } finally {
      setSavingReview(null)
    }
  }

  if (!appts) return <Loading label="Pulling up your bookings..." />

  const upcoming = appts
    .filter((appointment) => isUpcomingAppointment(appointment, nowEpochMs))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id))
  const history = appts.filter((appointment) => !upcomingIds.has(appointment.id))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))

  return (
    <div className="appointments-page">
      <header className="appointments-head">
        <div>
          <span className="eyebrow">{isBarber ? 'Your chair' : 'Your visits'}</span>
          <h1>Booking calendar</h1>
          <p>Lahat ng upcoming at past cuts mo, nasa iisang calendar na.</p>
        </div>
        {!isBarber && <Link to="/barbers" className="btn btn-primary"><DoodleIcon name="calendar" size={19} /> Book another cut</Link>}
      </header>

      <div className="appointments-workspace">
        <aside className="appointments-sidebar" aria-label="Booking overview">
          {!isBarber && <section className="appointments-plan">
            <span className="eyebrow">PLAN YOUR NEXT CUT</span>
            <h2>Pick a date</h2>
            <label><span>Preferred haircut date</span><input type="date" min={todayLocalDateKey()} value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label>
            <Link className="btn btn-primary" to={`/barbers?date=${encodeURIComponent(plannedDate)}`}>Find a chair</Link>
          </section>}

          <ScheduleList title="Upcoming cuts" tone="upcoming" appointments={upcoming} empty="Wala pang next cut." onSelect={openSelected} />
          <ScheduleList title="Past history" tone="history" appointments={history} empty="Wala pang past cut." onSelect={openSelected} />
        </aside>

        <div className="appointments-calendar-shell">
          <AppointmentCalendar
            appointments={appts}
            showViewAll={false}
            variant="large"
            onSelectAppointment={openSelected}
          />
        </div>
      </div>

      {selected && (
        <ModalPortal
          backdropClassName="booking-notebook-backdrop"
          dialogClassName="booking-notebook"
          labelledBy="booking-notebook-title"
          onClose={closeSelected}
        >
            <button type="button" className="booking-notebook-close" aria-label="Close booking details" data-dialog-initial-focus onClick={closeSelected}>x</button>
            <header>
              <div><span className="eyebrow">BOOKING NOTEBOOK</span><h2 id="booking-notebook-title">{selected.service.name}</h2></div>
              <span className={`pill ${STATUS_CLASS[selected.status] ?? 'pill-off'}`}>{APPOINTMENT_STATUS_LABELS[selected.status]}</span>
            </header>

            <div className="booking-notebook-main">
              <section className="booking-notebook-date">
                <DoodleIcon name="calendar" size={32} />
                <strong>{dayLabel(selected.starts_at)}</strong>
                <span>{timeOfDay(selected.starts_at)}</span>
              </section>
              <dl>
                <div><dt>{isBarber ? 'Customer' : 'Barber'}</dt><dd>{isBarber ? selected.customer.full_name : selected.barber.profile.full_name}</dd></div>
                <div><dt>Barbershop</dt><dd>{selected.shop.name}</dd></div>
                <div><dt>Service</dt><dd>{selected.service.name} - {selected.service.duration_min} min</dd></div>
                <div><dt>Total</dt><dd>{money(selected.service.price_cents)}</dd></div>
                <div><dt>Cut notes</dt><dd>{selected.notes || 'No special notes.'}</dd></div>
              </dl>
            </div>

            <div className="booking-notebook-actions">
              {canModifyAppointment(selected, nowEpochMs) && !isBarber && (
                <Link className="btn" to={barberBookingPath(selected.barber_id, selected.service_id, selected.id)}>Reschedule</Link>
              )}
              {canModifyAppointment(selected, nowEpochMs) && (
                <button type="button" className="btn btn-danger" disabled={cancelling} onClick={() => void cancel(selected.id)}>{cancelling ? 'Cancelling...' : 'Cancel booking'}</button>
              )}
              {!canModifyAppointment(selected, nowEpochMs) && !isBarber && (
                <Link className="btn btn-primary" to={barberBookingPath(selected.barber_id, selected.service_id)}>Book again</Link>
              )}
            </div>
            {cancelError && <p className="form-error" role="alert">{cancelError}</p>}

            {selected.status === 'completed' && !isBarber && (
              <section className="booking-notebook-review">
                <div><span className="eyebrow">AFTER YOUR CUT</span><h3>{reviews.some((review) => review.appointment_id === selected.id) ? 'Edit your rating' : 'Rate this visit'}</h3><p>Hiwalay ang rating para sa barber at shop.</p></div>
                <RatingRow label="Barber" value={drafts[selected.id]?.barber_rating ?? 0} onRate={(score) => setRating(selected.id, 'barber_rating', score)} />
                <RatingRow label="Barbershop" value={drafts[selected.id]?.shop_rating ?? 0} onRate={(score) => setRating(selected.id, 'shop_rating', score)} />
                <button type="button" className="btn btn-primary" disabled={savingReview === selected.id} onClick={() => void saveRating(selected)}>{savingReview === selected.id ? 'Saving...' : 'Save rating'}</button>
                {reviewMessage[selected.id] && <span className="booking-review-message" role="status">{reviewMessage[selected.id]}</span>}
              </section>
            )}
        </ModalPortal>
      )}
    </div>
  )
}

function RatingRow({ label, value, onRate }: { label: string; value: number; onRate: (score: number) => void }) {
  return (
    <div className="appt-rating-row">
      <span>{label}</span>
      <div role="group" aria-label={`Rate ${label.toLowerCase()}`}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button type="button" className={score <= value ? 'is-rated' : ''} onClick={() => onRate(score)} aria-label={`${score} stars for ${label.toLowerCase()}`} key={score}><DoodleIcon name="star" size={22} /></button>
        ))}
      </div>
    </div>
  )
}

function ScheduleList({ title, tone, appointments, empty, onSelect }: {
  title: string
  tone: 'upcoming' | 'history'
  appointments: AppointmentDetailed[]
  empty: string
  onSelect: (appointment: AppointmentDetailed) => void
}) {
  return (
    <section className={`appointments-mini-list is-${tone}`}>
      <header><h2>{title}</h2><span>{appointments.length}</span></header>
      {appointments.length === 0 ? <p>{empty}</p> : appointments.slice(0, 4).map((appointment) => (
        <button type="button" key={appointment.id} onClick={() => onSelect(appointment)}>
          <span><strong>{appointment.service.name}</strong><small>{appointment.shop.name}</small></span>
          <time>{new Date(appointment.starts_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}<small>{timeOfDay(appointment.starts_at)}</small></time>
        </button>
      ))}
      {appointments.length > 4 && <small className="appointments-mini-more">+{appointments.length - 4} more on the calendar</small>}
    </section>
  )
}

function barberBookingPath(barberId: string, serviceId: string, rescheduleId?: string) {
  const params = new URLSearchParams({ service: serviceId })
  if (rescheduleId) params.set('reschedule', rescheduleId)
  return `/barbers/${routeSegment(barberId)}?${params.toString()}`
}
