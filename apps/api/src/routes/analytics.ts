import { Router } from 'express'
import { z } from 'zod'
import { dateKeySchema, idParamsSchema, uuidSchema } from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireOwnedShop } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseParams, parseQuery } from '../http/validation'
import { manilaDateKey } from '../lib/manila-time'

/**
 * Ranges the plan asks for: last 7 days, last 30 days, an explicit custom range,
 * and all time where cost is bounded. `all` resolves to the widest window the
 * command accepts rather than pretending to be unbounded.
 */
const rangeQuerySchema = z.strictObject({
  range: z.enum(['week', 'month', 'custom', 'all']).default('month'),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
})

const providerRangeQuerySchema = rangeQuerySchema.extend({ provider_id: uuidSchema.optional() })

const ALL_TIME_DAYS = 730

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days))
  return shifted.toISOString().slice(0, 10)
}

function resolveRange(query: z.infer<typeof rangeQuerySchema>): { from: string; to: string } {
  const today = manilaDateKey()
  if (query.range === 'custom') {
    if (!query.from || !query.to) {
      throw new ApiError(400, 'validation', 'A custom range needs both from and to dates.')
    }
    if (query.from > query.to) {
      throw new ApiError(400, 'validation', 'The range start must not be after its end.')
    }
    return { from: query.from, to: query.to }
  }
  const span = query.range === 'week' ? 6 : query.range === 'month' ? 29 : ALL_TIME_DAYS - 1
  return { from: addDays(today, -span), to: today }
}

export function createAnalyticsRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/shops/:id/analytics', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, id)
    const { from, to } = resolveRange(parseQuery(request, rangeQuerySchema))
    // The whole answer is one SQL call, so the numbers cannot disagree with each
    // other the way independently computed cards do.
    const { data, error } = await dependencies.database.rpc('api_shop_analytics', {
      p_shop_id: id,
      p_owner_id: request.auth.profile.id,
      p_from: from,
      p_to: to,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/provider/performance', async (request, response) => {
    const query = parseQuery(request, providerRangeQuerySchema)
    const { from, to } = resolveRange(query)
    let shopId: string
    let providerId = request.auth.profile.id

    if (request.auth.profile.role === 'shop_owner') {
      const shop = await requireOwnedShop(dependencies, request)
      shopId = shop.id as string
      // An owner may read any of their own providers; a barber only themselves.
      if (query.provider_id) providerId = query.provider_id
    } else {
      const employment = await requireActiveEmployment(dependencies, request)
      shopId = employment.shop_id as string
      if (query.provider_id && query.provider_id !== request.auth.profile.id) {
        throw new ApiError(403, 'forbidden', 'You may only read your own performance.')
      }
    }

    const { data, error } = await dependencies.database.rpc('api_provider_performance', {
      p_provider_id: providerId,
      p_shop_id: shopId,
      p_from: from,
      p_to: to,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  return router
}
