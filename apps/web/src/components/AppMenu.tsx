import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { profileRoleLabel } from '../lib/profile'
import { DoodleAvatar } from './DoodleAvatar'
import { useCurtain } from './CurtainTransition'
import { DoodleIcon } from '../theme/DoodleDefs'
import { getMainMenuItems, getMenuContext } from '../config/navigation'
import './AppMenu.css'

type AppMenuProps = {
  onOpenChange?: (open: boolean) => void
}

/**
 * Ang tanging navigation ng signed-in users: isang malaking hamburger na
 * nagiging X, may drawer na dumudulas mula sa kanan. Laging naka-mount ang
 * drawer para CSS transition (hindi mount/unmount) ang animation.
 */
export function AppMenu({ onOpenChange }: AppMenuProps) {
  const { profile, isBarber, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { go } = useCurtain()
  const [open, setOpen] = useState(false)
  const burgerRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    onOpenChange?.(open)
  }, [onOpenChange, open])

  useEffect(() => () => onOpenChange?.(false), [onOpenChange])

  // Browser back/forward at programmatic navigation: huwag iwanang bukas ang drawer.
  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    const inertTargets = ['main.page', '.brand']
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

      const focusables = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? [],
      )
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
      closeRef.current?.focus()
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
  const avatarRole = profile.requested_role
    ?? (profile.role === 'barber' || profile.role === 'shop_owner' ? profile.role : 'customer')
  const menuContext = getMenuContext(location.pathname, isBarber, profile.requested_role === 'barber' && !isBarber)
  const menuItems = getMainMenuItems(profile)

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
        inert={open}
        tabIndex={open ? -1 : 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span /><span /><span />
      </button>

      {createPortal(<div className={`app-menu${open ? ' is-open' : ''}`}>
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
          <button
            type="button"
            ref={closeRef}
            className="app-menu-close"
            aria-label="Isara ang menu"
            onClick={() => setOpen(false)}
          >
            <DoodleIcon name="x" size={25} />
          </button>
          <div className="app-menu-user">
            <DoodleAvatar avatarId={profile.avatar_url} role={avatarRole} size={62} />
            <div>
              <strong>{profile.full_name}</strong>
              <span>{profileRoleLabel(profile)}</span>
            </div>
          </div>

          <section className="app-menu-context" aria-labelledby="app-menu-context-title">
            <div className="app-menu-context-head">
              <span className="app-menu-context-icon" aria-hidden="true">
                <DoodleIcon name={menuContext.icon} size={14} />
              </span>
              <span className="eyebrow">{menuContext.eyebrow}</span>
            </div>
            <h2 id="app-menu-context-title">{menuContext.title}</h2>
            <Link className="btn btn-sm btn-primary" to={menuContext.actionTo} onClick={navWithCurtain(menuContext.actionTo)}>
              {menuContext.actionLabel}
            </Link>
          </section>

          <nav className="app-menu-links" aria-label="Main">
            {menuItems.map((item) => (
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
      </div>, document.body)}
    </>
  )
}
