import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AppointmentDetailed, ConversationDetailed, ShopWithStatus } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { relativeTime, timeOfDay } from '../lib/format'
import { DoodleIcon, type DoodleIconName } from '../theme/DoodleDefs'
import './ShopOwnerDashboard.css'
import './BarberDashboard.css'

interface BarberDashboardProps {
  barberId: string
  barberName: string
  pending: boolean
}

const APPOINTMENTS = [
  { customer: 'Mika Santos', service: 'Signature fade', time: '9:00 AM', status: 'confirmed' },
  { customer: 'Paolo Reyes', service: 'Classic haircut', time: '10:30 AM', status: 'confirmed' },
  { customer: 'Andrei Cruz', service: 'Cut + beard', time: '1:00 PM', status: 'pending' },
  { customer: 'Joey Lim', service: 'Textured crop', time: '3:30 PM', status: 'confirmed' },
  { customer: 'Carlo Mendoza', service: 'Classic haircut', time: '8:00 AM', status: 'completed' },
] as const

const REVIEWS = [
  { name: 'Carlo M.', score: '5.0', text: 'Malinis ang fade at sakto sa peg ko.' },
  { name: 'Jomar P.', score: '4.8', text: 'Mabilis kausap at solid ang attention to detail.' },
] as const

const CHATS = [
  { name: 'Mika Santos', message: 'Kuya, low fade po pero keep the top.', time: '2m', unread: true },
  { name: 'Paolo Reyes', message: 'Okay lang po ba maaga ng 10 minutes?', time: '18m', unread: true },
  { name: 'Andrei Cruz', message: 'Salamat sa confirmation!', time: '1h', unread: false },
] as const

const RAIL_ITEMS: Array<{ icon: DoodleIconName; label: string }> = [
  { icon: 'chair', label: 'Overview' },
  { icon: 'calendar', label: 'Bookings' },
  { icon: 'star', label: 'Ratings' },
  { icon: 'pole', label: 'Shop details' },
  { icon: 'chat', label: 'Messages' },
]

type AppointmentFilter = 'today' | 'upcoming' | 'completed'

interface DashboardAppointmentRow {
  customer: string
  service: string
  time: string
  status: string
  startsAt: string | null
}

/**
 * Barber overview. Preview data muna ang ratings at shop details habang wala pa
 * ang reviews/shop-membership tables; actions are routed to the existing tools.
 */
export function BarberDashboard({ barberId, barberName, pending }: BarberDashboardProps) {
  const backend = useBackend()
  const [appointments, setAppointments] = useState<AppointmentDetailed[]>([])
  const [conversations, setConversations] = useState<ConversationDetailed[]>([])
  const [shop, setShop] = useState<ShopWithStatus | null>(null)
  const [query, setQuery] = useState('')
  const [appointmentFilter, setAppointmentFilter] = useState<AppointmentFilter>('today')

  useEffect(() => {
    // Pending request has no professional records yet, kaya sample preview muna.
    if (pending) return
    let active = true
    Promise.all([
      backend.bookings.listMine(),
      backend.chat.listConversations(),
      backend.shops.list(),
    ]).then(([myAppointments, myConversations, shops]) => {
      if (!active) return
      setAppointments(myAppointments)
      setConversations(myConversations)
      setShop(shops.find((candidate) => candidate.barber_ids.includes(barberId)) ?? null)
    }).catch(() => {
      // Dashboard stays usable even if one preview request fails.
      if (active) {
        setAppointments([])
        setConversations([])
        setShop(null)
      }
    })
    return () => { active = false }
  }, [backend, barberId, pending])

  const appointmentRows = useMemo(() => {
    const rows: DashboardAppointmentRow[] = pending
      ? APPOINTMENTS.map((appointment) => ({ ...appointment, startsAt: null }))
      : appointments.map((appointment) => ({
          customer: appointment.customer.full_name,
          service: appointment.service.name,
          time: timeOfDay(appointment.starts_at),
          status: appointment.status,
          startsAt: appointment.starts_at,
        }))
    const needle = query.trim().toLowerCase()
    return rows.filter((appointment) => {
      if (needle && ![appointment.customer, appointment.service, appointment.status]
        .some((value) => value.toLowerCase().includes(needle))) return false
      if (appointmentFilter === 'completed') return appointment.status === 'completed'
      if (appointment.status !== 'pending' && appointment.status !== 'confirmed') return false
      if (appointmentFilter === 'upcoming' || appointment.startsAt === null) return true
      return isToday(appointment.startsAt)
    }).slice(0, 4)
  }, [appointmentFilter, appointments, pending, query])
  const chatRows = pending
    ? CHATS
    : conversations.slice(0, 3).map((conversation) => ({
      name: conversation.customer.full_name,
      message: conversation.last_message?.body ?? 'Wala pang message.',
      time: conversation.last_message ? relativeTime(conversation.last_message.created_at) : '',
      unread: conversation.unread_count > 0,
    }))
  const confirmedCount = pending ? 6 : appointments.filter((appointment) => appointment.status === 'confirmed').length
  const completedCount = pending ? 24 : appointments.filter((appointment) => appointment.status === 'completed').length
  const unreadCount = pending ? 2 : conversations.reduce((total, conversation) => total + conversation.unread_count, 0)
  const shopDetails = shop ?? (pending ? {
    name: 'Fresh Cut Barbershop',
    address: 'Dr. A. Santos Ave.',
    city: 'Paranaque City',
  } : null)

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="owner-board-wrap barber-board-wrap">
      <div className="owner-board barber-board" id="barber-overview">
        <aside className="owner-rail barber-rail" aria-label="Barber dashboard sections">
          <div className="owner-rail-mark" aria-hidden="true">
            <span className="brand-pole" />
            <strong>PB</strong>
          </div>
          <div className="owner-rail-links">
            {RAIL_ITEMS.map((item, index) => {
              const targetId = ['barber-overview', 'barber-bookings', 'barber-ratings', 'barber-shop', 'barber-chats'][index]
              return (
                <button
                  type="button"
                  className={index === 0 ? 'is-active' : ''}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => scrollToSection(targetId)}
                  key={item.label}
                >
                  <DoodleIcon name={item.icon} size={21} />
                </button>
              )
            })}
          </div>
          <DoodleIcon name="razor" size={29} className="owner-rail-scissors" />
        </aside>

        <div className="owner-workspace">
          <header className="owner-topbar">
            <label className="owner-search">
              <DoodleIcon name="scissors" size={17} />
              <input
                aria-label="Search my bookings"
                placeholder="Search my bookings..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="owner-shop-name">
              <span className="owner-live-dot" />
              <span>{shopDetails ? `${shopDetails.name}, ${shopDetails.city}` : 'Wala pang shop assignment'}</span>
            </div>
            <div className="owner-profile-chip barber-profile-chip">
              <span>{initials(barberName)}</span>
              <strong>{barberName}</strong>
            </div>
          </header>

          {pending && (
            <div className="owner-preview-banner" role="status">
              <DoodleIcon name="clock" size={26} />
              <div>
                <strong>Barber dashboard preview</strong>
                <span>Sample data muna habang vine-verify ang account at shop membership mo.</span>
              </div>
              <span className="pill pill-pink">Pending</span>
            </div>
          )}

          <div className="owner-dashboard-grid barber-dashboard-grid">
            <main className="owner-main-column">
              {/* Mabilisang pulse ng araw bago tingnan ang buong schedule. */}
              <section className="owner-metrics" aria-label="Barber totals">
                <BarberMetric icon="check" label="Confirmed" value={twoDigits(confirmedCount)} tone="green" />
                <BarberMetric icon="scissors" label="Completed cuts" value={twoDigits(completedCount)} tone="yellow" />
                <BarberMetric icon="chat" label="Unread chats" value={twoDigits(unreadCount)} tone="pink" />
              </section>

              <section className="owner-paper-card owner-reservations barber-schedule" id="barber-bookings">
                <div className="owner-card-heading">
                  <div>
                    <span className="owner-card-kicker">today at your chair</span>
                    <h2>My appointments</h2>
                  </div>
                  <Link className="btn btn-sm" to="/appointments">View all</Link>
                </div>

                <div className="owner-service-tabs" aria-label="Appointment filters">
                  {(['today', 'upcoming', 'completed'] as const).map((filter) => (
                    <button
                      type="button"
                      className={appointmentFilter === filter ? 'is-active' : ''}
                      aria-pressed={appointmentFilter === filter}
                      onClick={() => setAppointmentFilter(filter)}
                      key={filter}
                    >{filter[0].toUpperCase() + filter.slice(1)}</button>
                  ))}
                </div>

                <div className="owner-table-scroll">
                  <table>
                    <thead>
                      <tr><th>Customer</th><th>Time</th><th>Service</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {appointmentRows.map((appointment, index) => (
                        <tr key={`${appointment.customer}-${appointment.time}`}>
                          <td><span className="owner-row-number">{index + 1}</span><strong>{appointment.customer}</strong></td>
                          <td>{appointment.time}</td>
                          <td>{appointment.service}</td>
                          <td><span className={`owner-status is-${appointment.status}`}>{appointment.status}</span></td>
                        </tr>
                      ))}
                      {appointmentRows.length === 0 && (
                        <tr><td className="barber-table-empty" colSpan={4}>Walang booking na tugma sa filter.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="owner-bottom-grid barber-bottom-grid">
                <section className="owner-paper-card barber-rating-card" id="barber-ratings">
                  <div className="owner-card-heading compact">
                    <div>
                      <span className="owner-card-kicker">customer love</span>
                      <h2>My rating</h2>
                    </div>
                    <span className="pill">rating preview</span>
                  </div>
                  <div className="barber-rating-summary">
                    <strong>4.9</strong>
                    <div>
                      <div className="barber-stars" aria-label="4.9 out of 5 stars">
                        {[1, 2, 3, 4, 5].map((star) => <DoodleIcon name="star" size={23} key={star} />)}
                      </div>
                      <span>Top 8% sa shop</span>
                    </div>
                  </div>
                  <div className="barber-rating-bars" aria-hidden="true">
                    <RatingBar label="5" width="91%" />
                    <RatingBar label="4" width="7%" />
                    <RatingBar label="3" width="2%" />
                  </div>
                </section>

                <section className="owner-paper-card barber-reviews-card">
                  <div className="owner-card-heading compact">
                    <h2>Latest feedback</h2>
                    <DoodleIcon name="star" size={25} />
                  </div>
                  {REVIEWS.map((review) => (
                    <blockquote key={review.name}>
                      <p>&ldquo;{review.text}&rdquo;</p>
                      <footer><strong>{review.name}</strong><span>{review.score} / 5</span></footer>
                    </blockquote>
                  ))}
                </section>
              </div>
            </main>

            <aside className="owner-insights barber-insights" aria-label="Barber details and messages">
              <section className="owner-paper-card barber-shop-card" id="barber-shop">
                <div className="barber-card-icon"><DoodleIcon name="pole" size={28} /></div>
                <span className="owner-card-kicker">where you cut</span>
                <h2>Shop details</h2>
                {shopDetails ? (
                  <>
                    <strong>{shopDetails.name}</strong>
                    <p>{shopDetails.address}<br />{shopDetails.city}</p>
                    {pending && (
                      <dl>
                        <div><dt>Chair</dt><dd>#03</dd></div>
                        <div><dt>Hours</dt><dd>10 AM - 7 PM</dd></div>
                        <div><dt>Contact</dt><dd>0917 555 0188</dd></div>
                      </dl>
                    )}
                  </>
                ) : (
                  <p>Wala ka pang assigned shop. Makipag-ugnayan sa shop owner para maidagdag ang chair mo.</p>
                )}
                {/* IMPORTANT: pending users must never reach professional writes. */}
                {pending ? (
                  <button className="btn btn-sm" type="button" disabled>Chair tools locked</button>
                ) : (
                  <Link className="btn btn-sm btn-green" to="/appointments">Manage my chair</Link>
                )}
              </section>

              <section className="owner-paper-card barber-chat-card" id="barber-chats">
                <div className="owner-card-heading compact">
                  <div>
                    <span className="owner-card-kicker">recent</span>
                    <h2>Chats</h2>
                  </div>
                  <Link to="/chat" className="barber-chat-all" aria-label="Open all chats">
                    <DoodleIcon name="arrow" size={22} />
                  </Link>
                </div>
                <div className="barber-chat-list">
                  {chatRows.map((chat) => (
                    <Link to="/chat" className="barber-chat-row" key={chat.name}>
                      <span className="barber-chat-avatar">{initials(chat.name)}</span>
                      <span className="barber-chat-copy">
                        <strong>{chat.name}</strong>
                        <small>{chat.message}</small>
                      </span>
                      <span className="barber-chat-meta">
                        <small>{chat.time}</small>
                        {chat.unread && <i aria-label="Unread message" />}
                      </span>
                    </Link>
                  ))}
                  {chatRows.length === 0 && (
                    <div className="barber-chat-empty">
                      <DoodleIcon name="chat" size={30} />
                      <span>Wala pang customer messages.</span>
                    </div>
                  )}
                </div>
                <Link className="btn btn-sm barber-open-inbox" to="/chat">Open inbox</Link>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

function BarberMetric({ icon, label, value, tone }: { icon: DoodleIconName; label: string; value: string; tone: string }) {
  return (
    <article className={`owner-metric owner-paper-card is-${tone}`}>
      <span className="owner-metric-icon"><DoodleIcon name={icon} size={24} /></span>
      <span><strong>{label}</strong><small>{value}</small></span>
      <span className="owner-metric-scribble" aria-hidden="true" />
    </article>
  )
}

function RatingBar({ label, width }: { label: string; width: string }) {
  return <div><span>{label}</span><i><b style={{ width }} /></i></div>
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'BR'
}

function twoDigits(value: number) {
  return String(value).padStart(2, '0')
}

function isToday(iso: string) {
  const value = new Date(iso)
  const today = new Date()
  return value.getFullYear() === today.getFullYear()
    && value.getMonth() === today.getMonth()
    && value.getDate() === today.getDate()
}
