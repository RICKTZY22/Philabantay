// The data-access contract. The UI depends ONLY on these interfaces.
// The sole implementation is the Express + Supabase ApiBackend; pages never
// touch a concrete backend, so the seam stays swappable.

import type {
  AppointmentReasonInput,
  AppointmentVersionInput,
  AvailabilityQueryInput,
  CheckInAppointmentInput,
  CreateAppointmentInput,
  CompleteRoleOnboardingInput,
  ChangePasswordInput,
  CreateBugReportInput,
  CreateEmploymentRequestInput,
  CreateJoinCodeRequestInput,
  SendMessageInput,
  NotificationPreferencesInput,
  BlockConversationPeerInput,
  ReportConversationInput,
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
  ResolveAppointmentDisputeInput,
  ShiftChangeRequestInput,
  VerifyMfaInput,
  SignInInput,
  SignUpInput,
  StaffNoteInput,
  UpdateProfileInput,
  UpdateBarberJobProfileInput,
  CreateOwnerShopInput,
  UpdateOwnerShopInput,
  ShopVersionInput,
  SetShopHoursInput,
  SetShopHoursResult,
  CreateShopClosureInput,
  OwnerServiceInput,
  RequestShopMediaUploadInput,
  ShopMediaUploadGrant,
  UpdateServiceInput,
  UpdateShopHiringInput,
  ResolveEmploymentRequestInput,
  ResolveShiftChangeRequestInput,
  ResolveShiftChangeRequestResult,
  RemoveStaffShiftExceptionInput,
  ReplaceStaffShiftsInput,
  StaffScheduleWriteResult,
  UpsertStaffShiftExceptionInput,
  RotateShopJoinCodeInput,
  RevokeShopJoinCodeInput,
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
import { DataError } from './dto'
import {
  adminVerificationDetailSchema,
  adminVerificationQueueItemSchema,
  cursorPageSchema,
  professionalAccessSummarySchema,
  professionalPhoneVerificationChallengeSchema,
  publicBarberSchema,
  availabilityDaySchema,
  bookingQuoteSchema,
  publicServiceSchema,
  publicShopDetailSchema,
  publicShopWithStatusSchema,
  publicSlotSchema,
  shortLivedEvidenceViewSchema,
  verificationEvidenceUploadGrantSchema,
  verificationWorkspaceSchema,
} from './schemas'
import type {
  AdminVerificationDetail,
  AdminVerificationQueueItem,
  ApproveVerificationInput,
  AssignVerificationReviewerInput,
  CompleteVerificationEvidenceUploadInput,
  ConfirmProfessionalPhoneVerificationInput,
  CreateVerificationSubmissionInput,
  CursorPage,
  ListAdminVerificationsQuery,
  ProfessionalAccessSummary,
  ProfessionalPhoneVerificationChallenge,
  RejectVerificationInput,
  RemoveVerificationEvidenceInput,
  RequestVerificationEvidenceUploadInput,
  RequestVerificationInformationInput,
  RestoreProfessionalInput,
  ShortLivedEvidenceView,
  StartProfessionalPhoneVerificationInput,
  SubmitVerificationInput,
  SuspendProfessionalInput,
  UpdateVerificationSubmissionInput,
  VerificationEvidenceUploadGrant,
  VerificationWorkspace,
  WithdrawVerificationInput,
} from './verification'
import type {
  Appointment,
  AppointmentCheckInCode,
  AppointmentDetailed,
  AppointmentEvent,
  AvailabilityDay,
  AvailabilityOverride,
  PublicAvailabilityOverride,
  AvailabilityRule,
  Barber,
  BarberAbsence,
  BarberEmployment,
  BarberWithProfile,
  BookingQuote,
  BugReport,
  ConversationDetailed,
  Message,
  Profile,
  Review,
  RatingResponse,
  RatingReport,
  RatingEvent,
  CustomerRatingWorkspace,
  PublicRatingSummary,
  SupportCase,
  SupportCaseDetail,
  CaseEvidence,
  CaseEvent,
  ShopAnalytics,
  ProviderPerformance,
  AnalyticsRange,
  ConversationBlock,
  ConversationReport,
  AccountPreferences,
  MfaStatus,
  MfaEnrolment,
  NotificationOperationsHealth,
  FailedNotification,
  Service,
  StoredService,
  ShiftChangeRequest,
  ShopStaffMember,
  StaffSchedule,
  PublicShopDetail,
  ShopWithStatus,
  OwnerShop,
  ShopOperatingHours,
  ShopClosure,
  ShopMedia,
  OwnerShopHiring,
  HiringShop,
  HiringListing,
  BarberJobProfile,
  JobSeekerProfile,
  EmploymentRequest,
  EmploymentRequestDecision,
  EmploymentRequestDetail,
  ShopJoinCodeDetails,
  OwnerProviderCapability,
  OwnerQualificationWorkspace,
  ServiceProviderQualification,
  BarberQualificationView,
  ServiceQualificationRequest,
  Slot,
  StaffNote,
  AppointmentChangeProposal,
  AppointmentDelay,
  AppointmentAttentionItem,
  NoShowAppeal,
  CustomerStrikeEvent,
  WalkInEntry,
  WalkInClaimCode,
  GuestWalkInVisit,
  QueueEvent,
  CashierCapability,
  PaymentRecord,
  PaymentEvent,
  InAppNotification,
  CloseoutRun,
} from './types'
import { canonicalAppointmentStatus } from './appointment-lifecycle'

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

  /**
   * Multi-factor authentication.
   *
   * Every `/admin` route is mounted behind an AAL2 check, and until these
   * existed there was no way for a browser to reach AAL2: no enrolment, and no
   * challenge at sign-in. `signIn` reports `mfa_required` when the identity has
   * a verified factor, and `verifyMfa` exchanges a code for the stepped-up
   * session.
   */
  /**
   * The factor this session may step up with, set by the most recent `signIn`
   * and cleared once used. Null when there is nothing to step up.
   */
  pendingMfaFactor(): string | null
  mfaStatus(): Promise<MfaStatus>
  /** Begin enrolment. The secret is returned once and never again. */
  enrolMfa(): Promise<MfaEnrolment>
  /** Finish enrolment, or step an existing session up to AAL2. */
  verifyMfa(input: VerifyMfaInput): Promise<void>
  /** Removing a factor requires an AAL2 session, not just a password. */
  removeMfa(factorId: string): Promise<void>
}

/**
 * Account preferences. There was no method here before Phase 4: the Express route
 * existed but nothing in the app called it, so the Notification settings screen
 * read and wrote browser local storage and a second device saw defaults.
 */
export interface PreferenceService {
  /** Server-stored preferences, or the documented defaults for a new account. */
  getMine(): Promise<AccountPreferences>
  /**
   * Version-checked save. Mandatory transactional notices are absent from the
   * input by design: they cannot be switched off.
   */
  save(input: NotificationPreferencesInput): Promise<AccountPreferences>
}

export interface SupportService {
  /** Submit a private support report for the signed-in account. */
  reportBug(input: CreateBugReportInput): Promise<BugReport>
}

export interface VerificationService {
  getMine(): Promise<VerificationWorkspace>
  createSubmission(input: CreateVerificationSubmissionInput): Promise<VerificationWorkspace>
  updateSubmission(id: string, input: UpdateVerificationSubmissionInput): Promise<VerificationWorkspace>
  requestEvidenceUpload(
    id: string,
    input: RequestVerificationEvidenceUploadInput,
  ): Promise<VerificationEvidenceUploadGrant>
  completeEvidenceUpload(
    id: string,
    documentId: string,
    input: CompleteVerificationEvidenceUploadInput,
  ): Promise<VerificationWorkspace>
  removeEvidence(
    id: string,
    documentId: string,
    input: RemoveVerificationEvidenceInput,
  ): Promise<VerificationWorkspace>
  getEvidenceView(id: string, documentId: string): Promise<ShortLivedEvidenceView>
  submit(id: string, input: SubmitVerificationInput): Promise<VerificationWorkspace>
  withdraw(id: string, input: WithdrawVerificationInput): Promise<VerificationWorkspace>
  startProfessionalPhoneVerification(
    input: StartProfessionalPhoneVerificationInput,
  ): Promise<ProfessionalPhoneVerificationChallenge>
  confirmProfessionalPhoneVerification(
    input: ConfirmProfessionalPhoneVerificationInput,
  ): Promise<VerificationWorkspace>
}

export interface AdminService {
  listVerifications(
    query: ListAdminVerificationsQuery,
  ): Promise<CursorPage<AdminVerificationQueueItem>>
  getVerification(id: string): Promise<AdminVerificationDetail>
  assignVerification(
    id: string,
    input: AssignVerificationReviewerInput,
  ): Promise<AdminVerificationDetail>
  getVerificationEvidenceView(id: string, documentId: string): Promise<ShortLivedEvidenceView>
  requestVerificationInformation(
    id: string,
    input: RequestVerificationInformationInput,
  ): Promise<AdminVerificationDetail>
  approveVerification(
    id: string,
    input: ApproveVerificationInput,
  ): Promise<AdminVerificationDetail>
  rejectVerification(
    id: string,
    input: RejectVerificationInput,
  ): Promise<AdminVerificationDetail>
  getProfessional(userId: string): Promise<ProfessionalAccessSummary>
  suspendProfessional(
    userId: string,
    input: SuspendProfessionalInput,
  ): Promise<ProfessionalAccessSummary>
  restoreProfessional(
    userId: string,
    input: RestoreProfessionalInput,
  ): Promise<ProfessionalAccessSummary>
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
  /** Open bookable slots for a barber + service on a given ISO date (YYYY-MM-DD). */
  getOpenSlots(barberId: string, serviceId: string, date: string): Promise<Slot[]>
  /** Customer-aware slots across every eligible provider at one shop. */
  getDay(input: AvailabilityQueryInput): Promise<AvailabilityDay>
}

export interface ServiceCatalog {
  list(shopId?: string): Promise<Service[]>
}

export interface BookingService {
  /** Advisory review data; creating still rechecks and claims transactionally. */
  quote(input: CreateAppointmentInput): Promise<BookingQuote>
  create(input: CreateAppointmentInput): Promise<Appointment>
  /** Customer-only atomic move of an active appointment to a validated slot. */
  reschedule(appointmentId: string, input: Omit<CreateAppointmentInput, 'idempotency_key'>): Promise<Appointment>
  cancel(appointmentId: string): Promise<Appointment>
  /** Appointments for the signed-in user (as customer or barber). */
  listMine(): Promise<AppointmentDetailed[]>
  /** Owner-only: every booking made at the signed-in owner's shop. */
  listForMyShop(): Promise<AppointmentDetailed[]>
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
  listChangeProposals(appointmentId: string): Promise<AppointmentChangeProposal[]>
  proposeChange(appointmentId: string, input: CreateAppointmentChangeProposalInput): Promise<AppointmentChangeProposal>
  respondToChange(proposalId: string, input: RespondAppointmentChangeProposalInput): Promise<AppointmentChangeProposal>
  listDelays(appointmentId: string): Promise<AppointmentDelay[]>
  reportDelay(appointmentId: string, input: ReportAppointmentDelayInput): Promise<AppointmentDelay>
  appealNoShow(appointmentId: string, input: CreateNoShowAppealInput): Promise<NoShowAppeal>
  listMyNoShowAppeals(): Promise<NoShowAppeal[]>
  listShopNoShowAppeals(): Promise<NoShowAppeal[]>
  resolveNoShowAppeal(appealId: string, input: ResolveNoShowAppealInput): Promise<NoShowAppeal>
  waiveStrike(appointmentId: string, input: { reason: string }): Promise<CustomerStrikeEvent>
  listAttention(): Promise<AppointmentAttentionItem[]>
}

export interface WalkInService {
  list(): Promise<WalkInEntry[]>
  create(input: CreateWalkInInput): Promise<WalkInEntry>
  issueClaimCode(walkInId: string, input: { expected_version: number }): Promise<WalkInClaimCode>
  claim(walkInId: string, input: ClaimWalkInInput): Promise<GuestWalkInVisit>
  linkMine(walkInId: string): Promise<GuestWalkInVisit>
  transition(walkInId: string, input: TransitionWalkInInput): Promise<WalkInEntry>
  timeline(walkInId: string): Promise<QueueEvent[]>
}

export interface PaymentService {
  list(): Promise<PaymentRecord[]>
  timeline(paymentId: string): Promise<PaymentEvent[]>
  record(input: RecordOfflinePaymentInput): Promise<PaymentRecord>
  change(paymentId: string, input: ChangeOfflinePaymentInput): Promise<PaymentRecord>
  setCashier(userId: string, input: SetCashierCapabilityInput): Promise<CashierCapability>
}

export interface NotificationService {
  list(): Promise<InAppNotification[]>
  markRead(notificationId: string): Promise<InAppNotification>
}

export interface CloseoutService {
  list(): Promise<CloseoutRun[]>
  run(localDate: string): Promise<CloseoutRun>
}

export interface ChatService {
  /** Conversations the signed-in user participates in, newest activity first. */
  listConversations(): Promise<ConversationDetailed[]>
  /**
   * Find or create the customer-to-shop conversation. Idempotent in the database,
   * so a double tap cannot produce two threads. Pass `appointmentId` to record
   * which visit the thread is about.
   */
  openConversation(shopId: string, appointmentId?: string): Promise<ConversationDetailed>
  /**
   * Owner-only: find or create an internal owner-to-barber thread sa sariling
   * shop. Consumers distinguish it through `is_staff_thread`; the owner's
   * private user id is not added to the public shop summary.
   */
  openStaffConversation(barberId: string): Promise<ConversationDetailed>
  getMessages(conversationId: string, limit?: number): Promise<Message[]>
  /**
   * Cursor page of one thread, newest-first internally and returned oldest-first.
   * `before` is the previous page's `next_cursor`.
   */
  getMessagePage(conversationId: string, query?: { limit?: number; before?: string }): Promise<{
    messages: Message[]
    has_more: boolean
    next_cursor: string | null
  }>
  sendMessage(input: SendMessageInput): Promise<Message>
  markRead(conversationId: string): Promise<void>
  /** Accounts this user has blocked from direct messages. */
  listBlocks(): Promise<ConversationBlock[]>
  /**
   * Block or unblock direct messages with one account. Blocking never suppresses
   * required booking or security notices, which travel through notifications.
   */
  setBlock(userId: string, input: BlockConversationPeerInput): Promise<{ blocked_id: string; blocked: boolean }>
  report(conversationId: string, input: ReportConversationInput): Promise<ConversationReport>
  /** Realtime: fires for each new message in the conversation. */
  subscribe(conversationId: string, cb: (message: Message) => void): Unsubscribe
}

export interface ShopService {
  /** All shops with live status — the customer map's data source. */
  list(): Promise<ShopWithStatus[]>
  /** One published shop with allowlisted facts and approved public media. */
  get(shopId: string): Promise<PublicShopDetail | null>
}

/** P2-01: the owner's private, version-checked shop lifecycle commands. */
export interface OwnerShopService {
  /** The signed-in owner's shop in any lifecycle status, or null before setup. */
  getMine(): Promise<OwnerShop | null>
  /** Create the owner's single shop as an unpublished draft. */
  create(input: CreateOwnerShopInput): Promise<OwnerShop>
  /** Version-checked edit of shop fields; returns the next version. */
  update(input: UpdateOwnerShopInput): Promise<OwnerShop>
  /** Publish once the readiness checklist passes; version-checked. */
  publish(input: ShopVersionInput): Promise<OwnerShop>
  /** Return a published shop to an unlisted draft; version-checked. */
  unpublish(input: ShopVersionInput): Promise<OwnerShop>
  /** The owner's weekly operating hours (empty array until set). */
  getHours(): Promise<ShopOperatingHours[]>
  /** Replace-all update of the owner's weekly operating hours. */
  setHours(input: SetShopHoursInput): Promise<SetShopHoursResult>
  /** Date-specific closures / replacement-hours days for the owner's shop. */
  getClosures(): Promise<ShopClosure[]>
  /** Create or update (upsert by date) one closure. */
  saveClosure(input: CreateShopClosureInput): Promise<ShopClosure>
  /** Remove one closure by id. */
  removeClosure(closureId: string): Promise<void>
  /** Every service on the owner's shop, active and retired (the editor view). */
  listServices(): Promise<StoredService[]>
  /** Add a service to the owner's shop. */
  createService(input: OwnerServiceInput): Promise<StoredService>
  /** Edit a service; toggle `active` to retire or restore it. */
  updateService(serviceId: string, input: UpdateServiceInput): Promise<StoredService>
  /** Deactivate a service without deleting appointment history. */
  removeService(serviceId: string): Promise<StoredService>
  /** Private shop photos with short-lived owner preview URLs. */
  listMedia(): Promise<ShopMedia[]>
  /** Signed upload + server-side content validation, kept behind this adapter. */
  uploadMedia(input: RequestShopMediaUploadInput, file: Blob): Promise<ShopMedia>
  removeMedia(mediaId: string): Promise<void>
  /** Owner-only canonical off/open/full hiring state. */
  getHiring(): Promise<OwnerShopHiring | null>
  /** Version-checked hiring update; stale sessions receive `conflict`. */
  updateHiring(input: UpdateShopHiringInput): Promise<OwnerShopHiring>
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
  /**
   * Pending eligibilities plus the customer's own reviews and their responses,
   * in one read, so the rating prompt can appear on home rather than only in
   * booking history.
   */
  myWorkspace(): Promise<CustomerRatingWorkspace>
  /** Spend one eligibility. There is no way to rate a visit without one. */
  submit(input: SubmitRatingInput): Promise<Review>
  /** Version-checked edit, refused after the seven-day window closes. */
  edit(ratingId: string, input: EditRatingInput): Promise<Review>
  /** Public trust view for a shop, optionally narrowed to one provider. */
  publicSummary(shopId: string, providerId?: string): Promise<PublicRatingSummary>
  /** Reviews for the signed-in professional, with their own responses. */
  listForProvider(): Promise<Array<Review & { responses: RatingResponse[] }>>
  /** Reviews for the owner's shop, with responses and open reports. */
  listForShop(): Promise<Array<Review & { responses: RatingResponse[]; reports: RatingReport[] }>>
  /** One public response per authoring side. */
  respond(ratingId: string, input: PublishRatingResponseInput): Promise<RatingResponse>
  editResponse(responseId: string, input: EditRatingResponseInput): Promise<RatingResponse>
  /** Customer reports a response; owner or barber reports review text. */
  report(ratingId: string, input: ReportRatingInput): Promise<RatingReport>
  /** Append-only decision history for one review. */
  timeline(ratingId: string): Promise<RatingEvent[]>
}

export interface AnalyticsService {
  /**
   * Every owner figure in one reproducible read, in the shop's own timezone, with
   * the definition of each metric attached. `range: 'custom'` needs `from`/`to`.
   */
  shop(shopId: string, query?: { range?: AnalyticsRange; from?: string; to?: string }): Promise<ShopAnalytics>
  /** A provider's own numbers. An owner may pass `providerId`; a barber may not. */
  providerPerformance(query?: {
    range?: AnalyticsRange
    from?: string
    to?: string
    providerId?: string
  }): Promise<ProviderPerformance>
}

export interface SupportCaseService {
  /** Open a dispute on a visit awaiting confirmation; owner-first by design. */
  openAppointmentDispute(appointmentId: string, input: OpenAppointmentDisputeInput): Promise<SupportCase>
  /** Cases the signed-in account participates in. */
  listMine(): Promise<SupportCase[]>
  /** Every case on the owner's shop. */
  listForShop(): Promise<SupportCase[]>
  /** Case body, evidence and audit. Reading it is itself an audited access. */
  get(caseId: string): Promise<SupportCaseDetail>
  addEvidence(caseId: string, input: AddCaseEvidenceInput): Promise<CaseEvidence>
  /** Owner decision, which starts the customer's 48-hour escalation window. */
  decide(caseId: string, input: DecideAppointmentDisputeInput): Promise<SupportCase>
  /** Customer accepts the decision or escalates it for platform review. */
  respond(caseId: string, input: RespondToDisputeDecisionInput): Promise<SupportCase>
  /** Turn a moderation report into an escalated case. */
  escalateRatingReport(reportId: string, input: EscalateRatingReportInput): Promise<SupportCase>
}

export interface SupportCaseAdminService {
  /** Escalated work only. Owner-review cases never appear here. */
  listQueue(status?: 'escalated' | 'information_requested' | 'resolved'): Promise<SupportCase[]>
  assign(caseId: string, input: CaseVersionInput): Promise<SupportCase>
  requestInformation(caseId: string, input: CaseReasonInput): Promise<SupportCase>
  /** Final decision; `overturned_owner` applies an audited visit correction. */
  resolve(caseId: string, input: ResolveSupportCaseInput): Promise<SupportCase>
  /** Sensitive-access view: who opened which case body. */
  listAccessAudit(): Promise<CaseEvent[]>
}

export interface NotificationOperationsService {
  /** Queue health with the definition of each figure attached. */
  health(): Promise<NotificationOperationsHealth>
  /** Notices that are retrying or dead-lettered. */
  listFailed(): Promise<FailedNotification[]>
  /** Return one notice to the queue with its attempt counter reset. */
  retry(outboxId: string): Promise<FailedNotification>
}

export interface RatingModerationService {
  /** Open reports across every shop, for a moderator. */
  listReports(status?: 'open' | 'upheld' | 'rejected'): Promise<RatingReport[]>
  /** Hide text, restore text, or reject the report. The score never moves. */
  decide(reportId: string, input: ModerateRatingReportInput): Promise<RatingReport>
  /** Q15 support correction: reopen or close a review's edit window. */
  setEditWindow(ratingId: string, input: SetRatingEditWindowInput): Promise<Review>
}

export interface BarberEmploymentService {
  /** Hiring shops shown before the barber has a shop membership. */
  listHiringShops(): Promise<HiringShop[]>
  /** Current shop derived from its registered barber membership. */
  getMyShop(): Promise<ShopWithStatus | null>
  getJobProfile(): Promise<BarberJobProfile>
  updateJobProfile(input: UpdateBarberJobProfileInput): Promise<BarberJobProfile>
  /** Owner-only visible job seekers; private home coordinates are never returned. */
  listJobSeekers(): Promise<JobSeekerProfile[]>
  listRequests(): Promise<EmploymentRequest[]>
  getRequest(requestId: string): Promise<EmploymentRequestDetail>
  createRequest(input: CreateEmploymentRequestInput): Promise<EmploymentRequest>
  createJoinCodeRequest(input: CreateJoinCodeRequestInput): Promise<EmploymentRequest>
  acceptRequest(requestId: string, input: ResolveEmploymentRequestInput): Promise<EmploymentRequestDecision>
  declineRequest(requestId: string, input: ResolveEmploymentRequestInput): Promise<EmploymentRequest>
  withdrawRequest(requestId: string, input: ResolveEmploymentRequestInput): Promise<EmploymentRequest>
  /** Shop-owner-only roster code controls. */
  getMyShopJoinCode(): Promise<ShopJoinCodeDetails | null>
  rotateMyShopJoinCode(input: RotateShopJoinCodeInput): Promise<ShopJoinCodeDetails>
  revokeMyShopJoinCode(input: RevokeShopJoinCodeInput): Promise<ShopJoinCodeDetails>
  /** Active employment record ng signed-in barber (hire date, shop stint). */
  getMyEmployment(): Promise<BarberEmployment | null>
  /** Owner-only atomic command; active assigned bookings must be resolved first. */
  endEmployment(employmentId: string, reason: string): Promise<BarberEmployment>
  /** Absences scoped sa ACTIVE employment lang — fresh start per shop. */
  listMyAbsences(): Promise<BarberAbsence[]>
  /** Shift change requests scoped sa active employment, newest first. */
  listMyShiftChangeRequests(): Promise<ShiftChangeRequest[]>
  /** File a request to change one day's shift; the owner approves/denies. */
  requestShiftChange(input: ShiftChangeRequestInput): Promise<ShiftChangeRequest>
  /** Owner-only: bawat roster member with shifts, absences, requests, notes. */
  listMyShopStaff(): Promise<ShopStaffMember[]>
  /** Owner-only authoritative roster plus the optimistic-concurrency token. */
  getStaffSchedule(barberId: string): Promise<StaffSchedule>
  replaceStaffShifts(barberId: string, input: ReplaceStaffShiftsInput): Promise<StaffScheduleWriteResult>
  upsertStaffShiftException(
    barberId: string,
    input: UpsertStaffShiftExceptionInput,
  ): Promise<StaffScheduleWriteResult>
  removeStaffShiftException(
    exceptionId: string,
    input: RemoveStaffShiftExceptionInput,
  ): Promise<StaffScheduleWriteResult>
  /** Owner-only: approve or decline a barber's shift change request. */
  /**
   * Owner decision. Approving applies the resulting shift exception in the same
   * database transaction, so the returned `exception_id` is proof the schedule
   * actually changed.
   */
  resolveShiftChangeRequest(
    requestId: string,
    input: ResolveShiftChangeRequestInput,
  ): Promise<ResolveShiftChangeRequestResult>
  /** Owner-only: attach a note to one staff member. */
  addStaffNote(input: StaffNoteInput): Promise<StaffNote>
}

/** P2-05: one API boundary for owner capability and per-service grants. */
export interface QualificationService {
  getOwnerWorkspace(): Promise<OwnerQualificationWorkspace>
  updateOwnerCapability(input: UpdateOwnerProviderCapabilityInput): Promise<OwnerProviderCapability>
  setProviderQualifications(input: SetProviderQualificationsInput): Promise<ServiceProviderQualification>
  getMine(): Promise<BarberQualificationView>
  request(input: CreateServiceQualificationRequestInput): Promise<ServiceQualificationRequest>
  resolveRequest(
    requestId: string,
    decision: 'approve' | 'decline',
    input: ResolveServiceQualificationRequestInput,
  ): Promise<ServiceQualificationRequest>
}

/** The full data layer handed to the UI through a React provider. */
export interface DataBackend {
  auth: AuthService
  verification: VerificationService
  admin: AdminService
  barbers: BarberService
  availability: AvailabilityService
  services: ServiceCatalog
  bookings: BookingService
  walkIns: WalkInService
  payments: PaymentService
  notifications: NotificationService
  closeout: CloseoutService
  chat: ChatService
  shops: ShopService
  ownerShop: OwnerShopService
  favorites: FavoriteService
  reviews: ReviewService
  preferences: PreferenceService
  ratingModeration: RatingModerationService
  notificationOperations: NotificationOperationsService
  analytics: AnalyticsService
  supportCases: SupportCaseService
  supportCaseAdmin: SupportCaseAdminService
  employment: BarberEmploymentService
  qualifications: QualificationService
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
  /** Present when the identity has a verified factor and can step up to AAL2. */
  mfa_required?: boolean
  factor_id?: string
  /**
   * The factor listing failed, so the absence of `mfa_required` means "could not
   * ask", not "no factors". Distinguished so a provider outage does not look
   * like an account with MFA switched off.
   */
  mfa_status_unavailable?: boolean
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
  'employment_has_active_bookings',
  'employment_not_active',
  'rehire_requires_owner_approval',
  'already_employed',
  'already_requested',
  'request_already_resolved',
  'hiring_full',
  'invalid_code',
  'join_code_rate_limited',
  'verification_locked',
  'stale_verification',
  'idempotency_conflict',
  'conflict',
  'mfa_required',
  'capability_required',
  'evidence_processing',
  'evidence_rejected',
  'media_processing',
  'media_rejected',
  'media_limit',
  'schedule_has_active_bookings',
  'cooldown_active',
  // P2-07 availability engine. Every one of these is a 409, and 409 is not
  // handled by the status fallback below, so omitting a code here silently
  // rewrites it to `validation` and the client loses the reason entirely.
  'chairs_unavailable',
  'shop_not_bookable',
  'outside_shop_hours',
  'outside_booking_window',
  'provider_not_qualified',
  'no_provider_available',
  'precondition_failed',
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
  /**
   * Set by `signIn` when the identity holds a verified factor, cleared once the
   * session is stepped up. Deliberately in memory only: a pending step-up must
   * not survive a reload, or a closed tab would leave a stale prompt behind.
   */
  private pendingMfa: { factor_id: string } | null = null

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
    this.watchCrossTabSession()
  }

  /**
   * `localStorage` is shared by every tab on the origin, but each tab kept its
   * own `session`/`currentProfile` in memory and nothing listened for changes,
   * so two tabs could hold two different identities at once. Signing in as a
   * second account overwrote the shared key while the first tab carried on
   * showing (and sending) the first account's token; whichever tab refreshed
   * last then silently reclaimed the key from the other, and a single 401
   * anywhere signed every tab out on its next reload.
   *
   * This makes the divergence impossible: the browser holds one identity and
   * every tab follows it immediately. It deliberately does not try to support
   * two accounts at once — for that, use separate browser profiles or a private
   * window, which give you separate storage.
   */
  private watchCrossTabSession(): void {
    // Typed structurally rather than through DOM globals: this package is
    // compiled by the Node API workspace as well as the browser one, and
    // `StorageEvent` is not in scope for both.
    const target = globalThis as unknown as {
      addEventListener?: (type: string, listener: (event: { key?: string | null }) => void) => void
    }
    if (typeof target.addEventListener !== 'function') return
    target.addEventListener('storage', (event) => {
      // A null key is a whole-storage clear, which also drops the session.
      const key = event.key ?? null
      if (key !== null && key !== API_SESSION_KEY) return
      void this.adoptStoredSession()
    })
  }

  private async adoptStoredSession(): Promise<void> {
    const stored = this.readSession()
    if (stored?.access_token === this.session?.access_token) return
    this.session = stored
    this.currentProfile = null
    if (!stored) {
      this.emitAuth(null)
      return
    }
    try {
      this.emitAuth(await this.request<Profile>('/auth/me'))
    } catch {
      // The adopted token is unusable; fail closed rather than leave the UI
      // showing an identity this tab cannot actually act as.
      this.session = null
      this.emitAuth(null)
    }
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
    return (await this.requestWithMeta<T, unknown>(path, options)).data
  }

  /**
   * Same transport as `request`, but keeps the response envelope's `meta` block.
   * Cursor pagination needs it; everything else can keep ignoring it.
   */
  private async requestWithMeta<T, M>(path: string, options: ApiRequestOptions = {}): Promise<{ data: T; meta?: M }> {
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
      return this.requestWithMeta<T, M>(path, { ...options, retryAfterRefresh: false })
    }

    const text = response.status === 204 ? '' : await response.text()
    let payload: ({ data?: T; meta?: M } & ApiErrorPayload) | null = null
    if (text) {
      try {
        payload = JSON.parse(text) as { data?: T; meta?: M } & ApiErrorPayload
      } catch {
        if (!response.ok) throw new DataError('server', 'The API returned an invalid response.')
      }
    }
    if (!response.ok) {
      if (response.status === 401 && authenticated) this.clearAuth()
      throw this.toDataError(response, payload)
    }
    return { data: payload?.data as T, meta: payload?.meta }
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

  private async ownedShop(): Promise<OwnerShop> {
    const shop = await this.request<OwnerShop | null>('/owner/shop')
    if (!shop) throw new DataError('not_found', 'No shop is assigned to this owner account.')
    return shop
  }

  private async hydrateAppointments(rows: AppointmentDetailed[]): Promise<AppointmentDetailed[]> {
    return rows.map((row) => ({
      ...row,
      status: canonicalAppointmentStatus(row.status),
    }))
  }

  /**
   * Single normalization point for command responses. Reads go through
   * `hydrateAppointments`; without this, mutation results would still carry the
   * legacy `pending`/`no_show` aliases the wire schema still accepts.
   */
  private async appointmentRequest(path: string, options: ApiRequestOptions = {}): Promise<Appointment> {
    const row = await this.request<Appointment>(path, options)
    return { ...row, status: canonicalAppointmentStatus(row.status) }
  }

  private async hydrateConversation(row: ConversationDetailed): Promise<ConversationDetailed> {
    return {
      ...row,
      is_staff_thread: row.is_staff_thread === true,
      last_message: row.last_message ?? null,
      unread_count: Number(row.unread_count ?? 0),
    }
  }

  private async hydrateConversations(rows: ConversationDetailed[]): Promise<ConversationDetailed[]> {
    return rows.map((row) => ({
      ...row,
      is_staff_thread: row.is_staff_thread === true,
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
      // Step-up, not a gate: the AAL1 session is real and every ordinary route
      // accepts it. `pendingMfa` tells the UI it can raise this session to AAL2,
      // which is the only way to reach any `/admin` surface.
      this.pendingMfa = data.mfa_required ? { factor_id: data.factor_id ?? '' } : null
      this.emitAuth(data.profile)
      return data.profile
    },
    pendingMfaFactor: () => this.pendingMfa?.factor_id ?? null,
    mfaStatus: () => this.request<MfaStatus>('/auth/mfa'),
    enrolMfa: () => this.request<MfaEnrolment>('/auth/mfa/enroll', { method: 'POST' }),
    verifyMfa: async (input) => {
      const data = await this.request<{ session: ApiSession }>('/auth/mfa/verify', { method: 'POST', body: input })
      // The stepped-up session replaces the AAL1 one, so subsequent requests
      // carry AAL2 without the caller having to thread it anywhere.
      this.saveSession(data.session)
      this.pendingMfa = null
    },
    removeMfa: async (factorId) => {
      await this.request<unknown>(`/auth/mfa/${encoded(factorId)}`, { method: 'DELETE' })
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

  readonly verification: VerificationService = {
    getMine: async () => verificationWorkspaceSchema.parse(
      await this.request<unknown>('/verification/me'),
    ),
    createSubmission: async (input) => verificationWorkspaceSchema.parse(
      await this.request<unknown>('/verification/submissions', { method: 'POST', body: input }),
    ),
    updateSubmission: async (id, input) => verificationWorkspaceSchema.parse(
      await this.request<unknown>(`/verification/submissions/${encoded(id)}`, {
        method: 'PATCH',
        body: input,
      }),
    ),
    requestEvidenceUpload: async (id, input) => verificationEvidenceUploadGrantSchema.parse(
      await this.request<unknown>(`/verification/submissions/${encoded(id)}/documents/request-upload`, {
        method: 'POST',
        body: input,
      }),
    ),
    completeEvidenceUpload: async (id, documentId, input) => verificationWorkspaceSchema.parse(
      await this.request<unknown>(
        `/verification/submissions/${encoded(id)}/documents/${encoded(documentId)}/complete`,
        { method: 'POST', body: input },
      ),
    ),
    removeEvidence: async (id, documentId, input) => verificationWorkspaceSchema.parse(
      await this.request<unknown>(
        `/verification/submissions/${encoded(id)}/documents/${encoded(documentId)}/remove`,
        { method: 'POST', body: input },
      ),
    ),
    getEvidenceView: async (id, documentId) => shortLivedEvidenceViewSchema.parse(
      await this.request<unknown>(
        `/verification/submissions/${encoded(id)}/documents/${encoded(documentId)}/view`,
        { method: 'POST' },
      ),
    ),
    submit: async (id, input) => verificationWorkspaceSchema.parse(
      await this.request<unknown>(`/verification/submissions/${encoded(id)}/submit`, {
        method: 'POST',
        body: input,
      }),
    ),
    withdraw: async (id, input) => verificationWorkspaceSchema.parse(
      await this.request<unknown>(`/verification/submissions/${encoded(id)}/withdraw`, {
        method: 'POST',
        body: input,
      }),
    ),
    startProfessionalPhoneVerification: async (input) => professionalPhoneVerificationChallengeSchema.parse(
      await this.request<unknown>('/verification/phone/challenge', {
        method: 'POST',
        body: input,
      }),
    ),
    confirmProfessionalPhoneVerification: async (input) => verificationWorkspaceSchema.parse(
      await this.request<unknown>('/verification/phone/confirm', {
        method: 'POST',
        body: input,
      }),
    ),
  }

  readonly admin: AdminService = {
    listVerifications: async (query) => {
      const parameters = new URLSearchParams()
      if (query.role !== undefined) parameters.set('role', query.role)
      if (query.status !== undefined) parameters.set('status', query.status)
      if (query.assigned !== undefined) parameters.set('assigned', query.assigned)
      if (query.cursor !== undefined) parameters.set('cursor', query.cursor)
      if (query.limit !== undefined) parameters.set('limit', String(query.limit))
      const suffix = parameters.size > 0 ? `?${parameters}` : ''
      return cursorPageSchema(adminVerificationQueueItemSchema).parse(
        await this.request<unknown>(`/admin/verifications${suffix}`),
      )
    },
    getVerification: async (id) => adminVerificationDetailSchema.parse(
      await this.request<unknown>(`/admin/verifications/${encoded(id)}`),
    ),
    assignVerification: async (id, input) => adminVerificationDetailSchema.parse(
      await this.request<unknown>(`/admin/verifications/${encoded(id)}/assign`, {
        method: 'POST',
        body: input,
      }),
    ),
    getVerificationEvidenceView: async (id, documentId) => shortLivedEvidenceViewSchema.parse(
      await this.request<unknown>(
        `/admin/verifications/${encoded(id)}/documents/${encoded(documentId)}/view`,
        { method: 'POST' },
      ),
    ),
    requestVerificationInformation: async (id, input) => adminVerificationDetailSchema.parse(
      await this.request<unknown>(`/admin/verifications/${encoded(id)}/request-information`, {
        method: 'POST',
        body: input,
      }),
    ),
    approveVerification: async (id, input) => adminVerificationDetailSchema.parse(
      await this.request<unknown>(`/admin/verifications/${encoded(id)}/approve`, {
        method: 'POST',
        body: input,
      }),
    ),
    rejectVerification: async (id, input) => adminVerificationDetailSchema.parse(
      await this.request<unknown>(`/admin/verifications/${encoded(id)}/reject`, {
        method: 'POST',
        body: input,
      }),
    ),
    getProfessional: async (userId) => professionalAccessSummarySchema.parse(
      await this.request<unknown>(`/admin/users/${encoded(userId)}`),
    ),
    suspendProfessional: async (userId, input) => professionalAccessSummarySchema.parse(
      await this.request<unknown>(`/admin/users/${encoded(userId)}/suspend`, {
        method: 'POST',
        body: input,
      }),
    ),
    restoreProfessional: async (userId, input) => professionalAccessSummarySchema.parse(
      await this.request<unknown>(`/admin/users/${encoded(userId)}/restore`, {
        method: 'POST',
        body: input,
      }),
    ),
  }

  readonly support: SupportService = {
    reportBug: (input) => this.request<BugReport>('/support/bug-reports', { method: 'POST', body: input }),
  }

  readonly barbers: BarberService = {
    list: async () => publicBarberSchema.array().parse(await this.request<unknown>('/catalog/barbers', { authenticated: false })),
    get: async (barberId) => publicBarberSchema.nullable().parse(await this.request<unknown>(`/catalog/barbers/${encoded(barberId)}`, { authenticated: false })),
    availableNow: async () => publicBarberSchema.array().parse(await this.request<unknown>('/catalog/barbers/available', { authenticated: false })),
    setShiftStatus: (on) => this.request<Barber>('/barbers/me/shift-status', { method: 'PATCH', body: { on } }),
    setAcceptingBookings: (accepting) => this.request<Barber>('/barbers/me/accepting-bookings', { method: 'PATCH', body: { accepting } }),
  }

  readonly availability: AvailabilityService = {
    getRules: async (barberId) => (await this.request<AvailabilityRule[]>(`/barbers/${encoded(barberId)}/shifts/patterns`)).map(normalizeRule),
    getOverrides: async (barberId) => (await this.request<PublicAvailabilityOverride[]>(`/barbers/${encoded(barberId)}/shifts/exceptions`)).map(normalizeOverride),
    getMyOverrides: async () => (await this.request<AvailabilityOverride[]>('/shifts/exceptions/me')).map(normalizeOverride),
    getOpenSlots: async (barberId, serviceId, date) => {
      const query = new URLSearchParams({ barberId, serviceId, date })
      return publicSlotSchema.array().parse(await this.request<unknown>(`/catalog/availability/slots?${query}`, { authenticated: false }))
    },
    getDay: async (input) => {
      const query = new URLSearchParams({
        shopId: input.shop_id,
        serviceId: input.service_id,
        date: input.date,
      })
      if (input.barber_id) query.set('barberId', input.barber_id)
      return availabilityDaySchema.parse(await this.request<unknown>(`/availability?${query}`))
    },
  }

  readonly services: ServiceCatalog = {
    list: async (shopId) => {
      const query = shopId ? `?${new URLSearchParams({ shopId })}` : ''
      return publicServiceSchema.array().parse(await this.request<unknown>(`/catalog/services${query}`, { authenticated: false }))
    },
  }

  readonly bookings: BookingService = {
    quote: async (input) => bookingQuoteSchema.parse(await this.request<unknown>('/bookings/quote', { method: 'POST', body: input })),
    create: (input) => this.appointmentRequest('/bookings', { method: 'POST', body: input }),
    reschedule: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}`, { method: 'PATCH', body: input }),
    cancel: (appointmentId) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/cancel`, { method: 'POST' }),
    listMine: async () => this.hydrateAppointments(await this.request<AppointmentDetailed[]>('/bookings')),
    listForMyShop: async () => {
      const shop = await this.ownedShop()
      return this.hydrateAppointments(await this.request<AppointmentDetailed[]>(`/shops/${encoded(shop.id)}/bookings`))
    },
    accept: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/accept`, { method: 'POST', body: input }),
    decline: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/decline`, { method: 'POST', body: input }),
    issueCheckInCode: (appointmentId, input) => this.request<AppointmentCheckInCode>(`/bookings/${encoded(appointmentId)}/check-in-code`, { method: 'POST', body: input }),
    checkIn: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/check-in`, { method: 'POST', body: input }),
    start: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/start`, { method: 'POST', body: input }),
    finish: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/finish`, { method: 'POST', body: input }),
    confirmCompletion: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/confirm-completion`, { method: 'POST', body: input }),
    dispute: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/dispute`, { method: 'POST', body: input }),
    cancelWithReason: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/cancel`, { method: 'POST', body: input }),
    markCustomerNoShow: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/no-show`, { method: 'POST', body: input }),
    resolveDispute: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/resolve-dispute`, { method: 'POST', body: input }),
    reassign: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}/reassign`, { method: 'POST', body: input }),
    rescheduleWithVersion: (appointmentId, input) => this.appointmentRequest(`/bookings/${encoded(appointmentId)}`, { method: 'PATCH', body: input }),
    timeline: (appointmentId) => this.request<AppointmentEvent[]>(`/bookings/${encoded(appointmentId)}/timeline`),
    listChangeProposals: (appointmentId) => this.request<AppointmentChangeProposal[]>(`/bookings/${encoded(appointmentId)}/change-proposals`),
    proposeChange: (appointmentId, input) => this.request<AppointmentChangeProposal>(`/bookings/${encoded(appointmentId)}/change-proposals`, { method: 'POST', body: input }),
    respondToChange: (proposalId, input) => this.request<AppointmentChangeProposal>(`/booking-change-proposals/${encoded(proposalId)}/respond`, { method: 'POST', body: input }),
    listDelays: (appointmentId) => this.request<AppointmentDelay[]>(`/bookings/${encoded(appointmentId)}/delays`),
    reportDelay: (appointmentId, input) => this.request<AppointmentDelay>(`/bookings/${encoded(appointmentId)}/delays`, { method: 'POST', body: input }),
    appealNoShow: (appointmentId, input) => this.request<NoShowAppeal>(`/bookings/${encoded(appointmentId)}/no-show-appeal`, { method: 'POST', body: input }),
    listMyNoShowAppeals: () => this.request<NoShowAppeal[]>('/no-show-appeals?scope=mine'),
    listShopNoShowAppeals: () => this.request<NoShowAppeal[]>('/no-show-appeals?scope=shop'),
    resolveNoShowAppeal: (appealId, input) => this.request<NoShowAppeal>(`/no-show-appeals/${encoded(appealId)}/resolve`, { method: 'POST', body: input }),
    waiveStrike: (appointmentId, input) => this.request<CustomerStrikeEvent>(`/bookings/${encoded(appointmentId)}/strike/waive`, { method: 'POST', body: input }),
    listAttention: () => this.request<AppointmentAttentionItem[]>('/owner/attention'),
  }

  readonly walkIns: WalkInService = {
    list: () => this.request<WalkInEntry[]>('/walk-ins'),
    create: (input) => this.request<WalkInEntry>('/walk-ins', { method: 'POST', body: input }),
    issueClaimCode: (walkInId, input) => this.request<WalkInClaimCode>(`/walk-ins/${encoded(walkInId)}/claim-code`, { method: 'POST', body: input }),
    claim: (walkInId, input) => this.request<GuestWalkInVisit>(`/walk-ins/${encoded(walkInId)}/claim`, { method: 'POST', body: input, authenticated: false }),
    linkMine: (walkInId) => this.request<GuestWalkInVisit>(`/walk-ins/${encoded(walkInId)}/link`, { method: 'POST' }),
    transition: (walkInId, input) => this.request<WalkInEntry>(`/walk-ins/${encoded(walkInId)}/transition`, { method: 'POST', body: input }),
    timeline: (walkInId) => this.request<QueueEvent[]>(`/walk-ins/${encoded(walkInId)}/timeline`),
  }

  readonly payments: PaymentService = {
    list: () => this.request<PaymentRecord[]>('/payments'),
    timeline: (paymentId) => this.request<PaymentEvent[]>(`/payments/${encoded(paymentId)}/timeline`),
    record: (input) => this.request<PaymentRecord>('/payments', { method: 'POST', body: input }),
    change: (paymentId, input) => this.request<PaymentRecord>(`/payments/${encoded(paymentId)}`, { method: 'POST', body: input }),
    setCashier: (userId, input) => this.request<CashierCapability>(`/owner/cashiers/${encoded(userId)}`, { method: 'PUT', body: input }),
  }

  readonly notifications: NotificationService = {
    list: () => this.request<InAppNotification[]>('/notifications'),
    markRead: (notificationId) => this.request<InAppNotification>(`/notifications/${encoded(notificationId)}/read`, { method: 'POST' }),
  }

  readonly closeout: CloseoutService = {
    list: () => this.request<CloseoutRun[]>('/owner/closeouts'),
    run: (localDate) => this.request<CloseoutRun>('/owner/closeouts', { method: 'POST', body: { local_date: localDate } }),
  }

  readonly chat: ChatService = {
    listConversations: async () => this.hydrateConversations(await this.request<ConversationDetailed[]>('/conversations')),
    openConversation: async (shopId, appointmentId) => this.hydrateConversation(
      await this.request<ConversationDetailed>('/conversations', {
        method: 'POST',
        body: appointmentId ? { shop_id: shopId, appointment_id: appointmentId } : { shop_id: shopId },
      }),
    ),
    openStaffConversation: async (barberId) => this.hydrateConversation(await this.request<ConversationDetailed>('/conversations/staff', { method: 'POST', body: { barber_id: barberId } })),
    getMessages: (conversationId, limit = 100) => this.request<Message[]>(`/conversations/${encoded(conversationId)}/messages?limit=${Math.max(1, Math.min(100, limit))}`),
    getMessagePage: async (conversationId, query) => {
      const search = new URLSearchParams({ limit: String(Math.max(1, Math.min(200, query?.limit ?? 50))) })
      if (query?.before) search.set('before', query.before)
      const page = await this.requestWithMeta<Message[], { has_more: boolean; next_cursor: string | null }>(
        `/conversations/${encoded(conversationId)}/messages?${search.toString()}`,
      )
      return { messages: page.data, has_more: page.meta?.has_more ?? false, next_cursor: page.meta?.next_cursor ?? null }
    },
    sendMessage: async (input) => {
      const message = await this.request<Message>('/messages', { method: 'POST', body: input })
      this.emitMessage(message)
      return message
    },
    markRead: (conversationId) => this.request<void>(`/conversations/${encoded(conversationId)}/read`, { method: 'POST' }),
    listBlocks: () => this.request<ConversationBlock[]>('/conversation-blocks'),
    setBlock: (userId, input) => this.request<{ blocked_id: string; blocked: boolean }>(
      `/conversation-blocks/${encoded(userId)}`, { method: 'PUT', body: input },
    ),
    report: (conversationId, input) => this.request<ConversationReport>(
      `/conversations/${encoded(conversationId)}/report`, { method: 'POST', body: input },
    ),
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
    list: async () => publicShopWithStatusSchema.array().parse(await this.request<unknown>('/catalog/shops', { authenticated: false })),
    get: async (shopId) => publicShopDetailSchema.nullable().parse(await this.request<unknown>(`/catalog/shops/${encoded(shopId)}`, { authenticated: false })),
  }

  readonly ownerShop: OwnerShopService = {
    getMine: () => this.request<OwnerShop | null>('/owner/shop'),
    create: (input) => this.request<OwnerShop>('/owner/shop', { method: 'POST', body: input }),
    update: (input) => this.request<OwnerShop>('/owner/shop', { method: 'PATCH', body: input }),
    publish: (input) => this.request<OwnerShop>('/owner/shop/publish', { method: 'POST', body: input }),
    unpublish: (input) => this.request<OwnerShop>('/owner/shop/unpublish', { method: 'POST', body: input }),
    getHours: () => this.request<ShopOperatingHours[]>('/owner/shop/hours'),
    setHours: (input) => this.request<SetShopHoursResult>('/owner/shop/hours', { method: 'PUT', body: input }),
    getClosures: () => this.request<ShopClosure[]>('/owner/shop/closures'),
    saveClosure: (input) => this.request<ShopClosure>('/owner/shop/closures', { method: 'POST', body: input }),
    removeClosure: (closureId) => this.request<void>(`/owner/shop/closures/${encoded(closureId)}`, { method: 'DELETE' }),
    listServices: () => this.request<StoredService[]>('/owner/shop/services'),
    createService: (input) => this.request<StoredService>('/owner/shop/services', { method: 'POST', body: input }),
    updateService: (serviceId, input) => this.request<StoredService>(
      `/owner/shop/services/${encoded(serviceId)}`,
      { method: 'PATCH', body: input },
    ),
    removeService: (serviceId) => this.request<StoredService>(
      `/owner/shop/services/${encoded(serviceId)}`,
      { method: 'DELETE' },
    ),
    listMedia: () => this.request<ShopMedia[]>('/owner/shop/media'),
    uploadMedia: async (input, file) => {
      const grant = await this.request<ShopMediaUploadGrant>('/owner/shop/media/request-upload', {
        method: 'POST',
        body: input,
      })
      let uploadResponse: Response
      try {
        uploadResponse = await this.fetchImpl(grant.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': input.declared_mime,
            ...grant.headers,
          },
          body: file,
        })
      } catch {
        throw new DataError('network', 'The shop photo upload could not reach storage.')
      }
      if (!uploadResponse.ok) {
        throw new DataError('server', 'The shop photo upload was rejected by storage.')
      }
      return this.request<ShopMedia>(`/owner/shop/media/${encoded(grant.media.id)}/complete`, { method: 'POST' })
    },
    removeMedia: (mediaId) => this.request<void>(`/owner/shop/media/${encoded(mediaId)}`, { method: 'DELETE' }),
    getHiring: () => this.request<OwnerShopHiring | null>('/owner/shop/hiring'),
    updateHiring: (input) => this.request<OwnerShopHiring>('/owner/shop/hiring', {
      method: 'PATCH',
      body: input,
    }),
  }

  readonly favorites: FavoriteService = {
    list: () => this.request<string[]>('/favorites/shops'),
    toggle: (shopId) => this.request<string[]>(`/favorites/shops/${encoded(shopId)}/toggle`, { method: 'POST' }),
    listBarbers: () => this.request<string[]>('/favorites/barbers'),
    toggleBarber: (barberId) => this.request<string[]>(`/favorites/barbers/${encoded(barberId)}/toggle`, { method: 'POST' }),
  }

  readonly reviews: ReviewService = {
    listMine: () => this.request<Review[]>('/ratings'),
    myWorkspace: () => this.request<CustomerRatingWorkspace>('/ratings/workspace'),
    submit: (input) => this.request<Review>('/ratings', { method: 'POST', body: input }),
    edit: (ratingId, input) => this.request<Review>(`/ratings/${encoded(ratingId)}`, { method: 'POST', body: input }),
    publicSummary: (shopId, providerId) => this.request<PublicRatingSummary>(
      `/catalog/shops/${encoded(shopId)}/ratings${providerId ? `?provider_id=${encodeURIComponent(providerId)}` : ''}`,
      { authenticated: false },
    ),
    listForProvider: () => this.request<Array<Review & { responses: RatingResponse[] }>>('/provider/ratings'),
    listForShop: () => this.request<Array<Review & { responses: RatingResponse[]; reports: RatingReport[] }>>('/owner/ratings'),
    respond: (ratingId, input) => this.request<RatingResponse>(`/ratings/${encoded(ratingId)}/responses`, { method: 'POST', body: input }),
    editResponse: (responseId, input) => this.request<RatingResponse>(`/rating-responses/${encoded(responseId)}`, { method: 'POST', body: input }),
    report: (ratingId, input) => this.request<RatingReport>(`/ratings/${encoded(ratingId)}/reports`, { method: 'POST', body: input }),
    timeline: (ratingId) => this.request<RatingEvent[]>(`/ratings/${encoded(ratingId)}/timeline`),
  }

  readonly preferences: PreferenceService = {
    getMine: () => this.request<AccountPreferences>('/notification-preferences'),
    save: (input) => this.request<AccountPreferences>('/notification-preferences', { method: 'PUT', body: input }),
  }

  readonly analytics: AnalyticsService = {
    shop: (shopId, query) => {
      const search = new URLSearchParams()
      if (query?.range) search.set('range', query.range)
      if (query?.from) search.set('from', query.from)
      if (query?.to) search.set('to', query.to)
      const suffix = search.size > 0 ? `?${search.toString()}` : ''
      return this.request<ShopAnalytics>(`/shops/${encoded(shopId)}/analytics${suffix}`)
    },
    providerPerformance: (query) => {
      const search = new URLSearchParams()
      if (query?.range) search.set('range', query.range)
      if (query?.from) search.set('from', query.from)
      if (query?.to) search.set('to', query.to)
      if (query?.providerId) search.set('provider_id', query.providerId)
      const suffix = search.size > 0 ? `?${search.toString()}` : ''
      return this.request<ProviderPerformance>(`/provider/performance${suffix}`)
    },
  }

  readonly supportCases: SupportCaseService = {
    openAppointmentDispute: (appointmentId, input) => this.request<SupportCase>(`/bookings/${encoded(appointmentId)}/disputes`, { method: 'POST', body: input }),
    listMine: () => this.request<SupportCase[]>('/support-cases?scope=mine'),
    listForShop: () => this.request<SupportCase[]>('/support-cases?scope=shop'),
    get: (caseId) => this.request<SupportCaseDetail>(`/support-cases/${encoded(caseId)}`),
    addEvidence: (caseId, input) => this.request<CaseEvidence>(`/support-cases/${encoded(caseId)}/evidence`, { method: 'POST', body: input }),
    decide: (caseId, input) => this.request<SupportCase>(`/support-cases/${encoded(caseId)}/decision`, { method: 'POST', body: input }),
    respond: (caseId, input) => this.request<SupportCase>(`/support-cases/${encoded(caseId)}/response`, { method: 'POST', body: input }),
    escalateRatingReport: (reportId, input) => this.request<SupportCase>(`/rating-reports/${encoded(reportId)}/escalate`, { method: 'POST', body: input }),
  }

  readonly supportCaseAdmin: SupportCaseAdminService = {
    listQueue: (status) => this.request<SupportCase[]>(`/admin/disputes${status ? `?status=${status}` : ''}`),
    assign: (caseId, input) => this.request<SupportCase>(`/admin/disputes/${encoded(caseId)}/assign`, { method: 'POST', body: input }),
    requestInformation: (caseId, input) => this.request<SupportCase>(`/admin/disputes/${encoded(caseId)}/request-information`, { method: 'POST', body: input }),
    resolve: (caseId, input) => this.request<SupportCase>(`/admin/disputes/${encoded(caseId)}/resolve`, { method: 'POST', body: input }),
    listAccessAudit: () => this.request<CaseEvent[]>('/admin/case-audit'),
  }

  readonly notificationOperations: NotificationOperationsService = {
    health: () => this.request<NotificationOperationsHealth>('/admin/notifications/health'),
    listFailed: () => this.request<FailedNotification[]>('/admin/notifications/failed'),
    retry: (outboxId) => this.request<FailedNotification>(`/admin/notifications/${encoded(outboxId)}/retry`, { method: 'POST' }),
  }

  readonly ratingModeration: RatingModerationService = {
    listReports: (status) => this.request<RatingReport[]>(`/admin/rating-reports${status ? `?status=${status}` : ''}`),
    decide: (reportId, input) => this.request<RatingReport>(`/admin/rating-reports/${encoded(reportId)}`, { method: 'POST', body: input }),
    setEditWindow: (ratingId, input) => this.request<Review>(`/admin/ratings/${encoded(ratingId)}/edit-window`, { method: 'POST', body: input }),
  }

  readonly employment: BarberEmploymentService = {
    listHiringShops: async () => {
      const rows = await this.request<Array<HiringListing & { shop: { id: string } }>>('/hiring/shops')
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
    getJobProfile: () => this.request<BarberJobProfile>('/barber/job-profile'),
    updateJobProfile: (input) => this.request<BarberJobProfile>('/barber/job-profile', { method: 'PUT', body: input }),
    listJobSeekers: () => this.request<JobSeekerProfile[]>('/hiring/barbers'),
    listRequests: () => this.request<EmploymentRequest[]>('/employment/requests'),
    getRequest: (requestId) => this.request<EmploymentRequestDetail>(`/employment/requests/${encoded(requestId)}`),
    createRequest: (input) => this.request<EmploymentRequest>('/employment/requests', { method: 'POST', body: input }),
    createJoinCodeRequest: (input) => this.request<EmploymentRequest>('/employment/requests/join-code', {
      method: 'POST',
      body: input,
    }),
    acceptRequest: (requestId, input) => this.request<EmploymentRequestDecision>(
      `/employment/requests/${encoded(requestId)}/accept`,
      { method: 'POST', body: input },
    ),
    declineRequest: (requestId, input) => this.request<EmploymentRequest>(
      `/employment/requests/${encoded(requestId)}/decline`,
      { method: 'POST', body: input },
    ),
    withdrawRequest: (requestId, input) => this.request<EmploymentRequest>(
      `/employment/requests/${encoded(requestId)}/withdraw`,
      { method: 'POST', body: input },
    ),
    getMyShopJoinCode: async () => {
      const shop = await this.ownedShop()
      const row = await this.request<Omit<ShopJoinCodeDetails, 'shop'> | null>('/owner/shop/join-code')
      return row ? { ...row, shop } : null
    },
    rotateMyShopJoinCode: async (input) => {
      const shop = await this.ownedShop()
      const row = await this.request<Omit<ShopJoinCodeDetails, 'shop'>>('/owner/shop/join-code/rotate', {
        method: 'POST',
        body: input,
      })
      return { ...row, shop }
    },
    revokeMyShopJoinCode: async (input) => {
      const shop = await this.ownedShop()
      const row = await this.request<Omit<ShopJoinCodeDetails, 'shop'>>('/owner/shop/join-code/revoke', {
        method: 'POST',
        body: input,
      })
      return { ...row, shop }
    },
    getMyEmployment: () => this.request<BarberEmployment | null>('/employment/me'),
    endEmployment: (employmentId, reason) => this.request<BarberEmployment>(`/employment/${encoded(employmentId)}/end`, {
      method: 'POST',
      body: { reason },
    }),
    listMyAbsences: () => this.request<BarberAbsence[]>('/employment/absences'),
    listMyShiftChangeRequests: () => this.request<ShiftChangeRequest[]>('/barber/shift-change-requests'),
    requestShiftChange: (input) => this.request<ShiftChangeRequest>('/barber/shift-change-requests', { method: 'POST', body: input }),
    listMyShopStaff: async () => {
      const shop = await this.ownedShop()
      const rows = await this.request<ShopStaffMember[]>(`/shops/${encoded(shop.id)}/staff`)
      return rows.map((row) => ({ ...row, rules: row.rules.map(normalizeRule) }))
    },
    getStaffSchedule: async (barberId) => {
      const schedule = await this.request<StaffSchedule>(`/owner/staff/${encoded(barberId)}/shifts`)
      return {
        ...schedule,
        patterns: schedule.patterns.map(normalizeRule),
        exceptions: schedule.exceptions.map(normalizeOverride),
      }
    },
    replaceStaffShifts: async (barberId, input) => {
      const result = await this.request<StaffScheduleWriteResult>(
        `/owner/staff/${encoded(barberId)}/shifts`,
        { method: 'PUT', body: input },
      )
      return {
        ...result,
        ...(result.patterns ? { patterns: result.patterns.map(normalizeRule) } : {}),
        ...(result.exception ? { exception: normalizeOverride(result.exception) } : {}),
      }
    },
    upsertStaffShiftException: async (barberId, input) => {
      const result = await this.request<StaffScheduleWriteResult>(
        `/owner/staff/${encoded(barberId)}/shifts/exceptions`,
        { method: 'POST', body: input },
      )
      return {
        ...result,
        ...(result.exception ? { exception: normalizeOverride(result.exception) } : {}),
      }
    },
    removeStaffShiftException: (exceptionId, input) => this.request<StaffScheduleWriteResult>(
      `/owner/staff/shifts/exceptions/${encoded(exceptionId)}`,
      { method: 'DELETE', body: input },
    ),
    resolveShiftChangeRequest: (requestId, input) => this.request<ResolveShiftChangeRequestResult>(
      `/owner/shift-change-requests/${encoded(requestId)}/${input.decision}`,
      { method: 'POST', body: { expected_version: input.expected_version, note: input.note ?? null } },
    ),
    addStaffNote: async (input) => {
      const shop = await this.ownedShop()
      return this.request<StaffNote>(`/shops/${encoded(shop.id)}/staff-notes`, { method: 'POST', body: input })
    },
  }

  readonly qualifications: QualificationService = {
    getOwnerWorkspace: () => this.request<OwnerQualificationWorkspace>('/owner/service-qualifications'),
    updateOwnerCapability: (input) => this.request<OwnerProviderCapability>('/owner/provider-capability', {
      method: 'PATCH',
      body: input,
    }),
    setProviderQualifications: (input) => this.request<ServiceProviderQualification>('/owner/service-qualifications', {
      method: 'PUT',
      body: input,
    }),
    getMine: () => this.request<BarberQualificationView>('/barber/service-qualifications'),
    request: (input) => this.request<ServiceQualificationRequest>('/barber/service-qualification-requests', {
      method: 'POST',
      body: input,
    }),
    resolveRequest: (requestId, decision, input) => this.request<ServiceQualificationRequest>(
      `/owner/service-qualification-requests/${encoded(requestId)}/${decision}`,
      { method: 'POST', body: input },
    ),
  }
}
