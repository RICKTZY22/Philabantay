import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ShopWithStatus } from '@barbershop/shared'
import type { GeoPoint } from '../lib/geo'
import './ShopMap.css'

// IMPORTANT - DEFAULT EXPORT ITO, HINDI NAMED:
// Naka-React.lazy ang ShopMap sa CustomerDashboard para hindi kasama ang
// Leaflet (~150KB raw) sa entry chunk. Default export para walang `.then`
// bridge na kailangan (see App.tsx warning tungkol sa named exports).

/** Gitna ng Pilipinas — fallback view kapag walang shops na maipakita. */
const PH_CENTER: L.LatLngExpression = [12.65, 121.8]
const PH_BOUNDS = L.latLngBounds([4.5, 116.5], [21.2, 127])
const CURRENT_LOCATION_ZOOM = 12

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function pinIcon(shop: ShopWithStatus, selected: boolean): L.DivIcon {
  const pin = document.createElement('span')
  pin.className = `shop-pin is-${shop.status}${selected ? ' is-selected' : ''}`
  const dot = document.createElement('span')
  dot.className = 'shop-pin-dot'
  pin.append(dot)
  if (shop.available_barber_count > 0) {
    const count = document.createElement('span')
    count.className = 'shop-pin-count'
    count.textContent = String(Math.max(0, Math.floor(shop.available_barber_count)))
    pin.append(count)
  }
  return L.divIcon({
    className: 'shop-pin-wrap',
    html: pin,
    iconSize: [36, 46],
    iconAnchor: [18, 42],
  })
}

export type UserLocation = GeoPoint

interface ShopMapProps {
  shops: ShopWithStatus[]
  selectedId: string | null
  onSelect: (shopId: string) => void
  /** Nearby locks to the user; all always restores the nationwide view. */
  scope: 'nearby' | 'all'
  /** Increment to reapply the current viewport even when scope is unchanged. */
  resetKey: number
  /** Kapag alam ang puwesto ng user, doon agad nakatutok ang map. */
  userLocation?: UserLocation | null
}

export default function ShopMap({ shops, selectedId, onSelect, scope, resetKey, userLocation }: ShopMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef(new Map<string, L.Marker>())
  const userMarkerRef = useRef<L.Marker | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const shopSignature = shops
    .map((shop) => `${shop.id}:${shop.lat}:${shop.lng}:${shop.status}:${shop.available_barber_count}:${shop.name}`)
    .sort()
    .join('|')
  const focusLat = scope === 'nearby' ? userLocation?.lat : undefined
  const focusLng = scope === 'nearby' ? userLocation?.lng : undefined

  // Create the map once. OSM public tiles are fine for the mock/demo phase;
  // production dapat lumipat sa keyed provider (MapTiler/Stadia).
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    const map = L.map(el, {
      center: PH_CENTER,
      zoom: 5,
      zoomSnap: 0.5,
      scrollWheelZoom: false, // page scroll muna; click/tap para mag-zoom
      attributionControl: true,
    })
    map.attributionControl.setPrefix(false)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    // Grid/flex layouts settle after mount — kailangan i-recompute ang size,
    // kundi kalahating grey ang tiles.
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // Rebuild markers when shop data or selection changes (mura lang ito sa <50 pins).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current.clear()

    shops.forEach((shop) => {
      const marker = L.marker([shop.lat, shop.lng], {
        icon: pinIcon(shop, shop.id === selectedId),
        keyboard: true,
        alt: `${shop.name} — ${shop.status}`,
      })
      // Leaflet treats string tooltip content as HTML. textContent keeps future
      // backend-provided shop names from becoming an injection surface.
      const tooltip = document.createElement('span')
      tooltip.textContent = shop.name
      marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -40], className: 'shop-tooltip' })
      marker.on('click', () => onSelectRef.current(shop.id))
      marker.addTo(map)
      const markerElement = marker.getElement()
      markerElement?.setAttribute('aria-label', `${shop.name} — ${shop.status}`)
      markerElement?.setAttribute('title', shop.name)
      markersRef.current.set(shop.id, marker)
    })

  }, [selectedId, shopSignature])

  // "Ikaw dito" marker. Viewport behavior lives in one effect below so the
  // Near me and All PH buttons cannot fight each other.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation) return

    userMarkerRef.current?.remove()
    const userPin = document.createElement('span')
    userPin.className = 'user-pin'
    const userDot = document.createElement('span')
    userDot.className = 'user-pin-dot'
    const userLabel = document.createElement('span')
    userLabel.className = 'user-pin-label'
    userLabel.textContent = 'ikaw dito'
    userPin.append(userDot, userLabel)
    const marker = L.marker([userLocation.lat, userLocation.lng], {
      icon: L.divIcon({
        className: 'user-pin-wrap',
        html: userPin,
        iconSize: [64, 40],
        iconAnchor: [32, 20],
      }),
      interactive: false,
      keyboard: false,
    })
    marker.addTo(map)
    userMarkerRef.current = marker

    return () => {
      marker.remove()
      if (userMarkerRef.current === marker) userMarkerRef.current = null
    }
  }, [userLocation])

  // Single source of truth for the viewport:
  // selected pin -> that shop; Near me -> current GPS; All PH -> whole country.
  useEffect(() => {
    const map = mapRef.current
    const shop = shops.find((s) => s.id === selectedId)
    if (!map) return

    map.stop()
    map.invalidateSize()
    const reduced = prefersReducedMotion()

    if (shop) {
      const zoom = Math.max(map.getZoom(), 12)
      if (reduced) map.setView([shop.lat, shop.lng], zoom, { animate: false })
      else map.flyTo([shop.lat, shop.lng], zoom, { duration: 0.65 })
      return
    }

    if (scope === 'nearby' && focusLat !== undefined && focusLng !== undefined) {
      map.setView([focusLat, focusLng], CURRENT_LOCATION_ZOOM, { animate: !reduced })
      return
    }

    map.fitBounds(PH_BOUNDS, { padding: [24, 24], animate: !reduced })
  }, [focusLat, focusLng, resetKey, scope, selectedId, shopSignature])

  return <div ref={containerRef} className="shop-map" role="application" aria-label="Barbershop map ng Pilipinas" />
}
