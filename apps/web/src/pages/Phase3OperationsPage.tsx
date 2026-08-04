import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  canonicalAppointmentStatus,
  DataError,
  type AppointmentDetailed,
  type AppointmentAttentionItem,
  type CloseoutRun,
  type InAppNotification,
  type NoShowAppeal,
  type PaymentRecord,
  type PublicService,
  type ShopStaffMember,
  type WalkInEntry,
} from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import { useBackend } from '../services/backend'
import { localDateKey } from '../lib/date'
import { dayLabel, money, timeOfDay } from '../lib/format'
import { Loading } from '../components/Loading'
import './Phase3OperationsPage.css'

type OperationsData = {
  appointments: AppointmentDetailed[]
  walkIns: WalkInEntry[]
  payments: PaymentRecord[]
  notifications: InAppNotification[]
  appeals: NoShowAppeal[]
  attention: AppointmentAttentionItem[]
  closeouts: CloseoutRun[]
  services: PublicService[]
  staff: ShopStaffMember[]
  canRecordPayments: boolean
}

const emptyData: OperationsData = {
  appointments: [], walkIns: [], payments: [], notifications: [], appeals: [],
  attention: [], closeouts: [], services: [], staff: [], canRecordPayments: false,
}

function localDateTimeInput(value: string): string {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function Phase3OperationsPage() {
  const backend = useBackend()
  const { profile } = useAuth()
  const [data, setData] = useState<OperationsData | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [claimCode, setClaimCode] = useState<{ walkInId: string; code: string } | null>(null)

  const load = useCallback(async () => {
    if (!profile || profile.role === 'customer') return
    setMessage('')
    try {
      const appointments = profile.role === 'shop_owner'
        ? await backend.bookings.listForMyShop()
        : await backend.bookings.listMine()
      const [walkIns, notifications] = await Promise.all([
        backend.walkIns.list(), backend.notifications.list(),
      ])
      let payments: PaymentRecord[] = []
      let canRecordPayments = profile.role === 'shop_owner'
      try { payments = await backend.payments.list(); canRecordPayments = true } catch { /* Barber may not hold cashier capability. */ }
      if (profile.role === 'shop_owner') {
        const [appeals, attention, closeouts, ownerServices, staff] = await Promise.all([
          backend.bookings.listShopNoShowAppeals(), backend.bookings.listAttention(),
          backend.closeout.list(), backend.ownerShop.listServices(), backend.employment.listMyShopStaff(),
        ])
        setData({ appointments, walkIns, payments, notifications, appeals, attention, closeouts, services: ownerServices, staff, canRecordPayments })
      } else {
        const shop = await backend.employment.getMyShop()
        const services = shop ? await backend.services.list(shop.id) : []
        setData({ ...emptyData, appointments, walkIns, payments, notifications, services, canRecordPayments })
      }
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Could not load live operations.')
      setData(emptyData)
    }
  }, [backend, profile])

  useEffect(() => { void load() }, [load])

  async function act(key: string, operation: () => Promise<unknown>, success: string) {
    setBusy(key); setMessage('')
    try { await operation(); setMessage(success); await load() }
    catch (error) { setMessage(error instanceof DataError ? error.message : 'The command failed. Refresh and try again.') }
    finally { setBusy('') }
  }

  if (!profile || profile.role === 'customer') return <p className="form-error">Live operations are for current shop staff.</p>
  if (!data) return <Loading label="Loading live operations..." />

  const activeAppointments = data.appointments.filter((appointment) => !['declined', 'expired', 'cancelled', 'completed', 'customer_no_show'].includes(canonicalAppointmentStatus(appointment.status)))

  return (
    <main className="phase3-ops-page">
      <header className="phase3-ops-hero">
        <div><span className="eyebrow">PHASE 3 · LIVE OPERATIONS</span><h1>{profile.role === 'shop_owner' ? 'Shop operations' : "Today's chair"}</h1><p>Versioned visit actions, walk-ins, offline collection records, and attention items.</p></div>
        <button type="button" className="btn" onClick={() => void load()}>Refresh truth</button>
      </header>
      {message && <p className="phase3-ops-message" role="status">{message}</p>}

      <section className="phase3-ops-section" aria-labelledby="active-visits-heading">
        <header><div><span className="eyebrow">APPOINTMENTS</span><h2 id="active-visits-heading">Active visits</h2></div><span className="pill">{activeAppointments.length}</span></header>
        <div className="phase3-ops-grid">
          {activeAppointments.map((appointment) => (
            <AppointmentOperationsCard
              key={appointment.id}
              appointment={appointment}
              owner={profile.role === 'shop_owner'}
              services={data.services}
              staff={data.staff}
              busy={busy}
              onAct={act}
            />
          ))}
          {activeAppointments.length === 0 && <p className="muted">No active appointment needs staff action.</p>}
        </div>
      </section>

      <WalkInBoard data={data} actorId={profile.id} busy={busy} claimCode={claimCode} setClaimCode={setClaimCode} onAct={act} />
      <PaymentBoard data={data} busy={busy} onAct={act} />

      {profile.role === 'shop_owner' && (
        <>
          <section className="phase3-ops-section">
            <header><div><span className="eyebrow">REVIEW</span><h2>No-show appeals and attention</h2></div></header>
            <div className="phase3-ops-grid">
              {data.appeals.filter((appeal) => appeal.status === 'pending').map((appeal) => (
                <article className="phase3-ops-card" key={appeal.id}>
                  <strong>No-show appeal</strong><p>{appeal.reason}</p>{appeal.evidence_note && <small>{appeal.evidence_note}</small>}
                  <div className="phase3-ops-actions">
                    <button className="btn btn-sm btn-green" disabled={Boolean(busy)} onClick={() => void act(`appeal-${appeal.id}`, () => backend.bookings.resolveNoShowAppeal(appeal.id, { expected_version: appeal.version, resolution: 'accepted', reason: 'Customer appeal accepted after owner review.' }), 'Appeal accepted without a strike.')}>Accept appeal</button>
                    <button className="btn btn-sm btn-danger" disabled={Boolean(busy)} onClick={() => void act(`appeal-${appeal.id}`, () => backend.bookings.resolveNoShowAppeal(appeal.id, { expected_version: appeal.version, resolution: 'upheld', reason: 'No-show upheld after owner review.' }), 'Appeal upheld and strike policy recalculated.')}>Uphold</button>
                  </div>
                </article>
              ))}
              {data.attention.filter((item) => item.status === 'open').map((item) => <article className="phase3-ops-card is-attention" key={item.id}><strong>{item.kind.replaceAll('_', ' ')}</strong><p>{item.reason}</p><small>Appointment {item.appointment_id.slice(0, 8)}</small></article>)}
              {!data.appeals.some((appeal) => appeal.status === 'pending') && !data.attention.some((item) => item.status === 'open') && <p className="muted">No unresolved appeal or attention item.</p>}
            </div>
          </section>

          <section className="phase3-ops-section">
            <header><div><span className="eyebrow">CLOSEOUT</span><h2>Daily reconciliation</h2></div></header>
            <p>Closeout expires only due requests, completes only due finished visits, and turns every uncertain case into an attention item.</p>
            <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void act('closeout', () => backend.closeout.run(localDateKey(new Date(Date.now() - 86_400_000))), 'Closeout completed idempotently.')}>Run yesterday’s closeout</button>
            <ul className="phase3-closeout-list">{data.closeouts.slice(0, 5).map((run) => <li key={run.id}><strong>{run.local_date}</strong><span>{run.status} · {run.attention_count} attention</span></li>)}</ul>
          </section>
        </>
      )}

      <section className="phase3-ops-section">
        <header><div><span className="eyebrow">INBOX</span><h2>Operational notifications</h2></div><span className="pill">{data.notifications.filter((item) => !item.read_at).length} unread</span></header>
        <div className="phase3-notification-list">{data.notifications.slice(0, 12).map((notification) => <button type="button" key={notification.id} className={notification.read_at ? '' : 'is-unread'} onClick={() => void act(`notice-${notification.id}`, () => backend.notifications.markRead(notification.id), 'Notification marked read.')}><strong>{notification.title}</strong><span>{notification.body}</span></button>)}</div>
      </section>
    </main>
  )
}

function PaymentBoard({ data, busy, onAct }: {
  data: OperationsData
  busy: string
  onAct: (key: string, operation: () => Promise<unknown>, success: string) => Promise<void>
}) {
  const backend = useBackend()
  const paidAppointments = new Set(data.payments.filter((payment) => payment.appointment_id && ['recorded', 'corrected'].includes(payment.status)).map((payment) => payment.appointment_id))
  const unpaidCompleted = data.appointments.filter((appointment) => appointment.status === 'completed' && !paidAppointments.has(appointment.id))
  return <section className="phase3-ops-section"><header><div><span className="eyebrow">OFFLINE COLLECTIONS</span><h2>Payment records</h2></div><span className="pill">{data.payments.length}</span></header>
    <p>Philabantay records what staff collected outside the app; it does not process funds or change visit completion.</p>
    {data.staff.length > 0 && <details className="phase3-proposal"><summary>Cashier capability</summary><div className="phase3-ops-actions">{data.staff.map((member) => <span key={member.barber.id}><strong>{member.barber.profile.full_name}</strong> <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void onAct(`cashier-on-${member.barber.id}`, () => backend.payments.setCashier(member.barber.id, { active: true }), 'Cashier capability granted.')}>Grant</button> <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void onAct(`cashier-off-${member.barber.id}`, () => backend.payments.setCashier(member.barber.id, { active: false }), 'Cashier capability revoked.')}>Revoke</button></span>)}</div></details>}
    {!data.canRecordPayments && <p className="muted">The owner has not granted this barber the narrow cashier capability.</p>}
    {data.canRecordPayments && <div className="phase3-ops-grid">
      {unpaidCompleted.map((appointment) => <article className="phase3-ops-card" key={appointment.id}><strong>{appointment.customer.full_name}</strong><span>{appointment.service.name} · {money(appointment.booked_price_cents ?? appointment.service.price_cents)}</span><button className="btn btn-sm btn-green" disabled={Boolean(busy)} onClick={() => void onAct(`pay-${appointment.id}`, () => backend.payments.record({ appointment_id: appointment.id, method: 'cash', currency: 'PHP', amount_cents: appointment.booked_price_cents ?? appointment.service.price_cents, paid_at: new Date().toISOString(), idempotency_key: crypto.randomUUID() }), 'Offline cash collection recorded separately from completion.')}>Record cash</button></article>)}
      {data.payments.map((payment) => <PaymentRow payment={payment} busy={busy} onAct={onAct} key={payment.id} />)}
      {unpaidCompleted.length === 0 && data.payments.length === 0 && <p className="muted">No completed visit or payment record yet.</p>}
    </div>}
  </section>
}

function PaymentRow({ payment, busy, onAct }: {
  payment: PaymentRecord
  busy: string
  onAct: (key: string, operation: () => Promise<unknown>, success: string) => Promise<void>
}) {
  const backend = useBackend()
  const [amount, setAmount] = useState(String(payment.amount_cents / 100))
  const active = ['recorded', 'corrected'].includes(payment.status)
  return <article className="phase3-ops-card"><header><strong>{money(payment.amount_cents)}</strong><span className="pill">{payment.status}</span></header><small>{payment.method.replaceAll('_', ' ')} · Philabantay did not process these funds.</small>{active && <div className="phase3-payment-edit"><label>Correct amount (PHP)<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><div className="phase3-ops-actions"><button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void onAct(`correct-${payment.id}`, () => backend.payments.change(payment.id, { expected_version: payment.version, action: 'correct', amount_cents: Math.round(Number(amount) * 100), reason: 'Owner corrected the recorded offline collection amount.' }), 'Payment correction appended to the audit history.')}>Correct</button><button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void onAct(`refund-${payment.id}`, () => backend.payments.change(payment.id, { expected_version: payment.version, action: 'refund', amount_cents: 0, reason: 'Owner recorded an offline refund.' }), 'Offline refund recorded.')}>Record refund</button><button className="btn btn-sm btn-danger" disabled={Boolean(busy)} onClick={() => void onAct(`void-${payment.id}`, () => backend.payments.change(payment.id, { expected_version: payment.version, action: 'void', amount_cents: 0, reason: 'Owner voided an incorrect offline collection record.' }), 'Payment record voided with history retained.')}>Void</button></div></div>}</article>
}

function AppointmentOperationsCard({ appointment, owner, services, staff, busy, onAct }: {
  appointment: AppointmentDetailed
  owner: boolean
  services: PublicService[]
  staff: ShopStaffMember[]
  busy: string
  onAct: (key: string, operation: () => Promise<unknown>, success: string) => Promise<void>
}) {
  const backend = useBackend()
  const status = canonicalAppointmentStatus(appointment.status)
  const allowed = new Set(appointment.allowed_actions ?? [])
  const version = appointment.version ?? 1
  const disabled = Boolean(busy)
  const [issuedCode, setIssuedCode] = useState('')

  async function issueCode() {
    const result = await backend.bookings.issueCheckInCode(appointment.id, { expected_version: version })
    setIssuedCode(result.code)
  }

  return (
    <article className="phase3-ops-card">
      <header><div><strong>{appointment.customer.full_name}</strong><span>{appointment.service.name} · {dayLabel(appointment.starts_at)} {timeOfDay(appointment.starts_at)}</span></div><span className="pill">{status.replaceAll('_', ' ')}</span></header>
      <p>Assigned: {appointment.barber.profile.full_name}{appointment.assignment_reason ? ` · ${appointment.assignment_reason}` : ''}</p>
      {issuedCode && <output className="phase3-claim-code" aria-label="Customer check-in code">{issuedCode}</output>}
      <div className="phase3-ops-actions">
        {allowed.has('issue_check_in_code') && <button className="btn btn-sm" disabled={disabled} onClick={() => void onAct(`code-${appointment.id}`, issueCode, 'Check-in code issued.')}>Issue check-in code</button>}
        {allowed.has('check_in') && owner && <button className="btn btn-sm" disabled={disabled} onClick={() => void onAct(`checkin-${appointment.id}`, () => backend.bookings.checkIn(appointment.id, { expected_version: version, reason: 'Owner verified customer identity at the shop.' }), 'Customer checked in with audited fallback.')}>Manual check-in</button>}
        {allowed.has('start') && !owner && <button className="btn btn-sm btn-green" disabled={disabled} onClick={() => void onAct(`start-${appointment.id}`, () => backend.bookings.start(appointment.id, { expected_version: version }), 'Visit started.')}>Start service</button>}
        {allowed.has('finish') && !owner && <button className="btn btn-sm btn-green" disabled={disabled} onClick={() => void onAct(`finish-${appointment.id}`, () => backend.bookings.finish(appointment.id, { expected_version: version }), 'Service finished; customer confirmation is pending.')}>Finish service</button>}
        {allowed.has('mark_customer_no_show') && <button className="btn btn-sm btn-danger" disabled={disabled} onClick={() => void onAct(`noshow-${appointment.id}`, () => backend.bookings.markCustomerNoShow(appointment.id, { expected_version: version, reason: 'Customer did not arrive after the required grace period.' }), 'No-show recorded; appeal window opened.')}>Mark no-show</button>}
        {allowed.has('report_delay') && <button className="btn btn-sm" disabled={disabled} onClick={() => void onAct(`delay-${appointment.id}`, () => backend.bookings.reportDelay(appointment.id, { expected_version: version, category: 'shop_delay', estimate_minutes: 15, reason: 'Shop reported an estimated 15-minute delay.' }), 'Customer notified of the delay.')}>Report 15-min delay</button>}
        {allowed.has('resolve_dispute') && owner && <button className="btn btn-sm btn-green" disabled={disabled} onClick={() => void onAct(`resolve-${appointment.id}`, () => backend.bookings.resolveDispute(appointment.id, { expected_version: version, resolution: 'completed', reason: 'Owner reviewed the visit record and resolved it as completed.' }), 'Dispute resolved as completed.')}>Resolve completed</button>}
      </div>
      {allowed.has('propose_change') && (
        <ChangeProposalForm appointment={appointment} services={services} staff={staff} disabled={disabled} onAct={onAct} />
      )}
    </article>
  )
}

function ChangeProposalForm({ appointment, services, staff, disabled, onAct }: {
  appointment: AppointmentDetailed
  services: PublicService[]
  staff: ShopStaffMember[]
  disabled: boolean
  onAct: (key: string, operation: () => Promise<unknown>, success: string) => Promise<void>
}) {
  const backend = useBackend()
  const [serviceId, setServiceId] = useState(appointment.service_id)
  const [providerId, setProviderId] = useState(appointment.barber_id)
  const [startsAt, setStartsAt] = useState(localDateTimeInput(appointment.starts_at))
  const [reason, setReason] = useState('')
  const providers = [appointment.barber, ...staff.map((member) => member.barber)]
    .filter((provider, index, all) => all.findIndex((candidate) => candidate.id === provider.id) === index)

  function submit(event: FormEvent) {
    event.preventDefault()
    void onAct(`proposal-${appointment.id}`, () => backend.bookings.proposeChange(appointment.id, {
      expected_version: appointment.version ?? 1,
      service_id: serviceId,
      provider_id: providerId,
      starts_at: new Date(startsAt).toISOString(),
      reason,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    }), 'Customer consent proposal sent; the original booking is unchanged.')
  }

  return <details className="phase3-proposal"><summary>Propose a customer-approved change</summary><form onSubmit={submit}>
    <label>Service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>{services.map((service) => <option value={service.id} key={service.id}>{service.name} · {money(service.price_cents)}</option>)}</select></label>
    <label>Provider<select value={providerId} onChange={(event) => setProviderId(event.target.value)}>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.profile.full_name}</option>)}</select></label>
    <label>Start<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
    <label>Reason<input required minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <button className="btn btn-sm" disabled={disabled || reason.trim().length < 3}>Send proposal</button>
  </form></details>
}

function WalkInBoard({ data, actorId, busy, claimCode, setClaimCode, onAct }: {
  data: OperationsData
  actorId: string
  busy: string
  claimCode: { walkInId: string; code: string } | null
  setClaimCode: (value: { walkInId: string; code: string } | null) => void
  onAct: (key: string, operation: () => Promise<unknown>, success: string) => Promise<void>
}) {
  const backend = useBackend()
  const [name, setName] = useState('')
  const [serviceId, setServiceId] = useState(data.services[0]?.id ?? '')
  const [providerId, setProviderId] = useState(data.staff[0]?.barber.id ?? actorId)
  const active = useMemo(() => data.walkIns.filter((entry) => !['completed', 'cancelled'].includes(entry.queue_status)), [data.walkIns])

  function add(event: FormEvent) {
    event.preventDefault()
    void onAct('walkin-create', () => backend.walkIns.create({ display_name: name, service_id: serviceId || undefined, requested_barber_id: providerId || undefined }), 'Walk-in added to the queue.')
    setName('')
  }

  return <section className="phase3-ops-section"><header><div><span className="eyebrow">WALK-INS</span><h2>Queue board</h2></div><span className="pill">{active.length}</span></header>
    <form className="phase3-walkin-add" onSubmit={add}><label>Guest name<input value={name} required maxLength={80} onChange={(event) => setName(event.target.value)} /></label><label>Service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Choose later</option>{data.services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}</select></label>{data.staff.length > 0 && <label>Provider<select value={providerId} onChange={(event) => setProviderId(event.target.value)}>{data.staff.map((member) => <option value={member.barber.id} key={member.barber.id}>{member.barber.profile.full_name}</option>)}</select></label>}<button className="btn btn-primary" disabled={Boolean(busy)}>Add walk-in</button></form>
    {claimCode && <output className="phase3-claim-code">Guest claim: {claimCode.code} · open /walk-in/{claimCode.walkInId}/claim</output>}
    <div className="phase3-ops-grid">{active.map((entry) => <article className="phase3-ops-card" key={entry.id}><header><strong>{entry.display_name}</strong><span className="pill">{entry.queue_status.replaceAll('_', ' ')}</span></header><small>{entry.manually_verified ? 'Manually verified' : 'Guest claim available'}</small><div className="phase3-ops-actions">
      {['waiting', 'called'].includes(entry.queue_status) && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void onAct(`claim-${entry.id}`, async () => { const code = await backend.walkIns.issueClaimCode(entry.id, { expected_version: entry.version }); setClaimCode({ walkInId: entry.id, code: code.code }) }, 'Single-use guest claim code issued.')}>Issue claim</button>}
      {entry.queue_status === 'waiting' && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void onAct(`call-${entry.id}`, () => backend.walkIns.transition(entry.id, { expected_version: entry.version, action: 'call' }), 'Guest called.')}>Call</button>}
      {['waiting', 'called'].includes(entry.queue_status) && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void onAct(`manual-${entry.id}`, () => backend.walkIns.transition(entry.id, { expected_version: entry.version, action: 'check_in', reason: 'Staff manually verified the guest at the shop.' }), 'Guest manually checked in.')}>Manual check-in</button>}
      {entry.queue_status === 'checked_in' && entry.service_id && <button className="btn btn-sm btn-green" disabled={Boolean(busy)} onClick={() => void onAct(`start-walkin-${entry.id}`, () => backend.walkIns.transition(entry.id, { expected_version: entry.version, action: 'start', provider_id: entry.requested_barber_id ?? providerId }), 'Walk-in service started.')}>Start</button>}
      {entry.queue_status === 'in_service' && <button className="btn btn-sm btn-green" disabled={Boolean(busy)} onClick={() => void onAct(`complete-walkin-${entry.id}`, () => backend.walkIns.transition(entry.id, { expected_version: entry.version, action: 'complete' }), 'Walk-in completed.')}>Complete</button>}
    </div></article>)}</div>
  </section>
}
