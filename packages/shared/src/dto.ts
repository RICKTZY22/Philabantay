// Request/response shapes for the data-access layer. Both the mock (Phase 1)
// and the Supabase/Express implementation (Phase 2) speak these.

import type { Weekday } from './types'

export interface SignUpInput {
  email: string
  password: string
  full_name: string
  phone?: string
  /** Who is signing up: 'customer' (default) or 'barber' (barbershop side). */
  role?: 'customer' | 'barber'
  /** Barber-only: short intro shown on their public page. */
  bio?: string
}

export interface SignInInput {
  email: string
  password: string
}

export interface AvailabilityRuleInput {
  weekday: Weekday
  start_time: string
  end_time: string
}

export interface AvailabilityOverrideInput {
  date: string
  is_available: boolean
  start_time?: string | null
  end_time?: string | null
  reason?: string | null
}

export interface CreateAppointmentInput {
  barber_id: string
  service_id: string
  /** ISO timestamp of the chosen slot start */
  starts_at: string
  notes?: string
}

export interface SendMessageInput {
  conversation_id: string
  body: string
}

/** Error thrown by any data-layer implementation for expected failures. */
export class DataError extends Error {
  code: DataErrorCode
  constructor(code: DataErrorCode, message: string) {
    super(message)
    this.name = 'DataError'
    this.code = code
  }
}

export type DataErrorCode =
  | 'invalid_credentials'
  | 'email_taken'
  | 'not_authenticated'
  | 'forbidden'
  | 'not_found'
  | 'slot_taken'
  | 'validation'
