import {
  DataError,
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
  type SignInInput,
  type SignUpInput,
  type Slot,
  type Unsubscribe,
  type Weekday,
} from '@barbershop/shared'
import { buildSeed, type MockDB } from './seed'
import { computeOpenSlots, effectiveBlocks, isWithinHours } from './availability'

const DB_KEY = 'bsh_mock_db_v1'
const SESSION_KEY = 'bsh_session'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`
const delay = (ms = 80 + Math.random() * 160) => new Promise((r) => setTimeout(r, ms))
const nowISO = () => new Date().toISOString()

type BroadcastMsg = { type: 'db' } | { type: 'message'; conversationId: string }

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
      if (raw) return JSON.parse(raw) as MockDB
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
      if (raw) db = JSON.parse(raw) as MockDB
    } catch {
      /* ignore */
    }
  }

  if (channel) {
    channel.onmessage = (e: MessageEvent<BroadcastMsg>) => {
      const data = e.data
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
  function barberWithProfile(b: Barber): BarberWithProfile {
    const profile = profileById(b.id)
    if (!profile) throw new DataError('not_found', 'Barber profile missing.')
    return { ...clone(b), profile: clone(profile) }
  }
  function appointmentDetailed(a: Appointment): AppointmentDetailed {
    const service = db.services.find((s) => s.id === a.service_id)!
    const barber = db.barbers.find((b) => b.id === a.barber_id)!
    const customer = profileById(a.customer_id)!
    return {
      ...clone(a),
      service: clone(service),
      barber: barberWithProfile(barber),
      customer: clone(customer),
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
      customer: clone(profileById(c.customer_id)!),
      barber: barberWithProfile(db.barbers.find((b) => b.id === c.barber_id)!),
      last_message: last ? clone(last) : null,
      unread_count: unread,
    }
  }

  // ================= AuthService =================
  const auth: DataBackend['auth'] = {
    async signUp(input: SignUpInput) {
      await delay()
      const email = input.email.trim().toLowerCase()
      if (!email || !input.password) throw new DataError('validation', 'Email and password required.')
      reloadFromStorage()
      if (db.emailToId[email]) throw new DataError('email_taken', 'That email is already registered.')
      const id = uid('u')
      const role = input.role === 'barber' ? 'barber' : 'customer'
      const profile: Profile = {
        id,
        role,
        full_name: input.full_name.trim() || (role === 'barber' ? 'New Barber' : 'New Customer'),
        phone: input.phone?.trim() || null,
        avatar_url: null,
        created_at: nowISO(),
      }
      db.profiles.push(profile)
      if (role === 'barber') {
        // Barbershop signups get a public barber card + default Mon–Sat hours,
        // so they appear in listings immediately and can refine from the dashboard.
        db.barbers.push({
          id,
          bio: input.bio?.trim() || 'Bagong silya sa Philabantay — book na!',
          shift_status: 'off',
          accepting_bookings: true,
          created_at: nowISO(),
        })
        for (const weekday of [1, 2, 3, 4, 5, 6] as Weekday[]) {
          db.rules.push({
            id: uid('r'),
            barber_id: id,
            weekday,
            start_time: '10:00',
            end_time: '19:00',
            created_at: nowISO(),
          })
        }
      }
      db.passwords[email] = input.password
      db.emailToId[email] = id
      persist()
      setSession(id)
      return clone(profile)
    },

    async signIn(input: SignInInput) {
      await delay()
      const email = input.email.trim().toLowerCase()
      reloadFromStorage()
      const id = db.emailToId[email]
      if (!id || db.passwords[email] !== input.password) {
        throw new DataError('invalid_credentials', 'Wrong email or password.')
      }
      setSession(id)
      return clone(profileById(id)!)
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
      const override: AvailabilityOverride = {
        id: uid('o'),
        barber_id: user.id,
        date: input.date,
        is_available: input.is_available,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        reason: input.reason ?? null,
      }
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
      const service = db.services.find((s) => s.id === serviceId)
      if (!service) throw new DataError('not_found', 'Service not found.')
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
  const bookings: DataBackend['bookings'] = {
    async create(input: CreateAppointmentInput) {
      await delay()
      const user = requireUser()
      reloadFromStorage()
      const service = db.services.find((s) => s.id === input.service_id)
      if (!service) throw new DataError('not_found', 'Service not found.')
      const start = new Date(input.starts_at)
      const end = new Date(start.getTime() + service.duration_min * 60_000)

      // The real defense in Phase 2 is a DB exclusion constraint; the mock mirrors it here.
      const overlap = db.appointments.some(
        (a) =>
          a.barber_id === input.barber_id &&
          (a.status === 'pending' || a.status === 'confirmed') &&
          start < new Date(a.ends_at) &&
          end > new Date(a.starts_at),
      )
      if (overlap) throw new DataError('slot_taken', 'That time was just booked. Pick another slot.')

      const appt: Appointment = {
        id: uid('a'),
        customer_id: user.id,
        barber_id: input.barber_id,
        service_id: input.service_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: 'pending',
        notes: input.notes ?? null,
        created_at: nowISO(),
        updated_at: nowISO(),
      }
      db.appointments.push(appt)
      persist()
      return clone(appt)
    },

    async cancel(appointmentId) {
      await delay()
      const user = requireUser()
      const appt = db.appointments.find((a) => a.id === appointmentId)
      if (!appt) throw new DataError('not_found', 'Appointment not found.')
      if (appt.customer_id !== user.id && appt.barber_id !== user.id)
        throw new DataError('forbidden', 'Not your appointment.')
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
      const appt = db.appointments.find((a) => a.id === appointmentId)
      if (!appt) throw new DataError('not_found', 'Appointment not found.')
      if (appt.barber_id !== user.id)
        throw new DataError('forbidden', 'Only the barber can change status.')
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
      // customer opens with a barber; if a barber somehow calls, treat them as barber side
      const isBarber = db.barbers.some((b) => b.id === user.id)
      const customerId = isBarber ? barberId : user.id
      const theBarberId = isBarber ? user.id : barberId
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
        .slice(-limit)
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

  return { auth, barbers, availability, services, bookings, chat }
}

// Re-export so pages can compute "next open slot" previews without a round trip if desired.
export { effectiveBlocks }
