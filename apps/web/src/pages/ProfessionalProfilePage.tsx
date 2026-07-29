import { useEffect, useState, type FormEvent } from 'react'
import { DataError, type BarberJobProfile, type BarberQualificationView } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { Loading } from '../components/Loading'
import './ProfessionalProfilePage.css'

export function ProfessionalProfilePage() {
  const backend = useBackend()
  const [profile, setProfile] = useState<BarberJobProfile | null>(null)
  const [qualifications, setQualifications] = useState<BarberQualificationView | null>(null)
  const [visible, setVisible] = useState(false)
  const [bio, setBio] = useState('')
  const [experience, setExperience] = useState('')
  const [specialties, setSpecialties] = useState('')
  const [portfolio, setPortfolio] = useState('')
  const [area, setArea] = useState('')
  const [schedule, setSchedule] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [qualificationBusy, setQualificationBusy] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      backend.employment.getJobProfile(),
      backend.qualifications.getMine(),
    ]).then(([value, qualificationView]) => {
      if (!active) return
      setProfile(value)
      setQualifications(qualificationView)
      setVisible(value.visible)
      setBio(value.bio ?? '')
      setExperience(value.experience_years == null ? '' : String(value.experience_years))
      setSpecialties(value.specialties.join(', '))
      setPortfolio(value.portfolio_media.join('\n'))
      setArea(value.coarse_work_area ?? '')
      setSchedule(value.schedule_preference ?? '')
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof DataError ? cause.message : 'Hindi ma-load ang professional profile.')
    })
    return () => { active = false }
  }, [backend])

  async function requestQualification(serviceId: string) {
    setQualificationBusy(serviceId)
    setMessage('')
    setError('')
    try {
      await backend.qualifications.request({
        service_id: serviceId,
        idempotency_key: crypto.randomUUID(),
      })
      setQualifications(await backend.qualifications.getMine())
      setMessage('Qualification request sent to the shop owner.')
    } catch (cause) {
      setError(cause instanceof DataError ? cause.message : 'Hindi ma-send ang qualification request.')
    } finally {
      setQualificationBusy('')
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const years = experience.trim() === '' ? null : Number(experience)
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 80)) {
      setError('Experience must be a whole number from 0 to 80.')
      return
    }
    setBusy(true); setMessage(''); setError('')
    try {
      const updated = await backend.employment.updateJobProfile({
        visible,
        bio: bio.trim() || null,
        experience_years: years,
        specialties: specialties.split(',').map((value) => value.trim()).filter(Boolean),
        portfolio_media: portfolio.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        coarse_work_area: area.trim() || null,
        schedule_preference: schedule.trim() || null,
      })
      setProfile(updated)
      setMessage('Na-save ang professional profile.')
    } catch (cause) {
      setError(cause instanceof DataError ? cause.message : 'Hindi ma-save ang profile.')
    } finally { setBusy(false) }
  }

  if (!profile && !error) return <Loading label="Binubuksan ang professional profile..." />

  return (
    <section className="professional-profile" aria-labelledby="professional-title">
      <header><span className="eyebrow">BARBER PROFILE</span><h1 id="professional-title">Professional profile</h1><p>Opt in only when you want verified shop owners to discover and invite you. Exact private location is never shown.</p></header>
      {(message || error) && <p className={error ? 'professional-alert' : 'professional-ok'} role={error ? 'alert' : 'status'}>{error || message}</p>}
      <form onSubmit={save}>
        <label className="professional-visible"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /><span><strong>Visible to verified shop owners</strong><small>Turn this off anytime to leave candidate discovery.</small></span></label>
        <label><span>Bio</span><textarea rows={5} maxLength={1200} value={bio} onChange={(event) => setBio(event.target.value)} /></label>
        <div className="professional-row">
          <label><span>Years of experience</span><input type="number" min={0} max={80} value={experience} onChange={(event) => setExperience(event.target.value)} /></label>
          <label><span>Coarse work area</span><input maxLength={120} placeholder="City or district only" value={area} onChange={(event) => setArea(event.target.value)} /></label>
        </div>
        <label><span>Specialties <small>(comma-separated)</small></span><input maxLength={400} placeholder="Fades, beard trim, classic cuts" value={specialties} onChange={(event) => setSpecialties(event.target.value)} /></label>
        <label><span>Portfolio links <small>(one HTTPS URL per line, up to 8)</small></span><textarea rows={4} maxLength={4000} placeholder="https://…" value={portfolio} onChange={(event) => setPortfolio(event.target.value)} /></label>
        <label><span>Schedule preference</span><textarea rows={3} maxLength={500} value={schedule} onChange={(event) => setSchedule(event.target.value)} /></label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save professional profile'}</button>
      </form>
      <section className="professional-qualifications" aria-labelledby="professional-qualifications-title">
        <div>
          <span className="eyebrow">CURRENT SHOP</span>
          <h2 id="professional-qualifications-title">Service qualifications</h2>
          <p>Your shop owner grants or removes these capabilities. A request never grants access by itself.</p>
        </div>
        {!qualifications && <p className="muted" role="status">Loading qualifications…</p>}
        {qualifications?.shop_id === null && <p className="muted">Join a shop before requesting service qualifications.</p>}
        {qualifications && qualifications.shop_id !== null && qualifications.services.length === 0 && (
          <p className="muted">Your shop has no services to qualify yet.</p>
        )}
        {qualifications && qualifications.services.length > 0 && (
          <ul>
            {qualifications.services.map((service) => (
              <li key={service.id}>
                <div>
                  <strong>{service.name}</strong>
                  <span className="muted">
                    {service.qualified
                      ? 'Qualified'
                      : service.pending_request
                        ? 'Request pending'
                        : service.active ? 'Not qualified' : 'Service retired'}
                  </span>
                </div>
                {!service.qualified && !service.pending_request && service.active && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={qualificationBusy === service.id}
                    onClick={() => void requestQualification(service.id)}
                  >
                    {qualificationBusy === service.id ? 'Sending…' : 'Request qualification'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
