// Request/response shapes for the data-access layer. Both the mock (Phase 1)
// and the Supabase/Express implementation (Phase 2) speak these.

import type { AppointmentStatus, BugCategory, OnboardingRole, Weekday } from './types'

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

export interface RefreshSessionInput {
  refresh_token: string
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
  /**
   * Required only when `email` is being changed: the account's current password,
   * re-verified server-side before the sensitive email change is applied.
   */
  current_password?: string
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

/** Owner command to close an active employment after assigned work is resolved. */
export interface EndEmploymentInput {
  reason: string
}

/** Barber request to change one day's shift; the owner approves/denies. */
export interface ShiftChangeRequestInput {
  /** ISO date (YYYY-MM-DD) ng shift na gustong baguhin. */
  date: string
  message: string
}

/** Owner note attached to one staff member. */
export interface StaffNoteInput {
  barber_id: string
  body: string
}

/** API-only mutation bodies kept shared so Express and future clients agree. */
export interface SetShiftStatusInput {
  on: boolean
}

export interface SetAcceptingBookingsInput {
  accepting: boolean
}

export interface SetAppointmentStatusInput {
  status: AppointmentStatus
}

/** Optimistic concurrency token supplied by every lifecycle command. */
export interface AppointmentVersionInput {
  expected_version: number
}

export interface AppointmentReasonInput extends AppointmentVersionInput {
  reason: string
}

export interface CheckInAppointmentInput extends AppointmentVersionInput {
  /** Customer self-check-in requires the short code shown by shop staff. */
  code?: string
  /** Owner manual fallback requires an auditable reason instead of a code. */
  reason?: string
}

export interface ReassignAppointmentInput extends AppointmentReasonInput {
  barber_id: string
}

export interface RescheduleAppointmentInput extends CreateAppointmentInput, AppointmentVersionInput {}

export interface ResolveAppointmentDisputeInput extends AppointmentReasonInput {
  resolution: 'completed' | 'cancelled'
}

export interface ResolveShiftChangeRequestInput {
  status: 'approved' | 'declined'
}

export interface ResolveBarberApplicationInput {
  status: 'accepted' | 'declined'
}

export interface OpenConversationInput {
  shop_id: string
}

export interface OpenStaffConversationInput {
  barber_id: string
}

export interface NotificationPreferencesInput {
  booking_reminders: boolean
  chat_notifications: boolean
  email_updates: boolean
  nearby_alerts: boolean
}

export interface CreateServiceInput {
  shop_id: string
  name: string
  duration_min: number
  price_cents: number
  active?: boolean
}

export interface UpdateServiceInput {
  name?: string
  duration_min?: number
  price_cents?: number
  active?: boolean
}

export interface CreateShopInput {
  name: string
  address: string
  city: string
  lat: number
  lng: number
}

export type UpdateShopInput = Partial<CreateShopInput>

/** P2-01 owner shop lifecycle. One shop per owner; created as a draft. */
export interface CreateOwnerShopInput {
  name: string
  address: string
  city: string
  lat: number
  lng: number
  timezone?: string
  description?: string | null
  public_contact_phone?: string | null
  booking_mode?: 'manual' | 'instant'
  chair_count?: number
  default_buffer_min?: number
}

/** Editable fields plus the version the client believes it is changing. */
export type UpdateOwnerShopInput = Partial<CreateOwnerShopInput> & {
  expected_version: number
}

/** Version-guarded body for publish/unpublish lifecycle commands. */
export interface ShopVersionInput {
  expected_version: number
}

export interface CreateAttendanceRecordInput {
  employment_id: string
  barber_id: string
  date: string
  status: 'present' | 'absent'
  notes?: string | null
}

export interface UpdateAttendanceRecordInput {
  status?: 'present' | 'absent'
  notes?: string | null
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
  | 'stale_appointment'
  | 'employment_has_active_bookings'
  | 'employment_not_active'
  | 'rehire_requires_owner_approval'
  | 'already_employed'
  | 'invalid_code'
  | 'verification_locked'
  | 'stale_verification'
  | 'idempotency_conflict'
  | 'conflict'
  | 'mfa_required'
  | 'capability_required'
  | 'evidence_processing'
  | 'evidence_rejected'
  | 'cooldown_active'
  | 'validation'
  | 'network'
  | 'server'
