// The data-access contract. The UI depends ONLY on these interfaces.
// Phase 1 = MockBackend; Phase 2 = Express-backed ApiBackend. Swapping either
// requires zero component changes.

import type {
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  AppointmentReasonInput,
  AppointmentVersionInput,
  CheckInAppointmentInput,
  CreateAppointmentInput,
  CompleteRoleOnboardingInput,
  ChangePasswordInput,
  CreateBugReportInput,
  SendMessageInput,
  JoinShopInput,
  RateAppointmentInput,
  ReassignAppointmentInput,
  RescheduleAppointmentInput,
  ResolveAppointmentDisputeInput,
  ShiftChangeRequestInput,
  SignInInput,
  SignUpInput,
  StaffNoteInput,
  UpdateProfileInput,
} from './dto'
import { DataError } from './dto'
import type {
  Appointment,
  AppointmentCheckInCode,
  AppointmentDetailed,
  AppointmentEvent,
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
  ShiftChangeRequestStatus,
  ShopStaffMember,
  ShopWithStatus,
  HiringShop,
  HiringListing,
  BarberApplication,
  ShopJoinCodeDetails,
  Slot,
  StaffNote,
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
  /** Owner-only: every booking made at the signed-in owner's shop. */
  listForMyShop(): Promise<AppointmentDetailed[]>
  /** Barber manages assigned work; the shop owner may confirm/decline pending reservations. */
  setStatus(appointmentId: string, status: Appointment['status']): Promise<Appointment>
  /** Versioned lifecycle commands used by the API-backed UI. */
  accept(appointmentId: string, input: AppointmentVersionInput): Promise<Appointment>
  decline(appointmentId: string, input: AppointmentReasonInput): Promise<Appointment>
  issueCheckInCode(appointmentId: string, input: AppointmentVersionInput): Promise<AppointmentCheckInCode>
  checkIn(appointmentId: string, input: CheckInAppointmentInput): Promise<Appointment>
  start(appointmentId: string, input: AppointmentVersionInput): Promise<Appointment>
  finish(appointmentId: string, input: AppointmentVersionInput): Promise<Appointment>
  confirmCompletion(appointmentId: string, input: AppointmentVersionInput): Promise<Appointment>
  dispute(appointmentId: string, input: AppointmentReasonInput): Promise<Appointment>
  cancelWithReason(appointmentId: string, input: AppointmentReasonInput): Promise<Appointment>
  markCustomerNoShow(appointmentId: string, input: AppointmentReasonInput): Promise<Appointment>
  resolveDispute(appointmentId: string, input: ResolveAppointmentDisputeInput): Promise<Appointment>
  reassign(appointmentId: string, input: ReassignAppointmentInput): Promise<Appointment>
  rescheduleWithVersion(appointmentId: string, input: RescheduleAppointmentInput): Promise<Appointment>
  timeline(appointmentId: string): Promise<AppointmentEvent[]>
}

export interface ChatService {
  /** Conversations the signed-in user participates in, newest activity first. */
  listConversations(): Promise<ConversationDetailed[]>
  /** Find or create the customer-to-shop conversation. */
  openConversation(shopId: string): Promise<ConversationDetailed>
  /**
   * Owner-only: find or create an internal owner-to-barber thread sa sariling
   * shop. Ang "customer" participant ng thread ay ang owner (detectable via
   * conversation.customer_id === shop.owner_id).
   */
  openStaffConversation(barberId: string): Promise<ConversationDetailed>
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
  /** Owner-only: bawat roster member with shifts, absences, requests, notes. */
  listMyShopStaff(): Promise<ShopStaffMember[]>
  /** Owner-only: direktang i-edit ang weekly shifts ng isang roster member. */
  setBarberRules(barberId: string, rules: AvailabilityRuleInput[]): Promise<AvailabilityRule[]>
  /** Owner-only: approve or decline a barber's shift change request. */
  resolveShiftChangeRequest(requestId: string, status: Exclude<ShiftChangeRequestStatus, 'pending'>): Promise<ShiftChangeRequest>
  /** Owner-only: attach a note to one staff member. */
  addStaffNote(input: StaffNoteInput): Promise<StaffNote>
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

interface ApiSession {
  access_token: string
  refresh_token: string
  expires_at?: number
}

interface ApiAuthPayload {
  profile: Profile
  session: ApiSession | null
}

interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  authenticated?: boolean
  retryAfterRefresh?: boolean
}

interface MessageSubscription {
  callbacks: Set<(message: Message) => void>
  seenIds: Set<string>
  initialized: boolean
  polling: boolean
  timer: ReturnType<typeof setInterval>
}

export interface ApiBackendOptions {
  /** Full versioned URL, for example http://127.0.0.1:4000/api/v1. */
  baseUrl: string
  fetch?: typeof fetch
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  chatPollIntervalMs?: number
}

const API_SESSION_KEY = 'philabantay.api.session.v1'
const API_ERROR_CODES = new Set([
  'invalid_credentials',
  'email_taken',
  'not_authenticated',
  'forbidden',
  'not_found',
  'slot_taken',
  'stale_appointment',
  'validation',
] as const)

function encoded(value: string): string {
  return encodeURIComponent(value)
}

function normalizeRule(rule: AvailabilityRule): AvailabilityRule {
  return { ...rule, start_time: rule.start_time.slice(0, 5), end_time: rule.end_time.slice(0, 5) }
}

function normalizeOverride<T extends PublicAvailabilityOverride | AvailabilityOverride>(override: T): T {
  return {
    ...override,
    start_time: override.start_time?.slice(0, 5) ?? null,
    end_time: override.end_time?.slice(0, 5) ?? null,
  }
}

/**
 * HTTP implementation of DataBackend. It owns only the user's Supabase access
 * and refresh tokens; the privileged Supabase key remains inside apps/api.
 */
export class ApiBackend implements DataBackend {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  private readonly chatPollIntervalMs: number
  private readonly authListeners = new Set<(profile: Profile | null) => void>()
  private readonly messageSubscriptions = new Map<string, MessageSubscription>()
  private session: ApiSession | null
  private currentProfile: Profile | null = null
  private refreshPromise: Promise<boolean> | null = null

  constructor(options: ApiBackendOptions) {
    const baseUrl = options.baseUrl.trim().replace(/\/+$/, '')
    if (!baseUrl) throw new Error('ApiBackend requires a non-empty baseUrl.')
    this.baseUrl = baseUrl
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.storage = options.storage === undefined
      ? (typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage)
      : options.storage
    this.chatPollIntervalMs = Math.max(1_000, options.chatPollIntervalMs ?? 3_000)
    this.session = this.readSession()
  }

  private readSession(): ApiSession | null {
    try {
      const stored = this.storage?.getItem(API_SESSION_KEY)
      if (!stored) return null
      const parsed = JSON.parse(stored) as Partial<ApiSession>
      return typeof parsed.access_token === 'string' && typeof parsed.refresh_token === 'string'
        ? { access_token: parsed.access_token, refresh_token: parsed.refresh_token, expires_at: parsed.expires_at }
        : null
    } catch {
      return null
    }
  }

  private saveSession(session: ApiSession | null): void {
    this.session = session
    try {
      if (session) this.storage?.setItem(API_SESSION_KEY, JSON.stringify(session))
      else this.storage?.removeItem(API_SESSION_KEY)
    } catch {
      // A blocked storage API still permits an in-memory session for this tab.
    }
  }

  private emitAuth(profile: Profile | null): void {
    this.currentProfile = profile
    for (const callback of this.authListeners) callback(profile)
  }

  private clearAuth(): void {
    this.saveSession(null)
    this.emitAuth(null)
  }

  private toDataError(response: Response, payload: ApiErrorPayload | null): DataError {
    const serverCode = payload?.error?.code
    const code = serverCode && API_ERROR_CODES.has(serverCode as never)
      ? serverCode as ConstructorParameters<typeof DataError>[0]
      : response.status === 401
        ? 'not_authenticated'
        : response.status === 403
          ? 'forbidden'
          : response.status === 404
            ? 'not_found'
            : response.status >= 500
              ? 'server'
              : 'validation'
    return new DataError(code, payload?.error?.message ?? `API request failed (${response.status}).`)
  }

  private async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const authenticated = options.authenticated ?? true
    const token = this.session?.access_token
    if (authenticated && !token) throw new DataError('not_authenticated', 'Please sign in to continue.')

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
    } catch {
      throw new DataError('network', 'Cannot reach the Philabantay API. Check your connection and try again.')
    }

    if (response.status === 401 && authenticated && options.retryAfterRefresh !== false && await this.refreshAccessToken()) {
      return this.request<T>(path, { ...options, retryAfterRefresh: false })
    }

    const text = response.status === 204 ? '' : await response.text()
    let payload: ({ data?: T } & ApiErrorPayload) | null = null
    if (text) {
      try {
        payload = JSON.parse(text) as { data?: T } & ApiErrorPayload
      } catch {
        if (!response.ok) throw new DataError('server', 'The API returned an invalid response.')
      }
    }
    if (!response.ok) {
      if (response.status === 401 && authenticated) this.clearAuth()
      throw this.toDataError(response, payload)
    }
    return payload?.data as T
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.session?.refresh_token) return false
    if (this.refreshPromise) return this.refreshPromise
    const refreshToken = this.session.refresh_token
    this.refreshPromise = (async () => {
      try {
        const data = await this.request<{ session: ApiSession }>('/auth/refresh', {
          method: 'POST',
          body: { refresh_token: refreshToken },
          authenticated: false,
          retryAfterRefresh: false,
        })
        this.saveSession(data.session)
        return true
      } catch {
        this.clearAuth()
        return false
      } finally {
        this.refreshPromise = null
      }
    })()
    return this.refreshPromise
  }

  private async ownedShop(): Promise<ShopWithStatus> {
    const profile = this.currentProfile ?? await this.auth.getCurrentProfile()
    if (!profile) throw new DataError('not_authenticated', 'Please sign in to continue.')
    const shop = (await this.shops.list()).find((candidate) => candidate.owner_id === profile.id)
    if (!shop) throw new DataError('not_found', 'No shop is assigned to this owner account.')
    return shop
  }

  private async hydrateAppointments(rows: AppointmentDetailed[]): Promise<AppointmentDetailed[]> {
    const shops = new Map((await this.shops.list()).map((shop) => [shop.id, shop]))
    return rows.map((row) => ({ ...row, shop: shops.get(row.shop_id) ?? row.shop }))
  }

  private async hydrateConversation(row: ConversationDetailed): Promise<ConversationDetailed> {
    const shop = await this.shops.get(row.shop_id)
    return {
      ...row,
      shop: shop ?? row.shop,
      last_message: row.last_message ?? null,
      unread_count: Number(row.unread_count ?? 0),
    }
  }

  private async hydrateConversations(rows: ConversationDetailed[]): Promise<ConversationDetailed[]> {
    const shops = new Map((await this.shops.list()).map((shop) => [shop.id, shop]))
    return rows.map((row) => ({
      ...row,
      shop: shops.get(row.shop_id) ?? row.shop,
      last_message: row.last_message ?? null,
      unread_count: Number(row.unread_count ?? 0),
    }))
  }

  private emitMessage(message: Message): void {
    const subscription = this.messageSubscriptions.get(message.conversation_id)
    if (!subscription || subscription.seenIds.has(message.id)) return
    subscription.seenIds.add(message.id)
    for (const callback of subscription.callbacks) callback(message)
  }

  private async pollMessages(conversationId: string, subscription: MessageSubscription): Promise<void> {
    if (subscription.polling) return
    subscription.polling = true
    try {
      const messages = await this.request<Message[]>(`/conversations/${encoded(conversationId)}/messages?limit=100`)
      if (!subscription.initialized) {
        for (const message of messages) subscription.seenIds.add(message.id)
        subscription.initialized = true
        return
      }
      for (const message of messages) this.emitMessage(message)
    } catch {
      // The normal page request displays connectivity/auth errors; polling retries.
    } finally {
      subscription.polling = false
    }
  }

  readonly auth: AuthService = {
    signUp: async (input) => {
      const data = await this.request<ApiAuthPayload>('/auth/signup', { method: 'POST', body: input, authenticated: false })
      this.saveSession(data.session)
      this.emitAuth(data.session ? data.profile : null)
      return data.profile
    },
    signIn: async (input) => {
      const data = await this.request<ApiAuthPayload>('/auth/signin', { method: 'POST', body: input, authenticated: false })
      if (!data.session) throw new DataError('not_authenticated', 'Sign-in did not create a session.')
      this.saveSession(data.session)
      this.emitAuth(data.profile)
      return data.profile
    },
    completeRoleOnboarding: async (input) => {
      const profile = await this.request<Profile>('/auth/onboarding', { method: 'POST', body: input })
      this.emitAuth(profile)
      return profile
    },
    updateProfile: async (input) => {
      const profile = await this.request<Profile>('/auth/profile', { method: 'PATCH', body: input })
      this.emitAuth(profile)
      return profile
    },
    changePassword: (input) => this.request<void>('/auth/password', { method: 'POST', body: input }),
    signOut: async () => {
      try {
        await this.request<void>('/auth/signout', { method: 'POST' })
      } finally {
        this.clearAuth()
      }
    },
    getCurrentProfile: async () => {
      if (!this.session) return null
      if (this.currentProfile) return this.currentProfile
      try {
        const profile = await this.request<Profile>('/auth/me')
        this.emitAuth(profile)
        return profile
      } catch (error) {
        if (error instanceof DataError && error.code === 'not_authenticated') return null
        throw error
      }
    },
    onAuthChange: (callback) => {
      this.authListeners.add(callback)
      return () => this.authListeners.delete(callback)
    },
  }

  readonly support: SupportService = {
    reportBug: (input) => this.request<BugReport>('/support/bug-reports', { method: 'POST', body: input }),
  }

  readonly barbers: BarberService = {
    list: () => this.request<BarberWithProfile[]>('/barbers'),
    get: (barberId) => this.request<BarberWithProfile | null>(`/barbers/${encoded(barberId)}`),
    availableNow: () => this.request<BarberWithProfile[]>('/barbers/available'),
    setShiftStatus: (on) => this.request<Barber>('/barbers/me/shift-status', { method: 'PATCH', body: { on } }),
    setAcceptingBookings: (accepting) => this.request<Barber>('/barbers/me/accepting-bookings', { method: 'PATCH', body: { accepting } }),
  }

  readonly availability: AvailabilityService = {
    getRules: async (barberId) => (await this.request<AvailabilityRule[]>(`/barbers/${encoded(barberId)}/shifts/patterns`)).map(normalizeRule),
    getOverrides: async (barberId) => (await this.request<PublicAvailabilityOverride[]>(`/barbers/${encoded(barberId)}/shifts/exceptions`)).map(normalizeOverride),
    getMyOverrides: async () => (await this.request<AvailabilityOverride[]>('/shifts/exceptions/me')).map(normalizeOverride),
    setRules: async (rules) => (await this.request<AvailabilityRule[]>('/shifts/patterns', { method: 'PUT', body: rules })).map(normalizeRule),
    addOverride: async (input) => normalizeOverride(await this.request<AvailabilityOverride>('/shifts/exceptions', { method: 'POST', body: input })),
    removeOverride: (overrideId) => this.request<void>(`/shifts/exceptions/${encoded(overrideId)}`, { method: 'DELETE' }),
    getOpenSlots: (barberId, serviceId, date) => {
      const query = new URLSearchParams({ barberId, serviceId, date })
      return this.request<Slot[]>(`/availability/slots?${query}`)
    },
  }

  readonly services: ServiceCatalog = {
    list: () => this.request<Service[]>('/services'),
  }

  readonly bookings: BookingService = {
    create: (input) => this.request<Appointment>('/bookings', { method: 'POST', body: input }),
    reschedule: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}`, { method: 'PATCH', body: input }),
    cancel: (appointmentId) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/cancel`, { method: 'POST' }),
    listMine: async () => this.hydrateAppointments(await this.request<AppointmentDetailed[]>('/bookings')),
    listForMyShop: async () => {
      const shop = await this.ownedShop()
      return this.hydrateAppointments(await this.request<AppointmentDetailed[]>(`/shops/${encoded(shop.id)}/bookings`))
    },
    setStatus: (appointmentId, status) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/status`, { method: 'PATCH', body: { status } }),
    accept: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/accept`, { method: 'POST', body: input }),
    decline: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/decline`, { method: 'POST', body: input }),
    issueCheckInCode: (appointmentId, input) => this.request<AppointmentCheckInCode>(`/bookings/${encoded(appointmentId)}/check-in-code`, { method: 'POST', body: input }),
    checkIn: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/check-in`, { method: 'POST', body: input }),
    start: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/start`, { method: 'POST', body: input }),
    finish: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/finish`, { method: 'POST', body: input }),
    confirmCompletion: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/confirm-completion`, { method: 'POST', body: input }),
    dispute: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/dispute`, { method: 'POST', body: input }),
    cancelWithReason: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/cancel`, { method: 'POST', body: input }),
    markCustomerNoShow: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/no-show`, { method: 'POST', body: input }),
    resolveDispute: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/resolve-dispute`, { method: 'POST', body: input }),
    reassign: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}/reassign`, { method: 'POST', body: input }),
    rescheduleWithVersion: (appointmentId, input) => this.request<Appointment>(`/bookings/${encoded(appointmentId)}`, { method: 'PATCH', body: input }),
    timeline: (appointmentId) => this.request<AppointmentEvent[]>(`/bookings/${encoded(appointmentId)}/timeline`),
  }

  readonly chat: ChatService = {
    listConversations: async () => this.hydrateConversations(await this.request<ConversationDetailed[]>('/conversations')),
    openConversation: async (shopId) => this.hydrateConversation(await this.request<ConversationDetailed>('/conversations', { method: 'POST', body: { shop_id: shopId } })),
    openStaffConversation: async (barberId) => this.hydrateConversation(await this.request<ConversationDetailed>('/conversations/staff', { method: 'POST', body: { barber_id: barberId } })),
    getMessages: (conversationId, limit = 100) => this.request<Message[]>(`/conversations/${encoded(conversationId)}/messages?limit=${Math.max(1, Math.min(100, limit))}`),
    sendMessage: async (input) => {
      const message = await this.request<Message>('/messages', { method: 'POST', body: input })
      this.emitMessage(message)
      return message
    },
    markRead: (conversationId) => this.request<void>(`/conversations/${encoded(conversationId)}/read`, { method: 'POST' }),
    subscribe: (conversationId, callback) => {
      let subscription = this.messageSubscriptions.get(conversationId)
      if (!subscription) {
        const created: MessageSubscription = {
          callbacks: new Set(),
          seenIds: new Set(),
          initialized: false,
          polling: false,
          timer: globalThis.setInterval(() => {
            const current = this.messageSubscriptions.get(conversationId)
            if (current) void this.pollMessages(conversationId, current)
          }, this.chatPollIntervalMs),
        }
        this.messageSubscriptions.set(conversationId, created)
        void this.pollMessages(conversationId, created)
        subscription = created
      }
      subscription.callbacks.add(callback)
      return () => {
        const current = this.messageSubscriptions.get(conversationId)
        if (!current) return
        current.callbacks.delete(callback)
        if (current.callbacks.size === 0) {
          globalThis.clearInterval(current.timer)
          this.messageSubscriptions.delete(conversationId)
        }
      }
    },
  }

  readonly shops: ShopService = {
    list: () => this.request<ShopWithStatus[]>('/shops'),
    get: (shopId) => this.request<ShopWithStatus | null>(`/shops/${encoded(shopId)}`),
  }

  readonly favorites: FavoriteService = {
    list: () => this.request<string[]>('/favorites/shops'),
    toggle: (shopId) => this.request<string[]>(`/favorites/shops/${encoded(shopId)}/toggle`, { method: 'POST' }),
    listBarbers: () => this.request<string[]>('/favorites/barbers'),
    toggleBarber: (barberId) => this.request<string[]>(`/favorites/barbers/${encoded(barberId)}/toggle`, { method: 'POST' }),
  }

  readonly reviews: ReviewService = {
    listMine: () => this.request<Review[]>('/ratings'),
    rateAppointment: (input) => this.request<Review>('/ratings', { method: 'POST', body: input }),
  }

  readonly employment: BarberEmploymentService = {
    listHiringShops: async () => {
      const rows = await this.request<Array<HiringListing & { shop: { id: string } }>>('/employment/hiring-shops')
      const shops = new Map((await this.shops.list()).map((shop) => [shop.id, shop]))
      return rows.flatMap(({ shop: rawShop, ...hiring }): HiringShop[] => {
        const shop = shops.get(rawShop.id)
        return shop ? [{ ...shop, hiring }] : []
      })
    },
    getMyShop: async () => {
      const employment = await this.employment.getMyEmployment()
      return employment ? this.shops.get(employment.shop_id) : null
    },
    listMyApplications: () => this.request<BarberApplication[]>('/employment/applications'),
    apply: (shopId) => this.request<BarberApplication>(`/shops/${encoded(shopId)}/applications`, { method: 'POST' }),
    joinWithCode: async (input) => {
      const rawShop = await this.request<{ id: string }>('/employment/join', { method: 'POST', body: input })
      const shop = await this.shops.get(rawShop.id)
      if (!shop) throw new DataError('server', 'The joined shop could not be loaded.')
      return shop
    },
    getMyShopJoinCode: async () => {
      const shop = await this.ownedShop()
      const row = await this.request<{ shop_id: string; code: string } | null>(`/shops/${encoded(shop.id)}/join-code`)
      return row ? { shop, code: row.code } : null
    },
    rotateMyShopJoinCode: async () => {
      const shop = await this.ownedShop()
      const row = await this.request<{ shop_id: string; code: string }>(`/shops/${encoded(shop.id)}/join-code/rotate`, { method: 'POST' })
      return { shop, code: row.code }
    },
    getMyEmployment: () => this.request<BarberEmployment | null>('/employment/me'),
    listMyAbsences: () => this.request<BarberAbsence[]>('/employment/absences'),
    listMyShiftChangeRequests: () => this.request<ShiftChangeRequest[]>('/shift-change-requests'),
    requestShiftChange: (input) => this.request<ShiftChangeRequest>('/shift-change-requests', { method: 'POST', body: input }),
    listMyShopStaff: async () => {
      const shop = await this.ownedShop()
      const rows = await this.request<ShopStaffMember[]>(`/shops/${encoded(shop.id)}/staff`)
      return rows.map((row) => ({ ...row, rules: row.rules.map(normalizeRule) }))
    },
    setBarberRules: async (barberId, rules) => {
      const shop = await this.ownedShop()
      const path = `/shops/${encoded(shop.id)}/staff/${encoded(barberId)}/shifts/patterns`
      return (await this.request<AvailabilityRule[]>(path, { method: 'PUT', body: rules })).map(normalizeRule)
    },
    resolveShiftChangeRequest: (requestId, status) => this.request<ShiftChangeRequest>(`/shift-change-requests/${encoded(requestId)}`, { method: 'PATCH', body: { status } }),
    addStaffNote: async (input) => {
      const shop = await this.ownedShop()
      return this.request<StaffNote>(`/shops/${encoded(shop.id)}/staff-notes`, { method: 'POST', body: input })
    },
  }
}
