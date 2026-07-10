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
 * Ito yung barber-curtain handoff pagkatapos ng successful auth. Isara muna,
 * palit route sa likod, tapos buksan ulit para hindi biglang tumalon ang page.
 * Kapag reduced-motion ang user, diretso navigation lang at walang arte.
 */

type Phase = 'idle' | 'closing' | 'holding' | 'opening'

interface CurtainState {
  go: (to: string) => void
}

const CurtainContext = createContext<CurtainState | null>(null)

export function CurtainProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const navigate = useNavigate()
  // Ref ito para hindi magpalit ang destination habang tumatakbo ang timers.
  const target = useRef('')

  const go = (to: string) => {
    // Iwas double-click at dalawang sabay na navigation habang nakasara curtain.
    if (phase !== 'idle') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      navigate(to)
      return
    }
    target.current = to
    setPhase('closing')
  }

  useEffect(() => {
    // IMPORTANT - NAKA-SYNC ITO SA `.curtain-panel` CSS TRANSITIONS.
    // Huwag baguhin ang milliseconds dito nang hindi chine-check ang doodle.css,
    // kundi puwedeng makita ang route swap habang kalahati pa lang ang curtain.
    if (phase === 'closing') {
      // Mga .55s bago magtagpo ang dalawang panel sa gitna.
      const t = setTimeout(() => {
        navigate(target.current)
        window.scrollTo({ top: 0, behavior: 'instant' })
        setPhase('holding')
      }, 560)
      return () => clearTimeout(t)
    }
    if (phase === 'holding') {
      // Maikling pahinga para makapag-paint ang bagong page sa likod.
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
