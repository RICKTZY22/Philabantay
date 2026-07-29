import type { AppointmentStatus, CanonicalAppointmentStatus } from '@barbershop/shared'
import { describe, expect, it } from 'vitest'
import { appointmentStatusPresentation } from '../src/lib/appointmentStatus'

const canonicalStatuses: CanonicalAppointmentStatus[] = [
  'requested',
  'confirmed',
  'checked_in',
  'in_progress',
  'awaiting_confirmation',
  'declined',
  'expired',
  'cancelled',
  'completed',
  'customer_no_show',
  'disputed',
]

describe('appointment status presentation', () => {
  it.each(canonicalStatuses)('defines a label and pill class for %s', (status) => {
    expect(appointmentStatusPresentation(status)).toMatchObject({
      canonical: status,
      className: expect.stringMatching(/^pill-/),
      label: expect.any(String),
    })
  })

  it.each([
    ['pending', 'requested'],
    ['no_show', 'customer_no_show'],
  ] satisfies [AppointmentStatus, CanonicalAppointmentStatus][])(
    'normalizes the legacy %s status to %s',
    (legacy, canonical) => {
      expect(appointmentStatusPresentation(legacy).canonical).toBe(canonical)
    },
  )
})
