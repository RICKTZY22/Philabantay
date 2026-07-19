import type {
  Appointment,
  AvailabilityOverride,
  AvailabilityRule,
  Barber,
  BarberAbsence,
  BarberApplication,
  BarberEmployment,
  BugReport,
  Conversation,
  HiringListing,
  Message,
  Profile,
  Review,
  Service,
  ShiftChangeRequest,
  Shop,
  StaffNote,
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
  /** user id -> favorite barber ids */
  favoriteBarbers: Record<string, string[]>
  reviews: Review[]
  bugReports: BugReport[]
  hiringListings: HiringListing[]
  barberApplications: BarberApplication[]
  /** Private shop-issued codes. Never return this collection to UI callers. */
  shopJoinCodes: Record<string, string>
  /** One record per shop stint; the active one has ended_at null. */
  employments: BarberEmployment[]
  absences: BarberAbsence[]
  shiftChangeRequests: ShiftChangeRequest[]
  /** Owner tools: private per-staff notes. */
  staffNotes: StaffNote[]
}

/** A credential-free mock database. Accounts are created only through signup. */
export function buildSeed(): MockDB {
  return {
    version: 19,
    passwords: {},
    emailToId: {},
    profiles: [],
    barbers: [],
    services: [],
    rules: [],
    overrides: [],
    appointments: [],
    conversations: [],
    messages: [],
    shops: [],
    favorites: {},
    favoriteBarbers: {},
    reviews: [],
    bugReports: [],
    hiringListings: [],
    barberApplications: [],
    shopJoinCodes: {},
    employments: [],
    absences: [],
    shiftChangeRequests: [],
    staffNotes: [],
  }
}
