import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { DataError, type OnboardingRole } from '@barbershop/shared'
import { isProfessionalLocked } from '../lib/access'
import { useAuth } from '../features/auth/AuthContext'
import { useCurtain } from '../components/CurtainTransition'
import { RoleAvatar } from '../components/RoleAvatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import './RoleSelectionPage.css'

const OPTIONS: Array<{
  role: OnboardingRole
  title: string
  kicker: string
  description: string
  note: string
}> = [
  {
    role: 'barber',
    title: 'Barber',
    kicker: 'Humanap ng shop',
    description: 'I-verify muna ang iyong identity, tapos maghanap ng shop o sumali gamit ang shop code.',
    note: 'For verification',
  },
  {
    role: 'shop_owner',
    title: 'Shop owner',
    kicker: 'I-register ang shop',
    description: 'Para sa may-ari na magse-set up ng verified team, oras, at location.',
    note: 'For verification',
  },
  {
    role: 'customer',
    title: 'Customer',
    kicker: 'Maghanap at mag-book',
    description: 'Tingnan ang available chairs, mag-book, at kausapin ang barbershop.',
    note: 'Active agad',
  },
]

export function RoleSelectionPage() {
  const { profile, completeRoleOnboarding } = useAuth()
  const { go } = useCurtain()
  const trackerRef = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<OnboardingRole | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const root = trackerRef.current
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const finePointer = window.matchMedia?.('(pointer: fine)').matches
    if (!root || reduced || !finePointer || profile?.onboarding_completed) return undefined

    let pointerX = 0
    let pointerY = 0
    let frame = 0

    // Isang listener + isang animation frame lang para sa lahat ng portraits.
    // CSS variables diretso ang update kaya walang React render kada galaw ng mouse.
    const paint = () => {
      frame = 0
      root.querySelectorAll<HTMLElement>('.role-avatar-frame').forEach((avatar) => {
        const rect = avatar.getBoundingClientRect()
        const x = clamp((pointerX - (rect.left + rect.width / 2)) / (rect.width * 0.72), -1, 1)
        const y = clamp((pointerY - (rect.top + rect.height / 2)) / (rect.height * 0.72), -1, 1)
        avatar.style.setProperty('--look-x', `${(x * 5.5).toFixed(2)}px`)
        avatar.style.setProperty('--look-y', `${(y * 4).toFixed(2)}px`)
        avatar.style.setProperty('--head-x', `${(x * 2).toFixed(2)}px`)
        avatar.style.setProperty('--head-y', `${(y * 1.3).toFixed(2)}px`)
        avatar.style.setProperty('--head-rotate', `${(x * 2.2).toFixed(2)}deg`)
      })
    }
    const onPointerMove = (event: PointerEvent | MouseEvent) => {
      pointerX = event.clientX
      pointerY = event.clientY
      if (!frame) frame = window.requestAnimationFrame(paint)
    }
    const reset = () => {
      root.querySelectorAll<HTMLElement>('.role-avatar-frame').forEach((avatar) => {
        avatar.style.removeProperty('--look-x')
        avatar.style.removeProperty('--look-y')
        avatar.style.removeProperty('--head-x')
        avatar.style.removeProperty('--head-y')
        avatar.style.removeProperty('--head-rotate')
      })
    }

    root.addEventListener('pointermove', onPointerMove, { passive: true })
    // `mousemove` fallback para sa embedded browsers na mouse event lang ang emit.
    root.addEventListener('mousemove', onPointerMove, { passive: true })
    root.addEventListener('pointerleave', reset)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('mousemove', onPointerMove)
      root.removeEventListener('pointerleave', reset)
      reset()
    }
  }, [profile?.onboarding_completed])

  if (!profile) return null
  if (isProfessionalLocked(profile)) return <Navigate to="/verification" replace />

  async function continueOnboarding() {
    if (!selected || busy) return
    setError('')
    setBusy(true)
    try {
      await completeRoleOnboarding({ role: selected })
      // Both professional roles land on the locked verification workspace; only
      // a customer request unlocks the app immediately.
      go(selected === 'customer' ? '/dashboard' : '/verification')
    } catch (err) {
      setError(err instanceof DataError ? err.message : 'Hindi natuloy. Subukan ulit.')
      setBusy(false)
    }
  }

  if (profile.onboarding_completed) {
    return (
      <section className="role-onboarding role-status" aria-labelledby="role-complete-title">
        <div className="status-stamp is-done"><DoodleIcon name="check" size={54} /></div>
        <span className="eyebrow">Account ready</span>
        <h1 id="role-complete-title">Nakapili ka na.</h1>
        <p>{profile.role === 'barber' ? 'Registered barber account ang active sa profile mo.' : profile.role === 'shop_owner' ? 'Shop owner account ang active sa profile mo.' : 'Customer account ang active sa profile mo.'}</p>
        <button className="btn btn-primary" onClick={() => go('/dashboard')}>Tuloy sa dashboard</button>
      </section>
    )
  }

  return (
    <section className="role-onboarding" aria-labelledby="role-title" ref={trackerRef}>
      <header className="role-heading">
        <div>
          <span className="eyebrow">One last step</span>
          <h1 id="role-title">Paano mo gagamitin ang Philabantay?</h1>
          <p>Pili ka muna. Barber accounts hahanap o sasali muna sa employer bago maging public.</p>
        </div>
        <div className="role-heading-doodle" aria-hidden="true">
          <DoodleIcon name="pole" size={54} />
          <span>safe muna</span>
        </div>
      </header>

      <div className="role-options" role="radiogroup" aria-label="Account type">
        {OPTIONS.map((option, index) => {
          const active = selected === option.role
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              className={`role-option role-option-${index + 1} role-option-${option.role} ${active ? 'is-selected' : ''}`}
              key={option.role}
              onClick={() => setSelected(option.role)}
            >
              <span className="role-check"><DoodleIcon name={active ? 'check' : 'plus'} size={22} /></span>
              <RoleAvatar role={option.role} />
              <span className="role-kicker">{option.kicker}</span>
              <strong>{option.title}</strong>
              <span className="role-description">{option.description}</span>
              <span className="role-note">{option.note}</span>
            </button>
          )
        })}
      </div>

      <div className="role-submit-row">
        <div className="role-safety-note">
          <DoodleIcon name="check" size={26} />
          <span>Barber at owner accounts ay dumadaan muna sa verification bago mabuksan ang professional tools. Customer accounts ay active agad.</span>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={!selected || busy} onClick={continueOnboarding}>
          {busy
            ? 'Sine-save...'
            : !selected
              ? 'Pumili muna'
              : selected === 'customer'
                ? 'Start booking'
                : 'Submit for verification'}
          {!busy && <DoodleIcon name="arrow" size={22} />}
        </button>
      </div>
    </section>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
