import { useCallback, useEffect, useState } from 'react'
import type { GeoPoint } from '../lib/geo'

export type LiveLocationStatus = 'asking' | 'on' | 'off'

/**
 * Continuously tracks the device position. Both the map and nearby discovery
 * consume this hook so a moving user cannot leave either screen with stale GPS.
 */
export function useLiveLocation(enabled = true) {
  const [location, setLocation] = useState<GeoPoint | null>(null)
  const [status, setStatus] = useState<LiveLocationStatus>(enabled ? 'asking' : 'off')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setLocation(null)
      setStatus('off')
      return
    }

    if (!('geolocation' in navigator)) {
      setLocation(null)
      setStatus('off')
      return
    }

    let active = true
    let hasFix = false
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return
        hasFix = true
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setStatus('on')
      },
      (error) => {
        if (!active || (hasFix && error.code !== error.PERMISSION_DENIED)) return
        setLocation(null)
        setStatus('off')
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 5_000,
      },
    )

    return () => {
      active = false
      navigator.geolocation.clearWatch(watchId)
    }
  }, [attempt, enabled])

  const retry = useCallback(() => {
    setLocation(null)
    setStatus('asking')
    setAttempt((current) => current + 1)
  }, [])

  return { location, status, retry }
}
