import {
  SLOT_STEP_MIN,
  type Appointment,
  type AvailabilityOverride,
  type AvailabilityRule,
  type Service,
  type Slot,
} from '@barbershop/shared'

/**
 * Pure availability math for the mock. Times are treated as the device's local
 * time (single-shop MVP). Phase 2 replicates this against SHOP_TIMEZONE in SQL.
 */

interface Block {
  start: Date
  end: Date
}

function atTime(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(`${date}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d
}

/** Effective working blocks for a barber on an ISO date, overrides winning. */
export function effectiveBlocks(
  date: string,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[],
): Block[] {
  const override = overrides.find((o) => o.date === date)
  if (override) {
    if (!override.is_available) return []
    if (override.start_time && override.end_time) {
      return [{ start: atTime(date, override.start_time), end: atTime(date, override.end_time) }]
    }
    // available override without explicit hours → fall through to weekly rules
  }

  const weekday = new Date(`${date}T00:00:00`).getDay()
  return rules
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ start: atTime(date, r.start_time), end: atTime(date, r.end_time) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

const ACTIVE: Appointment['status'][] = ['pending', 'confirmed']

/** Open bookable slots for a service on a date, excluding overlaps and past times. */
export function computeOpenSlots(
  date: string,
  service: Service,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[],
  appointments: Appointment[],
): Slot[] {
  const blocks = effectiveBlocks(date, rules, overrides)
  const now = Date.now()
  const durationMs = service.duration_min * 60_000
  const stepMs = SLOT_STEP_MIN * 60_000

  const booked = appointments
    .filter((a) => ACTIVE.includes(a.status))
    .map((a) => [new Date(a.starts_at).getTime(), new Date(a.ends_at).getTime()] as const)

  const slots: Slot[] = []
  for (const block of blocks) {
    const blockStart = block.start.getTime()
    const blockEnd = block.end.getTime()
    for (let t = blockStart; t + durationMs <= blockEnd; t += stepMs) {
      const end = t + durationMs
      if (t < now) continue
      const overlaps = booked.some(([bs, be]) => t < be && end > bs)
      if (overlaps) continue
      slots.push({ starts_at: new Date(t).toISOString(), ends_at: new Date(end).toISOString() })
    }
  }
  return slots
}

/** Whether `when` falls inside any effective block for the date. */
export function isWithinHours(
  when: Date,
  rules: AvailabilityRule[],
  overrides: AvailabilityOverride[],
): boolean {
  const date = toISODate(when)
  return effectiveBlocks(date, rules, overrides).some(
    (b) => when >= b.start && when <= b.end,
  )
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
