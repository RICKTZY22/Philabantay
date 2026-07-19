import { useState, type FormEvent } from 'react'
import {
  DataError,
  MAX_EMAIL_LENGTH,
  MAX_FULL_NAME_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_PASSWORD_LENGTH,
  SHOP_NAME,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import { useCurtain } from './CurtainTransition'
import { safeInternalPath } from '../lib/security'
import { WalkFigure } from './WalkFigure'
import './AuthSlider.css'

/**
 * One orbital access console, two auth modes. The control module slides between
 * sign-in and sign-up while the form behavior and backend handoff stay shared.
 */
export function AuthSlider({
  initialMode = 'signin',
  from = '/dashboard',
}: {
  initialMode?: 'signin' | 'signup'
  from?: string
}) {
  const { signIn, signUp } = useAuth()
  const { go } = useCurtain()
  const safeFrom = safeInternalPath(from)
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)

  // Sign-in feature state: hiwalay para hindi madamay ang signup errors/inputs.
  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siError, setSiError] = useState('')
  const [siBusy, setSiBusy] = useState(false)

  // Signup feature state: basic details muna; ibang flow ang account type later.
  // Hiwalay na boxes ang pangalan (first/middle/last) pero iisang full_name pa
  // rin ang ipinapasa sa backend — walang binabago sa data layer.
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [suError, setSuError] = useState('')
  const [suFieldErrors, setSuFieldErrors] = useState<{
    firstName?: string
    middleName?: string
    lastName?: string
    email?: string
    phone?: string
    password?: string
  }>({})
  const [suBusy, setSuBusy] = useState(false)

  async function submitSignIn(e: FormEvent) {
    e.preventDefault()
    setSiError('')
    setSiBusy(true)
    try {
      const profile = await signIn({ email: siEmail, password: siPassword })
      // IMPORTANT: auth muna bago curtain navigation para restored na ang guard.
      go(profile.onboarding_completed ? safeFrom : roleOnboardingPath(safeFrom))
    } catch (err) {
      setSiError(err instanceof DataError ? err.message : 'Something went wrong.')
      setSiBusy(false)
    }
  }

  async function submitSignUp(e: FormEvent) {
    e.preventDefault()
    setSuError('')
    setSuFieldErrors({})

    // Local rules muna para instant ang feedback bago tumawag sa backend.
    // First at last required; middle optional (na-validate lang kapag may laman).
    const validatePart = (value: string, required: boolean) =>
      required || value.trim() ? validateFullName(value) ?? undefined : undefined
    // Iisang stored field pa rin: pinagsasama sa full_name, tinatanggal ang blangkong middle.
    const composedName = [firstName, middleName, lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ')
    const errors = {
      firstName: validatePart(firstName, true),
      middleName: validatePart(middleName, false),
      lastName: validatePart(lastName, true),
      email: validateEmail(suEmail) ?? undefined,
      phone: validatePhone(phone) ?? undefined,
      password: validatePassword(suPassword) ?? undefined,
    }
    // Bantay sa kabuuang haba kahit valid ang bawat piraso ng pangalan.
    if (!errors.firstName && !errors.lastName && composedName.length > MAX_FULL_NAME_LENGTH) {
      errors.lastName = `Hanggang ${MAX_FULL_NAME_LENGTH} character lang ang buong pangalan.`
    }
    if (Object.values(errors).some(Boolean)) {
      setSuFieldErrors(errors)
      return
    }

    setSuBusy(true)
    try {
      await signUp({
        email: suEmail,
        password: suPassword,
        full_name: composedName,
        // Phone is optional; omit it entirely when blank so the backend does not
        // reject an empty string against the phone format rule.
        phone: phone.trim() || undefined,
      })
      // Signup intentionally stops at role onboarding; wala pang trusted role.
      go(roleOnboardingPath(safeFrom))
    } catch (err) {
      setSuError(err instanceof DataError ? err.message : 'Something went wrong.')
      setSuBusy(false)
    }
  }

  return (
    <div className={`auth-slider ${mode === 'signup' ? 'is-signup' : ''}`}>
      <StationChrome />

      {/* Sign-in feature panel */}
      <form className="auth-half half-signin" onSubmit={submitSignIn} aria-hidden={mode !== 'signin'} inert={mode !== 'signin'}>
        <span className="auth-mini-title">Sign in</span>

        <label className="field">
          <span>Email or phone</span>
          <input
            type="text"
            value={siEmail}
            onChange={(e) => setSiEmail(e.target.value)}
            placeholder="you@email.com or +63..."
            autoComplete="username"
            maxLength={254}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={siPassword}
            onChange={(e) => setSiPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            maxLength={MAX_PASSWORD_LENGTH}
            required
          />
        </label>

        {siError && <p className="form-error">{siError}</p>}

        <button className="btn btn-primary" type="submit" disabled={siBusy}>
          {siBusy ? 'Logging in…' : 'Sign in'}
        </button>

        <div className="auth-social-row" aria-label="Social sign-in options">
          <button type="button" onClick={() => setSiError('Google sign-in is ready for the Supabase OAuth connection.')}>Google</button>
          <button type="button" onClick={() => setSiError('Facebook sign-in is ready for the Supabase OAuth connection.')}>Facebook</button>
        </div>

      </form>

      {/* Signup feature panel */}
      <form className="auth-half half-signup" onSubmit={submitSignUp} aria-hidden={mode !== 'signup'} inert={mode !== 'signup'}>
        <span className="auth-mini-title">Create account</span>

        <div className="name-grid">
          <label className="field">
            <span>First name</span>
            <input
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value)
                setSuFieldErrors((errors) => ({ ...errors, firstName: undefined }))
              }}
              placeholder="Juan"
              autoComplete="given-name"
              maxLength={40}
              aria-invalid={Boolean(suFieldErrors.firstName)}
              aria-describedby={suFieldErrors.firstName ? 'signup-first-error' : undefined}
              required
            />
            {suFieldErrors.firstName && <span id="signup-first-error" className="field-error" role="alert">{suFieldErrors.firstName}</span>}
          </label>
          <label className="field">
            <span>Middle name <span className="faint">(optional)</span></span>
            <input
              value={middleName}
              onChange={(e) => {
                setMiddleName(e.target.value)
                setSuFieldErrors((errors) => ({ ...errors, middleName: undefined }))
              }}
              placeholder="Santos"
              autoComplete="additional-name"
              maxLength={40}
              aria-invalid={Boolean(suFieldErrors.middleName)}
              aria-describedby={suFieldErrors.middleName ? 'signup-middle-error' : undefined}
            />
            {suFieldErrors.middleName && <span id="signup-middle-error" className="field-error" role="alert">{suFieldErrors.middleName}</span>}
          </label>
          <label className="field name-full">
            <span>Last name</span>
            <input
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value)
                setSuFieldErrors((errors) => ({ ...errors, lastName: undefined }))
              }}
              placeholder="Dela Cruz"
              autoComplete="family-name"
              maxLength={40}
              aria-invalid={Boolean(suFieldErrors.lastName)}
              aria-describedby={suFieldErrors.lastName ? 'signup-last-error' : undefined}
              required
            />
            {suFieldErrors.lastName && <span id="signup-last-error" className="field-error" role="alert">{suFieldErrors.lastName}</span>}
          </label>
        </div>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={suEmail}
            onChange={(e) => {
              setSuEmail(e.target.value)
              setSuFieldErrors((errors) => ({ ...errors, email: undefined }))
            }}
            placeholder="you@email.com"
            autoComplete="email"
            maxLength={MAX_EMAIL_LENGTH}
            aria-invalid={Boolean(suFieldErrors.email)}
            aria-describedby={suFieldErrors.email ? 'signup-email-error' : undefined}
            required
          />
          {suFieldErrors.email && <span id="signup-email-error" className="field-error" role="alert">{suFieldErrors.email}</span>}
        </label>
        <label className="field">
          <span>Phone <span className="faint">(optional)</span></span>
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              setSuFieldErrors((errors) => ({ ...errors, phone: undefined }))
            }}
            placeholder="+63 917 000 0000"
            maxLength={MAX_PHONE_LENGTH + 6}
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={Boolean(suFieldErrors.phone)}
            aria-describedby={suFieldErrors.phone ? 'signup-phone-error' : undefined}
          />
          {suFieldErrors.phone && <span id="signup-phone-error" className="field-error" role="alert">{suFieldErrors.phone}</span>}
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={suPassword}
            onChange={(e) => {
              setSuPassword(e.target.value)
              setSuFieldErrors((errors) => ({ ...errors, password: undefined }))
            }}
            placeholder="hal. Barber@2026"
            autoComplete="new-password"
            maxLength={MAX_PASSWORD_LENGTH}
            aria-invalid={Boolean(suFieldErrors.password)}
            aria-describedby={suFieldErrors.password ? 'signup-password-error' : undefined}
            required
          />
          {suFieldErrors.password && <span id="signup-password-error" className="field-error" role="alert">{suFieldErrors.password}</span>}
        </label>

        {suError && <p className="form-error">{suError}</p>}

        <button className="btn btn-primary" type="submit" disabled={suBusy}>
          {suBusy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {/* Mode switcher at visual cover ng dalawang forms */}
      <div className="auth-overlay">
        <div className="auth-overlay-doodle" aria-hidden="true">
          <div className="auth-station-porthole">
            <WalkFigure
              view="front"
              walking={false}
              showGround={false}
              showMotionLines={false}
              costume="astronaut"
              hairStyle="low-fade"
              hair="#302a28"
              skin="#c98762"
              shirt="#f5f7fa"
              pants="#dbe7f2"
            />
          </div>
        </div>
        <div className={`auth-overlay-inner ov-signin ${mode === 'signin' ? 'active' : ''}`}>
          <div className="auth-overlay-brand">
            <span className="brand-pole" aria-hidden="true" /> {SHOP_NAME}
          </div>
          <h2>Glad to see you!</h2>
          <p>Walk in scruffy, walk out sharp — log in to book chairs and chat with the shop.</p>
          <p className="auth-overlay-sub">Wala ka pang account?</p>
          <button type="button" className="btn" onClick={() => setMode('signup')}>
            Sign up {'->'}
          </button>
        </div>
        <div className={`auth-overlay-inner ov-signup ${mode === 'signup' ? 'active' : ''}`}>
          <div className="auth-overlay-brand">
            <span className="brand-pole" aria-hidden="true" /> {SHOP_NAME}
          </div>
          <h2>Join the chair club</h2>
          <p>A few quick details, then your Philabantay account is ready.</p>
          <p className="auth-overlay-sub">May account ka na?</p>
          <button type="button" className="btn" onClick={() => setMode('signin')}>
            Sign in {'->'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Encoded + internal path lang para walang open-redirect galing sa query string. */
function roleOnboardingPath(from: string) {
  const safeFrom = safeInternalPath(from)
  return `/onboarding/role?from=${encodeURIComponent(safeFrom)}`
}

function StationChrome() {
  return (
    <div className="auth-station-chrome" aria-hidden="true">
      <span className="auth-station-label">PB ORBITAL ACCESS / MODULE 01</span>
      <span className="auth-station-status"><i /><i /><i /></span>
      <span className="auth-station-seam auth-station-seam-left" />
      <span className="auth-station-seam auth-station-seam-right" />
      <span className="auth-station-bolt auth-station-bolt-one" />
      <span className="auth-station-bolt auth-station-bolt-two" />
      <span className="auth-station-bolt auth-station-bolt-three" />
      <span className="auth-station-bolt auth-station-bolt-four" />
    </div>
  )
}
