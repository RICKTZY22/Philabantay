import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  DataError,
  type BarberWithProfile,
  type Service,
  type Slot,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { Loading } from '../components/Loading'
import { money, timeOfDay } from '../lib/format'
import { routeSegment } from '../lib/security'
import { toISODate } from '../services/mock/availability'
import './BarberDetailPage.css'

function nextDays(count: number): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = []
  const base = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    out.push({
      iso: toISODate(d),
      label: i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
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

  const [barber, setBarber] = useState<BarberWithProfile | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [notFound, setNotFound] = useState(false)

  const days = useMemo(() => nextDays(14), [])
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(days[0].iso)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [booking, setBooking] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [favoriteBarberIds, setFavoriteBarberIds] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('bsh_favorite_barbers') ?? '[]')
      return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 500) : []
    }
    catch { return [] }
  })

  useEffect(() => {
    if (!barberId) return
    let active = true
    Promise.all([backend.barbers.get(barberId), backend.services.list()]).then(
      ([b, s]) => {
        if (!active) return
        if (!b) {
          setNotFound(true)
          return
        }
        setBarber(b)
        setServices(s)
        setServiceId(s.some((service) => service.id === requestedServiceId) ? requestedServiceId! : (s[0]?.id ?? ''))
      },
    )
    return () => {
      active = false
    }
  }, [backend, barberId, requestedServiceId])

  // Recompute slots whenever service/date changes.
  useEffect(() => {
    if (!barberId || !serviceId) return
    let active = true
    setSlots(null)
    backend.availability.getOpenSlots(barberId, serviceId, date).then((s) => {
      if (active) setSlots(s)
    })
    return () => {
      active = false
    }
  }, [backend, barberId, serviceId, date])

  async function book(slot: Slot) {
    if (!barberId || !serviceId) return
    if (!profile) {
      navigate('/login', { state: { from: `/barbers/${routeSegment(barberId)}` } })
      return
    }
    setBooking(true)
    setMessage(null)
    try {
      const input = { barber_id: barberId, service_id: serviceId, starts_at: slot.starts_at }
      if (rescheduleId) await backend.bookings.reschedule(rescheduleId, input)
      else await backend.bookings.create(input)
      setMessage({
        kind: 'ok',
        text: rescheduleId
          ? `Rescheduled for ${timeOfDay(slot.starts_at)}. Updated na ang booking mo!`
          : `Booked for ${timeOfDay(slot.starts_at)}. See you then!`,
      })
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof DataError ? err.message : 'Could not book that slot.',
      })
    } finally {
      // Always refresh — the taken slot should disappear.
      const fresh = await backend.availability.getOpenSlots(barberId, serviceId, date)
      setSlots(fresh)
      setBooking(false)
    }
  }

  async function messageBarber() {
    if (!barberId) return
    if (!profile) {
      navigate('/login', { state: { from: `/barbers/${routeSegment(barberId)}` } })
      return
    }
    const convo = await backend.chat.openConversation(barberId)
    navigate(`/chat/${routeSegment(convo.id)}`)
  }

  function toggleBarberFavorite() {
    if (!barberId) return
    const next = favoriteBarberIds.includes(barberId)
      ? favoriteBarberIds.filter((id) => id !== barberId)
      : [...favoriteBarberIds, barberId]
    setFavoriteBarberIds(next)
    localStorage.setItem('bsh_favorite_barbers', JSON.stringify(next))
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
          <button className="btn btn-blue" onClick={messageBarber}>
            <DoodleIcon name="chat" size={20} /> Message
          </button>
        </div>
      </header>

      <section className="barber-proof-grid" aria-label="Barber portfolio and rating">
        <article className="rough-card barber-rating-proof">
          <span className="eyebrow">CUSTOMER RATING</span>
          <strong>4.9</strong>
          <div className="barber-proof-stars">
            {[1, 2, 3, 4, 5].map((star) => <DoodleIcon name="star" size={21} key={star} />)}
          </div>
          <p>127 verified cuts</p>
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
        <section className="rough-card booking" style={{ marginTop: 24 }}>
          <h2><DoodleIcon name="calendar" size={26} /> Book a chair</h2>
          {rescheduleId && <p className="pill pill-yellow">Pumili ng bagong slot. Maca-cancel lang ang dati kapag successful ang bago.</p>}

          <div className="booking-controls">
            <label className="field">
              <span>Service</span>
              <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {money(s.price_cents)} · {s.duration_min}m
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Day</span>
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                {days.map((d) => (
                  <option key={d.iso} value={d.iso}>{d.label}</option>
                ))}
              </select>
            </label>
          </div>

          {selectedService && (
            <p className="faint">
              {selectedService.duration_min}-minute slots · {money(selectedService.price_cents)}
            </p>
          )}

          {message && (
            <p className={message.kind === 'ok' ? 'booking-ok' : 'form-error'}>{message.text}</p>
          )}

          {slots === null ? (
            <p className="muted">Checking open times…</p>
          ) : slots.length === 0 ? (
            <p className="muted">No open slots that day. Try another day.</p>
          ) : (
            <div className="slot-grid">
              {slots.map((slot) => (
                <button
                  key={slot.starts_at}
                  className="btn btn-sm slot"
                  disabled={booking}
                  onClick={() => book(slot)}
                >
                  {timeOfDay(slot.starts_at)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
