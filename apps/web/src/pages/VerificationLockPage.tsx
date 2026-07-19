import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { isOwnerVerificationLocked } from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import { DoodleIcon } from '../theme/DoodleDefs'
import './VerificationLockPage.css'

const STATUS_COPY = {
  pending: {
    eyebrow: 'Verification in progress',
    title: 'Your owner account is locked for now.',
    message: 'We are reviewing your shop-owner registration. You cannot open the dashboard, settings, messages, or any shop tools until the account is approved.',
    badge: 'Pending review',
  },
  rejected: {
    eyebrow: 'Verification not approved',
    title: 'Your owner account remains locked.',
    message: 'The registration was not approved. Shop tools and account settings will stay unavailable while the verification is unresolved.',
    badge: 'Not approved',
  },
  suspended: {
    eyebrow: 'Access paused',
    title: 'Your owner account is locked.',
    message: 'Access to the owner workspace has been suspended. Dashboard, settings, messages, and shop tools are unavailable.',
    badge: 'Suspended',
  },
  unverified: {
    eyebrow: 'Verification required',
    title: 'Your owner account is locked for now.',
    message: 'Your shop-owner registration still needs verification before any account or shop tools can be used.',
    badge: 'Not verified',
  },
} as const

export function VerificationLockPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

  if (!profile) return null
  if (!isOwnerVerificationLocked(profile)) return <Navigate to="/dashboard" replace />

  const copy = STATUS_COPY[profile.verification_status as keyof typeof STATUS_COPY] ?? STATUS_COPY.unverified

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setError('')
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch {
      setError('Hindi ka ma-sign out ngayon. Subukan ulit.')
      setSigningOut(false)
    }
  }

  return (
    <section className="verification-lock" aria-labelledby="verification-lock-title">
      <div className="verification-lock-stamp" aria-hidden="true">
        <DoodleIcon name="clock" size={72} />
      </div>

      <div className="verification-lock-copy">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1 id="verification-lock-title">{copy.title}</h1>
        <p>{copy.message}</p>
      </div>

      <div className="verification-lock-status" role="status">
        <span className="verification-lock-dot" aria-hidden="true" />
        <div>
          <strong>{copy.badge}</strong>
          <span>Signed in as {profile.full_name}</span>
        </div>
      </div>

      <div className="verification-lock-note">
        <DoodleIcon name="check" size={30} />
        <p>
          Walang puwedeng baguhin habang pending ang verification. Kapag approved na,
          sign in ulit para mabuksan ang owner workspace.
        </p>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <button
        type="button"
        className="btn btn-danger verification-lock-signout"
        disabled={signingOut}
        onClick={handleSignOut}
      >
        <DoodleIcon name="x" size={24} />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </section>
  )
}
