import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DataError,
  summarizeBarberAttendance,
  WEEKDAY_LABELS,
  type AvailabilityOverride,
  type AvailabilityRule,
  type AvailabilityRuleInput,
  type BarberAbsence,
  type BarberEmployment,
  type ShiftChangeRequest,
  type Weekday,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { BarberShiftCalendar } from '../components/BarberShiftCalendar'
import { Loading } from '../components/Loading'
import { DoodleIcon } from '../theme/DoodleDefs'
import { dayLabel } from '../lib/format'
import { todayLocalDateKey } from '../lib/date'
import './DashboardPage.css'

interface DayRow {
  enabled: boolean
  start: string
  end: string
}

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

const emptyWeek = (): DayRow[] =>
  Array.from({ length: 7 }, () => ({ enabled: false, start: '10:00', end: '19:00' }))

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
  const [week, setWeek] = useState<DayRow[]>(emptyWeek())
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([])
  const [employment, setEmployment] = useState<BarberEmployment | null>(null)
  const [absences, setAbsences] = useState<BarberAbsence[]>([])
  const [shiftRequests, setShiftRequests] = useState<ShiftChangeRequest[]>([])
  const [message, setMessage] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [ovDate, setOvDate] = useState(todayLocalDateKey)
  const [ovReason, setOvReason] = useState('')

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
      const nextWeek = emptyWeek()
      loadedRules.forEach((rule) => {
        nextWeek[rule.weekday] = { enabled: true, start: rule.start_time, end: rule.end_time }
      })
      setWeek(nextWeek)
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

  function updateDay(index: number, patch: Partial<DayRow>) {
    setWeek((current) => current.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day))
  }

  async function saveHours() {
    const rules: AvailabilityRuleInput[] = week
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => day.enabled)
      .map(({ day, index }) => ({ weekday: index as Weekday, start_time: day.start, end_time: day.end }))
    setBusyAction('hours')
    setMessage('')
    try {
      setRules(await backend.availability.setRules(rules))
      setMessage('Weekly shift availability saved.')
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi ma-save ang weekly shifts.')
    } finally {
      setBusyAction('')
    }
  }

  async function submitShiftChange(date: string, requestMessage: string) {
    await backend.employment.requestShiftChange({ date, message: requestMessage })
    setShiftRequests(await backend.employment.listMyShiftChangeRequests())
  }

  async function addDayOff() {
    setBusyAction('override')
    setMessage('')
    try {
      const created = await backend.availability.addOverride({
        date: ovDate,
        is_available: false,
        reason: ovReason || null,
      })
      setOverrides((current) => [...current, created])
      setOvReason('')
      setMessage('Unavailable date added.')
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi maidagdag ang unavailable date.')
    } finally {
      setBusyAction('')
    }
  }

  async function removeOverride(id: string) {
    setBusyAction(id)
    setMessage('')
    try {
      await backend.availability.removeOverride(id)
      setOverrides((current) => current.filter((override) => override.id !== id))
      setMessage('Unavailable date removed.')
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi maalis ang date.')
    } finally {
      setBusyAction('')
    }
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
          <p>Piliin ang regular shifts at markahan ang dates na hindi ka available.</p>
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
          <div className="schedule-card-heading"><div><span className="eyebrow">WEEKLY PATTERN</span><h2>Available shifts</h2></div><DoodleIcon name="clock" size={25} /></div>
          <div className="hours-editor">
            {week.map((day, index) => (
              <div className={`hours-row${day.enabled ? ' is-enabled' : ''}`} key={WEEKDAY_LABELS[index]}>
                <label className="hours-day">
                  <input type="checkbox" checked={day.enabled} onChange={(event) => updateDay(index, { enabled: event.target.checked })} />
                  <span>{WEEKDAY_LABELS[index]}</span>
                </label>
                <input type="time" value={day.start} disabled={!day.enabled} onChange={(event) => updateDay(index, { start: event.target.value })} />
                <span className="faint">to</span>
                <input type="time" value={day.end} disabled={!day.enabled} onChange={(event) => updateDay(index, { end: event.target.value })} />
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-primary schedule-save" disabled={Boolean(busyAction)} onClick={() => void saveHours()}>
            {busyAction === 'hours' ? 'Saving...' : 'Save weekly shifts'}
          </button>
        </section>

        <section className="schedule-paper-card schedule-days-off barber-paper-stack">
          <div className="schedule-card-heading"><div><span className="eyebrow">EXCEPTIONS</span><h2>Unavailable dates</h2></div><DoodleIcon name="calendar" size={25} /></div>
          <p className="muted">Day off, leave, or any one-time schedule change.</p>
          <div className="ov-form">
            <input aria-label="Unavailable date" type="date" value={ovDate} onChange={(event) => setOvDate(event.target.value)} />
            <input aria-label="Reason" placeholder="Reason (private, optional)" value={ovReason} maxLength={120} onChange={(event) => setOvReason(event.target.value)} />
            <button type="button" className="btn btn-sm" disabled={Boolean(busyAction)} onClick={() => void addDayOff()}>
              {busyAction === 'override' ? 'Adding...' : 'Add date'}
            </button>
          </div>
          <div className="schedule-override-list">
            {overrides.length === 0 && <div className="schedule-empty"><DoodleIcon name="check" size={22} /> No blocked dates.</div>}
            {overrides.map((override) => (
              <div className="ov-item" key={override.id}>
                <span><strong>{dayLabel(`${override.date}T00:00:00`)}</strong>{override.reason && <small>{override.reason}</small>}</span>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${override.date}`} disabled={Boolean(busyAction)} onClick={() => void removeOverride(override.id)}>
                  {busyAction === override.id ? '...' : <DoodleIcon name="x" size={16} />}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
