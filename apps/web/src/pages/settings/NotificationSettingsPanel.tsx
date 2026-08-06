import { useCallback, useEffect, useState } from 'react'
import { DataError, type AccountPreferences } from '@barbershop/shared'
import { useBackend } from '../../services/backend'
import { applyAppearance } from '../../lib/appearance'
import { DoodleIcon } from '../../theme/DoodleDefs'
import { SettingsHeading } from './AccountSettingsPanel'

/**
 * Server-stored preferences. This panel used to read and write
 * `localStorage['bsh_prefs']`, which plan section 8 forbids and which made
 * required test 10 impossible: signing in on a second device showed defaults, and
 * nothing the user had chosen followed them. There was never a service method to
 * call, even though the Express route existed.
 */
export function NotificationSettingsPanel() {
  const backend = useBackend()
  const [prefs, setPrefs] = useState<AccountPreferences | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const stored = await backend.preferences.getMine()
      setPrefs(stored)
      applyAppearance(stored)
    } catch (caught) {
      setLoadError(caught instanceof DataError ? caught.message : 'Hindi ma-load ang preferences.')
    }
  }, [backend])

  useEffect(() => {
    void load()
  }, [load])

  async function save(next: AccountPreferences) {
    setSaving(true)
    setError('')
    try {
      const stored = await backend.preferences.save({
        // Omitted on a first save, when the server has no row yet.
        expected_version: next.version > 0 ? next.version : undefined,
        booking_reminders: next.booking_reminders,
        chat_notifications: next.chat_notifications,
        email_updates: next.email_updates,
        nearby_alerts: next.nearby_alerts,
        nearby_radius_km: next.nearby_radius_km,
        quiet_hours_start: next.quiet_hours_start,
        quiet_hours_end: next.quiet_hours_end,
        language: next.language,
        text_size: next.text_size,
        high_contrast: next.high_contrast,
        reduce_motion: next.reduce_motion,
      })
      setPrefs(stored)
      // Text size, contrast and reduced motion have to change the screen the
      // moment they are chosen, otherwise the control looks broken.
      applyAppearance(stored)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch (caught) {
      // A stale version means another device saved first, so re-read rather than
      // overwriting what that device chose.
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-save ang preference.')
      await load()
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof AccountPreferences>(key: K, value: AccountPreferences[K]) {
    if (!prefs) return
    void save({ ...prefs, [key]: value })
  }

  if (loadError) {
    return (
      <>
        <SettingsHeading eyebrow="NOTIFICATIONS" title="Choose what reaches you" description="Saved to your account." />
        <p className="form-error" role="alert">
          {loadError} <button type="button" className="btn btn-sm" onClick={() => void load()}>Retry</button>
        </p>
      </>
    )
  }

  if (!prefs) {
    return (
      <>
        <SettingsHeading eyebrow="NOTIFICATIONS" title="Choose what reaches you" description="Saved to your account." />
        <p className="settings-panel-card" role="status">Binubuklat ang preferences…</p>
      </>
    )
  }

  const quietHoursOn = prefs.quiet_hours_start !== null

  return (
    <>
      <SettingsHeading
        eyebrow="NOTIFICATIONS"
        title="Choose what reaches you"
        description="Naka-save ito sa account mo, kaya susunod ito sa'yo sa kahit anong device."
      />

      {/* Mandatory first, and stated as mandatory rather than shown as a switch
          that does nothing. The database refuses to store it as off. */}
      <section className="settings-panel-card settings-list-card">
        <div className="settings-list-row settings-list-row-locked">
          <i><DoodleIcon name="check" size={21} /></i>
          <span>
            <strong>Booking and security notices</strong>
            <small>
              Always on. Kailangan mong malaman kapag nagbago o na-cancel ang booking mo, o kapag may
              nangyari sa account mo. Hindi ito pwedeng patayin.
            </small>
          </span>
          <span className="settings-locked-badge">Required</span>
        </div>
      </section>

      <h3 className="settings-subheading">Optional channels</h3>
      <section className="settings-panel-card settings-list-card">
        <NotificationRow icon="calendar" title="Booking reminders" description="Remind me before a scheduled haircut." checked={prefs.booking_reminders} disabled={saving} onChange={(value) => update('booking_reminders', value)} />
        <NotificationRow icon="chat" title="Shop chat messages" description="Alert me when a barbershop replies." checked={prefs.chat_notifications} disabled={saving} onChange={(value) => update('chat_notifications', value)} />
        <NotificationRow icon="send" title="Email updates" description="Send optional updates to my account email." checked={prefs.email_updates} disabled={saving} onChange={(value) => update('email_updates', value)} />
        <NotificationRow icon="pole" title="Nearby barber alerts" description="Notify me when nearby chairs become available." checked={prefs.nearby_alerts} disabled={saving} onChange={(value) => update('nearby_alerts', value)} />
      </section>

      <h3 className="settings-subheading">Quiet hours</h3>
      <section className="settings-panel-card settings-stack-card">
        <label className="settings-list-row">
          <i><DoodleIcon name="star" size={21} /></i>
          <span>
            <strong>Hold optional reminders overnight</strong>
            <small>Urgent booking and security notices still arrive during quiet hours.</small>
          </span>
          <input
            className="settings-switch"
            type="checkbox"
            checked={quietHoursOn}
            disabled={saving}
            onChange={(event) => {
              if (event.target.checked) void save({ ...prefs, quiet_hours_start: '22:00', quiet_hours_end: '07:00' })
              else void save({ ...prefs, quiet_hours_start: null, quiet_hours_end: null })
            }}
          />
        </label>
        {quietHoursOn && (
          <div className="settings-field-row">
            <label>
              <span>From</span>
              <input
                type="time"
                value={prefs.quiet_hours_start ?? '22:00'}
                disabled={saving}
                onChange={(event) => void save({ ...prefs, quiet_hours_start: event.target.value })}
              />
            </label>
            <label>
              <span>Until</span>
              <input
                type="time"
                value={prefs.quiet_hours_end ?? '07:00'}
                disabled={saving}
                onChange={(event) => void save({ ...prefs, quiet_hours_end: event.target.value })}
              />
            </label>
          </div>
        )}
      </section>

      <h3 className="settings-subheading">Language and accessibility</h3>
      <section className="settings-panel-card settings-stack-card">
        <label className="settings-field">
          <span>Language</span>
          <select value={prefs.language} disabled={saving} onChange={(event) => update('language', event.target.value as AccountPreferences['language'])}>
            <option value="en">English</option>
            <option value="fil">Filipino</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Text size</span>
          <select value={prefs.text_size} disabled={saving} onChange={(event) => update('text_size', event.target.value as AccountPreferences['text_size'])}>
            <option value="default">Default</option>
            <option value="large">Large</option>
            <option value="larger">Larger</option>
          </select>
        </label>
        <NotificationRow icon="star" title="Higher contrast" description="Stronger borders and darker text throughout." checked={prefs.high_contrast} disabled={saving} onChange={(value) => update('high_contrast', value)} />
        <NotificationRow
          icon="arrow"
          title="Reduce motion"
          description="Turn off transitions. Your device setting is also honoured on its own."
          checked={prefs.reduce_motion}
          disabled={saving}
          onChange={(value) => update('reduce_motion', value)}
        />
        <label className="settings-field">
          <span>Nearby radius: {prefs.nearby_radius_km} km</span>
          <input
            type="range"
            min={1}
            max={50}
            value={prefs.nearby_radius_km}
            disabled={saving}
            onChange={(event) => setPrefs({ ...prefs, nearby_radius_km: Number(event.target.value) })}
            onBlur={(event) => update('nearby_radius_km', Number(event.target.value))}
          />
        </label>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="settings-floating-status" role="status"><DoodleIcon name="check" size={15} /> Saved to your account</p>}
    </>
  )
}

function NotificationRow({ icon, title, description, checked, disabled, onChange }: {
  icon: 'calendar' | 'chat' | 'send' | 'pole' | 'star' | 'arrow'
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="settings-list-row">
      <i><DoodleIcon name={icon} size={21} /></i>
      <span><strong>{title}</strong><small>{description}</small></span>
      <input
        className="settings-switch"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}
