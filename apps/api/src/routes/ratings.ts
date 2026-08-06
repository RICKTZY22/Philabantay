import { Router, type Request } from 'express'
import { z } from 'zod'
import {
  editRatingInputSchema,
  editRatingResponseInputSchema,
  idParamsSchema,
  moderateRatingReportInputSchema,
  publishRatingResponseInputSchema,
  reportRatingInputSchema,
  setRatingEditWindowInputSchema,
  submitRatingInputSchema,
  uuidSchema,
} from '@barbershop/shared/schemas'
import type { PublicRatingSummary, PublicReview, RatingDistribution } from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import {
  requireAccountCapability,
  requireActiveEmployment,
  requireOwnedShop,
  requireRole,
} from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams, parseQuery } from '../http/validation'

const providerQuerySchema = z.strictObject({ provider_id: uuidSchema.optional() })
const reportQuerySchema = z.strictObject({ status: z.enum(['open', 'upheld', 'rejected']).default('open') })

/**
 * Q14: a public reviewer is a first name plus a last initial, or nothing at all.
 * Never an email, a phone, or a full account identity.
 */
function reviewerLabel(fullName: unknown, displayMode: unknown): string {
  if (displayMode === 'anonymous') return 'Anonymous'
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Verified visitor'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`
}

function distribution(scores: number[]): RatingDistribution {
  const buckets: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const score of scores) {
    const index = Math.min(Math.max(Math.round(score), 1), 5) - 1
    buckets[index] += 1
  }
  const count = scores.length
  return {
    // A rounded average without its sample size is the thing the phase plan
    // forbids showing, so `count` travels with it everywhere.
    average: count === 0 ? 0 : Math.round((scores.reduce((total, score) => total + score, 0) / count) * 100) / 100,
    count,
    buckets,
  }
}

type RatingRow = Record<string, unknown>

/**
 * Hidden text is replaced by nothing at all and the score survives. That is the
 * single place the "moderation preserves the score" rule becomes visible to a
 * reader, and it is deliberately not a filter.
 */
function publicReview(
  rating: RatingRow,
  responses: RatingRow[],
  reviewerName: unknown,
  serviceName: unknown,
  visitCompletedAt: unknown,
): PublicReview {
  const hidden = rating.text_state === 'hidden'
  return {
    id: rating.id as string,
    shop_id: rating.shop_id as string,
    provider_id: rating.barber_id as string,
    reviewer_label: reviewerLabel(reviewerName, rating.display_mode),
    barber_rating: Number(rating.barber_rating),
    shop_rating: Number(rating.shop_rating),
    comment: hidden ? null : ((rating.comment as string | null) ?? null),
    text_hidden: hidden,
    service_name: (serviceName as string | null) ?? null,
    visit_completed_at: visitCompletedAt as string,
    created_at: rating.created_at as string,
    responses: responses.map((response) => ({
      id: response.id as string,
      author_role: response.author_role as 'shop_owner' | 'barber',
      body: response.text_state === 'hidden' ? '' : (response.body as string),
      text_hidden: response.text_state === 'hidden',
      created_at: response.created_at as string,
    })),
  }
}

async function ratingScope(dependencies: ApiDependencies, ratingId: string): Promise<RatingRow> {
  const { data, error } = await dependencies.database
    .from('ratings')
    .select('id,shop_id,barber_id,customer_id,eligibility_id')
    .eq('id', ratingId)
    .maybeSingle()
  if (error) throw fromDatabaseError(error)
  if (!data) throw new ApiError(404, 'not_found', 'Rating not found.')
  return data
}

/**
 * Guard for reading one review's audit. The command layer re-derives authority
 * for every write, so this only has to keep strangers out of the timeline.
 */
async function requireRatingParty(
  dependencies: ApiDependencies,
  request: Request,
  rating: RatingRow,
): Promise<void> {
  const actorId = request.auth.profile.id
  if (rating.customer_id === actorId) return
  // Owner branch first: since D-028 an owner-provider is a legitimate
  // `ratings.barber_id`, and the barber branch below hard-requires the role.
  if (request.auth.profile.role === 'shop_owner') {
    await requireOwnedShop(dependencies, request, rating.shop_id as string)
    return
  }
  if (rating.barber_id === actorId) {
    await requireActiveEmployment(dependencies, request, rating.shop_id as string)
    return
  }
  throw new ApiError(403, 'forbidden', 'You are not a party to this review.')
}

type RatingWithResponses = RatingRow & { responses: RatingRow[] }

async function attachResponses(
  dependencies: ApiDependencies,
  ratings: RatingRow[],
): Promise<RatingWithResponses[]> {
  const ratingIds = ratings.map((rating) => rating.id as string)
  if (ratingIds.length === 0) return []
  const { data, error } = await dependencies.database
    .from('rating_responses')
    .select('*')
    .in('rating_id', ratingIds)
    .order('created_at')
  if (error) throw fromDatabaseError(error)
  return ratings.map((rating) => ({
    ...rating,
    responses: (data ?? []).filter((response) => response.rating_id === rating.id),
  }))
}

/** Anonymous shop/provider trust view. Mounted on the catalogue router. */
export function createPublicRatingsRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/shops/:id/ratings', async (request, response) => {
    const { id: shopId } = parseParams(request, idParamsSchema)
    const { provider_id: providerId } = parseQuery(request, providerQuerySchema)

    // Only a published shop has a public trust page, matching the catalogue.
    const { data: shop, error: shopError } = await dependencies.database
      .from('shops')
      .select('id')
      .eq('id', shopId)
      .eq('lifecycle_status', 'published')
      .maybeSingle()
    if (shopError) throw fromDatabaseError(shopError)
    if (!shop) throw new ApiError(404, 'not_found', 'Shop not found.')

    const { data: rows, error } = await dependencies.database
      .from('ratings')
      .select(`
        id,shop_id,barber_id,barber_rating,shop_rating,comment,display_mode,text_state,created_at,
        customer:users!ratings_customer_id_fkey(full_name),
        eligibility:rating_eligibilities!ratings_eligibility_id_fkey(state,visit_completed_at,service_id)
      `)
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw fromDatabaseError(error)

    // A voided eligibility means the visit is no longer a finalized fact, so its
    // score leaves the public averages. Hidden text does not.
    const scored = (rows ?? []).filter((row) => {
      const eligibility = row.eligibility as { state?: string } | null
      return eligibility?.state !== 'void'
    })
    const forProvider = providerId ? scored.filter((row) => row.barber_id === providerId) : []

    const serviceIds = [...new Set(scored.map((row) => (row.eligibility as { service_id?: string } | null)?.service_id).filter((value): value is string => Boolean(value)))]
    const { data: services, error: serviceError } = serviceIds.length > 0
      ? await dependencies.database.from('services').select('id,name').in('id', serviceIds)
      : { data: [], error: null }
    if (serviceError) throw fromDatabaseError(serviceError)
    const serviceNames = new Map((services ?? []).map((service) => [service.id as string, service.name as string]))

    const withResponses = await attachResponses(dependencies, providerId ? forProvider : scored)
    const payload: PublicRatingSummary = {
      shop: distribution(scored.map((row) => Number(row.shop_rating))),
      provider: providerId ? distribution(forProvider.map((row) => Number(row.barber_rating))) : null,
      reviews: withResponses.map((row) => {
        const eligibility = row.eligibility as { visit_completed_at?: string; service_id?: string } | null
        return publicReview(
          row,
          row.responses,
          (row.customer as { full_name?: string } | null)?.full_name,
          eligibility?.service_id ? serviceNames.get(eligibility.service_id) ?? null : null,
          eligibility?.visit_completed_at ?? row.created_at,
        )
      }),
    }
    response.json({ data: payload })
  })

  return router
}

export function createRatingsRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/ratings', async (request, response) => {
    requireRole(request, 'customer')
    const { data, error } = await dependencies.database
      .from('ratings')
      .select('*')
      .eq('customer_id', request.auth.profile.id)
      .order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.get('/ratings/workspace', async (request, response) => {
    requireRole(request, 'customer')
    const customerId = request.auth.profile.id
    const [{ data: pending, error: pendingError }, { data: reviews, error: reviewError }] = await Promise.all([
      dependencies.database
        .from('rating_eligibilities')
        .select(`
          *,
          shop:shops!rating_eligibilities_shop_id_fkey(name),
          provider:users!rating_eligibilities_provider_id_fkey(full_name),
          service:services!rating_eligibilities_service_id_fkey(name)
        `)
        .eq('customer_id', customerId)
        .eq('state', 'open')
        .order('visit_completed_at', { ascending: false }),
      dependencies.database
        .from('ratings')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
    ])
    if (pendingError) throw fromDatabaseError(pendingError)
    if (reviewError) throw fromDatabaseError(reviewError)

    response.json({
      data: {
        pending: (pending ?? []).map((row) => {
          const { shop, provider, service, ...eligibility } = row as Record<string, unknown>
          return {
            ...eligibility,
            shop_name: (shop as { name?: string } | null)?.name ?? null,
            provider_name: (provider as { full_name?: string } | null)?.full_name ?? null,
            service_name: (service as { name?: string } | null)?.name ?? null,
          }
        }),
        reviews: await attachResponses(dependencies, reviews ?? []),
      },
    })
  })

  router.post('/ratings', async (request, response) => {
    requireRole(request, 'customer')
    const input = parseBody(request, submitRatingInputSchema)
    // No appointment id is accepted here. The client can only spend an
    // eligibility the database opened, and the command re-checks that it belongs
    // to this customer and is still open, inside one transaction.
    const { data, error } = await dependencies.database.rpc('api_submit_rating', {
      p_eligibility_id: input.eligibility_id,
      p_customer_id: request.auth.profile.id,
      p_barber_rating: input.barber_rating,
      p_shop_rating: input.shop_rating,
      p_comment: input.comment ?? null,
      p_display_mode: input.display_mode ?? 'short_name',
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/ratings/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    requireRole(request, 'customer')
    const input = parseBody(request, editRatingInputSchema)
    const { data, error } = await dependencies.database.rpc('api_edit_rating', {
      p_rating_id: id,
      p_expected_version: input.expected_version,
      p_customer_id: request.auth.profile.id,
      p_barber_rating: input.barber_rating,
      p_shop_rating: input.shop_rating,
      p_comment: input.comment ?? null,
      p_display_mode: input.display_mode ?? 'short_name',
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/ratings/:id/timeline', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const rating = await ratingScope(dependencies, id)
    await requireRatingParty(dependencies, request, rating)
    const { data, error } = await dependencies.database
      .from('rating_events')
      .select('*')
      .eq('rating_id', id)
      // `seq`, not `created_at`: several events share a transaction timestamp.
      .order('seq')
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/ratings/:id/responses', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, publishRatingResponseInputSchema)
    const rating = await ratingScope(dependencies, id)
    await requireRatingParty(dependencies, request, rating)
    if (rating.customer_id === request.auth.profile.id) {
      throw new ApiError(403, 'forbidden', 'Only the shop side may publish a response.')
    }
    const { data, error } = await dependencies.database.rpc('api_publish_rating_response', {
      p_rating_id: id,
      p_actor_id: request.auth.profile.id,
      p_body: input.body,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/rating-responses/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, editRatingResponseInputSchema)
    const { data, error } = await dependencies.database.rpc('api_edit_rating_response', {
      p_response_id: id,
      p_expected_version: input.expected_version,
      p_actor_id: request.auth.profile.id,
      p_body: input.body,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/ratings/:id/reports', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, reportRatingInputSchema)
    const rating = await ratingScope(dependencies, id)
    await requireRatingParty(dependencies, request, rating)
    const { data, error } = await dependencies.database.rpc('api_report_rating', {
      p_rating_id: id,
      p_response_id: input.response_id ?? null,
      p_reporter_id: request.auth.profile.id,
      p_reason_category: input.reason_category,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.get('/provider/ratings', async (request, response) => {
    const providerId = request.auth.profile.id
    if (request.auth.profile.role === 'shop_owner') await requireOwnedShop(dependencies, request)
    else await requireActiveEmployment(dependencies, request)
    const { data, error } = await dependencies.database
      .from('ratings')
      .select('*')
      .eq('barber_id', providerId)
      .order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await attachResponses(dependencies, data ?? []) })
  })

  router.get('/owner/ratings', async (request, response) => {
    const shop = await requireOwnedShop(dependencies, request)
    const shopId = shop.id as string
    const { data: ratings, error } = await dependencies.database
      .from('ratings')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    const withResponses = await attachResponses(dependencies, ratings ?? [])
    const ratingIds = withResponses.map((rating) => rating.id as string)
    const { data: reports, error: reportError } = ratingIds.length > 0
      ? await dependencies.database.from('rating_reports').select('*').in('rating_id', ratingIds).order('created_at', { ascending: false })
      : { data: [], error: null }
    if (reportError) throw fromDatabaseError(reportError)
    response.json({
      data: withResponses.map((rating) => ({
        ...rating,
        reports: (reports ?? []).filter((report) => report.rating_id === rating.id),
      })),
    })
  })

  return router
}

/** Moderator surface. Mounted under the AAL2 admin router. */
export function createRatingModerationRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  /**
   * Plan section 8's operations surface, and the half of required test 9 that had
   * nowhere to look: when a provider fails, in-app state stays and an operator can
   * see the failure and act on it.
   */
  router.get('/notifications/health', async (request, response) => {
    await requireAccountCapability(dependencies, request, 'content_moderation')
    const { data, error } = await dependencies.database.rpc('api_notification_operations_health')
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/notifications/failed', async (request, response) => {
    await requireAccountCapability(dependencies, request, 'content_moderation')
    const { data, error } = await dependencies.database
      .from('notification_outbox')
      .select('id,recipient_id,shop_id,title,status,attempt_count,available_at,last_error,created_at')
      .in('status', ['retry', 'dead_letter'])
      .order('created_at')
      .limit(200)
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/notifications/:id/retry', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireAccountCapability(dependencies, request, 'content_moderation')
    const { data, error } = await dependencies.database.rpc('api_retry_notification', {
      p_outbox_id: id,
      p_admin_id: request.auth.profile.id,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/rating-reports', async (request, response) => {
    await requireAccountCapability(dependencies, request, 'content_moderation')
    const { status } = parseQuery(request, reportQuerySchema)
    const { data, error } = await dependencies.database
      .from('rating_reports')
      .select('*')
      .eq('status', status)
      .order('created_at')
      .limit(200)
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  // Q15's "correction requires support" half: reopen or close a review's edit
  // window with a reason. Version-checked, capped at seven days, and audited.
  router.post('/ratings/:id/edit-window', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireAccountCapability(dependencies, request, 'content_moderation')
    const input = parseBody(request, setRatingEditWindowInputSchema)
    const { data, error } = await dependencies.database.rpc('api_set_rating_edit_window', {
      p_rating_id: id,
      p_expected_version: input.expected_version,
      p_moderator_id: request.auth.profile.id,
      p_editable_until: input.editable_until,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/rating-reports/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireAccountCapability(dependencies, request, 'content_moderation')
    const input = parseBody(request, moderateRatingReportInputSchema)
    const { data, error } = await dependencies.database.rpc('api_moderate_rating_report', {
      p_report_id: id,
      p_expected_version: input.expected_version,
      p_moderator_id: request.auth.profile.id,
      p_decision: input.decision,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  return router
}
