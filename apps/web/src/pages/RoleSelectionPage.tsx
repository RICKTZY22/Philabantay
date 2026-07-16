import { useEffect, useRef, useState } from 'react'
import { DataError, type OnboardingRole } from '@barbershop/shared'
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
    description: 'Tingnan ang hiring map o sumali sa employer gamit ang private shop code.',
    note: 'Shop required',
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

  const pendingProfessional =
    profile.verification_status === 'pending' &&
    (profile.requested_role === 'barber' || profile.requested_role === 'shop_owner')

  async function continueOnboarding() {
    if (!selected || busy) return
    setError('')
    setBusy(true)
    try {
      await completeRoleOnboarding({ role: selected })
      // Lahat ng role sa safe app dashboard muna. Doon hiwalay ang verified tools.
      go('/dashboard')
    } catch (err) {
      setError(err instanceof DataError ? err.message : 'Hindi natuloy. Subukan ulit.')
      setBusy(false)
    }
  }

  if (pendingProfessional) {
    if (profile.requested_role === 'barber') {
      return (
        <section className="role-onboarding role-status" aria-labelledby="role-status-title">
          <div className="status-stamp"><DoodleIcon name="search" size={54} /></div>
          <span className="eyebrow">Open to work</span>
          <h1 id="role-status-title">Hiring map na ang susunod.</h1>
          <p>Wala ka pang shop affiliation. Pumili ng hiring shop at mag-apply, o gamitin ang code na ibinigay ng employer mo.</p>
          <div className="role-safety-note">
            <DoodleIcon name="check" size={26} />
            <span>Magiging registered barber ka lang pagkatapos ma-validate ang shop membership.</span>
          </div>
          <button className="btn btn-primary" onClick={() => go('/dashboard')}>Open hiring map</button>
        </section>
      )
    }
    const label = profile.requested_role === 'shop_owner' ? 'shop owner' : 'barber'
    return (
      <section className="role-onboarding role-status" aria-labelledby="role-status-title">
        <div className="status-stamp"><DoodleIcon name="clock" size={54} /></div>
        <span className="eyebrow">Request received</span>
        <h1 id="role-status-title">Nasa verification line ka na.</h1>
        <p>
          Naka-save ang request mo bilang <strong>{label}</strong>. Hindi muna magiging public ang
          professional profile o shop location hangga't hindi verified.
        </p>
        <div className="role-safety-note">
          <DoodleIcon name="check" size={26} />
          <span>Customer access lang muna habang pending, kaya safe pa rin ang bookings at listings.</span>
        </div>
        <button className="btn btn-primary" onClick={() => go('/barbers')}>Browse barbers muna</button>
      </section>
    )
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
          <span>Shop membership code ang nag-a-activate sa barber tools; owner verification ay hiwalay.</span>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={!selected || busy} onClick={continueOnboarding}>
          {busy
            ? 'Sine-save...'
            : !selected
              ? 'Pumili muna'
              : selected === 'customer'
                ? 'Start booking'
                : selected === 'barber'
                  ? 'Open hiring map'
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
