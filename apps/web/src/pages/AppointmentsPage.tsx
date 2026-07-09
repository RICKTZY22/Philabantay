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

  if (!appts) return <Loading label="Pulling up your bookings…" />

  return (
    <div>
      <span className="eyebrow">{isBarber ? 'Your chair' : 'Your visits'}</span>
      <h1>Appointments</h1>

      {appts.length === 0 ? (
        <div className="rough-card center stack" style={{ marginTop: 20 }}>
          <p className="muted">Nothing booked yet.</p>
          <Link to="/barbers" className="btn btn-primary">Book a chair</Link>
        </div>
      ) : (
        <div className="appt-list">
          {appts.map((a) => {
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
                {active && (
                  <button className="btn btn-sm btn-danger" onClick={() => cancel(a.id)}>
                    Cancel
                  </button>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
