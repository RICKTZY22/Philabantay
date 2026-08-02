import { Navigate, useLocation } from 'react-router-dom'
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
      <AuthSlider mode={mode} from={from} />
    </div>
  )
}
