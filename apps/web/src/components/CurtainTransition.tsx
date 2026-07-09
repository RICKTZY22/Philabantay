import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { DoodleIcon } from '../theme/DoodleDefs'

/**
 * Doodle barbershop-curtain page transition. Call `go(path)` (or use
 * <CurtainLink>) and two striped cloth panels sweep shut from the sides,
 * the route swaps behind them, then they part again on the new page.
 * Respects prefers-reduced-motion (plain navigation).
 */

type Phase = 'idle' | 'closing' | 'holding' | 'opening'

interface CurtainState {
  go: (to: string) => void
}

const CurtainContext = createContext<CurtainState | null>(null)

export function CurtainProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const navigate = useNavigate()
  const target = useRef('')

  const go = (to: string) => {
    if (phase !== 'idle') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      navigate(to)
      return
    }
    target.current = to
    setPhase('closing')
  }

  useEffect(() => {
    if (phase === 'closing') {
      // Panels take ~.55s to meet in the middle.
      const t = setTimeout(() => {
        navigate(target.current)
        window.scrollTo({ top: 0, behavior: 'instant' })
        setPhase('holding')
      }, 560)
      return () => clearTimeout(t)
    }
    if (phase === 'holding') {
      // Give the new page a beat to paint behind the closed curtains.
      const t = setTimeout(() => setPhase('opening'), 160)
      return () => clearTimeout(t)
    }
    if (phase === 'opening') {
      const t = setTimeout(() => setPhase('idle'), 650)
      return () => clearTimeout(t)
    }
    return undefined
  }, [phase, navigate])

  return (
    <CurtainContext.Provider value={{ go }}>
      {children}
      <div className={`curtain ${phase}`} aria-hidden="true">
        <div className="curtain-panel curtain-left" />
        <div className="curtain-panel curtain-right" />
        <div className="curtain-badge">
          <DoodleIcon name="scissors" size={40} />
        </div>
      </div>
    </CurtainContext.Provider>
  )
}

export function useCurtain(): CurtainState {
  const ctx = useContext(CurtainContext)
  if (!ctx) throw new Error('useCurtain must be used within a CurtainProvider')
  return ctx
}

/** Anchor that navigates through the curtain transition. */
export function CurtainLink({
  to,
  className,
  children,
}: {
  to: string
  className?: string
  children: ReactNode
}) {
  const { go } = useCurtain()
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        go(to)
      }}
    >
      {children}
    </a>
  )
}
