import { useEffect, useRef } from 'react'

/**
 * Reusable doodle animation hook. Ikabit ang returned ref sa page root at siya
 * na ang bahala sa reveal, cleanup, at reduced-motion version.
 *
 * Feature notes:
 * - Lazy din ang animation runtime para hindi bumigat ang initial bundle.
 * - Static final state ang reduced-motion para walang nawawalang content.
 * - Safe sa StrictMode dahil may cancelled guard at GSAP cleanup.
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

    // IMPORTANT: dynamic import ito on purpose. Kapag ginawang normal import,
    // babalik sa entry bundle ang animation runtime at mawawala ang code split.
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
        /* Bonus lang ang animation; usable pa rin dapat ang page kapag pumalya. */
      })

    return () => {
      cancelled = true
      cleanup?.()
    }
    // Caller ang may kontrol sa deps dahil async page data ang madalas na trigger.
    // Huwag palitan ng `[deps]`; magre-run iyon kada bagong array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}
