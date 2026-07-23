import { z } from 'zod'
import type {
  PublicBarber,
  PublicProfile,
  PublicService,
  PublicShop,
  ShopWithStatus,
  Slot,
} from './types'
import type {
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  AppointmentReasonInput,
  AppointmentVersionInput,
  ChangePasswordInput,
  CheckInAppointmentInput,
  CompleteRoleOnboardingInput,
  CreateAppointmentInput,
  CreateAttendanceRecordInput,
  CreateBugReportInput,
  CreateServiceInput,
  CreateShopInput,
  EndEmploymentInput,
  JoinShopInput,
  NotificationPreferencesInput,
  OpenConversationInput,
  OpenStaffConversationInput,
  RateAppointmentInput,
  ReassignAppointmentInput,
  RescheduleAppointmentInput,
  RefreshSessionInput,
  ResolveAppointmentDisputeInput,
  ResolveBarberApplicationInput,
  ResolveShiftChangeRequestInput,
  SendMessageInput,
  SetAcceptingBookingsInput,
  SetAppointmentStatusInput,
  SetShiftStatusInput,
  ShiftChangeRequestInput,
  SignInInput,
  SignUpInput,
  StaffNoteInput,
  UpdateAttendanceRecordInput,
  UpdateProfileInput,
  UpdateServiceInput,
  UpdateShopInput,
  CreateOwnerShopInput,
  UpdateOwnerShopInput,
  ShopVersionInput,
} from './dto'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const WALL_CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const PHONE = /^\+?[0-9]{7,15}$/
const SPECIAL_CHAR = /[^\p{L}\p{N}\s]/u

export const uuidSchema = z.string().uuid()
export const dateKeySchema = z.string().regex(DATE_KEY, 'Expected YYYY-MM-DD.')
export const wallClockSchema = z.string().regex(WALL_CLOCK, 'Expected HH:MM.')
export const isoTimestampSchema = z.string().datetime({ offset: true })

/** Strict response contracts for data that may cross the anonymous boundary. */
export const publicProfileSchema: z.ZodType<PublicProfile> = z.strictObject({
  id: uuidSchema,
  full_name: z.string().trim().min(1).max(80),
  avatar_url: z.string().trim().max(2048).nullable(),
})

export const publicBarberSchema: z.ZodType<PublicBarber> = z.strictObject({
  id: uuidSchema,
  bio: z.string().max(1000).nullable(),
  rating: z.number().min(0).max(5),
  rating_count: z.number().int().nonnegative(),
  shift_status: z.enum(['off', 'on']),
  accepting_bookings: z.boolean(),
  profile: publicProfileSchema,
})

export const publicServiceSchema: z.ZodType<PublicService> = z.strictObject({
  id: uuidSchema,
  shop_id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  duration_min: z.number().int().min(5).max(480),
  price_cents: z.number().int().nonnegative(),
})

export const publicShopSchema: z.ZodType<PublicShop> = z.strictObject({
  id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  rating: z.number().min(0).max(5),
  rating_count: z.number().int().nonnegative(),
})

export const publicShopWithStatusSchema: z.ZodType<ShopWithStatus> = z.strictObject({
  id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  rating: z.number().min(0).max(5),
  rating_count: z.number().int().nonnegative(),
  barber_ids: z.array(uuidSchema),
  status: z.enum(['open', 'busy', 'closed']),
  available_barber_count: z.number().int().nonnegative(),
})

export const publicSlotSchema: z.ZodType<Slot> = z.strictObject({
  starts_at: isoTimestampSchema,
  ends_at: isoTimestampSchema,
})

const roleSchema = z.enum(['customer', 'barber', 'shop_owner'])
export const canonicalAppointmentStatusSchema = z.enum([
  'requested',
  'confirmed',
  'checked_in',
  'in_progress',
  'awaiting_confirmation',
  'declined',
  'expired',
  'cancelled',
  'completed',
  'customer_no_show',
  'disputed',
])
const appointmentStatusSchema = z.union([
  canonicalAppointmentStatusSchema,
  z.enum(['pending', 'no_show']),
])
const weekdaySchema = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3),
  z.literal(4), z.literal(5), z.literal(6),
])

export const signUpInputSchema: z.ZodType<SignUpInput> = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(6).max(128).regex(SPECIAL_CHAR, 'Password needs a special character.'),
  full_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(PHONE).optional(),
})

export const signInInputSchema: z.ZodType<SignInInput> = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
})

export const refreshSessionInputSchema: z.ZodType<RefreshSessionInput> = z.strictObject({
  refresh_token: z.string().min(20).max(4096),
})

export const completeRoleOnboardingInputSchema: z.ZodType<CompleteRoleOnboardingInput> = z.strictObject({
  role: roleSchema,
})

export const updateProfileInputSchema: z.ZodType<UpdateProfileInput> = z.strictObject({
  full_name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: z.string().trim().regex(PHONE).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  avatar_url: z.string().trim().max(2048).optional(),
  current_password: z.string().min(1).max(128).optional(),
}).refine(
  (body) => Object.keys(body).some((key) => key !== 'current_password'),
  'At least one field is required.',
)

export const changePasswordInputSchema: z.ZodType<ChangePasswordInput> = z.strictObject({
  current_password: z.string().min(1).max(128),
  new_password: z.string().min(6).max(128).regex(SPECIAL_CHAR, 'Password needs a special character.'),
})

export const createBugReportInputSchema: z.ZodType<CreateBugReportInput> = z.strictObject({
  category: z.enum(['visual', 'booking', 'map', 'chat', 'account', 'other']),
  summary: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(5000),
  page_url: z.string().trim().max(2048).optional(),
})

export const availabilityRuleInputSchema: z.ZodType<AvailabilityRuleInput> = z.strictObject({
  weekday: weekdaySchema,
  start_time: wallClockSchema,
  end_time: wallClockSchema,
}).refine((rule) => rule.start_time < rule.end_time, {
  message: 'Shift start must be before shift end.',
  path: ['end_time'],
})

export const availabilityRulesInputSchema = z.array(availabilityRuleInputSchema).max(28)

export const availabilityOverrideInputSchema: z.ZodType<AvailabilityOverrideInput> = z.strictObject({
  date: dateKeySchema,
  is_available: z.boolean(),
  start_time: wallClockSchema.nullable().optional(),
  end_time: wallClockSchema.nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.is_available) {
    if (!value.start_time || !value.end_time || value.start_time >= value.end_time) {
      context.addIssue({ code: 'custom', message: 'Available exceptions require a valid time range.' })
    }
  } else if (value.start_time != null || value.end_time != null) {
    context.addIssue({ code: 'custom', message: 'Unavailable exceptions cannot include times.' })
  }
})

export const createAppointmentInputSchema: z.ZodType<CreateAppointmentInput> = z.strictObject({
  barber_id: uuidSchema,
  service_id: uuidSchema,
  starts_at: isoTimestampSchema,
  notes: z.string().trim().max(1000).optional(),
})

export const rateAppointmentInputSchema: z.ZodType<RateAppointmentInput> = z.strictObject({
  appointment_id: uuidSchema,
  barber_rating: z.number().int().min(1).max(5),
  shop_rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
})

export const sendMessageInputSchema: z.ZodType<SendMessageInput> = z.strictObject({
  conversation_id: uuidSchema,
  body: z.string().trim().min(1).max(4000),
})

export const joinShopInputSchema: z.ZodType<JoinShopInput> = z.strictObject({
  code: z.string().trim().min(6).max(32),
})

export const endEmploymentInputSchema: z.ZodType<EndEmploymentInput> = z.strictObject({
  reason: z.string().trim().min(3).max(1000),
})

export const shiftChangeRequestInputSchema: z.ZodType<ShiftChangeRequestInput> = z.strictObject({
  date: dateKeySchema,
  message: z.string().trim().min(1).max(1000),
})

export const staffNoteInputSchema: z.ZodType<StaffNoteInput> = z.strictObject({
  barber_id: uuidSchema,
  body: z.string().trim().min(1).max(2000),
})

export const setShiftStatusInputSchema: z.ZodType<SetShiftStatusInput> = z.strictObject({ on: z.boolean() })
export const setAcceptingBookingsInputSchema: z.ZodType<SetAcceptingBookingsInput> = z.strictObject({ accepting: z.boolean() })
export const setAppointmentStatusInputSchema: z.ZodType<SetAppointmentStatusInput> = z.strictObject({ status: appointmentStatusSchema })
export const appointmentVersionInputSchema: z.ZodType<AppointmentVersionInput> = z.strictObject({
  expected_version: z.number().int().positive(),
})
export const appointmentReasonInputSchema: z.ZodType<AppointmentReasonInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
})
export const checkInAppointmentInputSchema: z.ZodType<CheckInAppointmentInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  code: z.string().trim().regex(/^\d{6}$/, 'Check-in code must contain 6 digits.').optional(),
  reason: z.string().trim().min(3).max(1000).optional(),
})
export const reassignAppointmentInputSchema: z.ZodType<ReassignAppointmentInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
  barber_id: uuidSchema,
})
export const rescheduleAppointmentInputSchema: z.ZodType<RescheduleAppointmentInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  barber_id: uuidSchema,
  service_id: uuidSchema,
  starts_at: isoTimestampSchema,
  notes: z.string().trim().max(1000).optional(),
})
export const resolveAppointmentDisputeInputSchema: z.ZodType<ResolveAppointmentDisputeInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
  resolution: z.enum(['completed', 'cancelled']),
})
export const resolveShiftChangeRequestInputSchema: z.ZodType<ResolveShiftChangeRequestInput> = z.strictObject({ status: z.enum(['approved', 'declined']) })
export const resolveBarberApplicationInputSchema: z.ZodType<ResolveBarberApplicationInput> = z.strictObject({ status: z.enum(['accepted', 'declined']) })
export const openConversationInputSchema: z.ZodType<OpenConversationInput> = z.strictObject({ shop_id: uuidSchema })
export const openStaffConversationInputSchema: z.ZodType<OpenStaffConversationInput> = z.strictObject({ barber_id: uuidSchema })

export const notificationPreferencesInputSchema: z.ZodType<NotificationPreferencesInput> = z.strictObject({
  booking_reminders: z.boolean(),
  chat_notifications: z.boolean(),
  email_updates: z.boolean(),
  nearby_alerts: z.boolean(),
})

export const createServiceInputSchema: z.ZodType<CreateServiceInput> = z.strictObject({
  shop_id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  duration_min: z.number().int().min(5).max(480),
  price_cents: z.number().int().nonnegative(),
  active: z.boolean().optional(),
})

export const updateServiceInputSchema: z.ZodType<UpdateServiceInput> = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  duration_min: z.number().int().min(5).max(480).optional(),
  price_cents: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
}).refine((body) => Object.keys(body).length > 0, 'At least one field is required.')

const createShopObjectSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const createShopInputSchema: z.ZodType<CreateShopInput> = createShopObjectSchema

export const updateShopInputSchema: z.ZodType<UpdateShopInput> = createShopObjectSchema.partial()
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required.')

const ownerShopWritableSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  timezone: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  public_contact_phone: z.string().trim().min(5).max(40).nullable().optional(),
  booking_mode: z.enum(['manual', 'instant']).optional(),
  chair_count: z.number().int().min(1).max(200).optional(),
  default_buffer_min: z.number().int().min(0).max(120).optional(),
})

export const createOwnerShopInputSchema: z.ZodType<CreateOwnerShopInput> = ownerShopWritableSchema

export const updateOwnerShopInputSchema: z.ZodType<UpdateOwnerShopInput> = ownerShopWritableSchema
  .partial()
  .extend({ expected_version: z.number().int().min(1) })
  .refine(
    (body) => Object.keys(body).some((key) => key !== 'expected_version'),
    'At least one field to update is required.',
  )

export const shopVersionInputSchema: z.ZodType<ShopVersionInput> = z.strictObject({
  expected_version: z.number().int().min(1),
})

export const createAttendanceRecordInputSchema: z.ZodType<CreateAttendanceRecordInput> = z.strictObject({
  employment_id: uuidSchema,
  barber_id: uuidSchema,
  date: dateKeySchema,
  status: z.enum(['present', 'absent']),
  notes: z.string().trim().max(1000).nullable().optional(),
})

export const updateAttendanceRecordInputSchema: z.ZodType<UpdateAttendanceRecordInput> = z.strictObject({
  status: z.enum(['present', 'absent']).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).refine((body) => Object.keys(body).length > 0, 'At least one field is required.')

export const idParamsSchema = z.strictObject({ id: uuidSchema })
export const shopIdParamsSchema = z.strictObject({ shopId: uuidSchema })
export const barberIdParamsSchema = z.strictObject({ barberId: uuidSchema })
export const dateQuerySchema = z.strictObject({ date: dateKeySchema })
export const messagesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export {
  accountCapabilityGrantSchema,
  accountCapabilityNameSchema,
  adminVerificationAllowedActionSchema,
  adminVerificationDetailSchema,
  adminVerificationQueueItemSchema,
  approveVerificationInputSchema,
  assignVerificationReviewerInputSchema,
  barberVerificationDraftFormDataV1Schema,
  barberVerificationFormDataV1Schema,
  completeVerificationEvidenceUploadInputSchema,
  confirmProfessionalPhoneVerificationInputSchema,
  createVerificationSubmissionInputSchema,
  cursorPageSchema,
  listAdminVerificationsQuerySchema,
  ownerVerificationDraftFormDataV1Schema,
  ownerVerificationFormDataV1Schema,
  professionalAccessSummarySchema,
  professionalPhoneVerificationChallengeSchema,
  professionalVerificationRoleSchema,
  rejectVerificationInputSchema,
  removeVerificationEvidenceInputSchema,
  requestVerificationEvidenceUploadInputSchema,
  requestVerificationInformationInputSchema,
  restoreProfessionalInputSchema,
  shortLivedEvidenceViewSchema,
  startProfessionalPhoneVerificationInputSchema,
  submitVerificationInputSchema,
  suspendProfessionalInputSchema,
  updateVerificationSubmissionInputSchema,
  verificationApplicantReasonCodeSchema,
  verificationApplicantTimelineEventSchema,
  verificationAllowedActionSchema,
  verificationContentStatusSchema,
  verificationDocumentMetadataSchema,
  verificationDocumentRequirementsSchema,
  verificationDocumentStatusSchema,
  verificationDocumentTypeSchema,
  verificationDraftFormDataSchema,
  verificationEvidenceUploadGrantSchema,
  verificationFormDataSchema,
  verificationInformationItemSchema,
  verificationMalwareStatusSchema,
  verificationSubmissionSchema,
  verificationSubmissionStatusSchema,
  verificationWorkspaceSchema,
  withdrawVerificationInputSchema,
} from './verification'
