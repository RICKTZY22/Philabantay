import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import type {
  AppointmentDetailed,
  BarberWithProfile,
  ConversationDetailed,
  Service,
  ShopWithStatus,
} from '@barbershop/shared'
import type { UserLocation } from './ShopMap'
import { useBackend } from '../services/backend'
import { Avatar } from './Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { money } from '../lib/format'
import { googleDrivingDirectionsUrl, straightLineKm } from '../lib/geo'
import { routeSegment } from '../lib/security'
import './CustomerDashboard.css'

// Leaflet stays out of the entry chunk — kukunin lang kapag nabuksan ang
// dashboard. Default export ang ShopMap kaya walang `.then` bridge dito.
const ShopMap = lazy(() => import('./ShopMap'))

type ShopFilter = 'all' | 'open' | 'top'
type ViewMode = 'map' | 'list'
type SortMode = 'nearest' | 'rating' | 'name'
type PriceFilter = 'all' | 'budget' | 'standard' | 'premium'
type AreaMode = 'nearby' | 'all'

interface DiscoveryMeta {
  price: Exclude<PriceFilter, 'all'>
  serviceIds: string[]
  waitMinutes: number
}

// Frontend preview metadata muna. Ililipat ito sa shop_services/queue tables
// kapag nakakabit na ang Supabase adapter.
const DISCOVERY_META: Record<string, DiscoveryMeta> = {
  'sh-tondo': { price: 'standard', serviceIds: ['s-fade', 's-cut', 's-beard', 's-combo'], waitMinutes: 18 },
  'sh-norte': { price: 'premium', serviceIds: ['s-fade', 's-cut', 's-shave'], waitMinutes: 12 },
  'sh-baguio': { price: 'standard', serviceIds: ['s-fade', 's-cut', 's-kids'], waitMinutes: 9 },
  'sh-cebu': { price: 'premium', serviceIds: ['s-fade', 's-beard', 's-combo'], waitMinutes: 22 },
  'sh-iloilo': { price: 'budget', serviceIds: ['s-cut', 's-kids'], waitMinutes: 14 },
  'sh-davao': { price: 'standard', serviceIds: ['s-fade', 's-shave', 's-beard'], waitMinutes: 27 },
  'sh-maginhawa': { price: 'budget', serviceIds: ['s-cut', 's-kids'], waitMinutes: 0 },
  'sh-bfhomes': { price: 'standard', serviceIds: ['s-fade', 's-cut', 's-combo'], waitMinutes: 10 },
  'sh-laspinas': { price: 'budget', serviceIds: ['s-cut', 's-beard', 's-kids'], waitMinutes: 8 },
  'sh-poblacion': { price: 'premium', serviceIds: ['s-fade', 's-shave', 's-combo'], waitMinutes: 20 },
}

/** Hidden geographic boundary for "Near me"; never shown as travel distance. */
const NEARBY_RADIUS_KM = 10
const NEAREST_LIST_LIMIT = 7

const STATUS_LABEL: Record<ShopWithStatus['status'], string> = {
  open: 'Open — may bakante',
  busy: 'Busy — puno ang chairs',
  closed: 'Closed',
}

const STATUS_PILL: Record<ShopWithStatus['status'], string> = {
  open: 'pill pill-on',
  busy: 'pill pill-busy',
  closed: 'pill pill-off',
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="cd-stars" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <DoodleIcon key={i} name="star" size={14} className={i <= Math.round(rating) ? 'is-lit' : 'is-dim'} />
      ))}
    </span>
  )
}

export function CustomerDashboard({ firstName }: { firstName: string }) {
  const backend = useBackend()
  const navigate = useNavigate()

  const [shops, setShops] = useState<ShopWithStatus[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [allBarbers, setAllBarbers] = useState<BarberWithProfile[]>([])
  const [availableBarbers, setAvailableBarbers] = useState<BarberWithProfile[]>([])
  const [bookings, setBookings] = useState<AppointmentDetailed[]>([])
  const [conversations, setConversations] = useState<ConversationDetailed[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [filter, setFilter] = useState<ShopFilter>('all')
  const [areaMode, setAreaMode] = useState<AreaMode>('nearby')
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [mapResetKey, setMapResetKey] = useState(0)
  const [sortMode, setSortMode] = useState<SortMode>('nearest')
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const modalReturnFocusRef = useRef<HTMLElement | null>(null)
  const modalCloseRef = useRef<HTMLButtonElement | null>(null)
  const [openingChatWith, setOpeningChatWith] = useState<string | null>(null)
  const [referralCopied, setReferralCopied] = useState(false)

  // Auto-locate: pagbukas pa lang, alam na ng map kung nasaan ka.
  const [userLoc, setUserLoc] = useState<UserLocation | null>(null)
  const [locState, setLocState] = useState<'asking' | 'on' | 'off'>('asking')
  const [locationAttempt, setLocationAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoadError(null)
    Promise.all([
      backend.shops.list(),
      backend.barbers.list(),
      backend.barbers.availableNow(),
      backend.bookings.listMine(),
      backend.chat.listConversations(),
      backend.favorites.list(),
      backend.services.list(),
    ]).then(([shopList, all, available, mine, convos, favs, serviceList]) => {
      if (!active) return
      setShops(shopList)
      setAllBarbers(all)
      setAvailableBarbers(available)
      setBookings(mine)
      setConversations(convos)
      setFavoriteIds(favs)
      setServices(serviceList)
    }).catch((error: unknown) => {
      if (!active) return
      console.error('[dashboard] Failed to load discovery data.', error)
      setLoadError('Hindi ma-load ang dashboard data. Pakisubukan ulit.')
    })
    return () => {
      active = false
    }
  }, [backend, loadAttempt])

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocState('off')
      setAreaMode('all')
      setSortMode((current) => current === 'nearest' ? 'rating' : current)
      return
    }

    let active = true
    let hasFix = false
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!active) return
        hasFix = true
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocState('on')
      },
      (error) => {
        if (!active || (hasFix && error.code !== error.PERMISSION_DENIED)) return
        setUserLoc(null)
        setLocState('off')
        setAreaMode((current) => current === 'nearby' ? 'all' : current)
        setSortMode((current) => current === 'nearest' ? 'rating' : current)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    )

    return () => {
      active = false
      navigator.geolocation.clearWatch(watchId)
    }
  }, [locationAttempt])

  // Compute each private geographic radius once per GPS/shop update. Values
  // drive filtering/order only and are never presented as travel distance.
  const proximityByShopId = useMemo(() => {
    if (!shops || !userLoc) return null
    return new Map(shops.map((shop) => [shop.id, straightLineKm(userLoc, shop)]))
  }, [shops, userLoc])

  const nearbyShops = useMemo(() => {
    if (!shops || !proximityByShopId) return null
    return [...shops]
      .filter((shop) => (proximityByShopId.get(shop.id) ?? Infinity) <= NEARBY_RADIUS_KM)
      .sort((a, b) => (proximityByShopId.get(a.id) ?? Infinity) - (proximityByShopId.get(b.id) ?? Infinity))
  }, [proximityByShopId, shops])

  const nearbyShopIds = useMemo(() => {
    return nearbyShops ? new Set(nearbyShops.map((shop) => shop.id)) : null
  }, [nearbyShops])

  const filteredShops = useMemo(() => {
    if (!shops) return []
    const result = shops.filter((shop) => {
      const meta = DISCOVERY_META[shop.id]
      if (areaMode === 'nearby' && nearbyShopIds && !nearbyShopIds.has(shop.id)) return false
      if (filter === 'open' && shop.status !== 'open') return false
      if (filter === 'top' && shop.rating < 4.5) return false
      if (priceFilter !== 'all' && meta?.price !== priceFilter) return false
      if (serviceFilter !== 'all' && !meta?.serviceIds.includes(serviceFilter)) return false
      return true
    })
    return result.sort((a, b) => {
      if (sortMode === 'rating') return b.rating - a.rating
      if (sortMode === 'name') return a.name.localeCompare(b.name)
      if (proximityByShopId) {
        return (proximityByShopId.get(a.id) ?? Infinity) - (proximityByShopId.get(b.id) ?? Infinity)
      }
      return b.rating - a.rating
    })
  }, [shops, areaMode, filter, nearbyShopIds, priceFilter, proximityByShopId, serviceFilter, sortMode])

  // The shop popup should only open from an explicit pin/card selection.
  // Escape provides the same dismiss action as the visible close button.
  useEffect(() => {
    if (!selectedId) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedId])

  // Keep the page behind the modal stationary and non-interactive. Restore
  // both page state and keyboard focus when the user closes it.
  useEffect(() => {
    if (!selectedId || viewMode !== 'map') return
    const previousOverflow = document.body.style.overflow
    const appShell = document.querySelector<HTMLElement>('.app-shell')
    const previousInert = appShell?.inert ?? false
    modalReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    if (appShell) appShell.inert = true
    window.requestAnimationFrame(() => modalCloseRef.current?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      if (appShell) appShell.inert = previousInert
      const returnTarget = modalReturnFocusRef.current
      modalReturnFocusRef.current = null
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) returnTarget.focus()
        else document.querySelector<HTMLElement>('.shop-map')?.focus()
      })
    }
  }, [selectedId, viewMode])

  const stats = useMemo(() => {
    const now = Date.now()
    const upcoming = bookings.filter(
      (b) => new Date(b.starts_at).getTime() > now && (b.status === 'pending' || b.status === 'confirmed'),
    )
    const unread = conversations.reduce((sum, c) => sum + c.unread_count, 0)
    return {
      upcoming: upcoming.length,
      unread,
    }
  }, [bookings, conversations])

  // May GPS: hidden 10km radius lang. Walang GPS: top-rated ang ipinapakita.
  const sideShops = useMemo(() => {
    if (nearbyShops) {
      const visibleIds = new Set(filteredShops.map((shop) => shop.id))
      return nearbyShops.filter((shop) => visibleIds.has(shop.id)).slice(0, NEAREST_LIST_LIMIT)
    }
    return [...filteredShops].sort((a, b) => b.rating - a.rating).slice(0, NEAREST_LIST_LIMIT)
  }, [filteredShops, nearbyShops])

  const favoriteShops = useMemo(
    () => (shops ?? []).filter((s) => favoriteIds.includes(s.id)),
    [shops, favoriteIds],
  )

  const selectedShop = shops?.find((s) => s.id === selectedId) ?? null
  const completedCuts = bookings.filter((booking) => booking.status === 'completed').length
  const loyaltyProgress = completedCuts % 10
  const availableIds = useMemo(() => new Set(availableBarbers.map((b) => b.id)), [availableBarbers])
  const selectedShopBarbers = useMemo(
    () => allBarbers.filter((barber) => selectedShop?.barber_ids.includes(barber.id) && availableIds.has(barber.id)),
    [allBarbers, availableIds, selectedShop],
  )
  const selectedShopServices = useMemo(() => {
    if (!selectedShop) return []
    const meta = DISCOVERY_META[selectedShop.id]
    if (!meta) return []
    return meta.serviceIds
      .map((id) => services.find((service) => service.id === id))
      .filter((service): service is Service => Boolean(service))
  }, [selectedShop, services])

  async function openChat(barberId: string) {
    if (openingChatWith) return
    setOpeningChatWith(barberId)
    try {
      const convo = await backend.chat.openConversation(barberId)
      navigate(`/chat/${routeSegment(convo.id)}`)
    } finally {
      setOpeningChatWith(null)
    }
  }

  async function toggleFavorite(shopId: string) {
    setFavoriteIds(await backend.favorites.toggle(shopId))
  }

  async function copyReferralCode() {
    await navigator.clipboard?.writeText('PHILA-DEMO-25')
    setReferralCopied(true)
    window.setTimeout(() => setReferralCopied(false), 1800)
  }

  function showMap() {
    setSelectedId(null)
    setViewMode('map')
    setMapResetKey((key) => key + 1)
  }

  function chooseArea(nextArea: AreaMode) {
    setSelectedId(null)
    setAreaMode(nextArea)
    setMapResetKey((key) => key + 1)
  }

  function retryLocation() {
    setUserLoc(null)
    setLocState('asking')
    setAreaMode('nearby')
    setSortMode('nearest')
    setMapResetKey((key) => key + 1)
    setLocationAttempt((attempt) => attempt + 1)
  }

  if (!shops && loadError) {
    return (
      <div className="cd-loading rough-card" role="alert">
        <DoodleIcon name="pole" size={30} />
        <span>{loadError}</span>
        <button type="button" className="btn btn-sm" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          Retry
        </button>
      </div>
    )
  }

  if (!shops) {
    return (
      <div className="cd-loading rough-card">
        <DoodleIcon name="pole" size={30} />
        <span>Minamarkahan ang mga barbershop sa mapa…</span>
      </div>
    )
  }

  return (
    <div className="cd-shell">
      <div className="cd-main">
        {/* Greeting at useful stats lang; tinanggal ang redundant live-count cards. */}
        <section className="cd-overview" aria-label="Dashboard overview">
          <header className="cd-head">
            <div>
              <h1>Kamusta,<br />{firstName}!</h1>
              <p className="cd-head-sub">
                {locState === 'on' && 'Nakatutok ang mapa sa kinaroroonan mo.'}
                {locState === 'asking' && 'Hinahanap ang lokasyon mo para sa mas mabilis na paghahanap…'}
                {locState === 'off' && 'Buong Pilipinas ang tanaw — i-allow ang location para tumutok sa\'yo.'}
              </p>
            </div>
          </header>

          <div className="cd-stats" aria-label="Quick stats">
            <Link to="/appointments" className="cd-stat cd-stat-blue">
              <span className="cd-stat-icon"><DoodleIcon name="calendar" size={24} /></span>
              <div>
                <strong>{stats.upcoming}</strong>
                <span className="cd-stat-label">Upcoming cuts</span>
              </div>
            </Link>
            <Link to="/chat" className="cd-stat cd-stat-pink">
              <span className="cd-stat-icon"><DoodleIcon name="chat" size={24} /></span>
              <div>
                <strong>{stats.unread}</strong>
                <span className="cd-stat-label">Unread chats</span>
              </div>
            </Link>
          </div>
        </section>

        {/* ---- Map + top rated ---- */}
        <section className="cd-map-grid" aria-label="Barbershop map">
          <div className="cd-card cd-map-card">
            <div className="cd-card-head cd-discovery-head">
              <div>
                <span className="cd-kicker">DISCOVER</span>
                <h2>{areaMode === 'nearby' ? "Mga shop malapit sa'yo" : 'Mga barbershop sa buong PH'}</h2>
              </div>
              <div className="cd-view-toggle" role="group" aria-label="Map or list view">
                <button
                  type="button"
                  className={viewMode === 'map' ? 'is-active' : ''}
                  aria-pressed={viewMode === 'map'}
                  onClick={showMap}
                >Map</button>
                <button
                  type="button"
                  className={viewMode === 'list' ? 'is-active' : ''}
                  aria-pressed={viewMode === 'list'}
                  onClick={() => { setSelectedId(null); setViewMode('list') }}
                >List</button>
              </div>
            </div>

            <div className="cd-filter-bar">
              <div className="cd-chips" role="group" aria-label="Filter shops by area and status">
                <button
                  type="button"
                  className={`cd-chip${areaMode === 'nearby' ? ' is-active' : ''}`}
                  aria-pressed={areaMode === 'nearby' && Boolean(userLoc)}
                  disabled={locState === 'asking' && !userLoc}
                  onClick={() => userLoc ? chooseArea('nearby') : retryLocation()}
                >
                  {locState === 'off' ? 'Retry location' : 'Near me'}
                </button>
                <button
                  type="button"
                  className={`cd-chip${areaMode === 'all' ? ' is-active' : ''}`}
                  aria-pressed={areaMode === 'all'}
                  onClick={() => chooseArea('all')}
                >
                  All PH
                </button>
                <span className="cd-chip-divider" aria-hidden="true" />
                {(
                  [
                    ['all', 'Lahat'],
                    ['open', 'Open now'],
                    ['top', 'Top rated'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`cd-chip${filter === key ? ' is-active' : ''}`}
                    aria-pressed={filter === key}
                    onClick={() => { setSelectedId(null); setFilter(key) }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label>
                <span>Service</span>
                <select value={serviceFilter} onChange={(event) => { setSelectedId(null); setServiceFilter(event.target.value) }}>
                  <option value="all">Any service</option>
                  {services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}
                </select>
              </label>
              <label>
                <span>Price</span>
                <select value={priceFilter} onChange={(event) => { setSelectedId(null); setPriceFilter(event.target.value as PriceFilter) }}>
                  <option value="all">Any price</option>
                  <option value="budget">Budget</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </label>
              <label>
                <span>Sort</span>
                <select value={sortMode} onChange={(event) => { setSelectedId(null); setSortMode(event.target.value as SortMode) }}>
                  <option value="nearest" disabled={!userLoc}>Nearest{userLoc ? '' : ' (location required)'}</option>
                  <option value="rating">Top rated</option>
                  <option value="name">Name A-Z</option>
                </select>
              </label>
            </div>

            {viewMode === 'map' ? (
              <>
            <div className="cd-map-frame">
              <Suspense fallback={<div className="cd-map-loading">Iginuguhit ang mapa…</div>}>
                <ShopMap
                  shops={filteredShops}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  userLocation={userLoc}
                  scope={areaMode}
                  resetKey={mapResetKey}
                />
              </Suspense>
            </div>

            <div className="cd-legend">
              <span><i className="cd-dot is-open" /> Open</span>
              <span><i className="cd-dot is-busy" /> Busy</span>
              <span><i className="cd-dot is-closed" /> Closed</span>
            </div>
              </>
            ) : (
              <ShopList
                shops={filteredShops}
                services={services}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
              />
            )}

            {selectedShop && viewMode === 'map' && createPortal(
              <div
                className="cd-shop-popup-backdrop"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setSelectedId(null)
                }}
              >
              <article
                className="cd-shop-card cd-shop-popup"
                role="dialog"
                aria-modal="true"
                aria-labelledby="selected-shop-title"
              >
                <button
                  type="button"
                  ref={modalCloseRef}
                  className="cd-shop-popup-close"
                  aria-label="Isara ang shop details"
                  onClick={() => setSelectedId(null)}
                >
                  ×
                </button>
                <div className="cd-shop-main">
                  <div className="cd-shop-title">
                    <div>
                      <span className="cd-shop-card-kicker">PINILI MONG SHOP</span>
                      <h3 id="selected-shop-title">{selectedShop.name}</h3>
                    </div>
                    <button
                      type="button"
                      className={`cd-heart${favoriteIds.includes(selectedShop.id) ? ' is-fav' : ''}`}
                      aria-label={
                        favoriteIds.includes(selectedShop.id)
                          ? 'Alisin sa favorites'
                          : 'Idagdag sa favorites'
                      }
                      onClick={() => toggleFavorite(selectedShop.id)}
                    >
                      <DoodleIcon name="heart" size={20} />
                    </button>
                  </div>
                  <span className={STATUS_PILL[selectedShop.status]}>{STATUS_LABEL[selectedShop.status]}</span>
                  <p className="cd-shop-address">
                    {selectedShop.address}, {selectedShop.city}
                  </p>
                  <p className="cd-shop-coordinates">
                    Exact pin: {selectedShop.lat.toFixed(5)}, {selectedShop.lng.toFixed(5)}
                  </p>
                  <p className="cd-shop-rating">
                    <Stars rating={selectedShop.rating} />
                    <strong>{selectedShop.rating.toFixed(1)}</strong>
                    <span className="muted">({selectedShop.rating_count} reviews)</span>
                  </p>
                  <div className="cd-shop-location-actions">
                    <a
                      className="btn btn-sm"
                      href={googleDrivingDirectionsUrl(userLoc, selectedShop)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open driving route
                    </a>
                    <Link className="cd-see-all" to={`/shops/${routeSegment(selectedShop.id)}`}>
                      Full details <DoodleIcon name="arrow" size={15} />
                    </Link>
                  </div>
                </div>
                <section className="cd-shop-services" aria-label="Services and prices">
                  <h4>Cut prices</h4>
                  <div className="cd-shop-price-list">
                    {selectedShopServices.map((service) => (
                      <div key={service.id}>
                        <span>{service.name}<small>{service.duration_min} min</small></span>
                        <strong>{money(service.price_cents)}</strong>
                      </div>
                    ))}
                  </div>
                  {selectedShopServices.length === 0 && (
                    <p className="muted">Wala pang verified service pricing ang shop na ito.</p>
                  )}
                </section>
                <section className="cd-shop-staff" aria-label="Available barbers">
                  <div className="cd-shop-section-title">
                    <h4>Available barbers</h4>
                    <span className="pill pill-on">{selectedShopBarbers.length} free now</span>
                  </div>
                  {selectedShopBarbers.length === 0 && (
                    <p className="muted">Walang bakanteng barber ngayon. Tingnan ulit mamaya o buksan ang full details.</p>
                  )}
                  {selectedShopBarbers.map((barber) => (
                      <div className="cd-staff-row" key={barber.id}>
                        <Avatar name={barber.profile.full_name} />
                        <div className="cd-staff-info">
                          <strong>{barber.profile.full_name}</strong>
                          <span className="pill pill-on">Available</span>
                        </div>
                        <div className="cd-staff-actions">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => openChat(barber.id)}
                            disabled={openingChatWith !== null}
                          >
                            {openingChatWith === barber.id ? 'Opening…' : 'Chat'}
                          </button>
                          <Link className="btn btn-sm btn-green" to={`/barbers/${routeSegment(barber.id)}`}>Book</Link>
                        </div>
                      </div>
                  ))}
                </section>
              </article>
              </div>,
              document.body,
            )}
          </div>

          <div className="cd-map-aside-stack">
            <aside className="cd-card cd-side" aria-label={userLoc ? 'Nearest shops' : 'Top rated shops'}>
              <div className="cd-card-head">
                <h2>{userLoc ? 'Nearest to you' : 'Top rated'}</h2>
              </div>
              <ol className="cd-side-list">
                {userLoc && sideShops.length === 0 && (
                  <li className="cd-side-empty muted">
                    Walang nearby shop na tugma sa filters mo. Subukan ang “All PH” o alisin ang ibang filters.
                  </li>
                )}
                {sideShops.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`cd-side-shop${selectedId === s.id ? ' is-active' : ''}`}
                      onClick={() => {
                        setViewMode('map')
                        setSelectedId(s.id)
                      }}
                    >
                      <span className="cd-side-name">
                        <i className={`cd-dot is-${s.status}`} aria-hidden="true" />
                        {s.name}
                        <em>{s.city}</em>
                      </span>
                      <span className="cd-side-rating">
                        <DoodleIcon name="star" size={13} className="is-lit" /> {s.rating.toFixed(1)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>

            {/* Paboritong shop sa sidebar para magamit ang espasyo sa ilalim ng nearest list. */}
            <section className="cd-card cd-favorites-side" aria-labelledby="cd-fav-title">
              <div className="cd-card-head">
                <h2 id="cd-fav-title"><DoodleIcon name="heart" size={20} className="is-fav" /> Favorite barbershops</h2>
              </div>
              {favoriteShops.length === 0 ? (
                <p className="muted cd-empty">
                  Wala ka pang favorites — i-tap ang <DoodleIcon name="heart" size={15} /> sa shop card para idagdag dito.
                </p>
              ) : (
                <div className="cd-fav-grid">
                  {favoriteShops.map((s) => (
                    <div className="cd-fav-card" key={s.id}>
                      <button
                        type="button"
                        className="cd-heart is-fav"
                        aria-label={`Alisin sa favorites: ${s.name}`}
                        onClick={() => toggleFavorite(s.id)}
                      >
                        <DoodleIcon name="heart" size={18} />
                      </button>
                      <button
                        type="button"
                        className="cd-fav-body"
                        onClick={() => {
                          // A favorite may sit outside the private 10km area.
                          // Reset discovery filters so its pin is guaranteed
                          // to exist when the map and popup open.
                          setAreaMode('all')
                          setFilter('all')
                          setPriceFilter('all')
                          setServiceFilter('all')
                          setSelectedId(s.id)
                          setViewMode('map')
                        }}
                      >
                        <strong>{s.name}</strong>
                        <span className="cd-fav-meta">
                          {s.city}
                        </span>
                        <span className="cd-fav-bottom">
                          <span className={STATUS_PILL[s.status]}>{s.status}</span>
                          <span className="cd-side-rating">
                            <DoodleIcon name="star" size={13} className="is-lit" /> {s.rating.toFixed(1)}
                          </span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>

        <aside className="cd-card cd-engagement cd-engagement-wide" aria-labelledby="cd-rewards-title">
          <div className="cd-card-head">
            <div>
              <span className="cd-kicker">REWARDS</span>
              <h2 id="cd-rewards-title">Cut stamp card</h2>
            </div>
            <span className="pill pill-yellow">{loyaltyProgress}/10</span>
          </div>
          <div className="cd-stamp-row" aria-label={`${loyaltyProgress} of 10 loyalty stamps`}>
            {Array.from({ length: 10 }, (_, index) => (
              <span className={index < loyaltyProgress ? 'is-filled' : ''} key={index + 1}>
                {index < loyaltyProgress ? <DoodleIcon name="check" size={15} /> : index + 1}
              </span>
            ))}
          </div>
          <p className="muted">Every 10 completed cuts, may free classic haircut reward.</p>
          <div className="cd-referral-box">
            <div>
              <strong>Invite a tropa</strong>
              <span>Code: PHILA-DEMO-25</span>
            </div>
            <button type="button" className="btn btn-sm" onClick={copyReferralCode}>
              {referralCopied ? 'Copied!' : 'Copy code'}
            </button>
          </div>
          <Link className="cd-notification-link" to="/settings">
            <DoodleIcon name="chat" size={18} /> Booking and chat notifications <DoodleIcon name="arrow" size={16} />
          </Link>
        </aside>
      </div>
    </div>
  )
}

function ShopList({
  shops,
  services,
  favoriteIds,
  onToggleFavorite,
}: {
  shops: ShopWithStatus[]
  services: Service[]
  favoriteIds: string[]
  onToggleFavorite: (shopId: string) => void
}) {
  return (
    <div className="cd-shop-list-grid">
      {shops.map((shop) => {
        const meta = DISCOVERY_META[shop.id]
        return (
          <article className="cd-discovery-card" key={shop.id}>
            <div className="cd-discovery-card-top">
              <span className={STATUS_PILL[shop.status]}>{STATUS_LABEL[shop.status]}</span>
              <button
                type="button"
                className={`cd-heart${favoriteIds.includes(shop.id) ? ' is-fav' : ''}`}
                aria-label={favoriteIds.includes(shop.id) ? 'Alisin sa favorites' : 'Idagdag sa favorites'}
                onClick={() => onToggleFavorite(shop.id)}
              >
                <DoodleIcon name="heart" size={18} />
              </button>
            </div>
            <h3>{shop.name}</h3>
            <p>{shop.address}, {shop.city}</p>
            <div className="cd-discovery-meta">
              <span><DoodleIcon name="star" size={15} /> {shop.rating.toFixed(1)}</span>
              <span>{shop.city}</span>
              <span>{meta?.price ?? 'pricing pending'}</span>
            </div>
            <div className="cd-service-tags">
              {(meta?.serviceIds ?? []).slice(0, 3).map((id) => {
                const service = services.find((candidate) => candidate.id === id)
                return service ? <span key={id}>{service.name}</span> : null
              })}
            </div>
            <div className="cd-discovery-actions">
              <span>
                {shop.status !== 'open'
                  ? 'Queue unavailable'
                  : meta
                    ? `~${meta.waitMinutes} min wait`
                    : 'Contact shop for wait time'}
              </span>
              <Link className="btn btn-sm btn-primary" to={`/shops/${routeSegment(shop.id)}`}>View shop</Link>
            </div>
          </article>
        )
      })}
      {shops.length === 0 && <p className="muted cd-empty">Walang shop na tugma sa filters mo.</p>}
    </div>
  )
}
