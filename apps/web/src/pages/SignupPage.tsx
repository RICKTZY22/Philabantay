import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DataError } from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import './AuthPage.css'

export function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [role, setRole] = useState<'customer' | 'barber'>('customer')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signUp({
        email,
        password,
        full_name: fullName,
        phone,
        role,
        bio: role === 'barber' ? bio : undefined,
      })
      // Barbers land on their dashboard to set hours; customers go browse chairs.
      navigate(role === 'barber' ? '/dashboard' : '/barbers', { replace: true })
    } catch (err) {
      setError(err instanceof DataError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="rough-card auth-card" onSubmit={submit}>
        <h1>Join the chair club</h1>
        <p className="muted">Sino ka sa barbershop na 'to?</p>

        <div className="role-pick" role="radiogroup" aria-label="Account type">
          <button
            type="button"
            role="radio"
            aria-checked={role === 'customer'}
            className={`role-card ${role === 'customer' ? 'active' : ''}`}
            onClick={() => setRole('customer')}
          >
            <span className="role-emoji" aria-hidden="true">🙋</span>
            <strong>Customer</strong>
            <span className="muted">Naghahanap ako ng barbershop</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={role === 'barber'}
            className={`role-card ${role === 'barber' ? 'active' : ''}`}
            onClick={() => setRole('barber')}
          >
            <span className="role-emoji" aria-hidden="true">💈</span>
            <strong>Barbershop</strong>
            <span className="muted">I-ma-manage ko ang aking upuan</span>
          </button>
        </div>

        <label className="field">
          <span>{role === 'barber' ? 'Shop / barber name' : 'Full name'}</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={role === 'barber' ? "Mang Kanor's Cuts" : 'Juan Dela Cruz'}
            required
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
        {role === 'barber' && (
          <label className="field">
            <span>About your chair <span className="faint">(optional)</span></span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Fades, beard trims, 8 years on the chair…"
              rows={2}
            />
          </label>
        )}
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Make it a good one"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        {role === 'barber' && (
          <p className="faint role-note">
            Makikita ka agad sa listings with default hours (Mon–Sat, 10am–7pm) —
            ayusin mo lahat sa dashboard pagkatapos.
          </p>
        )}

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : role === 'barber' ? 'Open my shop' : 'Create account'}
        </button>

        <p className="muted auth-alt">
          Already have one? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  )
}
