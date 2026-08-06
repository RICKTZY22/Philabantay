import { Router } from 'express'
import {
  blockConversationPeerInputSchema,
  idParamsSchema,
  messagesQuerySchema,
  openConversationInputSchema,
  openStaffConversationInputSchema,
  reportConversationInputSchema,
  sendMessageInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireConversationAccess, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'
import { PUBLIC_BARBER_COLUMNS, PUBLIC_SHOP_COLUMNS } from './public-catalog'

const conversationSelect = `
  *,
  customer:users!conversations_customer_id_fkey(id,full_name,avatar_url),
  shop:shops!conversations_shop_id_fkey(${PUBLIC_SHOP_COLUMNS}),
  barber:barbers!conversations_barber_id_fkey(${PUBLIC_BARBER_COLUMNS},profile:users!barbers_id_fkey(id,full_name,avatar_url))
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
      is_staff_thread: conversation.kind === 'staff',
      // Explicit context, so a thread that grew out of one booking says so rather
      // than leaving the reader to infer it from message text.
      context: conversation.kind === 'staff'
        ? 'staff'
        : conversation.appointment_id
          ? 'appointment'
          : 'customer_shop',
      last_message: rows.at(-1) ?? null,
      unread_count: rows.filter((message) => message.sender_id !== viewerId && message.read_at === null).length,
    }
  })
}

async function loadConversation(dependencies: ApiDependencies, conversationId: string, viewerId: string) {
  const { data, error } = await dependencies.database
    .from('conversations')
    .select(conversationSelect)
    .eq('id', conversationId)
    .single()
  if (error) throw fromDatabaseError(error)
  const [detailed] = await withMessageSummary(dependencies, [data], viewerId)
  return detailed
}

export function createChatRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/conversations', async (request, response) => {
    let query = dependencies.database.from('conversations').select(conversationSelect)
    const userId = request.auth.profile.id
    if (request.auth.profile.role === 'customer') query = query.eq('kind', 'customer_shop').eq('customer_id', userId)
    else if (request.auth.profile.role === 'barber') {
      // Rechecked on every list, not cached: employment ending has to close this
      // surface immediately rather than at the next sign-in.
      const employment = await requireActiveEmployment(dependencies, request)
      query = query.eq('barber_id', userId).eq('shop_id', employment.shop_id as string)
    }
    else if (request.auth.profile.role === 'shop_owner') {
      const shop = await requireOwnedShop(dependencies, request)
      query = query.eq('shop_id', shop.id as string)
    } else throw new ApiError(403, 'forbidden', 'This account cannot access conversations.')

    const { data, error } = await query.order('last_message_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await withMessageSummary(dependencies, data ?? [], userId) })
  })

  router.post('/conversations', async (request, response) => {
    requireRole(request, 'customer')
    const input = parseBody(request, openConversationInputSchema)
    // One command, idempotent under its own advisory lock. The previous
    // read-then-insert here raced with itself and wrote the table directly.
    const { data, error } = await dependencies.database.rpc('api_open_customer_conversation', {
      p_customer_id: request.auth.profile.id,
      p_shop_id: input.shop_id,
      p_appointment_id: input.appointment_id ?? null,
      p_barber_id: input.barber_id ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data: await loadConversation(dependencies, (data as { id: string }).id, request.auth.profile.id) })
  })

  router.post('/conversations/staff', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { barber_id: barberId } = parseBody(request, openStaffConversationInputSchema)
    await requireOwnedShop(dependencies, request)
    const { data, error } = await dependencies.database.rpc('api_open_staff_conversation', {
      p_owner_id: request.auth.profile.id,
      p_barber_id: barberId,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data: await loadConversation(dependencies, (data as { id: string }).id, request.auth.profile.id) })
  })

  router.get('/conversations/:id/messages', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { limit, before } = parseQuery(request, messagesQuerySchema)
    await requireConversationAccess(dependencies, request, id)
    // Cursor pagination on `created_at`, so a long thread pages safely instead of
    // relying on an offset that shifts every time somebody sends a message.
    let query = dependencies.database
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1)
    if (before) query = query.lt('created_at', before)
    const { data, error } = await query
    if (error) throw fromDatabaseError(error)

    const rows = data ?? []
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    response.json({
      data: [...page].reverse(),
      meta: {
        has_more: hasMore,
        next_cursor: hasMore ? (page.at(-1)?.created_at as string) : null,
      },
    })
  })

  router.post('/messages', async (request, response) => {
    const input = parseBody(request, sendMessageInputSchema)
    await requireConversationAccess(dependencies, request, input.conversation_id)
    const { data, error } = await dependencies.database.rpc('api_send_message', {
      p_conversation_id: input.conversation_id,
      p_sender_id: request.auth.profile.id,
      p_body: input.body,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/conversations/:id/read', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireConversationAccess(dependencies, request, id)
    const { error } = await dependencies.database.rpc('api_mark_conversation_read', {
      p_conversation_id: id,
      p_reader_id: request.auth.profile.id,
      p_read_at: new Date().toISOString(),
    })
    if (error) throw fromDatabaseError(error)
    response.status(204).end()
  })

  router.get('/conversation-blocks', async (request, response) => {
    const { data, error } = await dependencies.database
      .from('conversation_blocks')
      .select('*')
      .eq('blocker_id', request.auth.profile.id)
      .order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.put('/conversation-blocks/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, blockConversationPeerInputSchema)
    const { data, error } = await dependencies.database.rpc('api_set_conversation_block', {
      p_blocker_id: request.auth.profile.id,
      p_blocked_id: id,
      p_blocked: input.blocked,
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: { blocked_id: id, blocked: data } })
  })

  router.post('/conversations/:id/report', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, reportConversationInputSchema)
    await requireConversationAccess(dependencies, request, id)
    const { data, error } = await dependencies.database.rpc('api_report_conversation', {
      p_conversation_id: id,
      p_message_id: input.message_id ?? null,
      p_reporter_id: request.auth.profile.id,
      p_reason_category: input.reason_category,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  return router
}
