import { Router } from 'express'
import {
  idParamsSchema,
  messagesQuerySchema,
  openConversationInputSchema,
  openStaffConversationInputSchema,
  sendMessageInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireConversationAccess, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'

const conversationSelect = `
  *,
  customer:users!conversations_customer_id_fkey(id,full_name,avatar_url),
  shop:shops!conversations_shop_id_fkey(*),
  barber:barbers!conversations_barber_id_fkey(id,bio,rating,rating_count,shift_status,accepting_bookings,created_at,profile:users!barbers_id_fkey(id,full_name,avatar_url))
`

async function withMessageSummary(
  dependencies: ApiDependencies,
  conversations: Array<Record<string, unknown>>,
  viewerId: string,
) {
  const conversationIds = conversations.map((conversation) => conversation.id as string)
  if (conversationIds.length === 0) return []
  const { data: messages, error } = await dependencies.database
    .from('messages')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at')
  if (error) throw fromDatabaseError(error)

  return conversations.map((conversation) => {
    const rows = (messages ?? []).filter((message) => message.conversation_id === conversation.id)
    return {
      ...conversation,
      last_message: rows.at(-1) ?? null,
      unread_count: rows.filter((message) => message.sender_id !== viewerId && message.read_at === null).length,
    }
  })
}

export function createChatRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/conversations', async (request, response) => {
    let query = dependencies.database.from('conversations').select(conversationSelect)
    const userId = request.auth.profile.id
    if (request.auth.profile.role === 'customer') query = query.eq('customer_id', userId)
    else if (request.auth.profile.role === 'barber') query = query.eq('barber_id', userId)
    else if (request.auth.profile.role === 'shop_owner' || request.auth.profile.role === 'admin') {
      const shop = await requireOwnedShop(dependencies, request)
      query = query.eq('shop_id', shop.id as string)
    } else throw new ApiError(403, 'forbidden', 'This account cannot access conversations.')

    const { data, error } = await query.order('last_message_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await withMessageSummary(dependencies, data ?? [], userId) })
  })

  router.post('/conversations', async (request, response) => {
    requireRole(request, 'customer')
    const { shop_id: shopId } = parseBody(request, openConversationInputSchema)
    const { data: existing, error: existingError } = await dependencies.database
      .from('conversations')
      .select(conversationSelect)
      .eq('kind', 'customer_shop')
      .eq('customer_id', request.auth.profile.id)
      .eq('shop_id', shopId)
      .maybeSingle()
    if (existingError) throw fromDatabaseError(existingError)
    if (existing) {
      const [detailed] = await withMessageSummary(dependencies, [existing], request.auth.profile.id)
      return response.json({ data: detailed })
    }

    const { data: employment, error: employmentError } = await dependencies.database
      .from('barber_employment')
      .select('barber_id')
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .is('ended_at', null)
      .order('hired_at')
      .limit(1)
      .maybeSingle()
    if (employmentError) throw fromDatabaseError(employmentError)
    if (!employment) throw new ApiError(409, 'shop_unavailable', 'This shop has no active barber to receive messages.')

    const { data, error } = await dependencies.database
      .from('conversations')
      .insert({ kind: 'customer_shop', customer_id: request.auth.profile.id, shop_id: shopId, barber_id: employment.barber_id })
      .select(conversationSelect)
      .single()
    if (error) throw fromDatabaseError(error)
    const [detailed] = await withMessageSummary(dependencies, [data], request.auth.profile.id)
    response.status(201).json({ data: detailed })
  })

  router.post('/conversations/staff', async (request, response) => {
    requireRole(request, 'shop_owner', 'admin')
    const { barber_id: barberId } = parseBody(request, openStaffConversationInputSchema)
    const shop = await requireOwnedShop(dependencies, request)
    const shopId = shop.id as string
    const { data: employment, error: employmentError } = await dependencies.database
      .from('barber_employment')
      .select('id')
      .eq('shop_id', shopId)
      .eq('barber_id', barberId)
      .eq('status', 'active')
      .is('ended_at', null)
      .maybeSingle()
    if (employmentError) throw fromDatabaseError(employmentError)
    if (!employment) throw new ApiError(403, 'forbidden', 'Barber is not active in your shop.')

    const { data: existing, error: existingError } = await dependencies.database
      .from('conversations')
      .select(conversationSelect)
      .eq('kind', 'staff')
      .eq('customer_id', request.auth.profile.id)
      .eq('shop_id', shopId)
      .eq('barber_id', barberId)
      .maybeSingle()
    if (existingError) throw fromDatabaseError(existingError)
    if (existing) {
      const [detailed] = await withMessageSummary(dependencies, [existing], request.auth.profile.id)
      return response.json({ data: detailed })
    }

    const { data, error } = await dependencies.database
      .from('conversations')
      .insert({ kind: 'staff', customer_id: request.auth.profile.id, shop_id: shopId, barber_id: barberId })
      .select(conversationSelect)
      .single()
    if (error) throw fromDatabaseError(error)
    const [detailed] = await withMessageSummary(dependencies, [data], request.auth.profile.id)
    response.status(201).json({ data: detailed })
  })

  router.get('/conversations/:id/messages', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { limit } = parseQuery(request, messagesQuerySchema)
    await requireConversationAccess(dependencies, request, id)
    const { data, error } = await dependencies.database
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw fromDatabaseError(error)
    response.json({ data: [...(data ?? [])].reverse() })
  })

  router.post('/messages', async (request, response) => {
    const input = parseBody(request, sendMessageInputSchema)
    await requireConversationAccess(dependencies, request, input.conversation_id)
    const { data, error } = await dependencies.database
      .from('messages')
      .insert({ conversation_id: input.conversation_id, sender_id: request.auth.profile.id, body: input.body })
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/conversations/:id/read', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireConversationAccess(dependencies, request, id)
    const { error } = await dependencies.database
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .neq('sender_id', request.auth.profile.id)
      .is('read_at', null)
    if (error) throw fromDatabaseError(error)
    response.status(204).end()
  })

  return router
}
