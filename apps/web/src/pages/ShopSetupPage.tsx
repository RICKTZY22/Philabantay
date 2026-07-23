import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  DataError,
  shopPublicationReadiness,
  type OwnerShop,
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

const STATUS_LABEL: Record<OwnerShop['lifecycle_status'], string> = {
  draft: 'Draft (not visible to customers)',
  pending_review: 'Pending review',
  published: 'Published (live in discovery)',
  suspended: 'Suspended',
  archived: 'Archived',
}

export function ShopSetupPage() {
  const backend = useBackend()
  // undefined = still loading; null = owner has no shop yet.
  const [shop, setShop] = useState<OwnerShop | null | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState<ShopForm>(BLANK)
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'unpublish'>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const mine = await backend.ownerShop.getMine()
      setShop(mine)
      setForm(mine ? fromShop(mine) : BLANK)
    } catch (err) {
      setShop(undefined)
      setLoadError(err instanceof DataError ? err.message : 'Hindi ma-load ang shop setup.')
    }
  }, [backend])

  useEffect(() => { void load() }, [load])

  const update = (patch: Partial<ShopForm>) => setForm((prev) => ({ ...prev, ...patch }))

  // Field-level readiness for the checklist. The active-service requirement is
  // verified by the backend on publish (service editing arrives with P2-02).
  const readiness = useMemo(() => shopPublicationReadiness({
    name: form.name,
    address: form.address,
    city: form.city,
    lat: Number(form.lat),
    lng: Number(form.lng),
    timezone: form.timezone,
    chair_count: Number(form.chair_count),
  }, 1), [form])

  const requiredFilled = readiness.ready

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

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void runMutation('save')
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
              ? 'I-edit ang detalye, tingnan ang readiness checklist, at i-publish kapag handa na.'
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
          <p className="shop-field-note">Map pin picker and address search arrive with the next step (P2-02); enter coordinates for now.</p>
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            {busy === 'save' ? 'Sine-save…' : shop ? 'Save changes' : 'Create shop draft'}
          </button>
        </form>

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
                  disabled={busy !== null || !requiredFilled}
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
              A draft is private. Once your details and at least one active service are ready,
              publishing lists the shop in customer discovery. You can unpublish anytime to make edits.
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
