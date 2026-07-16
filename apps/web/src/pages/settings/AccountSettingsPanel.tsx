import { useEffect, useState, type FormEvent } from 'react'
import { DataError, type OnboardingRole } from '@barbershop/shared'
import { useAuth } from '../../features/auth/AuthContext'
import { DoodleAvatar } from '../../components/DoodleAvatar'
import { DoodleIcon } from '../../theme/DoodleDefs'

export function AccountSettingsPanel() {
  const { profile, updateProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [email, setEmail] = useState(profile?.email ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [location, setLocation] = useState(profile?.location ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name)
    setEmail(profile.email)
    setPhone(profile.phone ?? '')
    setLocation(profile.location ?? '')
  }, [profile])

  if (!profile) return null

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setMessage(null)
    try {
      await updateProfile({ full_name: fullName, email, phone, location })
      setMessage({ kind: 'ok', text: 'Account details saved.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi ma-save ang account details.' })
    } finally {
      setSaving(false)
    }
  }

  const changed = fullName.trim() !== profile.full_name
    || email.trim().toLocaleLowerCase() !== profile.email
    || phone.trim() !== (profile.phone ?? '')
    || location.trim() !== (profile.location ?? '')

  return (
    <>
      <SettingsHeading eyebrow="ACCOUNT" title="Your account" description="Manage your private contact information and home area." />
      <form className="settings-panel-card settings-account-form" onSubmit={save}>
        <div className="settings-account-hero">
          <DoodleAvatar avatarId={profile.avatar_url} role={avatarRole(profile.requested_role, profile.role)} size={86} trackCursor />
          <div><strong>{profile.full_name}</strong><span>{profile.email}</span></div>
        </div>
        <div className="settings-form-grid">
          <label><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" maxLength={80} required /></label>
          <label><span>Contact number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" maxLength={32} placeholder="+63 917 000 0000" /></label>
          <label className="is-wide"><span>Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={254} required /></label>
          <label className="is-wide"><span>City or municipality</span><input value={location} onChange={(event) => setLocation(event.target.value)} autoComplete="address-level2" maxLength={100} placeholder="Bacoor, Cavite" /><small>General area only—your live GPS location is never stored here.</small></label>
        </div>
        <SettingsActionRow message={message}>
          <button type="submit" className="settings-primary-button" disabled={saving || !changed}>{saving ? 'Saving…' : changed ? 'Save changes' : 'Saved'}</button>
        </SettingsActionRow>
      </form>
    </>
  )
}

function avatarRole(requested: OnboardingRole | null | undefined, granted: string): OnboardingRole {
  if (requested) return requested
  if (granted === 'barber' || granted === 'shop_owner') return granted
  return 'customer'
}

export function SettingsHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="settings-page-heading"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>
}

export function SettingsActionRow({ message, children }: { message: { kind: 'ok' | 'error'; text: string } | null; children: React.ReactNode }) {
  return <div className="settings-action-row">{message && <p className={`is-${message.kind}`} role="status"><DoodleIcon name={message.kind === 'ok' ? 'check' : 'x'} size={16} />{message.text}</p>}{children}</div>
}
