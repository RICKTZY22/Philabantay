import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DataError, type BarberWithProfile, type Service, type ShopWithStatus } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { Avatar } from '../components/Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { Loading } from '../components/Loading'
import { money } from '../lib/format'
import { routeSegment } from '../lib/security'
import './ShopProfilePage.css'

const STATUS_TEXT: Record<ShopWithStatus['status'], string> = {
  open: 'Open now',
  busy: 'Busy - queue available',
  closed: 'Closed for now',
}

export function ShopProfilePage() {
  const { shopId } = useParams<{ shopId: string }>()
  const backend = useBackend()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [shop, setShop] = useState<ShopWithStatus | null>(null)
  const [barbers, setBarbers] = useState<BarberWithProfile[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [openingChat, setOpeningChat] = useState(false)
  const [chatError, setChatError] = useState('')

  useEffect(() => {
    if (!shopId) return
    let active = true
    Promise.all([
      backend.shops.get(shopId),
      backend.barbers.list(),
      backend.services.list(),
      profile ? backend.favorites.list() : Promise.resolve([]),
    ]).then(([shopData, barberList, serviceList, favorites]) => {
      if (!active) return
      setShop(shopData)
      setBarbers(barberList)
      setServices(serviceList)
      setFavoriteIds(favorites)
      setLoaded(true)
    })
    return () => { active = false }
  }, [backend, profile, shopId])

  const shopBarbers = useMemo(
    () => barbers.filter((barber) => shop?.barber_ids.includes(barber.id)),
    [barbers, shop],
  )
  const dutyBarbers = shopBarbers.filter((barber) => barber.shift_status === 'on')
  const estimatedWait = queuePosition === null ? 0 : Math.max(8, queuePosition * 12)

  async function toggleFavorite() {
    if (!shopId) return
    if (!profile) {
      navigate('/login', { state: { from: `/shops/${routeSegment(shopId)}` } })
      return
    }
    setFavoriteIds(await backend.favorites.toggle(shopId))
  }

  function joinQueue() {
    if (!shopId) return
    if (!profile) {
      navigate('/login', { state: { from: `/shops/${routeSegment(shopId)}` } })
      return
    }
    setQueuePosition((current) => current ?? Math.max(2, dutyBarbers.length + 1))
  }

  async function chatWithShop() {
    if (!shopId) return
    if (shopBarbers.length === 0 || openingChat) return
    if (!profile) {
      navigate('/login', { state: { from: `/shops/${routeSegment(shopId)}` } })
      return
    }
    setOpeningChat(true)
    setChatError('')
    try {
      const conversation = await backend.chat.openConversation(shopId)
      navigate(`/chat/${routeSegment(conversation.id)}`)
    } catch (error) {
      setChatError(error instanceof DataError ? error.message : 'Hindi mabuksan ang shop chat. Subukan ulit.')
    } finally {
      setOpeningChat(false)
    }
  }

  if (!loaded) return <Loading label="Binubuksan ang shop profile..." />
  if (!shop) {
    return <div className="rough-card center stack"><h1>Shop not found</h1><Link className="btn" to="/dashboard">Back to discovery</Link></div>
  }

  const isFavorite = favoriteIds.includes(shop.id)
  const queueEnabled = shop.status !== 'closed' && shopBarbers.length > 0

  return (
    <div className="shop-profile-page">
      <Link className="btn btn-ghost btn-sm shop-back" to="/dashboard">&larr; Back to discovery</Link>

      <header className="shop-profile-hero">
        <div className="shop-profile-copy">
          <span className={`pill shop-status is-${shop.status}`}>{STATUS_TEXT[shop.status]}</span>
          <h1>{shop.name}</h1>
          <p>{shop.address}, {shop.city}</p>
          <div className="shop-profile-rating">
            <DoodleIcon name="star" size={22} />
            <strong>{shop.rating.toFixed(1)}</strong>
            <span>{shop.rating_count} reviews</span>
            <span>{shop.available_barber_count} barber available</span>
          </div>
          <div className="shop-profile-actions">
            <button type="button" className={`btn ${isFavorite ? 'btn-pink' : ''}`} onClick={toggleFavorite}>
              <DoodleIcon name="heart" size={19} /> {isFavorite ? 'Saved' : 'Save shop'}
            </button>
            <button type="button" className="btn btn-blue" onClick={chatWithShop} disabled={shopBarbers.length === 0 || openingChat}>
              <DoodleIcon name="chat" size={19} /> {openingChat ? 'Opening...' : 'Chat shop'}
            </button>
          </div>
          {chatError && <p className="form-error" role="alert">{chatError}</p>}
        </div>
        <div className="shop-gallery" aria-label="Shop photo preview">
          <div className="shop-photo is-front"><span>Shop front</span></div>
          <div className="shop-photo is-chair"><span>Cut station</span></div>
          <div className="shop-photo is-cuts"><span>Fresh cuts</span></div>
        </div>
      </header>

      <div className="shop-profile-grid">
        <main className="shop-profile-main">
          <section className="shop-section-card" aria-labelledby="shop-services-title">
            <div className="shop-section-head">
              <div><span>MENU BOARD</span><h2 id="shop-services-title">Services and prices</h2></div>
              <span className="pill">Walk-in or book</span>
            </div>
            <div className="shop-services-grid">
              {services.map((service) => (
                <article key={service.id}>
                  <span className="shop-service-icon"><DoodleIcon name="scissors" size={22} /></span>
                  <div><strong>{service.name}</strong><span>{service.duration_min} minutes</span></div>
                  <b>{money(service.price_cents)}</b>
                </article>
              ))}
            </div>
          </section>

          <section className="shop-section-card" aria-labelledby="shop-barbers-title">
            <div className="shop-section-head">
              <div><span>ON THE FLOOR</span><h2 id="shop-barbers-title">Barbers on duty</h2></div>
              <span className="pill pill-on">{dutyBarbers.length} active</span>
            </div>
            <div className="shop-barber-grid">
              {shopBarbers.map((barber, index) => {
                const onDuty = barber.shift_status === 'on'
                return (
                  <article key={barber.id}>
                    <Avatar name={barber.profile.full_name} size={58} />
                    <div>
                      <strong>{barber.profile.full_name}</strong>
                      <span>{barber.bio}</span>
                      <span className="shop-specialty">{['Fades and lineups', 'Beards and shaves', 'Classic and kids cuts'][index % 3]}</span>
                    </div>
                    <div className="shop-barber-cta">
                      <span className={onDuty ? 'pill pill-on' : 'pill pill-off'}>{onDuty ? 'On duty' : 'Off shift'}</span>
                      <Link className="btn btn-sm btn-primary" to={`/barbers/${routeSegment(barber.id)}`}>Profile / book</Link>
                    </div>
                  </article>
                )
              })}
              {shopBarbers.length === 0 && <p className="muted">Wala pang assigned barbers dito.</p>}
            </div>
          </section>
        </main>

        <aside className="shop-profile-side">
          <section className="shop-queue-card">
            <span className="shop-queue-icon"><DoodleIcon name="clock" size={30} /></span>
            <span className="shop-card-kicker">LIVE QUEUE</span>
            <h2>{queuePosition ? `You are #${queuePosition}` : 'Skip the long wait'}</h2>
            {queuePosition ? (
              <>
                <strong className="shop-wait-time">~{estimatedWait} min</strong>
                <p>Estimated wait. Magpapadala ng notification bago ang turn mo.</p>
                <button type="button" className="btn btn-danger" onClick={() => setQueuePosition(null)}>Leave queue</button>
              </>
            ) : (
              <>
                <p>{queueEnabled ? `${shop.available_barber_count} chair ang puwedeng tumanggap ngayon.` : 'Queue is unavailable habang closed ang shop.'}</p>
                <button type="button" className="btn btn-primary" disabled={!queueEnabled} onClick={joinQueue}>Join queue - one tap</button>
              </>
            )}
          </section>

          <section className="shop-hours-card">
            <span className="shop-card-kicker">SHOP DETAILS</span>
            <h2>Opening hours</h2>
            <dl>
              <div><dt>Mon - Sat</dt><dd>9:00 AM - 8:00 PM</dd></div>
              <div><dt>Sunday</dt><dd>10:00 AM - 6:00 PM</dd></div>
              <div><dt>Walk-ins</dt><dd>Until 7:30 PM</dd></div>
            </dl>
            <p><DoodleIcon name="pole" size={18} /> {shop.address}, {shop.city}</p>
          </section>

          <section className="shop-review-card">
            <span className="shop-card-kicker">LATEST REVIEW</span>
            <h2>&ldquo;Solid ang fade.&rdquo;</h2>
            <p>Malinis ang station at mabilis ang queue update. Babalik ulit.</p>
            <strong>Jomar P. <span>5.0 / 5</span></strong>
          </section>
        </aside>
      </div>
    </div>
  )
}
