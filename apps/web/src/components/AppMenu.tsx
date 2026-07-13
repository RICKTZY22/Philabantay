import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { profileRoleLabel } from '../lib/profile'
import { Avatar } from './Avatar'
import { useCurtain } from './CurtainTransition'
import { DoodleIcon, type DoodleIconName } from '../theme/DoodleDefs'
import './AppMenu.css'

const ITEMS: Array<{ to: string; icon: DoodleIconName; label: string; end?: boolean }> = [
  { to: '/dashboard', icon: 'home', label: 'Home', end: true },
  { to: '/chat', icon: 'chat', label: 'Chats' },
  { to: '/appointments', icon: 'calendar', label: 'Bookings' },
  { to: '/barbers', icon: 'scissors', label: 'Barbers' },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]

/**
 * Ang tanging navigation ng signed-in users: isang malaking hamburger na
 * nagiging X, may drawer na dumudulas mula sa kanan. Laging naka-mount ang
 * drawer para CSS transition (hindi mount/unmount) ang animation.
 */
export function AppMenu() {
  const { profile, isBarber, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { go } = useCurtain()
  const [open, setOpen] = useState(false)
  const burgerRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)

  // Browser back/forward at programmatic navigation: huwag iwanang bukas ang drawer.
  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    const inertTargets = ['main.page', '.site-footer', '.brand']
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((element): element is HTMLElement => Boolean(element))
    const previousInert = inertTargets.map((element) => element.inert)
    inertTargets.forEach((element) => { element.inert = true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab') return

      const drawerFocusables = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [],
      )
      const focusables = burgerRef.current ? [burgerRef.current, ...drawerFocusables] : drawerFocusables
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables.at(-1)!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    // Huwag gumulong ang page sa likod habang bukas ang drawer.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>('a[href], button:not(:disabled)')?.focus()
    })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      inertTargets.forEach((element, index) => { element.inert = previousInert[index] })
      window.requestAnimationFrame(() => burgerRef.current?.focus())
    }
  }, [open])

  if (!profile) return null

  const pending = profile.verification_status === 'pending'

  async function handleSignOut() {
    setOpen(false)
    await signOut()
    navigate('/')
  }

  // Pareho ang barbershop-curtain handoff dito gaya ng ginagamit pagkatapos
  // ng auth — isara ang tabing, palit route sa likod (kaya natatakpan ang
  // lazy-chunk suspense flash), tapos buksan ulit. Normal na click lang
  // (walang modifier key) ang ipinapasok dito; hayaan ang browser sa
  // ctrl/cmd/middle-click para gumana pa rin ang "open in new tab".
  function navWithCurtain(to: string) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      setOpen(false)
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      event.preventDefault()
      if (to === location.pathname) return
      go(to)
    }
  }

  return (
    <>
      <button
        type="button"
        ref={burgerRef}
        className={`app-burger${open ? ' is-open' : ''}`}
        aria-label={open ? 'Isara ang menu' : 'Buksan ang menu'}
        aria-expanded={open}
        aria-controls="app-menu-drawer"
        onClick={() => setOpen((v) => !v)}
      >
        <span /><span /><span />
      </button>

      <div className={`app-menu${open ? ' is-open' : ''}`}>
        <div className="app-menu-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
        <aside
          id="app-menu-drawer"
          ref={drawerRef}
          className="app-menu-drawer"
          role="dialog"
          aria-modal="true"
          aria-hidden={!open}
          aria-label="Menu"
        >
          <div className="app-menu-user">
            <Avatar name={profile.full_name} />
            <div>
              <strong>{profile.full_name}</strong>
              <span>{profileRoleLabel(profile)}</span>
            </div>
          </div>

          <nav className="app-menu-links" aria-label="Main">
            {ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="app-menu-link"
                onClick={navWithCurtain(item.to)}
              >
                <DoodleIcon name={item.icon} size={24} />
                <span>{item.label}</span>
              </NavLink>
            ))}
            {isBarber && (
              <NavLink to="/dashboard/barber" className="app-menu-link" onClick={navWithCurtain('/dashboard/barber')}>
                <DoodleIcon name="chair" size={24} />
                <span>Chair tools</span>
              </NavLink>
            )}
          </nav>

          {pending && (
            <NavLink to="/onboarding/role" className="pill pill-pink app-menu-pending" onClick={navWithCurtain('/onboarding/role')}>
              Verification pending
            </NavLink>
          )}

          <button type="button" className="app-menu-link app-menu-signout" onClick={handleSignOut}>
            <DoodleIcon name="x" size={24} />
            <span>Sign out</span>
          </button>
        </aside>
      </div>
    </>
  )
}
