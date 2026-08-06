export const SHOP_NAME = 'Philabantay'

/*
 * `SHOP_TIMEZONE = 'Asia/Manila'` was removed on 2026-08-06. It was a survivor
 * of the single-shop era, imported by nothing, and it contradicted the per-shop
 * `shops.timezone` column that the booking engine actually evaluates against.
 * A default here is a trap: use the shop's own timezone.
 */

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
