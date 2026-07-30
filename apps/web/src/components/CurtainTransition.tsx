import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { DoodleIcon } from '../theme/DoodleDefs'
import { safeInternalPath } from '../lib/security'
import './CurtainTransition.css'

/**
 * Ito yung barber-curtain handoff pagkatapos ng successful auth. Isara muna,
 * palit route sa likod, tapos buksan ulit para hindi biglang tumalon ang page.
 * Kapag reduced-motion ang user, diretso navigation lang at walang arte.
 */

type Phase = 'idle' | 'closing' | 'holding' | 'opening'

type CurtainDestination = {
  to: string
  replace?: boolean
}

type CurtainTask = () => Promise<CurtainDestination | null> | CurtainDestination | null

interface CurtainState {
  go: (to: string) => void
  transition: (task: CurtainTask) => Promise<void>
}

const CurtainContext = createContext<CurtainState | null>(null)

const CLOSE_MS = 430
const HOLD_MS = 90
const OPEN_MS = 430

export function CurtainProvider({ children, studio = false }: { children: ReactNode; studio?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const navigate = useNavigate()
  const phaseRef = useRef<Phase>('idle')
  const taskRef = useRef<CurtainTask | null>(null)
  const completionRef = useRef<{
    resolve: () => void
    reject: (error: unknown) => void
    error?: unknown
  } | null>(null)
  // Keep one visual treatment for the complete wipe. Auth changes must not
  // switch the closed curtain from public stripes to studio charcoal midway.
  const activeStudioRef = useRef(studio)

  const transition = useCallback((task: CurtainTask): Promise<void> => {
    // The ref closes the double-click gap before React can render the new phase.
    if (phaseRef.current !== 'idle') return Promise.resolve()

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return Promise.resolve(task()).then((destination) => {
        if (!destination) return
        navigate(safeInternalPath(destination.to), { replace: destination.replace })
        window.scrollTo({ top: 0, behavior: 'instant' })
      })
    }

    activeStudioRef.current = studio
    taskRef.current = task
    phaseRef.current = 'closing'
    setPhase('closing')
    return new Promise<void>((resolve, reject) => {
      completionRef.current = { resolve, reject }
    })
  }, [navigate, studio])

  const go = useCallback((to: string) => {
    void transition(() => ({ to }))
  }, [transition])

  useEffect(() => {
    if (phase === 'closing') {
      const t = window.setTimeout(() => {
        const task = taskRef.current
        if (!task) return
        void Promise.resolve(task()).then((destination) => {
          if (destination) {
            navigate(safeInternalPath(destination.to), { replace: destination.replace })
            window.scrollTo({ top: 0, behavior: 'instant' })
          }
          phaseRef.current = 'holding'
          setPhase('holding')
        }).catch((error: unknown) => {
          if (completionRef.current) completionRef.current.error = error
          phaseRef.current = 'opening'
          setPhase('opening')
        })
      }, CLOSE_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'holding') {
      // One short paint window keeps lazy-route fallback flashes behind the cloth.
      const t = window.setTimeout(() => {
        phaseRef.current = 'opening'
        setPhase('opening')
      }, HOLD_MS)
      return () => clearTimeout(t)
    }
    if (phase === 'opening') {
      const t = window.setTimeout(() => {
        const completion = completionRef.current
        phaseRef.current = 'idle'
        taskRef.current = null
        completionRef.current = null
        setPhase('idle')
        if (completion?.error !== undefined) completion.reject(completion.error)
        else completion?.resolve()
      }, OPEN_MS)
      return () => clearTimeout(t)
    }
    return undefined
  }, [phase, navigate])

  const value = useMemo(() => ({ go, transition }), [go, transition])
  const useStudioCurtain = phase === 'idle' ? studio : activeStudioRef.current

  return (
    <CurtainContext.Provider value={value}>
      {children}
      <div
        className={`curtain${useStudioCurtain ? ' is-studio' : ''} ${phase}`}
        aria-hidden="true"
        data-phase={phase}
      >
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
