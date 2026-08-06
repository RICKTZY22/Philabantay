import { lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { LandingPage } from './pages/LandingPage'
import { useAuth } from './features/auth/AuthContext'

// Lazy routes: landing page lang ang kasama agad sa unang download para mabilis
// ang first paint. Yung ibang feature page, kukunin lang kapag binuksan na.
//
// IMPORTANT - HUWAG BASTA ALISIN ANG `.then(...)`:
// Named exports ang pages natin (`export function AppointmentsPage`), pero
// default export ang hinihingi ng React.lazy. Ito ang tulay nila; pag tinanggal,
// sabog ang route chunk sa runtime kahit mukhang okay ang import path.
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })))
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AppDashboardPage = lazy(() => import('./pages/AppDashboardPage').then((m) => ({ default: m.AppDashboardPage })))
const ShopSetupPage = lazy(() => import('./pages/ShopSetupPage').then((m) => ({ default: m.ShopSetupPage })))
const OwnerHiringPage = lazy(() => import('./pages/OwnerHiringPage').then((m) => ({ default: m.OwnerHiringPage })))
const ProfessionalProfilePage = lazy(() => import('./pages/ProfessionalProfilePage').then((m) => ({ default: m.ProfessionalProfilePage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const RoleSelectionPage = lazy(() => import('./pages/RoleSelectionPage').then((m) => ({ default: m.RoleSelectionPage })))
const VerificationLockPage = lazy(() => import('./pages/VerificationLockPage').then((m) => ({ default: m.VerificationLockPage })))
const AdminDisputesPage = lazy(() => import('./pages/AdminDisputesPage').then((m) => ({ default: m.AdminDisputesPage })))
const AdminDisputeDetailPage = lazy(() => import('./pages/AdminDisputesPage').then((m) => ({ default: m.AdminDisputeDetailPage })))
const AdminModerationPage = lazy(() => import('./pages/AdminModerationPage').then((m) => ({ default: m.AdminModerationPage })))
const AdminOperationsPage = lazy(() => import('./pages/AdminOperationsPage').then((m) => ({ default: m.AdminOperationsPage })))
const AdminVerificationPage = lazy(() => import('./pages/AdminVerificationPage').then((m) => ({ default: m.AdminVerificationPage })))
const AdminVerificationDetailPage = lazy(() => import('./pages/AdminVerificationPage').then((m) => ({ default: m.AdminVerificationDetailPage })))
const AdminProfessionalPage = lazy(() => import('./pages/AdminVerificationPage').then((m) => ({ default: m.AdminProfessionalPage })))
const SettingsAccountPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsAccountPage })))
const SettingsAvatarPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsAvatarPage })))
const SettingsNotificationsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsNotificationsPage })))
const SettingsSecurityPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsSecurityPage })))
const SettingsBugReportPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsBugReportPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const Phase3OperationsPage = lazy(() => import('./pages/Phase3OperationsPage').then((m) => ({ default: m.Phase3OperationsPage })))
const WalkInClaimPage = lazy(() => import('./pages/WalkInClaimPage').then((m) => ({ default: m.WalkInClaimPage })))

function RoleAwareAppointments() {
  const { profile } = useAuth()
  if (profile?.role === 'shop_owner') return <Navigate to="/dashboard/owner/reservations" replace />
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
        {/* Real deep-linkable auth pages keep the public landing value-first. */}
        <Route path="login" element={<AuthPage mode="signin" />} />
        <Route path="signup" element={<AuthPage mode="signup" />} />
        <Route path="walk-in/:walkInId/claim" element={<WalkInClaimPage />} />

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
        {/* Shop Setup is its own owner workspace, distinct from the dashboard
            sections. Declared before the :ownerSection param route. */}
        <Route
          path="dashboard/owner/shop"
          element={
            <RequireAuth role="shop_owner">
              <ShopSetupPage />
            </RequireAuth>
          }
        />
        <Route
          path="dashboard/owner/hiring"
          element={
            <RequireAuth role="shop_owner">
              <OwnerHiringPage />
            </RequireAuth>
          }
        />
        <Route
          path="dashboard/owner/operations"
          element={<RequireAuth role="shop_owner"><Phase3OperationsPage /></RequireAuth>}
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
          path="chair"
          element={<RequireAuth role="barber"><Phase3OperationsPage /></RequireAuth>}
        />
        <Route
          path="schedule"
          element={
            <RequireAuth role="barber">
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route path="dashboard/barber" element={<Navigate to="/schedule" replace />} />
        <Route path="professional" element={<RequireAuth role="barber"><ProfessionalProfilePage /></RequireAuth>} />
        <Route path="admin/disputes" element={<RequireAuth role="admin"><AdminDisputesPage /></RequireAuth>} />
        <Route path="admin/disputes/:caseId" element={<RequireAuth role="admin"><AdminDisputeDetailPage /></RequireAuth>} />
        <Route path="admin/moderation" element={<RequireAuth role="admin"><AdminModerationPage /></RequireAuth>} />
        <Route path="admin/operations" element={<RequireAuth role="admin"><AdminOperationsPage /></RequireAuth>} />
        <Route path="admin/verifications" element={<RequireAuth role="admin"><AdminVerificationPage /></RequireAuth>} />
        <Route path="admin/verifications/:submissionId" element={<RequireAuth role="admin"><AdminVerificationDetailPage /></RequireAuth>} />
        <Route path="admin/users/:userId" element={<RequireAuth role="admin"><AdminProfessionalPage /></RequireAuth>} />
        {/* Catch-all para friendly pa rin kapag mali o luma ang URL. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
