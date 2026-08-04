import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { DataError, type GuestWalkInVisit } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { useAuth } from '../features/auth/AuthContext'
import './WalkInClaimPage.css'

export function WalkInClaimPage() {
  const { walkInId = '' } = useParams()
  const backend = useBackend()
  const { profile } = useAuth()
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [claimed, setClaimed] = useState<GuestWalkInVisit | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try { setClaimed(await backend.walkIns.claim(walkInId, { code, phone })); setCode(''); setPhone('') }
    catch (error) { setMessage(error instanceof DataError ? error.message : 'The claim code could not be verified.') }
    finally { setBusy(false) }
  }

  return <main className="walkin-claim-page"><section><span className="eyebrow">GUEST VISIT</span><h1>Claim your walk-in</h1><p>Enter the short-lived code shown by shop staff. It works once and does not create an account.</p>{claimed ? <div className="walkin-claim-success" role="status"><strong>You’re checked in.</strong><span>Queue status: {claimed.queue_status.replaceAll('_', ' ')}</span><small>Keep this page open for your visit status.</small>{profile?.role === 'customer' && !claimed.customer_user_id && <button className="btn btn-sm" type="button" onClick={() => void backend.walkIns.linkMine(claimed.id).then(setClaimed).catch((error: unknown) => setMessage(error instanceof DataError ? error.message : 'Could not link this visit.'))}>Link to my account</button>}</div> : <form onSubmit={submit}><label>6-digit code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /></label><label>Mobile number<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><button className="btn btn-primary" disabled={busy || code.length !== 6 || phone.trim().length < 7}>{busy ? 'Checking...' : 'Claim visit'}</button></form>}{message && <p className="form-error" role="alert">{message}</p>}</section></main>
}
