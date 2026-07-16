import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { BarberWithProfile, ShopWithStatus } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useLiveLocation, type LiveLocationStatus } from '../hooks/useLiveLocation'
import { NEARBY_DISCOVERY_RADIUS_KM } from '../config/discovery'
import { Avatar } from '../components/Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { Loading } from '../components/Loading'
import { useDoodleAnimations } from '../theme/useDoodleAnimations'
import { isTodayOrLaterLocalDateKey } from '../lib/date'
import { straightLineKm } from '../lib/geo'
import { routeSegment } from '../lib/security'
import './BarbersPage.css'

export function BarbersPage() {
  return <BarberDirectoryPage view="nearby" />
}

export function FavoriteBarbersPage() {
  return <BarberDirectoryPage view="favorites" />
}

type DirectoryView = 'nearby' | 'favorites'

function BarberDirectoryPage({ view }: { view: DirectoryView }) {
  const backend = useBackend()
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const requestedDate = safeDate(searchParams.get('date'))
  const nowEpochMs = useCurrentTime()
  const availabilityMinute = Math.floor(nowEpochMs / 60_000)
  const { location, status: locationStatus, retry: retryLocation } = useLiveLocation(view === 'nearby')

  const [allBarbers, setAllBarbers] = useState<BarberWithProfile[] | null>(null)
  const [shops, setShops] = useState<ShopWithStatus[] | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [availableIds, setAvailableIds] = useState<Set<string> | null>(null)
  const [query, setQuery] = useState('')
  const [loadError, setLoadError] = useState('')
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0)
  const [favoriteError, setFavoriteError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null)
  const ref = useDoodleAnimations<HTMLDivElement>([allBarbers, view])

  useEffect(() => {
    let active = true
    setLoadError('')
    Promise.all([
      backend.barbers.list(),
      backend.shops.list(),
      profile ? backend.favorites.listBarbers() : Promise.resolve([]),
    ]).then(([barbers, shopList, favorites]) => {
      if (!active) return
      setAllBarbers(barbers)
      setShops(shopList)
      setFavoriteIds(favorites)
    }).catch(() => {
      if (active) setLoadError('Hindi ma-load ang barber directory. Pakisubukan ulit.')
    })
    return () => { active = false }
  }, [backend, loadAttempt, profile])

  // Availability is time-sensitive even when the user leaves this page open.
  useEffect(() => {
    let active = true
    setAvailabilityError('')
    backend.barbers.availableNow()
      .then((available) => {
        if (active) setAvailableIds(new Set(available.map((barber) => barber.id)))
      })
      .catch(() => {
        if (active) setAvailabilityError('Hindi ma-refresh ang live availability.')
      })
    return () => { active = false }
  }, [availabilityAttempt, availabilityMinute, backend])

  const shopByBarberId = useMemo(() => {
    const result = new Map<string, ShopWithStatus>()
    shops?.forEach((shop) => shop.barber_ids.forEach((barberId) => result.set(barberId, shop)))
    return result
  }, [shops])

  const proximityByShopId = useMemo(() => {
    if (!location || !shops) return null
    return new Map(shops.map((shop) => [shop.id, straightLineKm(location, shop)]))
  }, [location, shops])

  const needle = query.trim().toLocaleLowerCase()

  const nearbyAvailableBarbers = useMemo(() => {
    if (!allBarbers || !availableIds || !proximityByShopId) return []
    return allBarbers
      .filter((barber) => {
        if (!availableIds.has(barber.id)) return false
        const shop = shopByBarberId.get(barber.id)
        if (!shop) return false
        return (proximityByShopId.get(shop.id) ?? Infinity) <= NEARBY_DISCOVERY_RADIUS_KM
          && matchesBarberSearch(barber, shop, needle)
      })
      .sort((left, right) => {
        const leftShop = shopByBarberId.get(left.id)
        const rightShop = shopByBarberId.get(right.id)
        const leftDistance = leftShop ? proximityByShopId.get(leftShop.id) ?? Infinity : Infinity
        const rightDistance = rightShop ? proximityByShopId.get(rightShop.id) ?? Infinity : Infinity
        return leftDistance - rightDistance || right.rating - left.rating
      })
  }, [allBarbers, availableIds, needle, proximityByShopId, shopByBarberId])

  const favoriteBarbers = useMemo(() => {
    if (!allBarbers) return []
    const favorites = new Set(favoriteIds)
    return allBarbers.filter((barber) => (
      favorites.has(barber.id)
      && matchesBarberSearch(barber, shopByBarberId.get(barber.id), needle)
    ))
  }, [allBarbers, favoriteIds, needle, shopByBarberId])

  async function toggleFavorite(barberId: string) {
    if (favoriteBusyId) return
    setFavoriteBusyId(barberId)
    setFavoriteError('')
    try {
      setFavoriteIds(await backend.favorites.toggleBarber(barberId))
    } catch {
      setFavoriteError('Hindi na-save ang favorite. Pakisubukan ulit.')
    } finally {
      setFavoriteBusyId(null)
    }
  }

  if (loadError && (!allBarbers || !shops)) {
    return (
      <div className="barbers-page">
        <section className="rough-card barber-state" role="alert">
          <DoodleIcon name="scissors" size={34} />
          <div><h1>Hindi mabuksan ang barber directory</h1><p>{loadError}</p></div>
          <button type="button" className="btn btn-primary" onClick={() => setLoadAttempt((current) => current + 1)}>Retry</button>
        </section>
      </div>
    )
  }

  if (!allBarbers || !shops) {
    return <Loading label={view === 'nearby' ? 'Hinahanap ang nearby barbers...' : 'Binubuksan ang favorite barbers...'} />
  }

  const cardProps = {
    availableIds: availableIds ?? new Set<string>(),
    favoriteIds,
    favoriteBusyId,
    profileVisible: Boolean(profile),
    requestedDate,
    shopByBarberId,
    onToggleFavorite: toggleFavorite,
  }

  return (
    <div ref={ref} className="barbers-page">
      <header className="barbers-page-head">
        <div>
          <span className="eyebrow">{view === 'nearby' ? 'LIVE CREW NEAR YOU' : 'YOUR SAVED CREW'}</span>
          <h1>{view === 'nearby' ? 'Nearest barbers' : 'Favorite barbers'}</h1>
          <p>
            {view === 'nearby'
              ? 'Available barbers automatically update as your location changes.'
              : 'Your saved barbers stay together here for quick booking.'}
          </p>
        </div>
        {view === 'nearby'
          ? <LocationStatus status={locationStatus} onRetry={retryLocation} />
          : profile && <span className="barbers-saved-count"><DoodleIcon name="heart" size={18} /> {favoriteBarbers.length} saved</span>}
      </header>

      <nav className="barbers-view-nav" aria-label="Barber directory pages">
        <Link
          to={directoryPath('/barbers', requestedDate)}
          className={view === 'nearby' ? 'is-active' : ''}
          aria-current={view === 'nearby' ? 'page' : undefined}
        >
          <DoodleIcon name="pole" size={18} /> Nearest available
        </Link>
        <Link
          to={directoryPath('/barbers/favorites', requestedDate)}
          className={view === 'favorites' ? 'is-active' : ''}
          aria-current={view === 'favorites' ? 'page' : undefined}
        >
          <DoodleIcon name="heart" size={18} /> Favorites
        </Link>
      </nav>

      <label className="barber-search">
        <DoodleIcon name="search" size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={view === 'nearby' ? 'Search nearby barbers or shops' : 'Search favorite barbers'}
          aria-label={view === 'nearby' ? 'Search nearby barbers' : 'Search favorite barbers'}
        />
      </label>

      {view === 'nearby' && <section className="barbers-section is-nearby" aria-labelledby="nearby-barbers-title">
        <header className="barbers-section-head">
          <div>
            <span className="eyebrow">AVAILABLE NOW</span>
            <h2 id="nearby-barbers-title">Closest open chairs</h2>
          </div>
          {locationStatus === 'on' && <span className="pill pill-on">{nearbyAvailableBarbers.length} nearby</span>}
        </header>

        {locationStatus === 'asking' ? (
          <BarberState icon="pole" title="Finding your location" message="Allow location access so we can show only nearby available barbers." />
        ) : locationStatus === 'off' ? (
          <BarberState icon="pole" title="Location is unavailable" message="Turn on location access, then retry to find nearby open chairs." actionLabel="Retry location" onAction={retryLocation} />
        ) : availableIds === null && availabilityError ? (
          <BarberState
            icon="clock"
            title="Availability needs a refresh"
            message={availabilityError}
            actionLabel="Retry availability"
            onAction={() => setAvailabilityAttempt((current) => current + 1)}
          />
        ) : availableIds === null ? (
          <Loading label="Checking live chairs..." />
        ) : nearbyAvailableBarbers.length === 0 ? (
          <BarberState
            icon="search"
            title={needle ? 'No nearby match' : 'No available barber close by'}
            message={needle ? `Walang nearby result para sa "${query.trim()}".` : 'Patuloy naming imo-monitor ang location at availability habang bukas ang page.'}
          />
        ) : (
          <>
            {availabilityError && <p className="barbers-inline-error" role="status">Showing the last known availability. Refreshing again automatically.</p>}
            <div className="barber-card-grid" data-reveal-group>
              {nearbyAvailableBarbers.map((barber) => <BarberCard key={barber.id} barber={barber} {...cardProps} />)}
            </div>
          </>
        )}
      </section>}

      {view === 'favorites' && <section className="barbers-section is-favorites" aria-labelledby="favorite-barbers-title">
        <header className="barbers-section-head">
          <div>
            <span className="eyebrow">SAVED CREW</span>
            <h2 id="favorite-barbers-title">Favorite barbers</h2>
          </div>
          {profile && <span className="pill pill-pink">{favoriteBarbers.length} saved</span>}
        </header>

        {favoriteError && <p className="barbers-inline-error" role="alert">{favoriteError}</p>}

        {!profile ? (
          <BarberState icon="heart" title="Keep your favorite barbers here" message="Sign in to save barbers and find them again quickly." actionLabel="Sign in" actionTo="/login" />
        ) : favoriteBarbers.length === 0 ? (
          <BarberState
            icon="heart"
            title={needle ? 'No favorite matches your search' : 'Wala ka pang favorite barber'}
            message={needle ? 'Try a different name or clear the search.' : 'Tap the heart on a nearby barber to save them here.'}
          />
        ) : (
          <div className="barber-card-grid" data-reveal-group>
            {favoriteBarbers.map((barber) => <BarberCard key={barber.id} barber={barber} {...cardProps} />)}
          </div>
        )}
      </section>}
    </div>
  )
}

type BarberCardProps = {
  barber: BarberWithProfile
  availableIds: Set<string>
  favoriteIds: string[]
  favoriteBusyId: string | null
  profileVisible: boolean
  requestedDate: string | null
  shopByBarberId: Map<string, ShopWithStatus>
  onToggleFavorite: (barberId: string) => Promise<void>
}

function BarberCard({
  barber,
  availableIds,
  favoriteIds,
  favoriteBusyId,
  profileVisible,
  requestedDate,
  shopByBarberId,
  onToggleFavorite,
}: BarberCardProps) {
  const shop = shopByBarberId.get(barber.id)
  const isAvailable = availableIds.has(barber.id)
  const isFavorite = favoriteIds.includes(barber.id)
  return (
    <article className="rough-card barber-card">
      <Link to={barberPath(barber.id, requestedDate)} className="barber-card-link" aria-label={`View ${barber.profile.full_name}`}>
        <div className={`spread barber-card-head${profileVisible ? ' has-favorite' : ''}`}>
          <div className="row">
            <Avatar name={barber.profile.full_name} />
            <div>
              <h3>{barber.profile.full_name}</h3>
              <span className={isAvailable ? 'pill pill-on' : 'pill pill-off'}>{isAvailable ? 'Available now' : 'Off shift'}</span>
            </div>
          </div>
        </div>
        <span className="barber-card-shop"><DoodleIcon name="chair" size={16} /> {shop ? `${shop.name} · ${shop.city}` : 'Independent barber'}</span>
        <p className="muted">{barber.bio}</p>
        <span className="barber-card-rating"><DoodleIcon name="star" size={17} /> {barber.rating.toFixed(1)} <small>({barber.rating_count} ratings)</small></span>
        <span className="row book-hint">View barber <DoodleIcon name="arrow" size={18} /></span>
      </Link>
      {profileVisible && (
        <button
          type="button"
          className={`barber-card-fav ${isFavorite ? 'is-fav' : ''}`}
          aria-label={isFavorite ? `Remove ${barber.profile.full_name} from favorites` : `Add ${barber.profile.full_name} to favorites`}
          aria-pressed={isFavorite}
          disabled={favoriteBusyId === barber.id}
          onClick={() => void onToggleFavorite(barber.id)}
        >
          <DoodleIcon name="heart" size={19} />
        </button>
      )}
    </article>
  )
}

function LocationStatus({ status, onRetry }: { status: LiveLocationStatus; onRetry: () => void }) {
  if (status === 'on') return <span className="barbers-location-status is-on"><i /> Live location on</span>
  if (status === 'asking') return <span className="barbers-location-status"><i /> Locating...</span>
  return <button type="button" className="barbers-location-status is-off" onClick={onRetry}><i /> Retry location</button>
}

function BarberState({ icon, title, message, actionLabel, actionTo, onAction }: {
  icon: 'clock' | 'heart' | 'pole' | 'search'
  title: string
  message: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
}) {
  return (
    <div className="barber-state">
      <DoodleIcon name={icon} size={32} />
      <div><h3>{title}</h3><p>{message}</p></div>
      {actionLabel && actionTo && <Link className="btn btn-sm btn-primary" to={actionTo}>{actionLabel}</Link>}
      {actionLabel && onAction && <button type="button" className="btn btn-sm btn-primary" onClick={onAction}>{actionLabel}</button>}
    </div>
  )
}

function barberPath(barberId: string, date: string | null) {
  const path = `/barbers/${routeSegment(barberId)}`
  return date ? `${path}?date=${encodeURIComponent(date)}` : path
}

function directoryPath(path: string, date: string | null) {
  return date ? `${path}?date=${encodeURIComponent(date)}` : path
}

function safeDate(value: string | null) {
  return isTodayOrLaterLocalDateKey(value) ? value : null
}

function matchesBarberSearch(
  barber: BarberWithProfile,
  shop: ShopWithStatus | undefined,
  needle: string,
) {
  if (!needle) return true
  return barber.profile.full_name.toLocaleLowerCase().includes(needle)
    || Boolean(barber.bio?.toLocaleLowerCase().includes(needle))
    || Boolean(shop?.name.toLocaleLowerCase().includes(needle))
    || Boolean(shop?.city.toLocaleLowerCase().includes(needle))
}
