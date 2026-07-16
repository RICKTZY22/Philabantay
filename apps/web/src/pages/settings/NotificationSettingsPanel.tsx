import { useState } from 'react'
import { DoodleIcon } from '../../theme/DoodleDefs'
import { SettingsHeading } from './AccountSettingsPanel'

const PREFS_KEY = 'bsh_prefs'

interface NotificationPrefs {
  bookingReminders: boolean
  chatNotifications: boolean
  emailUpdates: boolean
  nearbyAlerts: boolean
}

const DEFAULT_PREFS: NotificationPrefs = { bookingReminders: true, chatNotifications: true, emailUpdates: false, nearbyAlerts: false }

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const stored = JSON.parse(raw) as Partial<NotificationPrefs>
    return {
      bookingReminders: stored.bookingReminders ?? true,
      chatNotifications: stored.chatNotifications ?? true,
      emailUpdates: stored.emailUpdates ?? false,
      nearbyAlerts: stored.nearbyAlerts ?? false,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function NotificationSettingsPanel() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs)
  const [saved, setSaved] = useState(false)

  function update<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <>
      <SettingsHeading eyebrow="NOTIFICATIONS" title="Choose what reaches you" description="Control booking, chat, and discovery alerts on this device." />
      <section className="settings-panel-card settings-list-card">
        <NotificationRow icon="calendar" title="Booking reminders" description="Remind me before a scheduled haircut." checked={prefs.bookingReminders} onChange={(value) => update('bookingReminders', value)} />
        <NotificationRow icon="chat" title="Shop chat messages" description="Show alerts when a barbershop replies." checked={prefs.chatNotifications} onChange={(value) => update('chatNotifications', value)} />
        <NotificationRow icon="send" title="Email updates" description="Send important booking changes to my account email." checked={prefs.emailUpdates} onChange={(value) => update('emailUpdates', value)} />
        <NotificationRow icon="pole" title="Nearby barber alerts" description="Notify me when nearby chairs become available." checked={prefs.nearbyAlerts} onChange={(value) => update('nearbyAlerts', value)} />
      </section>
      {saved && <p className="settings-floating-status" role="status"><DoodleIcon name="check" size={15} /> Notification preference saved</p>}
    </>
  )
}

function NotificationRow({ icon, title, description, checked, onChange }: {
  icon: 'calendar' | 'chat' | 'send' | 'pole'
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="settings-list-row">
      <i><DoodleIcon name={icon} size={21} /></i>
      <span><strong>{title}</strong><small>{description}</small></span>
      <input className="settings-switch" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}
