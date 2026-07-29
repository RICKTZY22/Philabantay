import { Navigate, Link, useLocation } from 'react-router-dom'
import { SHOP_NAME } from '@barbershop/shared'
import { AuthSlider } from '../components/AuthSlider'
import { useAuth } from '../features/auth/AuthContext'
import { safeInternalPath } from '../lib/security'

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const location = useLocation()
  const { profile } = useAuth()
  const state = location.state as { from?: string } | null
  const from = safeInternalPath(state?.from ?? '/dashboard')

  if (profile) {
    const destination = profile.onboarding_completed
      ? from
      : `/onboarding/role?from=${encodeURIComponent(from)}`
    return <Navigate to={destination} replace />
  }

  return (
    <div className="auth-page">
      <div className="auth-page-meta">
        <Link to="/" className="auth-back-link">← Back to home</Link>
        <span><i aria-hidden="true" /> Secure {SHOP_NAME} access</span>
      </div>
      <AuthSlider mode={mode} from={from} />
      <p className="auth-page-footnote">
        Local shops stay in control of their staff, services, and appointment decisions.
      </p>
    </div>
  )
}
