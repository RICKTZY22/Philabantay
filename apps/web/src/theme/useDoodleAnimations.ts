import { useEffect, useRef } from 'react'

/**
 * Attaches the doodle scroll animations to a container. Return `ref` and spread
 * it on the scroll root of a page/section. Re-runs whenever `deps` change
 * (e.g. the route pathname or when async content finishes loading).
 *
 * - Respects `prefers-reduced-motion` (shows the static final state, no GSAP).
 * - Lazy-loads the GSAP runtime so it stays out of the initial bundle.
 * - StrictMode-safe via the `cancelled` guard + returned cleanup.
 */
export function useDoodleAnimations<T extends HTMLElement = HTMLDivElement>(
  deps: React.DependencyList = [],
) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return undefined

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let cleanup: (() => void) | undefined
    let cancelled = false

    import('./doodleAnimationRuntime')
      .then(({ runDoodleAnimations, revealStaticState }) => {
        if (cancelled || !ref.current) return
        if (reduced) {
          revealStaticState(ref.current)
          return
        }
        cleanup = runDoodleAnimations(ref.current)
      })
      .catch(() => {
        /* animation is progressive enhancement — ignore load failures */
      })

    return () => {
      cancelled = true
      cleanup?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}
