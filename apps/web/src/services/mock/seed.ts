import type {
  Appointment,
  AvailabilityOverride,
  AvailabilityRule,
  Barber,
  Conversation,
  Message,
  Profile,
  Service,
  Shop,
} from '@barbershop/shared'

/** The full persisted shape of the mock database. */
export interface MockDB {
  version: number
  /** email -> PBKDF2 password verifier (mock only; never a production auth store) */
  passwords: Record<string, string>
  /** email -> profile id */
  emailToId: Record<string, string>
  profiles: Profile[]
  barbers: Barber[]
  services: Service[]
  rules: AvailabilityRule[]
  overrides: AvailabilityOverride[]
  appointments: Appointment[]
  conversations: Conversation[]
  messages: Message[]
  shops: Shop[]
  /** user id -> favorite shop ids */
  favorites: Record<string, string[]>
}

const NOW = '2026-01-01T00:00:00.000Z'
const DEMO_PASSWORD_HASH = 'pbkdf2-sha256$600000$WpdrefrxJ6PrLxNVuA0sbA==$kDZZKnfPAR98KSn3ubDkSULeVUDQ7uwC1M2/LTItc2o='

function profile(
  id: string,
  role: Profile['role'],
  full_name: string,
  phone: string | null = null,
): Profile {
  return {
    id,
    role,
    requested_role: role === 'admin' ? null : role,
    verification_status: role === 'customer' ? 'not_required' : 'verified',
    onboarding_completed: true,
    full_name,
    phone,
    avatar_url: null,
    created_at: NOW,
  }
}

function barber(id: string, bio: string, on = false, accepting = true): Barber {
  return {
    id,
    bio,
    shift_status: on ? 'on' : 'off',
    accepting_bookings: accepting,
    created_at: NOW,
  }
}

/** Weekly rule set for a barber. weekday: 0=Sun 1=Mon ... 6=Sat */
function weekRules(
  barberId: string,
  start: string,
  end: string,
  prefix: string,
  days: number[] = [1, 2, 3, 4, 5, 6],
): AvailabilityRule[] {
  return days.map((weekday) => ({
    id: `${prefix}-${weekday}`,
    barber_id: barberId,
    weekday: weekday as AvailabilityRule['weekday'],
    start_time: start,
    end_time: end,
    created_at: NOW,
  }))
}

function shop(
  id: string,
  name: string,
  address: string,
  city: string,
  lat: number,
  lng: number,
  rating: number,
  rating_count: number,
  barber_ids: string[],
): Shop {
  return { id, name, address, city, lat, lng, rating, rating_count, barber_ids, created_at: NOW }
}

export function buildSeed(): MockDB {
  const profiles: Profile[] = [
    profile('u-customer', 'customer', 'Demo Customer', '+639170000001'),
    profile('u-miguel', 'barber', 'Miguel Santos', '+639170000010'),
    profile('u-ramon', 'barber', 'Ramon Cruz', '+639170000011'),
    profile('u-jules', 'barber', 'Jules Reyes', '+639170000012'),
    profile('u-paolo', 'barber', 'Paolo Garcia', '+639170000013'),
    profile('u-kiko', 'barber', 'Kiko Dizon', '+639170000014'),
    profile('u-jayjay', 'barber', 'JayJay Ouano', '+639170000015'),
    profile('u-nino', 'barber', 'Niño Vargas', '+639170000016'),
    profile('u-bogs', 'barber', 'Bogs Alonzo', '+639170000017'),
    profile('u-dante', 'barber', 'Dante Robles', '+639170000018'),
    profile('u-lito', 'barber', 'Lito Manalang', '+639170000019'),
    profile('u-marco', 'barber', 'Marco Villanueva', '+639170000021'),
    profile('u-owner', 'shop_owner', 'Elena Reyes', '+639170000020'),
  ]

  const barbers: Barber[] = [
    barber('u-miguel', 'Fades and classic cuts. 8 years on the chair.', true),
    barber('u-ramon', 'Beard sculpting and hot-towel shaves specialist.', true),
    barber('u-jules', 'Modern styles, kids cuts, and colour.', false),
    barber('u-paolo', 'Skin fades at sharp lineups, QC pride.', true),
    barber('u-kiko', 'Session Road classic — suot mo ang lamig, uwi mo ang linis.', true),
    barber('u-jayjay', 'Bisaya barber ng bayan. Taper master.', true),
    // Nino is on shift pero puno ang chair — the demo's "busy" shop.
    barber('u-nino', 'Ilonggo precision cuts and beard care.', true, false),
    barber('u-bogs', 'Davao-style pompadours and buzz cuts.', false),
    // South Metro crew para may buhay na pins malapit sa Parañaque/Las Piñas.
    barber('u-dante', 'BF Homes staple — clean fades para sa southside.', true),
    barber('u-lito', 'Zapote-raised, 12 years sa gunting at labaha.', true),
    barber('u-marco', 'Poblacion cool cuts, walk-ins welcome.', true),
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
    // Bagong crew: mahaba at pati Sunday ang hours para laging may makita
    // sa "available now" at buhay ang map pins sa demo, anumang oras.
    ...weekRules('u-paolo', '08:00', '22:00', 'r-paolo', [0, 1, 2, 3, 4, 5, 6]),
    ...weekRules('u-kiko', '08:00', '22:00', 'r-kiko', [0, 1, 2, 3, 4, 5, 6]),
    ...weekRules('u-jayjay', '08:00', '22:00', 'r-jayjay', [0, 1, 2, 3, 4, 5, 6]),
    ...weekRules('u-nino', '08:00', '22:00', 'r-nino', [0, 1, 2, 3, 4, 5, 6]),
    ...weekRules('u-bogs', '09:00', '18:00', 'r-bogs'),
    ...weekRules('u-dante', '08:00', '22:00', 'r-dante', [0, 1, 2, 3, 4, 5, 6]),
    ...weekRules('u-lito', '08:00', '22:00', 'r-lito', [0, 1, 2, 3, 4, 5, 6]),
    ...weekRules('u-marco', '08:00', '22:00', 'r-marco', [0, 1, 2, 3, 4, 5, 6]),
  ]

  // Nationwide spread para makita agad ang scope ng app sa customer map.
  //
  // IMPORTANT - TUNGKOL SA COORDINATES:
  // Fictional demo shops ito, pero ang pins ay nakapuwesto sa TOTOONG street
  // na nakapangalan sa address (hal. nasa Session Rd talaga ang Baguio pin).
  // Kapag Supabase phase na, ang totoong shops ay igegeocode mula sa address
  // nila sa registration — huwag manu-manong maglagay ng coords doon.
  const shops: Shop[] = [
    shop('sh-tondo', 'Philabantay Tondo Original', '1442 Juan Luna St, Gagalangin, Tondo', 'Manila', 14.6169, 120.9692, 4.8, 214, ['u-miguel', 'u-ramon', 'u-jules']),
    shop('sh-norte', 'Norte Fade Club', '88 Timog Ave, South Triangle', 'Quezon City', 14.636, 121.0348, 4.6, 158, ['u-paolo']),
    shop('sh-baguio', 'Session Road Cuts', '110 Session Rd', 'Baguio', 16.4119, 120.5964, 4.9, 302, ['u-kiko']),
    shop('sh-cebu', 'Sugbu Chair Co.', '21 Colon St', 'Cebu City', 10.2966, 123.9018, 4.7, 189, ['u-jayjay']),
    shop('sh-iloilo', 'Ilonggo Trim House', '5 Calle Real (JM Basa St)', 'Iloilo City', 10.6969, 122.5644, 4.4, 96, ['u-nino']),
    shop('sh-davao', 'Davao Sharp Studio', '43 San Pedro St, Poblacion', 'Davao City', 7.0656, 125.6098, 4.5, 121, ['u-bogs']),
    shop('sh-maginhawa', 'Maginhawa Snips', '154 Maginhawa St, Teachers Village', 'Quezon City', 14.6417, 121.0561, 4.2, 44, []),
    // South Metro Manila trio: para sa mga user sa Parañaque/Las Piñas area,
    // may makikita agad na malapit at ma-che-check nila ang totoong distansya.
    shop('sh-bfhomes', 'Southside Chair Club', 'Aguirre Ave, BF Homes', 'Parañaque', 14.4443, 121.0212, 4.6, 87, ['u-dante']),
    shop('sh-laspinas', 'Zapote Alley Barbers', 'Alabang–Zapote Rd, Pamplona Tres', 'Las Piñas', 14.4500, 120.9942, 4.5, 73, ['u-lito']),
    shop('sh-poblacion', 'Poblacion Fade Room', 'P. Burgos St, Poblacion', 'Makati', 14.5658, 121.0313, 4.7, 142, ['u-marco']),
  ]

  return {
    version: 7,
    passwords: {
      'customer@demo.test': DEMO_PASSWORD_HASH,
      'miguel@demo.test': DEMO_PASSWORD_HASH,
      'ramon@demo.test': DEMO_PASSWORD_HASH,
      'jules@demo.test': DEMO_PASSWORD_HASH,
      'paolo@demo.test': DEMO_PASSWORD_HASH,
      'kiko@demo.test': DEMO_PASSWORD_HASH,
      'jayjay@demo.test': DEMO_PASSWORD_HASH,
      'nino@demo.test': DEMO_PASSWORD_HASH,
      'bogs@demo.test': DEMO_PASSWORD_HASH,
      'dante@demo.test': DEMO_PASSWORD_HASH,
      'lito@demo.test': DEMO_PASSWORD_HASH,
      'marco@demo.test': DEMO_PASSWORD_HASH,
      'owner@demo.test': DEMO_PASSWORD_HASH,
    },
    emailToId: {
      'customer@demo.test': 'u-customer',
      'miguel@demo.test': 'u-miguel',
      'ramon@demo.test': 'u-ramon',
      'jules@demo.test': 'u-jules',
      'paolo@demo.test': 'u-paolo',
      'kiko@demo.test': 'u-kiko',
      'jayjay@demo.test': 'u-jayjay',
      'nino@demo.test': 'u-nino',
      'bogs@demo.test': 'u-bogs',
      'dante@demo.test': 'u-dante',
      'lito@demo.test': 'u-lito',
      'marco@demo.test': 'u-marco',
      'owner@demo.test': 'u-owner',
    },
    profiles,
    barbers,
    services,
    rules,
    overrides: [],
    appointments: [],
    conversations: [],
    messages: [],
    shops,
    // May isang paunang favorite ang demo customer para hindi empty ang section.
    favorites: { 'u-customer': ['sh-tondo'] },
  }
}

export const DEMO_ACCOUNTS = [
  { label: 'Customer', email: 'customer@demo.test', password: 'demo1234' },
  { label: 'Barber (Miguel)', email: 'miguel@demo.test', password: 'demo1234' },
  { label: 'Shop Owner (Elena)', email: 'owner@demo.test', password: 'demo1234' },
]
