// Domain types — these mirror the Supabase Postgres schema (Phase 2).
// The mock data layer (Phase 1) produces these exact shapes so the swap is transparent.

/** Role na totoong may permission na. Hindi ito dapat diretso galing sa form. */
export type Role = 'customer' | 'barber' | 'shop_owner' | 'admin'

/** Public choice sa onboarding; sadyang walang admin dito. */
export type OnboardingRole = 'customer' | 'barber' | 'shop_owner'

/** Review state ng professional account request. */
export type VerificationStatus = 'unverified' | 'not_required' | 'pending' | 'verified' | 'rejected' | 'suspended'

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'

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
export interface BarberWithProfile extends Barber {
  profile: PublicProfile
}

export interface Service {
  id: string
  name: string
  duration_min: number
  price_cents: number
  active: boolean
  created_at: string
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
  service_id: string
  /** ISO timestamp */
  starts_at: string
  /** ISO timestamp, derived from service.duration_min */
  ends_at: string
  status: AppointmentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface AppointmentDetailed extends Appointment {
  service: Service
  barber: BarberWithProfile
  customer: PublicProfile
  shop: Shop
}

/** Live map-pin status. Derived, never stored: open = may bakanteng chair. */
export type ShopStatus = 'open' | 'busy' | 'closed'

/** A physical barbershop location. Mirrors the Phase 2 `shops` table. */
export interface Shop {
  id: string
  /** Verified owner account responsible for roster and join-code controls. */
  owner_id: string | null
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
  /** Barbers whose chairs live in this shop. */
  barber_ids: string[]
  created_at: string
}

/** Shop joined with live derived data — the shape the map/dashboard wants. */
export interface ShopWithStatus extends Shop {
  status: ShopStatus
  /** Barbers free to take a booking right now (subset of barber_ids). */
  available_barber_count: number
}

export type EmploymentType = 'full_time' | 'part_time' | 'chair_rental'
export type BarberApplicationStatus = 'pending' | 'accepted' | 'declined'

/** Public hiring notice attached to a shop. Join codes are intentionally absent. */
export interface HiringListing {
  shop_id: string
  role_title: string
  employment_type: EmploymentType
  requirements: string[]
  open_positions: number
  accepting_applications: boolean
  updated_at: string
}

export interface HiringShop extends ShopWithStatus {
  hiring: HiringListing
}

/** A barber's application; approval is controlled by the shop in production. */
export interface BarberApplication {
  id: string
  barber_id: string
  shop_id: string
  status: BarberApplicationStatus
  created_at: string
  updated_at: string
}

/**
 * One stint at one shop. Attendance, absences, and shift change requests are
 * scoped to the ACTIVE employment record — leaving a shop closes the record
 * (ended_at) and the next shop starts a fresh history.
 */
export interface BarberEmployment {
  id: string
  barber_id: string
  shop_id: string
  /** ISO date (YYYY-MM-DD) the barber joined the shop roster. */
  hired_at: string
  /** ISO date the stint ended (resigned / moved shop); null habang active. */
  ended_at: string | null
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

export type ShiftChangeRequestStatus = 'pending' | 'approved' | 'declined'

/**
 * Barber-initiated request to adjust one day's shift. The owner decides;
 * barbers never edit an assigned day directly.
 */
export interface ShiftChangeRequest {
  id: string
  barber_id: string
  shop_id: string
  /** ISO date (YYYY-MM-DD) of the shift the barber wants changed. */
  date: string
  message: string
  status: ShiftChangeRequestStatus
  created_at: string
  updated_at: string
}

export interface ShopJoinCodeDetails {
  shop: ShopWithStatus
  code: string
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
  shop: Shop
  barber: BarberWithProfile
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
