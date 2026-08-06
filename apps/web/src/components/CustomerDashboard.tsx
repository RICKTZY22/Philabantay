import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  DataError,
  isUpcomingAppointment,
  type AppointmentDetailed,
  type AppointmentBarberPreference,
  type AvailabilitySlot,
  type BarberWithProfile,
  type BookingQuote,
  type ConversationDetailed,
  type Service,
  type ShopWithStatus,
  type CustomerRatingWorkspace,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useCurrentTime } from '../hooks/useCurrentTime'
import { useLiveLocation } from '../hooks/useLiveLocation'
import { NEARBY_DISCOVERY_RADIUS_KM } from '../config/discovery'
import { Avatar } from './Avatar'
import { AppointmentCalendar } from './AppointmentCalendar'
import { DoodleBoard } from './DoodleBoard'
import { ModalPortal } from './ModalPortal'
import { DoodleIcon } from '../theme/DoodleDefs'
import { RatingPanel } from './RatingPanel'
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
type AreaMode = 'nearby' | 'all'

const NEAREST_LIST_LIMIT = 7
const MANILA_HOUR = new Intl.DateTimeFormat('en-PH', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Manila',
})

function getManilaGreeting(now = new Date()) {
  const hour = Number(MANILA_HOUR.format(now))
  if (hour >= 5 && hour < 12) return 'Magandang umaga'
  if (hour >= 12 && hour < 18) return 'Magandang hapon'
  return 'Magandang gabi'
}

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

type BarberStatus = 'free' | 'busy' | 'off'

const BARBER_STATUS_LABEL: Record<BarberStatus, string> = {
  free: 'Free',
  busy: 'Busy',
  off: 'Off',
}

const BARBER_STATUS_PILL: Record<BarberStatus, string> = {
  free: 'pill pill-on',
  busy: 'pill pill-busy',
  off: 'pill pill-off',
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

function todayDateKey(): string {
  const today = new Date()
  const parts = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(today)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function BookingWorkspace({
  shopId,
  services,
  barbers,
  onBooked,
}: {
  shopId: string
  services: Service[]
  barbers: BarberWithProfile[]
  onBooked: () => Promise<void>
}) {
  const backend = useBackend()
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [preference, setPreference] = useState<AppointmentBarberPreference>('any')
  const [barberId, setBarberId] = useState(barbers[0]?.id ?? '')
  const [date, setDate] = useState(todayDateKey)
  const [notes, setNotes] = useState('')
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [startsAt, setStartsAt] = useState('')
  const [quote, setQuote] = useState<BookingQuote | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [shopTimezone, setShopTimezone] = useState('Asia/Manila')
  const [busy, setBusy] = useState<'slots' | 'quote' | 'create' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setServiceId(services[0]?.id ?? '')
    setBarberId(barbers[0]?.id ?? '')
    setSlots([])
    setStartsAt('')
    setQuote(null)
    setMessage('')
    setError('')
    setIdempotencyKey(crypto.randomUUID())
    void backend.shops.get(shopId).then((detail) => {
      if (active && detail) setShopTimezone(detail.timezone)
    }).catch(() => {
      // The booking/quote endpoints remain authoritative and surface a useful
      // error; the PH default only formats pre-quote slot labels.
    })
    return () => { active = false }
  }, [backend, barbers, services, shopId])

  const bookingInput = useMemo(() => ({
    service_id: serviceId,
    starts_at: startsAt,
    notes: notes.trim() || undefined,
    barber_preference: preference,
    barber_id: preference === 'any' ? undefined : barberId,
    idempotency_key: idempotencyKey,
  }), [barberId, idempotencyKey, notes, preference, serviceId, startsAt])

  async function loadSlots() {
    if (!serviceId || (preference !== 'any' && !barberId)) return
    setBusy('slots')
    setError('')
    setMessage('')
    setQuote(null)
    setStartsAt('')
    try {
      const day = await backend.availability.getDay({
        shop_id: shopId,
        service_id: serviceId,
        date,
        barber_id: preference === 'exact' ? barberId : undefined,
      })
      const byStart = new Map<string, AvailabilitySlot>()
      day.slots.forEach((slot) => {
        if (!byStart.has(slot.starts_at)) byStart.set(slot.starts_at, slot)
      })
      const nextSlots = [...byStart.values()].sort((left, right) => left.starts_at.localeCompare(right.starts_at))
      setSlots(nextSlots)
      if (nextSlots.length === 0) setMessage('Walang available na oras sa araw na ito. Pumili ng ibang date.')
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-load ang available times.')
    } finally {
      setBusy(null)
    }
  }

  async function reviewBooking() {
    if (!startsAt) return
    setBusy('quote')
    setError('')
    try {
      const nextQuote = await backend.bookings.quote(bookingInput)
      setQuote(nextQuote)
      if (!nextQuote.bookable) setMessage('Kinuha na ang oras na iyon. Refresh ang available times.')
    } catch (caught) {
      setQuote(null)
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-review ang booking.')
    } finally {
      setBusy(null)
    }
  }

  async function createBooking() {
    if (!quote?.bookable) return
    setBusy('create')
    setError('')
    try {
      const appointment = await backend.bookings.create(bookingInput)
      await onBooked()
      setMessage(appointment.status === 'confirmed'
        ? 'Confirmed na ang booking mo.'
        : 'Naipadala ang request. May 15 minutes ang shop para tanggapin ito.')
      setSlots([])
      setStartsAt('')
      setQuote(null)
      setIdempotencyKey(crypto.randomUUID())
    } catch (caught) {
      setQuote(null)
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-create ang booking. I-refresh ang times at subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  if (services.length === 0) return null

  return (
    <section className="cd-booking-workspace" aria-labelledby="cd-booking-title">
      <div className="cd-shop-section-title">
        <h4 id="cd-booking-title">Book an appointment</h4>
        <span className="pill">Service → barber → time → review</span>
      </div>
      <div className="cd-booking-fields">
        <label>
          <span>Service</span>
          <select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setSlots([]); setQuote(null) }}>
            {services.map((service) => (
              <option value={service.id} key={service.id}>{service.name} · {service.duration_min} min · {money(service.price_cents)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Barber choice</span>
          <select value={preference} onChange={(event) => { setPreference(event.target.value as AppointmentBarberPreference); setSlots([]); setQuote(null) }}>
            <option value="any">Any available barber</option>
            <option value="preferred" disabled={barbers.length === 0}>Prefer a barber; allow replacement</option>
            <option value="exact" disabled={barbers.length === 0}>Only this barber</option>
          </select>
        </label>
        {preference !== 'any' && (
          <label>
            <span>{preference === 'exact' ? 'Required barber' : 'Preferred barber'}</span>
            <select value={barberId} onChange={(event) => { setBarberId(event.target.value); setSlots([]); setQuote(null) }}>
              {barbers.map((barber) => <option value={barber.id} key={barber.id}>{barber.profile.full_name}</option>)}
            </select>
          </label>
        )}
        <label>
          <span>Shop-local date</span>
          <input type="date" min={todayDateKey()} value={date} onChange={(event) => { setDate(event.target.value); setSlots([]); setQuote(null) }} />
        </label>
      </div>
      <button type="button" className="btn btn-sm" disabled={busy !== null || !serviceId} onClick={() => void loadSlots()}>
        {busy === 'slots' ? 'Checking…' : 'Check available times'}
      </button>
      {slots.length > 0 && (
        <div className="cd-booking-slots" role="group" aria-label="Available appointment times">
          {slots.map((slot) => (
            <button
              type="button"
              key={slot.starts_at}
              className={startsAt === slot.starts_at ? 'is-active' : ''}
              aria-pressed={startsAt === slot.starts_at}
              onClick={() => { setStartsAt(slot.starts_at); setQuote(null); setMessage('') }}
            >
              {new Date(slot.starts_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: shopTimezone })}
            </button>
          ))}
        </div>
      )}
      {startsAt && (
        <label className="cd-booking-notes">
          <span>Notes for the shop (optional)</span>
          <textarea value={notes} maxLength={1000} rows={2} onChange={(event) => { setNotes(event.target.value); setQuote(null) }} />
        </label>
      )}
      {startsAt && !quote && (
        <button type="button" className="btn btn-sm btn-blue" disabled={busy !== null} onClick={() => void reviewBooking()}>
          {busy === 'quote' ? 'Reviewing…' : 'Review booking'}
        </button>
      )}
      {quote?.bookable && (
        <div className="cd-booking-review" aria-label="Booking review">
          <strong>{quote.service_name} · {quote.duration_min} min · {money(quote.price_cents ?? 0)}</strong>
          <span>{new Date(quote.starts_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: quote.timezone })}</span>
          <span>{quote.effective_mode === 'instant' ? 'Instant confirmation' : 'Manual approval · request expires after 15 minutes'}</span>
          {quote.substituted && <span>The preferred barber is unavailable; another qualified provider will be assigned.</span>}
          {quote.buffer_min ? <small>The shop reserves {quote.buffer_min} cleanup minutes after the service.</small> : null}
          <small>Free cancellation or reschedule until {quote.cancellation_cutoff_minutes / 60} hours before start.</small>
          <button type="button" className="btn btn-sm btn-green" disabled={busy !== null} onClick={() => void createBooking()}>
            {busy === 'create' ? 'Booking…' : quote.effective_mode === 'instant' ? 'Confirm booking' : 'Send request'}
          </button>
        </div>
      )}
      {message && <p className="muted" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

export function CustomerDashboard({ firstName }: { firstName: string }) {
  const backend = useBackend()
  const navigate = useNavigate()
  const nowEpochMs = useCurrentTime()
  const greeting = getManilaGreeting(new Date(nowEpochMs))

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
  // Holds a real service name from the catalogue, not a synthetic category.
  const [serviceFilter, setServiceFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openingShopChat, setOpeningShopChat] = useState(false)
  const [shopActionError, setShopActionError] = useState('')
  const [query, setQuery] = useState('')
  const [ratings, setRatings] = useState<CustomerRatingWorkspace>({ pending: [], reviews: [] })

  // One live GPS stream keeps both nearby filtering and the map viewport fresh.
  const { location: userLoc, status: locState, retry: retryLiveLocation } = useLiveLocation()

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
      // The rating prompt belongs on home, not only buried in booking history -
      // but it is a secondary panel, so its failure must not take discovery,
      // bookings and messages down with it. A broken embed in this one read used
      // to blank the entire customer home.
      backend.reviews.myWorkspace().catch((caught: unknown) => {
        console.error('[dashboard] Rating workspace unavailable; home renders without the prompt.', caught)
        return { pending: [], reviews: [] } as CustomerRatingWorkspace
      }),
    ]).then(([shopList, all, available, mine, convos, favs, serviceList, ratingWorkspace]) => {
      if (!active) return
      setShops(shopList)
      setAllBarbers(all)
      setAvailableBarbers(available)
      setBookings(mine)
      setConversations(convos)
      setFavoriteIds(favs)
      setServices(serviceList)
      setRatings(ratingWorkspace)
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
    if (locState !== 'off' || userLoc) return
    setAreaMode((current) => current === 'nearby' ? 'all' : current)
    setSortMode((current) => current === 'nearest' ? 'rating' : current)
  }, [locState, userLoc])

  // Compute each private geographic radius once per GPS/shop update. Values
  // drive filtering/order only and are never presented as travel distance.
  const proximityByShopId = useMemo(() => {
    if (!shops || !userLoc) return null
    return new Map(shops.map((shop) => [shop.id, straightLineKm(userLoc, shop)]))
  }, [shops, userLoc])

  const nearbyShops = useMemo(() => {
    if (!shops || !proximityByShopId) return null
    return [...shops]
      .filter((shop) => (proximityByShopId.get(shop.id) ?? Infinity) <= NEARBY_DISCOVERY_RADIUS_KM)
      .sort((a, b) => (proximityByShopId.get(a.id) ?? Infinity) - (proximityByShopId.get(b.id) ?? Infinity))
  }, [proximityByShopId, shops])

  const nearbyShopIds = useMemo(() => {
    return nearbyShops ? new Set(nearbyShops.map((shop) => shop.id)) : null
  }, [nearbyShops])

  const searchNeedle = query.trim().toLowerCase()

  // The public catalogue returns every active service with its owning shop_id,
  // so the shop -> services relationship is real data, never a local mapping.
  const servicesByShopId = useMemo(() => {
    const grouped = new Map<string, Service[]>()
    for (const service of services) {
      const existing = grouped.get(service.shop_id)
      if (existing) existing.push(service)
      else grouped.set(service.shop_id, [service])
    }
    return grouped
  }, [services])

  // Service rows are per shop, so the same haircut exists under many ids. The
  // filter therefore offers the distinct published names.
  const serviceNameOptions = useMemo(
    () => [...new Set(services.map((service) => service.name))].sort((a, b) => a.localeCompare(b)),
    [services],
  )

  // Ang Discover map/list ay filters lang (Near me, status, service); hindi ito
  // ginagalaw ng text search. May sariling results dropdown ang search sa
  // ilalim ng search bar.
  const filteredShops = useMemo(() => {
    if (!shops) return []
    const result = shops.filter((shop) => {
      if (areaMode === 'nearby' && nearbyShopIds && !nearbyShopIds.has(shop.id)) return false
      if (filter === 'open' && shop.status !== 'open') return false
      if (filter === 'top' && shop.rating < 4.5) return false
      if (serviceFilter !== 'all'
        && !(servicesByShopId.get(shop.id) ?? []).some((service) => service.name === serviceFilter)) {
        return false
      }
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
  }, [shops, areaMode, filter, nearbyShopIds, proximityByShopId, serviceFilter, servicesByShopId, sortMode])

  // Nationwide text match para sa search dropdown — name hits muna, tapos
  // rating. Hindi ito gumagamit ng GPS proximity kailanman.
  const searchResults = useMemo(() => {
    if (!shops || !searchNeedle) return []
    return shops
      .filter((shop) => [shop.name, shop.city, shop.address]
        .some((value) => value.toLowerCase().includes(searchNeedle)))
      .sort((a, b) => {
        const aNameHit = a.name.toLowerCase().includes(searchNeedle) ? 0 : 1
        const bNameHit = b.name.toLowerCase().includes(searchNeedle) ? 0 : 1
        if (aNameHit !== bNameHit) return aNameHit - bNameHit
        return b.rating - a.rating
      })
      .slice(0, 8)
  }, [shops, searchNeedle])

  const closeShopDetails = useCallback(() => setSelectedId(null), [])

  const stats = useMemo(() => {
    const upcoming = bookings.filter(
      (booking) => isUpcomingAppointment(booking, nowEpochMs),
    )
    const unread = conversations.reduce((sum, c) => sum + c.unread_count, 0)
    return {
      upcoming: upcoming.length,
      unread,
    }
  }, [bookings, conversations, nowEpochMs])

  const selectedShop = shops?.find((s) => s.id === selectedId) ?? null
  // Search is independent from Discover filters. Keep a selected search result
  // on the map even if its status, price, or service does not match the
  // currently visible Discover collection, so the pin can still be focused.
  const mapShops = useMemo(() => {
    if (!selectedShop || filteredShops.some((shop) => shop.id === selectedShop.id)) return filteredShops
    return [...filteredShops, selectedShop]
  }, [filteredShops, selectedShop])
  const completedCuts = bookings.filter((booking) => booking.status === 'completed').length
  const loyaltyProgress = completedCuts % 10
  const availableIds = useMemo(() => new Set(availableBarbers.map((b) => b.id)), [availableBarbers])

  // Barber-first side list. May GPS: pinakamalapit na barbers (via shop nila)
  // muna, free-now bago busy. Walang GPS: top-rated barbers ang ipinapakita.
  const sideBarbers = useMemo(() => {
    if (!shops) return []
    const visibleShopIds = new Set(filteredShops.map((shop) => shop.id))
    const rows = allBarbers.flatMap((barber) => {
      const shop = shops.find((candidate) => candidate.barber_ids.includes(barber.id))
      if (!shop || !visibleShopIds.has(shop.id)) return []
      const status: BarberStatus = availableIds.has(barber.id)
        ? 'free'
        : barber.shift_status === 'off' ? 'off' : 'busy'
      return [{ barber, shop, status, km: proximityByShopId?.get(shop.id) ?? Infinity }]
    })
    const availabilityRank: Record<BarberStatus, number> = { free: 0, busy: 1, off: 2 }
    rows.sort((a, b) => {
      if (proximityByShopId && a.km !== b.km) return a.km - b.km
      if (availabilityRank[a.status] !== availabilityRank[b.status]) {
        return availabilityRank[a.status] - availabilityRank[b.status]
      }
      return b.barber.rating - a.barber.rating
    })
    return rows.slice(0, NEAREST_LIST_LIMIT)
  }, [allBarbers, availableIds, filteredShops, proximityByShopId, shops])
  const selectedShopStaff = useMemo(
    () => allBarbers.filter((barber) => selectedShop?.barber_ids.includes(barber.id)),
    [allBarbers, selectedShop],
  )
  const selectedShopBarbers = useMemo(
    () => selectedShopStaff.filter((barber) => availableIds.has(barber.id)),
    [selectedShopStaff, availableIds],
  )
  const selectedShopServices = useMemo(
    () => (selectedShop ? servicesByShopId.get(selectedShop.id) ?? [] : []),
    [selectedShop, servicesByShopId],
  )

  async function openShopChat(shopId: string) {
    if (openingShopChat) return
    setOpeningShopChat(true)
    setShopActionError('')
    try {
      const convo = await backend.chat.openConversation(shopId)
      navigate(`/chat/${routeSegment(convo.id)}`)
    } catch (error) {
      setShopActionError(error instanceof DataError ? error.message : 'Hindi mabuksan ang shop chat. Subukan ulit.')
    } finally {
      setOpeningShopChat(false)
    }
  }

  async function toggleFavorite(shopId: string) {
    setFavoriteIds(await backend.favorites.toggle(shopId))
  }

  function showMap() {
    setSelectedId(null)
    setViewMode('map')
    setMapResetKey((key) => key + 1)
  }

  function pickSearchResult(shop: ShopWithStatus) {
    setViewMode('map')
    // Kung labas sa kasalukuyang "Near me" radius ang napili, lumipat sa
    // All PH para may pin ito sa mapa sa likod ng detail popup.
    if (areaMode === 'nearby' && nearbyShopIds && !nearbyShopIds.has(shop.id)) {
      setAreaMode('all')
    }
    setSelectedId(shop.id)
    setQuery('')
  }

  function chooseArea(nextArea: AreaMode) {
    setSelectedId(null)
    setAreaMode(nextArea)
    setMapResetKey((key) => key + 1)
  }

  function retryLocation() {
    retryLiveLocation()
    setAreaMode('nearby')
    setSortMode('nearest')
    setMapResetKey((key) => key + 1)
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
    <DoodleBoard
      search={{
        value: query,
        onChange: setQuery,
        placeholder: 'Search barbershops...',
        ariaLabel: 'Search barbershops',
        panel: searchNeedle ? (
          <div className="cd-search-results" aria-label="Shop search results">
            <span className="cd-search-results-head">
              {searchResults.length === 0
                ? 'Walang shop na tugma.'
                : `${searchResults.length} shop${searchResults.length === 1 ? '' : 's'} na tugma`}
            </span>
            {searchResults.map((shop) => (
              <button type="button" key={shop.id} onClick={() => pickSearchResult(shop)}>
                <i className={`cd-dot is-${shop.status}`} aria-hidden="true" />
                <span className="cd-search-result-name">
                  <strong>{shop.name}</strong>
                  <small>{shop.address}, {shop.city}</small>
                </span>
                <span className="cd-search-result-rating">
                  <DoodleIcon name="star" size={13} className="is-lit" /> {shop.rating.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        ) : undefined,
      }}
    >
      <div className="cd-main">
        {/* Greeting at useful stats lang; tinanggal ang redundant live-count cards. */}
        <section className="cd-overview" id="cd-overview" aria-label="Dashboard overview">
          <header className="cd-head">
            <div>
              <h1>{greeting},<br />{firstName}!</h1>
              <p className="cd-head-sub">Handa na ang susunod mong fresh cut.</p>
            </div>
          </header>

          <div className="cd-stats" aria-label="Quick stats">
            <Link to="/appointments" className="cd-stat cd-stat-blue">
              <span className="cd-stat-badge"><DoodleIcon name="calendar" size={20} /></span>
              <strong>{stats.upcoming}</strong>
              <span className="cd-stat-label">Upcoming cuts</span>
            </Link>
            <Link to="/chat" className="cd-stat cd-stat-pink">
              <span className="cd-stat-badge"><DoodleIcon name="chat" size={20} /></span>
              <strong>{stats.unread}</strong>
              <span className="cd-stat-label">Unread chats</span>
            </Link>
          </div>

        </section>

        {/* Next action first: a visit that unlocked a review is the most useful
            thing on this screen, and it disappears once it is spent. */}
        {ratings.pending.length > 0 && (
          <section className="cd-rating-prompt" aria-labelledby="cd-rating-title">
            <h2 id="cd-rating-title" className="sr-only">Visits you can review</h2>
            <RatingPanel
              eligibility={ratings.pending[0]}
              heading={ratings.pending.length === 1
                ? 'Rate your last visit'
                : `Rate your last visit (${ratings.pending.length} waiting)`}
              onSaved={() => void backend.reviews.myWorkspace().then(setRatings)}
            />
          </section>
        )}

        {/* ---- Map + top rated ---- */}
        <section className="cd-map-grid" id="cd-discover" aria-label="Barbershop map">
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
                <select
                  value={serviceFilter}
                  disabled={serviceNameOptions.length === 0}
                  onChange={(event) => { setSelectedId(null); setServiceFilter(event.target.value) }}
                >
                  <option value="all">
                    {serviceNameOptions.length === 0 ? 'No published services yet' : 'Any service'}
                  </option>
                  {serviceNameOptions.map((name) => <option value={name} key={name}>{name}</option>)}
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
                  shops={mapShops}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  userLocation={userLoc}
                  scope={areaMode}
                  resetKey={mapResetKey}
                  hoverPreview
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
                servicesByShopId={servicesByShopId}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
              />
            )}

            {selectedShop && viewMode === 'map' && (
              <ModalPortal
                backdropClassName="cd-shop-popup-backdrop"
                dialogClassName="cd-shop-card cd-shop-popup"
                labelledBy="selected-shop-title"
                onClose={closeShopDetails}
              >
                <button
                  type="button"
                  className="cd-shop-popup-close"
                  aria-label="Isara ang shop details"
                  data-dialog-initial-focus
                  onClick={closeShopDetails}
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
                    <button
                      type="button"
                      className="btn btn-sm btn-blue"
                      onClick={() => openShopChat(selectedShop.id)}
                      disabled={selectedShop.barber_ids.length === 0 || openingShopChat}
                    >
                      <DoodleIcon name="chat" size={17} /> {openingShopChat ? 'Opening…' : 'Chat shop'}
                    </button>
                  </div>
                  {shopActionError && <p className="form-error" role="alert">{shopActionError}</p>}
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
                  {selectedShopStaff.map((barber) => {
                    const status: BarberStatus = availableIds.has(barber.id)
                      ? 'free'
                      : barber.shift_status === 'off'
                        ? 'off'
                        : 'busy'
                    return (
                      <div className="cd-staff-row" key={barber.id}>
                        <Avatar name={barber.profile.full_name} />
                        <div className="cd-staff-info">
                          <strong>{barber.profile.full_name}</strong>
                          <span className={BARBER_STATUS_PILL[status]}>{BARBER_STATUS_LABEL[status]}</span>
                        </div>
                      </div>
                    )
                  })}
                  {selectedShopBarbers.length === 0 && (
                    <p className="muted cd-staff-empty-note">Walang bakanteng barber ngayon. Tingnan ulit mamaya o buksan ang full details.</p>
                  )}
                </section>
                <BookingWorkspace
                  shopId={selectedShop.id}
                  services={selectedShopServices}
                  barbers={selectedShopStaff}
                  onBooked={async () => setBookings(await backend.bookings.listMine())}
                />
              </ModalPortal>
            )}
          </div>

          <div className="cd-map-aside-stack">
            <aside className="cd-card cd-side" aria-label={userLoc ? 'Nearest barbers' : 'Top rated barbers'}>
              <div className="cd-card-head">
                <h2>{userLoc ? 'Nearest barbers' : 'Top barbers'}</h2>
              </div>
              <ol className="cd-side-list">
                {sideBarbers.length === 0 && (
                  <li className="cd-side-empty muted">
                    Walang barber na tugma sa filters mo. Subukan ang “All PH” o alisin ang ibang filters.
                  </li>
                )}
                {sideBarbers.map(({ barber, shop, status }) => (
                  <li key={barber.id}>
                    <button
                      type="button"
                      className={`cd-side-shop${selectedId === shop.id ? ' is-active' : ''}`}
                      title={`${barber.profile.full_name} — ${shop.name}`}
                      onClick={() => {
                        setViewMode('map')
                        setSelectedId(shop.id)
                      }}
                    >
                      <span className="cd-side-name">
                        <i className={`cd-dot is-${status === 'free' ? 'open' : status === 'busy' ? 'busy' : 'closed'}`} aria-hidden="true" />
                        {barber.profile.full_name}
                        <em>{shop.city}</em>
                      </span>
                      <span className="cd-side-rating">
                        <DoodleIcon name="star" size={13} className="is-lit" /> {barber.rating.toFixed(1)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>

            <AppointmentCalendar appointments={bookings} shops={shops} />
          </div>
        </section>

        <aside className="cd-card cd-engagement cd-engagement-wide" id="cd-rewards" aria-labelledby="cd-rewards-title">
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
          <Link className="cd-notification-link" to="/settings/notifications">
            <DoodleIcon name="chat" size={18} /> Booking and chat notifications <DoodleIcon name="arrow" size={16} />
          </Link>
        </aside>
      </div>
    </DoodleBoard>
  )
}

function ShopList({
  shops,
  servicesByShopId,
  favoriteIds,
  onToggleFavorite,
}: {
  shops: ShopWithStatus[]
  servicesByShopId: Map<string, Service[]>
  favoriteIds: string[]
  onToggleFavorite: (shopId: string) => void
}) {
  return (
    <div className="cd-shop-list-grid">
      {shops.map((shop) => {
        const shopServices = servicesByShopId.get(shop.id) ?? []
        // Lowest published price is a real catalogue fact, not a price band.
        const fromPriceCents = shopServices.length > 0
          ? Math.min(...shopServices.map((service) => service.price_cents))
          : null
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
              <span>{fromPriceCents === null ? 'Prices not published' : `From ${money(fromPriceCents)}`}</span>
            </div>
            <div className="cd-service-tags">
              {shopServices.length === 0
                ? <span className="cd-service-tags-empty">No published services yet</span>
                : shopServices.slice(0, 3).map((service) => <span key={service.id}>{service.name}</span>)}
            </div>
            <div className={`cd-discovery-actions${shop.available_barber_count > 0 ? '' : ' is-none-free'}`}>
              <span>
                {shop.available_barber_count > 0
                  ? `${shop.available_barber_count} barber${shop.available_barber_count === 1 ? '' : 's'} free now`
                  : 'Walang bakanteng barber ngayon'}
              </span>
            </div>
          </article>
        )
      })}
      {shops.length === 0 && <p className="muted cd-empty">Walang shop na tugma sa filters mo.</p>}
    </div>
  )
}
