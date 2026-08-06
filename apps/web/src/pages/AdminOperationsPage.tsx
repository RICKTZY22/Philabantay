import { useCallback, useEffect, useState } from 'react'
import type { FailedNotification, NotificationOperationsHealth } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { DoodleIcon } from '../theme/DoodleDefs'
import { adminErrorMessage } from './AdminDisputesPage'
import './AdminConsole.css'

/** Null means nothing was attempted, which is unknown rather than healthy. */
function percent(value: number | null): string {
  return value === null ? 'Nothing attempted' : `${(value * 100).toFixed(1)}%`
}

function duration(seconds: number): string {
  if (seconds <= 0) return 'Nothing overdue'
  if (seconds < 60) return `${Math.round(seconds)} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  return `${(seconds / 3600).toFixed(1)} h`
}

function when(value: string | null, fallback: string): string {
  return value === null ? fallback : new Date(value).toLocaleString('en-PH')
}

function Metric({ label, value, hint, definitionKey, definitions }: {
  label: string
  value: string
  hint?: string
  definitionKey?: string
  definitions: Record<string, string>
}) {
  const definition = definitionKey ? definitions[definitionKey] : undefined
  return (
    <div className="admin-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint && <p className="admin-metric-hint">{hint}</p>}
      {definition && (
        <details className="admin-definition">
          <summary>How this is calculated</summary>
          <p>{definition}</p>
        </details>
      )}
    </div>
  )
}

export function AdminOperationsPage() {
  const backend = useBackend()
  const [health, setHealth] = useState<NotificationOperationsHealth | null>(null)
  const [failed, setFailed] = useState<FailedNotification[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      // Two independent reads. The failed list is the actionable half, so a
      // health hiccup must not hide it, and vice versa.
      const [nextHealth, nextFailed] = await Promise.all([
        backend.notificationOperations.health(),
        backend.notificationOperations.listFailed(),
      ])
      setHealth(nextHealth)
      setFailed(nextFailed)
    } catch (caught) {
      setError(adminErrorMessage(caught, 'The operations view could not be loaded.'))
      setFailed((current) => current ?? [])
    }
  }, [backend])

  useEffect(() => { void load() }, [load])

  async function run(key: string, outboxId?: string, title?: string) {
    if (busy) return
    setBusy(key)
    setError('')
    setNotice('')
    try {
      if (outboxId) {
        await backend.notificationOperations.retry(outboxId)
        setNotice(`${title ?? 'Notice'} returned to the queue.`)
      }
      await load()
    } catch (caught) {
      setError(adminErrorMessage(caught, 'That action could not be completed.'))
    } finally {
      setBusy('')
    }
  }

  const definitions = health?.definitions ?? {}

  return (
    <section className="admin-console" aria-labelledby="admin-operations-title">
      <header className="admin-console-head">
        <div>
          <span className="eyebrow">PLATFORM OPERATIONS</span>
          <h1 id="admin-operations-title">Notification delivery</h1>
          <p>
            Outbox lag, failure rate, and the last successful worker cycle. A notice that exhausted
            its automatic retries needs an operator, and can be returned to the queue from here.
          </p>
        </div>
        <DoodleIcon name="send" size={48} />
      </header>

      <div className="admin-filters">
        <button type="button" className="btn btn-sm" disabled={busy === 'refresh'} onClick={() => void run('refresh')}>
          {busy === 'refresh' ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error} <button type="button" className="btn btn-sm" onClick={() => void load()}>Retry</button>
        </p>
      )}
      {notice && <p className="form-success" role="status">{notice}</p>}

      {!health && !error && <p className="admin-empty" role="status">Sinusukat ang queue…</p>}

      {health && (
        <>
          <p className="admin-empty">
            Measured {new Date(health.generated_at).toLocaleString('en-PH')}
          </p>

          <section className="admin-section" aria-labelledby="admin-ops-queue">
            <h2 id="admin-ops-queue">Queue</h2>
            <dl className="admin-grid">
              <Metric label="Due now" value={String(health.due_now)} definitionKey="due_now" definitions={definitions} />
              <Metric
                label="Oldest overdue notice"
                value={duration(health.oldest_due_age_seconds)}
                hint="Future-dated notices are not lag."
                definitionKey="oldest_due_age_seconds"
                definitions={definitions}
              />
              <Metric label="Pending" value={String(health.pending)} definitionKey="pending" definitions={definitions} />
              <Metric label="Retrying" value={String(health.retry)} definitionKey="retry" definitions={definitions} />
              <Metric
                label="Dead-lettered"
                value={String(health.dead_letter)}
                hint={health.dead_letter > 0 ? 'These will not move without an operator.' : undefined}
                definitionKey="dead_letter"
                definitions={definitions}
              />
              <Metric label="Held for quiet hours" value={String(health.held_for_quiet_hours)} definitionKey="held_for_quiet_hours" definitions={definitions} />
            </dl>
          </section>

          <section className="admin-section" aria-labelledby="admin-ops-delivery">
            <h2 id="admin-ops-delivery">Delivery, last 24 hours</h2>
            <dl className="admin-grid">
              <Metric label="Attempts" value={String(health.attempts_last_24h)} definitionKey="attempts_last_24h" definitions={definitions} />
              <Metric label="Failures" value={String(health.failures_last_24h)} definitionKey="failures_last_24h" definitions={definitions} />
              <Metric
                label="Failure rate"
                value={percent(health.failure_rate_last_24h)}
                definitionKey="failure_rate_last_24h"
                definitions={definitions}
              />
              <Metric label="Delivered, all time" value={String(health.delivered)} definitionKey="delivered" definitions={definitions} />
              <Metric
                label="Last successful delivery"
                value={when(health.last_successful_delivery_at, 'No successful delivery recorded')}
                definitionKey="last_successful_delivery_at"
                definitions={definitions}
              />
              <Metric
                label="Last failure"
                value={when(health.last_failure_at, 'No failure recorded')}
                definitionKey="last_failure_at"
                definitions={definitions}
              />
            </dl>

            {health.recent_error_codes.length > 0 && (
              <div className="admin-scroll">
                <table>
                  <caption>Recent error codes</caption>
                  <thead><tr><th scope="col">Error code</th><th scope="col">Occurrences</th></tr></thead>
                  <tbody>
                    {health.recent_error_codes.map((row) => (
                      <tr key={row.error_code}>
                        <th scope="row">{row.error_code}</th>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="admin-section" aria-labelledby="admin-ops-failed">
        <h2 id="admin-ops-failed">Notices needing an operator ({failed?.length ?? 0})</h2>
        <p className="admin-section-note">
          Retrying a notice returns it to the queue with its attempt counter reset. The in-app record
          already exists either way, so a delivery failure never erased an operational notice.
        </p>

        {failed === null && <p className="admin-empty" role="status">Binubuklat ang listahan…</p>}

        {failed !== null && failed.length === 0 && (
          <p className="admin-empty" role="status">
            <DoodleIcon name="check" size={20} />
            <span>Walang nabigong notice na naghihintay ngayon.</span>
          </p>
        )}

        {failed !== null && failed.length > 0 && (
          <div className="admin-scroll">
            <table>
              <caption>Retrying and dead-lettered notices</caption>
              <thead>
                <tr>
                  <th scope="col">Notice</th>
                  <th scope="col">State</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Next attempt</th>
                  <th scope="col">Last error</th>
                  <th scope="col"><span className="sr-only">Retry</span></th>
                </tr>
              </thead>
              <tbody>
                {failed.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      {item.title}
                      <small>Queued {new Date(item.created_at).toLocaleString('en-PH')}</small>
                    </th>
                    <td>
                      <span className={`admin-pill is-${item.status}`}>
                        {item.status === 'dead_letter' ? 'Dead-lettered' : 'Retrying'}
                      </span>
                    </td>
                    <td>{item.attempt_count}</td>
                    <td>{new Date(item.available_at).toLocaleString('en-PH')}</td>
                    <td>{item.last_error ?? 'No error recorded'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() => void run(`retry-${item.id}`, item.id, item.title)}
                      >
                        {busy === `retry-${item.id}` ? 'Retrying...' : `Retry ${item.title}`}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
