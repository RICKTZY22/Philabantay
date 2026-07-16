import { useEffect, useState } from 'react'

/** Re-render time-sensitive UI without giving each page its own timer logic. */
export function useCurrentTime(refreshMs = 60_000): number {
  const [nowEpochMs, setNowEpochMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowEpochMs(Date.now()), refreshMs)
    return () => window.clearInterval(timer)
  }, [refreshMs])

  return nowEpochMs
}
