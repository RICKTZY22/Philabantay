import { useEffect, useMemo, useState } from 'react'
import { DataError, type ShopJoinCodeDetails } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { DoodleIcon, type DoodleIconName } from '../theme/DoodleDefs'
import { DoodleBoard } from './DoodleBoard'
import './ShopOwnerDashboard.css'

interface ShopOwnerDashboardProps {
  ownerName: string
  pending: boolean
}

const RESERVATIONS = [
  { customer: 'Mika Santos', service: 'Haircut', time: '9:00 - 10:00', status: 'confirmed', barber: 'Miguel' },
  { customer: 'Paolo Reyes', service: 'Beard trim', time: '10:00 - 11:00', status: 'confirmed', barber: 'Ramon' },
  { customer: 'Andrei Cruz', service: 'Hair color', time: '11:00 - 12:00', status: 'pending', barber: 'Jules' },
  { customer: 'Joey Lim', service: 'Razor shave', time: '1:00 - 2:00', status: 'pending', barber: 'Ramon' },
  { customer: 'Ben Flores', service: 'Signature fade', time: '2:00 - 3:00', status: 'cancelled', barber: 'Miguel' },
] as const

const SERVICE_FILTERS = ['All cuts', 'Haircut', 'Beard trim', 'Hair color', 'Razor shave'] as const

/** Shop-owner preview. Static sample data muna habang wala pang Supabase tables. */
export function ShopOwnerDashboard({ ownerName, pending }: ShopOwnerDashboardProps) {
  const backend = useBackend()
  const [query, setQuery] = useState('')
  const [serviceFilter, setServiceFilter] = useState<(typeof SERVICE_FILTERS)[number]>('All cuts')
  const [joinCode, setJoinCode] = useState<ShopJoinCodeDetails | null>(null)
  const [joinCodeError, setJoinCodeError] = useState('')
  const [rotatingCode, setRotatingCode] = useState(false)

  useEffect(() => {
    if (pending) return
    backend.employment.getMyShopJoinCode().then(setJoinCode).catch((error) => {
      setJoinCodeError(error instanceof DataError ? error.message : 'Hindi ma-load ang team join code.')
    })
  }, [backend, pending])
  const filteredReservations = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return RESERVATIONS.filter((reservation) => {
      if (serviceFilter !== 'All cuts' && reservation.service !== serviceFilter) return false
      if (!needle) return true
      return [reservation.customer, reservation.service, reservation.status, reservation.barber]
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [query, serviceFilter])

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function rotateJoinCode() {
    setRotatingCode(true)
    setJoinCodeError('')
    try {
      setJoinCode(await backend.employment.rotateMyShopJoinCode())
    } catch (error) {
      setJoinCodeError(error instanceof DataError ? error.message : 'Hindi makagawa ng bagong join code.')
    } finally {
      setRotatingCode(false)
    }
  }

  return (
    <DoodleBoard
      userName={ownerName}
      centerLabel="Philabantay demo shop"
      search={{
        value: query,
        onChange: setQuery,
        placeholder: 'Search reservations...',
        ariaLabel: 'Search reservations',
      }}
    >

          {pending && (
            <div className="owner-preview-banner" role="status">
              <DoodleIcon name="clock" size={26} />
              <div>
                <strong>Preview mode habang vine-verify ang shop mo</strong>
                <span>Sample data ito. Locked muna ang publishing, team edits, at location controls.</span>
              </div>
              <span className="pill pill-pink">Pending</span>
            </div>
          )}

          {!pending && (joinCode || joinCodeError) && (
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

          <div className="owner-dashboard-grid">
            <main className="owner-main-column">
              <section className="owner-metrics" aria-label="Reservation totals">
                <MetricCard icon="check" label="Confirmed" value="07" tone="green" />
                <MetricCard icon="clock" label="Pending" value="04" tone="yellow" />
                <MetricCard icon="x" label="Cancelled" value="03" tone="pink" />
              </section>

              <section className="owner-paper-card owner-reservations" id="owner-reservations">
                <div className="owner-card-heading">
                  <div>
                    <span className="owner-card-kicker">today's chairs</span>
                    <h2>Reservations</h2>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => { setQuery(''); setServiceFilter('All cuts') }}
                  >View all</button>
                </div>

                <div className="owner-service-tabs" aria-label="Service filters">
                  {SERVICE_FILTERS.map((service) => (
                    <button
                      type="button"
                      className={serviceFilter === service ? 'is-active' : ''}
                      aria-pressed={serviceFilter === service}
                      onClick={() => setServiceFilter(service)}
                      key={service}
                    >{service}</button>
                  ))}
                </div>

                <div className="owner-table-scroll">
                  <table>
                    <thead>
                      <tr><th>Customer</th><th>Time</th><th>Status</th><th>Barber</th></tr>
                    </thead>
                    <tbody>
                      {filteredReservations.map((reservation, index) => (
                        <tr key={`${reservation.customer}-${reservation.time}`}>
                          <td>
                            <span className="owner-row-number">{index + 1}</span>
                            <span><strong>{reservation.customer}</strong><small>{reservation.service}</small></span>
                          </td>
                          <td>{reservation.time}</td>
                          <td><span className={`owner-status is-${reservation.status}`}>{reservation.status}</span></td>
                          <td>{reservation.barber}</td>
                        </tr>
                      ))}
                      {filteredReservations.length === 0 && (
                        <tr><td colSpan={4}>Walang reservation na tugma sa filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="owner-bottom-grid" id="owner-report">
                <section className="owner-paper-card owner-chart-card">
                  <div className="owner-card-heading compact">
                    <h2>Top visitors</h2>
                    <span className="pill">This week</span>
                  </div>
                  <VisitorChart />
                </section>

                <section className="owner-paper-card owner-revenue-card">
                  <div>
                    <span className="owner-card-kicker">estimated</span>
                    <h2>Revenue</h2>
                    <div className="owner-chart-legend"><span className="is-service" />Services</div>
                    <div className="owner-chart-legend"><span className="is-product" />Products</div>
                    <small>Total revenue</small>
                    <strong className="owner-revenue-total">PHP 28,450</strong>
                    <span className="owner-growth">+8.3% this week</span>
                  </div>
                  <Donut value="73%" className="is-teal" />
                </section>
              </div>
            </main>

            <aside className="owner-insights" aria-label="Shop insights">
              <InsightCard title="Number of deals" value="1,045" percent="70%" tone="coral" />
              <InsightCard title="Total customers" value="9,476" percent="85%" tone="orange" />
              <section className="owner-paper-card owner-style-card">
                <span className="owner-card-kicker">most requested</span>
                <h2>Top style</h2>
                <p>Signature fade ang pinakamaraming booking ngayong linggo.</p>
                <BarberChairDoodle />
                <button
                  className="btn btn-sm btn-green"
                  type="button"
                  disabled={pending}
                  onClick={() => scrollToSection('owner-report')}
                >See report</button>
              </section>
            </aside>
          </div>
    </DoodleBoard>
  )
}

function MetricCard({ icon, label, value, tone }: { icon: DoodleIconName; label: string; value: string; tone: string }) {
  return (
    <article className={`owner-metric owner-paper-card is-${tone}`}>
      <span className="owner-metric-icon"><DoodleIcon name={icon} size={24} /></span>
      <span><strong>{label}</strong><small>{value}</small></span>
      <span className="owner-metric-scribble" aria-hidden="true" />
    </article>
  )
}

function InsightCard({ title, value, percent, tone }: { title: string; value: string; percent: string; tone: string }) {
  return (
    <section className="owner-paper-card owner-insight-card">
      <div>
        <h3>{title}</h3>
        <p><span className={`owner-dot is-${tone}`} />{percent} successful</p>
        <small>Based on preview activity</small>
      </div>
      <Donut value={value} className={`is-${tone}`} />
    </section>
  )
}

function Donut({ value, className }: { value: string; className: string }) {
  return <div className={`owner-donut ${className}`}><span>{value}</span></div>
}

function VisitorChart() {
  return (
    <svg className="owner-visitors-chart" viewBox="0 0 390 150" role="img" aria-label="Weekly visitor trend rising toward Saturday">
      <g className="owner-chart-grid"><path d="M24 22 H372 M24 58 H372 M24 94 H372 M24 130 H372" /></g>
      <path className="owner-chart-fill" d="M28 114 C55 104 63 48 96 65 S135 122 167 88 S203 33 235 58 S278 91 307 51 S345 69 370 25 L370 132 L28 132 Z" />
      <path className="owner-chart-line" d="M28 114 C55 104 63 48 96 65 S135 122 167 88 S203 33 235 58 S278 91 307 51 S345 69 370 25" />
      <g className="owner-chart-points"><circle cx="28" cy="114" r="4" /><circle cx="96" cy="65" r="4" /><circle cx="167" cy="88" r="4" /><circle cx="235" cy="58" r="4" /><circle cx="307" cy="51" r="4" /><circle cx="370" cy="25" r="4" /></g>
      <g className="owner-chart-days"><text x="25" y="147">Mon</text><text x="91" y="147">Tue</text><text x="160" y="147">Wed</text><text x="229" y="147">Thu</text><text x="301" y="147">Fri</text><text x="359" y="147">Sat</text></g>
    </svg>
  )
}

function BarberChairDoodle() {
  return (
    <svg className="owner-chair-doodle" viewBox="0 0 240 170" aria-hidden="true">
      <path className="chair-shadow" d="M35 150 Q118 132 207 151" />
      <path className="chair-back" d="M92 52 Q92 35 110 34 H157 Q176 35 174 55 L168 111 H95 Z" />
      <path className="chair-seat" d="M78 105 H181 Q190 105 188 117 L185 126 H81 Q73 123 75 114 Z" />
      <path className="chair-base" d="M130 126 V149 M103 154 H159" />
      <circle className="chair-head" cx="131" cy="37" r="22" />
      <path className="chair-hair" d="M109 37 Q106 14 132 13 Q158 14 153 39 Q143 30 133 22 Q125 36 109 37 Z" />
      <path className="chair-cape" d="M102 62 Q130 51 162 64 L177 114 H88 Z" />
      <path className="chair-scissors" d="M43 51 L85 81 M43 81 L85 51 M37 46 a8 8 0 1 0 0 16 a8 8 0 1 0 0 -16 M37 76 a8 8 0 1 0 0 16 a8 8 0 1 0 0 -16" />
      <path className="chair-spark" d="M200 35 V55 M190 45 H210 M194 39 L206 51 M206 39 L194 51" />
    </svg>
  )
}
