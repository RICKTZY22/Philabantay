/** A coordinate shared by user-location and shop-pin calculations. */
export interface GeoPoint {
  lat: number
  lng: number
}

/**
 * Geographic radius calculation used privately for the "Near me" boundary
 * and ordering. This value is deliberately not presented as travel distance.
 */
export function straightLineKm(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Hand off route calculation to Google Maps instead of estimating it here. */
export function googleDrivingDirectionsUrl(origin: GeoPoint | null, destination: GeoPoint): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
  })
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`)
  return `https://www.google.com/maps/dir/?${params}`
}
