import { z } from 'zod'
import type {
  PublicBarber,
  PublicProfile,
  PublicService,
  PublicShop,
  PublicShopClosure,
  PublicShopDetail,
  PublicShopHoursBlock,
  PublicShopMedia,
  ShopWithStatus,
  Slot,
  AvailabilityDay,
  AvailabilitySlot,
  BookingQuote,
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
  CreateEmploymentRequestInput,
  CreateJoinCodeRequestInput,
  CreateServiceInput,
  CreateShopInput,
  EndEmploymentInput,
  NotificationPreferencesInput,
  OwnerServiceInput,
  OpenConversationInput,
  BlockConversationPeerInput,
  ReportConversationInput,
  OpenStaffConversationInput,
  SubmitRatingInput,
  EditRatingInput,
  PublishRatingResponseInput,
  EditRatingResponseInput,
  ReportRatingInput,
  ModerateRatingReportInput,
  SetRatingEditWindowInput,
  OpenAppointmentDisputeInput,
  DecideAppointmentDisputeInput,
  RespondToDisputeDecisionInput,
  CaseVersionInput,
  CaseReasonInput,
  AddCaseEvidenceInput,
  ResolveSupportCaseInput,
  EscalateRatingReportInput,
  ReassignAppointmentInput,
  RescheduleAppointmentInput,
  RefreshSessionInput,
  VerifyMfaInput,
  ResolveAppointmentDisputeInput,
  ResolveEmploymentRequestInput,
  RevokeShopJoinCodeInput,
  RotateShopJoinCodeInput,
  ResolveShiftChangeRequestInput,
  SendMessageInput,
  SetAcceptingBookingsInput,
  SetAppointmentStatusInput,
  SetShiftStatusInput,
  ShiftChangeRequestInput,
  ReplaceStaffShiftsInput,
  UpsertStaffShiftExceptionInput,
  RemoveStaffShiftExceptionInput,
  SignInInput,
  SignUpInput,
  StaffNoteInput,
  UpdateAttendanceRecordInput,
  UpdateProfileInput,
  UpdateBarberJobProfileInput,
  UpdateServiceInput,
  UpdateShopInput,
  CreateOwnerShopInput,
  UpdateOwnerShopInput,
  ShopVersionInput,
  UpdateShopHiringInput,
  SetShopHoursInput,
  CreateShopClosureInput,
  RequestShopMediaUploadInput,
  UpdateOwnerProviderCapabilityInput,
  SetProviderQualificationsInput,
  CreateServiceQualificationRequestInput,
  ResolveServiceQualificationRequestInput,
  CreateAppointmentChangeProposalInput,
  RespondAppointmentChangeProposalInput,
  ReportAppointmentDelayInput,
  CreateNoShowAppealInput,
  ResolveNoShowAppealInput,
  CreateWalkInInput,
  TransitionWalkInInput,
  ClaimWalkInInput,
  SetCashierCapabilityInput,
  RecordOfflinePaymentInput,
  ChangeOfflinePaymentInput,
} from './dto'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const WALL_CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const PHONE = /^\+?[0-9]{7,15}$/
const SPECIAL_CHAR = /[^\p{L}\p{N}\s]/u

export const uuidSchema = z.string().uuid()
export const dateKeySchema = z.string().regex(DATE_KEY, 'Expected YYYY-MM-DD.')
export const wallClockSchema = z.string().regex(WALL_CLOCK, 'Expected HH:MM.')
export const isoTimestampSchema = z.string().datetime({ offset: true })
const weekdaySchema = z.union([
  z.literal(0), z.literal(1), z.literal(2), z.literal(3),
  z.literal(4), z.literal(5), z.literal(6),
])

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

export const publicShopHoursBlockSchema: z.ZodType<PublicShopHoursBlock> = z.strictObject({
  weekday: weekdaySchema,
  open_time: wallClockSchema.nullable(),
  close_time: wallClockSchema.nullable(),
  closed: z.boolean(),
  block_order: z.number().int().nonnegative(),
})

export const publicShopClosureSchema: z.ZodType<PublicShopClosure> = z.strictObject({
  local_date: dateKeySchema,
  closed: z.boolean(),
  replacement_open_time: wallClockSchema.nullable(),
  replacement_close_time: wallClockSchema.nullable(),
})

export const publicShopMediaSchema: z.ZodType<PublicShopMedia> = z.strictObject({
  id: uuidSchema,
  role: z.enum(['storefront', 'interior', 'team', 'gallery']),
  sort_order: z.number().int().nonnegative(),
  alt_text: z.string().trim().min(1).max(240),
  url: z.string().url().max(4096),
})

export const publicShopDetailSchema: z.ZodType<PublicShopDetail> = z.strictObject({
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
  description: z.string().trim().max(2000).nullable(),
  public_contact_phone: z.string().trim().max(32).nullable(),
  timezone: z.string().trim().min(1).max(100),
  booking_mode: z.enum(['manual', 'instant']),
  chair_count: z.number().int().min(1).max(200),
  default_buffer_min: z.number().int().min(0).max(120),
  min_lead_minutes: z.number().int().min(0).max(10080),
  max_advance_days: z.number().int().min(1).max(365).nullable(),
  operating_hours: z.array(publicShopHoursBlockSchema).max(64),
  closures: z.array(publicShopClosureSchema).max(366),
  services: z.array(publicServiceSchema),
  media: z.array(publicShopMediaSchema).max(100),
})

export const publicSlotSchema: z.ZodType<Slot> = z.strictObject({
  starts_at: isoTimestampSchema,
  ends_at: isoTimestampSchema,
})

export const bookingQuoteSchema: z.ZodType<BookingQuote> = z.strictObject({
  bookable: z.boolean(),
  reason: z.string().nullable(),
  provider_user_id: uuidSchema.nullable(),
  requested_barber_id: uuidSchema.nullable(),
  substituted: z.boolean(),
  service_name: z.string().trim().min(1).nullable(),
  duration_min: z.number().int().positive().nullable(),
  price_cents: z.number().int().nonnegative().nullable(),
  buffer_min: z.number().int().min(0).max(120).nullable(),
  starts_at: isoTimestampSchema,
  ends_at: isoTimestampSchema.nullable(),
  booking_mode: z.enum(['manual', 'instant']),
  effective_mode: z.enum(['manual', 'instant']),
  request_expires_at: isoTimestampSchema.nullable(),
  timezone: z.string().trim().min(1).max(100),
  cancellation_cutoff_minutes: z.number().int().nonnegative(),
  idempotency_key: uuidSchema,
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

/**
 * A TOTP code is exactly six digits. Accepting anything else would send a
 * guaranteed-wrong value to the provider and spend one of the user's attempts.
 */
export const verifyMfaInputSchema: z.ZodType<VerifyMfaInput> = z.strictObject({
  factor_id: uuidSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your authenticator app.'),
})

export const mfaFactorParamsSchema = z.strictObject({ factorId: uuidSchema })

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
  barber_id: uuidSchema.optional(),
  service_id: uuidSchema,
  starts_at: isoTimestampSchema,
  notes: z.string().trim().max(1000).optional(),
  barber_preference: z.enum(['exact', 'preferred', 'any']).optional(),
  idempotency_key: uuidSchema,
}).refine(
  // Omitting the preference keeps the pre-P2-07 contract, where naming a barber
  // was mandatory. Only `any` may leave it out.
  (body) => body.barber_preference === 'any' || Boolean(body.barber_id),
  { message: 'A barber is required unless barber_preference is "any".', path: ['barber_id'] },
)

export const availabilityQuerySchema = z.strictObject({
  shopId: uuidSchema,
  serviceId: uuidSchema,
  date: dateKeySchema,
  barberId: uuidSchema.optional(),
})

export const availabilitySlotSchema: z.ZodType<AvailabilitySlot> = z.strictObject({
  provider_user_id: uuidSchema,
  starts_at: isoTimestampSchema,
  ends_at: isoTimestampSchema,
  buffer_min: z.number().int().min(0).max(120),
})

export const availabilityDaySchema: z.ZodType<AvailabilityDay> = z.strictObject({
  shop_id: uuidSchema,
  service_id: uuidSchema,
  date: dateKeySchema,
  slots: z.array(availabilitySlotSchema),
})

const ratingScoreSchema = z.number().int().min(1).max(5)
const ratingCommentSchema = z.string().trim().max(2000).optional()
const ratingDisplayModeSchema = z.enum(['short_name', 'anonymous']).optional()

export const submitRatingInputSchema: z.ZodType<SubmitRatingInput> = z.strictObject({
  eligibility_id: uuidSchema,
  barber_rating: ratingScoreSchema,
  shop_rating: ratingScoreSchema,
  comment: ratingCommentSchema,
  display_mode: ratingDisplayModeSchema,
})

export const editRatingInputSchema: z.ZodType<EditRatingInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  barber_rating: ratingScoreSchema,
  shop_rating: ratingScoreSchema,
  comment: ratingCommentSchema,
  display_mode: ratingDisplayModeSchema,
})

export const publishRatingResponseInputSchema: z.ZodType<PublishRatingResponseInput> = z.strictObject({
  body: z.string().trim().min(3).max(2000),
})

export const editRatingResponseInputSchema: z.ZodType<EditRatingResponseInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  body: z.string().trim().min(3).max(2000),
})

export const reportRatingInputSchema: z.ZodType<ReportRatingInput> = z.strictObject({
  response_id: uuidSchema.optional(),
  reason_category: z.enum(['abusive', 'spam', 'private_information', 'off_topic', 'not_a_customer', 'other']),
  reason: z.string().trim().min(3).max(1000),
})

export const moderateRatingReportInputSchema: z.ZodType<ModerateRatingReportInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  decision: z.enum(['hide_text', 'restore_text', 'reject']),
  reason: z.string().trim().min(3).max(1000),
})

const caseReasonSchema = z.string().trim().min(3).max(2000)

export const openAppointmentDisputeInputSchema: z.ZodType<OpenAppointmentDisputeInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: caseReasonSchema,
  evidence_note: z.string().trim().min(3).max(4000).optional(),
})

export const decideAppointmentDisputeInputSchema: z.ZodType<DecideAppointmentDisputeInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  decision: z.enum(['completed', 'cancelled']),
  reason: caseReasonSchema,
})

export const respondToDisputeDecisionInputSchema: z.ZodType<RespondToDisputeDecisionInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  response: z.enum(['accept', 'escalate']),
  reason: caseReasonSchema.optional(),
})

export const caseVersionInputSchema: z.ZodType<CaseVersionInput> = z.strictObject({
  expected_version: z.number().int().positive(),
})

export const caseReasonInputSchema: z.ZodType<CaseReasonInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: caseReasonSchema,
})

export const addCaseEvidenceInputSchema: z.ZodType<AddCaseEvidenceInput> = z.strictObject({
  note: z.string().trim().min(3).max(4000),
  visibility: z.enum(['case', 'admin_only']).optional(),
})

export const resolveSupportCaseInputSchema: z.ZodType<ResolveSupportCaseInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  resolution: z.enum(['upheld_owner', 'overturned_owner', 'no_action']),
  reason: caseReasonSchema,
  corrected_status: z.enum(['completed', 'cancelled']).optional(),
})

export const escalateRatingReportInputSchema: z.ZodType<EscalateRatingReportInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  reason: caseReasonSchema,
})

export const setRatingEditWindowInputSchema: z.ZodType<SetRatingEditWindowInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  editable_until: isoTimestampSchema,
  reason: z.string().trim().min(3).max(1000),
})

export const sendMessageInputSchema: z.ZodType<SendMessageInput> = z.strictObject({
  conversation_id: uuidSchema,
  body: z.string().trim().min(1).max(4000),
})

const employmentRequestMessageSchema = z.string().trim().min(1).max(1000).nullable().optional()

export const createEmploymentRequestInputSchema: z.ZodType<CreateEmploymentRequestInput> =
  z.discriminatedUnion('direction', [
    z.strictObject({
      direction: z.literal('barber_application'),
      shop_id: uuidSchema,
      message: employmentRequestMessageSchema,
      idempotency_key: uuidSchema,
    }),
    z.strictObject({
      direction: z.literal('owner_invitation'),
      barber_id: uuidSchema,
      message: employmentRequestMessageSchema,
      idempotency_key: uuidSchema,
    }),
  ])

export const createJoinCodeRequestInputSchema: z.ZodType<CreateJoinCodeRequestInput> = z.strictObject({
  code: z.string().trim().min(8).max(64),
  message: employmentRequestMessageSchema,
  idempotency_key: uuidSchema,
})

export const updateOwnerProviderCapabilityInputSchema: z.ZodType<UpdateOwnerProviderCapabilityInput> =
  z.strictObject({
    expected_version: z.number().int().min(0),
    active: z.boolean(),
    accepting_bookings: z.boolean(),
    reason: z.string().trim().min(3).max(500),
    command_id: uuidSchema,
  }).refine((value) => value.active || !value.accepting_bookings, {
    message: 'A disabled owner provider cannot accept bookings.',
    path: ['accepting_bookings'],
  })

export const setProviderQualificationsInputSchema: z.ZodType<SetProviderQualificationsInput> =
  z.strictObject({
    provider_user_id: uuidSchema,
    expected_version: z.number().int().min(1),
    service_ids: z.array(uuidSchema).max(100).refine(
      (ids) => new Set(ids).size === ids.length,
      'Service ids must be unique.',
    ),
    reason: z.string().trim().min(3).max(500),
    command_id: uuidSchema,
  })

export const createServiceQualificationRequestInputSchema:
  z.ZodType<CreateServiceQualificationRequestInput> = z.strictObject({
    service_id: uuidSchema,
    message: z.string().trim().min(1).max(500).nullable().optional(),
    idempotency_key: uuidSchema,
  })

export const resolveServiceQualificationRequestInputSchema:
  z.ZodType<ResolveServiceQualificationRequestInput> = z.strictObject({
    expected_version: z.number().int().min(1),
    reason: z.string().trim().min(3).max(500).nullable().optional(),
  })

export const resolveEmploymentRequestInputSchema: z.ZodType<ResolveEmploymentRequestInput> = z.strictObject({
  expected_version: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
})

export const updateBarberJobProfileInputSchema: z.ZodType<UpdateBarberJobProfileInput> = z.strictObject({
  visible: z.boolean(),
  bio: z.string().trim().min(1).max(1000).nullable().optional(),
  experience_years: z.number().int().min(0).max(80).nullable().optional(),
  specialties: z.array(z.string().trim().min(1).max(80)).max(20),
  portfolio_media: z.array(z.url().max(500)).max(8),
  coarse_work_area: z.string().trim().min(1).max(120).nullable().optional(),
  schedule_preference: z.string().trim().min(1).max(240).nullable().optional(),
})

export const rotateShopJoinCodeInputSchema: z.ZodType<RotateShopJoinCodeInput> = z.strictObject({
  command_id: uuidSchema,
  expires_in_days: z.number().int().min(1).max(30),
  usage_limit: z.number().int().min(1).max(100),
})

export const revokeShopJoinCodeInputSchema: z.ZodType<RevokeShopJoinCodeInput> = z.strictObject({
  expected_version: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500),
})

export const endEmploymentInputSchema: z.ZodType<EndEmploymentInput> = z.strictObject({
  reason: z.string().trim().min(3).max(1000),
})

export const shiftChangeRequestInputSchema: z.ZodType<ShiftChangeRequestInput> = z.strictObject({
  date: dateKeySchema,
  message: z.string().trim().min(1).max(1000),
  kind: z.enum(['time_off', 'different_hours']),
  start_time: wallClockSchema.nullable().optional(),
  end_time: wallClockSchema.nullable().optional(),
  idempotency_key: uuidSchema,
}).superRefine((value, context) => {
  // `different_hours` is meaningless without a range, and `time_off` must not
  // smuggle one in: the database constraint enforces the same pairing.
  if (value.kind === 'different_hours') {
    if (!value.start_time || !value.end_time || value.start_time >= value.end_time) {
      context.addIssue({ code: 'custom', message: 'A different-hours request needs a valid time range.' })
    }
  } else if (value.start_time || value.end_time) {
    context.addIssue({ code: 'custom', message: 'A time-off request must not carry a time range.' })
  }
})

export const replaceStaffShiftsInputSchema: z.ZodType<ReplaceStaffShiftsInput> = z.strictObject({
  expected_version: z.number().int().min(1),
  blocks: z.array(availabilityRuleInputSchema).max(28),
})

export const upsertStaffShiftExceptionInputSchema: z.ZodType<UpsertStaffShiftExceptionInput> = z.strictObject({
  expected_version: z.number().int().min(1),
  date: dateKeySchema,
  is_available: z.boolean(),
  start_time: wallClockSchema.nullable().optional(),
  end_time: wallClockSchema.nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.is_available) {
    if (!value.start_time || !value.end_time || value.start_time >= value.end_time) {
      context.addIssue({ code: 'custom', message: 'An available exception needs a valid time range.' })
    }
  } else if (value.start_time || value.end_time) {
    context.addIssue({ code: 'custom', message: 'An unavailable exception must not carry times.' })
  }
})

export const removeStaffShiftExceptionInputSchema: z.ZodType<RemoveStaffShiftExceptionInput> = z.strictObject({
  expected_version: z.number().int().min(1),
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
export const createAppointmentChangeProposalInputSchema: z.ZodType<CreateAppointmentChangeProposalInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  service_id: uuidSchema,
  provider_id: uuidSchema,
  starts_at: isoTimestampSchema,
  reason: z.string().trim().min(3).max(1000),
  expires_at: isoTimestampSchema,
})
export const respondAppointmentChangeProposalInputSchema: z.ZodType<RespondAppointmentChangeProposalInput> = z.strictObject({
  expected_proposal_version: z.number().int().positive(),
  expected_appointment_version: z.number().int().positive(),
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(3).max(1000).optional(),
})
export const reportAppointmentDelayInputSchema: z.ZodType<ReportAppointmentDelayInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  category: z.enum(['provider_late', 'shop_delay', 'previous_service', 'other']),
  estimate_minutes: z.number().int().min(5).max(240),
  reason: z.string().trim().min(3).max(1000),
})
export const createNoShowAppealInputSchema: z.ZodType<CreateNoShowAppealInput> = z.strictObject({
  reason: z.string().trim().min(3).max(1000),
  evidence_note: z.string().trim().max(2000).optional(),
})
export const resolveNoShowAppealInputSchema: z.ZodType<ResolveNoShowAppealInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  resolution: z.enum(['accepted', 'upheld']),
  reason: z.string().trim().min(3).max(1000),
})
export const createWalkInInputSchema: z.ZodType<CreateWalkInInput> = z.strictObject({
  display_name: z.string().trim().min(1).max(80),
  service_id: uuidSchema.optional(),
  requested_barber_id: uuidSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
})
export const transitionWalkInInputSchema: z.ZodType<TransitionWalkInInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  action: z.enum(['call', 'check_in', 'start', 'complete', 'attention', 'cancel']),
  provider_id: uuidSchema.optional(),
  reason: z.string().trim().min(3).max(1000).optional(),
})
export const claimWalkInInputSchema: z.ZodType<ClaimWalkInInput> = z.strictObject({
  code: z.string().regex(/^\d{6}$/),
  phone: z.string().trim().min(7).max(32),
})
export const setCashierCapabilityInputSchema: z.ZodType<SetCashierCapabilityInput> = z.strictObject({ active: z.boolean() })
export const recordOfflinePaymentInputSchema: z.ZodType<RecordOfflinePaymentInput> = z.strictObject({
  appointment_id: uuidSchema.optional(),
  walk_in_id: uuidSchema.optional(),
  method: z.enum(['cash', 'card_terminal', 'ewallet', 'other_offline']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  amount_cents: z.number().int().nonnegative(),
  paid_at: isoTimestampSchema,
  idempotency_key: uuidSchema,
}).superRefine((value, context) => {
  if ((value.appointment_id === undefined) === (value.walk_in_id === undefined)) {
    context.addIssue({ code: 'custom', message: 'Choose exactly one appointment or walk-in.' })
  }
})
export const changeOfflinePaymentInputSchema: z.ZodType<ChangeOfflinePaymentInput> = z.strictObject({
  expected_version: z.number().int().positive(),
  action: z.enum(['correct', 'refund', 'void']),
  amount_cents: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(1000),
})
export const resolveShiftChangeRequestInputSchema: z.ZodType<ResolveShiftChangeRequestInput> = z.strictObject({
  expected_version: z.number().int().min(1),
  decision: z.enum(['approve', 'decline']),
  note: z.string().trim().min(3).max(500).nullable().optional(),
})

/**
 * Wire body for `/owner/shift-change-requests/:id/approve|decline`. The decision
 * lives in the path, so it must not also be required in the body.
 */
export const resolveShiftChangeRequestBodySchema = z.strictObject({
  expected_version: z.number().int().min(1),
  note: z.string().trim().min(3).max(500).nullable().optional(),
})
export const openConversationInputSchema: z.ZodType<OpenConversationInput> = z.strictObject({
  shop_id: uuidSchema,
  appointment_id: uuidSchema.optional(),
  barber_id: uuidSchema.optional(),
})

export const blockConversationPeerInputSchema: z.ZodType<BlockConversationPeerInput> = z.strictObject({
  blocked: z.boolean(),
  reason: z.string().trim().min(3).max(1000).optional(),
})

export const reportConversationInputSchema: z.ZodType<ReportConversationInput> = z.strictObject({
  message_id: uuidSchema.optional(),
  reason_category: z.enum(['abusive', 'spam', 'scam', 'private_information', 'off_platform_payment', 'other']),
  reason: z.string().trim().min(3).max(1000),
})
export const openStaffConversationInputSchema: z.ZodType<OpenStaffConversationInput> = z.strictObject({ barber_id: uuidSchema })

export const notificationPreferencesInputSchema: z.ZodType<NotificationPreferencesInput> = z.strictObject({
  expected_version: z.number().int().positive().optional(),
  booking_reminders: z.boolean(),
  chat_notifications: z.boolean(),
  email_updates: z.boolean(),
  nearby_alerts: z.boolean(),
  nearby_radius_km: z.number().int().min(1).max(50).optional(),
  // Both or neither: half a quiet-hours window is not a window.
  quiet_hours_start: wallClockSchema.nullable().optional(),
  quiet_hours_end: wallClockSchema.nullable().optional(),
  language: z.enum(['en', 'fil']).optional(),
  text_size: z.enum(['default', 'large', 'larger']).optional(),
  high_contrast: z.boolean().optional(),
  reduce_motion: z.boolean().optional(),
  // No `transactional_notices`: it cannot be switched off, so there is no field.
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

export const ownerServiceInputSchema: z.ZodType<OwnerServiceInput> = z.strictObject({
  name: z.string().trim().min(1).max(120),
  duration_min: z.number().int().min(5).max(480),
  price_cents: z.number().int().nonnegative(),
  active: z.boolean().optional(),
})

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
  // Booking window. Ranges mirror the shops_min_lead_range and
  // shops_max_advance_range check constraints so a bad value is rejected at the
  // contract boundary rather than as a database error.
  min_lead_minutes: z.number().int().min(0).max(10080).optional(),
  // Null clears the horizon back to "no limit"; the column is nullable for
  // exactly that reason.
  max_advance_days: z.number().int().min(1).max(365).nullable().optional(),
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

export const updateShopHiringInputSchema: z.ZodType<UpdateShopHiringInput> = z.strictObject({
  expected_version: z.number().int().min(1),
  status: z.enum(['off', 'open', 'full']),
  open_positions: z.number().int().min(0).max(1000).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}).superRefine((input, context) => {
  if (input.status === 'open' && input.open_positions === 0) {
    context.addIssue({
      code: 'custom',
      path: ['open_positions'],
      message: 'An open hiring state needs a positive count or no exact count.',
    })
  }
})

export const setShopHoursInputSchema: z.ZodType<SetShopHoursInput> = z.strictObject({
  expected_version: z.number().int().min(1),
  blocks: z.array(z.strictObject({
    weekday: weekdaySchema,
    open_time: wallClockSchema.nullable().optional(),
    close_time: wallClockSchema.nullable().optional(),
    closed: z.boolean().optional(),
    block_order: z.number().int().min(0).max(20).optional(),
  })).max(28),
})

export const requestShopMediaUploadInputSchema: z.ZodType<RequestShopMediaUploadInput> = z.strictObject({
  filename: z.string().trim().min(1).max(180),
  declared_mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  declared_size_bytes: z.number().int().min(1).max(8 * 1024 * 1024),
  role: z.enum(['storefront', 'interior', 'team', 'gallery']),
  alt_text: z.string().trim().min(1).max(240),
  sort_order: z.number().int().min(0).max(1000).optional(),
})

export const createShopClosureInputSchema: z.ZodType<CreateShopClosureInput> = z.strictObject({
  local_date: dateKeySchema,
  closed: z.boolean().optional(),
  replacement_open_time: wallClockSchema.nullable().optional(),
  replacement_close_time: wallClockSchema.nullable().optional(),
  reason: z.string().trim().max(200).nullable().optional(),
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
  /** Cursor: return messages strictly older than this ISO timestamp. */
  before: isoTimestampSchema.optional(),
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
