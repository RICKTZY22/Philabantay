import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { profileRoleLabel } from '../lib/profile'
import { Avatar } from '../components/Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import './SettingsPage.css'

const PREFS_KEY = 'bsh_prefs'

interface Prefs {
  bookingReminders: boolean
  chatNotifications: boolean
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const value: unknown = JSON.parse(raw)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const stored = value as Record<string, unknown>
        return {
          bookingReminders: typeof stored.bookingReminders === 'boolean' ? stored.bookingReminders : true,
          chatNotifications: typeof stored.chatNotifications === 'boolean' ? stored.chatNotifications : true,
        }
      }
    }
  } catch {
    /* ignore */
  }
  return { bookingReminders: true, chatNotifications: true }
}

export function SettingsPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)

  if (!profile) return null

  function updatePref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div className="settings">
      <h1><DoodleIcon name="gear" size={30} /> Settings</h1>

      <section className="settings-card" aria-labelledby="settings-account">
        <h2 id="settings-account">Account</h2>
        <div className="settings-profile">
          <Avatar name={profile.full_name} />
          <div>
            <strong>{profile.full_name}</strong>
            <span className="muted">{profile.phone ?? 'Walang naka-save na phone'}</span>
          </div>
          <span className="pill pill-yellow">{profileRoleLabel(profile)}</span>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-notifs">
        <h2 id="settings-notifs">Notifications</h2>
        <p className="muted settings-note">
          Demo pa lang ito — dito nakasave sa browser mo, hindi pa sa server.
        </p>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={prefs.bookingReminders}
            onChange={(e) => updatePref('bookingReminders', e.target.checked)}
          />
          <span>Booking reminders bago ang appointment</span>
        </label>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={prefs.chatNotifications}
            onChange={(e) => updatePref('chatNotifications', e.target.checked)}
          />
          <span>Chat notifications mula sa barbers</span>
        </label>
      </section>

      <section className="settings-card" aria-labelledby="settings-session">
        <h2 id="settings-session">Session</h2>
        <button type="button" className="btn" onClick={handleSignOut}>
          Sign out
        </button>
      </section>
    </div>
  )
}
