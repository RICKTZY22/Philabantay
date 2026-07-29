import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  DataError,
  summarizeBarberAttendance,
  WEEKDAY_LABELS,
  type AvailabilityRuleInput,
  type OwnerQualificationWorkspace,
  type ServiceProviderQualification,
  type ShopStaffMember,
  type StaffSchedule,
  type Weekday,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { dayLabel } from '../lib/format'
import { todayLocalDateKey } from '../lib/date'
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

function weekFromRules(rules: ShopStaffMember['rules']): DayRow[] {
  const week: DayRow[] = Array.from({ length: 7 }, () => ({ enabled: false, start: '10:00', end: '19:00' }))
  rules.forEach((rule) => {
    week[rule.weekday] = { enabled: true, start: rule.start_time, end: rule.end_time }
  })
  return week
}

export function OwnerStaffPanel({ staff, onRefresh }: {
  staff: ShopStaffMember[]
  onRefresh: () => void
}) {
  const backend = useBackend()
  const [qualifications, setQualifications] = useState<OwnerQualificationWorkspace | null>(null)
  const [qualificationError, setQualificationError] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)

  useEffect(() => {
    let active = true
    setQualificationError('')
    backend.qualifications.getOwnerWorkspace().then((workspace) => {
      if (active) setQualifications(workspace)
    }).catch((error: unknown) => {
      if (active) {
        setQualificationError(error instanceof DataError ? error.message : 'Hindi ma-load ang provider qualifications.')
      }
    })
    return () => { active = false }
  }, [backend, loadVersion])

  function refreshQualifications() {
    setLoadVersion((value) => value + 1)
  }

  return (
    <div className="owner-staff-workspace">
      <ProviderQualificationsPanel
        workspace={qualifications}
        error={qualificationError}
        onRefresh={refreshQualifications}
      />
      {staff.length === 0 ? (
        <section className="owner-paper-card owner-section-card">
          <p className="muted">Wala pang roster members. Owner-provider setup is still available above.</p>
        </section>
      ) : (
        <div className="owner-staff-list">
          {staff.map((member) => (
            <StaffCard key={member.barber.id} member={member} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProviderQualificationsPanel({
  workspace,
  error,
  onRefresh,
}: {
  workspace: OwnerQualificationWorkspace | null
  error: string
  onRefresh: () => void
}) {
  const backend = useBackend()
  const [active, setActive] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!workspace) return
    setActive(workspace.owner_provider.active)
    setAccepting(workspace.owner_provider.accepting_bookings)
  }, [workspace])

  async function saveOwnerCapability(event: FormEvent) {
    event.preventDefault()
    if (!workspace) return
    setBusy('owner-capability')
    setMessage('')
    try {
      await backend.qualifications.updateOwnerCapability({
        expected_version: workspace.owner_provider.version,
        active,
        accepting_bookings: active && accepting,
        reason,
        command_id: crypto.randomUUID(),
      })
      setReason('')
      setMessage('Owner provider settings saved.')
      onRefresh()
    } catch (cause) {
      setMessage(cause instanceof DataError ? cause.message : 'Hindi ma-save ang owner provider settings.')
      if (cause instanceof DataError && cause.code === 'conflict') onRefresh()
    } finally {
      setBusy('')
    }
  }

  async function resolveRequest(requestId: string, version: number, decision: 'approve' | 'decline') {
    setBusy(requestId)
    setMessage('')
    try {
      await backend.qualifications.resolveRequest(requestId, decision, {
        expected_version: version,
        reason: decision === 'approve'
          ? 'Owner approved the requested service qualification.'
          : 'Owner declined the requested service qualification.',
      })
      setMessage(decision === 'approve' ? 'Qualification request approved.' : 'Qualification request declined.')
      onRefresh()
    } catch (cause) {
      setMessage(cause instanceof DataError ? cause.message : 'Hindi ma-resolve ang qualification request.')
      onRefresh()
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="owner-paper-card owner-provider-panel" aria-labelledby="provider-capabilities-title">
      <header>
        <div>
          <span className="owner-card-kicker">provider capabilities</span>
          <h2 id="provider-capabilities-title">Who can perform each service</h2>
          <p className="muted">Your account stays a shop owner. Provider access applies only to this shop, and barbers cannot grant their own qualifications.</p>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {!workspace && !error && <p className="muted" role="status">Loading provider settings…</p>}

      {workspace && (
        <>
          <form className="owner-provider-toggle" onSubmit={saveOwnerCapability}>
            <label>
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => {
                  setActive(event.target.checked)
                  if (!event.target.checked) setAccepting(false)
                }}
              />
              <span><strong>I also perform services</strong><small>Creates a shop-scoped provider capability without changing your role.</small></span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={accepting}
                disabled={!active}
                onChange={(event) => setAccepting(event.target.checked)}
              />
              <span><strong>Accepting bookings</strong><small>Schedule rules will be managed in P2-06.</small></span>
            </label>
            <label className="owner-provider-reason">
              <span>Change reason</span>
              <input
                value={reason}
                maxLength={500}
                placeholder="Why are these provider settings changing?"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-sm btn-green"
              disabled={busy === 'owner-capability' || reason.trim().length < 3}
            >
              {busy === 'owner-capability' ? 'Saving…' : 'Save owner provider settings'}
            </button>
          </form>

          {workspace.requests.some((request) => request.status === 'pending') && (
            <div className="owner-qualification-requests">
              <span className="owner-card-kicker">pending barber requests</span>
              {workspace.requests.filter((request) => request.status === 'pending').map((request) => (
                <div key={request.id} className="owner-qualification-request">
                  <div>
                    <strong>{request.barber?.full_name ?? 'Barber'} · {request.service.name}</strong>
                    {request.message && <span className="muted">{request.message}</span>}
                  </div>
                  <div>
                    <button type="button" className="btn btn-sm btn-green" disabled={busy === request.id} onClick={() => void resolveRequest(request.id, request.version, 'approve')}>Approve</button>
                    <button type="button" className="btn btn-sm" disabled={busy === request.id} onClick={() => void resolveRequest(request.id, request.version, 'decline')}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="owner-provider-list">
            {workspace.providers.map((provider) => (
              <ProviderQualificationCard
                key={provider.provider_user_id}
                provider={provider}
                services={workspace.services}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </>
      )}
      {message && <p role="status" className={message.includes('saved') || message.includes('approved') || message.includes('declined') ? 'owner-staff-ok' : 'form-error'}>{message}</p>}
    </section>
  )
}

function ProviderQualificationCard({
  provider,
  services,
  onRefresh,
}: {
  provider: ServiceProviderQualification
  services: OwnerQualificationWorkspace['services']
  onRefresh: () => void
}) {
  const backend = useBackend()
  const [selected, setSelected] = useState(() => new Set(provider.qualified_service_ids))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setSelected(new Set(provider.qualified_service_ids))
  }, [provider.qualified_service_ids])

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await backend.qualifications.setProviderQualifications({
        provider_user_id: provider.provider_user_id,
        expected_version: provider.qualification_version,
        service_ids: [...selected],
        reason,
        command_id: crypto.randomUUID(),
      })
      setReason('')
      setMessage('Qualifications saved.')
      onRefresh()
    } catch (cause) {
      setMessage(cause instanceof DataError ? cause.message : 'Hindi ma-save ang qualifications.')
      if (cause instanceof DataError && cause.code === 'conflict') onRefresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="owner-provider-card" onSubmit={save}>
      <header>
        <div>
          <strong>{provider.profile.full_name}</strong>
          <span className="muted">{provider.provider_kind === 'owner' ? 'Owner provider' : 'Employed barber'}</span>
        </div>
        <span className={`pill ${provider.eligible ? 'pill-green' : 'pill-yellow'}`}>
          {provider.eligible ? 'Eligible' : 'Capability off'}
        </span>
      </header>
      <fieldset disabled={!provider.eligible || busy}>
        <legend>Qualified services</legend>
        {services.length === 0 && <p className="muted">Add a service in Shop Setup first.</p>}
        {services.map((service) => (
          <label key={service.id} className={!service.active ? 'is-retired' : ''}>
            <input
              type="checkbox"
              checked={selected.has(service.id)}
              onChange={(event) => {
                setSelected((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(service.id)
                  else next.delete(service.id)
                  return next
                })
              }}
            />
            <span>{service.name}{!service.active ? ' (retired)' : ''}</span>
          </label>
        ))}
      </fieldset>
      <label className="owner-provider-reason">
        <span>Qualification reason</span>
        <input
          value={reason}
          maxLength={500}
          disabled={!provider.eligible || busy}
          placeholder="Reason for granting or removing services"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button className="btn btn-sm" disabled={!provider.eligible || busy || reason.trim().length < 3}>
        {busy ? 'Saving…' : 'Save qualifications'}
      </button>
      {message && <small role="status" className={message === 'Qualifications saved.' ? 'owner-staff-ok' : 'form-error'}>{message}</small>}
    </form>
  )
}

function StaffCard({ member, onRefresh }: { member: ShopStaffMember; onRefresh: () => void }) {
  const backend = useBackend()
  const [schedule, setSchedule] = useState<StaffSchedule | null>(null)
  const [week, setWeek] = useState<DayRow[]>(() => weekFromRules(member.rules))
  const [editingShifts, setEditingShifts] = useState(false)
  const [exceptionDate, setExceptionDate] = useState(todayLocalDateKey)
  const [exceptionAvailable, setExceptionAvailable] = useState(false)
  const [exceptionStart, setExceptionStart] = useState('10:00')
  const [exceptionEnd, setExceptionEnd] = useState('19:00')
  const [exceptionReason, setExceptionReason] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const attendance = summarizeBarberAttendance(member.employment, member.rules, member.absences)
  const pendingRequests = member.shiftChangeRequests.filter((request) => request.status === 'pending')
  const displayedRules = schedule?.patterns ?? member.rules
  const displayedExceptions = schedule?.exceptions ?? []

  const loadSchedule = useCallback(async () => {
    try {
      const next = await backend.employment.getStaffSchedule(member.barber.id)
      setSchedule(next)
      setWeek(weekFromRules(next.patterns))
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof DataError ? error.message : 'Hindi ma-load ang authoritative schedule.',
      })
    }
  }, [backend, member.barber.id])

  useEffect(() => {
    void loadSchedule()
  }, [loadSchedule])

  function updateDay(index: number, patch: Partial<DayRow>) {
    setWeek((current) => current.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day))
  }

  async function saveShifts() {
    if (!schedule) return
    const rules: AvailabilityRuleInput[] = week
      .map((day, index) => ({ day, index }))
      .filter(({ day }) => day.enabled)
      .map(({ day, index }) => ({ weekday: index as Weekday, start_time: day.start, end_time: day.end }))
    setBusy('shifts')
    setMessage(null)
    try {
      await backend.employment.replaceStaffShifts(member.barber.id, {
        expected_version: schedule.schedule_version,
        blocks: rules,
      })
      setMessage({ kind: 'ok', text: 'Na-update ang shifts. Kita agad ito ng barber.' })
      setEditingShifts(false)
      await loadSchedule()
      onRefresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi ma-save ang shifts.' })
      if (error instanceof DataError && error.code === 'conflict') await loadSchedule()
    } finally {
      setBusy('')
    }
  }

  async function saveException(event: FormEvent) {
    event.preventDefault()
    if (!schedule) return
    setBusy('exception')
    setMessage(null)
    try {
      await backend.employment.upsertStaffShiftException(member.barber.id, {
        expected_version: schedule.schedule_version,
        date: exceptionDate,
        is_available: exceptionAvailable,
        ...(exceptionAvailable ? { start_time: exceptionStart, end_time: exceptionEnd } : {}),
        reason: exceptionReason || null,
      })
      setExceptionReason('')
      setMessage({ kind: 'ok', text: 'Schedule exception saved.' })
      await loadSchedule()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi ma-save ang exception.' })
      if (error instanceof DataError && error.code === 'conflict') await loadSchedule()
    } finally {
      setBusy('')
    }
  }

  async function removeException(exceptionId: string) {
    if (!schedule) return
    setBusy(exceptionId)
    setMessage(null)
    try {
      await backend.employment.removeStaffShiftException(exceptionId, {
        expected_version: schedule.schedule_version,
      })
      setMessage({ kind: 'ok', text: 'Schedule exception removed.' })
      await loadSchedule()
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi maalis ang exception.' })
      if (error instanceof DataError && error.code === 'conflict') await loadSchedule()
    } finally {
      setBusy('')
    }
  }

  async function resolveRequest(requestId: string, decision: 'approve' | 'decline') {
    const target = member.shiftChangeRequests.find((candidate) => candidate.id === requestId)
    if (!target) return
    setBusy(requestId)
    setMessage(null)
    try {
      // Approving now writes the shift exception itself, so the owner no longer
      // has to remember to edit the shift afterwards.
      const result = await backend.employment.resolveShiftChangeRequest(requestId, {
        expected_version: target.version,
        decision,
      })
      await loadSchedule()
      setMessage({
        kind: 'ok',
        text: result.status === 'approved'
          ? 'Request approved — naka-apply na ang schedule change.'
          : 'Request declined.',
      })
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
              <button type="button" className="btn btn-sm" disabled={!schedule} onClick={() => { setWeek(weekFromRules(displayedRules)); setEditingShifts(true) }}>
                <DoodleIcon name="gear" size={15} /> Edit shifts
              </button>
            ) : (
              <div className="owner-staff-edit-actions">
                <button type="button" className="btn btn-sm btn-green" disabled={busy === 'shifts'} onClick={() => void saveShifts()}>
                  {busy === 'shifts' ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy === 'shifts'} onClick={() => { setEditingShifts(false); setWeek(weekFromRules(displayedRules)) }}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {!editingShifts ? (
            <ul className="owner-shift-summary">
              {displayedRules.length === 0 && <li className="muted">Walang assigned shift.</li>}
              {[...displayedRules].sort((left, right) => left.weekday - right.weekday).map((rule) => (
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

          <div className="owner-schedule-exceptions">
            <span className="owner-card-kicker">date exceptions</span>
            <form className="owner-exception-form" onSubmit={saveException}>
              <input aria-label="Exception date" type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} />
              <label>
                <input type="checkbox" checked={exceptionAvailable} onChange={(event) => setExceptionAvailable(event.target.checked)} />
                Different hours
              </label>
              {exceptionAvailable && (
                <>
                  <input aria-label="Exception start" type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} />
                  <input aria-label="Exception end" type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} />
                </>
              )}
              <input aria-label="Exception reason" value={exceptionReason} maxLength={500} placeholder="Private reason (optional)" onChange={(event) => setExceptionReason(event.target.value)} />
              <button className="btn btn-sm" disabled={!schedule || busy === 'exception' || (exceptionAvailable && exceptionStart >= exceptionEnd)}>
                {busy === 'exception' ? 'Saving…' : 'Save exception'}
              </button>
            </form>
            <div className="owner-exception-list">
              {displayedExceptions.length === 0 && <p className="muted">Wala pang date exception.</p>}
              {displayedExceptions.map((exception) => (
                <div key={exception.id}>
                  <span>
                    <strong>{dayLabel(`${exception.date}T00:00:00`)}</strong>
                    <small>
                      {exception.is_available && exception.start_time && exception.end_time
                        ? `${formatWallTime(exception.start_time)} – ${formatWallTime(exception.end_time)}`
                        : 'Unavailable'}
                      {exception.reason ? ` · ${exception.reason}` : ''}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`Remove exception for ${exception.date}`}
                    disabled={Boolean(busy)}
                    onClick={() => void removeException(exception.id)}
                  >
                    {busy === exception.id ? '…' : <DoodleIcon name="x" size={15} />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {pendingRequests.length > 0 && (
            <div className="owner-request-list">
              <span className="owner-card-kicker">change requests</span>
              {pendingRequests.map((request) => (
                <div className="owner-request-row" key={request.id}>
                  <div>
                    <strong>{dayLabel(`${request.date}T00:00:00`)}</strong>
                    <span>
                      {request.requested_kind === 'time_off'
                        ? 'Time off'
                        : `Different hours: ${formatWallTime(request.requested_start_time!)} – ${formatWallTime(request.requested_end_time!)}`}
                    </span>
                    <span className="muted">“{request.message}”</span>
                  </div>
                  <div className="owner-request-actions">
                    <button type="button" className="btn btn-sm btn-green" disabled={busy === request.id} onClick={() => void resolveRequest(request.id, 'approve')}>Approve</button>
                    <button type="button" className="btn btn-sm" disabled={busy === request.id} onClick={() => void resolveRequest(request.id, 'decline')}>Decline</button>
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
