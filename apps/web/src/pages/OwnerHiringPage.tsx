import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  DataError,
  type EmploymentRequest,
  type JobSeekerProfile,
  type OwnerShop,
  type OwnerShopHiring,
  type ShopHiringStatus,
  type ShopJoinCodeDetails,
} from '@barbershop/shared'
import { Link } from 'react-router-dom'
import { useBackend } from '../services/backend'
import { Loading } from '../components/Loading'
import { DoodleIcon } from '../theme/DoodleDefs'
import './OwnerHiringPage.css'

const STATUS_COPY: Record<ShopHiringStatus, { title: string; detail: string }> = {
  off: { title: 'Off', detail: 'No hiring badge or listing is shown.' },
  open: { title: 'Hiring', detail: 'Published shops appear on the barber hiring map.' },
  full: { title: 'Full', detail: 'The final known opening is filled.' },
}

function failureMessage(cause: unknown) {
  if (!(cause instanceof DataError)) return 'Hindi nakumpleto ang request. Subukan ulit.'
  if (cause.code === 'conflict') return 'Stale ang screen na ito. Ni-reload ang pinakabagong data.'
  if (cause.code === 'request_already_resolved') return 'Na-resolve na ang request sa ibang session.'
  if (cause.code === 'already_employed') return 'May active employment na ang barber.'
  if (cause.code === 'hiring_full') return 'Wala nang available opening sa shop.'
  return cause.message
}

export function OwnerHiringPage() {
  const backend = useBackend()
  const [shop, setShop] = useState<OwnerShop | null | undefined>(undefined)
  const [hiring, setHiring] = useState<OwnerShopHiring | null>(null)
  const [requests, setRequests] = useState<EmploymentRequest[]>([])
  const [seekers, setSeekers] = useState<JobSeekerProfile[]>([])
  const [joinCode, setJoinCode] = useState<ShopJoinCodeDetails | null>(null)
  const [revealedCode, setRevealedCode] = useState('')
  const [status, setStatus] = useState<ShopHiringStatus>('off')
  const [positions, setPositions] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const mine = await backend.ownerShop.getMine()
      if (!mine) {
        setShop(null)
        return
      }
      const [current, requestRows, candidates, code] = await Promise.all([
        backend.ownerShop.getHiring(),
        backend.employment.listRequests(),
        backend.employment.listJobSeekers(),
        backend.employment.getMyShopJoinCode(),
      ])
      setShop(mine)
      setHiring(current)
      setRequests(requestRows)
      setSeekers(candidates)
      setJoinCode(code)
      setStatus(current?.status ?? 'off')
      setPositions(current?.open_positions == null ? '' : String(current.open_positions))
      setNote(current?.note ?? '')
    } catch (cause) {
      setShop(undefined)
      setError(failureMessage(cause))
    }
  }, [backend])

  useEffect(() => { void load() }, [load])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!hiring || busy) return
    const count = positions.trim() === '' ? null : Number(positions)
    if (status === 'open' && count !== null && (!Number.isInteger(count) || count < 1)) {
      setError('Use a positive opening count, or leave it blank when unknown.')
      return
    }
    setBusy('hiring'); setMessage(''); setError('')
    try {
      const updated = await backend.ownerShop.updateHiring({
        expected_version: hiring.shop_version,
        status,
        open_positions: status === 'open' ? count : null,
        note: note.trim() || null,
      })
      setHiring(updated)
      setStatus(updated.status)
      setPositions(updated.open_positions == null ? '' : String(updated.open_positions))
      setNote(updated.note ?? '')
      setMessage('Na-save ang hiring status.')
    } catch (cause) {
      if (cause instanceof DataError && cause.code === 'conflict') {
        await load()
        setError(failureMessage(cause))
      } else {
        setError(failureMessage(cause))
      }
    } finally { setBusy('') }
  }

  async function resolve(request: EmploymentRequest, action: 'accept' | 'decline') {
    setBusy(request.id); setMessage(''); setError('')
    try {
      if (action === 'accept') {
        await backend.employment.acceptRequest(request.id, { expected_version: request.version })
        setMessage('Accepted. Active employment was created atomically.')
      } else {
        await backend.employment.declineRequest(request.id, { expected_version: request.version })
        setMessage('Declined ang request.')
      }
      await load()
    } catch (cause) {
      setError(failureMessage(cause))
      await load()
    } finally { setBusy('') }
  }

  async function invite(candidate: JobSeekerProfile) {
    setBusy(candidate.barber_id); setMessage(''); setError('')
    try {
      await backend.employment.createRequest({
        direction: 'owner_invitation',
        barber_id: candidate.barber_id,
        idempotency_key: crypto.randomUUID(),
      })
      setMessage(`Invitation created for ${candidate.full_name}. It remains pending until final owner acceptance.`)
      await load()
    } catch (cause) { setError(failureMessage(cause)) } finally { setBusy('') }
  }

  async function rotateCode() {
    setBusy('code'); setMessage(''); setError(''); setRevealedCode('')
    try {
      const code = await backend.employment.rotateMyShopJoinCode({
        command_id: crypto.randomUUID(), expires_in_days: 7, usage_limit: 10,
      })
      setJoinCode(code)
      setRevealedCode(code.code ?? '')
      setMessage('New code created. Copy it now; plaintext is shown once only.')
    } catch (cause) { setError(failureMessage(cause)) } finally { setBusy('') }
  }

  async function revokeCode() {
    if (!joinCode?.version) return
    setBusy('code'); setMessage(''); setError(''); setRevealedCode('')
    try {
      setJoinCode(await backend.employment.revokeMyShopJoinCode({
        expected_version: joinCode.version, reason: 'Revoked from owner hiring workspace.',
      }))
      setMessage('Join code revoked.')
    } catch (cause) {
      setError(failureMessage(cause))
      await load()
    } finally { setBusy('') }
  }

  if (shop === undefined && !error) return <Loading label="Binubuksan ang hiring workspace..." />
  if (error && shop === undefined) return <section className="owner-hiring"><h1>Hiring</h1><p className="owner-hiring-alert" role="alert">{error}</p><button className="btn" onClick={() => void load()}>Subukan ulit</button></section>
  if (!shop || !hiring) return <section className="owner-hiring"><h1>Create your shop first</h1><p>Hiring belongs to one real shop.</p><Link className="btn btn-primary" to="/dashboard/owner/shop">Open Shop Setup</Link></section>

  const pending = requests.filter((request) => request.status === 'pending')
  return (
    <section className="owner-hiring" aria-labelledby="owner-hiring-title">
      <header className="owner-hiring-head">
        <div><span className="eyebrow">OWNER HIRING</span><h1 id="owner-hiring-title">Employment workspace</h1><p>Open positions, review requests, invite visible candidates, and manage one-time join codes.</p></div>
        <div className={`owner-hiring-badge is-${hiring.status}`} role="status"><span aria-hidden="true" />{STATUS_COPY[hiring.status].title}</div>
      </header>
      {(message || error) && <p className={error ? 'owner-hiring-alert' : 'owner-hiring-ok'} role={error ? 'alert' : 'status'}>{error || message}</p>}

      <form className="owner-hiring-card" onSubmit={save}>
        <fieldset className="owner-hiring-statuses"><legend>Shop hiring state</legend>
          {(Object.keys(STATUS_COPY) as ShopHiringStatus[]).map((value) => (
            <label className={`owner-hiring-choice is-${value}${status === value ? ' is-selected' : ''}`} key={value}>
              <input type="radio" name="hiring-status" value={value} checked={status === value} onChange={() => setStatus(value)} />
              <DoodleIcon name={value === 'open' ? 'check' : value === 'full' ? 'user' : 'x'} size={22} />
              <span><strong>{STATUS_COPY[value].title}</strong><small>{STATUS_COPY[value].detail}</small></span>
            </label>
          ))}
        </fieldset>
        <div className="owner-hiring-fields">
          <label><span>Open positions <small>(optional)</small></span><input type="number" min={1} max={1000} value={status === 'full' ? '0' : positions} disabled={status !== 'open'} placeholder="Leave blank if unknown" onChange={(event) => setPositions(event.target.value)} /></label>
          <label><span>Hiring note <small>(optional)</small></span><textarea rows={5} maxLength={1000} value={note} placeholder="Requirements or schedule needs" onChange={(event) => setNote(event.target.value)} /></label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={Boolean(busy)}>{busy === 'hiring' ? 'Saving…' : 'Save hiring status'}</button>
      </form>

      <section className="owner-hiring-section" aria-labelledby="requests-title">
        <h2 id="requests-title">Pending employment requests <span>{pending.length}</span></h2>
        {pending.length === 0 ? <p>No pending applications, invitations, or join-code requests.</p> : (
          <div className="owner-hiring-grid">{pending.map((request) => (
            <article className="owner-hiring-item" key={request.id}>
              <small>{request.direction.replaceAll('_', ' ')}</small><h3>{request.barber.full_name}</h3>
              {request.barber.job_profile?.specialties.length ? <p>{request.barber.job_profile.specialties.join(' · ')}</p> : null}
              {request.message && <p>{request.message}</p>}
              <div className="owner-hiring-actions">
                <button className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => void resolve(request, 'accept')}>{busy === request.id ? 'Working…' : 'Accept'}</button>
                <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void resolve(request, 'decline')}>Decline</button>
              </div>
            </article>
          ))}</div>
        )}
      </section>

      <section className="owner-hiring-section" aria-labelledby="candidates-title">
        <h2 id="candidates-title">Visible barber profiles <span>{seekers.length}</span></h2>
        {seekers.length === 0 ? <p>No barbers have opted into owner discovery.</p> : (
          <div className="owner-hiring-grid">{seekers.map((candidate) => (
            <article className="owner-hiring-item" key={candidate.barber_id}>
              <h3>{candidate.full_name}</h3><p>{candidate.coarse_work_area || 'Work area not specified'}</p>
              {candidate.bio && <p>{candidate.bio}</p>}
              <p>{candidate.specialties.length ? candidate.specialties.join(' · ') : 'No specialties listed'}</p>
              {candidate.portfolio_media.length > 0 && <p className="owner-portfolio">{candidate.portfolio_media.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}>Portfolio {index + 1}</a>)}</p>}
              <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void invite(candidate)}>{busy === candidate.barber_id ? 'Sending…' : 'Invite to apply'}</button>
            </article>
          ))}</div>
        )}
      </section>

      <section className="owner-hiring-section owner-code-panel" aria-labelledby="join-code-title">
        <div><h2 id="join-code-title">Join code</h2><p>Codes create pending requests only. Rotate invalidates the old code; plaintext cannot be recovered.</p></div>
        <dl><div><dt>Status</dt><dd>{joinCode?.active ? 'Active' : 'Inactive'}</dd></div><div><dt>Uses</dt><dd>{joinCode ? `${joinCode.used_count}/${joinCode.usage_limit}` : '—'}</dd></div><div><dt>Expires</dt><dd>{joinCode?.expires_at ? new Date(joinCode.expires_at).toLocaleString() : '—'}</dd></div></dl>
        {revealedCode && <div className="owner-code-reveal" role="status"><strong>Copy now</strong><code>{revealedCode}</code><button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(revealedCode)}>Copy</button></div>}
        <div className="owner-hiring-actions"><button className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => void rotateCode()}>{busy === 'code' ? 'Working…' : 'Rotate code'}</button><button className="btn btn-sm" disabled={!joinCode?.active || Boolean(busy)} onClick={() => void revokeCode()}>Revoke</button></div>
      </section>
    </section>
  )
}
