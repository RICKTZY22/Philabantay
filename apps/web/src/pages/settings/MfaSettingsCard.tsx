import { useCallback, useEffect, useState } from 'react'
import { DataError, type MfaEnrolment, type MfaStatus } from '@barbershop/shared'
import { useBackend } from '../../services/backend'
import { DoodleIcon } from '../../theme/DoodleDefs'

/**
 * Authenticator app setup.
 *
 * Every `/admin` route is mounted behind an AAL2 check, and before this card
 * existed there was no way to enrol a factor anywhere in the product, so no
 * admin surface could be opened by anyone. The pre-existing verification queue
 * told operators to "complete MFA" on a screen that did not exist.
 */
export function MfaSettingsCard() {
  const backend = useBackend()
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setStatus(await backend.auth.mfaStatus())
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-load ang security settings.')
      setStatus({ aal: 'aal1', factors: [] })
    }
  }, [backend])

  useEffect(() => { void load() }, [load])

  async function run(key: string, operation: () => Promise<unknown>, success: string) {
    if (busy) return
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await operation()
      setNotice(success)
      await load()
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi matuloy. Subukan ulit.')
    } finally {
      setBusy('')
    }
  }

  const verified = status?.factors.find((factor) => factor.status === 'verified')

  return (
    <section className="settings-panel-card settings-stack-card">
      <div className="settings-card-title">
        <i className="is-orange"><DoodleIcon name="gear" size={23} /></i>
        <div>
          <h2>Authenticator app</h2>
          <p>
            A six-digit code from an app on your phone, on top of your password. Required for the
            staff console, and available to anyone who wants the extra protection.
          </p>
        </div>
      </div>

      {status === null && <p role="status">Binubuklat ang security settings…</p>}

      {status && verified && (
        <>
          <p className="settings-mfa-state" role="status">
            <DoodleIcon name="check" size={18} />
            <span>
              Naka-set up na ang authenticator mo since{' '}
              {new Date(verified.created_at).toLocaleDateString('en-PH')}.
              {status.aal === 'aal2'
                ? ' Na-verify ang session na ito.'
                : ' Hindi pa na-verify ang session na ito ngayon.'}
            </span>
          </p>
          <p className="settings-password-hint">
            Removing it needs a code first, so a stolen password alone cannot strip it off.
          </p>
          <button
            type="button"
            className="settings-danger-button"
            disabled={Boolean(busy)}
            onClick={() => void run('remove', () => backend.auth.removeMfa(verified.id), 'Authenticator removed.')}
          >
            {busy === 'remove' ? 'Removing…' : 'Remove authenticator'}
          </button>
        </>
      )}

      {status && !verified && !enrolment && (
        <button
          type="button"
          className="settings-primary-button"
          disabled={Boolean(busy)}
          onClick={() => void run('enrol', async () => { setEnrolment(await backend.auth.enrolMfa()) }, 'Scan the code below to finish.')}
        >
          {busy === 'enrol' ? 'Setting up…' : 'Set up an authenticator app'}
        </button>
      )}

      {status && !verified && enrolment && (
        <form
          className="settings-mfa-setup"
          onSubmit={(event) => {
            event.preventDefault()
            void run(
              'verify',
              () => backend.auth.verifyMfa({ factor_id: enrolment.factor_id, code }),
              'Authenticator confirmed. This session is now verified.',
            ).then(() => { setEnrolment(null); setCode('') })
          }}
        >
          <p>
            Add this key to your authenticator app, then enter the six-digit code it shows. The key
            is shown once and cannot be retrieved later.
          </p>
          {/* Text, not only a QR image: a QR is unreadable to a screen reader and
              useless if the operator is already on their phone. */}
          <code className="settings-mfa-secret">{enrolment.secret}</code>
          <label>
            <span>Six-digit code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="settings-mfa-actions">
            <button type="submit" className="settings-primary-button" disabled={Boolean(busy) || code.length !== 6}>
              {busy === 'verify' ? 'Confirming…' : 'Confirm authenticator'}
            </button>
            <button type="button" className="btn btn-sm" disabled={Boolean(busy)} onClick={() => { setEnrolment(null); setCode('') }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </section>
  )
}
