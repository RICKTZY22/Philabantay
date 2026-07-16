import { lazy, Suspense } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { CustomerDashboard } from '../components/CustomerDashboard'
import { Loading } from '../components/Loading'

const ShopOwnerDashboard = lazy(() => import('../components/ShopOwnerDashboard').then((module) => ({
  default: module.ShopOwnerDashboard,
})))
const BarberDashboard = lazy(() => import('../components/BarberDashboard').then((module) => ({
  default: module.BarberDashboard,
})))

export function AppDashboardPage() {
  const { profile, isBarber, isShopOwner } = useAuth()
  if (!profile) return null

  const firstName = profile.full_name.trim().split(/\s+/)[0]
  const pending = profile.verification_status === 'pending'

  // Pending owner gets the full dashboard preview, pero locked pa ang real writes.
  if (profile.requested_role === 'shop_owner' || isShopOwner) {
    return <Suspense fallback={<Loading label="Opening owner tools…" />}><ShopOwnerDashboard ownerName={profile.full_name} pending={pending} /></Suspense>
  }

  // Pending barber sees the layout but never gets write access; the verified
  // role guard on /dashboard/barber remains the real security boundary.
  if (profile.requested_role === 'barber' || isBarber) {
    return <Suspense fallback={<Loading label="Opening chair tools…" />}><BarberDashboard barberId={profile.id} barberName={profile.full_name} pending={pending} /></Suspense>
  }

  // Customer home: sidebar shell + live map + favorites, walang extra hero.
  return <CustomerDashboard firstName={firstName} avatarId={profile.avatar_url} />
}
