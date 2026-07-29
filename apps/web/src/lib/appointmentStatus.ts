import {
  APPOINTMENT_STATUS_LABELS,
  canonicalAppointmentStatus,
  type AppointmentStatus,
  type CanonicalAppointmentStatus,
} from '@barbershop/shared'

const STATUS_CLASS: Record<CanonicalAppointmentStatus, string> = {
  requested: 'pill-yellow',
  confirmed: 'pill-on',
  checked_in: 'pill-blue',
  in_progress: 'pill-blue',
  awaiting_confirmation: 'pill-blue',
  declined: 'pill-off',
  expired: 'pill-off',
  cancelled: 'pill-off',
  completed: 'pill-blue',
  customer_no_show: 'pill-pink',
  disputed: 'pill-yellow',
}

export function appointmentStatusPresentation(status: AppointmentStatus) {
  const canonical = canonicalAppointmentStatus(status)
  return {
    canonical,
    className: STATUS_CLASS[canonical],
    label: APPOINTMENT_STATUS_LABELS[canonical],
  }
}
