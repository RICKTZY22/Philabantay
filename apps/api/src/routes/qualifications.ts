import { Router } from 'express'
import {
  createServiceQualificationRequestInputSchema,
  idParamsSchema,
  resolveServiceQualificationRequestInputSchema,
  setProviderQualificationsInputSchema,
  updateOwnerProviderCapabilityInputSchema,
} from '@barbershop/shared/schemas'
import type {
  BarberQualificationView,
  OwnerProviderCapability,
  OwnerQualificationWorkspace,
  ServiceProviderQualification,
  ServiceQualificationRequest,
  StoredService,
} from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import { manilaDateTimeParts } from '../lib/manila-time'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody } from '../http/validation'
import { PUBLIC_SERVICE_COLUMNS } from './public-catalog'

type Row = Record<string, unknown>

const SERVICE_COLUMNS = `${PUBLIC_SERVICE_COLUMNS},active,created_at,updated_at`
const REQUEST_COLUMNS = [
  'id', 'shop_id', 'service_id', 'barber_id', 'status', 'message',
  'version', 'created_at', 'resolved_at',
].join(',')

function ownerCapability(shopId: string, ownerId: string, row: Row | null): OwnerProviderCapability {
  return {
    shop_id: shopId,
    owner_id: ownerId,
    active: row?.active === true,
    accepting_bookings: row?.accepting_bookings === true,
    rating: Number(row?.rating ?? 0),
    rating_count: Number(row?.rating_count ?? 0),
    version: Number(row?.version ?? 0),
    granted_at: typeof row?.granted_at === 'string' ? row.granted_at : null,
    revoked_at: typeof row?.revoked_at === 'string' ? row.revoked_at : null,
  }
}

/**
 * Batched form of `qualificationRequest` for list endpoints.
 *
 * The per-row helper issues one or two queries each, so a queue of N pending
 * requests cost 2N round trips. Every other router in this app batches with
 * `.in(...)`; this was the outlier. The single-row helper is kept for the two
 * command responses, where there is exactly one row and a batch would be noise.
 */
async function qualificationRequests(
  dependencies: ApiDependencies,
  rows: Row[],
  includeBarber: boolean,
): Promise<ServiceQualificationRequest[]> {
  if (rows.length === 0) return []
  const serviceIds = [...new Set(rows.map((row) => row.service_id as string))]
  const barberIds = includeBarber ? [...new Set(rows.map((row) => row.barber_id as string))] : []
  const [servicesResult, barbersResult] = await Promise.all([
    dependencies.database.from('services').select('id,name,active').in('id', serviceIds),
    barberIds.length > 0
      ? dependencies.database.from('users').select('id,full_name,avatar_url').in('id', barberIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (servicesResult.error) throw fromDatabaseError(servicesResult.error)
  if (barbersResult.error) throw fromDatabaseError(barbersResult.error)
  const services = new Map((servicesResult.data ?? []).map((row) => [row.id as string, row]))
  const barbers = new Map((barbersResult.data ?? []).map((row) => [row.id as string, row]))
  return rows.map((row) => buildQualificationRequest(
    row,
    services.get(row.service_id as string) ?? null,
    includeBarber ? barbers.get(row.barber_id as string) ?? null : null,
  ))
}

async function qualificationRequest(
  dependencies: ApiDependencies,
  row: Row,
  includeBarber: boolean,
): Promise<ServiceQualificationRequest> {
  const [serviceResult, barberResult] = await Promise.all([
    dependencies.database
      .from('services')
      .select('id,name,active')
      .eq('id', row.service_id as string)
      .single(),
    includeBarber
      ? dependencies.database
        .from('users')
        .select('id,full_name,avatar_url')
        .eq('id', row.barber_id as string)
        .single()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (serviceResult.error) throw fromDatabaseError(serviceResult.error)
  if (barberResult.error) throw fromDatabaseError(barberResult.error)
  return buildQualificationRequest(row, serviceResult.data, barberResult.data)
}

/** Shared projection, so the single-row and batched paths cannot drift apart. */
function buildQualificationRequest(
  row: Row,
  service: unknown,
  barber: unknown,
): ServiceQualificationRequest {
  return {
    id: row.id as string,
    shop_id: row.shop_id as string,
    service_id: row.service_id as string,
    barber_id: row.barber_id as string,
    status: row.status as ServiceQualificationRequest['status'],
    message: (row.message as string | null) ?? null,
    version: row.version as number,
    created_at: row.created_at as string,
    resolved_at: (row.resolved_at as string | null) ?? null,
    service: service as ServiceQualificationRequest['service'],
    ...(barber ? { barber: barber as ServiceQualificationRequest['barber'] } : {}),
  }
}

export function createQualificationsRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  async function loadOwnerWorkspace(ownerId: string): Promise<OwnerQualificationWorkspace> {
    const { data: shop, error: shopError } = await dependencies.database
      .from('shops')
      .select('id,owner_id')
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (shopError) throw fromDatabaseError(shopError)
    if (!shop) throw new ApiError(404, 'not_found', 'Create your shop before managing providers.')

    const shopId = shop.id as string
    const [servicesResult, capabilityResult, employmentResult, revisionsResult, qualificationsResult, requestsResult] =
      await Promise.all([
        dependencies.database.from('services').select(SERVICE_COLUMNS).eq('shop_id', shopId).order('created_at'),
        dependencies.database.from('owner_provider_profiles').select('*').eq('shop_id', shopId).maybeSingle(),
        // ended_at and hired_at feed the eligibility rule below; `status` alone
        // is not the same test the booking gate applies.
        dependencies.database.from('barber_employment').select('barber_id,ended_at,hired_at').eq('shop_id', shopId).eq('status', 'active'),
        dependencies.database.from('provider_qualification_revisions').select('*').eq('shop_id', shopId),
        dependencies.database.from('service_qualifications').select('provider_user_id,service_id').eq('shop_id', shopId).eq('active', true),
        dependencies.database.from('service_qualification_requests').select(REQUEST_COLUMNS).eq('shop_id', shopId)
          .order('created_at', { ascending: false }).limit(100),
      ])
    for (const result of [
      servicesResult,
      capabilityResult,
      employmentResult,
      revisionsResult,
      qualificationsResult,
      requestsResult,
    ]) {
      if (result.error) throw fromDatabaseError(result.error)
    }

    const barberIds = ((employmentResult.data ?? []) as Row[]).map((row) => row.barber_id as string)
    const providerIds = [ownerId, ...barberIds]
    const [profilesResult, barberRowsResult] = await Promise.all([
      // The extra columns feed the eligibility rule below. They are read here
      // rather than in a third round trip, and deliberately not forwarded into
      // the `profile` object, which stays the public three fields.
      dependencies.database
        .from('users')
        .select('id,full_name,avatar_url,role,requested_role,verification_status,onboarding_completed')
        .in('id', providerIds),
      barberIds.length
        ? dependencies.database.from('barbers').select('id,accepting_bookings').in('id', barberIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (profilesResult.error) throw fromDatabaseError(profilesResult.error)
    if (barberRowsResult.error) throw fromDatabaseError(barberRowsResult.error)

    const profiles = new Map(((profilesResult.data ?? []) as Row[]).map((row) => [row.id as string, row]))
    const revisions = new Map(((revisionsResult.data ?? []) as Row[]).map((row) => [
      row.provider_user_id as string,
      Number(row.version),
    ]))
    const accepting = new Map(((barberRowsResult.data ?? []) as Row[]).map((row) => [
      row.id as string,
      row.accepting_bookings === true,
    ]))
    const qualified = new Map<string, string[]>()
    for (const row of (qualificationsResult.data ?? []) as Row[]) {
      const providerId = row.provider_user_id as string
      qualified.set(providerId, [...(qualified.get(providerId) ?? []), row.service_id as string])
    }
    const capability = ownerCapability(shopId, ownerId, capabilityResult.data as Row | null)

    /**
     * Mirrors `private.is_active_barber_for_shop`, which is what the booking
     * gate and the publish readiness check actually consult.
     *
     * This used to be hardcoded `true` for every barber in the list, on the
     * strength of `barber_employment.status = 'active'` alone. That is not the
     * same rule: it ignores `ended_at`, a future `hired_at`, and the whole P1-02
     * professional lock. A suspended barber kept their employment row, so they
     * still counted as eligible here while the database refused to book them —
     * and once the readiness checklist started counting eligible providers, the
     * owner got a complete checklist and a Publish button that failed every
     * press. Reproduced live before this fix.
     *
     * `accepting_bookings` is deliberately not part of this: it governs new
     * bookings, not whether the person is a provider at all, and folding it in
     * would block an owner from publishing while a barber is on a break.
     */
    const today = manilaDateTimeParts().date
    const employmentById = new Map(((employmentResult.data ?? []) as Row[]).map((row) => [
      row.barber_id as string,
      row,
    ]))
    const barberIsEligible = (providerId: string): boolean => {
      const employment = employmentById.get(providerId)
      const profile = profiles.get(providerId)
      if (!employment || !profile) return false
      return employment.ended_at === null
        && String(employment.hired_at) <= today
        && profile.role === 'barber'
        && profile.requested_role === 'barber'
        && profile.verification_status === 'verified'
        && profile.onboarding_completed === true
    }

    const provider = (
      providerId: string,
      providerKind: ServiceProviderQualification['provider_kind'],
    ): ServiceProviderQualification => {
      const profile = profiles.get(providerId)
      if (!profile) throw new ApiError(500, 'database_error', 'Provider profile is missing.')
      return {
        shop_id: shopId,
        provider_user_id: providerId,
        provider_kind: providerKind,
        // Only the public three fields cross the seam, even though the row
        // carries the eligibility columns read above.
        profile: {
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
        } as unknown as ServiceProviderQualification['profile'],
        eligible: providerKind === 'owner' ? capability.active : barberIsEligible(providerId),
        accepting_bookings: providerKind === 'owner'
          ? capability.accepting_bookings
          : accepting.get(providerId) === true,
        qualification_version: revisions.get(providerId) ?? 1,
        qualified_service_ids: (qualified.get(providerId) ?? []).sort(),
      }
    }

    const requests = await qualificationRequests(
      dependencies,
      (requestsResult.data ?? []) as unknown as Row[],
      true,
    )
    return {
      shop_id: shopId,
      owner_provider: capability,
      services: (servicesResult.data ?? []) as unknown as StoredService[],
      providers: [
        provider(ownerId, 'owner'),
        ...barberIds.map((barberId) => provider(barberId, 'barber')),
      ],
      requests,
    }
  }

  router.get('/owner/service-qualifications', async (request, response) => {
    requireRole(request, 'shop_owner')
    response.json({ data: await loadOwnerWorkspace(request.auth.profile.id) })
  })

  router.patch('/owner/provider-capability', async (request, response) => {
    requireRole(request, 'shop_owner')
    const input = parseBody(request, updateOwnerProviderCapabilityInputSchema)
    const { data, error } = await dependencies.database.rpc('api_set_owner_provider_capability', {
      p_actor_id: request.auth.profile.id,
      p_expected_version: input.expected_version,
      p_active: input.active,
      p_accepting_bookings: input.accepting_bookings,
      p_reason: input.reason,
      p_command_id: input.command_id,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.put('/owner/service-qualifications', async (request, response) => {
    requireRole(request, 'shop_owner')
    const input = parseBody(request, setProviderQualificationsInputSchema)
    const { error } = await dependencies.database.rpc('api_set_provider_qualifications', {
      p_actor_id: request.auth.profile.id,
      p_provider_user_id: input.provider_user_id,
      p_expected_version: input.expected_version,
      p_service_ids: input.service_ids,
      p_reason: input.reason,
      p_command_id: input.command_id,
    })
    if (error) throw fromDatabaseError(error)
    const workspace = await loadOwnerWorkspace(request.auth.profile.id)
    const provider = workspace.providers.find((candidate) => candidate.provider_user_id === input.provider_user_id)
    if (!provider) throw new ApiError(404, 'not_found', 'Provider is no longer part of this shop.')
    response.json({ data: provider })
  })

  router.get('/barber/service-qualifications', async (request, response) => {
    requireRole(request, 'barber')
    let employment: Row
    try {
      employment = await requireActiveEmployment(dependencies, request)
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        const empty: BarberQualificationView = { shop_id: null, services: [] }
        response.json({ data: empty })
        return
      }
      throw error
    }
    const shopId = employment.shop_id as string
    const [servicesResult, qualificationsResult, requestsResult] = await Promise.all([
      dependencies.database.from('services').select('id,name,active').eq('shop_id', shopId).order('name'),
      dependencies.database.from('service_qualifications').select('service_id')
        .eq('shop_id', shopId).eq('provider_user_id', request.auth.profile.id).eq('active', true),
      dependencies.database.from('service_qualification_requests').select(REQUEST_COLUMNS)
        .eq('shop_id', shopId).eq('barber_id', request.auth.profile.id).eq('status', 'pending'),
    ])
    for (const result of [servicesResult, qualificationsResult, requestsResult]) {
      if (result.error) throw fromDatabaseError(result.error)
    }
    const qualified = new Set(((qualificationsResult.data ?? []) as Row[]).map((row) => row.service_id as string))
    const requestRows = (requestsResult.data ?? []) as unknown as Row[]
    const requests = await qualificationRequests(dependencies, requestRows, false)
    const requestByService = new Map(requests.map((item) => [item.service_id, item]))
    const data: BarberQualificationView = {
      shop_id: shopId,
      services: ((servicesResult.data ?? []) as Row[]).map((service) => ({
        id: service.id as string,
        name: service.name as string,
        active: service.active === true,
        qualified: qualified.has(service.id as string),
        pending_request: requestByService.get(service.id as string) ?? null,
      })),
    }
    response.json({ data })
  })

  router.post('/barber/service-qualification-requests', async (request, response) => {
    requireRole(request, 'barber')
    const input = parseBody(request, createServiceQualificationRequestInputSchema)
    const { data, error } = await dependencies.database.rpc('api_create_service_qualification_request', {
      p_barber_id: request.auth.profile.id,
      p_service_id: input.service_id,
      p_message: input.message ?? null,
      p_idempotency_key: input.idempotency_key,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({
      data: await qualificationRequest(dependencies, data as unknown as Row, false),
    })
  })

  router.post('/owner/service-qualification-requests/:id/:decision', async (request, response) => {
    requireRole(request, 'shop_owner')
    await requireOwnedShop(dependencies, request)
    const { id } = idParamsSchema.parse({ id: request.params.id })
    const decision = request.params.decision
    if (decision !== 'approve' && decision !== 'decline') {
      throw new ApiError(404, 'route_not_found', 'Unknown qualification request decision.')
    }
    const input = parseBody(request, resolveServiceQualificationRequestInputSchema)
    const { data, error } = await dependencies.database.rpc('api_resolve_service_qualification_request', {
      p_actor_id: request.auth.profile.id,
      p_request_id: id,
      p_expected_version: input.expected_version,
      p_decision: decision,
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({
      data: await qualificationRequest(dependencies, data as unknown as Row, true),
    })
  })

  return router
}
