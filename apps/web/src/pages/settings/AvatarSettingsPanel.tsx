import { useEffect, useMemo, useState } from 'react'
import { DataError, type OnboardingRole } from '@barbershop/shared'
import { useAuth } from '../../features/auth/AuthContext'
import { useBackend } from '../../services/backend'
import {
  BARBER_GEAR_CATALOG,
  CUSTOM_AVATAR_CHOICES,
  CUSTOMER_GEAR_CATALOG,
  DEFAULT_CUSTOM_DOODLE,
  DEFAULT_AVATAR_BY_ROLE,
  DOODLE_AVATARS,
  DoodleAvatar,
  decodeCustomDoodleAvatar,
  encodeCustomDoodleAvatar,
  type CustomDoodleAvatar,
} from '../../components/DoodleAvatar'
import { DoodleIcon } from '../../theme/DoodleDefs'
import { SettingsActionRow, SettingsHeading } from './AccountSettingsPanel'

type AvatarMode = 'premade' | 'create'

const LABELS: Record<string, string> = {
  oval: 'Oval', round: 'Round', square: 'Square', fringe: 'Fringe', curls: 'Curls', bob: 'Bob', quiff: 'Quiff',
  cap: 'Cap', fade: 'Fade', bun: 'Bun', spiky: 'Spiky', dots: 'Classic', happy: 'Happy', wide: 'Wide', sleepy: 'Sleepy',
  soft: 'Soft', button: 'Button', long: 'Long', smile: 'Smile', grin: 'Grin', neutral: 'Neutral', open: 'Open',
  none: 'None', glasses: 'Glasses', moustache: 'Moustache', freckles: 'Freckles', blush: 'Blush',
  blue: 'Blue', yellow: 'Yellow', pink: 'Pink', purple: 'Purple', green: 'Green', orange: 'Orange', teal: 'Teal', red: 'Red',
  paper: 'Paper', sand: 'Sand', tan: 'Tan', brown: 'Brown', deep: 'Deep',
}

export function AvatarSettingsPanel() {
  const { profile, updateProfile } = useAuth()
  const backend = useBackend()
  const role = avatarRole(profile?.requested_role, profile?.role)
  const isCustomer = role === 'customer'
  const isBarber = role === 'barber'
  // Role-locked gear: hindi nakikita ng barber ang customer catalogue at vice
  // versa. Owners walang gear section.
  const gearCatalog = isCustomer ? CUSTOMER_GEAR_CATALOG : isBarber ? BARBER_GEAR_CATALOG : null
  const savedCustom = decodeCustomDoodleAvatar(profile?.avatar_url)
  const [mode, setMode] = useState<AvatarMode>(savedCustom ? 'create' : 'premade')
  const [premade, setPremade] = useState(profile?.avatar_url?.startsWith('doodle:custom:')
    ? DEFAULT_AVATAR_BY_ROLE[role]
    : profile?.avatar_url ?? DEFAULT_AVATAR_BY_ROLE[role])
  const [custom, setCustom] = useState<CustomDoodleAvatar>(savedCustom ?? DEFAULT_CUSTOM_DOODLE)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  // Gear unlocks: customers count cuts received; barbers count cuts served.
  // bookings.listMine() is already scoped to the signed-in side. 0 habang
  // naglo-load — safe default kasi backend pa rin ang totoong gate.
  const [completedCuts, setCompletedCuts] = useState(0)

  useEffect(() => {
    if (!isCustomer && !isBarber) return
    let active = true
    backend.bookings.listMine()
      .then((appointments) => {
        if (!active) return
        setCompletedCuts(appointments.filter((appointment) => appointment.status === 'completed').length)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [backend, isBarber, isCustomer])

  const orderedAvatars = useMemo(
    () => [...DOODLE_AVATARS].sort((left, right) => Number(right.role === role) - Number(left.role === role)),
    [role],
  )
  if (!profile) return null
  const selectedAvatar = mode === 'create' ? encodeCustomDoodleAvatar(custom) : premade

  async function saveAvatar() {
    if (saving) return
    setSaving(true)
    setMessage(null)
    try {
      await updateProfile({ avatar_url: selectedAvatar })
      setMessage({ kind: 'ok', text: 'Your doodle avatar is now live.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof DataError ? error.message : 'Hindi ma-save ang avatar.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SettingsHeading eyebrow="DOODLE STUDIO" title="Doodle avatar" description="Choose a premade character or build a face that feels like you." />
      <section className="settings-panel-card settings-avatar-studio">
        <div className="settings-avatar-preview-pane">
          <span className="settings-preview-label">LIVE PREVIEW</span>
          <DoodleAvatar avatarId={selectedAvatar} role={role} size={196} trackCursor />
          <strong>{mode === 'create' ? 'Your custom doodle' : 'Premade doodle'}</strong>
          <small>Move your cursor—the eyes and head will follow.</small>
        </div>
        <div className="settings-avatar-workbench">
          <div className="settings-segmented" role="tablist" aria-label="Avatar selection mode">
            <button type="button" role="tab" aria-selected={mode === 'premade'} className={mode === 'premade' ? 'is-active' : ''} onClick={() => { setMode('premade'); setMessage(null) }}>Premade</button>
            <button type="button" role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'is-active' : ''} onClick={() => { setMode('create'); setMessage(null) }}>Create your own</button>
          </div>

          {mode === 'premade' ? (
            <div className="settings-premade-grid" role="radiogroup" aria-label="Premade doodle avatars">
              {orderedAvatars.map((avatar) => (
                <button type="button" role="radio" aria-checked={premade === avatar.id} className={premade === avatar.id ? 'is-selected' : ''} key={avatar.id} onClick={() => { setPremade(avatar.id); setMessage(null) }}>
                  <DoodleAvatar avatarId={avatar.id} role={avatar.role} size={70} />
                  <span>{avatar.label}</span>
                  {avatar.role === role && <small>Suggested</small>}
                </button>
              ))}
            </div>
          ) : (
            <div className="settings-customizer">
              <ChoiceGroup title="Face shape" value={custom.face} options={CUSTOM_AVATAR_CHOICES.face} onChange={(face) => setCustom((current) => ({ ...current, face }))} />
              <ChoiceGroup title="Skin tone" value={custom.skin} options={CUSTOM_AVATAR_CHOICES.skin} color onChange={(skin) => setCustom((current) => ({ ...current, skin }))} />
              <ChoiceGroup title="Hair" value={custom.hair} options={CUSTOM_AVATAR_CHOICES.hair} onChange={(hair) => setCustom((current) => ({ ...current, hair }))} />
              <ChoiceGroup title="Eyes" value={custom.eyes} options={CUSTOM_AVATAR_CHOICES.eyes} onChange={(eyes) => setCustom((current) => ({ ...current, eyes }))} />
              <ChoiceGroup title="Nose" value={custom.nose} options={CUSTOM_AVATAR_CHOICES.nose} onChange={(nose) => setCustom((current) => ({ ...current, nose }))} />
              <ChoiceGroup title="Mouth" value={custom.mouth} options={CUSTOM_AVATAR_CHOICES.mouth} onChange={(mouth) => setCustom((current) => ({ ...current, mouth }))} />
              <ChoiceGroup title="Accessory" value={custom.accessory} options={CUSTOM_AVATAR_CHOICES.accessory} onChange={(accessory) => setCustom((current) => ({ ...current, accessory }))} />
              <ChoiceGroup title="Background" value={custom.accent} options={CUSTOM_AVATAR_CHOICES.accent} color onChange={(accent) => setCustom((current) => ({ ...current, accent }))} />
              {gearCatalog && (
                <fieldset className="settings-choice-group settings-gear-group">
                  <legend>
                    {isBarber ? 'Barber gear' : 'Customer gear'}
                    <span className="settings-gear-progress">
                      {completedCuts} completed cut{completedCuts === 1 ? '' : 's'}{isBarber ? ' served' : ''}
                    </span>
                  </legend>
                  <div>
                    {gearCatalog.map(({ id, label, unlockAt }) => {
                      const locked = completedCuts < unlockAt
                      return (
                        <button
                          type="button"
                          key={id}
                          disabled={locked}
                          className={custom.gear === id ? 'is-selected' : ''}
                          aria-pressed={custom.gear === id}
                          title={locked ? `Ma-a-unlock sa ${unlockAt} completed cuts` : undefined}
                          onClick={() => setCustom((current) => ({ ...current, gear: id }))}
                        >
                          {label}
                          {locked
                            ? <small className="settings-gear-lock">{unlockAt} cut{unlockAt === 1 ? '' : 's'}</small>
                            : custom.gear === id && <DoodleIcon name="check" size={13} />}
                        </button>
                      )
                    })}
                  </div>
                  <p className="settings-gear-hint">
                    {isBarber
                      ? 'Exclusive sa barbers: mag-unlock ng gear sa bawat completed cut na na-serve mo sa chair.'
                      : 'Exclusive sa customers: mag-unlock ng gear sa bawat completed cut sa stamp card rewards.'}
                  </p>
                </fieldset>
              )}
            </div>
          )}
        </div>
        <SettingsActionRow message={message}>
          {mode === 'create' && <button type="button" className="settings-secondary-button" onClick={() => { setCustom(DEFAULT_CUSTOM_DOODLE); setMessage(null) }}>Reset</button>}
          <button type="button" className="settings-primary-button" disabled={saving || selectedAvatar === profile.avatar_url} onClick={saveAvatar}>
            {saving ? 'Saving…' : selectedAvatar === profile.avatar_url ? 'Avatar saved' : 'Save avatar'}
          </button>
        </SettingsActionRow>
      </section>
    </>
  )
}

function ChoiceGroup<T extends string>({ title, value, options, onChange, color = false }: {
  title: string
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  color?: boolean
}) {
  return (
    <fieldset className={`settings-choice-group${color ? ' is-color' : ''}`}>
      <legend>{title}</legend>
      <div>
        {options.map((option) => (
          <button type="button" className={value === option ? 'is-selected' : ''} aria-pressed={value === option} onClick={() => onChange(option)} key={option}>
            {color && <i className={`avatar-color is-${option}`} />}{LABELS[option] ?? option}{value === option && <DoodleIcon name="check" size={13} />}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function avatarRole(requested: OnboardingRole | null | undefined, granted: string | undefined): OnboardingRole {
  if (requested) return requested
  if (granted === 'barber' || granted === 'shop_owner') return granted
  return 'customer'
}
