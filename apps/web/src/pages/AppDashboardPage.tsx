import { useAuth } from '../features/auth/AuthContext'
import { ShopOwnerDashboard } from '../components/ShopOwnerDashboard'
import { BarberDashboard } from '../components/BarberDashboard'
import { CustomerDashboard } from '../components/CustomerDashboard'

export function AppDashboardPage() {
  const { profile, isBarber, isShopOwner } = useAuth()
  if (!profile) return null

  const firstName = profile.full_name.trim().split(/\s+/)[0]
  const pending = profile.verification_status === 'pending'

  // Pending owner gets the full dashboard preview, pero locked pa ang real writes.
  if (profile.requested_role === 'shop_owner' || isShopOwner) {
    return <ShopOwnerDashboard ownerName={profile.full_name} pending={pending} />
  }

  // Pending barber sees the layout but never gets write access; the verified
  // role guard on /dashboard/barber remains the real security boundary.
  if (profile.requested_role === 'barber' || isBarber) {
    return <BarberDashboard barberId={profile.id} barberName={profile.full_name} pending={pending} />
  }

  // Customer home: sidebar shell + live map + favorites, walang extra hero.
  return <CustomerDashboard firstName={firstName} />
}
