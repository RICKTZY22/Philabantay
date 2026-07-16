import { Suspense, useEffect, useState } from 'react'
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
  const [headerVisible, setHeaderVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  // Route changes should open at the top instead of inheriting the scroll
  // position of a long dashboard/map page.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])
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
    location.pathname === '/schedule' ||
    location.pathname === '/appointments' ||
    location.pathname.startsWith('/chat') ||
    location.pathname.startsWith('/barbers')
  // Ang "home" ng naka-sign-in na user ay ang dashboard, hindi ang landing
  // billboard (may login form iyon). Kaya iiwas tayong ihatid sila pabalik sa
  // login page kapag pinindot ang brand title.
  const brandTo = profile ? '/dashboard' : '/'
  // Customer chat screen: walang Philabantay wordmark sa header para malinis
  // ang Shop Desk view. Barber at owner chat views are intentionally untouched.
  const isCustomerRole = profile?.role === 'customer'
    && profile.requested_role !== 'barber'
    && profile.requested_role !== 'shop_owner'
  const hideBrand = isCustomerRole && location.pathname.startsWith('/chat')

  useEffect(() => {
    setHeaderVisible(true)
    if (!stickyHeader) return

    let lastY = Math.max(0, window.scrollY)
    let travel = 0
    let direction = 0

    const onScroll = () => {
      const currentY = Math.max(0, window.scrollY)
      const delta = currentY - lastY
      const nextDirection = Math.sign(delta)

      if (menuOpen || currentY <= 24) {
        setHeaderVisible(true)
        travel = 0
        direction = nextDirection
        lastY = currentY
        return
      }

      if (nextDirection !== 0 && nextDirection !== direction) travel = 0
      if (nextDirection !== 0) direction = nextDirection
      travel += delta

      // Ignore trackpad/cursor-wheel jitter. Hide only after a deliberate
      // downward move, then reveal a little faster on the way back up.
      if (currentY > 96 && travel >= 30) {
        setHeaderVisible(false)
        travel = 0
      } else if (travel <= -18) {
        setHeaderVisible(true)
        travel = 0
      }

      lastY = currentY
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.pathname, menuOpen, stickyHeader])

  return (
    <CurtainProvider>
    <div className="app-shell">
      <div className="bg-pattern" aria-hidden="true" />
      <DoodleDefs />
      <header
        className={`container app-header${stickyHeader ? ' is-sticky' : ''}${stickyHeader && !headerVisible ? ' is-hidden' : ''}${useWideWorkspace ? ' is-dashboard-wide' : ''}`}
        onFocusCapture={() => setHeaderVisible(true)}
      >
        <nav className="site-nav">
          {hideBrand ? (
            // Spacer keeps the hamburger right-aligned (space-between layout).
            <span aria-hidden="true" />
          ) : (
            <Link to={brandTo} className="brand">
              <span className="brand-pole" aria-hidden="true" />
              {SHOP_NAME}
            </Link>
          )}
          <div className="nav-links">
            {/* Signed in: isang malaking hamburger lang ang buong navigation. */}
            {profile ? (
              <AppMenu onOpenChange={setMenuOpen} />
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
    </div>
    </CurtainProvider>
  )
}
