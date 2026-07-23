export interface ManilaDateTimeParts {
  date: string
  time: string
  weekday: number
  minute: number
}

/**
 * Convert an absolute instant into the wall-clock facts used by the V1 Manila
 * scheduling contract. Keeping this in one module prevents catalogue,
 * availability, booking, and authorization checks from drifting.
 */
export function manilaDateTimeParts(instant = new Date()): ManilaDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value ?? '0'
  )
  const date = `${value('year')}-${value('month')}-${value('day')}`
  const hour = value('hour')
  const minute = value('minute')
  return {
    date,
    time: `${hour}:${minute}`,
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
    minute: Number(hour) * 60 + Number(minute),
  }
}

export function manilaDateKey(instant = new Date()): string {
  return manilaDateTimeParts(instant).date
}

export function manilaNow(instant = new Date()): Pick<ManilaDateTimeParts, 'date' | 'weekday' | 'minute'> {
  const { date, weekday, minute } = manilaDateTimeParts(instant)
  return { date, weekday, minute }
}

export function wallMinute(time: unknown): number {
  const [hour = '0', minute = '0'] = String(time).slice(0, 5).split(':')
  return Number(hour) * 60 + Number(minute)
}

export function manilaMoment(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00+08:00`)
}
