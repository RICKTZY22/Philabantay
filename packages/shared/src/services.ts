// The data-access contract. The UI depends ONLY on these interfaces.
// Phase 1 = MockBackend; Phase 2 = SupabaseBackend. Swapping one for the other
// requires zero component changes.

import type {
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  CreateAppointmentInput,
  CompleteRoleOnboardingInput,
  SendMessageInput,
  SignInInput,
  SignUpInput,
} from './dto'
import type {
  Appointment,
  AppointmentDetailed,
  AvailabilityOverride,
  AvailabilityRule,
  Barber,
  BarberWithProfile,
  ConversationDetailed,
  Message,
  Profile,
  Service,
  ShopWithStatus,
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
  signOut(): Promise<void>
  /** Current signed-in profile, or null. Resolves the persisted session. */
  getCurrentProfile(): Promise<Profile | null>
  /** Fires whenever the signed-in profile changes (login/logout). */
  onAuthChange(cb: (profile: Profile | null) => void): Unsubscribe
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
  getOverrides(barberId: string): Promise<AvailabilityOverride[]>
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
  /** Find or create the 1:1 conversation between the signed-in customer and a barber. */
  openConversation(barberId: string): Promise<ConversationDetailed>
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
}
