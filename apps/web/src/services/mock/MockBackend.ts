import {
  DataError,
  validateFullName,
  validatePassword,
  type Appointment,
  type AppointmentDetailed,
  type AvailabilityOverride,
  type AvailabilityOverrideInput,
  type AvailabilityRule,
  type AvailabilityRuleInput,
  type Barber,
  type BarberWithProfile,
  type Conversation,
  type ConversationDetailed,
  type CreateAppointmentInput,
  type DataBackend,
  type Message,
  type Profile,
  type SendMessageInput,
  type Shop,
  type ShopWithStatus,
  type SignInInput,
  type SignUpInput,
  type Slot,
  type Unsubscribe,
} from '@barbershop/shared'
import { buildSeed, type MockDB } from './seed'
import { computeOpenSlots, effectiveBlocks, isWithinHours, toISODate } from './availability'
import { hashPassword, isPasswordHash, verifyPassword } from './passwords'

const DB_KEY = 'bsh_mock_db_v1'
const SESSION_KEY = 'bsh_session'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`
const delay = (ms = 80 + Math.random() * 160) => new Promise((r) => setTimeout(r, ms))
const nowISO = () => new Date().toISOString()
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validTimeRange(start: string, end: string): boolean {
  return TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && start < end
}

/** Old saved browser data stays usable after adding role onboarding fields. */
function migrateDB(stored: MockDB): MockDB {
  if (stored.version < 2) {
    stored.profiles = stored.profiles.map((profile) => ({
      ...profile,
      requested_role: profile.role === 'admin' ? null : profile.role,
      verification_status: profile.role === 'customer' ? 'not_required' : 'verified',
      onboarding_completed: true,
    }))
    stored.version = 2
  }
  if (stored.version < 3) {
    // v3 nagdagdag ng shops + nationwide barbers. I-merge ang mga bagong seed
    // entity nang hindi ginagalaw ang existing user data (accounts, bookings).
    const seed = buildSeed()
    const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => {
      const known = new Set(current.map((x) => x.id))
      return [...current, ...incoming.filter((x) => !known.has(x.id))]
    }
    stored.profiles = mergeById(stored.profiles, seed.profiles)
    stored.barbers = mergeById(stored.barbers, seed.barbers)
    stored.rules = mergeById(stored.rules, seed.rules)
    stored.shops = seed.shops
    stored.passwords = { ...seed.passwords, ...stored.passwords }
    stored.emailToId = { ...seed.emailToId, ...stored.emailToId }
    stored.version = 3
  }
  if (stored.version < 4) {
    // v4 nagdagdag ng per-user favorite shops.
    stored.favorites = { 'u-customer': ['sh-tondo'] }
    stored.version = 4
  }
  if (stored.version < 5) {
    // v5 adds the verified shop-owner demo account while preserving existing
    // browser-created users, bookings, messages, and favorites.
    const seed = buildSeed()
    const owner = seed.profiles.find((profile) => profile.id === 'u-owner')
    if (owner && !stored.profiles.some((profile) => profile.id === owner.id)) {
      stored.profiles.push(owner)
    }
    stored.passwords['owner@demo.test'] = seed.passwords['owner@demo.test']
    stored.emailToId['owner@demo.test'] = 'u-owner'
    stored.version = 5
  }
  if (stored.version < 6) {
    // v6: mas tumpak na shop coordinates + bagong South Metro shops/barbers.
    // Ligtas i-replace ang shops wholesale (read-only sila sa mock backend);
    // ang user-created data (accounts, bookings, messages) ay hindi ginagalaw.
    const seed = buildSeed()
    const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => {
      const known = new Set(current.map((x) => x.id))
      return [...current, ...incoming.filter((x) => !known.has(x.id))]
    }
    stored.profiles = mergeById(stored.profiles, seed.profiles)
    stored.barbers = mergeById(stored.barbers, seed.barbers)
    stored.rules = mergeById(stored.rules, seed.rules)
    stored.shops = seed.shops
    stored.passwords = { ...seed.passwords, ...stored.passwords }
    stored.emailToId = { ...seed.emailToId, ...stored.emailToId }
    stored.version = 6
  }
  if (stored.version < 7) {
    // v7 removes the unused admin demo login and replaces all bundled demo
    // passwords with PBKDF2 verifiers. Browser-created legacy accounts are
    // upgraded asynchronously as soon as the backend starts.
    const seed = buildSeed()
    Object.keys(seed.passwords).forEach((email) => {
      stored.passwords[email] = seed.passwords[email]
    })
    delete stored.passwords['admin@demo.test']
    delete stored.emailToId['admin@demo.test']
    stored.profiles = stored.profiles.filter((profile) => profile.id !== 'u-admin')
    stored.version = 7
  }
  return stored
}

type BroadcastMsg = { type: 'db' } | { type: 'message'; conversationId: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStoredMockDB(value: unknown): value is MockDB {
  if (!isRecord(value) || !Number.isInteger(value.version)) return false
  const requiredArrays = [
    value.profiles,
    value.barbers,
    value.services,
    value.rules,
    value.overrides,
    value.appointments,
    value.conversations,
    value.messages,
  ]
  if (requiredArrays.some((field) => !Array.isArray(field))) return false
  if (!isRecord(value.passwords) || !isRecord(value.emailToId)) return false
  if (Number(value.version) >= 3 && !Array.isArray(value.shops)) return false
  if (Number(value.version) >= 4 && !isRecord(value.favorites)) return false
  return true
}

function isBroadcastMsg(value: unknown): value is BroadcastMsg {
  if (!isRecord(value)) return false
  if (value.type === 'db') return true
  return value.type === 'message' && typeof value.conversationId === 'string'
}

export function createMockBackend(): DataBackend {
  let db: MockDB = loadDB()

  const channel: BroadcastChannel | null =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bsh_mock') : null

  const authListeners = new Set<(p: Profile | null) => void>()
  // conversationId -> set of message callbacks
  const msgListeners = new Map<string, Set<(m: Message) => void>>()

  function loadDB(): MockDB {
    try {
      const raw = localStorage.getItem(DB_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (!isStoredMockDB(parsed)) throw new Error('Invalid mock database shape.')
        const stored = migrateDB(parsed)
        localStorage.setItem(DB_KEY, JSON.stringify(stored))
        return stored
      }
    } catch {
      /* ignore */
    }
    const seed = buildSeed()
    localStorage.setItem(DB_KEY, JSON.stringify(seed))
    return seed
  }

  function persist(broadcast = true) {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
    if (broadcast) channel?.postMessage({ type: 'db' } satisfies BroadcastMsg)
  }

  function reloadFromStorage() {
    try {
      const raw = localStorage.getItem(DB_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (isStoredMockDB(parsed)) db = migrateDB(parsed)
      }
    } catch {
      /* ignore */
    }
  }

  const credentialUpgrade = hardenLegacyPasswords()

  async function hardenLegacyPasswords() {
    const legacy = Object.entries(db.passwords).filter(([, password]) => !isPasswordHash(password))
    if (legacy.length === 0) return
    const upgraded = await Promise.all(
      legacy.map(async ([email, password]) => [email, await hashPassword(password)] as const),
    )
    upgraded.forEach(([email, password]) => { db.passwords[email] = password })
    persist(false)
  }

  if (channel) {
    channel.onmessage = (e: MessageEvent<unknown>) => {
      const data = e.data
      if (!isBroadcastMsg(data)) return
      if (data.type === 'db') {
        reloadFromStorage()
      } else if (data.type === 'message') {
        reloadFromStorage()
        const msg = db.messages
          .filter((m) => m.conversation_id === data.conversationId)
          .at(-1)
        if (msg) msgListeners.get(data.conversationId)?.forEach((cb) => cb(clone(msg)))
      }
    }
  }

  // ---- session (per-tab, so two tabs can be two different users) ----
  function getSessionId(): string | null {
    return sessionStorage.getItem(SESSION_KEY)
  }
  function setSession(id: string | null) {
    if (id) sessionStorage.setItem(SESSION_KEY, id)
    else sessionStorage.removeItem(SESSION_KEY)
    const profile = id ? db.profiles.find((p) => p.id === id) ?? null : null
    authListeners.forEach((cb) => cb(profile ? clone(profile) : null))
  }
  function requireUser(): Profile {
    const id = getSessionId()
    const p = id ? db.profiles.find((x) => x.id === id) : null
    if (!p) throw new DataError('not_authenticated', 'You must be signed in.')
    return p
  }

  // ---- shape builders ----
  const profileById = (id: string) => db.profiles.find((p) => p.id === id)
  const publicProfile = (profile: Profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
  })
  function barberWithProfile(b: Barber): BarberWithProfile {
    const profile = profileById(b.id)
    if (!profile) throw new DataError('not_found', 'Barber profile missing.')
    return { ...clone(b), profile: publicProfile(profile) }
  }
  function appointmentDetailed(a: Appointment): AppointmentDetailed {
    const service = db.services.find((s) => s.id === a.service_id)!
    const barber = db.barbers.find((b) => b.id === a.barber_id)!
    const customer = profileById(a.customer_id)!
    return {
      ...clone(a),
      service: clone(service),
      barber: barberWithProfile(barber),
      customer: publicProfile(customer),
    }
  }
  function conversationDetailed(c: Conversation, viewerId: string): ConversationDetailed {
    const msgs = db.messages
      .filter((m) => m.conversation_id === c.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const last = msgs.at(-1) ?? null
    const unread = msgs.filter((m) => m.sender_id !== viewerId && m.read_at === null).length
    return {
      ...clone(c),
      customer: publicProfile(profileById(c.customer_id)!),
      barber: barberWithProfile(db.barbers.find((b) => b.id === c.barber_id)!),
      last_message: last ? clone(last) : null,
      unread_count: unread,
    }
  }

  // ================= AuthService =================
  const auth: DataBackend['auth'] = {
    async signUp(input: SignUpInput) {
      await delay()
      await credentialUpgrade
      const email = input.email.trim().toLowerCase()
      if (!email || !input.password) throw new DataError('validation', 'Email and password required.')
      if (email.length > 254) throw new DataError('validation', 'Email is too long.')
      if ((input.phone?.trim().length ?? 0) > 32) throw new DataError('validation', 'Phone number is too long.')
      // Same field rules as the form, enforced sa data layer para hindi
      // malusutan kahit i-bypass ang UI validation.
      const nameError = validateFullName(input.full_name)
      if (nameError) throw new DataError('validation', nameError)
      const passwordError = validatePassword(input.password)
      if (passwordError) throw new DataError('validation', passwordError)
      reloadFromStorage()
      if (db.emailToId[email]) throw new DataError('email_taken', 'That email is already registered.')
      const id = uid('u')
      const profile: Profile = {
        id,
        // IMPORTANT: signup never grants professional access.
        role: 'customer',
        requested_role: null,
        verification_status: 'unverified',
        onboarding_completed: false,
        full_name: input.full_name.trim(),
        phone: input.phone?.trim() || null,
        avatar_url: null,
        created_at: nowISO(),
      }
      db.profiles.push(profile)
      db.passwords[email] = await hashPassword(input.password)
      db.emailToId[email] = id
      persist()
      setSession(id)
      return clone(profile)
    },

    async signIn(input: SignInInput) {
      await delay()
      await credentialUpgrade
      const identifier = input.email.trim().toLowerCase()
      if (identifier.length > 254 || input.password.length > 128) {
        throw new DataError('invalid_credentials', 'Wrong email/phone or password.')
      }
      reloadFromStorage()
      const directId = db.emailToId[identifier]
      const phoneId = db.profiles.find((profile) => profile.phone?.replace(/\s+/g, '').toLowerCase() === identifier.replace(/\s+/g, ''))?.id
      const id = directId ?? phoneId
      const email = Object.entries(db.emailToId).find(([, profileId]) => profileId === id)?.[0]
      const storedPassword = email ? db.passwords[email] : undefined
      if (!id || !email || !storedPassword || !(await verifyPassword(input.password, storedPassword))) {
        throw new DataError('invalid_credentials', 'Wrong email/phone or password.')
      }
      if (!isPasswordHash(storedPassword)) {
        db.passwords[email] = await hashPassword(input.password)
        persist()
      }
      setSession(id)
      return clone(profileById(id)!)
    },

    async completeRoleOnboarding(input) {
      await delay()
      reloadFromStorage()
      const profile = requireUser()
      const allowed = ['customer', 'barber', 'shop_owner'] as const
      if (!allowed.includes(input.role)) {
        throw new DataError('validation', 'Hindi valid ang napiling account type.')
      }
      // One-time endpoint ito para hindi paulit-ulit makagawa ng applications.
      if (profile.onboarding_completed) {
        if (profile.requested_role === input.role) return clone(profile)
        throw new DataError('forbidden', 'Napili mo na ang account type. Contact support para magpalit.')
      }

      profile.requested_role = input.role
      profile.onboarding_completed = true
      if (input.role === 'customer') {
        profile.role = 'customer'
        profile.verification_status = 'not_required'
      } else {
        // HUWAG gumawa ng barber/shop record dito. Request lang muna ito;
        // trusted server/admin review lang ang puwedeng mag-promote ng role.
        profile.role = 'customer'
        profile.verification_status = 'pending'
      }
      persist()
      setSession(profile.id)
      return clone(profile)
    },

    async signOut() {
      await delay(40)
      setSession(null)
    },

    async getCurrentProfile() {
      const id = getSessionId()
      if (!id) return null
      reloadFromStorage()
      const p = profileById(id)
      return p ? clone(p) : null
    },

    onAuthChange(cb) {
      authListeners.add(cb)
      return () => authListeners.delete(cb)
    },
  }

  // ================= BarberService =================
  const barbers: DataBackend['barbers'] = {
    async list() {
      await delay()
      reloadFromStorage()
      return db.barbers.map(barberWithProfile)
    },

    async get(barberId) {
      await delay()
      reloadFromStorage()
      const b = db.barbers.find((x) => x.id === barberId)
      return b ? barberWithProfile(b) : null
    },

    async availableNow() {
      await delay()
      reloadFromStorage()
      const when = new Date()
      return db.barbers
        .filter((b) => b.shift_status === 'on' && b.accepting_bookings)
        .filter((b) =>
          isWithinHours(
            when,
            db.rules.filter((r) => r.barber_id === b.id),
            db.overrides.filter((o) => o.barber_id === b.id),
          ),
        )
        .map(barberWithProfile)
    },

    async setShiftStatus(on) {
      await delay()
      const user = requireUser()
      const b = db.barbers.find((x) => x.id === user.id)
      if (!b) throw new DataError('forbidden', 'Only barbers can set shift status.')
      b.shift_status = on ? 'on' : 'off'
      persist()
      return clone(b)
    },

    async setAcceptingBookings(accepting) {
      await delay()
      const user = requireUser()
      const b = db.barbers.find((x) => x.id === user.id)
      if (!b) throw new DataError('forbidden', 'Only barbers can change this.')
      b.accepting_bookings = accepting
      persist()
      return clone(b)
    },
  }

  // ================= ShopService =================
  /** Same "free right now" test as barbers.availableNow, para iisa ang totoo. */
  function isOnChair(b: { id: string; shift_status: string }, when: Date): boolean {
    return (
      b.shift_status === 'on' &&
      isWithinHours(
        when,
        db.rules.filter((r) => r.barber_id === b.id),
        db.overrides.filter((o) => o.barber_id === b.id),
      )
    )
  }

  function shopWithStatus(s: Shop): ShopWithStatus {
    const when = new Date()
    const staff = db.barbers.filter((b) => s.barber_ids.includes(b.id))
    const onChair = staff.filter((b) => isOnChair(b, when))
    const available = onChair.filter((b) => b.accepting_bookings)
    return {
      ...clone(s),
      status: available.length > 0 ? 'open' : onChair.length > 0 ? 'busy' : 'closed',
      available_barber_count: available.length,
    }
  }

  const shops: DataBackend['shops'] = {
    async list() {
      await delay()
      reloadFromStorage()
      return db.shops.map(shopWithStatus)
    },

    async get(shopId) {
      await delay(50)
      reloadFromStorage()
      const s = db.shops.find((x) => x.id === shopId)
      return s ? shopWithStatus(s) : null
    },
  }

  // ================= FavoriteService =================
  const favorites: DataBackend['favorites'] = {
    async list() {
      await delay(40)
      reloadFromStorage()
      const user = requireUser()
      return [...(db.favorites[user.id] ?? [])]
    },

    async toggle(shopId) {
      await delay(40)
      const user = requireUser()
      if (!db.shops.some((s) => s.id === shopId)) {
        throw new DataError('not_found', 'Walang ganyang barbershop.')
      }
      const current = db.favorites[user.id] ?? []
      db.favorites[user.id] = current.includes(shopId)
        ? current.filter((id) => id !== shopId)
        : [...current, shopId]
      persist()
      return [...db.favorites[user.id]]
    },
  }

  // ================= AvailabilityService =================
  const availability: DataBackend['availability'] = {
    async getRules(barberId) {
      await delay(50)
      reloadFromStorage()
      return db.rules.filter((r) => r.barber_id === barberId).map(clone)
    },

    async getOverrides(barberId) {
      await delay(50)
      reloadFromStorage()
      return db.overrides.filter((o) => o.barber_id === barberId).map(clone)
    },

    async setRules(rules: AvailabilityRuleInput[]) {
      await delay()
      const user = requireUser()
      if (!db.barbers.some((b) => b.id === user.id))
        throw new DataError('forbidden', 'Only barbers set availability.')
      if (rules.length > 14) throw new DataError('validation', 'Too many availability blocks.')
      if (rules.some((rule) => !Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6 || !validTimeRange(rule.start_time, rule.end_time))) {
        throw new DataError('validation', 'Invalid availability schedule.')
      }
      db.rules = db.rules.filter((r) => r.barber_id !== user.id)
      const created: AvailabilityRule[] = rules.map((r) => ({
        id: uid('r'),
        barber_id: user.id,
        weekday: r.weekday,
        start_time: r.start_time,
        end_time: r.end_time,
        created_at: nowISO(),
      }))
      db.rules.push(...created)
      persist()
      return created.map(clone)
    },

    async addOverride(input: AvailabilityOverrideInput) {
      await delay()
      const user = requireUser()
      if (!db.barbers.some((b) => b.id === user.id))
        throw new DataError('forbidden', 'Only barbers set availability.')
      const overrideDate = new Date(`${input.date}T00:00:00`)
      if (!DATE_PATTERN.test(input.date) || Number.isNaN(overrideDate.getTime()) || toISODate(overrideDate) !== input.date) {
        throw new DataError('validation', 'Invalid override date.')
      }
      const hasStart = Boolean(input.start_time)
      const hasEnd = Boolean(input.end_time)
      if (hasStart !== hasEnd || (input.start_time && input.end_time && !validTimeRange(input.start_time, input.end_time))) {
        throw new DataError('validation', 'Invalid override hours.')
      }
      const reason = input.reason?.trim() || null
      if (reason && reason.length > 300) throw new DataError('validation', 'Override reason is too long.')
      const override: AvailabilityOverride = {
        id: uid('o'),
        barber_id: user.id,
        date: input.date,
        is_available: input.is_available,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        reason,
      }
      db.overrides = db.overrides.filter((candidate) => !(candidate.barber_id === user.id && candidate.date === input.date))
      db.overrides.push(override)
      persist()
      return clone(override)
    },

    async removeOverride(overrideId) {
      await delay()
      const user = requireUser()
      db.overrides = db.overrides.filter(
        (o) => !(o.id === overrideId && o.barber_id === user.id),
      )
      persist()
    },

    async getOpenSlots(barberId, serviceId, date): Promise<Slot[]> {
      await delay()
      reloadFromStorage()
      const service = db.services.find((s) => s.id === serviceId && s.active)
      if (!service) throw new DataError('not_found', 'Service not found.')
      const barber = db.barbers.find((candidate) => candidate.id === barberId)
      const barberProfile = profileById(barberId)
      if (
        !barber
        || !barber.accepting_bookings
        || !barberProfile
        || barberProfile.role !== 'barber'
        || barberProfile.verification_status !== 'verified'
      ) return []
      return computeOpenSlots(
        date,
        service,
        db.rules.filter((r) => r.barber_id === barberId),
        db.overrides.filter((o) => o.barber_id === barberId),
        db.appointments.filter((a) => a.barber_id === barberId),
      )
    },
  }

  // ================= ServiceCatalog =================
  const services: DataBackend['services'] = {
    async list() {
      await delay(50)
      reloadFromStorage()
      return db.services.filter((s) => s.active).map(clone)
    },
  }

  // ================= BookingService =================
  function validateBookingInput(
    input: CreateAppointmentInput,
    user: Profile,
    ignoredAppointmentId?: string,
  ) {
    if (user.role !== 'customer') {
      throw new DataError('forbidden', 'Use a customer account to book a haircut.')
    }
    const barber = db.barbers.find((candidate) => candidate.id === input.barber_id)
    const barberProfile = profileById(input.barber_id)
    if (
      !barber
      || !barberProfile
      || barberProfile.role !== 'barber'
      || barberProfile.verification_status !== 'verified'
    ) throw new DataError('not_found', 'Barber is not available for booking.')
    if (!barber.accepting_bookings) {
      throw new DataError('validation', 'This barber is not accepting bookings right now.')
    }
    if (barber.id === user.id) throw new DataError('validation', 'You cannot book your own chair.')

    const service = db.services.find((candidate) => candidate.id === input.service_id && candidate.active)
    if (!service) throw new DataError('not_found', 'Service not found.')
    const start = new Date(input.starts_at)
    if (!Number.isFinite(start.getTime())) throw new DataError('validation', 'Invalid appointment time.')
    const normalizedStart = start.toISOString()
    const date = toISODate(start)
    const available = computeOpenSlots(
      date,
      service,
      db.rules.filter((rule) => rule.barber_id === barber.id),
      db.overrides.filter((override) => override.barber_id === barber.id),
      db.appointments.filter((appointment) => appointment.id !== ignoredAppointmentId && appointment.barber_id === barber.id),
    ).some((slot) => slot.starts_at === normalizedStart)
    if (!available) throw new DataError('slot_taken', 'That slot is no longer available.')

    const notes = input.notes?.trim() || null
    if (notes && notes.length > 500) throw new DataError('validation', 'Booking notes are too long.')
    return {
      service,
      start,
      end: new Date(start.getTime() + service.duration_min * 60_000),
      notes,
    }
  }

  const bookings: DataBackend['bookings'] = {
    async create(input: CreateAppointmentInput) {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      const { start, end, notes } = validateBookingInput(input, user)

      const appt: Appointment = {
        id: uid('a'),
        customer_id: user.id,
        barber_id: input.barber_id,
        service_id: input.service_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: 'pending',
        notes,
        created_at: nowISO(),
        updated_at: nowISO(),
      }
      db.appointments.push(appt)
      persist()
      return clone(appt)
    },

    async reschedule(appointmentId, input) {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
      if (!appointment) throw new DataError('not_found', 'Appointment not found.')
      if (appointment.customer_id !== user.id) {
        throw new DataError('forbidden', 'Only the customer can reschedule this appointment.')
      }
      if (appointment.status !== 'pending' && appointment.status !== 'confirmed') {
        throw new DataError('validation', 'Only an active appointment can be rescheduled.')
      }
      const { start, end, notes } = validateBookingInput(input, user, appointment.id)
      appointment.barber_id = input.barber_id
      appointment.service_id = input.service_id
      appointment.starts_at = start.toISOString()
      appointment.ends_at = end.toISOString()
      appointment.notes = notes
      appointment.status = 'pending'
      appointment.updated_at = nowISO()
      persist()
      return clone(appointment)
    },

    async cancel(appointmentId) {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      const appt = db.appointments.find((a) => a.id === appointmentId)
      if (!appt) throw new DataError('not_found', 'Appointment not found.')
      if (appt.customer_id !== user.id && appt.barber_id !== user.id)
        throw new DataError('forbidden', 'Not your appointment.')
      if (appt.status !== 'pending' && appt.status !== 'confirmed') {
        throw new DataError('validation', 'Only an active appointment can be cancelled.')
      }
      appt.status = 'cancelled'
      appt.updated_at = nowISO()
      persist()
      return clone(appt)
    },

    async listMine() {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      return db.appointments
        .filter((a) => a.customer_id === user.id || a.barber_id === user.id)
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        .map(appointmentDetailed)
    },

    async setStatus(appointmentId, status) {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      const appt = db.appointments.find((a) => a.id === appointmentId)
      if (!appt) throw new DataError('not_found', 'Appointment not found.')
      if (appt.barber_id !== user.id)
        throw new DataError('forbidden', 'Only the barber can change status.')
      if (status === appt.status) return clone(appt)
      const allowed: Record<Appointment['status'], Appointment['status'][]> = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['completed', 'cancelled', 'no_show'],
        completed: [],
        cancelled: [],
        no_show: [],
      }
      if (!allowed[appt.status].includes(status)) {
        throw new DataError('validation', `Cannot change ${appt.status} to ${status}.`)
      }
      if ((status === 'completed' || status === 'no_show') && Date.now() < new Date(appt.starts_at).getTime()) {
        throw new DataError('validation', 'The appointment has not started yet.')
      }
      appt.status = status
      appt.updated_at = nowISO()
      persist()
      return clone(appt)
    },
  }

  // ================= ChatService =================
  const chat: DataBackend['chat'] = {
    async listConversations() {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      return db.conversations
        .filter((c) => c.customer_id === user.id || c.barber_id === user.id)
        .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
        .map((c) => conversationDetailed(c, user.id))
    },

    async openConversation(barberId) {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      if (user.role !== 'customer') {
        throw new DataError('forbidden', 'Only customers can start a new barber conversation.')
      }
      const targetBarber = db.barbers.find((barber) => barber.id === barberId)
      const targetProfile = profileById(barberId)
      if (
        !targetBarber
        || !targetProfile
        || targetProfile.role !== 'barber'
        || targetProfile.verification_status !== 'verified'
      ) throw new DataError('not_found', 'Barber not found.')
      const customerId = user.id
      const theBarberId = targetBarber.id
      let convo = db.conversations.find(
        (c) => c.customer_id === customerId && c.barber_id === theBarberId,
      )
      if (!convo) {
        convo = {
          id: uid('c'),
          customer_id: customerId,
          barber_id: theBarberId,
          created_at: nowISO(),
          last_message_at: nowISO(),
        }
        db.conversations.push(convo)
        persist()
      }
      return conversationDetailed(convo, user.id)
    },

    async getMessages(conversationId, limit = 100) {
      await delay(50)
      const user = requireUser()
      reloadFromStorage()
      const convo = db.conversations.find((c) => c.id === conversationId)
      if (!convo || (convo.customer_id !== user.id && convo.barber_id !== user.id))
        throw new DataError('forbidden', 'Not your conversation.')
      return db.messages
        .filter((m) => m.conversation_id === conversationId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-Math.min(200, Math.max(1, Math.floor(limit))))
        .map(clone)
    },

    async sendMessage(input: SendMessageInput) {
      await delay(60)
      const user = requireUser()
      reloadFromStorage()
      const convo = db.conversations.find((c) => c.id === input.conversation_id)
      if (!convo || (convo.customer_id !== user.id && convo.barber_id !== user.id))
        throw new DataError('forbidden', 'Not your conversation.')
      const body = input.body.trim()
      if (!body) throw new DataError('validation', 'Message is empty.')
      if (body.length > 2_000) throw new DataError('validation', 'Message is too long.')
      const msg: Message = {
        id: uid('m'),
        conversation_id: convo.id,
        sender_id: user.id,
        body,
        read_at: null,
        created_at: nowISO(),
      }
      db.messages.push(msg)
      convo.last_message_at = msg.created_at
      persist()
      // Deliver to this tab's subscribers immediately, and other tabs via the channel.
      msgListeners.get(convo.id)?.forEach((cb) => cb(clone(msg)))
      channel?.postMessage({ type: 'message', conversationId: convo.id } satisfies BroadcastMsg)
      return clone(msg)
    },

    async markRead(conversationId) {
      await delay(40)
      const user = requireUser()
      reloadFromStorage()
      const conversation = db.conversations.find((candidate) => candidate.id === conversationId)
      if (!conversation || (conversation.customer_id !== user.id && conversation.barber_id !== user.id)) {
        throw new DataError('forbidden', 'Not your conversation.')
      }
      let touched = false
      db.messages
        .filter(
          (m) =>
            m.conversation_id === conversationId &&
            m.sender_id !== user.id &&
            m.read_at === null,
        )
        .forEach((m) => {
          m.read_at = nowISO()
          touched = true
        })
      if (touched) persist()
    },

    subscribe(conversationId, cb): Unsubscribe {
      const user = requireUser()
      reloadFromStorage()
      const conversation = db.conversations.find((candidate) => candidate.id === conversationId)
      if (!conversation || (conversation.customer_id !== user.id && conversation.barber_id !== user.id)) {
        throw new DataError('forbidden', 'Not your conversation.')
      }
      let set = msgListeners.get(conversationId)
      if (!set) {
        set = new Set()
        msgListeners.set(conversationId, set)
      }
      set.add(cb)
      return () => {
        set?.delete(cb)
        if (set && set.size === 0) msgListeners.delete(conversationId)
      }
    },
  }

  return { auth, barbers, availability, services, bookings, chat, shops, favorites }
}

// Re-export so pages can compute "next open slot" previews without a round trip if desired.
export { effectiveBlocks }
