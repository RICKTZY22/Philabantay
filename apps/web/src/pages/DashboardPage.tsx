import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DataError,
  summarizeBarberAttendance,
  WEEKDAY_LABELS,
  type AvailabilityOverride,
  type AvailabilityRule,
  type BarberAbsence,
  type BarberEmployment,
  type ShiftChangeRequestInput,
  type ShiftChangeRequest,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { BarberShiftCalendar } from '../components/BarberShiftCalendar'
import { Loading } from '../components/Loading'
import { DoodleIcon } from '../theme/DoodleDefs'
import { dayLabel } from '../lib/format'
import './DashboardPage.css'

/**
 * Present/absent record ng barber — kasalukuyang buwan at buong tenure sa
 * kasalukuyang shop. Derived via the shared attendance rule; naka-scope sa
 * active employment kaya nagre-reset kapag lumipat ng shop.
 */
function AttendanceCard({ employment, rules, absences }: {
  employment: BarberEmployment
  rules: AvailabilityRule[]
  absences: BarberAbsence[]
}) {
  const attendance = summarizeBarberAttendance(employment, rules, absences)
  const rate = attendance.tenure.scheduled > 0
    ? Math.round((attendance.tenure.present / attendance.tenure.scheduled) * 100)
    : 100
  return (
    <section className="schedule-paper-card schedule-attendance-card barber-paper-stack">
      <div className="schedule-card-heading">
        <div><span className="eyebrow">ATTENDANCE</span><h2>Presence record</h2></div>
        <DoodleIcon name="check" size={25} />
      </div>
      <p className="muted">Simula nang ma-hire ka noong {dayLabel(`${employment.hired_at}T00:00:00`)}.</p>
      <div className="schedule-attendance-grid">
        <article>
          <span className="eyebrow">THIS MONTH</span>
          <strong>{attendance.month.present}<small>/{attendance.month.scheduled}</small></strong>
          <span>shifts present</span>
          <em>{attendance.month.absent} absent</em>
        </article>
        <article>
          <span className="eyebrow">WHOLE TENURE</span>
          <strong>{attendance.tenure.present}<small>/{attendance.tenure.scheduled}</small></strong>
          <span>shifts present</span>
          <em>{attendance.tenure.absent} absent</em>
        </article>
      </div>
      <p className="schedule-attendance-rate">
        <DoodleIcon name="star" size={17} /> {rate}% attendance sa shop na ito
      </p>
      <small className="muted">
        Naka-scope sa kasalukuyang shop — kapag lumipat ka, magsisimula ulit sa zero ang record.
      </small>
    </section>
  )
}

function formatWallTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2026, 0, 1, hours, minutes))
}

export function DashboardPage() {
  const backend = useBackend()
  const { profile } = useAuth()
  const nowEpochMs = useCurrentTime()
  const barberId = profile!.id
  const [loaded, setLoaded] = useState(false)
  const [shiftOn, setShiftOn] = useState(false)
  const [accepting, setAccepting] = useState(true)
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([])
  const [employment, setEmployment] = useState<BarberEmployment | null>(null)
  const [absences, setAbsences] = useState<BarberAbsence[]>([])
  const [shiftRequests, setShiftRequests] = useState<ShiftChangeRequest[]>([])
  const [message, setMessage] = useState('')
  const [busyAction, setBusyAction] = useState('')

  const loadAll = useCallback(async () => {
    try {
      const [me, loadedRules, exceptions, employmentRecord, absenceList, requestList] = await Promise.all([
        backend.barbers.get(barberId),
        backend.availability.getRules(barberId),
        backend.availability.getMyOverrides(),
        backend.employment.getMyEmployment(),
        backend.employment.listMyAbsences(),
        backend.employment.listMyShiftChangeRequests(),
      ])
      if (me) {
        setShiftOn(me.shift_status === 'on')
        setAccepting(me.accepting_bookings)
      }
      setRules(loadedRules)
      setOverrides(exceptions)
      setEmployment(employmentRecord)
      setAbsences(absenceList)
      setShiftRequests(requestList)
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi ma-load ang schedule.')
    } finally {
      setLoaded(true)
    }
  }, [backend, barberId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Start lang ang manual action; ang pagtatapos ng shift ay system-driven na
  // (scheduled end time), kaya walang "End shift" button dito.
  async function startShift() {
    setBusyAction('shift')
    setMessage('')
    try {
      await backend.barbers.setShiftStatus(true)
      setShiftOn(true)
      setMessage('Naka-on shift ka na — awtomatikong magtatapos ayon sa schedule.')
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi ma-update ang shift.')
    } finally {
      setBusyAction('')
    }
  }

  async function toggleAccepting() {
    const next = !accepting
    setBusyAction('accepting')
    setMessage('')
    try {
      await backend.barbers.setAcceptingBookings(next)
      setAccepting(next)
      setMessage(next ? 'Visible ka na ulit bilang available sa favorites.' : 'Naka-pause ang new bookings mo.')
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi ma-update ang booking status.')
    } finally {
      setBusyAction('')
    }
  }

  async function submitShiftChange(input: Omit<ShiftChangeRequestInput, 'idempotency_key'>) {
    await backend.employment.requestShiftChange({
      ...input,
      idempotency_key: crypto.randomUUID(),
    })
    setShiftRequests(await backend.employment.listMyShiftChangeRequests())
  }

  if (!loaded) return <Loading label="Opening your schedule..." />

  // "On the chair" = manually started AND nasa loob ng scheduled hours. Ang
  // pag-expire ay derived sa oras (walang manual end); the same rule gates
  // availableNow/shop status sa backend.
  const now = new Date(nowEpochMs)
  const nowWallClock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const activeRule = rules.find((rule) => (
    rule.weekday === now.getDay() && rule.start_time <= nowWallClock && nowWallClock < rule.end_time
  )) ?? null
  const onChairNow = shiftOn && Boolean(activeRule)

  return (
    <div className="barber-schedule-page">
      <header className="schedule-page-hero barber-paper-stack">
        <div>
          <span className="eyebrow">YOUR ROSTER</span>
          <h1>Schedule</h1>
          <p>View your owner-assigned roster and request a one-day change.</p>
        </div>
        <Link className="btn" to="/dashboard"><DoodleIcon name="home" size={18} /> Barber home</Link>
      </header>

      {message && <div className="schedule-message" role="status">{message}</div>}

      <section className="schedule-live-card barber-paper-stack">
        <div className={`schedule-live-icon${onChairNow ? ' is-on' : ''}`}><DoodleIcon name="chair" size={30} /></div>
        <div>
          <span className="eyebrow">RIGHT NOW</span>
          <h2>{onChairNow ? 'You are on the chair' : shiftOn ? 'Standby — labas ng shift hours' : 'You are off shift'}</h2>
          <p>
            {onChairNow && activeRule
              ? `Awtomatikong magtatapos ang shift sa ${formatWallTime(activeRule.end_time)} — system na ang bahala, walang manual na early end.`
              : shiftOn
                ? 'Naka-standby ka; awtomatikong magbubukas ang chair mo sa susunod na scheduled shift.'
                : 'Customers who favorited you can see this live availability state.'}
          </p>
        </div>
        <div className="schedule-live-actions">
          {!shiftOn && (
            <button type="button" className="btn" disabled={Boolean(busyAction)} onClick={() => void startShift()}>
              {busyAction === 'shift' ? 'Updating...' : 'Start shift'}
            </button>
          )}
          <label className="schedule-accepting-toggle">
            <input type="checkbox" checked={accepting} disabled={Boolean(busyAction)} onChange={() => void toggleAccepting()} />
            <span><strong>Accept new bookings</strong><small>Shown on customer favorites</small></span>
          </label>
        </div>
      </section>

      <div className="schedule-mid-grid">
        <section className="schedule-paper-card schedule-calendar-card barber-paper-stack">
          <div className="schedule-card-heading">
            <div><span className="eyebrow">SHIFT CALENDAR</span><h2>Your month at the shop</h2></div>
            <DoodleIcon name="calendar" size={25} />
          </div>
          <p className="muted schedule-calendar-hint">
            Pindutin ang araw para makita ang shift. Hindi mo ito direktang mababago —
            mag-send ng change request at ang owner ang magdedesisyon.
          </p>
          <BarberShiftCalendar
            rules={rules}
            overrides={overrides}
            employment={employment}
            absences={absences}
            requests={shiftRequests}
            onRequestChange={submitShiftChange}
          />
        </section>

        {employment && (
          <AttendanceCard employment={employment} rules={rules} absences={absences} />
        )}
      </div>

      <div className="schedule-editor-grid">
        <section className="schedule-paper-card barber-paper-stack">
          <div className="schedule-card-heading"><div><span className="eyebrow">WEEKLY PATTERN</span><h2>Assigned shifts</h2></div><DoodleIcon name="clock" size={25} /></div>
          <p className="muted">Read-only roster from your shop owner.</p>
          <ul className="schedule-readonly-list">
            {rules.length === 0 && <li>Wala pang assigned weekly shift.</li>}
            {[...rules].sort((left, right) => left.weekday - right.weekday).map((rule) => (
              <li key={rule.id}>
                <strong>{WEEKDAY_LABELS[rule.weekday]}</strong>
                <span>{formatWallTime(rule.start_time)} – {formatWallTime(rule.end_time)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="schedule-paper-card schedule-days-off barber-paper-stack">
          <div className="schedule-card-heading"><div><span className="eyebrow">EXCEPTIONS</span><h2>Owner-approved changes</h2></div><DoodleIcon name="calendar" size={25} /></div>
          <p className="muted">Use the calendar above to request time off or different hours.</p>
          <div className="schedule-override-list">
            {overrides.length === 0 && <div className="schedule-empty"><DoodleIcon name="check" size={22} /> No schedule exceptions.</div>}
            {overrides.map((override) => (
              <div className="ov-item" key={override.id}>
                <span>
                  <strong>{dayLabel(`${override.date}T00:00:00`)}</strong>
                  <small>
                    {override.is_available && override.start_time && override.end_time
                      ? `${formatWallTime(override.start_time)} – ${formatWallTime(override.end_time)}`
                      : 'Unavailable'}
                    {override.reason ? ` · ${override.reason}` : ''}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
