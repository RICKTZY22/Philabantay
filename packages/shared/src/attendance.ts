import type { AvailabilityRule, BarberAbsence, BarberEmployment } from './types'

/**
 * Pure attendance math shared by UI and backend adapters. "Present" is
 * derived: a scheduled day (may weekly rule sa weekday na iyon) without an
 * absence record counts as present. The mock has no clock-in mechanism, so
 * derivation is the single source of truth; Phase 2 can replace this with
 * real check-in rows behind the same summary shape.
 */

export interface AttendanceSummary {
  scheduled: number
  present: number
  absent: number
}

export interface BarberAttendance {
  /** Kasalukuyang buwan hanggang today. */
  month: AttendanceSummary
  /** Buong tenure sa kasalukuyang shop (hired_at hanggang today/ended_at). */
  tenure: AttendanceSummary
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Strict local-date parse; shared package can't reach the app's lib/date. */
function parseDateKey(value: string): Date | null {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return null
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function summarizeBarberAttendance(
  employment: Pick<BarberEmployment, 'hired_at' | 'ended_at'>,
  rules: Array<Pick<AvailabilityRule, 'weekday'>>,
  absences: Array<Pick<BarberAbsence, 'date'>>,
  now = new Date(),
): BarberAttendance {
  const empty: AttendanceSummary = { scheduled: 0, present: 0, absent: 0 }
  const month: AttendanceSummary = { ...empty }
  const tenure: AttendanceSummary = { ...empty }

  const start = parseDateKey(employment.hired_at)
  if (!start) return { month, tenure }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endedAt = employment.ended_at ? parseDateKey(employment.ended_at) : null
  const end = endedAt && endedAt < today ? endedAt : today

  const scheduledWeekdays = new Set(rules.map((rule) => rule.weekday))
  const absentDates = new Set(absences.map((absence) => absence.date))

  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if (!scheduledWeekdays.has(cursor.getDay() as AvailabilityRule['weekday'])) continue
    const isAbsent = absentDates.has(dateKey(cursor))
    tenure.scheduled += 1
    tenure[isAbsent ? 'absent' : 'present'] += 1
    if (cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth()) {
      month.scheduled += 1
      month[isAbsent ? 'absent' : 'present'] += 1
    }
  }
  return { month, tenure }
}
