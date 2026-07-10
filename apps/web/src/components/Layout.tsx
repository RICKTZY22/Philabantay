import { Suspense } from 'react'
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SHOP_NAME } from '@barbershop/shared'
import { DoodleDefs } from '../theme/DoodleDefs'
import { useAuth } from '../features/auth/AuthContext'
import { CurtainProvider } from './CurtainTransition'
import { Loading } from './Loading'
import { RouteErrorBoundary } from './RouteErrorBoundary'

export function Layout() {
  const { profile, isBarber, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // May sariling auth billboard ang landing, kaya chill at malinis lang ang nav doon.
  const onLanding = location.pathname === '/'

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <CurtainProvider>
    <div className="app-shell">
      <div className="bg-pattern" aria-hidden="true" />
      <DoodleDefs />
      <header className="container">
        <nav className="site-nav">
          <Link to="/" className="brand">
            <span className="brand-pole" aria-hidden="true" />
            {SHOP_NAME}
          </Link>
          <div className="nav-links">
            {/* Navigation feature flags: profile at role ang source of truth dito. */}
            {(profile || !onLanding) && <NavLink to="/barbers" className="nav-link">Barbers</NavLink>}
            {profile && <NavLink to="/appointments" className="nav-link">Appointments</NavLink>}
            {profile && <NavLink to="/chat" className="nav-link">Chat</NavLink>}
            {isBarber && <NavLink to="/dashboard" className="nav-link">Dashboard</NavLink>}
            {profile ? (
              <>
                <span className="pill pill-yellow">{profile.full_name}</span>
                <button className="btn btn-sm" onClick={handleSignOut}>Sign out</button>
              </>
            ) : (
              !onLanding && (
                <>
                  <NavLink to="/login" className="nav-link">Log in</NavLink>
                  <Link to="/signup" className="btn btn-sm btn-primary">Sign up</Link>
                </>
              )
            )}
          </div>
        </nav>
      </header>

      <main className="page">
        <div className="container">
          {/*
            IMPORTANT - HUWAG ILIPAT SA LABAS NG LAYOUT:
            Dito lang dapat nag-suspend ang lazy page para buhay pa rin ang nav,
            footer, background, at curtain habang dina-download ang next chunk.
            ErrorBoundary ang sasalo kapag rejected ang import; Suspense naman
            kapag pending pa lang. Magkaiba sila at parehong kailangan.
          */}
          <RouteErrorBoundary key={location.key}>
            <Suspense fallback={<Loading label="Sandali, binubuksan ang page..." />}>
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </div>
      </main>

      <footer className="site-footer">
        <div className="container">
          {SHOP_NAME} · a hand-drawn place for good haircuts
        </div>
      </footer>
    </div>
    </CurtainProvider>
  )
}
