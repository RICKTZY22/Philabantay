import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { SHOP_NAME } from '@barbershop/shared'
import { DoodleDefs } from '../theme/DoodleDefs'
import { useAuth } from '../features/auth/AuthContext'
import { CurtainProvider, CurtainLink } from './CurtainTransition'

export function Layout() {
  const { profile, isBarber, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The landing hero carries its own Sign up / Sign in, so keep the header clean there.
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
            {/* The landing header stays clean — no Barbers link for visitors. */}
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
                  <CurtainLink to="/login" className="nav-link">Log in</CurtainLink>
                  <CurtainLink to="/signup" className="btn btn-sm btn-primary">Sign up</CurtainLink>
                </>
              )
            )}
          </div>
        </nav>
      </header>

      <main className="page">
        <div className="container">
          <Outlet />
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
