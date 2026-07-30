import { Navigate, Link, useLocation } from 'react-router-dom'
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
    <div className={`auth-page is-${mode}`}>
      <div className="auth-page-meta">
        <Link to="/" className="auth-back-link">
          <span aria-hidden="true">←</span>
          Back to home
        </Link>
        <span className="auth-secure-note"><i aria-hidden="true" /> Secure access</span>
      </div>

      <header className="auth-page-intro">
        <p className="auth-page-eyebrow">
          {mode === 'signin' ? 'WELCOME BACK' : 'ONE ACCOUNT, THREE WAYS TO USE IT'}
        </p>
        <h1 id="auth-page-title">
          {mode === 'signin' ? 'Good to see you again' : 'Let’s get you set up'}
        </h1>
        <p className="auth-page-summary">
          {mode === 'signin'
            ? 'Log in to manage your next appointment, chair, or shop.'
            : 'Create your account now. You’ll choose customer, barber, or shop owner next.'}
        </p>
      </header>

      <AuthSlider mode={mode} from={from} />

      <div className="auth-role-strip" aria-label="One account works for">
        <span className="auth-role-label">One account for</span>
        <span><i className="is-customer" aria-hidden="true" /> Customers</span>
        <span><i className="is-barber" aria-hidden="true" /> Barbers</span>
        <span><i className="is-owner" aria-hidden="true" /> Shop owners</span>
      </div>

      <p className="auth-page-footnote">
        Professional tools stay locked until the required verification is complete.
      </p>
    </div>
  )
}
