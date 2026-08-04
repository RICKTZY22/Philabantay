// Domain types. These mirror the Supabase Postgres schema and are the exact
// shapes the Express ApiBackend returns across the DataBackend contract.

/** Role na totoong may permission na. Hindi ito dapat diretso galing sa form. */
export type Role = 'customer' | 'barber' | 'shop_owner' | 'admin'

/** Public choice sa onboarding; sadyang walang admin dito. */
export type OnboardingRole = 'customer' | 'barber' | 'shop_owner'

/** Review state ng professional account request. */
export type VerificationStatus = 'unverified' | 'not_required' | 'pending' | 'verified' | 'rejected' | 'suspended'

export type CanonicalAppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'awaiting_confirmation'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'completed'
  | 'customer_no_show'
  | 'disputed'

/**
 * `pending` and `no_show` remain temporarily readable for the frontend
 * migration. New API writes use only CanonicalAppointmentStatus.
 */
export type AppointmentStatus =
  | CanonicalAppointmentStatus
  | 'pending'
  | 'no_show'

export type AppointmentEventType =
  | 'created'
  | 'accepted'
  | 'declined'
  | 'checked_in'
  | 'started'
  | 'finished'
  | 'completion_confirmed'
  | 'auto_completed'
  | 'cancelled'
  | 'customer_no_show'
  | 'disputed'
  | 'dispute_resolved'
  | 'expired'
  | 'rescheduled'
  | 'reassigned'
  | 'check_in_code_issued'
  | 'change_proposed'
  | 'change_approved'
  | 'change_rejected'
  | 'change_conflict'
  | 'delay_reported'
  | 'disruption_reported'
  | 'no_show_appealed'
  | 'no_show_appeal_resolved'
  | 'strike_waived'

export type ShiftStatus = 'off' | 'on'

/** 0 = Sunday ... 6 = Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Extends the auth user. `id` matches the auth user id. */
export interface Profile {
  id: string
  /** Granted capability. New accounts always start as customer. */
  role: Role
  /** Piniling account type; request lang ito hangga't hindi verified. */
  requested_role: OnboardingRole | null
  verification_status: VerificationStatus
  /** Incremented whenever trusted professional access is suspended/restored/promoted. */
  authorization_version: number
  onboarding_completed: boolean
  full_name: string
  /** Private sign-in/contact email. Never include this in PublicProfile. */
  email: string
  phone: string | null
  /** User-entered city/municipality label, not precise GPS coordinates. */
  location: string | null
  avatar_url: string | null
  created_at: string
}

export type BugCategory = 'visual' | 'booking' | 'map' | 'chat' | 'account' | 'other'

/** Private support report created by the signed-in user. */
export interface BugReport {
  id: string
  user_id: string
  category: BugCategory
  summary: string
  description: string
  page_url: string | null
  created_at: string
}

/** Allowlisted identity fields safe for public listings and participant joins. */
export interface PublicProfile {
  id: string
  full_name: string
  avatar_url: string | null
}

/** Barber-specific data. `id` equals the profile id (1:1). */
export interface Barber {
  id: string
  bio: string | null
  /** Aggregate customer score, updated whenever a completed cut is rated. */
  rating: number
  rating_count: number
  shift_status: ShiftStatus
  accepting_bookings: boolean
  created_at: string
}

/** A barber joined with its profile — the shape the UI usually wants. */
export interface PublicBarber {
  id: string
  bio: string | null
  rating: number
  rating_count: number
  shift_status: ShiftStatus
  accepting_bookings: boolean
  profile: PublicProfile
}

/** Backwards-compatible UI name for the public barber card shape. */
export type BarberWithProfile = PublicBarber

export interface PublicService {
  id: string
  /** Shop-scoped public catalogue relationship. */
  shop_id: string
  name: string
  duration_min: number
  price_cents: number
}

/** Backwards-compatible UI name for an active public service. */
export type Service = PublicService

/** Stored/private service row used by backend implementations. */
export interface StoredService extends PublicService {
  active: boolean
  created_at: string
  updated_at: string
}

/** Owner-only service-menu row, including inactive entries. */
export type OwnerService = StoredService

export type ServiceProviderKind = 'owner' | 'barber'

/** One shop-scoped provider together with the owner's qualification revision. */
export interface ServiceProviderQualification {
  shop_id: string
  provider_user_id: string
  provider_kind: ServiceProviderKind
  profile: PublicProfile
  /** Eligibility is still derived from owner capability or active employment. */
  eligible: boolean
  accepting_bookings: boolean
  qualification_version: number
  qualified_service_ids: string[]
}

/** Explicit owner-as-provider capability. It never changes the account role. */
export interface OwnerProviderCapability {
  shop_id: string
  owner_id: string
  active: boolean
  accepting_bookings: boolean
  rating: number
  rating_count: number
  version: number
  granted_at: string | null
  revoked_at: string | null
}

export type ServiceQualificationRequestStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'withdrawn'

/** Barber request for one service. Only the owner can turn it into a grant. */
export interface ServiceQualificationRequest {
  id: string
  shop_id: string
  service_id: string
  barber_id: string
  status: ServiceQualificationRequestStatus
  message: string | null
  version: number
  created_at: string
  resolved_at: string | null
  service: Pick<StoredService, 'id' | 'name' | 'active'>
  barber?: PublicProfile
}

export interface OwnerQualificationWorkspace {
  shop_id: string
  owner_provider: OwnerProviderCapability
  services: StoredService[]
  providers: ServiceProviderQualification[]
  requests: ServiceQualificationRequest[]
}

export interface BarberQualificationView {
  shop_id: string | null
  services: Array<Pick<StoredService, 'id' | 'name' | 'active'> & {
    qualified: boolean
    pending_request: ServiceQualificationRequest | null
  }>
}

/** Recurring weekly working block. Times are local wall-clock "HH:MM". */
export interface AvailabilityRule {
  id: string
  barber_id: string
  weekday: Weekday
  start_time: string
  end_time: string
  created_at: string
}

/** One-off exception for a specific date. Overrides weekly rules for that date. */
export interface AvailabilityOverride {
  id: string
  barber_id: string
  /** ISO date "YYYY-MM-DD" */
  date: string
  is_available: boolean
  start_time: string | null
  end_time: string | null
  reason: string | null
}

/** Public availability shape; private day-off notes never leave barber tools. */
export type PublicAvailabilityOverride = Omit<AvailabilityOverride, 'reason'>

export interface Appointment {
  id: string
  customer_id: string
  barber_id: string
  /** Shop where this appointment was made; stays correct if the barber later moves. */
  shop_id: string
  service_id: string
  /** ISO timestamp */
  starts_at: string
  /** ISO timestamp, derived from service.duration_min */
  ends_at: string
  status: AppointmentStatus
  notes: string | null
  created_at: string
  updated_at: string
  /** Optimistic concurrency token; required by lifecycle command endpoints. */
  version?: number
  /** Requested reservations stop blocking inventory after this deadline. */
  expires_at?: string | null
  /** Stored only as a hash in Postgres; clients receive just its expiry. */
  check_in_code_expires_at?: string | null
  checked_in_at?: string | null
  actual_started_at?: string | null
  actual_finished_at?: string | null
  completion_due_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancellation_reason?: string | null
  no_show_marked_at?: string | null
  no_show_marked_by?: string | null
  no_show_reason?: string | null
  dispute_opened_at?: string | null
  dispute_reason?: string | null
  /** Immutable transaction snapshot; catalog edits must not rewrite history. */
  booked_service_name?: string
  booked_duration_min?: number
  booked_price_cents?: number
  /**
   * Cleanup minutes snapshotted with the booking. The buffer never extends
   * `ends_at`; the availability engine adds it on top when testing conflicts and
   * chair occupancy.
   */
  booked_buffer_min?: number
  /** What the customer asked for, kept even when someone else was assigned. */
  barber_preference?: AppointmentBarberPreference
  requested_barber_id?: string | null
  assignment_source?: AppointmentAssignmentSource
  /** Why the assigned provider differs from the requested one, when it does. */
  assignment_reason?: string | null
  /** Policy facts frozen when the booking is created. */
  booked_timezone?: string
  booked_cancellation_cutoff_minutes?: number
  /** True when a cancel/reschedule was accepted inside the frozen cutoff. */
  late_policy_action?: boolean
  no_show_appeal_deadline?: string | null
  /** Server-computed affordances; command RPCs remain the final authority. */
  allowed_actions?: AppointmentAllowedAction[]
}

export type AppointmentAllowedAction =
  | 'accept' | 'decline' | 'cancel' | 'reschedule' | 'reassign'
  | 'propose_change' | 'respond_change' | 'issue_check_in_code' | 'check_in'
  | 'start' | 'finish' | 'confirm_completion' | 'dispute' | 'resolve_dispute'
  | 'report_delay' | 'mark_customer_no_show' | 'appeal_no_show'

/**
 * How firmly the customer is tied to one provider. `exact` is surfaced as a
 * refusal when that provider is unavailable; `preferred` and `any` may be
 * substituted, visibly and at no cost to the customer.
 */
export type AppointmentBarberPreference = 'exact' | 'preferred' | 'any'

/** Who chose the assigned provider. */
export type AppointmentAssignmentSource = 'customer' | 'owner' | 'automatic'

export interface AppointmentEvent {
  id: string
  appointment_id: string
  shop_id: string
  actor_id: string | null
  actor_role: Role | 'system'
  event_type: AppointmentEventType
  from_status: CanonicalAppointmentStatus | null
  to_status: CanonicalAppointmentStatus
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface AppointmentCheckInCode {
  appointment_id: string
  code: string
  expires_at: string
  appointment_version: number
}

export interface AppointmentDetailed extends Appointment {
  service: Service
  barber: BarberWithProfile
  customer: PublicProfile
  /** Participant-safe shop summary; owner identity and timestamps stay private. */
  shop: PublicShop
}

/** Live map-pin status. Derived, never stored: open = may bakanteng chair. */
export type ShopStatus = 'open' | 'busy' | 'closed'

/** Explicit shop fields safe for anonymous discovery. */
export interface PublicShop {
  id: string
  name: string
  /** Street-level address line shown on cards. */
  address: string
  city: string
  /** WGS84 coordinates for the map pin. */
  lat: number
  lng: number
  /** Average rating 0–5 (one decimal) over `rating_count` reviews. */
  rating: number
  rating_count: number
}

/** A stored shop row. Owner identity is private and never part of discovery. */
export interface Shop extends PublicShop {
  /** Verified owner account responsible for roster and join-code controls. */
  owner_id: string | null
  /** Barbers whose chairs live in this shop. */
  barber_ids: string[]
  created_at: string
}

/** Shop joined with live derived data — the shape the map/dashboard wants. */
export interface ShopWithStatus extends PublicShop {
  /** Active, verified barbers publicly associated with this shop. */
  barber_ids: string[]
  status: ShopStatus
  /** Barbers free to take a booking right now (subset of barber_ids). */
  available_barber_count: number
}

/** Public weekly schedule row. Internal row/shop IDs are deliberately omitted. */
export interface PublicShopHoursBlock {
  weekday: Weekday
  open_time: string | null
  close_time: string | null
  closed: boolean
  block_order: number
}

/**
 * Public date exception. The owner's free-text reason is private because it can
 * contain staffing or personal information.
 */
export interface PublicShopClosure {
  local_date: string
  closed: boolean
  replacement_open_time: string | null
  replacement_close_time: string | null
}

/** Approved public image backed by a short-lived signed object URL. */
export interface PublicShopMedia {
  id: string
  role: ShopMediaRole
  sort_order: number
  alt_text: string
  url: string
}

/**
 * Anonymous shop-detail projection. It composes only explicitly public facts;
 * owner identity, lifecycle/version fields, storage paths, private closure
 * reasons, moderation state, and internal timestamps never cross this seam.
 */
export interface PublicShopDetail extends ShopWithStatus {
  description: string | null
  public_contact_phone: string | null
  timezone: string
  booking_mode: ShopBookingMode
  chair_count: number
  default_buffer_min: number
  /** Notice the shop requires before a slot may be claimed. */
  min_lead_minutes: number
  /** How far ahead the shop takes bookings, in local days. Null means no limit. */
  max_advance_days: number | null
  operating_hours: PublicShopHoursBlock[]
  closures: PublicShopClosure[]
  services: PublicService[]
  media: PublicShopMedia[]
}

/** Publication lifecycle. Only `published` shops appear in public discovery. */
export type ShopLifecycleStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'suspended'
  | 'archived'

export type ShopBookingMode = 'manual' | 'instant'
export type ShopHiringStatus = 'off' | 'open' | 'full'

/** Owner-only hiring configuration for one shop. */
export interface OwnerShopHiring {
  shop_id: string
  status: ShopHiringStatus
  is_hiring: boolean
  /** Null means the owner has not published an exact opening count. */
  open_positions: number | null
  note: string | null
  /** Same optimistic token used by the rest of Shop Setup. */
  shop_version: number
  updated_at: string
}

/**
 * The owner's private, editable view of their own shop, including lifecycle and
 * the optimistic-concurrency version. Never exposed through public discovery.
 */
export interface OwnerShop extends PublicShop {
  owner_id: string
  lifecycle_status: ShopLifecycleStatus
  /** IANA timezone persisted per shop; local hours/closeout consume it. */
  timezone: string
  booking_mode: ShopBookingMode
  chair_count: number
  default_buffer_min: number
  min_lead_minutes: number
  max_advance_days: number | null
  description: string | null
  public_contact_phone: string | null
  published_at: string | null
  /** Optimistic concurrency token; every mutation echoes the next value. */
  version: number
  created_at: string
  updated_at: string
}

/** One weekly operating-hours block for a shop. A closed weekday has closed=true. */
export interface ShopOperatingHours {
  id: string
  shop_id: string
  weekday: Weekday
  /** Local wall-clock "HH:MM"; null on a closed weekday. */
  open_time: string | null
  close_time: string | null
  closed: boolean
  block_order: number
}

/** A date-specific override of a shop's weekly hours. */
export interface ShopClosure {
  id: string
  shop_id: string
  /** ISO date "YYYY-MM-DD". */
  local_date: string
  closed: boolean
  /** Replacement wall-clock "HH:MM" when open with different hours; null when closed. */
  replacement_open_time: string | null
  replacement_close_time: string | null
  reason: string | null
}

export type ShopMediaRole = 'storefront' | 'interior' | 'team' | 'gallery'
export type ShopMediaUploadStatus = 'awaiting_upload' | 'ready' | 'rejected' | 'deleting'
export type ShopMediaModerationStatus = 'pending' | 'approved' | 'rejected'

/** Owner-only metadata. The object itself stays in a private storage bucket. */
export interface ShopMedia {
  id: string
  shop_id: string
  role: ShopMediaRole
  sort_order: number
  alt_text: string
  upload_status: ShopMediaUploadStatus
  moderation_status: ShopMediaModerationStatus
  /** Short-lived owner preview URL, omitted while the upload is incomplete. */
  preview_url: string | null
  created_at: string
  updated_at: string
}

export type EmploymentType = 'full_time' | 'part_time' | 'chair_rental'
/** Public hiring notice attached to a published shop. */
export interface HiringListing {
  shop_id: string
  status: 'open'
  open_positions: number | null
  note: string | null
  updated_at: string
}

export interface HiringShop extends ShopWithStatus {
  hiring: HiringListing
}

export type EmploymentRequestDirection =
  | 'barber_application'
  | 'owner_invitation'
  | 'join_code'

export type EmploymentRequestStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'superseded'

export type EmploymentRequestAction = 'accept' | 'decline' | 'withdraw'

/** Opt-in profile owners may use when considering an invitation. */
export interface BarberJobProfile {
  barber_id: string
  visible: boolean
  bio: string | null
  experience_years: number | null
  specialties: string[]
  portfolio_media: string[]
  coarse_work_area: string | null
  schedule_preference: string | null
  updated_at: string
}

export interface JobSeekerProfile extends BarberJobProfile {
  full_name: string
  avatar_url: string | null
}

export interface EmploymentRequestBarber {
  id: string
  full_name: string
  avatar_url: string | null
  job_profile: BarberJobProfile | null
}

/** One converged application, owner invitation, or join-code request. */
export interface EmploymentRequest {
  id: string
  barber_id: string
  shop_id: string
  direction: EmploymentRequestDirection
  status: EmploymentRequestStatus
  message: string | null
  join_code_id: string | null
  created_by: string
  resolved_by: string | null
  expires_at: string
  resolved_at: string | null
  version: number
  created_at: string
  updated_at: string
  allowed_actions: EmploymentRequestAction[]
  shop: PublicShop
  barber: EmploymentRequestBarber
}

export type EmploymentEventType =
  | 'request_created'
  | 'request_accepted'
  | 'request_declined'
  | 'request_withdrawn'
  | 'request_expired'
  | 'request_superseded'
  | 'join_code_rotated'
  | 'join_code_revoked'

export interface EmploymentEvent {
  id: string
  request_id: string | null
  employment_id: string | null
  shop_id: string
  barber_id: string | null
  actor_id: string | null
  event_type: EmploymentEventType
  reason: string | null
  created_at: string
}

export interface EmploymentRequestDetail extends EmploymentRequest {
  events: EmploymentEvent[]
}

export interface EmploymentRequestDecision {
  request: EmploymentRequest
  employment: BarberEmployment | null
  hiring: OwnerShopHiring
}

export type BarberEmploymentStatus = 'active' | 'resigned'

/**
 * One stint at one shop. Attendance, absences, and shift change requests are
 * scoped to the ACTIVE employment record — leaving a shop closes the record
 * (ended_at) and the next shop starts a fresh history.
 */
export interface BarberEmployment {
  id: string
  barber_id: string
  shop_id: string
  status: BarberEmploymentStatus
  /** ISO date (YYYY-MM-DD) the barber joined the shop roster. */
  hired_at: string
  /** ISO date the stint ended (resigned / moved shop); null habang active. */
  ended_at: string | null
  /** Trusted actor that ended the stint; null until it has been ended. */
  ended_by: string | null
  /** Auditable reason supplied when the stint ended. */
  ended_reason: string | null
}

/** A day the barber missed a scheduled shift at their shop. */
export interface BarberAbsence {
  id: string
  barber_id: string
  shop_id: string
  /** ISO date (YYYY-MM-DD) */
  date: string
  reason: string | null
}

/** Private per-staff note inside one shop (owner tools). */
export interface StaffNote {
  id: string
  shop_id: string
  barber_id: string
  /** Sino ang sumulat — owner o ang barber mismo. */
  author_id: string
  body: string
  created_at: string
}

export type ShiftChangeRequestStatus = 'pending' | 'approved' | 'declined'

/**
 * Barber-initiated request to adjust one day's shift. The owner decides;
 * barbers never edit an assigned day directly.
 */
/** What the barber is asking for on that date. */
export type ShiftChangeRequestKind = 'time_off' | 'different_hours'

/** Whether an exception was authored by the owner or produced by an approval. */
export type ShiftExceptionSource = 'owner' | 'change_request'

export interface ShiftChangeRequest {
  id: string
  barber_id: string
  shop_id: string
  /** ISO date (YYYY-MM-DD) of the shift the barber wants changed. */
  date: string
  message: string
  status: ShiftChangeRequestStatus
  /** Optimistic-concurrency token for the owner's approve/decline decision. */
  version: number
  requested_kind: ShiftChangeRequestKind
  /** Present only when `requested_kind` is `different_hours`. */
  requested_start_time: string | null
  requested_end_time: string | null
  resolved_by: string | null
  resolved_at: string | null
  decision_note: string | null
  /** The shift exception an approval created, linking decision to schedule. */
  applied_exception_id: string | null
  created_at: string
  updated_at: string
}

/**
 * One staff member's authoritative roster. `schedule_version` is the token every
 * owner write must echo back, so two owner sessions cannot both apply stale
 * edits.
 */
export interface StaffSchedule {
  employment_id: string
  barber_id: string
  schedule_version: number
  patterns: AvailabilityRule[]
  exceptions: AvailabilityOverride[]
}

/**
 * Owner-facing composite: lahat ng kailangan ng Staff tools tungkol sa isang
 * roster member sa isang tawag. Scoped sa active employment ng barber.
 */
export interface ShopStaffMember {
  barber: BarberWithProfile
  employment: BarberEmployment
  rules: AvailabilityRule[]
  absences: BarberAbsence[]
  /** Pending muna ang unang laman; kasama rin ang na-resolve for history. */
  shiftChangeRequests: ShiftChangeRequest[]
  notes: StaffNote[]
}

export interface ShopJoinCodeDetails {
  shop: OwnerShop
  active: boolean
  expires_at: string | null
  usage_limit: number | null
  used_count: number
  remaining_uses: number | null
  version: number | null
  /** Returned only once from rotate. It is never persisted in plaintext. */
  code?: string
}

export interface Conversation {
  id: string
  customer_id: string
  /** Public chat target. Customers start conversations with a shop, not a barber. */
  shop_id: string
  /** Internal shop representative who receives/replies to the thread. */
  barber_id: string
  created_at: string
  last_message_at: string
}

export interface ConversationDetailed extends Conversation {
  customer: PublicProfile
  /** Participant-safe shop summary; owner identity and timestamps stay private. */
  shop: PublicShop
  barber: BarberWithProfile
  /** Safe thread classification; avoids exposing the shop owner's user id. */
  is_staff_thread: boolean
  last_message: Message | null
  unread_count: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  read_at: string | null
  created_at: string
}

/** A computed bookable time slot (not persisted — derived at read time). */
export interface Slot {
  /** ISO timestamp */
  starts_at: string
  /** ISO timestamp */
  ends_at: string
}

/**
 * One slot the availability engine has confirmed is claimable, attributed to the
 * provider who would take it. Every slot here passed the same gate the booking
 * command applies, so an offered slot is a bookable slot.
 */
export interface AvailabilitySlot extends Slot {
  provider_user_id: string
  /** Cleanup minutes the shop reserves after this slot. */
  buffer_min: number
}

/**
 * The engine's answer for one shop, service, and local date. `slots` is already
 * filtered to what the caller could claim, so an empty list means the day is
 * genuinely unavailable rather than unknown.
 */
export interface AvailabilityDay {
  shop_id: string
  service_id: string
  /** Local date in the shop's own timezone, not the caller's. */
  date: string
  slots: AvailabilitySlot[]
}

export type AppointmentChangeProposalStatus = 'pending' | 'approved' | 'rejected' | 'conflict' | 'expired'

export interface AppointmentChangeProposal {
  id: string
  appointment_id: string
  shop_id: string
  proposed_by: string
  proposed_by_role: 'barber' | 'shop_owner'
  status: AppointmentChangeProposalStatus
  reason: string
  original_service_id: string
  original_provider_id: string
  original_starts_at: string
  original_service_name: string
  original_duration_min: number
  original_price_cents: number
  proposed_service_id: string
  proposed_provider_id: string
  proposed_starts_at: string
  proposed_service_name: string
  proposed_duration_min: number
  proposed_price_cents: number
  proposed_buffer_min: number
  expires_at: string
  responded_at: string | null
  response_reason: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface AppointmentDelay {
  id: string
  appointment_id: string
  shop_id: string
  reported_by: string
  category: 'provider_late' | 'shop_delay' | 'previous_service' | 'other'
  estimate_minutes: number
  reason: string
  created_at: string
}

export interface AppointmentAttentionItem {
  id: string
  appointment_id: string
  shop_id: string
  disruption_batch_id: string | null
  kind: 'disruption' | 'change_conflict' | 'closeout_unresolved' | 'payment_mismatch' | 'attendance_mismatch'
  status: 'open' | 'resolved'
  reason: string
  suggested_alternatives: Array<{ provider_user_id: string; starts_at: string; ends_at: string }>
  created_at: string
  resolved_at: string | null
}

export interface NoShowAppeal {
  id: string
  appointment_id: string
  shop_id: string
  customer_id: string
  status: 'pending' | 'accepted' | 'upheld' | 'expired'
  reason: string
  evidence_note: string | null
  owner_reason: string | null
  expires_at: string
  resolved_at: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface CustomerStrikeEvent {
  id: string
  customer_id: string
  appointment_id: string
  appeal_id: string | null
  event_type: 'upheld' | 'waived' | 'corrected'
  actor_id: string | null
  reason: string
  created_at: string
}

export type WalkInStatus = 'waiting' | 'called' | 'checked_in' | 'in_service' | 'attention' | 'completed' | 'cancelled'

export interface WalkInEntry {
  id: string
  shop_id: string
  created_by: string
  customer_user_id: string | null
  service_id: string | null
  requested_barber_id: string | null
  assigned_provider_id: string | null
  display_name: string
  notes: string | null
  queue_status: WalkInStatus
  quoted_at: string
  checked_in_at: string | null
  started_at: string | null
  completed_at: string | null
  manually_verified: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface WalkInClaimCode {
  walk_in_id: string
  code: string
  expires_at: string
  walk_in_version: number
}

/** Allowlisted guest/customer view; staff-only notes and creator identity stay private. */
export type GuestWalkInVisit = Pick<WalkInEntry,
  'id' | 'shop_id' | 'customer_user_id' | 'service_id' | 'assigned_provider_id' |
  'display_name' | 'queue_status' | 'quoted_at' | 'checked_in_at' | 'started_at' |
  'completed_at' | 'manually_verified' | 'version' | 'updated_at'
>

export interface QueueEvent {
  id: string
  walk_in_id: string
  shop_id: string
  actor_id: string | null
  event_type: string
  from_status: string | null
  to_status: string
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface CashierCapability {
  shop_id: string
  user_id: string
  active: boolean
  granted_by: string
  granted_at: string
  revoked_at: string | null
}

export interface PaymentRecord {
  id: string
  appointment_id: string | null
  walk_in_id: string | null
  shop_id: string
  method: 'cash' | 'card_terminal' | 'ewallet' | 'other_offline'
  currency: string
  amount_cents: number
  status: 'recorded' | 'corrected' | 'refunded' | 'voided'
  recorded_by: string
  paid_at: string
  version: number
  created_at: string
  updated_at: string
}

export interface PaymentEvent {
  id: string
  payment_id: string
  appointment_id: string | null
  walk_in_id: string | null
  shop_id: string
  actor_id: string
  event_type: 'recorded' | 'corrected' | 'refunded' | 'voided'
  amount_delta_cents: number
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface InAppNotification {
  id: string
  outbox_id: string
  recipient_id: string
  title: string
  body: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface CloseoutRun {
  id: string
  shop_id: string
  local_date: string
  status: 'running' | 'completed' | 'failed'
  expired_count: number
  auto_completed_count: number
  attention_count: number
  started_at: string
  completed_at: string | null
}

/**
 * Advisory answer for one booking choice. The claim always rechecks the same
 * slot gate, so this prepares the review screen without reserving inventory.
 */
export interface BookingQuote {
  bookable: boolean
  /** Stable refusal label from the availability engine, or null when bookable. */
  reason: string | null
  provider_user_id: string | null
  requested_barber_id: string | null
  substituted: boolean
  service_name: string | null
  duration_min: number | null
  price_cents: number | null
  buffer_min: number | null
  starts_at: string
  ends_at: string | null
  booking_mode: ShopBookingMode
  /** May be manual at an instant shop when the customer is restricted. */
  effective_mode: ShopBookingMode
  request_expires_at: string | null
  timezone: string
  cancellation_cutoff_minutes: number
  idempotency_key: string
}

/** One customer's rating for one completed appointment. */
export interface Review {
  id: string
  appointment_id: string
  customer_id: string
  barber_id: string
  shop_id: string
  barber_rating: number
  shop_rating: number
  comment: string | null
  created_at: string
  updated_at: string
}
