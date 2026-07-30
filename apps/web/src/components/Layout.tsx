import { Suspense, useEffect, useState } from 'react'
import { NavLink, Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { SHOP_NAME } from '@barbershop/shared'
import { isProfessionalLocked } from '../lib/access'
import { profileAvatarRole } from '../lib/profile'
import { DoodleDefs } from '../theme/DoodleDefs'
import { useAuth } from '../features/auth/AuthContext'
import { AppMenu } from './AppMenu'
import { CurtainProvider } from './CurtainTransition'
import { DoodleAvatar } from './DoodleAvatar'
import { Loading } from './Loading'
import { RouteErrorBoundary } from './RouteErrorBoundary'

export function Layout() {
  const { profile, loading } = useAuth()
  const location = useLocation()
  const [headerVisible, setHeaderVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const verificationLocked = Boolean(profile && isProfessionalLocked(profile))

  // Route changes should open at the top instead of inheriting the scroll
  // position of a long dashboard/map page.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])
  // Landing keeps a transparent marketing header; auth lives on dedicated routes.
  const onLanding = location.pathname === '/'
  const onAuth = location.pathname === '/login' || location.pathname === '/signup'
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
    location.pathname.startsWith('/admin/')
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

  // Do not render the public landing page (or any protected workspace) while
  // Supabase is restoring a persisted session. A pending professional must
  // never see a flash of sign-in/customer content before the verification
  // lock is known.
  if (loading) {
    return (
      <div className="app-shell">
        <div className="bg-pattern" aria-hidden="true" />
        <DoodleDefs />
        <main className="page">
          <div className="container">
            <Loading label="Sandali, tinitingnan ang session..." />
          </div>
        </main>
      </div>
    )
  }

  // Public discovery routes are normally reachable while signed in, but a
  // professional awaiting verification is intentionally restricted to one screen.
  if (verificationLocked && location.pathname !== '/verification') {
    return <Navigate to="/verification" replace />
  }

  return (
    <CurtainProvider studio={Boolean(profile)}>
    <div className={`app-shell${onLanding ? ' is-landing' : profile ? ' is-workspace' : ' is-public'}`}>
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
          ) : verificationLocked ? (
            <span className="brand" aria-label={SHOP_NAME}>
              <span className="brand-pole" aria-hidden="true" />
              {SHOP_NAME}
            </span>
          ) : (
            <Link to={brandTo} className="brand">
              <span className="brand-pole" aria-hidden="true" />
              {SHOP_NAME}
            </Link>
          )}
          <div className="nav-links">
            {/* Signed in: isang malaking hamburger lang ang buong navigation. */}
            {profile && !verificationLocked ? (
              <>
                <Link
                  to="/settings/avatar"
                  className="app-profile-avatar"
                  aria-label={`Edit ${profile.full_name}'s profile avatar`}
                  title="Edit profile avatar"
                >
                  <DoodleAvatar
                    avatarId={profile.avatar_url}
                    role={profileAvatarRole(profile)}
                    size={42}
                  />
                </Link>
                <AppMenu onOpenChange={setMenuOpen} />
              </>
            ) : (
              !profile && (onLanding ? (
                <>
                  <a href="#home" className="nav-link">Home</a>
                  <a href="#services" className="nav-link">Services</a>
                  <a href="#contact" className="nav-link">Contact Us</a>
                  {/* Auth lives at /login and /signup only. Those routes are also
                      where RequireAuth sends a signed-out visitor, so keeping one
                      surface means the `from` round-trip has a single code path. */}
                  <NavLink to="/login" className="nav-link">Log in</NavLink>
                  <Link to="/signup" className="btn btn-sm btn-primary">Sign up</Link>
                </>
              ) : (
                onAuth ? (
                  <Link
                    to={location.pathname === '/login' ? '/signup' : '/login'}
                    className="btn btn-sm btn-primary"
                  >
                    {location.pathname === '/login' ? 'Sign up' : 'Log in'}
                  </Link>
                ) : (
                  <>
                    <NavLink to="/login" className="nav-link">Log in</NavLink>
                    <Link to="/signup" className="btn btn-sm btn-primary">Sign up</Link>
                  </>
                )
              ))
            )}
          </div>
        </nav>
      </header>

      <main className={`page${onLanding ? ' is-landing-page' : ''}`}>
        <div className={`container${useWideWorkspace ? ' is-dashboard-wide' : ''}${onLanding ? ' is-landing-container' : ''}`}>
          {/*
            IMPORTANT - HUWAG ILIPAT SA LABAS NG LAYOUT:
            Dito lang dapat nag-suspend ang lazy page para buhay pa rin ang nav,
            footer, background, at curtain habang dina-download ang next chunk.
            ErrorBoundary ang sasalo kapag rejected ang import; Suspense naman
            kapag pending pa lang. Magkaiba sila at parehong kailangan.
          */}
          <RouteErrorBoundary key={location.key}>
            <div className="route-stage" key={location.key}>
              <Suspense fallback={<Loading label="Sandali, binubuksan ang page..." />}>
                <Outlet />
              </Suspense>
            </div>
          </RouteErrorBoundary>
        </div>
      </main>
    </div>
    </CurtainProvider>
  )
}
