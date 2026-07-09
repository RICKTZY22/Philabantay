import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { Loading } from './Loading'

export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode
  role?: 'barber' | 'admin'
}) {
  const { profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!profile) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (role && profile.role !== role) return <Navigate to="/" replace />

  return <>{children}</>
}
