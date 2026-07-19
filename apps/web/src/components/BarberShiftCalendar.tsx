import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type {
  AvailabilityOverride,
  AvailabilityRule,
  BarberAbsence,
  BarberEmployment,
  ShiftChangeRequest,
} from '@barbershop/shared'
import { localDateKey, parseLocalDateKey, todayLocalDateKey } from '../lib/date'
import { DoodleIcon } from '../theme/DoodleDefs'
import './BarberShiftCalendar.css'

/**
 * Month-grid ng shifts ng barber, dynamically generated mula sa weekly rules
 * at employment data (hindi static). Special markers:
 *  - happy face sa hire date at (kung meron) sa huling araw ng stint,
 *  - "Absent" label sa mga araw na may absence record,
 *  - request dot sa mga araw na may shift change request.
 * Pag pinindot ang araw, may maliit na card na nagpapakita ng detalye — at
 * sa schedule page, ng change-request form (owner ang nag-a-approve).
 */

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
const DAY_FORMATTER = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })

const REQUEST_LABEL: Record<ShiftChangeRequest['status'], string> = {
  pending: 'Pending sa owner',
  approved: 'Approved',
  declined: 'Declined',
}

const REQUEST_PILL: Record<ShiftChangeRequest['status'], string> = {
  pending: 'pill pill-yellow',
  approved: 'pill pill-on',
  declined: 'pill pill-off',
}

type ShiftBlock = Pick<AvailabilityRule, 'id' | 'start_time' | 'end_time'>

interface BarberShiftCalendarProps {
  rules: AvailabilityRule[]
  /** One-off availability changes override the weekly roster in the grid. */
  overrides?: AvailabilityOverride[]
  employment: BarberEmployment | null
  absences: BarberAbsence[]
  requests?: ShiftChangeRequest[]
  /** Kapag naka-set, may request form sa day card (schedule page mode). */
  onRequestChange?: (date: string, message: string) => Promise<void>
}

export function BarberShiftCalendar({
  rules,
  overrides = [],
  employment,
  absences,
  requests = [],
  onRequestChange,
}: BarberShiftCalendarProps) {
  const today = todayLocalDateKey()
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(today)
  const [draftMessage, setDraftMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const rulesByWeekday = useMemo(() => {
    const map = new Map<number, ShiftBlock[]>()
    rules.forEach((rule) => {
      const list = map.get(rule.weekday) ?? []
      list.push(rule)
      list.sort((left, right) => left.start_time.localeCompare(right.start_time))
      map.set(rule.weekday, list)
    })
    return map
  }, [rules])
  const absenceByDate = useMemo(
    () => new Map(absences.map((absence) => [absence.date, absence])),
    [absences],
  )
  const overridesByDate = useMemo(
    () => new Map(overrides.map((override) => [override.date, override])),
    [overrides],
  )
  const requestByDate = useMemo(() => {
    // The service returns newest first. Keep the first request for each date
    // so a new request after a declined/approved one does not show stale state.
    const byDate = new Map<string, ShiftChangeRequest>()
    requests.forEach((request) => {
      if (!byDate.has(request.date)) byDate.set(request.date, request)
    })
    return byDate
  }, [requests])

  const weeks = useMemo(() => {
    const first = new Date(monthCursor)
    const start = new Date(first)
    start.setDate(1 - first.getDay())
    const cells: Array<{ key: string; inMonth: boolean; day: number }> = []
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      cells.push({
        key: localDateKey(date),
        inMonth: date.getMonth() === monthCursor.getMonth(),
        day: date.getDate(),
      })
    }
    return cells
  }, [monthCursor])

  function moveMonth(offset: number) {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  function weekdayOf(dateKey: string): number {
    return parseLocalDateKey(dateKey)?.getDay() ?? -1
  }

  function dayShiftBlocks(dateKey: string): ShiftBlock[] {
    if (employment && dateKey < employment.hired_at) return []
    if (employment?.ended_at && dateKey > employment.ended_at) return []
    const override = overridesByDate.get(dateKey)
    if (override && !override.is_available) return []
    if (override?.start_time && override.end_time) {
      return [{
        id: override.id,
        start_time: override.start_time,
        end_time: override.end_time,
      }]
    }
    return rulesByWeekday.get(weekdayOf(dateKey)) ?? []
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault()
    if (!onRequestChange || !selectedDay || submitting) return
    setSubmitting(true)
    setFormMessage(null)
    try {
      await onRequestChange(selectedDay, draftMessage)
      setDraftMessage('')
      setFormMessage({ kind: 'ok', text: 'Naipasa ang request. Hihintayin ang desisyon ng owner.' })
    } catch (error) {
      setFormMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Hindi maipasa ang request.' })
    } finally {
      setSubmitting(false)
    }
  }

  const selected = selectedDay
    ? {
        key: selectedDay,
        blocks: dayShiftBlocks(selectedDay),
        absence: absenceByDate.get(selectedDay) ?? null,
        override: overridesByDate.get(selectedDay) ?? null,
        request: requestByDate.get(selectedDay) ?? null,
        isHiredDay: employment?.hired_at === selectedDay,
        isEndDay: employment?.ended_at === selectedDay,
        beforeHire: Boolean(employment && selectedDay < employment.hired_at),
      }
    : null

  return (
    <div className="bsc">
      <header className="bsc-head">
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Previous month" onClick={() => moveMonth(-1)}>←</button>
        <strong>{MONTH_FORMATTER.format(monthCursor)}</strong>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Next month" onClick={() => moveMonth(1)}>→</button>
      </header>

      <div className="bsc-grid" role="grid" aria-label="Shift calendar">
        {WEEKDAY_HEADERS.map((label) => <span className="bsc-weekday" key={label}>{label}</span>)}
        {weeks.map((cell) => {
          if (!cell.inMonth) return <span className="bsc-cell is-blank" key={cell.key} aria-hidden="true" />
          const blocks = dayShiftBlocks(cell.key)
          const absence = absenceByDate.get(cell.key)
          const override = overridesByDate.get(cell.key)
          const request = requestByDate.get(cell.key)
          const isMilestone = employment?.hired_at === cell.key || employment?.ended_at === cell.key
          const classes = [
            'bsc-cell',
            blocks.length > 0 ? 'is-scheduled' : '',
            absence ? 'is-absent' : '',
            override && !override.is_available ? 'is-unavailable' : '',
            cell.key === today ? 'is-today' : '',
            cell.key === selectedDay ? 'is-selected' : '',
            employment && cell.key < employment.hired_at ? 'is-prehire' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              type="button"
              className={classes}
              aria-pressed={cell.key === selectedDay}
              onClick={() => { setSelectedDay(cell.key); setFormMessage(null) }}
              key={cell.key}
            >
              <span className="bsc-daynum">{cell.day}</span>
            {isMilestone && <HappyFace />}
            {absence && <span className="bsc-absent-label">Absent</span>}
            {override && !override.is_available && <span className="bsc-unavailable-label">Off</span>}
            {request && <span className={`bsc-request-dot is-${request.status}`} aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="bsc-day-card barber-paper-stack-sm">
          <header>
            <strong>{DAY_FORMATTER.format(parseLocalDateKey(selected.key) ?? new Date())}</strong>
            {selected.absence
              ? <span className="pill pill-off">Absent</span>
              : selected.override && !selected.override.is_available
                ? <span className="pill pill-off">Unavailable</span>
              : selected.blocks.length > 0
                ? <span className="pill pill-on">Scheduled</span>
                : <span className="pill">Day off</span>}
          </header>

          {selected.isHiredDay && (
            <p className="bsc-milestone"><HappyFace /> Hired ka dito nitong araw na ito — welcome sa crew!</p>
          )}
          {selected.isEndDay && (
            <p className="bsc-milestone"><HappyFace /> Huling araw ng stint mo sa shop na ito.</p>
          )}
          {selected.beforeHire && <p className="muted">Hindi ka pa hired sa shop noong araw na ito.</p>}

          {selected.override && !selected.override.is_available && (
            <p className="muted">Naka-mark itong unavailable{selected.override.reason ? `: ${selected.override.reason}` : '.'}</p>
          )}

          {!selected.beforeHire && selected.blocks.map((block) => (
            <p className="bsc-shift-time" key={block.id}>
              <DoodleIcon name="clock" size={16} /> {formatWallTime(block.start_time)} – {formatWallTime(block.end_time)}
            </p>
          ))}
          {!selected.beforeHire && selected.blocks.length === 0 && !selected.isHiredDay && !selected.override?.is_available && (
            <p className="muted">Walang naka-schedule na shift.</p>
          )}
          {selected.absence?.reason && <p className="muted">Dahilan: {selected.absence.reason}</p>}

          {selected.request && (
            <div className="bsc-request-status">
              <span className={REQUEST_PILL[selected.request.status]}>{REQUEST_LABEL[selected.request.status]}</span>
              <span className="muted">“{selected.request.message}”</span>
            </div>
          )}

          {onRequestChange && !selected.request && selected.key >= today && !selected.beforeHire && !selected.absence && selected.blocks.length > 0 && (
            <form className="bsc-request-form" onSubmit={submitRequest}>
              <label htmlFor={`bsc-request-${selected.key}`}>Request a change para sa shift na ito</label>
              <div>
                <input
                  id={`bsc-request-${selected.key}`}
                  value={draftMessage}
                  maxLength={300}
                  placeholder="Hal. pa-late start po, 1 PM na lang…"
                  onChange={(event) => setDraftMessage(event.target.value)}
                />
                <button className="btn btn-sm btn-primary" disabled={submitting || draftMessage.trim().length < 3}>
                  {submitting ? 'Sending…' : 'Send request'}
                </button>
              </div>
              <small className="muted">Hindi mo direktang mababago ang shift — ang owner ang mag-a-approve.</small>
            </form>
          )}
          {formMessage && (
            <p className={formMessage.kind === 'ok' ? 'bsc-form-ok' : 'form-error'} role="status">{formMessage.text}</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Maliit na doodle happy face para sa employment milestones. */
function HappyFace(): ReactNode {
  return (
    <svg className="bsc-happy" viewBox="0 0 24 24" aria-label="Employment milestone" role="img">
      <circle cx="12" cy="12" r="10" />
      <circle className="bsc-happy-eye" cx="8.5" cy="10" r="1.4" />
      <circle className="bsc-happy-eye" cx="15.5" cy="10" r="1.4" />
      <path className="bsc-happy-smile" d="M7.5 14 Q12 19 16.5 14" />
    </svg>
  )
}

function formatWallTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2026, 0, 1, hours, minutes))
}
