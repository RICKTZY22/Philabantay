import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  DataError,
  type AppointmentDetailed,
  type AvailabilityRule,
  type BarberAbsence,
  type BarberApplication,
  type BarberEmployment,
  type ConversationDetailed,
  type HiringShop,
  type ShiftChangeRequest,
  type ShopWithStatus,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useLiveLocation } from '../hooks/useLiveLocation'
import { straightLineKm } from '../lib/geo'
import { dayLabel, timeOfDay } from '../lib/format'
import { Loading } from './Loading'
import { BarberShiftCalendar } from './BarberShiftCalendar'
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
  applications: BarberApplication[]
  appointments: AppointmentDetailed[]
  conversations: ConversationDetailed[]
  rules: AvailabilityRule[]
  employment: BarberEmployment | null
  absences: BarberAbsence[]
  shiftRequests: ShiftChangeRequest[]
}

const emptyData: BarberHomeData = {
  shop: null,
  hiringShops: [],
  applications: [],
  appointments: [],
  conversations: [],
  rules: [],
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
        const [hiringShops, applications] = await Promise.all([
          backend.employment.listHiringShops(),
          backend.employment.listMyApplications(),
        ])
        setData({ ...emptyData, hiringShops, applications })
        return
      }
      const [appointments, conversations, rules, employment, absences, shiftRequests] = await Promise.all([
        backend.bookings.listMine(),
        backend.chat.listConversations(),
        backend.availability.getRules(barberId),
        backend.employment.getMyEmployment(),
        backend.employment.listMyAbsences(),
        backend.employment.listMyShiftChangeRequests(),
      ])
      setData({ ...emptyData, shop, appointments, conversations, rules, employment, absences, shiftRequests })
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
        applications={data.applications}
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
  applications,
  loadError,
  onRefresh,
}: {
  barberName: string
  pending: boolean
  hiringShops: HiringShop[]
  applications: BarberApplication[]
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
    available_barber_count: shop.hiring.open_positions,
  })), [hiringShops])
  const selectedShop = hiringShops.find((shop) => shop.id === selectedId) ?? sortedShops[0] ?? null
  const applicationByShop = useMemo(() => new Map(
    applications.map((application) => [application.shop_id, application]),
  ), [applications])

  async function apply(shopId: string) {
    setBusyShopId(shopId)
    setMessage('')
    try {
      await backend.employment.apply(shopId)
      setMessage('Application sent. Makikita rito ang status habang hinihintay ang shop.')
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
      const shop = await backend.employment.joinWithCode({ code: joinCode })
      setMessage(`Welcome sa ${shop.name}! Binubuksan ang shop workspace mo.`)
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof DataError ? error.message : 'Hindi ma-verify ang shop code.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <DoodleBoard
      userName={barberName}
      centerLabel="Barber hiring map"
      liveTone={location ? 'green' : 'yellow'}
    >
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
            const application = applicationByShop.get(shop.id)
            return (
              <button
                type="button"
                className={`barber-hiring-row${selectedShop?.id === shop.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedId(shop.id)}
                key={shop.id}
              >
                <span className="barber-hiring-row-top"><strong>{shop.name}</strong><span>{shop.hiring.open_positions} slot{shop.hiring.open_positions === 1 ? '' : 's'}</span></span>
                <span>{shop.city} · {employmentLabel(shop.hiring.employment_type)}</span>
                {application && <em className={`barber-application is-${application.status}`}>{application.status}</em>}
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
                <span className="pill pill-green">{selectedShop.hiring.open_positions} open</span>
              </div>
              <div className="barber-role-strip">
                <div><span>Role</span><strong>{selectedShop.hiring.role_title}</strong></div>
                <div><span>Setup</span><strong>{employmentLabel(selectedShop.hiring.employment_type)}</strong></div>
                <div><span>Shop rating</span><strong>{selectedShop.rating.toFixed(1)} / 5</strong></div>
              </div>
              <h3>What the shop needs</h3>
              <ul className="barber-requirements">
                {selectedShop.hiring.requirements.map((requirement) => <li key={requirement}><DoodleIcon name="check" size={16} /> {requirement}</li>)}
              </ul>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyShopId === selectedShop.id || Boolean(applicationByShop.get(selectedShop.id))}
                onClick={() => void apply(selectedShop.id)}
              >
                {applicationByShop.get(selectedShop.id) ? 'Application sent' : busyShopId === selectedShop.id ? 'Sending...' : 'Apply to this shop'}
              </button>
            </>
          ) : <p className="muted">Pumili ng hiring shop para makita ang requirements.</p>}
        </section>

        <section className="barber-join-card rough-card barber-paper-stack">
          <span className="eyebrow">ALREADY HIRED?</span>
          <h2>Join with a shop code</h2>
          <p>Hingin ang private code sa owner. Isang valid code lang ang kailangan para ma-register sa shop roster.</p>
          <form onSubmit={join}>
            <label htmlFor="barber-shop-code">Shop code</label>
            <div className="barber-code-row">
              <input
                id="barber-shop-code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="EXAMPLE26"
                maxLength={24}
                autoComplete="off"
              />
              <button className="btn btn-green" disabled={joining || joinCode.trim().length < 4}>
                {joining ? 'Checking...' : 'Join shop'}
              </button>
            </div>
          </form>
          <details>
            <summary>Demo codes</summary>
            <p><code>TONDO26</code>, <code>SOUTH26</code>, or <code>MAGIN26</code></p>
          </details>
        </section>
      </div>
      </div>
    </DoodleBoard>
  )
}

function EmployedBarberHome({ barberName, shop, appointments, conversations, rules, employment, absences, shiftRequests, loadError }: {
  barberName: string
  shop: ShopWithStatus
  appointments: AppointmentDetailed[]
  conversations: ConversationDetailed[]
  rules: AvailabilityRule[]
  employment: BarberEmployment | null
  absences: BarberAbsence[]
  shiftRequests: ShiftChangeRequest[]
  loadError: string
}) {
  const upcoming = useMemo(() => appointments
    .filter((appointment) => appointment.status === 'pending' || appointment.status === 'confirmed')
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    .slice(0, 5), [appointments])
  const nextShifts = useMemo(() => [...rules]
    .sort((left, right) => nextWeekdayDistance(left.weekday) - nextWeekdayDistance(right.weekday))
    .slice(0, 3), [rules])
  const unread = conversations.reduce((total, conversation) => total + conversation.unread_count, 0)

  return (
    <DoodleBoard
      userName={barberName}
      centerLabel={shop.name}
      liveTone={shop.status === 'open' ? 'green' : shop.status === 'busy' ? 'yellow' : 'red'}
    >
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

function employmentLabel(value: HiringShop['hiring']['employment_type']) {
  if (value === 'full_time') return 'Full-time'
  if (value === 'part_time') return 'Part-time'
  return 'Chair rental'
}

function nextWeekdayDistance(weekday: number) {
  return (weekday - new Date().getDay() + 7) % 7
}
