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
  phone: string | null
  avatar_url: string | null
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
}

/** Live map-pin status. Derived, never stored: open = may bakanteng chair. */
export type ShopStatus = 'open' | 'busy' | 'closed'

/** A physical barbershop location. Mirrors the Phase 2 `shops` table. */
export interface Shop {
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

export interface Conversation {
  id: string
  customer_id: string
  barber_id: string
  created_at: string
  last_message_at: string
}

export interface ConversationDetailed extends Conversation {
  customer: PublicProfile
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
