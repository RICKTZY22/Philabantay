import { canonicalAppointmentStatus, customerCanCancelAppointment } from './appointment-lifecycle'
import type { Appointment } from './types'

const ACTIVE_APPOINTMENT_STATUSES = new Set(['requested', 'confirmed'])

/**
 * An appointment is upcoming only while it is active and its start time has
 * not passed. Keeping this rule in the shared domain package prevents pages
 * and backend adapters from disagreeing about which actions are still valid.
 */
export function isUpcomingAppointment(
  appointment: Pick<Appointment, 'starts_at' | 'status'>,
  nowEpochMs = Date.now(),
): boolean {
  const startsAt = Date.parse(appointment.starts_at)
  return ACTIVE_APPOINTMENT_STATUSES.has(canonicalAppointmentStatus(appointment.status))
    && Number.isFinite(startsAt)
    && startsAt > nowEpochMs
}

/** Customers and barbers may only cancel/reschedule before the cut starts. */
export function canModifyAppointment(
  appointment: Pick<Appointment, 'starts_at' | 'status'>,
  nowEpochMs = Date.now(),
): boolean {
  return customerCanCancelAppointment(appointment, nowEpochMs)
}
