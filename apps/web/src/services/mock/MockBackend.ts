import {
  canModifyAppointment,
  DataError,
  normalizePhone,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
  type Appointment,
  type AppointmentDetailed,
  type AvailabilityOverride,
  type AvailabilityOverrideInput,
  type AvailabilityRule,
  type AvailabilityRuleInput,
  type Barber,
  type BarberApplication,
  type BarberWithProfile,
  type Conversation,
  type ConversationDetailed,
  type CreateAppointmentInput,
  type DataBackend,
  type Message,
  type HiringShop,
  type Profile,
  type Review,
  type SendMessageInput,
  type Shop,
  type ShopWithStatus,
  type SignInInput,
  type SignUpInput,
  type Slot,
  type Unsubscribe,
} from '@barbershop/shared'
import { buildSeed, type MockDB } from './seed'
import { localDateKey, parseLocalDateKey } from '../../lib/date'
import { computeOpenSlots, effectiveBlocks, isWithinHours } from './availability'
import { DUMMY_PASSWORD_HASH, hashPassword, isPasswordHash, verifyPassword } from './passwords'

const DB_KEY = 'bsh_mock_db_v1'
const SESSION_KEY = 'bsh_session'

const clone = <T>(v: T): T => structuredClone(v)
const uid = (p: string) => `${p}-${crypto.randomUUID()}`
const delay = (ms = 80 + Math.random() * 160) => new Promise((r) => setTimeout(r, ms))
const nowISO = () => new Date().toISOString()
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
// 9-part legacy strings (walang skin/gear) ay valid pa rin; ang optional tail
// ang bagong skin tone + customer gear segments.
const DOODLE_AVATAR_PATTERN = /^doodle:(?:customer-[1-4]|barber-[1-3]|owner-[1-3]|custom:(?:oval|round|square):(?:fringe|round|curls|bob|quiff|cap|fade|bun|spiky):(?:dots|happy|wide|sleepy):(?:soft|button|long):(?:smile|grin|neutral|open):(?:none|glasses|moustache|freckles|blush):(?:blue|yellow|pink|purple|green|orange|teal|red)(?::(?:paper|sand|tan|brown|deep):(?:none|earring|headphones|sparkle|crown|shears|towel|badge))?)$/

/**
 * Role-locked gear unlock thresholds (completed cuts — as customer o bilang
 * barber). Mirrors the UI catalogues sa DoodleAvatar.tsx — the backend stays
 * authoritative kahit i-bypass ang UI.
 */
const CUSTOMER_GEAR_UNLOCKS: Record<string, number> = {
  earring: 1,
  headphones: 3,
  sparkle: 5,
  crown: 10,
}

const BARBER_GEAR_UNLOCKS: Record<string, number> = {
  shears: 1,
  towel: 3,
  badge: 10,
}

function newJoinCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

function defaultAvatarForProfile(profile: Pick<Profile, 'role' | 'requested_role'>): string {
  const role = profile.requested_role ?? profile.role
  if (role === 'barber') return 'doodle:barber-1'
  if (role === 'shop_owner') return 'doodle:owner-1'
  return 'doodle:customer-1'
}

function validTimeRange(start: string, end: string): boolean {
  return TIME_PATTERN.test(start) && TIME_PATTERN.test(end) && start < end
}

/** Shared gate ng weekly shifts — barber self-service at owner staff tools. */
function assertValidWeeklyRules(rules: AvailabilityRuleInput[]): void {
  if (rules.length > 14) throw new DataError('validation', 'Too many availability blocks.')
  if (rules.some((rule) => !Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6 || !validTimeRange(rule.start_time, rule.end_time))) {
    throw new DataError('validation', 'Invalid availability schedule.')
  }
  const overlaps = rules.some((rule, index) => rules.some((candidate, candidateIndex) => (
    candidateIndex < index
    && candidate.weekday === rule.weekday
    && rule.start_time < candidate.end_time
    && rule.end_time > candidate.start_time
  )))
  if (overlaps) throw new DataError('validation', 'Availability blocks on the same day cannot overlap.')
}

function updateAggregate(
  entity: { rating: number; rating_count: number },
  previousScore: number | null,
  nextScore: number,
) {
  const count = Math.max(0, entity.rating_count)
  const total = entity.rating * count
  if (previousScore === null) {
    entity.rating_count = count + 1
    entity.rating = (total + nextScore) / entity.rating_count
    return
  }
  entity.rating = count > 0
    ? (total - previousScore + nextScore) / count
    : nextScore
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
    stored.favorites = {}
    stored.version = 4
  }
  if (stored.version < 5) {
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
    stored.version = 7
  }
  if (stored.version < 8) {
    // v8 promotes chat to a shop-level feature. Existing barber threads are
    // attached to the shop where that barber works, preserving their messages.
    stored.conversations = stored.conversations.flatMap((conversation) => {
      const legacy = conversation as Conversation & { shop_id?: string }
      const shop = stored.shops.find((candidate) =>
        candidate.id === legacy.shop_id || candidate.barber_ids.includes(legacy.barber_id),
      )
      return shop ? [{ ...conversation, shop_id: shop.id }] : []
    })
    const validConversationIds = new Set(stored.conversations.map((conversation) => conversation.id))
    stored.messages = stored.messages.filter((message) => validConversationIds.has(message.conversation_id))
    stored.version = 8
  }
  if (stored.version < 9) {
    // v9 adds built-in doodle avatar choices. Existing accounts receive the
    // default that matches their selected/requested role.
    stored.profiles = stored.profiles.map((profile) => ({
      ...profile,
      avatar_url: profile.avatar_url || defaultAvatarForProfile(profile),
    }))
    stored.version = 9
  }
  if (stored.version < 10) {
    // v10 persists favorite barbers and completed-cut ratings. Existing
    // accounts and bookings stay intact; the demo history gets one sample cut.
    const seed = buildSeed()
    stored.barbers = stored.barbers.map((barber) => {
      const fresh = seed.barbers.find((candidate) => candidate.id === barber.id)
      return {
        ...barber,
        rating: Number.isFinite(barber.rating) ? barber.rating : (fresh?.rating ?? 4.8),
        rating_count: Number.isInteger(barber.rating_count) ? barber.rating_count : (fresh?.rating_count ?? 0),
      }
    })
    stored.favoriteBarbers = stored.favoriteBarbers ?? {}
    stored.reviews = stored.reviews ?? []
    const demoCut = seed.appointments.find((appointment) => appointment.id === 'a-demo-completed')
    if (demoCut && !stored.appointments.some((appointment) => appointment.id === demoCut.id)) {
      stored.appointments.push(demoCut)
    }
    stored.version = 10
  }
  if (stored.version < 11) {
    // v11 adds private account contact fields and persisted support reports.
    // Email is recovered from the existing credential index without exposing
    // it through PublicProfile joins.
    stored.profiles = stored.profiles.map((profile) => ({
      ...profile,
      email: profile.email || Object.entries(stored.emailToId).find(([, id]) => id === profile.id)?.[0] || '',
      location: typeof profile.location === 'string' ? profile.location : null,
    }))
    stored.bugReports = stored.bugReports ?? []
    stored.version = 11
  }
  if (stored.version < 12) {
    stored.version = 12
  }
  if (stored.version < 13) {
    // v13 introduces the barber employment flow. Hiring notices and join
    // codes come from seed configuration; applications are user-owned data.
    const seed = buildSeed()
    stored.hiringListings = seed.hiringListings
    stored.barberApplications = stored.barberApplications ?? []
    stored.shopJoinCodes = seed.shopJoinCodes
    stored.version = 13
  }
  if (stored.version < 14) {
    // v14 assigns verified owners to shops so join codes can be managed by
    // the owner instead of being an unowned global demo value.
    const seed = buildSeed()
    stored.shops = stored.shops.map((shop) => ({
      ...shop,
      owner_id: seed.shops.find((candidate) => candidate.id === shop.id)?.owner_id ?? null,
    }))
    stored.version = 14
  }
  if (stored.version < 15) {
    // v15 introduces per-shop employment stints, absences, and shift change
    // requests. Seeded rosters get seeded stints; user-created barbers get a
    // stint derived from their barber record's created_at.
    const seed = buildSeed()
    stored.employments = seed.employments.filter((employmentRecord) => (
      stored.shops.some((shop) => (
        shop.id === employmentRecord.shop_id && shop.barber_ids.includes(employmentRecord.barber_id)
      ))
    ))
    stored.shops.forEach((shop) => {
      shop.barber_ids.forEach((barberId) => {
        if (stored.employments.some((employmentRecord) => employmentRecord.barber_id === barberId && employmentRecord.ended_at === null)) return
        const barber = stored.barbers.find((candidate) => candidate.id === barberId)
        stored.employments.push({
          id: `emp-${barberId}`,
          barber_id: barberId,
          shop_id: shop.id,
          hired_at: (barber?.created_at ?? nowISO()).slice(0, 10),
          ended_at: null,
        })
      })
    })
    stored.absences = seed.absences.filter((absence) => (
      stored.employments.some((employmentRecord) => (
        employmentRecord.barber_id === absence.barber_id
        && employmentRecord.shop_id === absence.shop_id
        && employmentRecord.ended_at === null
      ))
    ))
    stored.shiftChangeRequests = seed.shiftChangeRequests.filter((request) => (
      stored.employments.some((employmentRecord) => (
        employmentRecord.barber_id === request.barber_id
        && employmentRecord.shop_id === request.shop_id
        && employmentRecord.ended_at === null
      ))
    ))
    stored.version = 15
  }
  if (stored.version < 16) {
    // v16 snapshots the shop on each appointment. Older rows only knew their
    // barber, so use that barber's current roster while upgrading. New rows
    // keep this id even after the barber transfers to another shop.
    stored.appointments = stored.appointments.flatMap((appointment) => {
      const legacy = appointment as Appointment & { shop_id?: string }
      const shopId = legacy.shop_id && stored.shops.some((shop) => shop.id === legacy.shop_id)
        ? legacy.shop_id
        : stored.shops.find((shop) => shop.barber_ids.includes(appointment.barber_id))?.id
      return shopId ? [{ ...appointment, shop_id: shopId }] : []
    })
    stored.version = 16
  }
  if (stored.version < 17) {
    // v17 adds owner tools: staff notes + seeded Tondo booking history and
    // listing-only customers para may totoong data ang owner analytics.
    // User-created rows are untouched; seed rows merge only when missing.
    const seed = buildSeed()
    const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => {
      const known = new Set(current.map((x) => x.id))
      return [...current, ...incoming.filter((x) => !known.has(x.id))]
    }
    stored.profiles = mergeById(stored.profiles, seed.profiles)
    stored.appointments = mergeById(stored.appointments, seed.appointments)
    stored.staffNotes = seed.staffNotes
    stored.version = 17
  }
  if (stored.version < 18) {
    // v18 removes seeded/demo activity before the Supabase cutover while
    // retaining every credential-backed profile and its current shop link.
    const seed = buildSeed()
    const accountIds = new Set(Object.values(stored.emailToId))
    stored.profiles = stored.profiles.filter((profile) => accountIds.has(profile.id))

    const seedBarbers = new Map(seed.barbers.map((barber) => [barber.id, barber]))
    stored.barbers = stored.barbers
      .filter((barber) => accountIds.has(barber.id))
      .map((barber) => ({
        ...barber,
        rating: 0,
        rating_count: 0,
        shift_status: 'off',
        accepting_bookings: false,
      }))
    seedBarbers.forEach((barber, barberId) => {
      if (accountIds.has(barberId) && !stored.barbers.some((candidate) => candidate.id === barberId)) {
        stored.barbers.push(barber)
      }
    })

    stored.shops = stored.shops
      .filter((shop) => (
        (shop.owner_id !== null && accountIds.has(shop.owner_id))
        || shop.barber_ids.some((barberId) => accountIds.has(barberId))
      ))
      .map((shop) => ({
        ...shop,
        owner_id: shop.owner_id !== null && accountIds.has(shop.owner_id) ? shop.owner_id : null,
        barber_ids: shop.barber_ids.filter((barberId) => accountIds.has(barberId)),
        rating: 0,
        rating_count: 0,
      }))

    const retainedShopIds = new Set(stored.shops.map((shop) => shop.id))
    stored.employments = stored.employments.filter((employmentRecord) => (
      employmentRecord.ended_at === null
      && accountIds.has(employmentRecord.barber_id)
      && retainedShopIds.has(employmentRecord.shop_id)
      && stored.shops.some((shop) => (
        shop.id === employmentRecord.shop_id
        && shop.barber_ids.includes(employmentRecord.barber_id)
      ))
    ))
    stored.rules = []
    stored.overrides = []
    stored.appointments = []
    stored.conversations = []
    stored.messages = []
    stored.favorites = {}
    stored.favoriteBarbers = {}
    stored.reviews = []
    stored.bugReports = []
    stored.hiringListings = []
    stored.barberApplications = []
    stored.shopJoinCodes = {}
    stored.absences = []
    stored.shiftChangeRequests = []
    stored.staffNotes = []
    stored.version = 18
  }
  if (stored.version < 19) {
    // Remove every historical bundled login while preserving accounts created
    // by a person through signup. Dependent catalogue rows are also removed so
    // no orphaned owner/barber relationship survives the cleanup.
    const bundledEmails = Object.keys(stored.emailToId).filter((email) => /@demo\.test$/i.test(email))
    const bundledIds = new Set(bundledEmails.map((email) => stored.emailToId[email]).filter(Boolean))
    bundledEmails.forEach((email) => {
      delete stored.passwords[email]
      delete stored.emailToId[email]
    })
    stored.profiles = stored.profiles.filter((profile) => !bundledIds.has(profile.id))
    stored.barbers = stored.barbers.filter((barber) => !bundledIds.has(barber.id))
    stored.shops = stored.shops
      .filter((shop) => shop.owner_id === null || !bundledIds.has(shop.owner_id))
      .map((shop) => ({
        ...shop,
        barber_ids: shop.barber_ids.filter((barberId) => !bundledIds.has(barberId)),
      }))
    const retainedShopIds = new Set(stored.shops.map((shop) => shop.id))
    // The mock never supported user-created services, so every pre-v19 service
    // came from the removed bundled shop catalogue.
    stored.services = []
    stored.employments = stored.employments.filter((employment) => (
      !bundledIds.has(employment.barber_id) && retainedShopIds.has(employment.shop_id)
    ))
    stored.version = 19
  }
  return stored
}

type BroadcastMsg =
  | { type: 'db' }
  | { type: 'message'; conversationId: string; messageId: string }

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
  if (Number(value.version) >= 10 && (!isRecord(value.favoriteBarbers) || !Array.isArray(value.reviews))) return false
  if (Number(value.version) >= 11 && !Array.isArray(value.bugReports)) return false
  if (Number(value.version) >= 13 && (
    !Array.isArray(value.hiringListings)
    || !Array.isArray(value.barberApplications)
    || !isRecord(value.shopJoinCodes)
  )) return false
  if (Number(value.version) >= 15 && (
    !Array.isArray(value.employments)
    || !Array.isArray(value.absences)
    || !Array.isArray(value.shiftChangeRequests)
  )) return false
  if (Number(value.version) >= 16 && (!Array.isArray(value.appointments) || value.appointments.some((appointment) => (
    !isRecord(appointment) || typeof appointment.shop_id !== 'string'
  )))) return false
  if (Number(value.version) >= 17 && !Array.isArray(value.staffNotes)) return false
  return true
}

/** Reject persisted rows with dangling joins before they can wedge detail views. */
function hasValidReferences(value: MockDB): boolean {
  const profileIds = new Set(value.profiles.map((profile) => profile.id))
  const barberIds = new Set(value.barbers.map((barber) => barber.id))
  const serviceIds = new Set(value.services.map((service) => service.id))
  const shopIds = new Set(value.shops.map((shop) => shop.id))
  const conversationIds = new Set(value.conversations.map((conversation) => conversation.id))
  const appointmentIds = new Set(value.appointments.map((appointment) => appointment.id))

  if (value.barbers.some((barber) => !profileIds.has(barber.id))) return false
  if (value.shops.some((shop) => shop.barber_ids.some((id) => !barberIds.has(id)))) return false
  if (value.shops.some((shop) => shop.owner_id !== null && !profileIds.has(shop.owner_id))) return false
  if (value.rules.some((rule) => !barberIds.has(rule.barber_id))) return false
  if (value.overrides.some((override) => !barberIds.has(override.barber_id))) return false
  if (value.appointments.some((appointment) => (
    !profileIds.has(appointment.customer_id)
    || !barberIds.has(appointment.barber_id)
    || !serviceIds.has(appointment.service_id)
    || !shopIds.has(appointment.shop_id)
  ))) return false
  if (value.conversations.some((conversation) => {
    const shop = value.shops.find((candidate) => candidate.id === conversation.shop_id)
    if (
      !profileIds.has(conversation.customer_id)
      || !barberIds.has(conversation.barber_id)
      || !shop
    ) return true
    // Internal owner-to-staff threads retain their original participants after
    // a barber leaves. Public customer threads still require a current shop
    // representative so customers never write to an unstaffed inbox.
    const isStaffThread = shop.owner_id !== null && conversation.customer_id === shop.owner_id
    return !isStaffThread && !shop.barber_ids.includes(conversation.barber_id)
  })) return false
  if (value.messages.some((message) => !conversationIds.has(message.conversation_id) || !profileIds.has(message.sender_id))) return false
  if (value.reviews.some((review) => (
    !appointmentIds.has(review.appointment_id)
    || !profileIds.has(review.customer_id)
    || !barberIds.has(review.barber_id)
    || !shopIds.has(review.shop_id)
    || value.appointments.find((appointment) => appointment.id === review.appointment_id)?.shop_id !== review.shop_id
  ))) return false
  if (value.hiringListings.some((listing) => !shopIds.has(listing.shop_id))) return false
  if (value.barberApplications.some((application) => (
    !profileIds.has(application.barber_id) || !shopIds.has(application.shop_id)
  ))) return false
  if (value.employments.some((employmentRecord) => (
    !barberIds.has(employmentRecord.barber_id) || !shopIds.has(employmentRecord.shop_id)
  ))) return false
  if (value.absences.some((absence) => (
    !barberIds.has(absence.barber_id) || !shopIds.has(absence.shop_id)
  ))) return false
  if (value.shiftChangeRequests.some((request) => (
    !barberIds.has(request.barber_id) || !shopIds.has(request.shop_id)
  ))) return false
  if (value.staffNotes.some((note) => (
    !barberIds.has(note.barber_id) || !shopIds.has(note.shop_id) || !profileIds.has(note.author_id)
  ))) return false
  return true
}

function isBroadcastMsg(value: unknown): value is BroadcastMsg {
  if (!isRecord(value)) return false
  if (value.type === 'db') return true
  return value.type === 'message'
    && typeof value.conversationId === 'string'
    && typeof value.messageId === 'string'
}

export function createMockBackend(): DataBackend {
  let db: MockDB = loadDB()
  let lastSerializedDB = JSON.stringify(db)
  let lastObservedStorage = localStorage.getItem(DB_KEY) ?? lastSerializedDB

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
        const previousVersion = parsed.version
        const stored = migrateDB(parsed)
        if (!hasValidReferences(stored)) throw new Error('Invalid mock database references.')
        if (stored.version !== previousVersion) {
          localStorage.setItem(DB_KEY, JSON.stringify(stored))
          if (previousVersion < 18) localStorage.removeItem('bsh_prefs')
        }
        return stored
      }
    } catch {
      /* ignore */
    }
    const seed = buildSeed()
    // Device-only notification settings were part of the mock phase, not an
    // account record. Start clean; the real preference table comes next.
    localStorage.removeItem('bsh_prefs')
    localStorage.setItem(DB_KEY, JSON.stringify(seed))
    return seed
  }

  function persist(broadcast = true) {
    lastSerializedDB = JSON.stringify(db)
    localStorage.setItem(DB_KEY, lastSerializedDB)
    lastObservedStorage = lastSerializedDB
    if (broadcast) channel?.postMessage({ type: 'db' } satisfies BroadcastMsg)
  }

  function reloadFromStorage() {
    try {
      const raw = localStorage.getItem(DB_KEY)
      if (raw && raw !== lastObservedStorage) {
        const parsed: unknown = JSON.parse(raw)
        if (isStoredMockDB(parsed)) {
          const stored = migrateDB(parsed)
          if (!hasValidReferences(stored)) return
          db = stored
          lastObservedStorage = raw
          lastSerializedDB = JSON.stringify(stored)
        }
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Serialize all read-modify-write operations across same-origin tabs. The
   * Web Locks API is available in the Chromium browsers targeted by this demo;
   * the synchronous fallback still reloads immediately before writing.
   */
  async function withDatabaseWrite<T>(mutation: () => T | Promise<T>): Promise<T> {
    const run = async () => {
      reloadFromStorage()
      const result = await mutation()
      persist()
      return result
    }
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('philabantay-mock-db-write', run)
    }
    return run()
  }

  const credentialUpgrade = hardenLegacyPasswords()

  async function hardenLegacyPasswords() {
    const legacy = Object.entries(db.passwords).filter(([, password]) => !isPasswordHash(password))
    if (legacy.length === 0) return
    const upgraded = await Promise.all(
      legacy.map(async ([email, password]) => [email, await hashPassword(password)] as const),
    )
    await withDatabaseWrite(() => {
      upgraded.forEach(([email, password]) => {
        if (!isPasswordHash(db.passwords[email] ?? '')) db.passwords[email] = password
      })
    })
  }

  if (channel) {
    channel.onmessage = (e: MessageEvent<unknown>) => {
      const data = e.data
      if (!isBroadcastMsg(data)) return
      if (data.type === 'db') {
        reloadFromStorage()
      } else if (data.type === 'message') {
        reloadFromStorage()
        const msg = db.messages.find((candidate) => candidate.id === data.messageId)
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
  function appointmentDetailed(a: Appointment): AppointmentDetailed | null {
    const service = db.services.find((s) => s.id === a.service_id)
    const barber = db.barbers.find((b) => b.id === a.barber_id)
    const customer = profileById(a.customer_id)
    const shop = db.shops.find((candidate) => candidate.id === a.shop_id)
    if (!service || !barber || !customer || !shop || !profileById(barber.id)) return null
    return {
      ...clone(a),
      service: clone(service),
      barber: barberWithProfile(barber),
      customer: publicProfile(customer),
      shop: clone(shop),
    }
  }
  function conversationDetailed(c: Conversation, viewerId: string): ConversationDetailed | null {
    const customer = profileById(c.customer_id)
    const shop = db.shops.find((candidate) => candidate.id === c.shop_id)
    const barber = db.barbers.find((candidate) => candidate.id === c.barber_id)
    if (!customer || !shop || !barber || !profileById(barber.id)) return null
    const msgs = db.messages
      .filter((m) => m.conversation_id === c.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const last = msgs.at(-1) ?? null
    const unread = msgs.filter((m) => m.sender_id !== viewerId && m.read_at === null).length
    return {
      ...clone(c),
      customer: publicProfile(customer),
      shop: clone(shop),
      barber: barberWithProfile(barber),
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
      const phone = normalizePhone(input.phone ?? '') || null
      const emailError = validateEmail(email)
      if (emailError) throw new DataError('validation', emailError)
      const phoneError = validatePhone(input.phone ?? '')
      if (phoneError) throw new DataError('validation', phoneError)
      // Same field rules as the form, enforced sa data layer para hindi
      // malusutan kahit i-bypass ang UI validation.
      const nameError = validateFullName(input.full_name)
      if (nameError) throw new DataError('validation', nameError)
      const passwordError = validatePassword(input.password)
      if (passwordError) throw new DataError('validation', passwordError)
      // PBKDF2 is intentionally slow. Finish it before touching shared state so
      // a cross-tab storage event cannot split the profile/password write.
      const passwordHash = await hashPassword(input.password)
      const profile = await withDatabaseWrite(() => {
        if (db.emailToId[email]) throw new DataError('email_taken', 'That email is already registered.')
        if (phone && db.profiles.some((candidate) => normalizePhone(candidate.phone ?? '') === phone)) {
          throw new DataError('validation', 'That phone number is already registered.')
        }
        const id = uid('u')
        const created: Profile = {
          id,
          // IMPORTANT: signup never grants professional access.
          role: 'customer',
          requested_role: null,
          verification_status: 'unverified',
          onboarding_completed: false,
          full_name: input.full_name.trim(),
          email,
          phone,
          location: null,
          avatar_url: null,
          created_at: nowISO(),
        }
        db.profiles.push(created)
        db.passwords[email] = passwordHash
        db.emailToId[email] = id
        return clone(created)
      })
      setSession(profile.id)
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
      const normalizedIdentifier = normalizePhone(identifier)
      const phoneId = db.profiles.find((profile) => (
        normalizedIdentifier && normalizePhone(profile.phone ?? '') === normalizedIdentifier
      ))?.id
      const id = directId ?? phoneId
      const email = Object.entries(db.emailToId).find(([, profileId]) => profileId === id)?.[0]
      const storedPassword = email ? db.passwords[email] : undefined
      // Unknown accounts still pay the same PBKDF2 cost, avoiding an account
      // existence timing oracle if this mock ever runs behind a remote shell.
      const passwordMatches = await verifyPassword(input.password, storedPassword ?? DUMMY_PASSWORD_HASH)
      if (!id || !email || !storedPassword || !passwordMatches) {
        throw new DataError('invalid_credentials', 'Wrong email/phone or password.')
      }
      if (!isPasswordHash(storedPassword)) {
        const upgraded = await hashPassword(input.password)
        await withDatabaseWrite(() => {
          if (!isPasswordHash(db.passwords[email] ?? '')) db.passwords[email] = upgraded
        })
      }
      setSession(id)
      const signedInProfile = profileById(id)
      if (!signedInProfile) throw new DataError('invalid_credentials', 'Wrong email/phone or password.')
      return clone(signedInProfile)
    },

    async completeRoleOnboarding(input) {
      await delay()
      const allowed = ['customer', 'barber', 'shop_owner'] as const
      if (!allowed.includes(input.role)) {
        throw new DataError('validation', 'Hindi valid ang napiling account type.')
      }
      const profile = await withDatabaseWrite(() => {
        const current = requireUser()
        // One-time endpoint ito para hindi paulit-ulit makagawa ng applications.
        if (current.onboarding_completed) {
          if (current.requested_role === input.role) return clone(current)
          throw new DataError('forbidden', 'Napili mo na ang account type. Contact support para magpalit.')
        }

        current.requested_role = input.role
        current.onboarding_completed = true
        current.avatar_url ||= input.role === 'barber'
          ? 'doodle:barber-1'
          : input.role === 'shop_owner'
            ? 'doodle:owner-1'
            : 'doodle:customer-1'
        if (input.role === 'customer') {
          current.role = 'customer'
          current.verification_status = 'not_required'
        } else {
          // HUWAG gumawa ng barber/shop record dito. Request lang muna ito;
          // trusted server/admin review lang ang puwedeng mag-promote ng role.
          current.role = 'customer'
          current.verification_status = 'pending'
        }
        return clone(current)
      })
      setSession(profile.id)
      return clone(profile)
    },

    async updateProfile(input) {
      await delay()
      const profile = await withDatabaseWrite(() => {
        const current = requireUser()

        if (input.full_name !== undefined) {
          const nameError = validateFullName(input.full_name)
          if (nameError) throw new DataError('validation', nameError)
          current.full_name = input.full_name.trim()
        }
        if (input.email !== undefined) {
          const email = input.email.trim().toLowerCase()
          const emailError = validateEmail(email)
          if (emailError) throw new DataError('validation', emailError)
          const ownerId = db.emailToId[email]
          if (ownerId && ownerId !== current.id) throw new DataError('email_taken', 'That email is already registered.')
          if (email !== current.email) {
            const currentPassword = db.passwords[current.email]
            delete db.emailToId[current.email]
            delete db.passwords[current.email]
            db.emailToId[email] = current.id
            if (currentPassword) db.passwords[email] = currentPassword
            current.email = email
          }
        }
        if (input.phone !== undefined) {
          const phoneError = validatePhone(input.phone ?? '')
          if (phoneError) throw new DataError('validation', phoneError)
          const phone = normalizePhone(input.phone ?? '') || null
          if (phone && db.profiles.some((candidate) => (
            candidate.id !== current.id && normalizePhone(candidate.phone ?? '') === phone
          ))) throw new DataError('validation', 'That phone number is already registered.')
          current.phone = phone
        }
        if (input.location !== undefined) {
          const location = input.location?.trim() || null
          if ((location?.length ?? 0) > 100) throw new DataError('validation', 'Location is too long.')
          current.location = location
        }
        if (input.avatar_url !== undefined) {
          if (!DOODLE_AVATAR_PATTERN.test(input.avatar_url)) {
            throw new DataError('validation', 'Hindi valid ang napiling doodle avatar.')
          }
          // Gear is a role-locked reward: enforce role + completed-cut
          // unlocks dito, hindi lang sa studio UI. Customer gear counts cuts
          // RECEIVED; barber gear counts cuts SERVED sa chair nila.
          const gear = input.avatar_url.split(':')[10]
          if (gear && gear !== 'none') {
            const isCustomerGear = gear in CUSTOMER_GEAR_UNLOCKS
            const requiredRole = isCustomerGear ? 'customer' : 'barber'
            if (current.role !== requiredRole) {
              throw new DataError('forbidden', isCustomerGear
                ? 'Customer accounts lang ang may ganitong gear rewards.'
                : 'Barber accounts lang ang may ganitong gear rewards.')
            }
            const completedCuts = db.appointments.filter((appointment) => (
              appointment.status === 'completed'
              && (isCustomerGear
                ? appointment.customer_id === current.id
                : appointment.barber_id === current.id)
            )).length
            const unlockAt = (isCustomerGear ? CUSTOMER_GEAR_UNLOCKS : BARBER_GEAR_UNLOCKS)[gear]
              ?? Number.POSITIVE_INFINITY
            if (completedCuts < unlockAt) {
              throw new DataError('validation', `Naka-lock pa ang gear na ito. Kailangan ng ${unlockAt} completed cut${unlockAt === 1 ? '' : 's'}.`)
            }
          }
          current.avatar_url = input.avatar_url
        }
        return clone(current)
      })
      setSession(profile.id)
      return clone(profile)
    },

    async changePassword(input) {
      await delay()
      await credentialUpgrade
      const passwordError = validatePassword(input.new_password)
      if (passwordError) throw new DataError('validation', passwordError)
      if (input.current_password === input.new_password) {
        throw new DataError('validation', 'Pumili ng bagong password na iba sa kasalukuyan.')
      }
      await withDatabaseWrite(async () => {
        const profile = requireUser()
        const storedPassword = db.passwords[profile.email]
        if (!storedPassword || !(await verifyPassword(input.current_password, storedPassword))) {
          throw new DataError('invalid_credentials', 'Mali ang current password.')
        }
        const nextPassword = await hashPassword(input.new_password)
        db.passwords[profile.email] = nextPassword
      })
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
      return withDatabaseWrite(() => {
        const user = requireUser()
        const b = db.barbers.find((x) => x.id === user.id)
        if (!b) throw new DataError('forbidden', 'Only barbers can set shift status.')
        // System-driven ang shift end: kapag nasa loob pa ng scheduled hours,
        // bawal ang manual na early end (UI has no button; enforce it here too).
        if (!on && isWithinHours(
          new Date(),
          db.rules.filter((rule) => rule.barber_id === b.id),
          db.overrides.filter((override) => override.barber_id === b.id),
        )) {
          throw new DataError('validation', 'Awtomatikong magtatapos ang shift sa scheduled end time — hindi ito puwedeng tapusin nang maaga.')
        }
        b.shift_status = on ? 'on' : 'off'
        return clone(b)
      })
    },

    async setAcceptingBookings(accepting) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const b = db.barbers.find((x) => x.id === user.id)
        if (!b) throw new DataError('forbidden', 'Only barbers can change this.')
        b.accepting_bookings = accepting
        return clone(b)
      })
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

  // ================= BarberEmploymentService =================
  function requireBarberCandidate(): Profile {
    const user = requireUser()
    if (user.role !== 'barber' && user.requested_role !== 'barber') {
      throw new DataError('forbidden', 'Barber accounts lang ang puwedeng gumamit ng hiring tools.')
    }
    return user
  }

  /** Owner tools guard: verified owner + their registered shop. */
  function requireOwnedShop(): Shop {
    const user = requireUser()
    if (user.role !== 'shop_owner') {
      throw new DataError('forbidden', 'Shop owners lang ang puwedeng gumamit nito.')
    }
    const shop = db.shops.find((candidate) => candidate.owner_id === user.id)
    if (!shop) throw new DataError('not_found', 'Wala pang registered shop sa owner account na ito.')
    return shop
  }

  function currentShopFor(barberId: string): Shop | null {
    return db.shops.find((shop) => shop.barber_ids.includes(barberId)) ?? null
  }

  const employment: DataBackend['employment'] = {
    async listHiringShops() {
      await delay(50)
      reloadFromStorage()
      requireBarberCandidate()
      return db.hiringListings
        .filter((listing) => listing.accepting_applications && listing.open_positions > 0)
        .flatMap((listing): HiringShop[] => {
          const shop = db.shops.find((candidate) => candidate.id === listing.shop_id)
          return shop ? [{ ...shopWithStatus(shop), hiring: clone(listing) }] : []
        })
    },

    async getMyShop() {
      await delay(40)
      reloadFromStorage()
      const user = requireBarberCandidate()
      const shop = currentShopFor(user.id)
      return shop ? shopWithStatus(shop) : null
    },

    async listMyApplications() {
      await delay(40)
      reloadFromStorage()
      const user = requireBarberCandidate()
      return db.barberApplications
        .filter((application) => application.barber_id === user.id)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .map(clone)
    },

    async apply(shopId) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireBarberCandidate()
        if (currentShopFor(user.id)) {
          throw new DataError('validation', 'Member ka na ng isang barbershop.')
        }
        const listing = db.hiringListings.find((candidate) => candidate.shop_id === shopId)
        if (!listing || !listing.accepting_applications || listing.open_positions < 1) {
          throw new DataError('validation', 'Hindi na tumatanggap ng application ang shop na ito.')
        }
        const existing = db.barberApplications.find((application) => (
          application.barber_id === user.id && application.shop_id === shopId
        ))
        if (existing) return clone(existing)
        const timestamp = nowISO()
        const application: BarberApplication = {
          id: uid('application'),
          barber_id: user.id,
          shop_id: shopId,
          status: 'pending',
          created_at: timestamp,
          updated_at: timestamp,
        }
        db.barberApplications.push(application)
        return clone(application)
      })
    },

    async joinWithCode(input) {
      await delay()
      const code = input.code.trim().toUpperCase()
      if (!/^[A-Z0-9-]{4,24}$/.test(code)) {
        throw new DataError('validation', 'Maglagay ng valid shop join code.')
      }
      const userId = requireBarberCandidate().id
      const joinedShop = await withDatabaseWrite(() => {
        const user = requireBarberCandidate()
        const shopId = db.shopJoinCodes[code]
        const shop = db.shops.find((candidate) => candidate.id === shopId)
        if (!shop) throw new DataError('validation', 'Mali o expired ang shop code.')
        const currentShop = currentShopFor(user.id)
        if (currentShop && currentShop.id !== shop.id) {
          const replacementBarberId = currentShop.barber_ids.find((barberId) => barberId !== user.id)
          const conversationsToReassign = db.conversations.filter((conversation) => (
            conversation.shop_id === currentShop.id
            && conversation.barber_id === user.id
            // Keep a private owner-to-staff thread attached to the staff member
            // who actually participated in it, even after they leave the shop.
            && conversation.customer_id !== currentShop.owner_id
          ))
          if (conversationsToReassign.length > 0 && !replacementBarberId) {
            throw new DataError('validation', 'Hindi ka pa puwedeng lumipat dahil ikaw ang huling shop representative sa active chat. Magpa-assign muna ng replacement sa owner.')
          }
          conversationsToReassign.forEach((conversation) => {
            conversation.barber_id = replacementBarberId!
          })
          // A valid code is the mock's transfer flow: leave the old roster and
          // close that stint below before adding the barber to the new shop.
          // Existing appointments retain their own shop_id; shop chats move to
          // another current staff member before this barber loses access.
          currentShop.barber_ids = currentShop.barber_ids.filter((barberId) => barberId !== user.id)
        }

        const wasAlreadyMember = shop.barber_ids.includes(user.id)
        const existingBarber = db.barbers.find((barber) => barber.id === user.id)
        if (!existingBarber) {
          db.barbers.push({
            id: user.id,
            bio: null,
            rating: 0,
            rating_count: 0,
            shift_status: 'off',
            accepting_bookings: false,
            created_at: nowISO(),
          })
        } else if (currentShop && currentShop.id !== shop.id) {
          // Starting at another shop requires a fresh explicit "Start shift".
          existingBarber.shift_status = 'off'
        }
        if (!shop.barber_ids.includes(user.id)) shop.barber_ids.push(user.id)

        // Employment lifecycle: isara ang lumang stint at magbukas ng bago.
        // Dito nagre-reset ang attendance history — per shop ang scope.
        const today = localDateKey(new Date())
        db.employments.forEach((employmentRecord) => {
          if (
            employmentRecord.barber_id === user.id
            && employmentRecord.ended_at === null
            && employmentRecord.shop_id !== shop.id
          ) employmentRecord.ended_at = today
        })
        if (!db.employments.some((employmentRecord) => (
          employmentRecord.barber_id === user.id
          && employmentRecord.shop_id === shop.id
          && employmentRecord.ended_at === null
        ))) {
          db.employments.push({
            id: uid('emp'),
            barber_id: user.id,
            shop_id: shop.id,
            hired_at: today,
            ended_at: null,
          })
        }

        const hiringListing = db.hiringListings.find((listing) => listing.shop_id === shop.id)
        if (hiringListing && !wasAlreadyMember) {
          hiringListing.open_positions = Math.max(0, hiringListing.open_positions - 1)
          hiringListing.accepting_applications = hiringListing.open_positions > 0
          hiringListing.updated_at = nowISO()
        }

        if (!db.rules.some((rule) => rule.barber_id === user.id)) {
          for (const weekday of [1, 2, 3, 4, 5, 6] as const) {
            db.rules.push({
              id: uid('rule'),
              barber_id: user.id,
              weekday,
              start_time: '09:00',
              end_time: '18:00',
              created_at: nowISO(),
            })
          }
        }

        user.role = 'barber'
        user.requested_role = 'barber'
        user.verification_status = 'verified'
        user.onboarding_completed = true
        user.avatar_url ||= 'doodle:barber-1'
        const timestamp = nowISO()
        db.barberApplications.forEach((application) => {
          if (application.barber_id !== user.id) return
          application.status = application.shop_id === shop.id ? 'accepted' : 'declined'
          application.updated_at = timestamp
        })
        return shopWithStatus(shop)
      })
      // Refresh AuthContext immediately so the menu and dashboard switch from
      // job seeker to employed without requiring a reload.
      setSession(userId)
      return joinedShop
    },

    async getMyShopJoinCode() {
      await delay(40)
      reloadFromStorage()
      const user = requireUser()
      if (user.role !== 'shop_owner') throw new DataError('forbidden', 'Shop owners lang ang makakakita ng join code.')
      const shop = db.shops.find((candidate) => candidate.owner_id === user.id)
      if (!shop) return null
      const code = Object.entries(db.shopJoinCodes).find(([, shopId]) => shopId === shop.id)?.[0]
      return code ? { shop: shopWithStatus(shop), code } : null
    },

    async rotateMyShopJoinCode() {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        if (user.role !== 'shop_owner') throw new DataError('forbidden', 'Shop owners lang ang puwedeng gumawa ng join code.')
        const shop = db.shops.find((candidate) => candidate.owner_id === user.id)
        if (!shop) throw new DataError('not_found', 'Wala pang registered shop sa owner account na ito.')
        Object.entries(db.shopJoinCodes).forEach(([code, shopId]) => {
          if (shopId === shop.id) delete db.shopJoinCodes[code]
        })
        let code = newJoinCode()
        while (db.shopJoinCodes[code]) code = newJoinCode()
        db.shopJoinCodes[code] = shop.id
        return { shop: shopWithStatus(shop), code }
      })
    },

    async getMyEmployment() {
      await delay(40)
      reloadFromStorage()
      const user = requireBarberCandidate()
      const active = db.employments.find((employmentRecord) => (
        employmentRecord.barber_id === user.id && employmentRecord.ended_at === null
      ))
      return active ? clone(active) : null
    },

    async listMyAbsences() {
      await delay(40)
      reloadFromStorage()
      const user = requireBarberCandidate()
      const active = db.employments.find((employmentRecord) => (
        employmentRecord.barber_id === user.id && employmentRecord.ended_at === null
      ))
      if (!active) return []
      // Fresh start per shop: kasalukuyang stint lang ang binibilang.
      return db.absences
        .filter((absence) => (
          absence.barber_id === user.id
          && absence.shop_id === active.shop_id
          && absence.date >= active.hired_at
        ))
        .map(clone)
    },

    async listMyShiftChangeRequests() {
      await delay(40)
      reloadFromStorage()
      const user = requireBarberCandidate()
      const active = db.employments.find((employmentRecord) => (
        employmentRecord.barber_id === user.id && employmentRecord.ended_at === null
      ))
      if (!active) return []
      return db.shiftChangeRequests
        .filter((request) => (
          request.barber_id === user.id
          && request.shop_id === active.shop_id
          && request.date >= active.hired_at
        ))
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .map(clone)
    },

    async requestShiftChange(input) {
      await delay()
      if (!parseLocalDateKey(input.date)) {
        throw new DataError('validation', 'Invalid shift date.')
      }
      const message = input.message.trim()
      if (message.length < 3 || message.length > 300) {
        throw new DataError('validation', 'Ilagay ang request details (3 hanggang 300 characters).')
      }
      return withDatabaseWrite(() => {
        const user = requireBarberCandidate()
        const active = db.employments.find((employmentRecord) => (
          employmentRecord.barber_id === user.id && employmentRecord.ended_at === null
        ))
        if (!active) throw new DataError('forbidden', 'Kailangan mo munang sumali sa isang shop.')
        if (input.date < active.hired_at) {
          throw new DataError('validation', 'Hindi pa active ang employment mo sa napiling araw.')
        }
        if (input.date < localDateKey(new Date())) {
          throw new DataError('validation', 'Mga darating na shift lang ang puwedeng i-request.')
        }
        const blocks = effectiveBlocks(
          input.date,
          db.rules.filter((rule) => rule.barber_id === user.id),
          db.overrides.filter((override) => override.barber_id === user.id),
        )
        if (blocks.length === 0) {
          throw new DataError('validation', 'May shift lang ang puwedeng i-request na baguhin.')
        }
        if (db.absences.some((absence) => (
          absence.barber_id === user.id
          && absence.shop_id === active.shop_id
          && absence.date === input.date
        ))) {
          throw new DataError('validation', 'Naka-record ka nang absent sa araw na ito.')
        }
        const existing = db.shiftChangeRequests.find((request) => (
          request.barber_id === user.id
          && request.shop_id === active.shop_id
          && request.date === input.date
          && request.status === 'pending'
        ))
        if (existing) {
          throw new DataError('validation', 'May pending request ka na para sa araw na ito.')
        }
        const timestamp = nowISO()
        const request = {
          id: uid('scr'),
          barber_id: user.id,
          shop_id: active.shop_id,
          date: input.date,
          message,
          status: 'pending' as const,
          created_at: timestamp,
          updated_at: timestamp,
        }
        db.shiftChangeRequests.push(request)
        return clone(request)
      })
    },

    async listMyShopStaff() {
      await delay(50)
      reloadFromStorage()
      const shop = requireOwnedShop()
      return shop.barber_ids.flatMap((barberId) => {
        const barberRecord = db.barbers.find((candidate) => candidate.id === barberId)
        const employmentRecord = db.employments.find((candidate) => (
          candidate.barber_id === barberId && candidate.shop_id === shop.id && candidate.ended_at === null
        ))
        if (!barberRecord || !employmentRecord || !profileById(barberId)) return []
        return [{
          barber: barberWithProfile(barberRecord),
          employment: clone(employmentRecord),
          rules: db.rules.filter((rule) => rule.barber_id === barberId).map(clone),
          absences: db.absences
            .filter((absence) => (
              absence.barber_id === barberId
              && absence.shop_id === shop.id
              && absence.date >= employmentRecord.hired_at
            ))
            .map(clone),
          shiftChangeRequests: db.shiftChangeRequests
            .filter((request) => request.barber_id === barberId && request.shop_id === shop.id)
            .sort((left, right) => right.created_at.localeCompare(left.created_at))
            .map(clone),
          notes: db.staffNotes
            .filter((note) => note.barber_id === barberId && note.shop_id === shop.id)
            .sort((left, right) => right.created_at.localeCompare(left.created_at))
            .map(clone),
        }]
      })
    },

    async setBarberRules(barberId, rules) {
      await delay()
      assertValidWeeklyRules(rules)
      return withDatabaseWrite(() => {
        const shop = requireOwnedShop()
        if (!shop.barber_ids.includes(barberId)) {
          throw new DataError('forbidden', 'Hindi mo staff ang barber na iyan.')
        }
        db.rules = db.rules.filter((rule) => rule.barber_id !== barberId)
        const created: AvailabilityRule[] = rules.map((rule) => ({
          id: uid('r'),
          barber_id: barberId,
          weekday: rule.weekday,
          start_time: rule.start_time,
          end_time: rule.end_time,
          created_at: nowISO(),
        }))
        db.rules.push(...created)
        return created.map(clone)
      })
    },

    async resolveShiftChangeRequest(requestId, status) {
      await delay()
      if (status !== 'approved' && status !== 'declined') {
        throw new DataError('validation', 'Invalid na desisyon sa request.')
      }
      return withDatabaseWrite(() => {
        const shop = requireOwnedShop()
        const request = db.shiftChangeRequests.find((candidate) => candidate.id === requestId)
        if (!request || request.shop_id !== shop.id) {
          throw new DataError('not_found', 'Walang ganyang request sa shop mo.')
        }
        if (request.status !== 'pending') {
          throw new DataError('validation', 'Na-resolve na ang request na ito.')
        }
        request.status = status
        request.updated_at = nowISO()
        return clone(request)
      })
    },

    async addStaffNote(input) {
      await delay()
      const body = input.body.trim()
      if (body.length < 3 || body.length > 500) {
        throw new DataError('validation', 'Ang note ay dapat 3 hanggang 500 characters.')
      }
      return withDatabaseWrite(() => {
        const shop = requireOwnedShop()
        const user = requireUser()
        if (!shop.barber_ids.includes(input.barber_id)) {
          throw new DataError('forbidden', 'Hindi mo staff ang barber na iyan.')
        }
        const note = {
          id: uid('note'),
          shop_id: shop.id,
          barber_id: input.barber_id,
          author_id: user.id,
          body,
          created_at: nowISO(),
        }
        db.staffNotes.push(note)
        return clone(note)
      })
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
      return withDatabaseWrite(() => {
        const user = requireUser()
        if (!db.shops.some((s) => s.id === shopId)) {
          throw new DataError('not_found', 'Walang ganyang barbershop.')
        }
        const current = db.favorites[user.id] ?? []
        db.favorites[user.id] = current.includes(shopId)
          ? current.filter((id) => id !== shopId)
          : [...current, shopId]
        return [...db.favorites[user.id]]
      })
    },

    async listBarbers() {
      await delay(40)
      reloadFromStorage()
      const user = requireUser()
      return [...(db.favoriteBarbers[user.id] ?? [])]
    },

    async toggleBarber(barberId) {
      await delay(40)
      return withDatabaseWrite(() => {
        const user = requireUser()
        if (!db.barbers.some((barber) => barber.id === barberId)) {
          throw new DataError('not_found', 'Walang ganyang barber.')
        }
        const current = db.favoriteBarbers[user.id] ?? []
        db.favoriteBarbers[user.id] = current.includes(barberId)
          ? current.filter((id) => id !== barberId)
          : [...current, barberId]
        return [...db.favoriteBarbers[user.id]]
      })
    },
  }

  // ================= ReviewService =================
  const reviews: DataBackend['reviews'] = {
    async listMine() {
      await delay(40)
      reloadFromStorage()
      const user = requireUser()
      return db.reviews.filter((review) => review.customer_id === user.id).map(clone)
    },

    async rateAppointment(input) {
      await delay()
      const comment = input.comment?.trim() || null
      if ((comment?.length ?? 0) > 500) throw new DataError('validation', 'Review is too long.')
      if (![input.barber_rating, input.shop_rating].every((score) => Number.isInteger(score) && score >= 1 && score <= 5)) {
        throw new DataError('validation', 'Pumili ng 1 hanggang 5 stars para sa barber at barbershop.')
      }
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === input.appointment_id)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        if (appointment.customer_id !== user.id) throw new DataError('forbidden', 'Sarili mong appointment lang ang puwedeng i-rate.')
        if (appointment.status !== 'completed') throw new DataError('validation', 'Completed cuts lang ang puwedeng i-rate.')
        const barber = db.barbers.find((candidate) => candidate.id === appointment.barber_id)
        const shop = db.shops.find((candidate) => candidate.id === appointment.shop_id)
        if (!barber || !shop) throw new DataError('not_found', 'Barber or barbershop not found.')

        const existing = db.reviews.find((review) => review.appointment_id === appointment.id)
        updateAggregate(barber, existing?.barber_rating ?? null, input.barber_rating)
        updateAggregate(shop, existing?.shop_rating ?? null, input.shop_rating)
        const timestamp = nowISO()
        if (existing) {
          existing.barber_rating = input.barber_rating
          existing.shop_rating = input.shop_rating
          existing.comment = comment
          existing.updated_at = timestamp
          return clone(existing)
        }
        const review: Review = {
          id: uid('review'),
          appointment_id: appointment.id,
          customer_id: user.id,
          barber_id: appointment.barber_id,
          shop_id: shop.id,
          barber_rating: input.barber_rating,
          shop_rating: input.shop_rating,
          comment,
          created_at: timestamp,
          updated_at: timestamp,
        }
        db.reviews.push(review)
        return clone(review)
      })
    },
  }

  // ================= SupportService =================
  const support: DataBackend['support'] = {
    async reportBug(input) {
      await delay()
      const categories = ['visual', 'booking', 'map', 'chat', 'account', 'other'] as const
      if (!categories.includes(input.category)) throw new DataError('validation', 'Pumili ng valid bug category.')
      const summary = input.summary.trim()
      const description = input.description.trim()
      const pageUrl = input.page_url?.trim() || null
      if (summary.length < 5 || summary.length > 120) {
        throw new DataError('validation', 'Ang summary ay dapat 5 hanggang 120 characters.')
      }
      if (description.length < 10 || description.length > 2000) {
        throw new DataError('validation', 'Ang details ay dapat 10 hanggang 2000 characters.')
      }
      if ((pageUrl?.length ?? 0) > 500) throw new DataError('validation', 'Page URL is too long.')
      return withDatabaseWrite(() => {
        const user = requireUser()
        const report = {
          id: uid('bug'),
          user_id: user.id,
          category: input.category,
          summary,
          description,
          page_url: pageUrl,
          created_at: nowISO(),
        }
        db.bugReports.push(report)
        return clone(report)
      })
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
      return db.overrides
        .filter((override) => override.barber_id === barberId)
        .map(({ reason: _privateReason, ...override }) => clone(override))
    },

    async getMyOverrides() {
      await delay(50)
      reloadFromStorage()
      const user = requireUser()
      if (!db.barbers.some((barber) => barber.id === user.id)) {
        throw new DataError('forbidden', 'Only barbers can read private availability notes.')
      }
      return db.overrides.filter((override) => override.barber_id === user.id).map(clone)
    },

    async setRules(rules: AvailabilityRuleInput[]) {
      await delay()
      assertValidWeeklyRules(rules)

      return withDatabaseWrite(() => {
        const user = requireUser()
        if (!db.barbers.some((b) => b.id === user.id)) {
          throw new DataError('forbidden', 'Only barbers set availability.')
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
        return created.map(clone)
      })
    },

    async addOverride(input: AvailabilityOverrideInput) {
      await delay()
      if (!parseLocalDateKey(input.date)) {
        throw new DataError('validation', 'Invalid override date.')
      }
      const hasStart = Boolean(input.start_time)
      const hasEnd = Boolean(input.end_time)
      if (hasStart !== hasEnd || (input.start_time && input.end_time && !validTimeRange(input.start_time, input.end_time))) {
        throw new DataError('validation', 'Invalid override hours.')
      }
      const reason = input.reason?.trim() || null
      if (reason && reason.length > 300) throw new DataError('validation', 'Override reason is too long.')
      return withDatabaseWrite(() => {
        const user = requireUser()
        if (!db.barbers.some((b) => b.id === user.id)) {
          throw new DataError('forbidden', 'Only barbers set availability.')
        }
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
        return clone(override)
      })
    },

    async removeOverride(overrideId) {
      await delay()
      await withDatabaseWrite(() => {
        const user = requireUser()
        const existing = db.overrides.find((override) => override.id === overrideId)
        if (!existing) return
        if (existing.barber_id !== user.id) throw new DataError('forbidden', 'Not your availability override.')
        db.overrides = db.overrides.filter((override) => override.id !== overrideId)
      })
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

    const shop = db.shops.find((candidate) => candidate.barber_ids.includes(barber.id))
    if (!shop) throw new DataError('not_found', 'Barber is not assigned to a barbershop.')

    const service = db.services.find((candidate) => candidate.id === input.service_id && candidate.active)
    if (!service) throw new DataError('not_found', 'Service not found.')
    const start = new Date(input.starts_at)
    if (!Number.isFinite(start.getTime())) throw new DataError('validation', 'Invalid appointment time.')
    const normalizedStart = start.toISOString()
    const date = localDateKey(start)
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
      shop,
      start,
      end: new Date(start.getTime() + service.duration_min * 60_000),
      notes,
    }
  }

  const bookings: DataBackend['bookings'] = {
    async create(input: CreateAppointmentInput) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const { shop, start, end, notes } = validateBookingInput(input, user)
        const appt: Appointment = {
          id: uid('a'),
          customer_id: user.id,
          barber_id: input.barber_id,
          shop_id: shop.id,
          service_id: input.service_id,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          status: 'pending',
          notes,
          created_at: nowISO(),
          updated_at: nowISO(),
        }
        db.appointments.push(appt)
        return clone(appt)
      })
    },

    async reschedule(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        if (appointment.customer_id !== user.id) {
          throw new DataError('forbidden', 'Only the customer can reschedule this appointment.')
        }
        if (appointment.status !== 'pending' && appointment.status !== 'confirmed') {
          throw new DataError('validation', 'Only an active appointment can be rescheduled.')
        }
        if (!canModifyAppointment(appointment)) {
          throw new DataError('validation', 'A haircut that has already started cannot be rescheduled.')
        }
        const { shop, start, end, notes } = validateBookingInput(input, user, appointment.id)
        appointment.barber_id = input.barber_id
        appointment.shop_id = shop.id
        appointment.service_id = input.service_id
        appointment.starts_at = start.toISOString()
        appointment.ends_at = end.toISOString()
        appointment.notes = notes
        appointment.status = 'pending'
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async cancel(appointmentId) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appt = db.appointments.find((a) => a.id === appointmentId)
        if (!appt) throw new DataError('not_found', 'Appointment not found.')
        if (appt.customer_id !== user.id && appt.barber_id !== user.id) {
          throw new DataError('forbidden', 'Not your appointment.')
        }
        if (appt.status !== 'pending' && appt.status !== 'confirmed') {
          throw new DataError('validation', 'Only an active appointment can be cancelled.')
        }
        if (!canModifyAppointment(appt)) {
          throw new DataError('validation', 'A haircut that has already started cannot be cancelled.')
        }
        appt.status = 'cancelled'
        appt.updated_at = nowISO()
        return clone(appt)
      })
    },

    async listMine() {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      return db.appointments
        .filter((a) => a.customer_id === user.id || a.barber_id === user.id)
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        .map(appointmentDetailed)
        .filter((appointment): appointment is AppointmentDetailed => appointment !== null)
    },

    async listForMyShop() {
      await delay()
      reloadFromStorage()
      const shop = requireOwnedShop()
      return db.appointments
        .filter((appointment) => appointment.shop_id === shop.id)
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        .map(appointmentDetailed)
        .filter((appointment): appointment is AppointmentDetailed => appointment !== null)
    },

    async setStatus(appointmentId, status) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appt = db.appointments.find((a) => a.id === appointmentId)
        if (!appt) throw new DataError('not_found', 'Appointment not found.')
        const ownedShop = user.role === 'shop_owner'
          ? db.shops.find((shop) => shop.id === appt.shop_id && shop.owner_id === user.id)
          : null
        if (appt.barber_id !== user.id && !ownedShop) {
          throw new DataError('forbidden', 'Only the assigned barber or shop owner can change status.')
        }
        if (ownedShop && status !== 'confirmed' && status !== 'cancelled') {
          throw new DataError('forbidden', 'Owners may only accept or decline reservations.')
        }
        if (status === appt.status) return clone(appt)
        const allowed: Record<Appointment['status'], Appointment['status'][]> = {
          pending: ['confirmed', 'cancelled'],
          requested: ['confirmed', 'declined', 'expired', 'cancelled'],
          confirmed: ['checked_in', 'cancelled', 'no_show', 'customer_no_show'],
          checked_in: ['in_progress'],
          in_progress: ['awaiting_confirmation'],
          awaiting_confirmation: ['completed', 'disputed'],
          disputed: ['completed', 'cancelled'],
          declined: [],
          expired: [],
          completed: [],
          cancelled: [],
          customer_no_show: [],
          no_show: [],
        }
        if (!allowed[appt.status].includes(status)) {
          throw new DataError('validation', `Cannot change ${appt.status} to ${status}.`)
        }
        if (status === 'cancelled' && !canModifyAppointment(appt)) {
          throw new DataError('validation', 'A haircut that has already started cannot be cancelled.')
        }
        if ((status === 'completed' || status === 'no_show') && Date.now() < new Date(appt.starts_at).getTime()) {
          throw new DataError('validation', 'The appointment has not started yet.')
        }
        appt.status = status
        appt.updated_at = nowISO()
        return clone(appt)
      })
    },

    async accept(appointmentId, input) {
      const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
      if (!appointment) throw new DataError('not_found', 'Appointment not found.')
      if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
      const updated = await bookings.setStatus(appointmentId, 'confirmed')
      appointment.version = (appointment.version ?? 0) + 1
      return { ...updated, version: appointment.version }
    },

    async decline(appointmentId, input) {
      const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
      if (!appointment) throw new DataError('not_found', 'Appointment not found.')
      if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
      const updated = await bookings.setStatus(appointmentId, 'cancelled')
      appointment.version = (appointment.version ?? 0) + 1
      appointment.cancellation_reason = input.reason
      return { ...updated, version: appointment.version, cancellation_reason: input.reason }
    },

    async issueCheckInCode(appointmentId, input) {
      await delay()
      const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
      if (!appointment) throw new DataError('not_found', 'Appointment not found.')
      const user = requireUser()
      const ownedShop = db.shops.some((shop) => shop.id === appointment.shop_id && shop.owner_id === user.id)
      if (appointment.barber_id !== user.id && !ownedShop) throw new DataError('forbidden', 'Only assigned shop staff may issue a check-in code.')
      if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
      appointment.version = (appointment.version ?? 0) + 1
      const expiresAt = new Date(Math.min(Date.parse(appointment.ends_at), Date.now() + 30 * 60_000)).toISOString()
      appointment.check_in_code_expires_at = expiresAt
      return { appointment_id: appointment.id, code: '123456', expires_at: expiresAt, appointment_version: appointment.version }
    },

    async checkIn(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        const ownedShop = db.shops.some((shop) => shop.id === appointment.shop_id && shop.owner_id === user.id)
        if (appointment.customer_id !== user.id && !ownedShop) throw new DataError('forbidden', 'Only the customer or shop owner may check in.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        appointment.status = 'checked_in'
        appointment.checked_in_at = nowISO()
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async start(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        if (appointment.barber_id !== user.id) throw new DataError('forbidden', 'Only the assigned barber may start this appointment.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        appointment.status = 'in_progress'
        appointment.actual_started_at = nowISO()
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async finish(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        if (appointment.barber_id !== user.id) throw new DataError('forbidden', 'Only the assigned barber may finish this appointment.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        appointment.status = 'awaiting_confirmation'
        appointment.actual_finished_at = nowISO()
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async confirmCompletion(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        if (appointment.customer_id !== user.id) throw new DataError('forbidden', 'Only the customer may confirm completion.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        appointment.status = 'completed'
        appointment.completed_at = nowISO()
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async dispute(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        if (appointment.customer_id !== user.id) throw new DataError('forbidden', 'Only the customer may dispute this appointment.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        appointment.status = 'disputed'
        appointment.dispute_reason = input.reason
        appointment.dispute_opened_at = nowISO()
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async cancelWithReason(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        const ownedShop = db.shops.some((shop) => shop.id === appointment.shop_id && shop.owner_id === user.id)
        if (appointment.customer_id !== user.id && appointment.barber_id !== user.id && !ownedShop) throw new DataError('forbidden', 'Not your appointment.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        appointment.status = 'cancelled'
        appointment.cancellation_reason = input.reason
        appointment.cancelled_at = nowISO()
        appointment.cancelled_by = user.id
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async markCustomerNoShow(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        if (appointment.barber_id !== user.id) throw new DataError('forbidden', 'Only the assigned barber may mark a no-show.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        appointment.status = 'customer_no_show'
        appointment.no_show_reason = input.reason
        appointment.no_show_marked_at = nowISO()
        appointment.no_show_marked_by = user.id
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async resolveDispute(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        const ownedShop = db.shops.some((shop) => shop.id === appointment.shop_id && shop.owner_id === user.id)
        if (!ownedShop) throw new DataError('forbidden', 'Only the shop owner may resolve this dispute.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        appointment.status = input.resolution
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async reassign(appointmentId, input) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
        if (!appointment) throw new DataError('not_found', 'Appointment not found.')
        const ownedShop = db.shops.some((shop) => shop.id === appointment.shop_id && shop.owner_id === user.id)
        if (!ownedShop) throw new DataError('forbidden', 'Only the shop owner may reassign this appointment.')
        if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
        if (!db.shops.some((shop) => shop.id === appointment.shop_id && shop.barber_ids.includes(input.barber_id))) {
          throw new DataError('validation', 'The new barber must belong to this shop.')
        }
        appointment.barber_id = input.barber_id
        appointment.version = (appointment.version ?? 0) + 1
        appointment.updated_at = nowISO()
        return clone(appointment)
      })
    },

    async rescheduleWithVersion(appointmentId, input) {
      const appointment = db.appointments.find((candidate) => candidate.id === appointmentId)
      if (!appointment) throw new DataError('not_found', 'Appointment not found.')
      if ((appointment.version ?? 0) !== input.expected_version) throw new DataError('stale_appointment', 'Appointment changed; refresh before trying again.')
      const updated = await bookings.reschedule(appointmentId, input)
      appointment.version = (appointment.version ?? 0) + 1
      return { ...updated, version: appointment.version }
    },

    async timeline() {
      await delay()
      return []
    },
  }

  // ================= ChatService =================
  function canAccessShopConversation(conversation: Conversation, user: Profile): boolean {
    if (conversation.customer_id === user.id || conversation.barber_id === user.id) return true
    const conversationShop = db.shops.find((shop) => shop.id === conversation.shop_id)
    if (!conversationShop) return false
    const isStaffThread = conversationShop.owner_id !== null
      && conversation.customer_id === conversationShop.owner_id
    // Staff threads are private to their two explicit participants. Customer
    // threads may still be handled by any current representative of the shop.
    if (isStaffThread) return false
    if (user.role === 'barber') {
      return conversationShop.barber_ids.includes(user.id)
    }
    // Ang may-ari ng shop ay may access sa lahat ng threads ng shop niya
    // (customer inquiries at internal staff threads).
    if (user.role === 'shop_owner') {
      return conversationShop.owner_id === user.id
    }
    return false
  }

  const chat: DataBackend['chat'] = {
    async listConversations() {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      return db.conversations
        .filter((conversation) => canAccessShopConversation(conversation, user))
        .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
        .map((c) => conversationDetailed(c, user.id))
        .filter((conversation): conversation is ConversationDetailed => conversation !== null)
    },

    async openConversation(shopId) {
      await delay()
      return withDatabaseWrite(() => {
        const user = requireUser()
        if (user.role !== 'customer') {
          throw new DataError('forbidden', 'Only customers can start a new shop conversation.')
        }
        const targetShop = db.shops.find((shop) => shop.id === shopId)
        if (!targetShop) throw new DataError('not_found', 'Barbershop not found.')
        const targetBarber = targetShop.barber_ids
          .map((id) => db.barbers.find((barber) => barber.id === id))
          .find((barber): barber is Barber => {
            if (!barber) return false
            const profile = profileById(barber.id)
            return profile?.role === 'barber' && profile.verification_status === 'verified'
          })
        if (!targetBarber) throw new DataError('validation', 'This shop has no chat representative yet.')
        let convo = db.conversations.find(
          (candidate) => candidate.customer_id === user.id && candidate.shop_id === targetShop.id,
        )
        if (!convo) {
          convo = {
            id: uid('c'),
            customer_id: user.id,
            shop_id: targetShop.id,
            barber_id: targetBarber.id,
            created_at: nowISO(),
            last_message_at: nowISO(),
          }
          db.conversations.push(convo)
        }
        const detailed = conversationDetailed(convo, user.id)
        if (!detailed) throw new DataError('not_found', 'Conversation data is incomplete.')
        return detailed
      })
    },

    async openStaffConversation(barberId) {
      await delay()
      return withDatabaseWrite(() => {
        const shop = requireOwnedShop()
        const user = requireUser()
        if (!shop.barber_ids.includes(barberId)) {
          throw new DataError('forbidden', 'Hindi mo staff ang barber na iyan.')
        }
        if (!db.barbers.some((barber) => barber.id === barberId) || !profileById(barberId)) {
          throw new DataError('not_found', 'Barber not found.')
        }
        // Internal staff thread: ang owner ang "customer" participant. UI
        // detects this via conversation.customer_id === shop.owner_id.
        let convo = db.conversations.find((candidate) => (
          candidate.shop_id === shop.id
          && candidate.customer_id === user.id
          && candidate.barber_id === barberId
        ))
        if (!convo) {
          convo = {
            id: uid('c'),
            customer_id: user.id,
            shop_id: shop.id,
            barber_id: barberId,
            created_at: nowISO(),
            last_message_at: nowISO(),
          }
          db.conversations.push(convo)
        }
        const detailed = conversationDetailed(convo, user.id)
        if (!detailed) throw new DataError('not_found', 'Conversation data is incomplete.')
        return detailed
      })
    },

    async getMessages(conversationId, limit = 100) {
      await delay(50)
      const user = requireUser()
      reloadFromStorage()
      const convo = db.conversations.find((c) => c.id === conversationId)
      if (!convo || !canAccessShopConversation(convo, user))
        throw new DataError('forbidden', 'Not your conversation.')
      return db.messages
        .filter((m) => m.conversation_id === conversationId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-Math.min(200, Math.max(1, Math.floor(limit))))
        .map(clone)
    },

    async sendMessage(input: SendMessageInput) {
      await delay(60)
      const body = input.body.trim()
      if (!body) throw new DataError('validation', 'Message is empty.')
      if (body.length > 2_000) throw new DataError('validation', 'Message is too long.')
      const msg = await withDatabaseWrite(() => {
        const user = requireUser()
        const convo = db.conversations.find((c) => c.id === input.conversation_id)
        if (!convo || !canAccessShopConversation(convo, user)) {
          throw new DataError('forbidden', 'Not your conversation.')
        }
        const created: Message = {
          id: uid('m'),
          conversation_id: convo.id,
          sender_id: user.id,
          body,
          read_at: null,
          created_at: nowISO(),
        }
        db.messages.push(created)
        convo.last_message_at = created.created_at
        return clone(created)
      })
      // Deliver to this tab's subscribers immediately, and other tabs via the channel.
      msgListeners.get(msg.conversation_id)?.forEach((cb) => cb(clone(msg)))
      channel?.postMessage({
        type: 'message',
        conversationId: msg.conversation_id,
        messageId: msg.id,
      } satisfies BroadcastMsg)
      return clone(msg)
    },

    async markRead(conversationId) {
      await delay(40)
      await withDatabaseWrite(() => {
        const user = requireUser()
        const conversation = db.conversations.find((candidate) => candidate.id === conversationId)
        if (!conversation || !canAccessShopConversation(conversation, user)) {
          throw new DataError('forbidden', 'Not your conversation.')
        }
        const readAt = nowISO()
        db.messages
          .filter((message) => (
            message.conversation_id === conversationId
            && message.sender_id !== user.id
            && message.read_at === null
          ))
          .forEach((message) => { message.read_at = readAt })
      })
    },

    subscribe(conversationId, cb): Unsubscribe {
      const user = requireUser()
      reloadFromStorage()
      const conversation = db.conversations.find((candidate) => candidate.id === conversationId)
      if (!conversation || !canAccessShopConversation(conversation, user)) {
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

  return { auth, barbers, availability, services, bookings, chat, shops, favorites, reviews, employment, support }
}

// Re-export so pages can compute "next open slot" previews without a round trip if desired.
export { effectiveBlocks }
