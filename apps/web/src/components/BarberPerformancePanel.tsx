import { useCallback, useEffect, useState } from 'react'
import { DataError, type AnalyticsRange, type ProviderPerformance } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { DoodleIcon } from '../theme/DoodleDefs'
import './BarberPerformancePanel.css'

const RANGE_LABEL: Record<Exclude<AnalyticsRange, 'custom'>, string> = {
  week: 'Last 7 days',
  month: 'Last 30 days',
  all: 'All time',
}

function percent(value: number | null): string {
  return value === null ? 'Not enough data' : `${(value * 100).toFixed(1)}%`
}

/**
 * A barber's own numbers. The three failure kinds stay on separate lines and are
 * never summed into one score, because a customer who did not arrive is not the
 * barber's failure — that is required test 8, expressed in the UI as well as in
 * the query.
 */
export function BarberPerformancePanel() {
  const backend = useBackend()
  const [range, setRange] = useState<Exclude<AnalyticsRange, 'custom'>>('month')
  const [data, setData] = useState<ProviderPerformance | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await backend.analytics.providerPerformance({ range }))
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-load ang performance. Subukan ulit.')
    } finally {
      setLoading(false)
    }
  }, [backend, range])

  useEffect(() => {
    void load()
  }, [load])

  const maxBucket = Math.max(1, ...(data?.distribution ?? []).map((bucket) => bucket.count))

  return (
    <section className="barber-performance" aria-labelledby="barber-performance-heading">
      <header>
        <div>
          <span className="eyebrow">YOUR RECORD</span>
          <h2 id="barber-performance-heading">Performance</h2>
          <p>
            Galing sa finalized na visits. Hiwalay ang customer no-show sa shop cancellation, at hindi
            ito ibinabawas sa completed cuts mo.
          </p>
        </div>
        <div className="performance-range" role="group" aria-label="Performance range">
          {(['week', 'month', 'all'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`btn btn-sm ${range === option ? 'btn-primary' : ''}`}
              aria-pressed={range === option}
              onClick={() => setRange(option)}
            >
              {RANGE_LABEL[option]}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p className="form-error" role="alert">
          {error} <button type="button" className="btn btn-sm" onClick={() => void load()}>Retry</button>
        </p>
      )}
      {loading && !data && <p className="performance-empty" role="status">Kinakalkula ang mga numero…</p>}

      {data && (
        <>
          <p className="performance-cutoff">
            {RANGE_LABEL[range]} · {data.from_date} to {data.to_date} ·
            {' '}data cutoff {new Date(data.generated_at).toLocaleString('en-PH')}
            {loading && ' · refreshing…'}
          </p>

          <dl className="performance-grid">
            <div>
              <dt>Completed cuts</dt>
              <dd>{data.completed_cuts}</dd>
            </div>
            <div>
              <dt>Service minutes</dt>
              <dd>{data.assigned_service_minutes}</dd>
            </div>
            <div>
              <dt>Repeat customers</dt>
              <dd>{data.repeat_customers}</dd>
            </div>
            <div>
              <dt>Rating</dt>
              <dd>
                {data.rating_count === 0 ? 'No reviews yet' : `${data.rating} / 5`}
              </dd>
              {data.rating_count > 0 && (
                <p className="performance-hint">
                  over {data.rating_count} verified visit{data.rating_count === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <div>
              <dt>Punctuality</dt>
              <dd>{percent(data.punctuality_rate)}</dd>
              <p className="performance-hint">
                {data.attendance_present} present · {data.attendance_absent} absent
              </p>
            </div>
          </dl>

          <div className="performance-attribution">
            <h3>Visits that did not finish</h3>
            <p className="performance-hint">Three separate figures. None of them is your completed-cut count.</p>
            <dl>
              <div>
                <dt>Customer did not arrive</dt>
                <dd>{data.customer_no_shows}</dd>
                <p className="performance-hint">Not counted against you.</p>
              </div>
              <div>
                <dt>Shop cancelled</dt>
                <dd>{data.shop_cancellations}</dd>
              </div>
              <div>
                <dt>Owner declined the request</dt>
                <dd>{data.owner_declines}</dd>
              </div>
            </dl>
          </div>

          <div className="performance-distribution">
            <h3>Rating spread</h3>
            {data.rating_count === 0 ? (
              <p className="performance-empty" role="status">
                <DoodleIcon name="star" size={18} />
                <span>Wala pang review. Lalabas dito ang spread kapag may verified visit na nag-rate.</span>
              </p>
            ) : (
              <>
                <div className="performance-bars" aria-hidden="true">
                  {data.distribution.map((bucket) => (
                    <div key={bucket.score} className="performance-bar">
                      <span
                        className="performance-bar-fill"
                        style={{ height: `${Math.round((bucket.count / maxBucket) * 100)}%` }}
                      />
                      <span className="performance-bar-label">{bucket.score}★</span>
                    </div>
                  ))}
                </div>
                <table>
                  <caption>Reviews at each score</caption>
                  <thead><tr><th scope="col">Score</th><th scope="col">Reviews</th></tr></thead>
                  <tbody>
                    {data.distribution.map((bucket) => (
                      <tr key={bucket.score}>
                        <th scope="row">{bucket.score} of 5</th>
                        <td>{bucket.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <details className="performance-definitions">
            <summary>How these are calculated</summary>
            <dl>
              {Object.entries(data.definitions).map(([key, definition]) => (
                <div key={key}>
                  <dt>{key.replaceAll('_', ' ')}</dt>
                  <dd>{definition}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </section>
  )
}
