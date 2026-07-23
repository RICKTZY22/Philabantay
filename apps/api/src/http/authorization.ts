import type { Request, RequestHandler } from 'express'
import { isProfessionalVerificationLocked, type Role } from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import { manilaDateKey } from '../lib/manila-time'
import { ApiError, fromDatabaseError } from './errors'

/**
 * Pending/rejected/suspended professional requests cannot use app operations.
 * Auth restoration and sign-out remain available through the auth router.
 */
export const requireOperationalAccess: RequestHandler = (request, _response, next) => {
  if (isProfessionalVerificationLocked(request.auth.profile)) {
    throw new ApiError(403, 'verification_locked', 'Professional operations are unavailable for this account.')
  }
  next()
}

/** Evidence and decisions require a genuinely verified Supabase AAL2 JWT. */
export const requireAal2: RequestHandler = (request, _response, next) => {
  if (request.auth.aal !== 'aal2') {
    throw new ApiError(403, 'mfa_required', 'Multi-factor authentication is required for administrator access.')
  }
  next()
}

export async function requireAccountCapability(
  dependencies: ApiDependencies,
  request: Request,
  capability: 'professional_access' | 'verification_queue_read' | 'verification_assign' | 'verification_review' | 'professional_suspend',
): Promise<void> {
  requireRole(request, 'admin')
  if (request.auth.profile.verification_status !== 'verified') {
    throw new ApiError(403, 'capability_required', 'A verified administrator account is required.')
  }
  const { data, error } = await dependencies.database
    .from('account_capabilities')
    .select('id')
    .eq('user_id', request.auth.profile.id)
    .eq('capability', capability)
    .eq('state', 'active')
    .is('shop_id', null)
    .limit(1)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(403, 'capability_required', 'The required administrator capability is not active.')
}

export async function requireAssignedReviewer(
  dependencies: ApiDependencies,
  request: Request,
  submissionId: string,
): Promise<void> {
  await requireAccountCapability(dependencies, request, 'verification_review')
  const { data, error } = await dependencies.database
    .from('verification_submissions')
    .select('id')
    .eq('id', submissionId)
    .eq('assigned_reviewer_id', request.auth.profile.id)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(403, 'forbidden', 'Only the assigned reviewer can access this verification request.')
}

export function requireRole(request: Request, ...roles: Role[]): void {
  if (!roles.includes(request.auth.profile.role)) {
    throw new ApiError(403, 'forbidden', `This action requires one of these roles: ${roles.join(', ')}.`)
  }
}

export async function requireOwnedShop(
  dependencies: ApiDependencies,
  request: Request,
  shopId?: string,
): Promise<Record<string, unknown>> {
  requireRole(request, 'shop_owner')
  let query = dependencies.database.from('shops').select('*').eq('owner_id', request.auth.profile.id)
  if (shopId) query = query.eq('id', shopId)
  const { data, error } = await query.maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(403, 'forbidden', 'This shop is not owned by the authenticated account.')
  return data
}

export async function requireActiveEmployment(
  dependencies: ApiDependencies,
  request: Request,
  shopId?: string,
): Promise<Record<string, unknown>> {
  requireRole(request, 'barber')
  const profile = request.auth.profile
  if (
    profile.requested_role !== 'barber'
    || profile.verification_status !== 'verified'
    || !profile.onboarding_completed
  ) {
    throw new ApiError(403, 'forbidden', 'A verified and onboarded barber account is required.')
  }
  let query = dependencies.database
    .from('barber_employment')
    .select('*')
    .eq('barber_id', request.auth.profile.id)
    .eq('status', 'active')
    .is('ended_at', null)
    .lte('hired_at', manilaDateKey())
  if (shopId) query = query.eq('shop_id', shopId)
  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(403, 'forbidden', 'An active employment at this shop is required.')
  return data
}

export async function requireShopStaff(
  dependencies: ApiDependencies,
  request: Request,
  shopId: string,
): Promise<void> {
  if (request.auth.profile.role === 'shop_owner') {
    await requireOwnedShop(dependencies, request, shopId)
    return
  }
  await requireActiveEmployment(dependencies, request, shopId)
}

export async function requireConversationAccess(
  dependencies: ApiDependencies,
  request: Request,
  conversationId: string,
): Promise<Record<string, unknown>> {
  const { data: conversation, error } = await dependencies.database
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!conversation) throw new ApiError(404, 'not_found', 'Conversation not found.')

  const userId = request.auth.profile.id
  if (conversation.kind === 'customer_shop' && conversation.customer_id === userId) return conversation
  if (conversation.barber_id === userId) {
    await requireActiveEmployment(dependencies, request, conversation.shop_id as string)
    return conversation
  }
  if (request.auth.profile.role === 'shop_owner') {
    await requireOwnedShop(dependencies, request, conversation.shop_id as string)
    return conversation
  }
  throw new ApiError(403, 'forbidden', 'You are not a participant in this conversation.')
}
