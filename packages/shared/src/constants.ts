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
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No show',
}

/** Slot generation granularity (minutes) when computing open times. */
export const SLOT_STEP_MIN = 15
