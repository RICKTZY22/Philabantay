import { useEffect, type RefObject } from 'react'

/**
 * Pauses the three ambient landing scenes while they are off-screen or while
 * the browser tab is hidden. Guide content stays in normal document flow and
 * uses CSS-only optional motion, keeping the long page lightweight.
 */
export function useJourneyScroll(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const scenes = Array.from(root.querySelectorAll<HTMLElement>(
      '.phil-hero-main, .phil-how-neighborhood, .phil-neighborhood-stage',
    ))

    const syncPageVisibility = () => {
      root.dataset.animationPaused = document.hidden ? 'true' : 'false'
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const scene = entry.target as HTMLElement
        scene.dataset.animationPaused = entry.isIntersecting ? 'false' : 'true'
      })
    }, { rootMargin: '160px 0px' })

    syncPageVisibility()
    scenes.forEach((scene) => observer.observe(scene))
    document.addEventListener('visibilitychange', syncPageVisibility)

    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', syncPageVisibility)
      delete root.dataset.animationPaused
      scenes.forEach((scene) => delete scene.dataset.animationPaused)
    }
  }, [rootRef])
}
