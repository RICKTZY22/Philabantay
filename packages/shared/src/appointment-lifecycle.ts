import { APPOINTMENT_POLICY_DEFAULTS } from './constants'
import type {
  Appointment,
  AppointmentStatus,
  CanonicalAppointmentStatus,
} from './types'

export type AppointmentLifecycleAction =
  | 'accept'
  | 'decline'
  | 'expire'
  | 'check_in'
  | 'start'
  | 'finish'
  | 'confirm_completion'
  | 'auto_complete'
  | 'cancel'
  | 'mark_customer_no_show'
  | 'dispute'
  | 'resolve_complete'
  | 'resolve_cancel'

/**
 * States that still reserve provider capacity. Keep database exclusion
 * constraints and every availability/overlap query aligned to this contract.
 */
export const CAPACITY_BLOCKING_APPOINTMENT_STATUSES = [
  'requested',
  'confirmed',
  'checked_in',
  'in_progress',
  'awaiting_confirmation',
] as const satisfies readonly CanonicalAppointmentStatus[]

const TRANSITIONS: Record<CanonicalAppointmentStatus, Partial<Record<AppointmentLifecycleAction, CanonicalAppointmentStatus>>> = {
  requested: { accept: 'confirmed', decline: 'declined', expire: 'expired', cancel: 'cancelled' },
  confirmed: { check_in: 'checked_in', cancel: 'cancelled', mark_customer_no_show: 'customer_no_show' },
  checked_in: { start: 'in_progress' },
  in_progress: { finish: 'awaiting_confirmation' },
  awaiting_confirmation: {
    confirm_completion: 'completed',
    auto_complete: 'completed',
    dispute: 'disputed',
  },
  disputed: { resolve_complete: 'completed', resolve_cancel: 'cancelled' },
  declined: {},
  expired: {},
  cancelled: {},
  completed: {},
  customer_no_show: {},
}

export function canonicalAppointmentStatus(status: AppointmentStatus): CanonicalAppointmentStatus {
  if (status === 'pending') return 'requested'
  if (status === 'no_show') return 'customer_no_show'
  return status
}

export function nextAppointmentStatus(
  status: AppointmentStatus,
  action: AppointmentLifecycleAction,
): CanonicalAppointmentStatus | null {
  return TRANSITIONS[canonicalAppointmentStatus(status)][action] ?? null
}

export function canTransitionAppointment(
  status: AppointmentStatus,
  action: AppointmentLifecycleAction,
): boolean {
  return nextAppointmentStatus(status, action) !== null
}

export function customerCanCancelAppointment(
  appointment: Pick<Appointment, 'starts_at' | 'status'>,
  nowEpochMs = Date.now(),
): boolean {
  const status = canonicalAppointmentStatus(appointment.status)
  return (status === 'requested' || status === 'confirmed')
    && Date.parse(appointment.starts_at) > nowEpochMs
}

export function customerCanCheckInAppointment(
  appointment: Pick<Appointment, 'starts_at' | 'ends_at' | 'status'>,
  nowEpochMs = Date.now(),
): boolean {
  if (canonicalAppointmentStatus(appointment.status) !== 'confirmed') return false
  const startsAt = Date.parse(appointment.starts_at)
  const endsAt = Date.parse(appointment.ends_at)
  const opensAt = startsAt - APPOINTMENT_POLICY_DEFAULTS.checkInOpensMinutesBeforeStart * 60_000
  return Number.isFinite(opensAt) && Number.isFinite(endsAt)
    && nowEpochMs >= opensAt && nowEpochMs <= endsAt
}

export function barberCanMarkCustomerNoShow(
  appointment: Pick<Appointment, 'starts_at' | 'status'>,
  nowEpochMs = Date.now(),
): boolean {
  if (canonicalAppointmentStatus(appointment.status) !== 'confirmed') return false
  const eligibleAt = Date.parse(appointment.starts_at)
    + APPOINTMENT_POLICY_DEFAULTS.customerNoShowGraceMinutes * 60_000
  return Number.isFinite(eligibleAt) && nowEpochMs >= eligibleAt
}

export function appointmentRequestExpiresAt(createdAt: string): string {
  return new Date(
    Date.parse(createdAt) + APPOINTMENT_POLICY_DEFAULTS.requestExpiryMinutes * 60_000,
  ).toISOString()
}

export function appointmentCompletionDueAt(finishedAt: string): string {
  return new Date(
    Date.parse(finishedAt) + APPOINTMENT_POLICY_DEFAULTS.completionConfirmationMinutes * 60_000,
  ).toISOString()
}
