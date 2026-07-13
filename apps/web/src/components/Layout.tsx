import { Suspense } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { SHOP_NAME } from '@barbershop/shared'
import { DoodleDefs } from '../theme/DoodleDefs'
import { useAuth } from '../features/auth/AuthContext'
import { AppMenu } from './AppMenu'
import { CurtainProvider } from './CurtainTransition'
import { Loading } from './Loading'
import { RouteErrorBoundary } from './RouteErrorBoundary'

export function Layout() {
  const { profile } = useAuth()
  const location = useLocation()
  // May sariling auth billboard ang landing, kaya chill at malinis lang ang nav doon.
  const onLanding = location.pathname === '/'
  // Signed-in app pages: naka-pin ang header bar sa taas para laging abot ang
  // hamburger habang nag-scroll, pero HINDI tumatakip nang biglaan sa content
  // (kabaligtaran ng floating button). Iniiwasan ang landing para buo ang scroll
  // journey nito.
  const stickyHeader = Boolean(profile) && !onLanding
  // Data-heavy app workspaces share the wider container. Reading-oriented
  // forms and account pages keep the narrower default width.
  const useWideWorkspace =
    location.pathname === '/dashboard' ||
    location.pathname.startsWith('/dashboard/') ||
    location.pathname === '/appointments' ||
    location.pathname.startsWith('/chat') ||
    location.pathname.startsWith('/barbers')
  // Ang "home" ng naka-sign-in na user ay ang dashboard, hindi ang landing
  // billboard (may login form iyon). Kaya iiwas tayong ihatid sila pabalik sa
  // login page kapag pinindot ang brand title.
  const brandTo = profile ? '/dashboard' : '/'

  return (
    <CurtainProvider>
    <div className="app-shell">
      <div className="bg-pattern" aria-hidden="true" />
      <DoodleDefs />
      <header className={`container app-header${stickyHeader ? ' is-sticky' : ''}${useWideWorkspace ? ' is-dashboard-wide' : ''}`}>
        <nav className="site-nav">
          <Link to={brandTo} className="brand">
            <span className="brand-pole" aria-hidden="true" />
            {SHOP_NAME}
          </Link>
          <div className="nav-links">
            {/* Signed in: isang malaking hamburger lang ang buong navigation. */}
            {profile ? (
              <AppMenu />
            ) : (
              !onLanding && (
                <>
                  <NavLink to="/barbers" className="nav-link">Barbers</NavLink>
                  <NavLink to="/login" className="nav-link">Log in</NavLink>
                  <Link to="/signup" className="btn btn-sm btn-primary">Sign up</Link>
                </>
              )
            )}
          </div>
        </nav>
      </header>

      <main className="page">
        <div className={`container${useWideWorkspace ? ' is-dashboard-wide' : ''}`}>
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
