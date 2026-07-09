import { useCallback, useEffect, useState } from 'react'
import {
  WEEKDAY_LABELS,
  type AppointmentDetailed,
  type AvailabilityOverride,
  type AvailabilityRuleInput,
  type Weekday,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { Loading } from '../components/Loading'
import { DoodleIcon } from '../theme/DoodleDefs'
import { timeOfDay, dayLabel } from '../lib/format'
import { toISODate } from '../services/mock/availability'
import './DashboardPage.css'

interface DayRow {
  enabled: boolean
  start: string
  end: string
}

const emptyWeek = (): DayRow[] =>
  Array.from({ length: 7 }, () => ({ enabled: false, start: '10:00', end: '19:00' }))

export function DashboardPage() {
  const backend = useBackend()
  const { profile } = useAuth()
  const barberId = profile!.id

  const [shiftOn, setShiftOn] = useState(false)
  const [accepting, setAccepting] = useState(true)
  const [week, setWeek] = useState<DayRow[]>(emptyWeek())
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([])
  const [appts, setAppts] = useState<AppointmentDetailed[] | null>(null)
  const [savedNote, setSavedNote] = useState('')

  // Override form
  const [ovDate, setOvDate] = useState(toISODate(new Date()))
  const [ovReason, setOvReason] = useState('')

  const loadAll = useCallback(async () => {
    const [me, rules, ovs, mine] = await Promise.all([
      backend.barbers.get(barberId),
      backend.availability.getRules(barberId),
      backend.availability.getOverrides(barberId),
      backend.bookings.listMine(),
    ])
    if (me) {
      setShiftOn(me.shift_status === 'on')
      setAccepting(me.accepting_bookings)
    }
    const w = emptyWeek()
    for (const r of rules) {
      w[r.weekday] = { enabled: true, start: r.start_time, end: r.end_time }
    }
    setWeek(w)
    setOverrides(ovs)
    setAppts(mine)
  }, [backend, barberId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  async function toggleShift() {
    const next = !shiftOn
    setShiftOn(next)
    await backend.barbers.setShiftStatus(next)
  }

  async function toggleAccepting() {
    const next = !accepting
    setAccepting(next)
    await backend.barbers.setAcceptingBookings(next)
  }

  function updateDay(i: number, patch: Partial<DayRow>) {
    setWeek((w) => w.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }

  async function saveHours() {
    const rules: AvailabilityRuleInput[] = week
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d.enabled)
      .map(({ d, i }) => ({ weekday: i as Weekday, start_time: d.start, end_time: d.end }))
    await backend.availability.setRules(rules)
    setSavedNote('Weekly hours saved ✓')
    setTimeout(() => setSavedNote(''), 2500)
  }

  async function addDayOff() {
    const created = await backend.availability.addOverride({
      date: ovDate,
      is_available: false,
      reason: ovReason || null,
    })
    setOverrides((o) => [...o, created])
    setOvReason('')
  }

  async function removeOverride(id: string) {
    await backend.availability.removeOverride(id)
    setOverrides((o) => o.filter((x) => x.id !== id))
  }

  async function setStatus(id: string, status: AppointmentDetailed['status']) {
    await backend.bookings.setStatus(id, status)
    loadAll()
  }

  if (!appts) return <Loading label="Opening the shop…" />

  const upcoming = appts.filter((a) => a.status === 'pending' || a.status === 'confirmed')

  return (
    <div className="dash">
      <span className="eyebrow">Barber dashboard</span>
      <h1>Hey {profile!.full_name.split(' ')[0]}</h1>

      {/* Shift toggles */}
      <section className="rough-card dash-shift">
        <div>
          <h2 style={{ margin: 0 }}>
            {shiftOn ? 'You are on the chair' : 'You are off shift'}
          </h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Flip this when you start and finish for the day.
          </p>
        </div>
        <div className="row">
          <button className={shiftOn ? 'btn btn-green' : 'btn'} onClick={toggleShift}>
            {shiftOn ? 'On' : 'Off'} <DoodleIcon name={shiftOn ? 'check' : 'clock'} size={20} />
          </button>
          <label className="row accepting-toggle">
            <input type="checkbox" checked={accepting} onChange={toggleAccepting} />
            Accepting bookings
          </label>
        </div>
      </section>

      <div className="dash-grid">
        {/* Weekly hours */}
        <section className="rough-card">
          <h2><DoodleIcon name="clock" size={24} /> Weekly hours</h2>
          <div className="hours-editor">
            {week.map((d, i) => (
              <div className="hours-row" key={WEEKDAY_LABELS[i]}>
                <label className="row hours-day">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) => updateDay(i, { enabled: e.target.checked })}
                  />
                  {WEEKDAY_LABELS[i]}
                </label>
                <input
                  type="time"
                  value={d.start}
                  disabled={!d.enabled}
                  onChange={(e) => updateDay(i, { start: e.target.value })}
                />
                <span className="faint">to</span>
                <input
                  type="time"
                  value={d.end}
                  disabled={!d.enabled}
                  onChange={(e) => updateDay(i, { end: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={saveHours}>Save hours</button>
            {savedNote && <span className="booking-note">{savedNote}</span>}
          </div>
        </section>

        {/* Day-off overrides */}
        <section className="rough-card">
          <h2><DoodleIcon name="calendar" size={24} /> Days off</h2>
          <p className="muted" style={{ marginTop: 0 }}>Block out a specific date.</p>
          <div className="ov-form">
            <input type="date" value={ovDate} onChange={(e) => setOvDate(e.target.value)} />
            <input
              placeholder="Reason (optional)"
              value={ovReason}
              onChange={(e) => setOvReason(e.target.value)}
            />
            <button className="btn btn-sm" onClick={addDayOff}>
              <DoodleIcon name="plus" size={16} /> Add
            </button>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {overrides.length === 0 && <p className="faint">No days blocked.</p>}
            {overrides.map((o) => (
              <div className="ov-item" key={o.id}>
                <span>
                  <strong>{dayLabel(o.date + 'T00:00:00')}</strong>
                  {o.reason && <span className="muted"> · {o.reason}</span>}
                  <span className="pill pill-off" style={{ marginLeft: 8 }}>
                    {o.is_available ? 'Extra hours' : 'Day off'}
                  </span>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => removeOverride(o.id)}>
                  <DoodleIcon name="x" size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Upcoming bookings */}
      <section className="rough-card" style={{ marginTop: 22 }}>
        <h2><DoodleIcon name="chair" size={24} /> Upcoming in your chair</h2>
        {upcoming.length === 0 ? (
          <p className="faint">No upcoming bookings.</p>
        ) : (
          <div className="stack">
            {upcoming.map((a) => (
              <div className="dash-appt" key={a.id}>
                <div>
                  <strong>{dayLabel(a.starts_at)} · {timeOfDay(a.starts_at)}</strong>
                  <span className="muted"> — {a.service.name} for {a.customer.full_name}</span>
                </div>
                <div className="row">
                  {a.status === 'pending' && (
                    <button className="btn btn-sm btn-green" onClick={() => setStatus(a.id, 'confirmed')}>
                      Confirm
                    </button>
                  )}
                  <button className="btn btn-sm btn-blue" onClick={() => setStatus(a.id, 'completed')}>
                    Done
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => setStatus(a.id, 'no_show')}>
                    No-show
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
