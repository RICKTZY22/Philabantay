// Request/response shapes for the data-access layer. Both the mock (Phase 1)
// and the Supabase/Express implementation (Phase 2) speak these.

import type { BugCategory, OnboardingRole, Weekday } from './types'

export interface SignUpInput {
  email: string
  password: string
  full_name: string
  phone?: string
}

export interface SignInInput {
  email: string
  password: string
}

/** One-time role choice after signup. Professional choices are requests only. */
export interface CompleteRoleOnboardingInput {
  role: OnboardingRole
}

/** Safe, user-editable profile fields. Role and verification are excluded. */
export interface UpdateProfileInput {
  full_name?: string
  email?: string
  phone?: string | null
  location?: string | null
  avatar_url?: string
}

export interface ChangePasswordInput {
  current_password: string
  new_password: string
}

export interface CreateBugReportInput {
  category: BugCategory
  summary: string
  description: string
  page_url?: string
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

export interface RateAppointmentInput {
  appointment_id: string
  barber_rating: number
  shop_rating: number
  comment?: string
}

export interface SendMessageInput {
  conversation_id: string
  body: string
}

export interface JoinShopInput {
  code: string
}

/** Barber request to change one day's shift; the owner approves/denies. */
export interface ShiftChangeRequestInput {
  /** ISO date (YYYY-MM-DD) ng shift na gustong baguhin. */
  date: string
  message: string
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
