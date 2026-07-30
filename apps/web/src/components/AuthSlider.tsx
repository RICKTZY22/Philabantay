import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
import './AuthSlider.css'

type AuthMode = 'signin' | 'signup'

export function AuthSlider({
  mode,
  from = '/dashboard',
}: {
  mode: AuthMode
  from?: string
}) {
  const { signIn, signUp } = useAuth()
  const { transition } = useCurtain()
  const safeFrom = safeInternalPath(from)
  const [showPassword, setShowPassword] = useState(false)
  const signupFormRef = useRef<HTMLFormElement>(null)
  const shouldFocusSignupError = useRef(false)

  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siError, setSiError] = useState('')
  const [siBusy, setSiBusy] = useState(false)

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

  useEffect(() => {
    if (!shouldFocusSignupError.current) return
    shouldFocusSignupError.current = false
    signupFormRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus()
  }, [suFieldErrors])

  async function submitSignIn(event: FormEvent) {
    event.preventDefault()
    setSiError('')
    setSiBusy(true)
    try {
      await transition(async () => {
        const profile = await signIn({ email: siEmail, password: siPassword })
        return {
          to: profile.onboarding_completed ? safeFrom : roleOnboardingPath(safeFrom),
          replace: true,
        }
      })
    } catch (error) {
      setSiError(error instanceof DataError ? error.message : 'Something went wrong.')
      setSiBusy(false)
    }
  }

  async function submitSignUp(event: FormEvent) {
    event.preventDefault()
    setSuError('')
    setSuFieldErrors({})

    const validatePart = (value: string, required: boolean) =>
      required || value.trim() ? validateFullName(value) ?? undefined : undefined
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
    if (!errors.firstName && !errors.lastName && composedName.length > MAX_FULL_NAME_LENGTH) {
      errors.lastName = `Hanggang ${MAX_FULL_NAME_LENGTH} character lang ang buong pangalan.`
    }
    if (Object.values(errors).some(Boolean)) {
      shouldFocusSignupError.current = true
      setSuFieldErrors(errors)
      return
    }

    setSuBusy(true)
    try {
      await transition(async () => {
        await signUp({
          email: suEmail,
          password: suPassword,
          full_name: composedName,
          phone: phone.trim() || undefined,
        })
        return { to: roleOnboardingPath(safeFrom), replace: true }
      })
    } catch (error) {
      setSuError(error instanceof DataError ? error.message : 'Something went wrong.')
      setSuBusy(false)
    }
  }

  return (
    <section className={`auth-card is-${mode}`} aria-labelledby="auth-page-title">
      <span className="auth-blob auth-blob-large" aria-hidden="true" />
      <span className="auth-blob auth-blob-small" aria-hidden="true" />
      <div className="auth-form-panel">
        <header className="auth-form-header">
          <span className="auth-form-brand" aria-label={SHOP_NAME}>
            <span className="brand-pole" aria-hidden="true" />
            {SHOP_NAME}
          </span>
          {mode === 'signup' && <h2>Your details</h2>}
        </header>

        {mode === 'signin' ? (
          <form className="auth-form" onSubmit={submitSignIn}>
            <label className="auth-field">
              <span>Email or phone</span>
              <input
                type="text"
                value={siEmail}
                onChange={(event) => setSiEmail(event.target.value)}
                placeholder="you@email.com or +63..."
                autoComplete="username"
                maxLength={MAX_EMAIL_LENGTH}
                required
              />
            </label>
            <PasswordField
              value={siPassword}
              onChange={setSiPassword}
              shown={showPassword}
              onToggle={() => setShowPassword((shown) => !shown)}
              autoComplete="current-password"
            />
            {siError && <p className="auth-form-error" role="alert">{siError}</p>}
            <button className="auth-submit" type="submit" disabled={siBusy}>
              {siBusy ? 'Logging in…' : 'Log in'}
            </button>
            {/* `from` rides along so switching modes keeps the destination
                RequireAuth was trying to reach. */}
            <Link className="auth-mode-action" to="/signup" state={{ from: safeFrom }}>
              Create account
            </Link>
            <p className="auth-form-note">
              Your role, messages, and bookings stay connected to this account.
            </p>
          </form>
        ) : (
          <form
            ref={signupFormRef}
            className="auth-form auth-signup-form"
            onSubmit={submitSignUp}
            noValidate
          >
            <div className="auth-name-grid">
              <AuthTextField
                label="First name"
                value={firstName}
                onChange={(value) => {
                  setFirstName(value)
                  setSuFieldErrors((errors) => ({ ...errors, firstName: undefined }))
                }}
                placeholder="Juan"
                autoComplete="given-name"
                error={suFieldErrors.firstName}
                errorId="signup-first-error"
                required
              />
              <AuthTextField
                label="Middle name"
                optional
                value={middleName}
                onChange={(value) => {
                  setMiddleName(value)
                  setSuFieldErrors((errors) => ({ ...errors, middleName: undefined }))
                }}
                placeholder="Santos"
                autoComplete="additional-name"
                error={suFieldErrors.middleName}
                errorId="signup-middle-error"
              />
              <AuthTextField
                className="auth-name-last"
                label="Last name"
                value={lastName}
                onChange={(value) => {
                  setLastName(value)
                  setSuFieldErrors((errors) => ({ ...errors, lastName: undefined }))
                }}
                placeholder="Dela Cruz"
                autoComplete="family-name"
                error={suFieldErrors.lastName}
                errorId="signup-last-error"
                required
              />
            </div>
            <div className="auth-signup-contact-grid">
              <AuthTextField
                label="Email"
                type="email"
                value={suEmail}
                onChange={(value) => {
                  setSuEmail(value)
                  setSuFieldErrors((errors) => ({ ...errors, email: undefined }))
                }}
                placeholder="you@email.com"
                autoComplete="email"
                maxLength={MAX_EMAIL_LENGTH}
                error={suFieldErrors.email}
                errorId="signup-email-error"
                required
              />
              <AuthTextField
                label="Phone"
                optional
                value={phone}
                onChange={(value) => {
                  setPhone(value)
                  setSuFieldErrors((errors) => ({ ...errors, phone: undefined }))
                }}
                placeholder="+63 917 000 0000"
                autoComplete="tel"
                inputMode="tel"
                maxLength={MAX_PHONE_LENGTH + 6}
                error={suFieldErrors.phone}
                errorId="signup-phone-error"
              />
            </div>
            <PasswordField
              value={suPassword}
              onChange={(value) => {
                setSuPassword(value)
                setSuFieldErrors((errors) => ({ ...errors, password: undefined }))
              }}
              shown={showPassword}
              onToggle={() => setShowPassword((shown) => !shown)}
              autoComplete="new-password"
              error={suFieldErrors.password}
            />
            <p className="auth-password-hint">
              Use at least 6 characters with one special character.
            </p>
            {suError && <p className="auth-form-error" role="alert">{suError}</p>}
            <button className="auth-submit" type="submit" disabled={suBusy}>
              {suBusy ? 'Creating account…' : 'Continue to account type'}
            </button>
            <Link className="auth-mode-action" to="/login" state={{ from: safeFrom }}>
              Log in instead
            </Link>
            <p className="auth-form-note">
              You’ll choose how you use Philabantay on the next step.
            </p>
          </form>
        )}
      </div>
    </section>
  )
}

function AuthTextField({
  label,
  optional = false,
  className = '',
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  inputMode,
  maxLength = 40,
  error,
  errorId,
  required = false,
}: {
  label: string
  optional?: boolean
  className?: string
  type?: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoComplete: string
  inputMode?: 'tel'
  maxLength?: number
  error?: string
  errorId: string
  required?: boolean
}) {
  return (
    <label className={`auth-field ${className}`.trim()}>
      <span>{label} {optional && <small>Optional</small>}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        required={required}
      />
      {error && <em id={errorId} className="auth-field-error" role="alert">{error}</em>}
    </label>
  )
}

function PasswordField({
  value,
  onChange,
  shown,
  onToggle,
  autoComplete,
  error,
}: {
  value: string
  onChange: (value: string) => void
  shown: boolean
  onToggle: () => void
  autoComplete: 'current-password' | 'new-password'
  error?: string
}) {
  return (
    <label className="auth-field">
      <span>Password</span>
      <span className="auth-password-control">
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter your password"
          autoComplete={autoComplete}
          maxLength={MAX_PASSWORD_LENGTH}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'signup-password-error' : undefined}
          required
        />
        <button type="button" onClick={onToggle} aria-label={shown ? 'Hide password' : 'Show password'}>
          {shown ? 'Hide' : 'Show'}
        </button>
      </span>
      {error && <em id="signup-password-error" className="auth-field-error" role="alert">{error}</em>}
    </label>
  )
}

function roleOnboardingPath(from: string) {
  const safeFrom = safeInternalPath(from)
  return `/onboarding/role?from=${encodeURIComponent(safeFrom)}`
}
