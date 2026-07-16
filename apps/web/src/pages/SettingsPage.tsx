import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import type { DoodleIconName } from '../theme/DoodleDefs'
import { useAuth } from '../features/auth/AuthContext'
import { profileRoleLabel } from '../lib/profile'
import { DoodleAvatar } from '../components/DoodleAvatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { AccountSettingsPanel } from './settings/AccountSettingsPanel'
import { AvatarSettingsPanel } from './settings/AvatarSettingsPanel'
import { NotificationSettingsPanel } from './settings/NotificationSettingsPanel'
import { SecuritySettingsPanel } from './settings/SecuritySettingsPanel'
import { BugReportSettingsPanel } from './settings/BugReportSettingsPanel'
import './SettingsPage.css'

type SettingsSection = 'account' | 'avatar' | 'notifications' | 'security' | 'report-bug'

interface SettingsNavItem {
  id: SettingsSection
  to: string
  label: string
  description: string
  icon: DoodleIconName
  tone: string
}

const SETTINGS_NAV: SettingsNavItem[] = [
  { id: 'account', to: '/settings/account', label: 'Account', description: 'Name, email, contact and location', icon: 'user', tone: 'blue' },
  { id: 'avatar', to: '/settings/avatar', label: 'Doodle avatar', description: 'Premade looks and avatar creator', icon: 'star', tone: 'purple' },
  { id: 'notifications', to: '/settings/notifications', label: 'Notifications', description: 'Booking and chat alerts', icon: 'chat', tone: 'green' },
  { id: 'security', to: '/settings/security', label: 'Security', description: 'Password and active session', icon: 'gear', tone: 'orange' },
  { id: 'report-bug', to: '/settings/report-bug', label: 'Report a bug', description: 'Tell us what went wrong', icon: 'scissors', tone: 'pink' },
]

export function SettingsAccountPage() {
  return <SettingsShell active="account"><AccountSettingsPanel /></SettingsShell>
}

export function SettingsAvatarPage() {
  return <SettingsShell active="avatar"><AvatarSettingsPanel /></SettingsShell>
}

export function SettingsNotificationsPage() {
  return <SettingsShell active="notifications"><NotificationSettingsPanel /></SettingsShell>
}

export function SettingsSecurityPage() {
  return <SettingsShell active="security"><SecuritySettingsPanel /></SettingsShell>
}

export function SettingsBugReportPage() {
  return <SettingsShell active="report-bug"><BugReportSettingsPanel /></SettingsShell>
}

function SettingsShell({ active, children }: { active: SettingsSection; children: ReactNode }) {
  const { profile } = useAuth()
  const [filter, setFilter] = useState('')
  if (!profile) return null

  const needle = filter.trim().toLocaleLowerCase()
  const visibleItems = SETTINGS_NAV.filter((item) => !needle
    || item.label.toLocaleLowerCase().includes(needle)
    || item.description.toLocaleLowerCase().includes(needle))

  return (
    <div className="settings-fluent-shell">
      <aside className="settings-fluent-nav" aria-label="Settings pages">
        <div className="settings-fluent-title"><DoodleIcon name="gear" size={22} /><strong>Settings</strong></div>
        <div className="settings-user-tile">
          <DoodleAvatar avatarId={profile.avatar_url} role={avatarRole(profile.requested_role, profile.role)} size={52} />
          <span><strong>{profile.full_name}</strong><small>{profileRoleLabel(profile)}</small></span>
        </div>
        <label className="settings-search">
          <DoodleIcon name="search" size={16} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Find a setting" aria-label="Find a setting" />
        </label>
        <nav>
          {visibleItems.map((item) => (
            <NavLink to={item.to} key={item.id} className={item.id === active ? 'is-active' : ''}>
              <i className={`settings-nav-icon is-${item.tone}`}><DoodleIcon name={item.icon} size={18} /></i>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <DoodleIcon name="arrow" size={14} />
            </NavLink>
          ))}
          {visibleItems.length === 0 && <p className="settings-no-match">No setting matches “{filter.trim()}”.</p>}
        </nav>
      </aside>
      <main className="settings-fluent-main">{children}</main>
    </div>
  )
}

function avatarRole(requested: string | null | undefined, granted: string) {
  if (requested === 'barber' || requested === 'shop_owner' || requested === 'customer') return requested
  if (granted === 'barber' || granted === 'shop_owner') return granted
  return 'customer'
}
