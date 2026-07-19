export const SHOP_NAME = 'Philabantay'

/** Single-shop MVP: all times are interpreted in this timezone. */
export const SHOP_TIMEZONE = 'Asia/Manila'

export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  requested: 'Requested',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  awaiting_confirmation: 'Awaiting confirmation',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No show',
  customer_no_show: 'Customer no-show',
  disputed: 'Disputed',
}

/** First-release defaults; later these become validated per-shop policies. */
export const APPOINTMENT_POLICY_DEFAULTS = {
  requestExpiryMinutes: 15,
  checkInOpensMinutesBeforeStart: 30,
  customerNoShowGraceMinutes: 15,
  completionConfirmationMinutes: 120,
} as const

/** Slot generation granularity (minutes) when computing open times. */
export const SLOT_STEP_MIN = 15
