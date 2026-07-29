import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './ShopLocationPicker.css'

const MANILA: L.LatLngExpression = [14.5995, 120.9842]
const PH_BOUNDS = L.latLngBounds([4.5, 116.5], [21.2, 127])

interface ShopLocationPickerProps {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}

function pinIcon(): L.DivIcon {
  const pin = document.createElement('span')
  pin.className = 'shop-location-pin'
  pin.setAttribute('aria-hidden', 'true')
  return L.divIcon({
    className: 'shop-location-pin-wrap',
    html: pin,
    iconSize: [34, 44],
    iconAnchor: [17, 42],
  })
}

export function ShopLocationPicker({ lat, lng, onChange }: ShopLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const element = containerRef.current
    if (!element || mapRef.current) return

    const hasPin = lat !== null && lng !== null
    const center: L.LatLngExpression = hasPin ? [lat, lng] : MANILA
    const map = L.map(element, {
      center,
      zoom: hasPin ? 16 : 11,
      maxBounds: PH_BOUNDS.pad(0.25),
      scrollWheelZoom: false,
    })
    map.attributionControl.setPrefix(false)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    map.on('click', ({ latlng }) => onChangeRef.current(latlng.lat, latlng.lng))
    mapRef.current = map

    const resizeObserver = new ResizeObserver(() => map.invalidateSize())
    resizeObserver.observe(element)
    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // The map is intentionally created once; the next effect owns pin changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (lat === null || lng === null) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (!markerRef.current) {
      const marker = L.marker([lat, lng], {
        icon: pinIcon(),
        draggable: true,
        keyboard: true,
        alt: 'Selected shop location',
      }).addTo(map)
      marker.on('dragend', () => {
        const point = marker.getLatLng()
        onChangeRef.current(point.lat, point.lng)
      })
      markerRef.current = marker
      map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: false })
      return
    }
    markerRef.current.setLatLng([lat, lng])
  }, [lat, lng])

  return (
    <div
      ref={containerRef}
      className="shop-location-picker"
      role="application"
      aria-label="Shop location picker. Click the map or drag the pin to set the exact location."
    />
  )
}
