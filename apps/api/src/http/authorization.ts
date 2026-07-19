import type { Request, RequestHandler } from 'express'
import { isOwnerVerificationLocked, type Role } from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import { ApiError, fromDatabaseError } from './errors'

/**
 * Pending/rejected/suspended owner requests cannot use app operations. Auth
 * restoration and sign-out remain available through the auth router.
 */
export const requireOperationalAccess: RequestHandler = (request, _response, next) => {
  if (isOwnerVerificationLocked(request.auth.profile)) {
    throw new ApiError(403, 'forbidden', 'This owner account is locked until verification is approved.')
  }
  next()
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
  requireRole(request, 'shop_owner', 'admin')
  let query = dependencies.database.from('shops').select('*').eq('owner_id', request.auth.profile.id)
  if (shopId) query = query.eq('id', shopId)
  const { data, error } = shopId ? await query.maybeSingle() : await query.limit(1).maybeSingle()
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
  let query = dependencies.database
    .from('barber_employment')
    .select('*')
    .eq('barber_id', request.auth.profile.id)
    .eq('status', 'active')
    .is('ended_at', null)
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
  if (request.auth.profile.role === 'shop_owner' || request.auth.profile.role === 'admin') {
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
  if (conversation.customer_id === userId || conversation.barber_id === userId) return conversation
  if (request.auth.profile.role === 'shop_owner' || request.auth.profile.role === 'admin') {
    await requireOwnedShop(dependencies, request, conversation.shop_id as string)
    return conversation
  }
  throw new ApiError(403, 'forbidden', 'You are not a participant in this conversation.')
}
