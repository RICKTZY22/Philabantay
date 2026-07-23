import { lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { LandingPage } from './pages/LandingPage'
import { useAuth } from './features/auth/AuthContext'

// Lazy routes: landing page lang ang kasama agad sa unang download para mabilis
// ang first paint. Yung ibang feature page, kukunin lang kapag binuksan na.
//
// IMPORTANT - HUWAG BASTA ALISIN ANG `.then(...)`:
// Named exports ang pages natin (`export function BarbersPage`), pero default
// export ang hinihingi ng React.lazy. Ito ang tulay nila; pag tinanggal, sabog
// ang route chunk sa runtime kahit mukhang okay ang import path.
const BarbersPage = lazy(() => import('./pages/BarbersPage').then((m) => ({ default: m.BarbersPage })))
const FavoriteBarbersPage = lazy(() => import('./pages/BarbersPage').then((m) => ({ default: m.FavoriteBarbersPage })))
const BarberDetailPage = lazy(() => import('./pages/BarberDetailPage').then((m) => ({ default: m.BarberDetailPage })))
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AppDashboardPage = lazy(() => import('./pages/AppDashboardPage').then((m) => ({ default: m.AppDashboardPage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const RoleSelectionPage = lazy(() => import('./pages/RoleSelectionPage').then((m) => ({ default: m.RoleSelectionPage })))
const VerificationLockPage = lazy(() => import('./pages/VerificationLockPage').then((m) => ({ default: m.VerificationLockPage })))
const AdminVerificationPage = lazy(() => import('./pages/AdminVerificationPage').then((m) => ({ default: m.AdminVerificationPage })))
const AdminVerificationDetailPage = lazy(() => import('./pages/AdminVerificationPage').then((m) => ({ default: m.AdminVerificationDetailPage })))
const AdminProfessionalPage = lazy(() => import('./pages/AdminVerificationPage').then((m) => ({ default: m.AdminProfessionalPage })))
const SettingsAccountPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsAccountPage })))
const SettingsAvatarPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsAvatarPage })))
const SettingsNotificationsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsNotificationsPage })))
const SettingsSecurityPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsSecurityPage })))
const SettingsBugReportPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsBugReportPage })))
const ShopProfilePage = lazy(() => import('./pages/ShopProfilePage').then((m) => ({ default: m.ShopProfilePage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

/**
 * Nasa landing billboard ang auth form. Dinadala lang nito ang tamang mode at
 * yung `from` destination para makabalik ang user sa original niyang sadya.
 */
function AuthRedirect() {
  const location = useLocation()
  const mode: 'signin' | 'signup' = location.pathname === '/signup' ? 'signup' : 'signin'
  const prev = (location.state as Record<string, unknown> | null) ?? {}
  return <Navigate to="/" replace state={{ ...prev, authMode: mode }} />
}

function RoleAwareAppointments() {
  const { profile } = useAuth()
  if (profile?.role === 'barber' || profile?.requested_role === 'barber') {
    return <Navigate to={profile.role === 'barber' ? '/schedule' : '/dashboard'} replace />
  }
  return <AppointmentsPage />
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public home: intentionally hindi lazy para instant ang unang screen. */}
        <Route index element={<LandingPage />} />
        {/* Auth aliases: walang duplicate login/signup page, billboard lang. */}
        <Route path="login" element={<AuthRedirect />} />
        <Route path="signup" element={<AuthRedirect />} />

        {/* One-time role request: signed in dapat, pero incomplete profile is allowed. */}
        <Route
          path="onboarding/role"
          element={
            <RequireAuth allowIncomplete>
              <RoleSelectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="verification"
          element={
            <RequireAuth allowIncomplete allowVerificationLocked>
              <VerificationLockPage />
            </RequireAuth>
          }
        />

        {/* Public discovery: puwedeng tumingin ng shops kahit guest pa. */}
        <Route path="barbers" element={<BarbersPage />} />
        <Route path="barbers/favorites" element={<FavoriteBarbersPage />} />
        <Route path="barbers/:barberId" element={<BarberDetailPage />} />
        <Route path="shops/:shopId" element={<ShopProfilePage />} />

        {/* Customer features: kailangan munang may restored auth profile. */}
        <Route
          path="appointments"
          element={
            <RequireAuth>
              <RoleAwareAppointments />
            </RequireAuth>
          }
        />
        <Route
          path="chat"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="chat/:conversationId"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        {/* Safe app home: role-aware pero walang privileged shop controls. */}
        <Route
          path="dashboard"
          element={
            <RequireAuth>
              <AppDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="dashboard/owner/:ownerSection"
          element={
            <RequireAuth>
              <AppDashboardPage />
            </RequireAuth>
          }
        />
        {/* Account preferences ng kahit anong signed-in user. */}
        <Route path="settings" element={<Navigate to="/settings/account" replace />} />
        <Route
          path="settings/account"
          element={
            <RequireAuth>
              <SettingsAccountPage />
            </RequireAuth>
          }
        />
        <Route path="settings/avatar" element={<RequireAuth><SettingsAvatarPage /></RequireAuth>} />
        <Route path="settings/notifications" element={<RequireAuth><SettingsNotificationsPage /></RequireAuth>} />
        <Route path="settings/security" element={<RequireAuth><SettingsSecurityPage /></RequireAuth>} />
        <Route path="settings/report-bug" element={<RequireAuth><SettingsBugReportPage /></RequireAuth>} />
        {/* One barber schedule screen. The legacy URL redirects here so there
            is no duplicate chair-tools/booking flow. */}
        <Route
          path="schedule"
          element={
            <RequireAuth role="barber">
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route path="dashboard/barber" element={<Navigate to="/schedule" replace />} />
        <Route path="admin/verifications" element={<RequireAuth role="admin"><AdminVerificationPage /></RequireAuth>} />
        <Route path="admin/verifications/:submissionId" element={<RequireAuth role="admin"><AdminVerificationDetailPage /></RequireAuth>} />
        <Route path="admin/users/:userId" element={<RequireAuth role="admin"><AdminProfessionalPage /></RequireAuth>} />
        {/* Catch-all para friendly pa rin kapag mali o luma ang URL. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
