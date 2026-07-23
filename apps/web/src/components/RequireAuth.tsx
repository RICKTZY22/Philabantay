import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Role } from '@barbershop/shared'
import { isProfessionalLocked } from '../lib/access'
import { useAuth } from '../features/auth/AuthContext'
import { Loading } from './Loading'

/** Bantay ng private routes: session muna, saka login at role checks. */
export function RequireAuth({
  children,
  role,
  allowIncomplete = false,
  allowVerificationLocked = false,
}: {
  children: ReactNode
  role?: Role
  allowIncomplete?: boolean
  allowVerificationLocked?: boolean
}) {
  const { profile, loading } = useAuth()
  const location = useLocation()
  const from = `${location.pathname}${location.search}${location.hash}`

  // IMPORTANT - HUWAG PAGPALITIN ANG ORDER NITO:
  // Hintayin muna ang session restore. Kapag inuna ang `!profile`, mapapatalon
  // sa login kahit valid pa ang session at magmumukhang random auth bug.
  if (loading) return <Loading label="Tinitingnan ang session..." />

  // Walang session: tandaan ang pinanggalingan para makabalik after login.
  if (!profile) return <Navigate to="/login" state={{ from }} replace />

  // Bago gumamit ng private features, tapusin muna ang one-time role choice.
  // Role page lang ang sadyang may `allowIncomplete` para walang redirect loop.
  if (!allowIncomplete && !profile.onboarding_completed) {
    return <Navigate to={`/onboarding/role?from=${encodeURIComponent(from)}`} replace />
  }

  // Professional verification is a full account lock, not a dashboard preview.
  // Keep direct URLs such as /settings from rendering even for a single frame,
  // for pending/rejected/suspended barbers and owners alike.
  if (!allowVerificationLocked && isProfessionalLocked(profile)) {
    return <Navigate to="/verification" replace />
  }

  // May login pero maling role: huwag i-render kahit saglit ang protected page.
  // NOTE: UX guard lang ito; Supabase RLS pa rin ang totoong security boundary.
  if (role && profile.role !== role) return <Navigate to="/" replace />

  return <>{children}</>
}
