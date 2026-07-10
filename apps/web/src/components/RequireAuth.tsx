import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { Loading } from './Loading'

/** Bantay ng private routes: session muna, saka login at role checks. */
export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode
  role?: 'barber' | 'admin'
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

  // May login pero maling role: huwag i-render kahit saglit ang protected page.
  // NOTE: UX guard lang ito; Supabase RLS pa rin ang totoong security boundary.
  if (role && profile.role !== role) return <Navigate to="/" replace />

  return <>{children}</>
}
