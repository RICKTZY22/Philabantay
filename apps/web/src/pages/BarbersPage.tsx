import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BarberWithProfile } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { Avatar } from '../components/Avatar'
import { DoodleIcon } from '../theme/DoodleDefs'
import { Loading } from '../components/Loading'
import { useDoodleAnimations } from '../theme/useDoodleAnimations'
import './BarbersPage.css'

export function BarbersPage() {
  const backend = useBackend()
  const [all, setAll] = useState<BarberWithProfile[] | null>(null)
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set())
  const ref = useDoodleAnimations<HTMLDivElement>([all])

  useEffect(() => {
    let active = true
    Promise.all([backend.barbers.list(), backend.barbers.availableNow()]).then(
      ([list, available]) => {
        if (!active) return
        setAll(list)
        setAvailableIds(new Set(available.map((b) => b.id)))
      },
    )
    return () => {
      active = false
    }
  }, [backend])

  if (!all) return <Loading label="Rounding up the crew…" />

  const availableNow = all.filter((b) => availableIds.has(b.id))

  return (
    <div ref={ref}>
      <span className="eyebrow">The crew</span>
      <h1>Meet your barbers</h1>
      <p className="muted">Green badge means they are on the chair right now.</p>

      {availableNow.length > 0 && (
        <section className="avail-strip rough-card" data-reveal>
          <div className="row" style={{ marginBottom: 10 }}>
            <DoodleIcon name="clock" size={26} />
            <strong>Available right now</strong>
          </div>
          <div className="row">
            {availableNow.map((b) => (
              <Link key={b.id} to={`/barbers/${b.id}`} className="pill pill-on">
                {b.profile.full_name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="card-grid" data-reveal-group style={{ marginTop: 24 }}>
        {all.map((b) => (
          <Link to={`/barbers/${b.id}`} key={b.id} className="rough-card barber-card">
            <div className="row">
              <Avatar name={b.profile.full_name} />
              <div>
                <h3 style={{ margin: 0 }}>{b.profile.full_name}</h3>
                <span className={availableIds.has(b.id) ? 'pill pill-on' : 'pill pill-off'}>
                  {availableIds.has(b.id) ? 'On the chair' : 'Off shift'}
                </span>
              </div>
            </div>
            <p className="muted">{b.bio}</p>
            <span className="row book-hint">
              Book or chat <DoodleIcon name="arrow" size={18} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
