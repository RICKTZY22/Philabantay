import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataError, type MfaStatus } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { DoodleIcon } from '../theme/DoodleDefs'
import './RequireAal2.css'

/**
 * Step-up gate for the staff console.
 *
 * Every `/admin` route is mounted behind an AAL2 check in Express, so a password
 * session alone gets a 403 from every call and the screen renders as an error.
 * This asks for the code at the point the assurance is actually needed, rather
 * than holding every sign-in at the door for the one role that needs it.
 *
 * The server remains the authority. This only stops the caller wasting a request
 * it knows will be refused; removing it would change nothing about what the API
 * allows.
 */
export function RequireAal2({ children }: { children: React.ReactNode }) {
  const backend = useBackend()
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    setError('')
    setLoadFailed(false)
    try {
      setStatus(await backend.auth.mfaStatus())
    } catch (caught) {
      setLoadFailed(true)
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-check ang security status.')
    }
  }, [backend])

  useEffect(() => { void load() }, [load])

  if (status?.aal === 'aal2') return <>{children}</>

  const verified = status?.factors.find((factor) => factor.status === 'verified')

  return (
    <section className="aal2-gate" aria-labelledby="aal2-gate-title">
      <header>
        <span className="eyebrow">STAFF CONSOLE</span>
        <h1 id="aal2-gate-title">Verify it is you</h1>
      </header>

      {status === null && !loadFailed && <p className="aal2-note" role="status">Checking your session…</p>}

      {loadFailed && (
        <p className="form-error" role="alert">
          {error} <button type="button" className="btn btn-sm" onClick={() => void load()}>Retry</button>
        </p>
      )}

      {status && !verified && (
        <>
          <p className="aal2-note">
            The staff console needs an authenticator app. Set one up in Security settings, then come
            back here.
          </p>
          <Link className="btn btn-primary" to="/settings/security">Go to Security settings</Link>
        </>
      )}

      {status && verified && (
        <form
          className="aal2-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            setError('')
            backend.auth
              .verifyMfa({ factor_id: verified.id, code })
              .then(() => load())
              .catch((caught: unknown) => {
                setError(caught instanceof DataError ? caught.message : 'Hindi ma-verify ang code.')
              })
              .finally(() => { setBusy(false); setCode('') })
          }}
        >
          <p className="aal2-note">
            <DoodleIcon name="gear" size={18} />
            <span>Enter the six-digit code from your authenticator app.</span>
          </p>
          <label>
            <span>Six-digit code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      )}
    </section>
  )
}
