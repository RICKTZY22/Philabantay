/*
 * Four helpers in this repo format a date as YYYY-MM-DD and they do NOT agree:
 *   lib/date.ts            localDateKey  device-local
 *   CustomerDashboard.tsx  todayDateKey  Manila-fixed
 *   AppointmentsPage.tsx   shopDateKey   the shop's own timezone
 *   shared/attendance.ts   dateKey       caller-supplied
 * Booking rules are evaluated in `shops.timezone`, so the shop-timezone one is
 * the only correct choice anywhere a booking date is computed. Picking by
 * convenience is how a Manila-hardcoded pre-check shipped and refused valid
 * slots for non-Manila shops (see D-056). Check which one you want.
 */

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Format a Date as a device-local calendar key without converting to UTC. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Strictly parse YYYY-MM-DD and reject rollover values such as 2026-02-31. */
export function parseLocalDateKey(value: string | null): Date | null {
  if (!value) return null
  const match = LOCAL_DATE_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const parsed = new Date(year, monthIndex, day)
  return localDateKey(parsed) === value ? parsed : null
}

export function todayLocalDateKey(now = new Date()): string {
  return localDateKey(now)
}

export function isTodayOrLaterLocalDateKey(value: string | null, now = new Date()): value is string {
  const parsed = parseLocalDateKey(value)
  if (!parsed) return false
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return parsed >= today
}
