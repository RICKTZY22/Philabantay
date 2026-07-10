import { lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { LandingPage } from './pages/LandingPage'

// Lazy routes: landing page lang ang kasama agad sa unang download para mabilis
// ang first paint. Yung ibang feature page, kukunin lang kapag binuksan na.
//
// IMPORTANT - HUWAG BASTA ALISIN ANG `.then(...)`:
// Named exports ang pages natin (`export function BarbersPage`), pero default
// export ang hinihingi ng React.lazy. Ito ang tulay nila; pag tinanggal, sabog
// ang route chunk sa runtime kahit mukhang okay ang import path.
const BarbersPage = lazy(() => import('./pages/BarbersPage').then((m) => ({ default: m.BarbersPage })))
const BarberDetailPage = lazy(() => import('./pages/BarberDetailPage').then((m) => ({ default: m.BarberDetailPage })))
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage').then((m) => ({ default: m.AppointmentsPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })))
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

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public home: intentionally hindi lazy para instant ang unang screen. */}
        <Route index element={<LandingPage />} />
        {/* Auth aliases: walang duplicate login/signup page, billboard lang. */}
        <Route path="login" element={<AuthRedirect />} />
        <Route path="signup" element={<AuthRedirect />} />

        {/* Public discovery: puwedeng tumingin ng shops kahit guest pa. */}
        <Route path="barbers" element={<BarbersPage />} />
        <Route path="barbers/:barberId" element={<BarberDetailPage />} />

        {/* Customer features: kailangan munang may restored auth profile. */}
        <Route
          path="appointments"
          element={
            <RequireAuth>
              <AppointmentsPage />
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
        {/* Barber tools: role guard bago pa ma-download/render ang dashboard UI. */}
        <Route
          path="dashboard"
          element={
            <RequireAuth role="barber">
              <DashboardPage />
            </RequireAuth>
          }
        />
        {/* Catch-all para friendly pa rin kapag mali o luma ang URL. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
