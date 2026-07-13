import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentDetailed,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { Loading } from '../components/Loading'
import { DoodleIcon } from '../theme/DoodleDefs'
import { money, timeOfDay, dayLabel } from '../lib/format'
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
  const [appts, setAppts] = useState<AppointmentDetailed[] | null>(null)
  const [view, setView] = useState<'upcoming' | 'history'>('upcoming')
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('bsh_cut_ratings') ?? '{}')
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
      return Object.fromEntries(
        Object.entries(value)
          .filter((entry): entry is [string, number] => Number.isInteger(entry[1]) && Number(entry[1]) >= 1 && Number(entry[1]) <= 5)
          .slice(0, 500),
      )
    }
    catch { return {} }
  })

  const load = useCallback(() => {
    backend.bookings.listMine().then(setAppts)
  }, [backend])

  useEffect(() => {
    load()
  }, [load])

  async function cancel(id: string) {
    await backend.bookings.cancel(id)
    load()
  }

  function rateCut(id: string, score: number) {
    const next = { ...ratings, [id]: score }
    setRatings(next)
    localStorage.setItem('bsh_cut_ratings', JSON.stringify(next))
  }

  if (!appts) return <Loading label="Pulling up your bookings…" />

  const now = Date.now()
  const upcoming = appts.filter((appointment) =>
    (appointment.status === 'pending' || appointment.status === 'confirmed') &&
    new Date(appointment.starts_at).getTime() >= now,
  )
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id))
  const history = appts.filter((appointment) => !upcomingIds.has(appointment.id))
  const visible = view === 'upcoming' ? upcoming : history

  return (
    <div className="appointments-page">
      <header className="appointments-head">
        <div><span className="eyebrow">{isBarber ? 'Your chair' : 'Your visits'}</span><h1>Appointments</h1></div>
        <div className="appointments-tabs" role="group" aria-label="Appointment view">
          <button type="button" className={view === 'upcoming' ? 'is-active' : ''} onClick={() => setView('upcoming')}>Upcoming <span>{upcoming.length}</span></button>
          <button type="button" className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}>History <span>{history.length}</span></button>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rough-card center stack" style={{ marginTop: 20 }}>
          <p className="muted">{view === 'upcoming' ? 'Nothing booked yet.' : 'Wala pang past cuts.'}</p>
          <Link to="/barbers" className="btn btn-primary">Book a chair</Link>
        </div>
      ) : (
        <div className="appt-list">
          {visible.map((a) => {
            const active = a.status === 'pending' || a.status === 'confirmed'
            return (
              <article className="rough-card appt-row" key={a.id}>
                <div className="appt-when">
                  <DoodleIcon name="calendar" size={26} />
                  <div>
                    <strong>{dayLabel(a.starts_at)}</strong>
                    <span className="muted"> · {timeOfDay(a.starts_at)}</span>
                  </div>
                </div>
                <div className="appt-what">
                  <strong>{a.service.name}</strong>
                  <span className="muted">
                    {isBarber ? `with ${a.customer.full_name}` : `with ${a.barber.profile.full_name}`}
                    {' · '}{money(a.service.price_cents)}
                  </span>
                </div>
                <span className={`pill ${STATUS_CLASS[a.status] ?? 'pill-off'}`}>
                  {APPOINTMENT_STATUS_LABELS[a.status]}
                </span>
                <div className="appt-actions">
                  {active && !isBarber && (
                    <Link className="btn btn-sm" to={barberBookingPath(a.barber_id, a.service_id, a.id)}>Reschedule</Link>
                  )}
                  {active && <button className="btn btn-sm btn-danger" onClick={() => cancel(a.id)}>Cancel</button>}
                  {!active && !isBarber && (
                    <Link className="btn btn-sm btn-primary" to={barberBookingPath(a.barber_id, a.service_id)}>Rebook</Link>
                  )}
                </div>
                {view === 'history' && a.status === 'completed' && !isBarber && (
                  <div className="appt-review">
                    <span>{ratings[a.id] ? `Your rating: ${ratings[a.id]}/5` : 'Rate this cut'}</span>
                    <div role="group" aria-label={`Rate cut with ${a.barber.profile.full_name}`}>
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button type="button" className={score <= (ratings[a.id] ?? 0) ? 'is-rated' : ''} onClick={() => rateCut(a.id, score)} aria-label={`${score} stars`} key={score}>
                          <DoodleIcon name="star" size={18} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function barberBookingPath(barberId: string, serviceId: string, rescheduleId?: string) {
  const params = new URLSearchParams({ service: serviceId })
  if (rescheduleId) params.set('reschedule', rescheduleId)
  return `/barbers/${routeSegment(barberId)}?${params.toString()}`
}
