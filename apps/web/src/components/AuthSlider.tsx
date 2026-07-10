import { useState, type FormEvent } from 'react'
import { DataError, SHOP_NAME } from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import { useCurtain } from './CurtainTransition'
import { DEMO_ACCOUNTS } from '../services/mock/seed'
import './AuthSlider.css'

/**
 * Isang billboard, dalawang auth mode. Gumagalaw ang pink panel para hindi
 * duplicate page ang sign-in at sign-up, tapos curtain ang bahala sa handoff.
 */
export function AuthSlider({
  initialMode = 'signin',
  from = '/barbers',
}: {
  initialMode?: 'signin' | 'signup'
  from?: string
}) {
  const { signIn, signUp } = useAuth()
  const { go } = useCurtain()
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)

  // Sign-in feature state: hiwalay para hindi madamay ang signup errors/inputs.
  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')
  const [siError, setSiError] = useState('')
  const [siBusy, setSiBusy] = useState(false)

  // Signup feature state: basic details muna; ibang flow ang account type later.
  const [fullName, setFullName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [suError, setSuError] = useState('')
  const [suBusy, setSuBusy] = useState(false)

  async function submitSignIn(e: FormEvent) {
    e.preventDefault()
    setSiError('')
    setSiBusy(true)
    try {
      await signIn({ email: siEmail, password: siPassword })
      // IMPORTANT: auth muna bago curtain navigation para restored na ang guard.
      go(from)
    } catch (err) {
      setSiError(err instanceof DataError ? err.message : 'Something went wrong.')
      setSiBusy(false)
    }
  }

  async function submitSignUp(e: FormEvent) {
    e.preventDefault()
    setSuError('')
    setSuBusy(true)
    try {
      await signUp({
        email: suEmail,
        password: suPassword,
        full_name: fullName,
        phone,
      })
      go(from) // Parehong protected handoff gaya ng sign-in.
    } catch (err) {
      setSuError(err instanceof DataError ? err.message : 'Something went wrong.')
      setSuBusy(false)
    }
  }

  return (
    <div className={`auth-slider ${mode === 'signup' ? 'is-signup' : ''}`}>
      <AuthDoodles />

      {/* Sign-in feature panel */}
      <form className="auth-half half-signin" onSubmit={submitSignIn} aria-hidden={mode !== 'signin'}>
        <span className="auth-mini-title">Sign in</span>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={siEmail}
            onChange={(e) => setSiEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
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
            required
          />
        </label>

        {siError && <p className="form-error">{siError}</p>}

        <button className="btn btn-primary" type="submit" disabled={siBusy}>
          {siBusy ? 'Logging in…' : 'Sign in'}
        </button>

        <div className="auth-demo">
          <div className="divider" />
          <p className="faint" style={{ margin: '0 0 8px' }}>Try a demo account:</p>
          <div className="row">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                type="button"
                key={acc.email}
                className="btn btn-sm"
                onClick={() => {
                  setSiEmail(acc.email)
                  setSiPassword(acc.password)
                }}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>

      </form>

      {/* Signup feature panel */}
      <form className="auth-half half-signup" onSubmit={submitSignUp} aria-hidden={mode !== 'signup'}>
        <span className="auth-mini-title">Create account</span>

        <label className="field">
          <span>Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Juan Dela Cruz"
            required
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={suEmail}
            onChange={(e) => setSuEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span>Phone <span className="faint">(optional)</span></span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+63 917 000 0000"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={suPassword}
            onChange={(e) => setSuPassword(e.target.value)}
            placeholder="Make it a good one"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        {suError && <p className="form-error">{suError}</p>}

        <button className="btn btn-primary" type="submit" disabled={suBusy}>
          {suBusy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {/* Mode switcher at visual cover ng dalawang forms */}
      <div className="auth-overlay">
        <div className="auth-overlay-doodle" aria-hidden="true">
          <svg viewBox="0 0 150 150">
            <path className="overlay-doodle-line" d="M32 116 C54 107 96 107 120 116" />
            <path className="overlay-doodle-fill" d="M48 55 h54 l-7 47 H55 Z" />
            <path className="overlay-doodle-line" d="M56 55 V37 Q56 25 68 25 h15 Q95 25 95 37 v18" />
            <path className="overlay-doodle-line" d="M47 68 H32 M103 68 h16 M66 103 l-5 18 M86 103 l6 18" />
            <path className="overlay-doodle-line" d="M62 40 h27 M75 25 v30" />
            <circle cx="27" cy="68" r="5" className="overlay-doodle-dot" />
            <circle cx="124" cy="68" r="5" className="overlay-doodle-dot" />
          </svg>
        </div>
        <div className={`auth-overlay-inner ov-signin ${mode === 'signin' ? 'active' : ''}`}>
          <div className="auth-overlay-brand">
            <span className="brand-pole" aria-hidden="true" /> {SHOP_NAME}
          </div>
          <h2>Glad to see you!</h2>
          <p>Walk in scruffy, walk out sharp — log in to book chairs and chat with your barber.</p>
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
          <p>Four quick details, then your Philabantay account is ready.</p>
          <p className="auth-overlay-sub">May account ka na?</p>
          <button type="button" className="btn" onClick={() => setMode('signin')}>
            Sign in {'->'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AuthDoodles() {
  return (
    <div className="auth-doodles" aria-hidden="true">
      <svg className="auth-doodle auth-doodle-comb" viewBox="0 0 120 48">
        <path d="M8 10 Q58 6 112 11 L110 24 Q58 20 9 25 Z" />
        <path d="M18 24 l-2 15 M30 23 l-1 17 M43 22 v15 M56 22 l1 18 M69 22 l2 15 M82 22 l3 18 M95 23 l3 14" />
      </svg>

      <svg className="auth-doodle auth-doodle-scissors" viewBox="0 0 98 70">
        <circle cx="24" cy="17" r="11" />
        <circle cx="24" cy="53" r="11" />
        <path d="M33 23 L82 56 M33 47 L82 14 M51 35 l15 10" />
      </svg>

      <svg className="auth-doodle auth-doodle-spark" viewBox="0 0 64 64">
        <path d="M32 5 v16 M32 43 v16 M5 32 h16 M43 32 h16 M13 13 l11 11 M40 40 l11 11 M51 13 L40 24 M24 40 L13 51" />
      </svg>

      <span className="auth-doodle-loop auth-doodle-loop-one" />
      <span className="auth-doodle-loop auth-doodle-loop-two" />
    </div>
  )
}
