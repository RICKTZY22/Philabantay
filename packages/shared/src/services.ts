// The data-access contract. The UI depends ONLY on these interfaces.
// Phase 1 = MockBackend; Phase 2 = SupabaseBackend. Swapping one for the other
// requires zero component changes.

import type {
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  CreateAppointmentInput,
  CompleteRoleOnboardingInput,
  ChangePasswordInput,
  CreateBugReportInput,
  SendMessageInput,
  JoinShopInput,
  RateAppointmentInput,
  ShiftChangeRequestInput,
  SignInInput,
  SignUpInput,
  UpdateProfileInput,
} from './dto'
import type {
  Appointment,
  AppointmentDetailed,
  AvailabilityOverride,
  PublicAvailabilityOverride,
  AvailabilityRule,
  Barber,
  BarberAbsence,
  BarberEmployment,
  BarberWithProfile,
  BugReport,
  ConversationDetailed,
  Message,
  Profile,
  Review,
  Service,
  ShiftChangeRequest,
  ShopWithStatus,
  HiringShop,
  BarberApplication,
  ShopJoinCodeDetails,
  Slot,
} from './types'

/** Unsubscribe handle returned by realtime subscriptions. */
export type Unsubscribe = () => void

export interface AuthService {
  signUp(input: SignUpInput): Promise<Profile>
  signIn(input: SignInInput): Promise<Profile>
  /**
   * One-time onboarding. IMPORTANT: barber/shop owner stays customer-level
   * hanggang ma-approve ng trusted server/admin process.
   */
  completeRoleOnboarding(input: CompleteRoleOnboardingInput): Promise<Profile>
  /** Update allowlisted, non-privileged profile preferences. */
  updateProfile(input: UpdateProfileInput): Promise<Profile>
  /** Re-authenticate with the current password before replacing it. */
  changePassword(input: ChangePasswordInput): Promise<void>
  signOut(): Promise<void>
  /** Current signed-in profile, or null. Resolves the persisted session. */
  getCurrentProfile(): Promise<Profile | null>
  /** Fires whenever the signed-in profile changes (login/logout). */
  onAuthChange(cb: (profile: Profile | null) => void): Unsubscribe
}

export interface SupportService {
  /** Submit a private support report for the signed-in account. */
  reportBug(input: CreateBugReportInput): Promise<BugReport>
}

export interface BarberService {
  list(): Promise<BarberWithProfile[]>
  get(barberId: string): Promise<BarberWithProfile | null>
  /** Barbers who are on shift, accepting bookings, and within effective hours now. */
  availableNow(): Promise<BarberWithProfile[]>
  /** Barber-only: toggle live on/off shift status for the signed-in barber. */
  setShiftStatus(on: boolean): Promise<Barber>
  setAcceptingBookings(accepting: boolean): Promise<Barber>
}

export interface AvailabilityService {
  getRules(barberId: string): Promise<AvailabilityRule[]>
  /** Public schedule exceptions with private notes removed. */
  getOverrides(barberId: string): Promise<PublicAvailabilityOverride[]>
  /** Barber-only view of their own exceptions, including private notes. */
  getMyOverrides(): Promise<AvailabilityOverride[]>
  /** Barber-only: replace the signed-in barber's weekly rules. */
  setRules(rules: AvailabilityRuleInput[]): Promise<AvailabilityRule[]>
  addOverride(input: AvailabilityOverrideInput): Promise<AvailabilityOverride>
  removeOverride(overrideId: string): Promise<void>
  /** Open bookable slots for a barber + service on a given ISO date (YYYY-MM-DD). */
  getOpenSlots(barberId: string, serviceId: string, date: string): Promise<Slot[]>
}

export interface ServiceCatalog {
  list(): Promise<Service[]>
}

export interface BookingService {
  create(input: CreateAppointmentInput): Promise<Appointment>
  /** Customer-only atomic move of an active appointment to a validated slot. */
  reschedule(appointmentId: string, input: CreateAppointmentInput): Promise<Appointment>
  cancel(appointmentId: string): Promise<Appointment>
  /** Appointments for the signed-in user (as customer or barber). */
  listMine(): Promise<AppointmentDetailed[]>
  /** Barber-only: set status on an appointment the barber owns. */
  setStatus(appointmentId: string, status: Appointment['status']): Promise<Appointment>
}

export interface ChatService {
  /** Conversations the signed-in user participates in, newest activity first. */
  listConversations(): Promise<ConversationDetailed[]>
  /** Find or create the customer-to-shop conversation. */
  openConversation(shopId: string): Promise<ConversationDetailed>
  getMessages(conversationId: string, limit?: number): Promise<Message[]>
  sendMessage(input: SendMessageInput): Promise<Message>
  markRead(conversationId: string): Promise<void>
  /** Realtime: fires for each new message in the conversation. */
  subscribe(conversationId: string, cb: (message: Message) => void): Unsubscribe
}

export interface ShopService {
  /** All shops with live status — the customer map's data source. */
  list(): Promise<ShopWithStatus[]>
  get(shopId: string): Promise<ShopWithStatus | null>
}

export interface FavoriteService {
  /** Shop ids na hinearted ng signed-in user. */
  list(): Promise<string[]>
  /** Toggle a shop in/out of favorites; returns the updated id list. */
  toggle(shopId: string): Promise<string[]>
  /** Barber ids saved by the signed-in customer. */
  listBarbers(): Promise<string[]>
  /** Toggle a barber favorite and return the updated barber-id list. */
  toggleBarber(barberId: string): Promise<string[]>
}

export interface ReviewService {
  /** Ratings created by the signed-in customer. */
  listMine(): Promise<Review[]>
  /** Create or update both barber and shop ratings for a completed cut. */
  rateAppointment(input: RateAppointmentInput): Promise<Review>
}

export interface BarberEmploymentService {
  /** Hiring shops shown before the barber has a shop membership. */
  listHiringShops(): Promise<HiringShop[]>
  /** Current shop derived from its registered barber membership. */
  getMyShop(): Promise<ShopWithStatus | null>
  listMyApplications(): Promise<BarberApplication[]>
  apply(shopId: string): Promise<BarberApplication>
  /** Validated shop-issued code; never expose the stored code through reads. */
  joinWithCode(input: JoinShopInput): Promise<ShopWithStatus>
  /** Shop-owner-only roster code controls. */
  getMyShopJoinCode(): Promise<ShopJoinCodeDetails | null>
  rotateMyShopJoinCode(): Promise<ShopJoinCodeDetails>
  /** Active employment record ng signed-in barber (hire date, shop stint). */
  getMyEmployment(): Promise<BarberEmployment | null>
  /** Absences scoped sa ACTIVE employment lang — fresh start per shop. */
  listMyAbsences(): Promise<BarberAbsence[]>
  /** Shift change requests scoped sa active employment, newest first. */
  listMyShiftChangeRequests(): Promise<ShiftChangeRequest[]>
  /** File a request to change one day's shift; the owner approves/denies. */
  requestShiftChange(input: ShiftChangeRequestInput): Promise<ShiftChangeRequest>
}

/** The full data layer handed to the UI through a React provider. */
export interface DataBackend {
  auth: AuthService
  barbers: BarberService
  availability: AvailabilityService
  services: ServiceCatalog
  bookings: BookingService
  chat: ChatService
  shops: ShopService
  favorites: FavoriteService
  reviews: ReviewService
  employment: BarberEmploymentService
  support: SupportService
}
