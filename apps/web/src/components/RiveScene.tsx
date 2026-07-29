import { useEffect, useRef, useState, type ReactNode } from 'react'
import './RiveScene.css'

interface RiveSceneProps {
  /**
   * Public URL of a `.riv` file. Leave undefined until the real artwork exists;
   * the component then renders `fallback` only and never loads the runtime.
   */
  src?: string
  /** Rive state-machine name, when the file defines one. */
  stateMachine?: string
  /** Describes the scene for screen readers. */
  label: string
  /**
   * Static artwork shown before load, when motion is reduced, and if loading
   * fails. This is the honest baseline: the page must read correctly with no
   * animation at all.
   */
  fallback: ReactNode
}

/**
 * Decorative Rive scene.
 *
 * Three deliberate constraints, because a decorative animation must never cost
 * correctness:
 * - the runtime is imported dynamically, so it stays out of the entry chunk;
 * - `prefers-reduced-motion: reduce` skips loading entirely and keeps the static
 *   fallback, since Rive does not honor that query on its own;
 * - playback pauses while off-screen, matching `useJourneyScroll`.
 */
export function RiveScene({ src, stateMachine, label, fallback }: RiveSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!src || !host || !canvas) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined

    let cancelled = false
    // Only the members this component drives, so the runtime's full type never
    // has to be imported eagerly just to satisfy the compiler.
    type SceneHandle = {
      play: () => void
      pause: () => void
      cleanup: () => void
      resizeDrawingSurfaceToCanvas: () => void
    }
    let instance: SceneHandle | null = null
    let observer: IntersectionObserver | null = null

    void import('@rive-app/canvas')
      .then((mod) => {
        if (cancelled) return
        // `@rive-app/canvas` is CommonJS, so under Vite's dep optimizer the named
        // exports are undefined and only `default` carries them. Read from either
        // shape rather than destructuring, which silently threw into `.catch`.
        const runtime = ((mod as unknown as { default?: unknown }).default ?? mod) as {
          Rive: new (options: Record<string, unknown>) => SceneHandle
          RuntimeLoader: { setWasmUrl: (url: string) => void }
        }
        // Rive otherwise fetches its wasm from unpkg/jsdelivr, an external
        // runtime dependency the CSP blocks and that breaks offline.
        runtime.RuntimeLoader.setWasmUrl('/rive/rive.wasm')

        // `onLoad` can fire before the constructor returns, so it must not close
        // over a `const` that is still in its temporal dead zone.
        let handle: SceneHandle | null = null
        const rive: SceneHandle = new runtime.Rive({
          src,
          canvas,
          autoplay: true,
          ...(stateMachine ? { stateMachines: stateMachine } : {}),
          onLoad: () => {
            if (cancelled) return
            handle?.resizeDrawingSurfaceToCanvas()
            setAnimating(true)
          },
          onLoadError: () => setAnimating(false),
        })
        handle = rive
        rive.resizeDrawingSurfaceToCanvas()
        instance = rive

        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) rive.play()
            else rive.pause()
          })
        }, { rootMargin: '160px 0px' })
        observer.observe(host)
      })
      .catch(() => setAnimating(false))

    return () => {
      cancelled = true
      observer?.disconnect()
      instance?.cleanup()
      setAnimating(false)
    }
  }, [src, stateMachine])

  return (
    <div className="rive-scene" ref={hostRef} role="img" aria-label={label}>
      <div className={`rive-scene-fallback${animating ? ' is-hidden' : ''}`} aria-hidden={animating}>
        {fallback}
      </div>
      {src && <canvas ref={canvasRef} className="rive-scene-canvas" aria-hidden="true" />}
    </div>
  )
}
