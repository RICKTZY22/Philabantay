import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  canModifyAppointment,
  DataError,
  isUpcomingAppointment,
  type AppointmentDetailed,
  type AppointmentChangeProposal,
  type AppointmentDelay,
  type AppointmentEvent,
  type InAppNotification,
  type NoShowAppeal,
  type PublicShopDetail,
  type AvailabilitySlot,
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
import { appointmentStatusPresentation } from '../lib/appointmentStatus'
import './AppointmentsPage.css'

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
  const [cancelError, setCancelError] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [proposals, setProposals] = useState<AppointmentChangeProposal[]>([])
  const [delays, setDelays] = useState<AppointmentDelay[]>([])
  const [timeline, setTimeline] = useState<AppointmentEvent[]>([])
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [appeals, setAppeals] = useState<NoShowAppeal[]>([])
  const [checkInCode, setCheckInCode] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [workingAction, setWorkingAction] = useState('')

  const load = useCallback(async () => {
    const [appointments, savedReviews, inbox, noShowAppeals] = await Promise.all([
      backend.bookings.listMine(),
      backend.reviews.listMine(),
      backend.notifications.list(),
      backend.bookings.listMyNoShowAppeals(),
    ])
    setAppts(appointments)
    setReviews(savedReviews)
    setNotifications(inbox)
    setAppeals(noShowAppeals)
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
    setActionMessage('')
    setCheckInCode('')
  }, [])

  const openSelected = useCallback((appointment: AppointmentDetailed) => {
    setCancelError('')
    setSelected(appointment)
    setActionMessage('')
    void Promise.all([
      backend.bookings.listChangeProposals(appointment.id),
      backend.bookings.listDelays(appointment.id),
      backend.bookings.timeline(appointment.id),
    ]).then(([loadedProposals, loadedDelays, loadedTimeline]) => {
      setProposals(loadedProposals); setDelays(loadedDelays); setTimeline(loadedTimeline)
    }).catch((error: unknown) => setActionMessage(error instanceof DataError ? error.message : 'Could not load the full booking history.'))
  }, [backend])

  async function customerAction(key: string, operation: () => Promise<unknown>, success: string) {
    if (!selected) return
    setWorkingAction(key); setActionMessage('')
    try {
      await operation()
      const refreshed = await load()
      const latest = refreshed.find((appointment) => appointment.id === selected.id) ?? null
      setSelected(latest)
      if (latest) {
        const [loadedProposals, loadedDelays, loadedTimeline] = await Promise.all([
          backend.bookings.listChangeProposals(latest.id), backend.bookings.listDelays(latest.id), backend.bookings.timeline(latest.id),
        ])
        setProposals(loadedProposals); setDelays(loadedDelays); setTimeline(loadedTimeline)
      }
      setActionMessage(success)
    } catch (error) {
      setActionMessage(error instanceof DataError ? error.message : 'The booking action failed. Refresh and try again.')
    } finally { setWorkingAction('') }
  }

  async function cancel(id: string) {
    setCancelling(true)
    setCancelError('')
    try {
      const appointment = appts?.find((candidate) => candidate.id === id)
      await backend.bookings.cancelWithReason(id, {
        expected_version: appointment?.version ?? 1,
        reason: 'Customer cancelled the booking from the appointment action center.',
      })
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
      </header>

      {notifications.length > 0 && <details className="appointments-inbox"><summary>{notifications.filter((item) => !item.read_at).length} unread operational update(s)</summary><ul>{notifications.slice(0, 8).map((item) => <li key={item.id}><button type="button" onClick={() => void backend.notifications.markRead(item.id).then(() => load())}><strong>{item.title}</strong><span>{item.body}</span></button></li>)}</ul></details>}

      <div className="appointments-workspace">
        <aside className="appointments-sidebar" aria-label="Booking overview">
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
              <span className={`pill ${appointmentStatusPresentation(selected.status).className}`}>
                {appointmentStatusPresentation(selected.status).label}
              </span>
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
                <div><dt>Policy</dt><dd>{selected.booked_cancellation_cutoff_minutes ?? 120}-minute free-change cutoff · {selected.booked_timezone ?? 'shop timezone'}</dd></div>
              </dl>
            </div>

            {delays.length > 0 && <section className="booking-operation-note"><strong>Latest delay: about {delays[0].estimate_minutes} minutes</strong><span>{delays[0].reason}</span></section>}

            {proposals.filter((proposal) => proposal.status === 'pending').map((proposal) => <section className="booking-operation-note is-proposal" key={proposal.id}><strong>Approval needed: proposed booking change</strong><span>{proposal.original_service_name} → {proposal.proposed_service_name}</span><span>{dayLabel(proposal.original_starts_at)} {timeOfDay(proposal.original_starts_at)} → {dayLabel(proposal.proposed_starts_at)} {timeOfDay(proposal.proposed_starts_at)}</span><span>{money(proposal.original_price_cents)} → {money(proposal.proposed_price_cents)} · {proposal.reason}</span><div className="booking-notebook-actions"><button className="btn btn-green" disabled={Boolean(workingAction)} onClick={() => void customerAction(`proposal-${proposal.id}`, () => backend.bookings.respondToChange(proposal.id, { expected_proposal_version: proposal.version, expected_appointment_version: selected.version ?? 1, decision: 'approve' }), 'Change approved and capacity rechecked.')}>Approve change</button><button className="btn" disabled={Boolean(workingAction)} onClick={() => void customerAction(`proposal-${proposal.id}`, () => backend.bookings.respondToChange(proposal.id, { expected_proposal_version: proposal.version, expected_appointment_version: selected.version ?? 1, decision: 'reject', reason: 'Customer chose to keep the original booking.' }), 'Change rejected; the original booking remains.')}>Keep original</button></div></section>)}

            <div className="booking-notebook-actions">
              {(selected.allowed_actions?.includes('cancel') ?? canModifyAppointment(selected, nowEpochMs)) && (
                <button type="button" className="btn btn-danger" disabled={cancelling} onClick={() => void cancel(selected.id)}>{cancelling ? 'Cancelling...' : 'Cancel booking'}</button>
              )}
              {selected.allowed_actions?.includes('check_in') && !isBarber && <label className="booking-checkin-field"><span>6-digit shop code</span><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={checkInCode} onChange={(event) => setCheckInCode(event.target.value.replace(/\D/g, ''))} /><button type="button" className="btn btn-green" disabled={Boolean(workingAction) || checkInCode.length !== 6} onClick={() => void customerAction('check-in', () => backend.bookings.checkIn(selected.id, { expected_version: selected.version ?? 1, code: checkInCode }), 'You are checked in.')}>Check in</button></label>}
              {selected.allowed_actions?.includes('confirm_completion') && !isBarber && <button type="button" className="btn btn-green" disabled={Boolean(workingAction)} onClick={() => void customerAction('confirm', () => backend.bookings.confirmCompletion(selected.id, { expected_version: selected.version ?? 1 }), 'Visit confirmed complete.')}>Confirm completion</button>}
              {selected.allowed_actions?.includes('dispute') && !isBarber && <button type="button" className="btn btn-danger" disabled={Boolean(workingAction)} onClick={() => void customerAction('dispute', () => backend.bookings.dispute(selected.id, { expected_version: selected.version ?? 1, reason: 'Customer reported that the recorded service outcome needs review.' }), 'Dispute opened for owner review.')}>Dispute result</button>}
              {selected.allowed_actions?.includes('appeal_no_show') && !isBarber && !appeals.some((appeal) => appeal.appointment_id === selected.id) && <button type="button" className="btn" disabled={Boolean(workingAction)} onClick={() => void customerAction('appeal', () => backend.bookings.appealNoShow(selected.id, { reason: 'Customer requests review of the no-show record.' }), 'Appeal submitted before the deadline.')}>Appeal no-show</button>}
            </div>
            {(selected.allowed_actions?.includes('reschedule') ?? canModifyAppointment(selected, nowEpochMs)) && !isBarber && <CustomerRescheduleForm appointment={selected} onAction={customerAction} />}
            {cancelError && <p className="form-error" role="alert">{cancelError}</p>}
            {actionMessage && <p className="booking-review-message" role="status">{actionMessage}</p>}

            <details className="booking-timeline"><summary>Appointment timeline ({timeline.length})</summary><ol>{timeline.map((event) => <li key={event.id}><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{event.reason ?? 'Recorded by the system.'}</span><time>{new Date(event.created_at).toLocaleString('en-PH')}</time></li>)}</ol></details>

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

function CustomerRescheduleForm({ appointment, onAction }: {
  appointment: AppointmentDetailed
  onAction: (key: string, operation: () => Promise<unknown>, success: string) => Promise<void>
}) {
  const backend = useBackend()
  const [shop, setShop] = useState<PublicShopDetail | null>(null)
  const [serviceId, setServiceId] = useState(appointment.service_id)
  const [date, setDate] = useState(() => shopDateKey(appointment.starts_at, appointment.booked_timezone ?? 'Asia/Manila'))
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void backend.shops.get(appointment.shop_id).then(setShop).catch(() => setError('Shop details are temporarily unavailable.'))
  }, [appointment.shop_id, backend])

  async function findSlots(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    try { setSlots((await backend.availability.getDay({ shop_id: appointment.shop_id, service_id: serviceId, date })).slots) }
    catch (reason) { setError(reason instanceof DataError ? reason.message : 'Could not refresh availability.') }
    finally { setLoading(false) }
  }

  return <details className="booking-reschedule"><summary>Reschedule using live availability</summary><form onSubmit={findSlots}><label>Service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{shop?.services.map((service) => <option value={service.id} key={service.id}>{service.name} · {service.duration_min} min</option>) ?? <option value={appointment.service_id}>{appointment.service.name}</option>}</select></label><label>Shop-local date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button className="btn btn-sm" disabled={loading}>{loading ? 'Checking...' : 'Find available times'}</button></form>{error && <p className="form-error" role="alert">{error}</p>}<div className="booking-reschedule-slots">{slots.map((slot) => <button className="btn btn-sm" type="button" key={`${slot.provider_user_id}-${slot.starts_at}`} onClick={() => void onAction(`reschedule-${slot.starts_at}`, () => backend.bookings.rescheduleWithVersion(appointment.id, { expected_version: appointment.version ?? 1, barber_id: slot.provider_user_id, service_id: serviceId, starts_at: slot.starts_at, notes: appointment.notes ?? undefined }), 'Booking moved after an authoritative capacity recheck.')}>{timeOfDay(slot.starts_at)}</button>)}{!loading && slots.length === 0 && <small>Refresh a date to see currently claimable slots.</small>}</div></details>
}

function shopDateKey(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
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
