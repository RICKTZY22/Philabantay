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
