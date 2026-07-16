import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataError } from '@barbershop/shared'
import { useAuth } from '../../features/auth/AuthContext'
import { DoodleIcon } from '../../theme/DoodleDefs'
import { SettingsActionRow, SettingsHeading } from './AccountSettingsPanel'

export function SecuritySettingsPanel() {
  const { changePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (newPassword !== confirmPassword) {
      setMessage({ kind: 'error', text: 'Hindi magkapareho ang bagong password.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage({ kind: 'ok', text: 'Password updated securely.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi ma-update ang password.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <>
      <SettingsHeading eyebrow="SECURITY" title="Password and session" description="Keep your account protected and review your current sign-in." />
      <form className="settings-panel-card settings-security-form" onSubmit={submit}>
        <div className="settings-card-title"><i className="is-orange"><DoodleIcon name="gear" size={23} /></i><div><h2>Change password</h2><p>You’ll need your current password before creating a new one.</p></div></div>
        <label><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" maxLength={128} required /></label>
        <div className="settings-form-grid">
          <label><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
          <label><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" maxLength={128} required /></label>
        </div>
        <small className="settings-password-hint">Use at least 10 characters and one special character.</small>
        <SettingsActionRow message={message}><button type="submit" className="settings-primary-button" disabled={saving || !currentPassword || !newPassword || !confirmPassword}>{saving ? 'Updating…' : 'Update password'}</button></SettingsActionRow>
      </form>

      <section className="settings-panel-card settings-session-card">
        <div className="settings-card-title"><i className="is-blue"><DoodleIcon name="user" size={23} /></i><div><h2>Current session</h2><p>You’re signed in on this browser.</p></div></div>
        <button type="button" className="settings-danger-button" onClick={handleSignOut}>Sign out</button>
      </section>
    </>
  )
}
