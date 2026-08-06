// Request/response shapes for the data-access layer, spoken by the Express +
// Supabase ApiBackend and consumed through the DataBackend contract.

import type {
  AppointmentStatus,
  AvailabilityOverride,
  AvailabilityRule,
  BugCategory,
  OnboardingRole,
  ShiftChangeRequestKind,
  ShopMedia,
  ShopMediaRole,
  ShopOperatingHours,
  ShopHiringStatus,
  Weekday,
} from './types'

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

/** Step up an existing session to AAL2, or finish enrolling a new factor. */
export interface VerifyMfaInput {
  factor_id: string
  code: string
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
  /**
   * Required unless `barber_preference` is `any`, where the engine picks the
   * provider with the lightest local-date load.
   */
  barber_id?: string
  service_id: string
  /** ISO timestamp of the chosen slot start */
  starts_at: string
  notes?: string
  /** Defaults to `exact`, which preserves the pre-P2-07 behaviour. */
  barber_preference?: 'exact' | 'preferred' | 'any'
  /** Reused across quote, submit, and safe retries of the same booking intent. */
  idempotency_key: string
}

/** Query for the availability engine. `date` is a local date at the shop. */
export interface AvailabilityQueryInput {
  shop_id: string
  service_id: string
  date: string
  /** Narrow to one provider; omitted means every qualified provider. */
  barber_id?: string
}

/**
 * A rating is submitted against an eligibility, not against an appointment id.
 * The client cannot name the visit it wants to rate; it can only spend an
 * eligibility the database already opened for it.
 */
export interface SubmitRatingInput {
  eligibility_id: string
  barber_rating: number
  shop_rating: number
  comment?: string
  display_mode?: 'short_name' | 'anonymous'
}

export interface EditRatingInput {
  expected_version: number
  barber_rating: number
  shop_rating: number
  comment?: string
  display_mode?: 'short_name' | 'anonymous'
}

export interface PublishRatingResponseInput {
  body: string
}

export interface EditRatingResponseInput {
  expected_version: number
  body: string
}

export interface ReportRatingInput {
  /** Omit to report the review text; supply to report a public response. */
  response_id?: string
  reason_category: 'abusive' | 'spam' | 'private_information' | 'off_topic' | 'not_a_customer' | 'other'
  reason: string
}

export interface ModerateRatingReportInput {
  expected_version: number
  decision: 'hide_text' | 'restore_text' | 'reject'
  reason: string
}

export interface OpenAppointmentDisputeInput {
  expected_version: number
  reason: string
  /** Optional safe text evidence. V1 has no attachments. */
  evidence_note?: string
}

export interface DecideAppointmentDisputeInput {
  expected_version: number
  decision: 'completed' | 'cancelled'
  reason: string
}

export interface RespondToDisputeDecisionInput {
  expected_version: number
  response: 'accept' | 'escalate'
  /** Required when escalating. */
  reason?: string
}

export interface CaseVersionInput {
  expected_version: number
}

export interface CaseReasonInput {
  expected_version: number
  reason: string
}

export interface AddCaseEvidenceInput {
  note: string
  visibility?: 'case' | 'admin_only'
}

export interface ResolveSupportCaseInput {
  expected_version: number
  resolution: 'upheld_owner' | 'overturned_owner' | 'no_action'
  reason: string
  /** Required when overturning: the corrected final visit status. */
  corrected_status?: 'completed' | 'cancelled'
}

export interface EscalateRatingReportInput {
  expected_version: number
  reason: string
}

/** Q15's support half: a moderator reopens or closes a review's edit window. */
export interface SetRatingEditWindowInput {
  expected_version: number
  editable_until: string
  reason: string
}

export interface SendMessageInput {
  conversation_id: string
  body: string
}

export interface CreateBarberApplicationInput {
  direction: 'barber_application'
  shop_id: string
  message?: string | null
  idempotency_key: string
}

export interface CreateOwnerInvitationInput {
  direction: 'owner_invitation'
  barber_id: string
  message?: string | null
  idempotency_key: string
}

export type CreateEmploymentRequestInput =
  | CreateBarberApplicationInput
  | CreateOwnerInvitationInput

export interface CreateJoinCodeRequestInput {
  code: string
  message?: string | null
  idempotency_key: string
}

export interface ResolveEmploymentRequestInput {
  expected_version: number
  reason?: string | null
}

export interface UpdateBarberJobProfileInput {
  visible: boolean
  bio?: string | null
  experience_years?: number | null
  specialties: string[]
  portfolio_media: string[]
  coarse_work_area?: string | null
  schedule_preference?: string | null
}

export interface RotateShopJoinCodeInput {
  command_id: string
  expires_in_days: number
  usage_limit: number
}

export interface RevokeShopJoinCodeInput {
  expected_version: number
  reason: string
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
  kind: ShiftChangeRequestKind
  /** Required when `kind` is `different_hours`, omitted for `time_off`. */
  start_time?: string | null
  end_time?: string | null
  /** Replay-safe key; the same key never creates a second request. */
  idempotency_key: string
}

/** Owner replaces one staff member's whole weekly roster. */
export interface ReplaceStaffShiftsInput {
  expected_version: number
  blocks: AvailabilityRuleInput[]
}

/** Owner authors or overwrites one dated exception for a staff member. */
export interface UpsertStaffShiftExceptionInput {
  expected_version: number
  date: string
  is_available: boolean
  start_time?: string | null
  end_time?: string | null
  reason?: string | null
}

export interface RemoveStaffShiftExceptionInput {
  expected_version: number
}

/** Result of any owner schedule write: the new token plus the affected rows. */
export interface StaffScheduleWriteResult {
  schedule_version: number
  patterns?: AvailabilityRule[]
  exception?: AvailabilityOverride | null
  removed_id?: string
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

export interface RescheduleAppointmentInput extends Omit<CreateAppointmentInput, 'idempotency_key'>, AppointmentVersionInput {}

export interface ResolveAppointmentDisputeInput extends AppointmentReasonInput {
  resolution: 'completed' | 'cancelled'
}

export interface CreateAppointmentChangeProposalInput extends AppointmentVersionInput {
  service_id: string
  provider_id: string
  starts_at: string
  reason: string
  expires_at: string
}

export interface RespondAppointmentChangeProposalInput {
  expected_proposal_version: number
  expected_appointment_version: number
  decision: 'approve' | 'reject'
  reason?: string
}

export interface ReportAppointmentDelayInput extends AppointmentVersionInput {
  category: 'provider_late' | 'shop_delay' | 'previous_service' | 'other'
  estimate_minutes: number
  reason: string
}

export interface CreateNoShowAppealInput {
  reason: string
  evidence_note?: string
}

export interface ResolveNoShowAppealInput {
  expected_version: number
  resolution: 'accepted' | 'upheld'
  reason: string
}

export interface CreateWalkInInput {
  display_name: string
  service_id?: string
  requested_barber_id?: string
  notes?: string
}

export interface WalkInVersionInput {
  expected_version: number
}

export interface TransitionWalkInInput extends WalkInVersionInput {
  action: 'call' | 'check_in' | 'start' | 'complete' | 'attention' | 'cancel'
  provider_id?: string
  reason?: string
}

export interface ClaimWalkInInput {
  code: string
  phone: string
}

export interface SetCashierCapabilityInput {
  active: boolean
}

export interface RecordOfflinePaymentInput {
  appointment_id?: string
  walk_in_id?: string
  method: 'cash' | 'card_terminal' | 'ewallet' | 'other_offline'
  currency: string
  amount_cents: number
  paid_at: string
  idempotency_key: string
}

export interface ChangeOfflinePaymentInput extends AppointmentVersionInput {
  action: 'correct' | 'refund' | 'void'
  amount_cents: number
  reason: string
}

/**
 * Owner decision on a barber request. `expected_version` makes the decision
 * stale-safe; approving applies the schedule change in the same transaction.
 */
export interface ResolveShiftChangeRequestInput {
  expected_version: number
  decision: 'approve' | 'decline'
  note?: string | null
}

export interface ResolveShiftChangeRequestResult {
  request_id: string
  status: 'approved' | 'declined'
  /** The exception an approval created; null on decline. */
  exception_id: string | null
  schedule_version: number
}

export interface OpenConversationInput {
  shop_id: string
  /** Optional booking context, so a thread can say which visit it is about. */
  appointment_id?: string
  /**
   * Reach a specific active provider instead of the shop's longest-serving one.
   * Refused if that barber is not currently active at the shop.
   */
  barber_id?: string
}

export interface BlockConversationPeerInput {
  blocked: boolean
  reason?: string
}

export interface ReportConversationInput {
  message_id?: string
  reason_category: 'abusive' | 'spam' | 'scam' | 'private_information' | 'off_platform_payment' | 'other'
  reason: string
}

export interface OpenStaffConversationInput {
  barber_id: string
}

/**
 * There is deliberately no field for mandatory transactional notices. They cannot
 * be switched off, so offering a parameter for them would be a lie in the shape of
 * an API.
 */
export interface NotificationPreferencesInput {
  /** Omit on first save; supplied afterwards so two devices cannot silently race. */
  expected_version?: number
  booking_reminders: boolean
  chat_notifications: boolean
  email_updates: boolean
  nearby_alerts: boolean
  nearby_radius_km?: number
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  language?: 'en' | 'fil'
  text_size?: 'default' | 'large' | 'larger'
  high_contrast?: boolean
  reduce_motion?: boolean
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

/** P2-02 owner service editor: the shop is inferred from the signed-in owner. */
export interface OwnerServiceInput {
  name: string
  duration_min: number
  price_cents: number
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
  min_lead_minutes?: number
  /** Null means no booking horizon. */
  max_advance_days?: number | null
}

/** Editable fields plus the version the client believes it is changing. */
export type UpdateOwnerShopInput = Partial<CreateOwnerShopInput> & {
  expected_version: number
}

/** Version-guarded body for publish/unpublish lifecycle commands. */
export interface ShopVersionInput {
  expected_version: number
}

/** Versioned owner-as-provider capability command. */
export interface UpdateOwnerProviderCapabilityInput {
  expected_version: number
  active: boolean
  accepting_bookings: boolean
  reason: string
  command_id: string
}

/** Replace the complete qualification set for one eligible shop provider. */
export interface SetProviderQualificationsInput {
  provider_user_id: string
  expected_version: number
  service_ids: string[]
  reason: string
  command_id: string
}

/** Barber asks the current shop owner for one service qualification. */
export interface CreateServiceQualificationRequestInput {
  service_id: string
  message?: string | null
  idempotency_key: string
}

export interface ResolveServiceQualificationRequestInput {
  expected_version: number
  reason?: string | null
}

/** Version-checked owner command for the canonical off/open/full hiring state. */
export interface UpdateShopHiringInput {
  expected_version: number
  status: ShopHiringStatus
  /** Optional only while open; null means the count is intentionally unknown. */
  open_positions?: number | null
  note?: string | null
}

/** One weekday block in a replace-all hours update. */
export interface ShopHoursBlockInput {
  weekday: Weekday
  open_time?: string | null
  close_time?: string | null
  closed?: boolean
  block_order?: number
}

/** Replace-all weekly operating hours for the owner's shop. */
export interface SetShopHoursInput {
  expected_version: number
  blocks: ShopHoursBlockInput[]
}

export interface SetShopHoursResult {
  shop_version: number
  hours: ShopOperatingHours[]
}

/** Create or update (upsert by date) one shop closure / replacement-hours day. */
export interface CreateShopClosureInput {
  local_date: string
  closed?: boolean
  replacement_open_time?: string | null
  replacement_close_time?: string | null
  reason?: string | null
}

export interface RequestShopMediaUploadInput {
  filename: string
  declared_mime: 'image/jpeg' | 'image/png' | 'image/webp'
  declared_size_bytes: number
  role: ShopMediaRole
  alt_text: string
  sort_order?: number
}

export interface ShopMediaUploadGrant {
  media: ShopMedia
  upload_url: string
  headers: Record<string, string>
  expires_at: string
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
  | 'already_requested'
  | 'request_already_resolved'
  | 'hiring_full'
  | 'invalid_code'
  | 'join_code_rate_limited'
  | 'verification_locked'
  | 'stale_verification'
  | 'idempotency_conflict'
  | 'conflict'
  | 'mfa_required'
  | 'capability_required'
  | 'evidence_processing'
  | 'evidence_rejected'
  | 'media_processing'
  | 'media_rejected'
  | 'media_limit'
  | 'schedule_has_active_bookings'
  | 'cooldown_active'
  // P2-07 availability engine. Each names one reason a slot cannot be claimed,
  // so a client can explain the refusal instead of showing a generic failure.
  // They must also appear in API_ERROR_CODES: ApiBackend drops any code missing
  // from that allowlist and falls back by HTTP status, which for these 409s
  // means every one of them would arrive indistinguishable as `validation`.
  | 'chairs_unavailable'
  | 'shop_not_bookable'
  | 'outside_shop_hours'
  | 'outside_booking_window'
  | 'provider_not_qualified'
  | 'no_provider_available'
  // Distinct from `conflict`, which means "reload and retry". This one means a
  // requirement is unmet and reloading changes nothing. See D-030.
  | 'precondition_failed'
  | 'validation'
  | 'network'
  | 'server'
