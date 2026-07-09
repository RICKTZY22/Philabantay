import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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

  const [barber, setBarber] = useState<BarberWithProfile | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [notFound, setNotFound] = useState(false)

  const days = useMemo(() => nextDays(14), [])
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(days[0].iso)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [booking, setBooking] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

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
        setServiceId(s[0]?.id ?? '')
      },
    )
    return () => {
      active = false
    }
  }, [backend, barberId])

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
      navigate('/login', { state: { from: `/barbers/${barberId}` } })
      return
    }
    setBooking(true)
    setMessage(null)
    try {
      await backend.bookings.create({ barber_id: barberId, service_id: serviceId, starts_at: slot.starts_at })
      setMessage({ kind: 'ok', text: `Booked for ${timeOfDay(slot.starts_at)}. See you then!` })
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
      navigate('/login', { state: { from: `/barbers/${barberId}` } })
      return
    }
    const convo = await backend.chat.openConversation(barberId)
    navigate(`/chat/${convo.id}`)
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
        <button className="btn btn-blue" onClick={messageBarber}>
          <DoodleIcon name="chat" size={20} /> Message
        </button>
      </header>

      {isOwnPage ? (
        <p className="muted center" style={{ marginTop: 24 }}>
          This is your public page. Manage your hours from the{' '}
          <Link to="/dashboard">dashboard</Link>.
        </p>
      ) : (
        <section className="rough-card booking" style={{ marginTop: 24 }}>
          <h2><DoodleIcon name="calendar" size={26} /> Book a chair</h2>

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
