import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  APPOINTMENT_STATUS_LABELS,
  canonicalAppointmentStatus,
  type AppointmentDetailed,
  type ShopWithStatus,
} from '@barbershop/shared'
import { DoodleIcon } from '../theme/DoodleDefs'
import { localDateKey, parseLocalDateKey } from '../lib/date'
import { timeOfDay } from '../lib/format'
import './AppointmentCalendar.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function monthDays(month: Date) {
  const cells: Array<Date | null> = Array.from({ length: month.getDay() }, () => null)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function statusLabel(status: AppointmentDetailed['status']) {
  return APPOINTMENT_STATUS_LABELS[canonicalAppointmentStatus(status)]
}

export function AppointmentCalendar({ appointments, shops = [], showViewAll = true, variant = 'compact', onSelectAppointment }: {
  appointments: AppointmentDetailed[]
  shops?: ShopWithStatus[]
  showViewAll?: boolean
  variant?: 'compact' | 'large'
  onSelectAppointment?: (appointment: AppointmentDetailed) => void
}) {
  const [today, setToday] = useState(() => new Date())
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()))
  const [selectedKey, setSelectedKey] = useState(() => localDateKey(new Date()))

  const todayKey = localDateKey(today)

  // Keep the visible month and selected day correct even when the dashboard
  // stays open across midnight or a month boundary.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = new Date()
      if (localDateKey(next) === todayKey) return
      setToday(next)
      setVisibleMonth(startOfMonth(next))
      setSelectedKey(localDateKey(next))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [todayKey])

  const visibleAppointments = useMemo(
    () => [...appointments]
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [appointments],
  )

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, AppointmentDetailed[]>()
    for (const appointment of visibleAppointments) {
      const key = localDateKey(new Date(appointment.starts_at))
      grouped.set(key, [...(grouped.get(key) ?? []), appointment])
    }
    return grouped
  }, [visibleAppointments])

  const selectedAppointments = appointmentsByDate.get(selectedKey) ?? []
  const selectedDate = parseLocalDateKey(selectedKey) ?? today
  const cells = monthDays(visibleMonth)
  function goToToday() {
    const now = new Date()
    setToday(now)
    setVisibleMonth(startOfMonth(now))
    setSelectedKey(localDateKey(now))
  }

  function changeMonth(amount: number) {
    const nextMonth = shiftMonth(visibleMonth, amount)
    setVisibleMonth(nextMonth)
    setSelectedKey(localDateKey(nextMonth))
  }

  return (
    <section className={`cut-calendar${variant === 'large' ? ' is-large' : ''}`} aria-labelledby="cut-calendar-title">
      <div className="cut-calendar-head">
        <div>
          <span className="cut-calendar-kicker">YOUR SCHEDULE</span>
          <h2 id="cut-calendar-title"><DoodleIcon name="calendar" size={21} /> Cut calendar</h2>
        </div>
        {showViewAll && <Link className="cut-calendar-all" to="/appointments?view=calendar">View all</Link>}
      </div>

      <div className="cut-calendar-nav">
        <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>←</button>
        <strong aria-live="polite">
          {visibleMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}
        </strong>
        <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>→</button>
      </div>
      <button type="button" className="cut-calendar-today" onClick={goToToday}>
        Today · {today.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
      </button>

      <div className="cut-calendar-grid" role="grid" aria-label="Appointment calendar">
        {WEEKDAYS.map((weekday) => <span className="cut-calendar-weekday" role="columnheader" key={weekday}>{weekday}</span>)}
        {cells.map((date, index) => {
          if (!date) return <span className="cut-calendar-blank" aria-hidden="true" key={`blank-${index}`} />
          const key = localDateKey(date)
          const count = appointmentsByDate.get(key)?.length ?? 0
          const isToday = key === todayKey
          const isSelected = key === selectedKey
          const dayAppointments = appointmentsByDate.get(key) ?? []
          const showSelected = variant === 'compact' && isSelected
          const className = `cut-calendar-day${isToday ? ' is-today' : ''}${showSelected ? ' is-selected' : ''}${count ? ' has-cuts' : ''}`
          const label = `${date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric' })}${count ? `, ${count} appointment${count === 1 ? '' : 's'}` : ''}`
          if (variant === 'large') {
            return (
              <div role="gridcell" key={key} className={className} aria-selected={isSelected}>
                <button type="button" className="cut-calendar-date-button" aria-label={label} onClick={() => setSelectedKey(key)}>
                  <span>{date.getDate()}</span>
                  {count > 0 && <i aria-hidden="true">{count}</i>}
                </button>
                <div className="cut-calendar-day-events">
                  {dayAppointments.slice(0, 1).map((appointment) => (
                    <button
                      type="button"
                      className={`cut-calendar-event is-${canonicalAppointmentStatus(appointment.status)}`}
                      key={appointment.id}
                      onClick={() => {
                        setSelectedKey(key)
                        onSelectAppointment?.(appointment)
                      }}
                    >
                      <strong>{timeOfDay(appointment.starts_at)}</strong>
                      <span>{appointment.service.name}</span>
                    </button>
                  ))}
                  {dayAppointments.length > 1 && <span className="cut-calendar-more">+{dayAppointments.length - 1} more</span>}
                </div>
              </div>
            )
          }
          return (
            <button type="button" role="gridcell" key={key} className={className} aria-label={label} aria-selected={isSelected} onClick={() => setSelectedKey(key)}>
              <span>{date.getDate()}</span>
              {count > 0 && <i aria-hidden="true">{count}</i>}
            </button>
          )
        })}
      </div>

      {variant === 'compact' && <div className="cut-calendar-agenda">
        <h3>{selectedDate.toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
        {selectedAppointments.length === 0 ? (
          <p>Walang haircut appointment sa araw na ito.</p>
        ) : selectedAppointments.map((appointment) => {
          const shop = appointment.shop ?? shops.find((candidate) => candidate.barber_ids.includes(appointment.barber_id))
          const status = canonicalAppointmentStatus(appointment.status)
          const destination = ['completed', 'cancelled', 'declined', 'expired', 'customer_no_show'].includes(status)
            ? '/appointments?view=history'
            : '/appointments?view=upcoming'
          return (
            <Link className="cut-calendar-booking" to={destination} key={appointment.id}>
              <span className={`cut-calendar-time is-${status}`}>{timeOfDay(appointment.starts_at)}</span>
              <span>
                <strong>{appointment.service.name}</strong>
                <small>{appointment.barber.profile.full_name}{shop ? ` · ${shop.name}` : ''}</small>
              </span>
              <em>{statusLabel(appointment.status)}</em>
            </Link>
          )
        })}
      </div>}
    </section>
  )
}
