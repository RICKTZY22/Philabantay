import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  DataError,
  isUpcomingAppointment,
  type AppointmentDetailed,
  type AvailabilityOverride,
  type AvailabilityRule,
  type BarberAbsence,
  type BarberEmployment,
  type ConversationDetailed,
  type HiringShop,
  type EmploymentRequest,
  type ShiftChangeRequest,
  type ShopWithStatus,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useLiveLocation } from '../hooks/useLiveLocation'
import { straightLineKm } from '../lib/geo'
import { dayLabel, timeOfDay } from '../lib/format'
import { Loading } from './Loading'
import { BarberShiftCalendar } from './BarberShiftCalendar'
import { BarberPerformancePanel } from './BarberPerformancePanel'
import { DoodleBoard } from './DoodleBoard'
import { DoodleIcon } from '../theme/DoodleDefs'
import './BarberDashboard.css'

const ShopMap = lazy(() => import('./ShopMap'))

interface BarberDashboardProps {
  barberId: string
  barberName: string
  pending: boolean
}

interface BarberHomeData {
  shop: ShopWithStatus | null
  hiringShops: HiringShop[]
  requests: EmploymentRequest[]
  appointments: AppointmentDetailed[]
  conversations: ConversationDetailed[]
  rules: AvailabilityRule[]
  overrides: AvailabilityOverride[]
  employment: BarberEmployment | null
  absences: BarberAbsence[]
  shiftRequests: ShiftChangeRequest[]
}

const emptyData: BarberHomeData = {
  shop: null,
  hiringShops: [],
  requests: [],
  appointments: [],
  conversations: [],
  rules: [],
  overrides: [],
  employment: null,
  absences: [],
  shiftRequests: [],
}

export function BarberDashboard({ barberId, barberName, pending }: BarberDashboardProps) {
  const backend = useBackend()
  const [data, setData] = useState<BarberHomeData | null>(null)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const shop = await backend.employment.getMyShop()
      if (!shop) {
        const [hiringShops, requests] = await Promise.all([
          backend.employment.listHiringShops(),
          backend.employment.listRequests(),
        ])
        setData({ ...emptyData, hiringShops, requests })
        return
      }
      const [appointments, conversations, rules, overrides, employment, absences, shiftRequests] = await Promise.all([
        backend.bookings.listMine(),
        backend.chat.listConversations(),
        backend.availability.getRules(barberId),
        backend.availability.getMyOverrides(),
        backend.employment.getMyEmployment(),
        backend.employment.listMyAbsences(),
        backend.employment.listMyShiftChangeRequests(),
      ])
      setData({ ...emptyData, shop, appointments, conversations, rules, overrides, employment, absences, shiftRequests })
    } catch (error) {
      setLoadError(error instanceof DataError ? error.message : 'Hindi ma-load ang barber workspace.')
      setData(emptyData)
    }
  }, [backend, barberId])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <Loading label="Opening your barber workspace..." />

  if (!data.shop) {
    return (
      <BarberJobBoard
        barberName={barberName}
        pending={pending}
        hiringShops={data.hiringShops}
        requests={data.requests}
        loadError={loadError}
        onRefresh={load}
      />
    )
  }

  return (
    <EmployedBarberHome
      barberName={barberName}
      shop={data.shop}
      appointments={data.appointments}
      conversations={data.conversations}
      rules={data.rules}
      overrides={data.overrides}
      employment={data.employment}
      absences={data.absences}
      shiftRequests={data.shiftRequests}
      loadError={loadError}
    />
  )
}

function BarberJobBoard({
  barberName,
  pending,
  hiringShops,
  requests,
  loadError,
  onRefresh,
}: {
  barberName: string
  pending: boolean
  hiringShops: HiringShop[]
  requests: EmploymentRequest[]
  loadError: string
  onRefresh: () => Promise<void>
}) {
  const backend = useBackend()
  const { location, status: locationStatus, retry } = useLiveLocation()
  const [selectedId, setSelectedId] = useState<string | null>(hiringShops[0]?.id ?? null)
  const [joinCode, setJoinCode] = useState('')
  const [busyShopId, setBusyShopId] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [message, setMessage] = useState('')
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => {
    if (selectedId && hiringShops.some((shop) => shop.id === selectedId)) return
    setSelectedId(hiringShops[0]?.id ?? null)
  }, [hiringShops, selectedId])

  const sortedShops = useMemo(() => {
    if (!location) return hiringShops
    return [...hiringShops].sort((left, right) => (
      straightLineKm(location, left) - straightLineKm(location, right)
    ))
  }, [hiringShops, location])
  const hiringMapShops = useMemo(() => hiringShops.map((shop) => ({
    ...shop,
    status: 'open' as const,
    available_barber_count: 0,
  })), [hiringShops])
  const selectedShop = hiringShops.find((shop) => shop.id === selectedId) ?? sortedShops[0] ?? null
  const requestByShop = useMemo(() => {
    const byShop = new Map<string, EmploymentRequest>()
    requests.forEach((request) => {
      if (!byShop.has(request.shop_id) || request.status === 'pending') byShop.set(request.shop_id, request)
    })
    return byShop
  }, [requests])

  async function apply(shopId: string) {
    setBusyShopId(shopId)
    setMessage('')
    try {
      await backend.employment.createRequest({
        direction: 'barber_application',
        shop_id: shopId,
        idempotency_key: crypto.randomUUID(),
      })
      setMessage('Application request sent. Owner approval is required before employment starts.')
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi ma-send ang application.')
    } finally {
      setBusyShopId(null)
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault()
    setJoining(true)
    setMessage('')
    try {
      const employmentRequest = await backend.employment.createJoinCodeRequest({
        code: joinCode,
        idempotency_key: crypto.randomUUID(),
      })
      setJoinCode('')
      setMessage(`Request sent to ${employmentRequest.shop.name}. The owner still needs to approve it.`)
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi ma-verify ang shop code.')
    } finally {
      setJoining(false)
    }
  }

  async function withdraw(request: EmploymentRequest) {
    setBusyShopId(request.shop_id)
    setMessage('')
    try {
      await backend.employment.withdrawRequest(request.id, {
        expected_version: request.version,
        reason: 'Withdrawn by the barber.',
      })
      setMessage('Request withdrawn.')
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi ma-withdraw ang request.')
    } finally {
      setBusyShopId(null)
    }
  }

  return (
    <DoodleBoard>
      <div className="barber-jobs-page">
      <header className="barber-jobs-hero barber-paper-stack">
        <div>
          <span className="eyebrow">FIND YOUR NEXT CHAIR</span>
          <h1>Hi {firstName(barberName)}, hanap tayo ng shop.</h1>
          <p>Live hiring map ito. Kapag gumagalaw ka, ina-update rin ang ayos ng pinakamalapit na openings.</p>
        </div>
        <div className="barber-profile-state">
          <DoodleIcon name="scissors" size={30} />
          <div><strong>{pending ? 'Open to work' : 'Barber profile ready'}</strong><span>Wala pang shop membership</span></div>
        </div>
      </header>

      {(loadError || message) && <div className="barber-flow-message" role="status">{message || loadError}</div>}

      <section className="barber-jobs-toolbar" aria-label="Hiring map controls">
        <div>
          <span className={`barber-location-dot is-${locationStatus}`} />
          <strong>{location ? 'Live location on' : locationStatus === 'asking' ? 'Finding your location...' : 'Location is off'}</strong>
          <span>{location ? 'Nearest openings update automatically.' : 'All hiring shops are still visible.'}</span>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => { retry(); setResetKey((key) => key + 1) }}>
          <DoodleIcon name="search" size={17} /> Retry location
        </button>
      </section>

      <div className="barber-jobs-layout">
        <section className="barber-hiring-map" aria-label="Hiring barbershop map">
          <Suspense fallback={<Loading label="Drawing hiring pins..." />}>
            <ShopMap
              shops={hiringMapShops}
              selectedId={selectedShop?.id ?? null}
              onSelect={setSelectedId}
              scope={location ? 'nearby' : 'all'}
              resetKey={resetKey}
              userLocation={location}
            />
          </Suspense>
        </section>

        <aside className="barber-hiring-list barber-paper-stack" aria-label="Hiring shops">
          <div className="barber-section-heading">
            <div><span className="eyebrow">NOW HIRING</span><h2>{sortedShops.length} open shops</h2></div>
          </div>
          {sortedShops.map((shop) => {
            const employmentRequest = requestByShop.get(shop.id)
            return (
              <button
                type="button"
                className={`barber-hiring-row${selectedShop?.id === shop.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(shop.id)}
                key={shop.id}
              >
                <span className="barber-hiring-row-top"><strong>{shop.name}</strong><span>{openingLabel(shop.hiring.open_positions)}</span></span>
                <span>{shop.city} · Hiring now</span>
                {employmentRequest && <em className={`barber-application is-${employmentRequest.status}`}>{employmentRequest.status}</em>}
              </button>
            )
          })}
          {sortedShops.length === 0 && <p className="muted">Walang hiring notice ngayon. Puwede ka pa ring gumamit ng shop code.</p>}
        </aside>
      </div>

      <div className="barber-job-actions">
        <section className="barber-job-details rough-card barber-paper-stack">
          {selectedShop ? (
            <>
              <div className="barber-section-heading">
                <div><span className="eyebrow">SHOP DETAILS</span><h2>{selectedShop.name}</h2><p>{selectedShop.address}, {selectedShop.city}</p></div>
                <span className="pill pill-green">{openingLabel(selectedShop.hiring.open_positions)}</span>
              </div>
              <div className="barber-role-strip">
                <div><span>Hiring status</span><strong>Open</strong></div>
                <div><span>Openings</span><strong>{selectedShop.hiring.open_positions ?? 'Not specified'}</strong></div>
                <div><span>Shop rating</span><strong>{selectedShop.rating.toFixed(1)} / 5</strong></div>
              </div>
              <h3>Hiring note</h3>
              <p>{selectedShop.hiring.note ?? 'The owner has not added a hiring note yet.'}</p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyShopId === selectedShop.id || requestByShop.get(selectedShop.id)?.status === 'pending'}
                onClick={() => void apply(selectedShop.id)}
              >
                {requestByShop.get(selectedShop.id)?.status === 'pending'
                  ? 'Request pending'
                  : busyShopId === selectedShop.id ? 'Sending...' : 'Apply to this shop'}
              </button>
            </>
          ) : <p className="muted">Pumili ng hiring shop para makita ang requirements.</p>}
        </section>

        <section className="barber-join-card rough-card barber-paper-stack">
          <span className="eyebrow">OWNER-SHARED CODE</span>
          <h2>Request with a shop code</h2>
          <p>A valid code creates a pending request. It never adds you to a roster until the owner approves.</p>
          <form onSubmit={join}>
            <label htmlFor="barber-shop-code">Shop code</label>
            <div className="barber-code-row">
              <input
                id="barber-shop-code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="PB-…"
                maxLength={64}
                autoComplete="off"
              />
              <button className="btn btn-green" disabled={joining || joinCode.trim().length < 4}>
                {joining ? 'Checking...' : 'Send request'}
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="barber-request-history rough-card barber-paper-stack" aria-labelledby="barber-request-history-title">
        <div className="barber-section-heading">
          <div><span className="eyebrow">REQUEST TIMELINE</span><h2 id="barber-request-history-title">Applications and invitations</h2></div>
          <Link className="btn btn-sm" to="/professional">Edit job profile</Link>
        </div>
        {requests.length === 0
          ? <p className="muted">Wala ka pang employment request.</p>
          : requests.map((request) => (
            <article className="barber-request-row" key={request.id}>
              <div>
                <strong>{request.shop.name}</strong>
                <span>{request.direction.replaceAll('_', ' ')} · {request.status}</span>
              </div>
              {request.allowed_actions.includes('withdraw') && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busyShopId === request.shop_id}
                  onClick={() => void withdraw(request)}
                >
                  Withdraw
                </button>
              )}
            </article>
          ))}
      </section>
      </div>
    </DoodleBoard>
  )
}

function EmployedBarberHome({ barberName, shop, appointments, conversations, rules, overrides, employment, absences, shiftRequests, loadError }: {
  barberName: string
  shop: ShopWithStatus
  appointments: AppointmentDetailed[]
  conversations: ConversationDetailed[]
  rules: AvailabilityRule[]
  overrides: AvailabilityOverride[]
  employment: BarberEmployment | null
  absences: BarberAbsence[]
  shiftRequests: ShiftChangeRequest[]
  loadError: string
}) {
  const upcoming = useMemo(() => appointments
    .filter((appointment) => isUpcomingAppointment(appointment))
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    .slice(0, 5), [appointments])
  const nextShifts = useMemo(() => [...rules]
    .sort((left, right) => nextWeekdayDistance(left.weekday) - nextWeekdayDistance(right.weekday))
    .slice(0, 3), [rules])
  const unread = conversations.reduce((total, conversation) => total + conversation.unread_count, 0)

  return (
    <DoodleBoard>
      <div className="barber-home-page">
      <header className="barber-home-hero barber-paper-stack">
        <div>
          <span className="eyebrow">YOUR SHOP HOME</span>
          <h1>Ready ang chair mo, {firstName(barberName)}.</h1>
          <p>{shop.name} · {shop.address}, {shop.city}</p>
        </div>
        <div className={`barber-shop-live is-${shop.status}`}>
          <span />
          <div><strong>{shop.status === 'open' ? 'Shop is active' : shop.status === 'busy' ? 'Shop is busy' : 'Shop is closed'}</strong><small>{shop.available_barber_count} free barber{shop.available_barber_count === 1 ? '' : 's'} now</small></div>
        </div>
      </header>

      {loadError && <div className="barber-flow-message" role="alert">{loadError}</div>}

      <section className="barber-home-stats" aria-label="Barber home summary">
        <HomeStat icon="calendar" value={String(nextShifts.length)} label="Upcoming shifts" tone="blue" />
        <HomeStat icon="chair" value={String(upcoming.length)} label="Upcoming bookings" tone="yellow" />
        <HomeStat icon="chat" value={String(unread)} label="Unread messages" tone="pink" />
      </section>

      {/* Performance is the barber's own record, not owner analytics shrunk into a
          smaller card: it separates customer absence from shop-caused failures and
          ships the definition of every figure. */}
      <BarberPerformancePanel />

      <div className="barber-home-grid">
        <section className="barber-home-card barber-paper-stack barber-shifts-card">
          <div className="barber-section-heading">
            <div><span className="eyebrow">NEXT ON THE ROSTER</span><h2>Shift calendar</h2></div>
            <Link className="btn btn-sm" to="/schedule">Manage schedule</Link>
          </div>
          {rules.length === 0
            ? <EmptyHomeState text="Wala ka pang assigned weekly shift." />
            : (
              <BarberShiftCalendar
                rules={rules}
                overrides={overrides}
                employment={employment}
                absences={absences}
                requests={shiftRequests}
              />
            )}
        </section>

        <section className="barber-home-card barber-paper-stack barber-bookings-card">
          <div className="barber-section-heading">
            <div><span className="eyebrow">COMING TO YOUR CHAIR</span><h2>Upcoming bookings</h2></div>
          </div>
          {/* Summary lang dito: customer, cut, at oras. Ang ibang detalye
              (notes, status) ay nasa booking calendar / full views. */}
          <div className="barber-booking-list">
            {upcoming.map((appointment) => (
              <article className="barber-booking-row barber-paper-stack-sm" key={appointment.id}>
                <time><strong>{timeOfDay(appointment.starts_at)}</strong><span>{dayLabel(appointment.starts_at)}</span></time>
                <div><strong>{appointment.customer.full_name}</strong><span>{appointment.service.name}</span></div>
              </article>
            ))}
            {upcoming.length === 0 && <EmptyHomeState text="Wala pang upcoming booking sa chair mo." />}
          </div>
        </section>

      </div>
      </div>
    </DoodleBoard>
  )
}

function HomeStat({ icon, value, label, tone }: { icon: 'calendar' | 'chair' | 'chat'; value: string; label: string; tone: string }) {
  return <article className={`barber-home-stat barber-paper-stack is-${tone}`}><DoodleIcon name={icon} size={25} /><strong>{value}</strong><span>{label}</span></article>
}

function EmptyHomeState({ text }: { text: string }) {
  return <div className="barber-home-empty"><DoodleIcon name="scissors" size={24} /><span>{text}</span></div>
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0]
}

function openingLabel(value: number | null) {
  if (value === null) return 'Open count not set'
  return `${value} slot${value === 1 ? '' : 's'}`
}

function nextWeekdayDistance(weekday: number) {
  return (weekday - new Date().getDay() + 7) % 7
}
