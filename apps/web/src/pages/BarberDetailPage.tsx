import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  DataError,
  type BarberWithProfile,
  type Service,
  type ShopWithStatus,
  type Slot,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { Loading } from '../components/Loading'
import { money, timeOfDay } from '../lib/format'
import { isTodayOrLaterLocalDateKey, localDateKey, parseLocalDateKey } from '../lib/date'
import { routeSegment } from '../lib/security'
import './BarberDetailPage.css'

function safeRequestedDate(value: string | null) {
  return isTodayOrLaterLocalDateKey(value) ? value : null
}

interface BookingDay {
  iso: string
  weekday: string
  day: number
  month: string
  fullLabel: string
}

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-PH', { weekday: 'short' })
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-PH', { month: 'short' })

function nextDays(count: number, requestedStart: string | null): BookingDay[] {
  const out: BookingDay[] = []
  const base = parseLocalDateKey(requestedStart) ?? new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const iso = localDateKey(d)
    out.push({
      iso,
      weekday: WEEKDAY_FORMATTER.format(d),
      day: d.getDate(),
      month: MONTH_FORMATTER.format(d),
      fullLabel: FULL_DATE_FORMATTER.format(d),
    })
  }
  return out
}

export function BarberDetailPage() {
  const { barberId } = useParams<{ barberId: string }>()
  const backend = useBackend()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedServiceId = searchParams.get('service')
  const rescheduleId = searchParams.get('reschedule')
  const requestedDate = safeRequestedDate(searchParams.get('date'))

  const [barber, setBarber] = useState<BarberWithProfile | null>(null)
  const [shop, setShop] = useState<ShopWithStatus | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [notFound, setNotFound] = useState(false)

  const days = useMemo(() => nextDays(21, requestedDate), [requestedDate])
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(days[0].iso)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [booking, setBooking] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [favoriteBarberIds, setFavoriteBarberIds] = useState<string[]>([])

  useEffect(() => {
    setDate(days[0].iso)
  }, [days])

  useEffect(() => {
    if (!barberId) return
    let active = true
    Promise.all([
      backend.barbers.get(barberId),
      backend.services.list(),
      backend.shops.list(),
      profile ? backend.favorites.listBarbers() : Promise.resolve([]),
    ]).then(
      ([b, s, shops, favoriteIds]) => {
        if (!active) return
        if (!b) {
          setNotFound(true)
          return
        }
        setBarber(b)
        setShop(shops.find((candidate) => candidate.barber_ids.includes(b.id)) ?? null)
        setFavoriteBarberIds(favoriteIds)
        setServices(s)
        setServiceId(s.some((service) => service.id === requestedServiceId) ? requestedServiceId! : (s[0]?.id ?? ''))
      },
    )
    return () => {
      active = false
    }
  }, [backend, barberId, profile, requestedServiceId])

  // Recompute slots whenever service/date changes.
  useEffect(() => {
    if (!barberId || !serviceId) return
    let active = true
    setSlots(null)
    setSelectedSlot(null)
    backend.availability.getOpenSlots(barberId, serviceId, date).then(
      (s) => { if (active) setSlots(s) },
      () => { if (active) setSlots([]) },
    )
    return () => {
      active = false
    }
  }, [backend, barberId, serviceId, date])

  async function book() {
    if (!barberId || !serviceId || !selectedSlot) return
    if (!profile) {
      navigate('/login', { state: { from: `/barbers/${routeSegment(barberId)}` } })
      return
    }
    setBooking(true)
    setMessage(null)
    try {
      const input = { barber_id: barberId, service_id: serviceId, starts_at: selectedSlot.starts_at, notes }
      if (rescheduleId) await backend.bookings.reschedule(rescheduleId, input)
      else await backend.bookings.create(input)
      setMessage({
        kind: 'ok',
        text: rescheduleId
          ? `Rescheduled for ${timeOfDay(selectedSlot.starts_at)}. Updated na ang booking mo!`
          : `Booked for ${timeOfDay(selectedSlot.starts_at)}. See you then!`,
      })
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof DataError ? err.message : 'Could not book that slot.',
      })
    } finally {
      // Always refresh — the taken slot should disappear.
      try {
        const fresh = await backend.availability.getOpenSlots(barberId, serviceId, date)
        setSlots(fresh)
      } catch {
        // A refresh failure must never leave the booking controls locked.
        setSlots([])
      } finally {
        setSelectedSlot(null)
        setBooking(false)
      }
    }
  }

  async function toggleBarberFavorite() {
    if (!barberId) return
    if (!profile) {
      navigate('/login', { state: { from: `/barbers/${routeSegment(barberId)}` } })
      return
    }
    setFavoriteBarberIds(await backend.favorites.toggleBarber(barberId))
  }

  if (notFound) {
    return (
      <div className="center stack">
        <h1>Barber not found</h1>
        <Link to="/barbers" className="btn">Back to the crew</Link>
      </div>
    )
  }
  if (!barber) return <Loading label="Fetching the chair…" />

  const isOwnPage = profile?.id === barber.id
  const selectedService = services.find((s) => s.id === serviceId)
  const selectedDay = days.find((day) => day.iso === date)

  return (
    <div className="barber-detail">
      <Link to="/barbers" className="btn btn-ghost btn-sm">← All barbers</Link>

      <header className="rough-card detail-head">
        <Avatar name={barber.profile.full_name} size={78} />
        <div>
          <h1 style={{ margin: 0 }}>{barber.profile.full_name}</h1>
          <span className={barber.shift_status === 'on' ? 'pill pill-on' : 'pill pill-off'}>
            {barber.shift_status === 'on' ? 'On the chair now' : 'Off shift'}
          </span>
          <p className="muted" style={{ marginTop: 10 }}>{barber.bio}</p>
        </div>
        <div className="detail-head-actions">
          <button className={`btn ${favoriteBarberIds.includes(barber.id) ? 'btn-pink' : ''}`} onClick={toggleBarberFavorite}>
            <DoodleIcon name="heart" size={20} /> {favoriteBarberIds.includes(barber.id) ? 'Saved' : 'Favorite'}
          </button>
        </div>
      </header>

      <section className="barber-proof-grid" aria-label="Barber portfolio and rating">
        <article className="rough-card barber-rating-proof">
          <span className="eyebrow">CUSTOMER RATING</span>
          <strong>{barber.rating.toFixed(1)}</strong>
          <div className="barber-proof-stars">
            {[1, 2, 3, 4, 5].map((star) => <DoodleIcon name="star" size={21} key={star} />)}
          </div>
          <p>{barber.rating_count} verified ratings</p>
          <blockquote>&ldquo;Sharp ang fade at malinaw kausap bago simulan.&rdquo;</blockquote>
        </article>
        <article className="rough-card barber-portfolio">
          <div className="barber-portfolio-head"><div><span className="eyebrow">PORTFOLIO</span><h2>Recent cuts</h2></div><span className="pill pill-yellow">Fades specialist</span></div>
          <div className="barber-cut-grid">
            <div className="is-fade"><span>Low fade</span></div>
            <div className="is-crop"><span>Textured crop</span></div>
            <div className="is-classic"><span>Classic taper</span></div>
          </div>
        </article>
      </section>

      {isOwnPage ? (
        <p className="muted center" style={{ marginTop: 24 }}>
          This is your public page. Manage your hours from the{' '}
          <Link to="/dashboard">dashboard</Link>.
        </p>
      ) : (
        <section className="booking-workspace" aria-labelledby="booking-title">
          <header className="booking-workspace-head">
            <div><span className="eyebrow">RESERVE A CHAIR</span><h2 id="booking-title"><DoodleIcon name="calendar" size={26} /> Complete your booking</h2></div>
            <div className="booking-page-tabs" aria-label="Booking navigation"><span className="is-active">Book</span><Link to="/appointments">My calendar</Link></div>
          </header>
          {rescheduleId && <p className="pill pill-yellow">Pumili ng bagong slot. Mananatili ang dati hanggang successful ang update.</p>}

          <div className="booking-layout">
            <aside className="rough-card booking-summary" aria-label="Booking summary">
              <span className="booking-summary-kicker">YOUR BARBER</span>
              <div className="booking-summary-person"><Avatar name={barber.profile.full_name} size={58} /><div><h3>{barber.profile.full_name}</h3><span>{shop?.name ?? 'Independent barber'}</span></div></div>
              {shop && <div className="booking-summary-rating"><DoodleIcon name="star" size={17} /> {shop.rating.toFixed(1)} shop rating</div>}
              <dl>
                <div><dt>Service</dt><dd>{selectedService?.name ?? 'Choose a service'}</dd></div>
                <div><dt>Date</dt><dd>{selectedDay?.fullLabel ?? date}</dd></div>
                <div><dt>Time</dt><dd>{selectedSlot ? timeOfDay(selectedSlot.starts_at) : 'Choose a time'}</dd></div>
                <div><dt>Duration</dt><dd>{selectedService ? `${selectedService.duration_min} min` : '—'}</dd></div>
              </dl>
              <div className="booking-summary-total"><span>Total</span><strong>{selectedService ? money(selectedService.price_cents) : '—'}</strong></div>
            </aside>

            <div className="rough-card booking-form-panel">
              <label className="field booking-service-field"><span>1. Choose your service</span><select value={serviceId} disabled={booking} onChange={(event) => setServiceId(event.target.value)}>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {money(service.price_cents)} · {service.duration_min} min</option>)}</select></label>

              <fieldset className="booking-calendar">
                <legend>2. Choose a date</legend>
                <div className="booking-calendar-grid">
                  {days.map((day) => <button type="button" key={day.iso} className={date === day.iso ? 'is-selected' : ''} disabled={booking} aria-pressed={date === day.iso} onClick={() => setDate(day.iso)}><small>{day.weekday}</small><strong>{day.day}</strong><span>{day.month}</span></button>)}
                </div>
              </fieldset>

              <fieldset className="booking-times">
                <legend>3. Pick an available time</legend>
                {slots === null ? <p>Checking open times…</p> : slots.length === 0 ? <p>No open slots that day. Try another date.</p> : <div className="slot-grid">{slots.map((slot) => <button type="button" key={slot.starts_at} className={`slot${selectedSlot?.starts_at === slot.starts_at ? ' is-selected' : ''}`} disabled={booking} aria-pressed={selectedSlot?.starts_at === slot.starts_at} onClick={() => setSelectedSlot(slot)}>{timeOfDay(slot.starts_at)}</button>)}</div>}
              </fieldset>

              <label className="field booking-notes"><span>Cut notes (optional)</span><textarea rows={2} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Hal. low fade, clean sides…" /></label>
              {message && <p className={message.kind === 'ok' ? 'booking-ok' : 'form-error'} role="status">{message.text}</p>}
              <div className="booking-submit-row"><span>{selectedSlot ? `${selectedDay ? SHORT_DATE_FORMATTER.format(parseLocalDateKey(selectedDay.iso)!) : date} at ${timeOfDay(selectedSlot.starts_at)}` : 'Select a date and time to continue'}</span><button type="button" className="btn btn-primary" disabled={!selectedSlot || booking} onClick={book}>{booking ? 'Booking…' : rescheduleId ? 'Confirm reschedule' : 'Confirm booking'}</button></div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
