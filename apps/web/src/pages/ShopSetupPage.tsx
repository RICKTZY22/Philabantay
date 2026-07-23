import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  DataError,
  shopPublicationReadiness,
  type OwnerShop,
  type ShopOperatingHours,
  type ShopClosure,
} from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { Loading } from '../components/Loading'
import { DoodleIcon } from '../theme/DoodleDefs'
import './ShopSetupPage.css'

type ShopForm = {
  name: string
  description: string
  public_contact_phone: string
  address: string
  city: string
  lat: string
  lng: string
  timezone: string
  booking_mode: 'manual' | 'instant'
  chair_count: string
  default_buffer_min: string
}

type HoursRow = { weekday: number; closed: boolean; open_time: string; close_time: string }

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const BLANK: ShopForm = {
  name: '', description: '', public_contact_phone: '',
  address: '', city: '', lat: '', lng: '',
  timezone: 'Asia/Manila', booking_mode: 'manual', chair_count: '1', default_buffer_min: '0',
}

function fromShop(shop: OwnerShop): ShopForm {
  return {
    name: shop.name,
    description: shop.description ?? '',
    public_contact_phone: shop.public_contact_phone ?? '',
    address: shop.address,
    city: shop.city,
    lat: String(shop.lat),
    lng: String(shop.lng),
    timezone: shop.timezone,
    booking_mode: shop.booking_mode,
    chair_count: String(shop.chair_count),
    default_buffer_min: String(shop.default_buffer_min),
  }
}

function rowsFromHours(hours: ShopOperatingHours[]): HoursRow[] {
  return WEEKDAYS.map((_, weekday) => {
    const block = hours.find((h) => h.weekday === weekday)
    if (block && !block.closed) {
      return { weekday, closed: false, open_time: block.open_time ?? '09:00', close_time: block.close_time ?? '18:00' }
    }
    return { weekday, closed: true, open_time: block?.open_time ?? '09:00', close_time: block?.close_time ?? '18:00' }
  })
}

const STATUS_LABEL: Record<OwnerShop['lifecycle_status'], string> = {
  draft: 'Draft (not visible to customers)',
  pending_review: 'Pending review',
  published: 'Published (live in discovery)',
  suspended: 'Suspended',
  archived: 'Archived',
}

export function ShopSetupPage() {
  const backend = useBackend()
  const [shop, setShop] = useState<OwnerShop | null | undefined>(undefined)
  const [savedHours, setSavedHours] = useState<ShopOperatingHours[]>([])
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState<ShopForm>(BLANK)
  const [hoursRows, setHoursRows] = useState<HoursRow[]>(() => rowsFromHours([]))
  const [busy, setBusy] = useState<null | 'save' | 'hours' | 'closure' | 'publish' | 'unpublish'>(null)
  const [closures, setClosures] = useState<ShopClosure[]>([])
  const [closureDraft, setClosureDraft] = useState({ local_date: '', closed: true, open_time: '09:00', close_time: '18:00', reason: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const mine = await backend.ownerShop.getMine()
      setShop(mine)
      setForm(mine ? fromShop(mine) : BLANK)
      const hours = mine ? await backend.ownerShop.getHours() : []
      setSavedHours(hours)
      setHoursRows(rowsFromHours(hours))
      setClosures(mine ? await backend.ownerShop.getClosures() : [])
    } catch (err) {
      setShop(undefined)
      setLoadError(err instanceof DataError ? err.message : 'Hindi ma-load ang shop setup.')
    }
  }, [backend])

  useEffect(() => { void load() }, [load])

  const update = (patch: Partial<ShopForm>) => setForm((prev) => ({ ...prev, ...patch }))
  const openDays = useMemo(() => savedHours.filter((h) => !h.closed).length, [savedHours])

  // Readiness for the checklist. activeServices is passed as satisfied because
  // the client cannot verify it (service editor arrives later in P2-02); the
  // backend enforces it on publish. operatingHours reflects the SAVED hours.
  const readiness = useMemo(() => shopPublicationReadiness({
    name: form.name,
    address: form.address,
    city: form.city,
    lat: Number(form.lat),
    lng: Number(form.lng),
    timezone: form.timezone,
    chair_count: Number(form.chair_count),
  }, { activeServices: 1, operatingHours: openDays }), [form, openDays])

  function buildInput() {
    return {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      lat: Number(form.lat),
      lng: Number(form.lng),
      timezone: form.timezone.trim() || 'Asia/Manila',
      description: form.description.trim() || null,
      public_contact_phone: form.public_contact_phone.trim() || null,
      booking_mode: form.booking_mode,
      chair_count: Number(form.chair_count),
      default_buffer_min: Number(form.default_buffer_min),
    }
  }

  async function runMutation(kind: 'save' | 'publish' | 'unpublish') {
    if (busy) return
    setBusy(kind)
    setError('')
    setMessage('')
    try {
      let result: OwnerShop
      if (kind === 'save') {
        result = shop
          ? await backend.ownerShop.update({ ...buildInput(), expected_version: shop.version })
          : await backend.ownerShop.create(buildInput())
        setMessage(shop ? 'Na-save ang mga pagbabago.' : 'Nagawa ang shop draft mo.')
      } else if (kind === 'publish') {
        result = await backend.ownerShop.publish({ expected_version: shop!.version })
        setMessage('Live na ang shop mo sa discovery!')
      } else {
        result = await backend.ownerShop.unpublish({ expected_version: shop!.version })
        setMessage('Na-unpublish ang shop; draft na ulit ito.')
      }
      setShop(result)
      setForm(fromShop(result))
    } catch (err) {
      if (err instanceof DataError && err.code === 'conflict') {
        setError('Nabago ang shop mula sa ibang session. Ni-reload namin ang pinakabagong bersyon.')
        await load()
      } else {
        setError(err instanceof DataError ? err.message : 'May hindi inaasahang error. Subukan ulit.')
      }
    } finally {
      setBusy(null)
    }
  }

  async function saveHours() {
    if (busy || !shop) return
    setBusy('hours')
    setError('')
    setMessage('')
    try {
      const blocks = hoursRows.map((row) => ({
        weekday: row.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        closed: row.closed,
        open_time: row.closed ? null : row.open_time,
        close_time: row.closed ? null : row.close_time,
      }))
      const saved = await backend.ownerShop.setHours({ blocks })
      setSavedHours(saved)
      setHoursRows(rowsFromHours(saved))
      setMessage('Na-save ang operating hours.')
    } catch (err) {
      setError(err instanceof DataError ? err.message : 'Hindi ma-save ang hours. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  async function addClosure() {
    if (busy || !shop || !closureDraft.local_date) return
    setBusy('closure')
    setError('')
    setMessage('')
    try {
      await backend.ownerShop.saveClosure({
        local_date: closureDraft.local_date,
        closed: closureDraft.closed,
        replacement_open_time: closureDraft.closed ? null : closureDraft.open_time,
        replacement_close_time: closureDraft.closed ? null : closureDraft.close_time,
        reason: closureDraft.reason.trim() || null,
      })
      setClosures(await backend.ownerShop.getClosures())
      setClosureDraft({ local_date: '', closed: true, open_time: '09:00', close_time: '18:00', reason: '' })
      setMessage('Na-save ang closure.')
    } catch (err) {
      setError(err instanceof DataError ? err.message : 'Hindi ma-save ang closure. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  async function removeClosure(id: string) {
    if (busy) return
    setBusy('closure')
    setError('')
    setMessage('')
    try {
      await backend.ownerShop.removeClosure(id)
      setClosures((prev) => prev.filter((closure) => closure.id !== id))
    } catch (err) {
      setError(err instanceof DataError ? err.message : 'Hindi ma-alis ang closure.')
    } finally {
      setBusy(null)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void runMutation('save')
  }

  function setHoursRow(weekday: number, patch: Partial<HoursRow>) {
    setHoursRows((prev) => prev.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)))
  }

  if (shop === undefined && !loadError) return <Loading label="Binubuksan ang shop setup..." />

  if (loadError) {
    return (
      <section className="shop-setup" aria-labelledby="shop-setup-title">
        <h1 id="shop-setup-title">Shop setup</h1>
        <div className="shop-setup-error" role="alert">{loadError}</div>
        <button type="button" className="btn" onClick={() => void load()}>Subukan ulit</button>
      </section>
    )
  }

  const isPublished = shop?.lifecycle_status === 'published'

  return (
    <section className="shop-setup" aria-labelledby="shop-setup-title">
      <header className="shop-setup-head">
        <div>
          <span className="eyebrow">SHOP SETUP</span>
          <h1 id="shop-setup-title">{shop ? 'Manage your shop' : 'Set up your shop'}</h1>
          <p>
            {shop
              ? 'I-edit ang detalye, itakda ang oras, at i-publish kapag handa na.'
              : 'Gumawa ng draft. Hindi ito makikita ng customers hangga\'t hindi mo pini-publish.'}
          </p>
        </div>
        {shop && (
          <div className={`shop-setup-status is-${shop.lifecycle_status}`} role="status">
            <span className="shop-setup-status-dot" aria-hidden="true" />
            <div>
              <strong>{STATUS_LABEL[shop.lifecycle_status]}</strong>
              <span>Version {shop.version}</span>
            </div>
          </div>
        )}
      </header>

      {(message || error) && (
        <p className={error ? 'shop-setup-error' : 'shop-setup-ok'} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}

      <div className="shop-setup-body">
        <div className="shop-setup-main">
          <form className="shop-setup-form" onSubmit={onSubmit}>
            <div className="shop-setup-grid">
              <label className="shop-field is-wide">
                <span>Shop name</span>
                <input value={form.name} onChange={(e) => update({ name: e.target.value })} maxLength={120} required />
              </label>
              <label className="shop-field is-wide">
                <span>Description <small>(optional)</small></span>
                <textarea value={form.description} onChange={(e) => update({ description: e.target.value })} maxLength={2000} rows={3} />
              </label>
              <label className="shop-field">
                <span>Public contact phone <small>(optional)</small></span>
                <input value={form.public_contact_phone} onChange={(e) => update({ public_contact_phone: e.target.value })} maxLength={40} inputMode="tel" />
              </label>
              <label className="shop-field">
                <span>Timezone</span>
                <input value={form.timezone} onChange={(e) => update({ timezone: e.target.value })} maxLength={64} required />
              </label>
              <label className="shop-field is-wide">
                <span>Street address</span>
                <input value={form.address} onChange={(e) => update({ address: e.target.value })} maxLength={240} required />
              </label>
              <label className="shop-field">
                <span>City</span>
                <input value={form.city} onChange={(e) => update({ city: e.target.value })} maxLength={120} required />
              </label>
              <label className="shop-field">
                <span>Booking mode</span>
                <select value={form.booking_mode} onChange={(e) => update({ booking_mode: e.target.value as 'manual' | 'instant' })}>
                  <option value="manual">Manual approval</option>
                  <option value="instant">Instant booking</option>
                </select>
              </label>
              <label className="shop-field">
                <span>Latitude</span>
                <input type="number" step="any" value={form.lat} onChange={(e) => update({ lat: e.target.value })} required />
              </label>
              <label className="shop-field">
                <span>Longitude</span>
                <input type="number" step="any" value={form.lng} onChange={(e) => update({ lng: e.target.value })} required />
              </label>
              <label className="shop-field">
                <span>Chairs</span>
                <input type="number" min={1} max={200} value={form.chair_count} onChange={(e) => update({ chair_count: e.target.value })} required />
              </label>
              <label className="shop-field">
                <span>Cleanup buffer (min)</span>
                <input type="number" min={0} max={120} value={form.default_buffer_min} onChange={(e) => update({ default_buffer_min: e.target.value })} />
              </label>
            </div>
            <p className="shop-field-note">Map pin picker and address search arrive with a later step; enter coordinates for now.</p>
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {busy === 'save' ? 'Sine-save…' : shop ? 'Save details' : 'Create shop draft'}
            </button>
          </form>

          <article className="shop-setup-panel" aria-labelledby="hours-title">
            <div className="shop-setup-panel-head">
              <h2 id="hours-title">Operating hours</h2>
              <span className="shop-setup-muted">{openDays} day{openDays === 1 ? '' : 's'} open</span>
            </div>
            {shop ? (
              <>
                <ul className="shop-hours">
                  {hoursRows.map((row) => (
                    <li key={row.weekday} className="shop-hours-row">
                      <span className="shop-hours-day">{WEEKDAYS[row.weekday]}</span>
                      <label className="shop-hours-toggle">
                        <input
                          type="checkbox"
                          checked={!row.closed}
                          onChange={(e) => setHoursRow(row.weekday, { closed: !e.target.checked })}
                        />
                        <span>Open</span>
                      </label>
                      <input
                        type="time"
                        aria-label={`${WEEKDAYS[row.weekday]} opening time`}
                        value={row.open_time}
                        disabled={row.closed}
                        onChange={(e) => setHoursRow(row.weekday, { open_time: e.target.value })}
                      />
                      <span aria-hidden="true">to</span>
                      <input
                        type="time"
                        aria-label={`${WEEKDAYS[row.weekday]} closing time`}
                        value={row.close_time}
                        disabled={row.closed}
                        onChange={(e) => setHoursRow(row.weekday, { close_time: e.target.value })}
                      />
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn" disabled={busy !== null} onClick={() => void saveHours()}>
                  {busy === 'hours' ? 'Sine-save…' : 'Save hours'}
                </button>
              </>
            ) : (
              <p className="shop-setup-muted">Create your shop draft first, then set its weekly hours here.</p>
            )}
          </article>

          <article className="shop-setup-panel" aria-labelledby="closures-title">
            <div className="shop-setup-panel-head">
              <h2 id="closures-title">Date closures &amp; exceptions</h2>
              <span className="shop-setup-muted">{closures.length} set</span>
            </div>
            {shop ? (
              <>
                {closures.length > 0 && (
                  <ul className="shop-closures">
                    {closures.map((closure) => (
                      <li key={closure.id} className="shop-closure-row">
                        <span className="shop-closure-date">{closure.local_date}</span>
                        <span className="shop-closure-detail">
                          {closure.closed
                            ? 'Closed all day'
                            : `Open ${closure.replacement_open_time}–${closure.replacement_close_time}`}
                          {closure.reason ? ` · ${closure.reason}` : ''}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busy !== null}
                          onClick={() => void removeClosure(closure.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="shop-closure-form">
                  <label className="shop-field">
                    <span>Date</span>
                    <input
                      type="date"
                      value={closureDraft.local_date}
                      onChange={(e) => setClosureDraft((d) => ({ ...d, local_date: e.target.value }))}
                    />
                  </label>
                  <label className="shop-hours-toggle">
                    <input
                      type="checkbox"
                      checked={closureDraft.closed}
                      onChange={(e) => setClosureDraft((d) => ({ ...d, closed: e.target.checked }))}
                    />
                    <span>Closed all day</span>
                  </label>
                  {!closureDraft.closed && (
                    <div className="shop-closure-times">
                      <input
                        type="time"
                        aria-label="Replacement opening time"
                        value={closureDraft.open_time}
                        onChange={(e) => setClosureDraft((d) => ({ ...d, open_time: e.target.value }))}
                      />
                      <span aria-hidden="true">to</span>
                      <input
                        type="time"
                        aria-label="Replacement closing time"
                        value={closureDraft.close_time}
                        onChange={(e) => setClosureDraft((d) => ({ ...d, close_time: e.target.value }))}
                      />
                    </div>
                  )}
                  <label className="shop-field">
                    <span>Reason <small>(optional)</small></span>
                    <input
                      value={closureDraft.reason}
                      maxLength={200}
                      onChange={(e) => setClosureDraft((d) => ({ ...d, reason: e.target.value }))}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null || !closureDraft.local_date}
                    onClick={() => void addClosure()}
                  >
                    {busy === 'closure' ? 'Sine-save…' : 'Add closure'}
                  </button>
                </div>
              </>
            ) : (
              <p className="shop-setup-muted">Create your shop draft first, then add date closures here.</p>
            )}
          </article>
        </div>

        <aside className="shop-setup-aside">
          <article className="shop-setup-panel" aria-labelledby="readiness-title">
            <h2 id="readiness-title">Readiness to publish</h2>
            <ul className="shop-readiness">
              <ReadyItem ok={!readiness.missing.includes('shop name')} label="Shop name" />
              <ReadyItem ok={!readiness.missing.includes('street address')} label="Street address" />
              <ReadyItem ok={!readiness.missing.includes('city')} label="City" />
              <ReadyItem ok={!readiness.missing.includes('map location')} label="Map location (lat/lng)" />
              <ReadyItem ok={!readiness.missing.includes('timezone')} label="Timezone" />
              <ReadyItem ok={!readiness.missing.includes('at least one chair')} label="At least one chair" />
              <ReadyItem ok={!readiness.missing.includes('at least one operating-hours block')} label="At least one open day" />
              <ReadyItem ok={null} label="At least one active service" hint="Checked when you publish" />
            </ul>
            {shop ? (
              isPublished ? (
                <button type="button" className="btn" disabled={busy !== null} onClick={() => void runMutation('unpublish')}>
                  {busy === 'unpublish' ? 'Inaalis…' : 'Unpublish (back to draft)'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-green"
                  disabled={busy !== null || !readiness.ready}
                  onClick={() => void runMutation('publish')}
                >
                  {busy === 'publish' ? 'Pini-publish…' : 'Publish shop'}
                </button>
              )
            ) : (
              <p className="shop-setup-muted">Create your draft first, then publish it here.</p>
            )}
          </article>

          <article className="shop-setup-panel shop-setup-help" aria-labelledby="setup-help-title">
            <h2 id="setup-help-title">How publishing works</h2>
            <p className="shop-setup-muted">
              A draft is private. Once your details, weekly hours, and at least one active service
              are ready, publishing lists the shop in customer discovery. You can unpublish anytime.
            </p>
          </article>
        </aside>
      </div>
    </section>
  )
}

function ReadyItem({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  const state = ok === null ? 'pending' : ok ? 'done' : 'todo'
  return (
    <li className={`shop-readiness-item is-${state}`}>
      <span className="shop-readiness-icon" aria-hidden="true">
        <DoodleIcon name={ok ? 'check' : ok === null ? 'clock' : 'x'} size={16} />
      </span>
      <span>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </li>
  )
}
