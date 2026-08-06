import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataError, type AnalyticsRange, type ShopAnalytics } from '@barbershop/shared'
import { useBackend } from '../services/backend'
import { DoodleIcon } from '../theme/DoodleDefs'
import { money } from '../lib/format'
import './OwnerAnalytics.css'

const RANGE_LABEL: Record<AnalyticsRange, string> = {
  week: 'Last 7 days',
  month: 'Last 30 days',
  custom: 'Custom range',
  all: 'All time',
}

function percent(value: number | null): string {
  return value === null ? 'Not enough data' : `${(value * 100).toFixed(1)}%`
}

function minutes(value: number): string {
  const hours = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  if (hours === 0) return `${rest} min`
  return `${hours} h ${rest} min`
}

/**
 * Every figure is rendered with the definition the server sent for it, so a
 * reader can check the number instead of trusting the label. A metric with no
 * definition is a bug, not a style choice.
 */
function Metric({ label, value, definitionKey, definitions, hint }: {
  label: string
  value: string
  definitionKey?: string
  definitions: Record<string, string>
  hint?: string
}) {
  const definition = definitionKey ? definitions[definitionKey] : undefined
  return (
    <div className="analytics-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint && <p className="analytics-metric-hint">{hint}</p>}
      {definition && (
        <details className="analytics-definition">
          <summary>How this is calculated</summary>
          <p>{definition}</p>
        </details>
      )}
    </div>
  )
}

/** No-data is stated in words, never left as a bare zero pretending to be a fact. */
function EmptySection({ message }: { message: string }) {
  return (
    <p className="analytics-empty" role="status">
      <DoodleIcon name="star" size={20} />
      <span>{message}</span>
    </p>
  )
}

/**
 * Bars with an accessible table beside them. The plan requires every chart to
 * expose a table/download view, so the table is the primary representation and
 * the bars are decoration layered on top of it.
 */
function BarSeries({ caption, rows, format }: {
  caption: string
  rows: Array<{ label: string; value: number }>
  format: (value: number) => string
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  const csv = useMemo(
    () => `label,value\n${rows.map((row) => `${JSON.stringify(row.label)},${row.value}`).join('\n')}`,
    [rows],
  )
  const href = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`, [csv])

  if (rows.length === 0) return <EmptySection message={`No ${caption.toLowerCase()} in this range yet.`} />

  return (
    <div className="analytics-series">
      <div className="analytics-bars" aria-hidden="true">
        {rows.map((row) => (
          <div key={row.label} className="analytics-bar">
            <span className="analytics-bar-fill" style={{ height: `${Math.round((row.value / max) * 100)}%` }} />
            <span className="analytics-bar-label">{row.label}</span>
          </div>
        ))}
      </div>
      <details className="analytics-table-toggle">
        <summary>Table view ({rows.length} rows)</summary>
        <div className="analytics-table-scroll">
          <table>
            <caption>{caption}</caption>
            <thead><tr><th scope="col">Bucket</th><th scope="col">Value</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}><th scope="row">{row.label}</th><td>{format(row.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <a className="btn btn-sm" href={href} download={`${caption.toLowerCase().replace(/\s+/g, '-')}.csv`}>
          Download CSV
        </a>
      </details>
    </div>
  )
}

export function OwnerAnalytics({ shopId }: { shopId: string }) {
  const backend = useBackend()
  const [range, setRange] = useState<AnalyticsRange>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState<ShopAnalytics | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = range === 'custom' ? { range, from, to } : { range }
      setData(await backend.analytics.shop(shopId, query))
    } catch (caught) {
      setError(caught instanceof DataError ? caught.message : 'Hindi ma-load ang analytics. Subukan ulit.')
    } finally {
      setLoading(false)
    }
  }, [backend, shopId, range, from, to])

  useEffect(() => {
    // A custom range waits for both ends rather than asking the server a question
    // it has already told us it will refuse.
    if (range === 'custom' && (from === '' || to === '')) {
      setLoading(false)
      return
    }
    void load()
  }, [load, range, from, to])

  const definitions = data?.definitions ?? {}

  return (
    <div className="owner-analytics">
      <header className="analytics-head">
        <div>
          <span className="eyebrow">SHOP INSIGHTS</span>
          <h1>Analytics</h1>
          <p>
            Bawat number dito ay galing sa finalized facts, sa oras ng shop mo. Walang tinatawag na
            &ldquo;revenue&rdquo;: hiwalay ang booked value, completed service value, at ang totoong
            collected.
          </p>
        </div>
        <div className="analytics-range" role="group" aria-label="Analytics range">
          {(['week', 'month', 'all', 'custom'] as AnalyticsRange[]).map((option) => (
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

      {range === 'custom' && (
        <div className="analytics-custom">
          <label>
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
          </label>
          {(from === '' || to === '') && <p className="analytics-empty">Pick both dates to run the range.</p>}
        </div>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error} <button type="button" className="btn btn-sm" onClick={() => void load()}>Retry</button>
        </p>
      )}

      {loading && !data && <p className="analytics-empty" role="status">Kinakalkula ang mga numero…</p>}

      {data && (
        <>
          <p className="analytics-cutoff">
            {RANGE_LABEL[range]} · {data.from_date} to {data.to_date} · {data.timezone} ·
            {' '}data cutoff {new Date(data.generated_at).toLocaleString('en-PH')}
            {loading && ' · refreshing…'}
          </p>

          <section className="analytics-section" aria-labelledby="analytics-value">
            <h2 id="analytics-value">Value and collection</h2>
            <p className="analytics-section-note">
              Five separate figures on purpose. Service value is not money received, and money
              received is not recognized revenue.
            </p>
            <dl className="analytics-grid">
              <Metric label="Booked value" value={money(data.value.booked_value_cents)} definitionKey="booked_value_cents" definitions={definitions} />
              <Metric label="Completed service value" value={money(data.value.completed_service_value_cents)} definitionKey="completed_service_value_cents" definitions={definitions} />
              <Metric label="Collected" value={money(data.value.collected_cents)} definitionKey="collected_cents" definitions={definitions} />
              <Metric label="Refunded" value={money(data.value.refunded_cents)} definitionKey="refunded_cents" definitions={definitions} />
              <Metric label="Net collected" value={money(data.value.net_collected_cents)} definitionKey="net_collected_cents" definitions={definitions} />
            </dl>
            {data.value.payment_event_count === 0 && (
              <EmptySection message="Walang naitalang collection sa range na ito, kaya collected at refunded ay zero — hindi ito estimate." />
            )}
          </section>

          <section className="analytics-section" aria-labelledby="analytics-demand">
            <h2 id="analytics-demand">Demand</h2>
            <dl className="analytics-grid">
              <Metric label="Requests" value={String(data.demand.requested)} definitions={definitions} />
              <Metric label="Confirmed" value={String(data.demand.confirmed)} definitions={definitions} />
              <Metric label="Completed" value={String(data.demand.completed)} definitions={definitions} />
              <Metric label="Cancelled" value={String(data.demand.cancelled)} definitions={definitions} />
              <Metric label="Expired" value={String(data.demand.expired)} definitions={definitions} />
              <Metric label="Customer no-show" value={String(data.demand.customer_no_show)} definitionKey="customer_no_shows" definitions={definitions} />
              <Metric label="Disputed" value={String(data.demand.disputed)} definitions={definitions} />
            </dl>
            <BarSeries
              caption="Completed visits per day"
              rows={data.demand.series.map((point) => ({ label: point.date.slice(5), value: point.completed }))}
              format={String}
            />
          </section>

          <section className="analytics-section" aria-labelledby="analytics-capacity">
            <h2 id="analytics-capacity">Capacity</h2>
            <dl className="analytics-grid">
              <Metric label="Available provider minutes" value={minutes(data.capacity.available_provider_minutes)} definitionKey="available_provider_minutes" definitions={definitions} />
              <Metric label="Available chair minutes" value={minutes(data.capacity.available_chair_minutes)} definitionKey="available_chair_minutes" definitions={definitions} />
              <Metric label="Assigned minutes" value={minutes(data.capacity.assigned_minutes)} definitionKey="assigned_minutes" definitions={definitions} />
              <Metric label="Provider utilization" value={percent(data.capacity.provider_utilization)} definitionKey="provider_utilization" definitions={definitions} />
              <Metric label="Chair utilization" value={percent(data.capacity.chair_utilization)} definitions={definitions} />
              <Metric label="Rejected demand" value={String(data.capacity.rejected_demand)} definitionKey="rejected_demand" definitions={definitions} />
            </dl>
            {data.capacity.available_provider_minutes === 0 && (
              <EmptySection message="Walang scheduled roster minutes sa range, kaya walang utilization na masasabi — hindi 0%, kundi wala talagang basis." />
            )}
          </section>

          <section className="analytics-section" aria-labelledby="analytics-customers">
            <h2 id="analytics-customers">Customers</h2>
            <dl className="analytics-grid">
              <Metric label="Unique visitors" value={String(data.customers.unique_visitors)} definitions={definitions} />
              <Metric label="Repeat visitors" value={String(data.customers.repeat_visitors)} definitions={definitions} />
              <Metric label="Repeat rate" value={percent(data.customers.repeat_rate)} definitionKey="repeat_rate" definitions={definitions} />
            </dl>
            {data.customers.top_visitors.length === 0
              ? <EmptySection message="Wala pang completed visit sa range." />
              : (
                <div className="analytics-table-scroll">
                  <table>
                    <caption>Top visitors by completed visit count</caption>
                    <thead><tr><th scope="col">Customer</th><th scope="col">Completed visits</th></tr></thead>
                    <tbody>
                      {data.customers.top_visitors.map((visitor) => (
                        <tr key={visitor.customer_id}>
                          <th scope="row">{visitor.full_name ?? 'Unnamed customer'}</th>
                          <td>{visitor.completed_visits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>

          <section className="analytics-section" aria-labelledby="analytics-services">
            <h2 id="analytics-services">Services</h2>
            {data.services.top_services.length === 0
              ? <EmptySection message="Wala pang completed service sa range." />
              : (
                <div className="analytics-table-scroll">
                  <table>
                    <caption>Top services by completed count, with duration drift</caption>
                    <thead>
                      <tr>
                        <th scope="col">Service</th>
                        <th scope="col">Completed</th>
                        <th scope="col">Completed service value</th>
                        <th scope="col">Booked min</th>
                        <th scope="col">Actual min (avg)</th>
                        <th scope="col">Actual min (sd)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.services.top_services.map((service) => (
                        <tr key={service.service_id}>
                          <th scope="row">{service.name}</th>
                          <td>{service.completed_count}</td>
                          <td>{money(service.completed_service_value_cents)}</td>
                          <td>{service.booked_duration_min}</td>
                          <td>{service.actual_duration_min_avg ?? 'Not recorded'}</td>
                          <td>{service.actual_duration_min_stddev}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>

          <section className="analytics-section" aria-labelledby="analytics-staff">
            <h2 id="analytics-staff">Staff</h2>
            <p className="analytics-section-note">
              Hiwalay ang customer no-show sa shop-caused failure. Hindi kasalanan ng barber ang
              customer na hindi sumipot, kaya hindi ito ibinabawas sa performance nila.
            </p>
            {data.staff.providers.length === 0
              ? <EmptySection message="Walang provider activity sa range." />
              : (
                <div className="analytics-table-scroll">
                  <table>
                    <caption>Provider workload and trust signals</caption>
                    <thead>
                      <tr>
                        <th scope="col">Provider</th>
                        <th scope="col">Completed cuts</th>
                        <th scope="col">Service minutes</th>
                        <th scope="col">Customer no-shows</th>
                        <th scope="col">Shop-caused failures</th>
                        <th scope="col">Rating</th>
                        <th scope="col">Punctuality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.staff.providers.map((provider) => (
                        <tr key={provider.provider_id}>
                          <th scope="row">{provider.full_name}</th>
                          <td>{provider.completed_cuts}</td>
                          <td>{provider.assigned_service_minutes}</td>
                          <td>{provider.customer_no_shows}</td>
                          <td>{provider.shop_caused_failures}</td>
                          <td>
                            {provider.rating_count === 0
                              ? 'No reviews yet'
                              : `${provider.rating} / 5 (${provider.rating_count})`}
                          </td>
                          <td>{percent(provider.punctuality_rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>

          <section className="analytics-section" aria-labelledby="analytics-trust">
            <h2 id="analytics-trust">Trust</h2>
            <dl className="analytics-grid">
              <Metric
                label="Shop rating"
                value={data.trust.shop_rating_count === 0
                  ? 'No reviews yet'
                  : `${data.trust.shop_rating} / 5`}
                hint={data.trust.shop_rating_count === 0
                  ? undefined
                  : `over ${data.trust.shop_rating_count} verified visit${data.trust.shop_rating_count === 1 ? '' : 's'}`}
                definitions={definitions}
              />
              <Metric label="Reviews in range" value={String(data.trust.reviews_in_range)} definitions={definitions} />
              <Metric label="Text hidden by moderation" value={String(data.trust.hidden_text_count)} definitionKey="distribution" definitions={definitions} />
              <Metric label="Open reports" value={String(data.trust.open_reports)} definitions={definitions} />
              <Metric label="Disputes opened" value={String(data.trust.disputes_opened)} definitions={definitions} />
              <Metric label="Disputes escalated" value={String(data.trust.disputes_escalated)} definitions={definitions} />
              <Metric
                label="Average decision time"
                value={data.trust.owner_decision_hours_avg === null
                  ? 'No decisions yet'
                  : `${data.trust.owner_decision_hours_avg} h`}
                definitionKey="owner_decision_hours_avg"
                definitions={definitions}
              />
            </dl>
            <BarSeries
              caption="Shop rating distribution"
              rows={data.trust.distribution.map((bucket) => ({ label: `${bucket.score}★`, value: bucket.count }))}
              format={String}
            />
          </section>

          <section className="analytics-section" aria-labelledby="analytics-walkins">
            <h2 id="analytics-walkins">Walk-ins</h2>
            <dl className="analytics-grid">
              <Metric label="Total" value={String(data.walk_ins.total)} definitions={definitions} />
              <Metric label="Claimed" value={String(data.walk_ins.claimed)} definitions={definitions} />
              <Metric label="Unclaimed" value={String(data.walk_ins.unclaimed)} definitions={definitions} />
              <Metric label="Converted to completed" value={percent(data.walk_ins.conversion_rate)} definitionKey="conversion_rate" definitions={definitions} />
              <Metric
                label="Wait range"
                value={data.walk_ins.wait_minutes_avg === null
                  ? 'Not recorded'
                  : `${data.walk_ins.wait_minutes_min}–${data.walk_ins.wait_minutes_max} min`}
                hint={data.walk_ins.wait_minutes_avg === null ? undefined : `average ${data.walk_ins.wait_minutes_avg} min`}
                definitionKey="wait_minutes_avg"
                definitions={definitions}
              />
            </dl>
            {data.walk_ins.total === 0 && <EmptySection message="Walang walk-in sa range na ito." />}
          </section>
        </>
      )}
    </div>
  )
}
