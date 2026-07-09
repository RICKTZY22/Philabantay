import type {
  Appointment,
  AvailabilityOverride,
  AvailabilityRule,
  Barber,
  Conversation,
  Message,
  Profile,
  Service,
} from '@barbershop/shared'

/** The full persisted shape of the mock database. */
export interface MockDB {
  version: number
  /** email -> plaintext password (mock only!) */
  passwords: Record<string, string>
  /** email -> profile id */
  emailToId: Record<string, string>
  currentUserId: string | null
  profiles: Profile[]
  barbers: Barber[]
  services: Service[]
  rules: AvailabilityRule[]
  overrides: AvailabilityOverride[]
  appointments: Appointment[]
  conversations: Conversation[]
  messages: Message[]
}

const NOW = '2026-01-01T00:00:00.000Z'

function profile(
  id: string,
  role: Profile['role'],
  full_name: string,
  phone: string | null = null,
): Profile {
  return { id, role, full_name, phone, avatar_url: null, created_at: NOW }
}

function barber(id: string, bio: string, on = false): Barber {
  return {
    id,
    bio,
    shift_status: on ? 'on' : 'off',
    accepting_bookings: true,
    created_at: NOW,
  }
}

/** Mon–Sat rule set for a barber. weekday: 1=Mon ... 6=Sat */
function weekRules(barberId: string, start: string, end: string, prefix: string): AvailabilityRule[] {
  return [1, 2, 3, 4, 5, 6].map((weekday) => ({
    id: `${prefix}-${weekday}`,
    barber_id: barberId,
    weekday: weekday as AvailabilityRule['weekday'],
    start_time: start,
    end_time: end,
    created_at: NOW,
  }))
}

export function buildSeed(): MockDB {
  const profiles: Profile[] = [
    profile('u-customer', 'customer', 'Demo Customer', '+639170000001'),
    profile('u-miguel', 'barber', 'Miguel Santos', '+639170000010'),
    profile('u-ramon', 'barber', 'Ramon Cruz', '+639170000011'),
    profile('u-jules', 'barber', 'Jules Reyes', '+639170000012'),
    profile('u-admin', 'admin', 'Shop Admin'),
  ]

  const barbers: Barber[] = [
    barber('u-miguel', 'Fades and classic cuts. 8 years on the chair.', true),
    barber('u-ramon', 'Beard sculpting and hot-towel shaves specialist.', true),
    barber('u-jules', 'Modern styles, kids cuts, and colour.', false),
  ]

  const services: Service[] = [
    { id: 's-fade', name: 'Signature Fade', duration_min: 45, price_cents: 45000, active: true, created_at: NOW },
    { id: 's-cut', name: 'Classic Haircut', duration_min: 30, price_cents: 35000, active: true, created_at: NOW },
    { id: 's-beard', name: 'Beard Trim & Shape', duration_min: 20, price_cents: 20000, active: true, created_at: NOW },
    { id: 's-shave', name: 'Hot Towel Shave', duration_min: 30, price_cents: 30000, active: true, created_at: NOW },
    { id: 's-kids', name: 'Kids Cut', duration_min: 25, price_cents: 25000, active: true, created_at: NOW },
    { id: 's-combo', name: 'Cut + Beard Combo', duration_min: 60, price_cents: 60000, active: true, created_at: NOW },
  ]

  const rules: AvailabilityRule[] = [
    ...weekRules('u-miguel', '10:00', '19:00', 'r-miguel'),
    ...weekRules('u-ramon', '11:00', '20:00', 'r-ramon'),
    ...weekRules('u-jules', '09:00', '17:00', 'r-jules'),
  ]

  return {
    version: 1,
    passwords: {
      'customer@demo.test': 'demo1234',
      'miguel@demo.test': 'demo1234',
      'ramon@demo.test': 'demo1234',
      'jules@demo.test': 'demo1234',
      'admin@demo.test': 'demo1234',
    },
    emailToId: {
      'customer@demo.test': 'u-customer',
      'miguel@demo.test': 'u-miguel',
      'ramon@demo.test': 'u-ramon',
      'jules@demo.test': 'u-jules',
      'admin@demo.test': 'u-admin',
    },
    currentUserId: null,
    profiles,
    barbers,
    services,
    rules,
    overrides: [],
    appointments: [],
    conversations: [],
    messages: [],
  }
}

export const DEMO_ACCOUNTS = [
  { label: 'Customer', email: 'customer@demo.test', password: 'demo1234' },
  { label: 'Barber (Miguel)', email: 'miguel@demo.test', password: 'demo1234' },
]
