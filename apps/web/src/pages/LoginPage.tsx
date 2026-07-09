import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { DataError } from '@barbershop/shared'
import { useAuth } from '../features/auth/AuthContext'
import { DEMO_ACCOUNTS } from '../services/mock/seed'
import './AuthPage.css'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn({ email, password })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof DataError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="rough-card auth-card" onSubmit={submit}>
        <h1>Welcome back</h1>
        <p className="muted">Log in to book chairs and chat with your barber.</p>

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
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>

        <p className="muted auth-alt">
          New here? <Link to="/signup">Create an account</Link>
        </p>

        <div className="divider" />
        <p className="faint" style={{ margin: '0 0 8px' }}>Try a demo account:</p>
        <div className="row">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              type="button"
              key={acc.email}
              className="btn btn-sm"
              onClick={() => {
                setEmail(acc.email)
                setPassword(acc.password)
              }}
            >
              {acc.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  )
}
