import { describe, expect, it } from 'vitest'
import {
  barberCanMarkCustomerNoShow,
  canTransitionAppointment,
  canonicalAppointmentStatus,
  customerCanCheckInAppointment,
  nextAppointmentStatus,
} from '../src'

const START = Date.parse('2030-01-01T02:00:00.000Z')

describe('appointment lifecycle', () => {
  it('normalizes only the temporary legacy statuses', () => {
    expect(canonicalAppointmentStatus('pending')).toBe('requested')
    expect(canonicalAppointmentStatus('no_show')).toBe('customer_no_show')
    expect(canonicalAppointmentStatus('confirmed')).toBe('confirmed')
  })

  it('allows the happy path and rejects shortcuts', () => {
    expect(nextAppointmentStatus('requested', 'accept')).toBe('confirmed')
    expect(nextAppointmentStatus('confirmed', 'check_in')).toBe('checked_in')
    expect(nextAppointmentStatus('checked_in', 'start')).toBe('in_progress')
    expect(nextAppointmentStatus('in_progress', 'finish')).toBe('awaiting_confirmation')
    expect(nextAppointmentStatus('awaiting_confirmation', 'confirm_completion')).toBe('completed')
    expect(canTransitionAppointment('confirmed', 'finish')).toBe(false)
    expect(canTransitionAppointment('completed', 'cancel')).toBe(false)
  })

  it('opens customer check-in 30 minutes before start through the scheduled end', () => {
    const appointment = {
      status: 'confirmed' as const,
      starts_at: new Date(START).toISOString(),
      ends_at: new Date(START + 30 * 60_000).toISOString(),
    }
    expect(customerCanCheckInAppointment(appointment, START - 31 * 60_000)).toBe(false)
    expect(customerCanCheckInAppointment(appointment, START - 30 * 60_000)).toBe(true)
    expect(customerCanCheckInAppointment(appointment, START + 30 * 60_000)).toBe(true)
    expect(customerCanCheckInAppointment(appointment, START + 31 * 60_000)).toBe(false)
  })

  it('allows customer no-show only after the grace period', () => {
    const appointment = {
      status: 'confirmed' as const,
      starts_at: new Date(START).toISOString(),
    }
    expect(barberCanMarkCustomerNoShow(appointment, START + 14 * 60_000)).toBe(false)
    expect(barberCanMarkCustomerNoShow(appointment, START + 15 * 60_000)).toBe(true)
  })
})
