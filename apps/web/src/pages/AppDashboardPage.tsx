import { lazy, Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { CustomerDashboard } from '../components/CustomerDashboard'
import { Loading } from '../components/Loading'
import { isOwnerDashboardSection } from '../config/navigation'
import { isProfessionalLocked } from '../lib/access'

const ShopOwnerDashboard = lazy(() => import('../components/ShopOwnerDashboard').then((module) => ({
  default: module.ShopOwnerDashboard,
})))
const BarberDashboard = lazy(() => import('../components/BarberDashboard').then((module) => ({
  default: module.BarberDashboard,
})))

export function AppDashboardPage() {
  const { profile, isBarber, isShopOwner, isAdmin } = useAuth()
  const { ownerSection } = useParams<{ ownerSection: string }>()
  if (!profile) return null

  // Defense in depth: a locked professional must never see a partially rendered
  // dashboard. RequireAuth already redirects, but a direct mount reaches here too.
  if (isProfessionalLocked(profile)) return <Navigate to="/verification" replace />

  const firstName = profile.full_name.trim().split(/\s+/)[0]
  const pending = profile.verification_status === 'pending'

  if (isAdmin) return <Navigate to="/admin/verifications" replace />

  // Owner tools only render for the granted role. Pending owner requests are
  // intercepted by the global verification lock before this page can mount.
  if (isShopOwner) {
    if (!isOwnerDashboardSection(ownerSection)) {
      return <Navigate to="/dashboard/owner/overview" replace />
    }
    return (
      <Suspense fallback={<Loading label="Opening owner tools…" />}>
        <ShopOwnerDashboard ownerName={profile.full_name} section={ownerSection} />
      </Suspense>
    )
  }

  // Owner-only URLs never fall through to a customer or barber dashboard.
  if (ownerSection) return <Navigate to="/dashboard" replace />

  // Pending barber sees the layout but never gets write access; the verified
  // role guard on /dashboard/barber remains the real security boundary.
  if (profile.requested_role === 'barber' || isBarber) {
    return <Suspense fallback={<Loading label="Opening chair tools…" />}><BarberDashboard barberId={profile.id} barberName={profile.full_name} pending={pending} /></Suspense>
  }

  // Customer home: sidebar shell + live map + favorites, walang extra hero.
  return <CustomerDashboard firstName={firstName} avatarId={profile.avatar_url} />
}
