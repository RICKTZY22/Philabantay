import { useState, type FormEvent } from 'react'
import {
  DataError,
  summarizeBarberAttendance,
  WEEKDAY_LABELS,
  type AvailabilityRuleInput,
  type ShopStaffMember,
  type Weekday,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { dayLabel } from '../lib/format'
import { Avatar } from './Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import './OwnerStaffPanel.css'

/**
 * Owner staff tools: per-barber weekly shifts (directly editable ng owner),
 * attendance graph (month + tenure), staff notes, at approve/decline ng mga
 * shift change requests na galing sa barbers.
 */

interface DayRow {
  enabled: boolean
  start: string
  end: string
}

function weekFromRules(member: ShopStaffMember): DayRow[] {
  const week: DayRow[] = Array.from({ length: 7 }, () => ({ enabled: false, start: '10:00', end: '19:00' }))
  member.rules.forEach((rule) => {
    week[rule.weekday] = { enabled: true, start: rule.start_time, end: rule.end_time }
  })
  return week
}

export function OwnerStaffPanel({ staff, onRefresh }: {
  staff: ShopStaffMember[]
  onRefresh: () => void
}) {
  if (staff.length === 0) {
    return (
      <section className="owner-paper-card owner-section-card">
        <p className="muted">Wala pang roster members. I-share ang join code para makapag-hire.</p>
      </section>
    )
  }
  return (
    <div className="owner-staff-list">
      {staff.map((member) => (
        <StaffCard key={member.barber.id} member={member} onRefresh={onRefresh} />
      ))}
    </div>
  )
}

function StaffCard({ member, onRefresh }: { member: ShopStaffMember; onRefresh: () => void }) {
  const backend = useBackend()
  const [week, setWeek] = useState<DayRow[]>(() => weekFromRules(member))
  const [editingShifts, setEditingShifts] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const attendance = summarizeBarberAttendance(member.employment, member.rules, member.absences)
  const pendingRequests = member.shiftChangeRequests.filter((request) => request.status === 'pending')

  function updateDay(index: number, patch: Partial<DayRow>) {
    setWeek((current) => current.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day))
  }

  async function saveShifts() {
    const rules: AvailabilityRuleInput[] = week
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => day.enabled)
      .map(({ day, index }) => ({ weekday: index as Weekday, start_time: day.start, end_time: day.end }))
    setBusy('shifts')
    setMessage(null)
    try {
      await backend.employment.setBarberRules(member.barber.id, rules)
      setMessage({ kind: 'ok', text: 'Na-update ang shifts. Kita agad ito ng barber.' })
      setEditingShifts(false)
      onRefresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi ma-save ang shifts.' })
    } finally {
      setBusy('')
    }
  }

  async function resolveRequest(requestId: string, status: 'approved' | 'declined') {
    setBusy(requestId)
    setMessage(null)
    try {
      await backend.employment.resolveShiftChangeRequest(requestId, status)
      setMessage({ kind: 'ok', text: status === 'approved' ? 'Request approved — i-edit ang shift kung kailangan.' : 'Request declined.' })
      onRefresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi ma-resolve ang request.' })
    } finally {
      setBusy('')
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault()
    setBusy('note')
    setMessage(null)
    try {
      await backend.employment.addStaffNote({ barber_id: member.barber.id, body: noteDraft })
      setNoteDraft('')
      setMessage({ kind: 'ok', text: 'Note saved.' })
      onRefresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi ma-save ang note.' })
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="owner-paper-card owner-staff-card" aria-label={`Staff tools para kay ${member.barber.profile.full_name}`}>
      <header className="owner-staff-head">
        <Avatar name={member.barber.profile.full_name} size={46} />
        <div>
          <strong>{member.barber.profile.full_name}</strong>
          <span className="muted">Hired {dayLabel(`${member.employment.hired_at}T00:00:00`)}</span>
        </div>
        {pendingRequests.length > 0 && (
          <span className="pill pill-yellow">{pendingRequests.length} pending request{pendingRequests.length === 1 ? '' : 's'}</span>
        )}
      </header>

      <div className="owner-staff-grid">
        {/* ---- Shifts (direktang editable) ---- */}
        <div className="owner-staff-block">
          <div className="owner-staff-block-head">
            <span className="owner-card-kicker">weekly shifts</span>
            {!editingShifts ? (
              <button type="button" className="btn btn-sm" onClick={() => { setWeek(weekFromRules(member)); setEditingShifts(true) }}>
                <DoodleIcon name="gear" size={15} /> Edit shifts
              </button>
            ) : (
              <div className="owner-staff-edit-actions">
                <button type="button" className="btn btn-sm btn-green" disabled={busy === 'shifts'} onClick={() => void saveShifts()}>
                  {busy === 'shifts' ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy === 'shifts'} onClick={() => { setEditingShifts(false); setWeek(weekFromRules(member)) }}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {!editingShifts ? (
            <ul className="owner-shift-summary">
              {member.rules.length === 0 && <li className="muted">Walang assigned shift.</li>}
              {[...member.rules].sort((left, right) => left.weekday - right.weekday).map((rule) => (
                <li key={rule.id}>
                  <strong>{WEEKDAY_LABELS[rule.weekday].slice(0, 3)}</strong>
                  {formatWallTime(rule.start_time)} – {formatWallTime(rule.end_time)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="owner-shift-editor">
              {week.map((day, index) => (
                <div className={`owner-shift-editor-row${day.enabled ? ' is-enabled' : ''}`} key={WEEKDAY_LABELS[index]}>
                  <label>
                    <input type="checkbox" checked={day.enabled} onChange={(event) => updateDay(index, { enabled: event.target.checked })} />
                    <span>{WEEKDAY_LABELS[index].slice(0, 3)}</span>
                  </label>
                  <input type="time" value={day.start} disabled={!day.enabled} aria-label={`${WEEKDAY_LABELS[index]} start`} onChange={(event) => updateDay(index, { start: event.target.value })} />
                  <span className="muted">to</span>
                  <input type="time" value={day.end} disabled={!day.enabled} aria-label={`${WEEKDAY_LABELS[index]} end`} onChange={(event) => updateDay(index, { end: event.target.value })} />
                </div>
              ))}
            </div>
          )}

          {pendingRequests.length > 0 && (
            <div className="owner-request-list">
              <span className="owner-card-kicker">change requests</span>
              {pendingRequests.map((request) => (
                <div className="owner-request-row" key={request.id}>
                  <div>
                    <strong>{dayLabel(`${request.date}T00:00:00`)}</strong>
                    <span className="muted">“{request.message}”</span>
                  </div>
                  <div className="owner-request-actions">
                    <button type="button" className="btn btn-sm btn-green" disabled={busy === request.id} onClick={() => void resolveRequest(request.id, 'approved')}>Approve</button>
                    <button type="button" className="btn btn-sm" disabled={busy === request.id} onClick={() => void resolveRequest(request.id, 'declined')}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Attendance graph ---- */}
        <div className="owner-staff-block">
          <span className="owner-card-kicker">attendance</span>
          <AttendanceBars label="This month" present={attendance.month.present} absent={attendance.month.absent} scheduled={attendance.month.scheduled} />
          <AttendanceBars label="Whole tenure" present={attendance.tenure.present} absent={attendance.tenure.absent} scheduled={attendance.tenure.scheduled} />
          <small className="muted">Present = scheduled na araw na walang absence record.</small>
        </div>

        {/* ---- Notes ---- */}
        <div className="owner-staff-block">
          <span className="owner-card-kicker">staff notes</span>
          <div className="owner-note-list">
            {member.notes.length === 0 && <p className="muted">Wala pang notes.</p>}
            {member.notes.map((note) => (
              <div className="owner-note" key={note.id}>
                <p>{note.body}</p>
                <small>{note.author_id === member.barber.id ? member.barber.profile.full_name : 'Owner'} · {dayLabel(note.created_at)}</small>
              </div>
            ))}
          </div>
          <form className="owner-note-form" onSubmit={addNote}>
            <input
              value={noteDraft}
              maxLength={500}
              placeholder="Magdagdag ng note tungkol sa staff…"
              aria-label={`Note para kay ${member.barber.profile.full_name}`}
              onChange={(event) => setNoteDraft(event.target.value)}
            />
            <button className="btn btn-sm" disabled={busy === 'note' || noteDraft.trim().length < 3}>
              {busy === 'note' ? 'Saving…' : 'Add'}
            </button>
          </form>
        </div>
      </div>

      {message && (
        <p className={message.kind === 'ok' ? 'owner-staff-ok' : 'form-error'} role="status">{message.text}</p>
      )}
    </section>
  )
}

/** Present-vs-absent proportion bar with counts. */
function AttendanceBars({ label, present, absent, scheduled }: {
  label: string
  present: number
  absent: number
  scheduled: number
}) {
  const presentPct = scheduled > 0 ? (present / scheduled) * 100 : 0
  return (
    <div className="owner-attendance-row">
      <div className="owner-attendance-meta">
        <strong>{label}</strong>
        <span>{present} present · <em>{absent} absent</em></span>
      </div>
      <div className="owner-attendance-bar" role="img" aria-label={`${label}: ${present} present sa ${scheduled} scheduled, ${absent} absent`}>
        <i style={{ width: `${presentPct}%` }} />
      </div>
    </div>
  )
}

function formatWallTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2026, 0, 1, hours, minutes))
}
