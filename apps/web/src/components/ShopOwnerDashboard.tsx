import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  APPOINTMENT_STATUS_LABELS,
  canonicalAppointmentStatus,
  DataError,
  isUpcomingAppointment,
  WEEKDAY_LABELS,
  type AppointmentDetailed,
  type ShopJoinCodeDetails,
  type ShopStaffMember,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { dayLabel, money, timeOfDay } from '../lib/format'
import { localDateKey } from '../lib/date'
import type { OwnerDashboardSection } from '../config/navigation'
import { DoodleIcon, type DoodleIconName } from '../theme/DoodleDefs'
import { Avatar } from './Avatar'
import { DoodleBoard } from './DoodleBoard'
import { OwnerStaffPanel } from './OwnerStaffPanel'
import './ShopOwnerDashboard.css'

interface ShopOwnerDashboardProps {
  ownerName: string
  section: OwnerDashboardSection
}

type RangeKey = 'week' | 'month' | 'all'

const RANGE_LABEL: Record<RangeKey, string> = { week: 'Last 7 days', month: 'Last 30 days', all: 'All time' }

interface Bucket {
  label: string
  revenue: number
  deals: number
}

/** Completed bookings binned per day / week / month para sa owner charts. */
function buildBuckets(appointments: AppointmentDetailed[], range: RangeKey, nowMs: number): Bucket[] {
  const completed = appointments.filter((appointment) => appointment.status === 'completed')
  const now = new Date(nowMs)

  if (range === 'week') {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(now)
      day.setDate(now.getDate() - (6 - index))
      const key = localDateKey(day)
      const slice = completed.filter((appointment) => localDateKey(new Date(appointment.starts_at)) === key)
      return {
        label: day.toLocaleDateString('en-PH', { weekday: 'short' }),
        revenue: slice.reduce((sum, appointment) => sum + appointment.service.price_cents, 0),
        deals: slice.length,
      }
    })
  }

  if (range === 'month') {
    return Array.from({ length: 5 }, (_, index) => {
      const end = new Date(now)
      end.setDate(now.getDate() - (4 - index) * 6)
      end.setHours(23, 59, 59, 999)
      const start = new Date(end)
      start.setDate(end.getDate() - 5)
      start.setHours(0, 0, 0, 0)
      const slice = completed.filter((appointment) => {
        const startsAt = new Date(appointment.starts_at)
        return startsAt >= start && startsAt <= end
      })
      return {
        label: start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        revenue: slice.reduce((sum, appointment) => sum + appointment.service.price_cents, 0),
        deals: slice.length,
      }
    })
  }

  const byMonth = new Map<string, Bucket>()
  completed.forEach((appointment) => {
    const startsAt = new Date(appointment.starts_at)
    const key = `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}`
    const bucket = byMonth.get(key) ?? {
      label: startsAt.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }),
      revenue: 0,
      deals: 0,
    }
    bucket.revenue += appointment.service.price_cents
    bucket.deals += 1
    byMonth.set(key, bucket)
  })
  return [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => bucket)
}

function shortMoney(cents: number): string {
  const pesos = cents / 100
  if (pesos >= 1000) return `₱${(pesos / 1000).toFixed(pesos >= 10000 ? 0 : 1)}k`
  return `₱${Math.round(pesos)}`
}

export function ShopOwnerDashboard({ ownerName, section }: ShopOwnerDashboardProps) {
  const backend = useBackend()
  const nowEpochMs = useCurrentTime()
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<RangeKey>('month')
  const [appointments, setAppointments] = useState<AppointmentDetailed[] | null>(null)
  const [staff, setStaff] = useState<ShopStaffMember[]>([])
  const [joinCode, setJoinCode] = useState<ShopJoinCodeDetails | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoadError('')
    Promise.all([
      backend.bookings.listForMyShop(),
      backend.employment.listMyShopStaff(),
      backend.employment.getMyShopJoinCode(),
    ]).then(([shopAppointments, shopStaff, code]) => {
      if (!active) return
      setAppointments(shopAppointments)
      setStaff(shopStaff)
      setJoinCode(code)
    }).catch((error: unknown) => {
      if (!active) return
      setLoadError(error instanceof DataError ? error.message : 'Hindi ma-load ang shop workspace.')
      setAppointments([])
    })
    return () => {
      active = false
    }
  }, [backend, loadAttempt])

  const refresh = () => setLoadAttempt((attempt) => attempt + 1)
  const decideReservation = async (
    appointment: AppointmentDetailed,
    decision: 'accept' | 'decline',
  ) => {
    const version = appointment.version ?? 1
    const updated = decision === 'accept'
      ? await backend.bookings.accept(appointment.id, { expected_version: version })
      : await backend.bookings.decline(appointment.id, {
          expected_version: version,
          reason: 'Declined by the shop owner.',
        })
    setAppointments((current) => current?.map((appointment) => (
      appointment.id === updated.id ? { ...appointment, ...updated } : appointment
    )) ?? null)
  }
  const shopName = joinCode?.shop.name ?? appointments?.[0]?.shop.name ?? 'Your barbershop'
  const loaded = appointments !== null

  // ---- Derived analytics (lahat galing sa totoong bookings) ----
  const completed = useMemo(
    () => (appointments ?? []).filter((appointment) => appointment.status === 'completed'),
    [appointments],
  )
  const buckets = useMemo(() => buildBuckets(appointments ?? [], range, nowEpochMs), [appointments, range, nowEpochMs])
  const rangeRevenue = buckets.reduce((sum, bucket) => sum + bucket.revenue, 0)
  const rangeDeals = buckets.reduce((sum, bucket) => sum + bucket.deals, 0)

  const topVisitors = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>()
    completed.forEach((appointment) => {
      const entry = counts.get(appointment.customer_id) ?? { name: appointment.customer.full_name, count: 0 }
      entry.count += 1
      counts.set(appointment.customer_id, entry)
    })
    return [...counts.values()].sort((left, right) => right.count - left.count).slice(0, 5)
  }, [completed])

  const topServices = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>()
    ;(appointments ?? [])
      .filter((appointment) => !['cancelled', 'declined', 'expired'].includes(canonicalAppointmentStatus(appointment.status)))
      .forEach((appointment) => {
        const entry = counts.get(appointment.service_id) ?? { name: appointment.service.name, count: 0 }
        entry.count += 1
        counts.set(appointment.service_id, entry)
      })
    return [...counts.values()].sort((left, right) => right.count - left.count).slice(0, 5)
  }, [appointments])

  const upcoming = useMemo(
    () => (appointments ?? []).filter((appointment) => isUpcomingAppointment(appointment, nowEpochMs)),
    [appointments, nowEpochMs],
  )

  return (
    <DoodleBoard
      userName={ownerName}
      centerLabel={shopName}
      variant="owner"
      search={section === 'reservations' ? {
        value: query,
        onChange: setQuery,
        placeholder: 'Search reservations...',
        ariaLabel: 'Search reservations',
      } : undefined}
    >
      <>
          {loadError && (
            <div className="owner-preview-banner" role="alert">
              <DoodleIcon name="x" size={24} />
              <div><strong>{loadError}</strong></div>
              <button type="button" className="btn btn-sm" onClick={refresh}>Retry</button>
            </div>
          )}

          {!loaded && !loadError && <p className="muted owner-loading-note">Binubuklat ang shop records…</p>}

          {loaded && section === 'overview' && (
            <OwnerOverview
              joinCode={joinCode}
              onJoinCodeChange={setJoinCode}
              buckets={buckets}
              range={range}
              onRangeChange={setRange}
              rangeRevenue={rangeRevenue}
              rangeDeals={rangeDeals}
              completedTotal={completed.length}
              upcomingCount={upcoming.length}
              topVisitors={topVisitors}
              topServices={topServices}
              appointments={appointments ?? []}
            />
          )}

          {loaded && section === 'reservations' && (
            <OwnerReservations
              appointments={appointments ?? []}
              query={query}
              nowEpochMs={nowEpochMs}
              onDecision={decideReservation}
            />
          )}

          {loaded && section === 'staff' && (
            <OwnerStaffPanel staff={staff} onRefresh={refresh} />
          )}

          {loaded && section === 'barbers' && (
            <OwnerBarbersPerformance staff={staff} appointments={appointments ?? []} />
          )}
      </>
    </DoodleBoard>
  )
}

function OwnerOverview({
  joinCode,
  onJoinCodeChange,
  buckets,
  range,
  onRangeChange,
  rangeRevenue,
  rangeDeals,
  completedTotal,
  upcomingCount,
  topVisitors,
  topServices,
  appointments,
}: {
  joinCode: ShopJoinCodeDetails | null
  onJoinCodeChange: (code: ShopJoinCodeDetails) => void
  buckets: Bucket[]
  range: RangeKey
  onRangeChange: (range: RangeKey) => void
  rangeRevenue: number
  rangeDeals: number
  completedTotal: number
  upcomingCount: number
  topVisitors: Array<{ name: string; count: number }>
  topServices: Array<{ name: string; count: number }>
  appointments: AppointmentDetailed[]
}) {
  const backend = useBackend()
  const [rotatingCode, setRotatingCode] = useState(false)
  const [joinCodeError, setJoinCodeError] = useState('')

  async function rotateJoinCode() {
    setRotatingCode(true)
    setJoinCodeError('')
    try {
      onJoinCodeChange(await backend.employment.rotateMyShopJoinCode())
    } catch (error) {
      setJoinCodeError(error instanceof DataError ? error.message : 'Hindi makagawa ng bagong join code.')
    } finally {
      setRotatingCode(false)
    }
  }

  const requestedCount = appointments.filter((appointment) => canonicalAppointmentStatus(appointment.status) === 'requested').length
  const disputedCount = appointments.filter((appointment) => appointment.status === 'disputed').length
  const checkedInCount = appointments.filter((appointment) => appointment.status === 'checked_in').length
  const inProgressCount = appointments.filter((appointment) => appointment.status === 'in_progress').length
  const awaitingCount = appointments.filter((appointment) => appointment.status === 'awaiting_confirmation').length
  const cancelledCount = appointments.filter((appointment) => appointment.status === 'cancelled' || appointment.status === 'declined').length
  const noShowCount = appointments.filter((appointment) => canonicalAppointmentStatus(appointment.status) === 'customer_no_show').length
  const cancellationRate = appointments.length ? Math.round((cancelledCount / appointments.length) * 100) : 0
  const noShowRate = appointments.length ? Math.round((noShowCount / appointments.length) * 100) : 0
  const needsAction = requestedCount + disputedCount
  const nextAppointments = appointments
    .filter((appointment) => ['requested', 'confirmed', 'checked_in'].includes(canonicalAppointmentStatus(appointment.status)) && Date.parse(appointment.starts_at) > Date.now())
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
    .slice(0, 4)

  return (
    <div className="owner-overview-shell">
      <header className="owner-overview-heading">
        <div>
          <span className="owner-card-kicker">live shop command center</span>
          <h1>Overview</h1>
          <p>Bookings, service value, staff signals, and customer patterns in one glance.</p>
        </div>
        <div className="owner-range-toggle" role="group" aria-label="Chart range">
          {(['week', 'month', 'all'] as const).map((key) => (
            <button
              type="button"
              key={key}
              className={range === key ? 'is-active' : ''}
              aria-pressed={range === key}
              onClick={() => onRangeChange(key)}
            >{key === 'week' ? 'Week' : key === 'month' ? 'Month' : 'All time'}</button>
          ))}
        </div>
      </header>

      {needsAction > 0 && (
        <section className="owner-command-alert" aria-label="Reservations needing attention">
          <span className="owner-command-alert-icon"><DoodleIcon name="calendar" size={24} /></span>
          <div>
            <strong>{needsAction} reservation{needsAction === 1 ? '' : 's'} need attention</strong>
            <small>{requestedCount} requested · {disputedCount} disputed · open Reservations from the hamburger menu</small>
          </div>
          <span className="owner-command-alert-count">{needsAction}</span>
        </section>
      )}

      <section className="owner-kpi-matrix" aria-label="Live shop totals">
        <MetricCard icon="calendar" label="Needs action" value={String(needsAction)} meta="requests + disputes" tone="orange" />
        <MetricCard icon="clock" label="Upcoming" value={String(upcomingCount)} meta="future bookings" tone="blue" />
        <MetricCard icon="user" label="Checked in" value={String(checkedInCount)} meta="waiting for a chair" tone="purple" />
        <MetricCard icon="scissors" label="In progress" value={String(inProgressCount)} meta="cutting now" tone="green" />
        <MetricCard icon="check" label="Awaiting confirm" value={String(awaitingCount)} meta="customer action" tone="yellow" />
        <MetricCard icon="star" label="Completed" value={String(completedTotal)} meta="all time" tone="pink" />
        <MetricCard icon="home" label="Service value" value={money(rangeRevenue)} meta={`${RANGE_LABEL[range]} · estimated`} tone="green" />
        <MetricCard icon="check" label="Completed deals" value={String(rangeDeals)} meta={RANGE_LABEL[range]} tone="blue" />
      </section>

      <div className="owner-dashboard-mosaic">
        <section className="owner-paper-card owner-mosaic-card owner-value-panel">
          <div className="owner-card-heading compact">
            <div>
              <span className="owner-card-kicker">{RANGE_LABEL[range]}</span>
              <h2>Completed service value</h2>
            </div>
            <div className="owner-value-summary">
              <strong>{money(rangeRevenue)}</strong>
              <small>estimate · payments not tracked</small>
            </div>
          </div>
          {rangeRevenue > 0 ? (
            <DoodleBars
              points={buckets.map((bucket) => ({ label: bucket.label, value: bucket.revenue }))}
              format={shortMoney}
              ariaLabel={`Completed service value per ${range === 'week' ? 'day' : range === 'month' ? 'week' : 'month'}`}
            />
          ) : (
            <OwnerEmptyChart icon="star" message={`Wala pang completed service value sa ${RANGE_LABEL[range].toLowerCase()}.`} />
          )}
        </section>

        <section className="owner-paper-card owner-mosaic-card owner-next-panel">
          <div className="owner-card-heading compact">
            <div><span className="owner-card-kicker">chair calendar</span><h2>Coming up</h2></div>
            <span className="pill">{nextAppointments.length}</span>
          </div>
          {nextAppointments.length > 0 ? (
            <ol className="owner-next-list">
              {nextAppointments.map((appointment) => (
                <li key={appointment.id}>
                  <time dateTime={appointment.starts_at}>
                    <strong>{new Date(appointment.starts_at).toLocaleDateString('en-PH', { day: '2-digit' })}</strong>
                    <span>{new Date(appointment.starts_at).toLocaleDateString('en-PH', { month: 'short' })}</span>
                  </time>
                  <span><strong>{appointment.customer.full_name}</strong><small>{appointment.service.name} · {timeOfDay(appointment.starts_at)}</small></span>
                  <i
                    className={`owner-next-dot is-${appointment.status}`}
                    role="img"
                    aria-label={APPOINTMENT_STATUS_LABELS[appointment.status]}
                  />
                </li>
              ))}
            </ol>
          ) : <OwnerEmptyChart icon="calendar" message="No upcoming reservations yet." />}
        </section>

        <section className="owner-paper-card owner-mosaic-card owner-deals-panel">
          <div className="owner-card-heading compact">
            <div><span className="owner-card-kicker">throughput</span><h2>Completed deals</h2></div>
            <strong className="owner-revenue-total">{rangeDeals}</strong>
          </div>
          {rangeDeals > 0 ? (
            <DoodleBars
              points={buckets.map((bucket) => ({ label: bucket.label, value: bucket.deals }))}
              format={String}
              ariaLabel="Completed bookings over the selected range"
              tone="green"
            />
          ) : <OwnerEmptyChart icon="check" message="Completed bookings will appear here." />}
        </section>

        <section className="owner-paper-card owner-mosaic-card owner-health-panel">
          <div className="owner-card-heading compact">
            <div><span className="owner-card-kicker">booking health</span><h2>Rates</h2></div>
          </div>
          <div className="owner-ring-row">
            <RingStat value={cancellationRate} label="Cancelled" tone="orange" />
            <RingStat value={noShowRate} label="No-show" tone="purple" />
          </div>
          <p className="owner-panel-note">Based on all shop reservations. Rates are shown with labels, not color alone.</p>
        </section>

        <section className="owner-paper-card owner-mosaic-card owner-ranking-panel">
          <div className="owner-card-heading compact">
            <div><span className="owner-card-kicker">most requested</span><h2>Top services</h2></div>
          </div>
          <RankList rows={topServices} unit="booking" tone="green" />
        </section>

        <section className="owner-paper-card owner-mosaic-card owner-ranking-panel">
          <div className="owner-card-heading compact">
            <div><span className="owner-card-kicker">loyal customers</span><h2>Top visitors</h2></div>
          </div>
          <RankList rows={topVisitors} unit="visit" />
        </section>

        {(joinCode || joinCodeError) && (
          <section className="owner-paper-card owner-mosaic-card owner-access-panel" aria-labelledby="owner-join-code-title">
            <div className="owner-card-heading compact">
              <div><span className="owner-card-kicker">team access</span><h2 id="owner-join-code-title">Barber join code</h2></div>
              <DoodleIcon name="user" size={24} />
            </div>
            <p>{joinCode ? `Share only with a barber hired at ${joinCode.shop.name}.` : joinCodeError}</p>
            {joinCode && <code>{joinCode.code}</code>}
            <button type="button" className="btn btn-sm" disabled={rotatingCode} onClick={() => void rotateJoinCode()}>
              {rotatingCode ? 'Generating...' : 'Generate new code'}
            </button>
          </section>
        )}
      </div>
    </div>
  )
}

function RingStat({ value, label, tone }: { value: number; label: string; tone: 'orange' | 'purple' }) {
  return (
    <div className={`owner-ring-stat is-${tone}`}>
      <span className="owner-ring" style={{ '--owner-ring-value': `${Math.min(Math.max(value, 0), 100) * 3.6}deg` } as CSSProperties}>
        <strong>{value}%</strong>
      </span>
      <small>{label}</small>
    </div>
  )
}

/** Previous overview kept temporarily for visual rollback while this redesign is reviewed. */
export function OwnerOverviewLegacy({
  joinCode,
  onJoinCodeChange,
  buckets,
  range,
  onRangeChange,
  rangeRevenue,
  rangeDeals,
  completedTotal,
  upcomingCount,
  topVisitors,
  topServices,
}: {
  joinCode: ShopJoinCodeDetails | null
  onJoinCodeChange: (code: ShopJoinCodeDetails) => void
  buckets: Bucket[]
  range: RangeKey
  onRangeChange: (range: RangeKey) => void
  rangeRevenue: number
  rangeDeals: number
  completedTotal: number
  upcomingCount: number
  topVisitors: Array<{ name: string; count: number }>
  topServices: Array<{ name: string; count: number }>
}) {
  const backend = useBackend()
  const [rotatingCode, setRotatingCode] = useState(false)
  const [joinCodeError, setJoinCodeError] = useState('')

  async function rotateJoinCode() {
    setRotatingCode(true)
    setJoinCodeError('')
    try {
      onJoinCodeChange(await backend.employment.rotateMyShopJoinCode())
    } catch (error) {
      setJoinCodeError(error instanceof DataError ? error.message : 'Hindi makagawa ng bagong join code.')
    } finally {
      setRotatingCode(false)
    }
  }

  return (
    <>
      {(joinCode || joinCodeError) && (
        <section className="owner-join-code-card" aria-labelledby="owner-join-code-title">
          <DoodleIcon name="user" size={28} />
          <div>
            <span className="owner-card-kicker">team access</span>
            <h2 id="owner-join-code-title">Barber join code</h2>
            <p>{joinCode ? `Ibigay ito sa barber na hired na sa ${joinCode.shop.name}.` : joinCodeError}</p>
          </div>
          {joinCode && <code>{joinCode.code}</code>}
          <button type="button" className="btn btn-sm" disabled={rotatingCode} onClick={() => void rotateJoinCode()}>
            {rotatingCode ? 'Generating...' : 'Generate new code'}
          </button>
        </section>
      )}

      <section className="owner-metrics" aria-label="Shop totals">
        <MetricCard icon="calendar" label="Upcoming bookings" value={String(upcomingCount)} tone="yellow" />
        <MetricCard icon="check" label={`Deals · ${RANGE_LABEL[range].toLowerCase()}`} value={String(rangeDeals)} tone="green" />
        <MetricCard icon="star" label="Completed all time" value={String(completedTotal)} tone="pink" />
      </section>

      <div className="owner-range-row">
        <span className="owner-card-kicker">reporting range</span>
        <div className="owner-range-toggle" role="group" aria-label="Chart range">
          {(['week', 'month', 'all'] as const).map((key) => (
            <button
              type="button"
              key={key}
              className={range === key ? 'is-active' : ''}
              aria-pressed={range === key}
              onClick={() => onRangeChange(key)}
            >{RANGE_LABEL[key]}</button>
          ))}
        </div>
      </div>

      <div className="owner-chart-grid-2">
        <section className="owner-paper-card owner-section-card">
          <div className="owner-card-heading compact">
            <div>
              <span className="owner-card-kicker">{RANGE_LABEL[range]}</span>
              <h2>Revenue</h2>
            </div>
            <strong className="owner-revenue-total">{money(rangeRevenue)}</strong>
          </div>
          {rangeRevenue > 0 ? (
            <DoodleBars
              points={buckets.map((bucket) => ({ label: bucket.label, value: bucket.revenue }))}
              format={shortMoney}
              ariaLabel={`Revenue per ${range === 'week' ? 'day' : range === 'month' ? 'week' : 'month'}`}
            />
          ) : (
            <OwnerEmptyChart icon="star" message={`Wala pang kita sa ${RANGE_LABEL[range].toLowerCase()}. Lalabas dito ang revenue kapag may completed booking na.`} />
          )}
        </section>

        <section className="owner-paper-card owner-section-card">
          <div className="owner-card-heading compact">
            <div>
              <span className="owner-card-kicker">{RANGE_LABEL[range]}</span>
              <h2>Completed deals</h2>
            </div>
            <strong className="owner-revenue-total">{rangeDeals}</strong>
          </div>
          {rangeDeals > 0 ? (
            <DoodleBars
              points={buckets.map((bucket) => ({ label: bucket.label, value: bucket.deals }))}
              format={String}
              ariaLabel={`Completed bookings per ${range === 'week' ? 'day' : range === 'month' ? 'week' : 'month'}`}
              tone="green"
            />
          ) : (
            <OwnerEmptyChart icon="check" message={`Wala pang completed deals sa ${RANGE_LABEL[range].toLowerCase()}.`} />
          )}
        </section>
      </div>

      <div className="owner-chart-grid-2">
        <section className="owner-paper-card owner-section-card">
          <div className="owner-card-heading compact">
            <div>
              <span className="owner-card-kicker">most loyal</span>
              <h2>Top visitors</h2>
            </div>
            <span className="pill">completed visits</span>
          </div>
          <RankList rows={topVisitors} unit="visit" />
        </section>

        <section className="owner-paper-card owner-section-card">
          <div className="owner-card-heading compact">
            <div>
              <span className="owner-card-kicker">most requested</span>
              <h2>Top style</h2>
            </div>
            <span className="pill">bookings</span>
          </div>
          <RankList rows={topServices} unit="booking" tone="green" />
        </section>
      </div>
    </>
  )
}

type ReservationFilter = 'upcoming' | 'all' | 'completed' | 'cancelled'

const RESERVATION_FILTERS: Array<{ key: ReservationFilter; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'Lahat' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled / no-show' },
]

/** Buong booking ledger ng shop — walang kulang na detalye per row. */
function OwnerReservations({ appointments, query, nowEpochMs, onDecision }: {
  appointments: AppointmentDetailed[]
  query: string
  nowEpochMs: number
  onDecision: (appointment: AppointmentDetailed, decision: 'accept' | 'decline') => Promise<void>
}) {
  const [filter, setFilter] = useState<ReservationFilter>('upcoming')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const needle = query.trim().toLowerCase()

  async function decideReservation(appointment: AppointmentDetailed, decision: 'accept' | 'decline') {
    if (busyId) return
    setBusyId(appointment.id)
    setActionError('')
    try {
      await onDecision(appointment, decision)
    } catch (error) {
      setActionError(error instanceof DataError ? error.message : 'Hindi ma-update ang reservation. Subukan ulit.')
    } finally {
      setBusyId(null)
    }
  }

  const rows = useMemo(() => {
    const filtered = appointments.filter((appointment) => {
      const status = canonicalAppointmentStatus(appointment.status)
      if (filter === 'upcoming' && !isUpcomingAppointment(appointment, nowEpochMs)) return false
      if (filter === 'completed' && status !== 'completed') return false
      if (filter === 'cancelled' && !['cancelled', 'declined', 'expired', 'customer_no_show'].includes(status)) return false
      if (needle && ![
        appointment.customer.full_name,
        appointment.barber.profile.full_name,
        appointment.service.name,
      ].some((value) => value.toLowerCase().includes(needle))) return false
      return true
    })
    // Upcoming: pinakamalapit muna. Historical views: pinakabago muna.
    return filtered.sort((left, right) => filter === 'upcoming'
      ? left.starts_at.localeCompare(right.starts_at)
      : right.starts_at.localeCompare(left.starts_at))
  }, [appointments, filter, needle, nowEpochMs])

  return (
    <section className="owner-paper-card owner-reservations" aria-labelledby="owner-reservations-title">
      <div className="owner-card-heading">
        <div>
          <span className="owner-card-kicker">shop ledger</span>
          <h2 id="owner-reservations-title">Reservations</h2>
        </div>
        <span className="pill">{rows.length} booking{rows.length === 1 ? '' : 's'}</span>
      </div>

      <div className="owner-service-tabs" aria-label="Reservation filters">
        {RESERVATION_FILTERS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            className={filter === key ? 'is-active' : ''}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >{label}</button>
        ))}
      </div>

      {actionError && <p className="form-error owner-reservation-error" role="alert">{actionError}</p>}

      <div className="owner-table-scroll">
        <table>
          <thead>
            <tr><th>Customer</th><th>Barber</th><th>Service</th><th>Date &amp; time</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((appointment, index) => (
              <tr key={appointment.id}>
                <td>
                  <span className="owner-row-number">{index + 1}</span>
                  <span>
                    <strong>{appointment.customer.full_name}</strong>
                    {appointment.notes && <small>“{appointment.notes}”</small>}
                  </span>
                </td>
                <td>{appointment.barber.profile.full_name}</td>
                <td>
                  <span className="owner-cell-stack">
                    <strong>{appointment.service.name}</strong>
                    <small>{appointment.service.duration_min} min · {money(appointment.service.price_cents)}</small>
                  </span>
                </td>
                <td>
                  <span className="owner-cell-stack">
                    <strong>{dayLabel(appointment.starts_at)}</strong>
                    <small>{timeOfDay(appointment.starts_at)} – {timeOfDay(appointment.ends_at)}</small>
                  </span>
                </td>
                <td>
                  <div className="owner-reservation-status-cell">
                    <span className={`owner-status is-${canonicalAppointmentStatus(appointment.status)}`}>
                      {APPOINTMENT_STATUS_LABELS[canonicalAppointmentStatus(appointment.status)]}
                    </span>
                    {canonicalAppointmentStatus(appointment.status) === 'requested' && Date.parse(appointment.starts_at) > nowEpochMs && (
                      <div className="owner-reservation-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-green"
                          disabled={busyId !== null}
                          aria-label={`Accept reservation from ${appointment.customer.full_name}`}
                          onClick={() => void decideReservation(appointment, 'accept')}
                        >
                          <DoodleIcon name="check" size={16} />
                          {busyId === appointment.id ? 'Saving…' : 'Accept'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-pink"
                          disabled={busyId !== null}
                          aria-label={`Decline reservation from ${appointment.customer.full_name}`}
                          onClick={() => void decideReservation(appointment, 'decline')}
                        >Decline</button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5}>Walang booking na tugma sa filter{needle ? ' at search' : ''}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * Performance view — hiwalay sa Staff (shifts/attendance): dito makikita kung
 * gaano kagaling ang bawat barber. Lahat computed sa totoong bookings/ratings.
 */
function OwnerBarbersPerformance({ staff, appointments }: {
  staff: ShopStaffMember[]
  appointments: AppointmentDetailed[]
}) {
  const nowMs = useCurrentTime()
  const rows = staff.map((member) => {
    const barberAppointments = appointments.filter((appointment) => appointment.barber_id === member.barber.id)
    const completedCount = barberAppointments.filter((appointment) => appointment.status === 'completed').length
    const noShows = barberAppointments.filter((appointment) => canonicalAppointmentStatus(appointment.status) === 'customer_no_show').length
    const decided = completedCount + noShows
    return {
      member,
      completedCount,
      noShows,
      noShowRate: decided > 0 ? Math.round((noShows / decided) * 100) : 0,
      upcomingCount: barberAppointments.filter((appointment) => isUpcomingAppointment(appointment, nowMs)).length,
      revenue: barberAppointments
        .filter((appointment) => appointment.status === 'completed')
        .reduce((sum, appointment) => sum + appointment.service.price_cents, 0),
    }
  }).sort((left, right) => right.member.barber.rating - left.member.barber.rating)

  if (rows.length === 0) {
    return (
      <section className="owner-paper-card owner-section-card">
        <p className="muted">Wala pang barbers sa roster.</p>
      </section>
    )
  }

  return (
    <div className="owner-performance-grid">
      {rows.map(({ member, completedCount, noShows, noShowRate, revenue, upcomingCount }) => {
        const scheduledDays = new Set<number>(member.rules.map((rule) => rule.weekday))
        const onShift = member.barber.shift_status === 'on'
        return (
          <section className="owner-paper-card owner-performance-card" key={member.barber.id} aria-label={`Performance ni ${member.barber.profile.full_name}`}>
            <header className="owner-performance-head">
              <Avatar name={member.barber.profile.full_name} size={52} />
              <div className="owner-performance-id">
                <strong>{member.barber.profile.full_name}</strong>
                <span className="muted">{member.barber.bio ?? 'Walang bio pa.'}</span>
              </div>
              <span className={`owner-shift-badge ${onShift ? 'is-on' : 'is-off'}`}>{onShift ? 'On shift' : 'Off shift'}</span>
            </header>

            <div className="owner-performance-rating">
              <span className="owner-performance-stars" aria-label={`${member.barber.rating.toFixed(1)} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <DoodleIcon key={star} name="star" size={19} className={star <= Math.round(member.barber.rating) ? 'is-lit' : 'is-dim'} />
                ))}
              </span>
              <strong>{member.barber.rating.toFixed(1)}</strong>
              <span className="muted">({member.barber.rating_count} rating{member.barber.rating_count === 1 ? '' : 's'})</span>
              {member.barber.accepting_bookings
                ? <span className="pill pill-on owner-perf-accepting">Accepting bookings</span>
                : <span className="pill pill-off owner-perf-accepting">Bookings paused</span>}
            </div>

            <div className="owner-perf-days" role="img" aria-label={`Naka-schedule ${scheduledDays.size} araw kada linggo`}>
              {WEEKDAY_LABELS.map((label, day) => (
                <span key={label} className={`owner-perf-day${scheduledDays.has(day) ? ' is-on' : ''}`}>{label.slice(0, 3)}</span>
              ))}
            </div>

            <dl className="owner-performance-stats">
              <div><dt>Completed cuts</dt><dd>{completedCount}</dd></div>
              <div><dt>Revenue</dt><dd>{money(revenue)}</dd></div>
              <div><dt>Upcoming</dt><dd>{upcomingCount}</dd></div>
              <div><dt>No-shows</dt><dd>{noShows} <small>({noShowRate}%)</small></dd></div>
            </dl>
          </section>
        )
      })}
    </div>
  )
}

/** Friendly placeholder that keeps a chart card full-height when there is no data yet. */
function OwnerEmptyChart({ icon, message }: { icon: DoodleIconName; message: string }) {
  return (
    <div className="owner-chart-empty">
      <span className="owner-chart-empty-badge"><DoodleIcon name={icon} size={30} /></span>
      <p>{message}</p>
    </div>
  )
}

function MetricCard({ icon, label, value, meta, tone }: { icon: DoodleIconName; label: string; value: string; meta?: string; tone: string }) {
  return (
    <article className={`owner-metric owner-paper-card is-${tone}`}>
      <span className="owner-metric-icon"><DoodleIcon name={icon} size={24} /></span>
      <span><strong>{label}</strong><small>{value}</small>{meta && <span className="owner-metric-meta">{meta}</span>}</span>
      <span className="owner-metric-scribble" aria-hidden="true" />
    </article>
  )
}

/** Hand-drawn SVG bar chart — data-driven, walang external chart library. */
function DoodleBars({ points, format, ariaLabel, tone = 'teal' }: {
  points: Array<{ label: string; value: number }>
  format: (value: number) => string
  ariaLabel: string
  tone?: 'teal' | 'green'
}) {
  const width = 430
  const height = 180
  const baseY = 146
  const padX = 12
  const max = Math.max(...points.map((point) => point.value), 1)
  const slot = (width - padX * 2) / Math.max(points.length, 1)
  return (
    <svg className={`owner-bars is-${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      <line className="owner-bars-base" x1={6} y1={baseY} x2={width - 6} y2={baseY} />
      {points.map((point, index) => {
        const barHeight = Math.round((point.value / max) * 104)
        const barWidth = Math.min(slot * 0.62, 46)
        const x = padX + index * slot + (slot - barWidth) / 2
        const y = baseY - Math.max(barHeight, point.value > 0 ? 4 : 2)
        return (
          <g key={`${point.label}-${index}`}>
            <rect className="owner-bar" x={x} y={y} width={barWidth} height={Math.max(barHeight, point.value > 0 ? 4 : 2)} rx={5} />
            {point.value > 0 && (
              <text className="owner-bar-value" x={x + barWidth / 2} y={y - 6} textAnchor="middle">{format(point.value)}</text>
            )}
            <text className="owner-bar-label" x={x + barWidth / 2} y={height - 12} textAnchor="middle">{point.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** Ranked horizontal bars (top visitors / top services). */
function RankList({ rows, unit, tone = 'teal' }: {
  rows: Array<{ name: string; count: number }>
  unit: string
  tone?: 'teal' | 'green'
}) {
  const max = Math.max(...rows.map((row) => row.count), 1)
  if (rows.length === 0) return <p className="muted">Wala pang completed bookings.</p>
  return (
    <ol className={`owner-rank-list is-${tone}`}>
      {rows.map((row, index) => (
        <li key={row.name}>
          <span className="owner-rank-number">{index + 1}</span>
          <span className="owner-rank-name">{row.name}</span>
          <span className="owner-rank-bar" aria-hidden="true">
            <i style={{ width: `${Math.max((row.count / max) * 100, 8)}%` }} />
          </span>
          <span className="owner-rank-count">{row.count} {unit}{row.count === 1 ? '' : 's'}</span>
        </li>
      ))}
    </ol>
  )
}
