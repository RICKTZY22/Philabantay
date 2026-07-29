import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import {
  createEmploymentRequestInputSchema,
  createJoinCodeRequestInputSchema,
  createAttendanceRecordInputSchema,
  endEmploymentInputSchema,
  idParamsSchema,
  resolveEmploymentRequestInputSchema,
  revokeShopJoinCodeInputSchema,
  rotateShopJoinCodeInputSchema,
  resolveShiftChangeRequestBodySchema,
  shiftChangeRequestInputSchema,
  staffNoteInputSchema,
  updateAttendanceRecordInputSchema,
  updateBarberJobProfileInputSchema,
} from '@barbershop/shared/schemas'
import { ownerShopHiringFromRow } from '@barbershop/shared'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams } from '../http/validation'
import { PUBLIC_SHOP_COLUMNS } from './public-catalog'

function joinCode(): string {
  // Twenty hexadecimal characters preserve all 80 random bits while remaining
  // case-insensitive and easy to transcribe.
  return `PB-${randomBytes(10).toString('hex').toUpperCase()}`
}

export function createEmploymentRouter(dependencies: ApiDependencies): Router {
  const router = Router()
  const REQUEST_COLUMNS = [
    'id', 'shop_id', 'barber_id', 'direction', 'status', 'message',
    'join_code_id', 'created_by', 'resolved_by', 'created_at', 'expires_at',
    'resolved_at', 'version', 'updated_at',
  ].join(',')

  const ownedShopId = async (ownerId: string): Promise<string> => {
    const { data, error } = await dependencies.database
      .from('shops')
      .select('id')
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) throw new ApiError(404, 'not_found', 'No shop found for this owner account.')
    return data.id as string
  }

  const requireOwnedRequest = async (ownerId: string, requestId: string): Promise<void> => {
    const shopId = await ownedShopId(ownerId)
    const { data, error } = await dependencies.database
      .from('employment_requests')
      .select('id')
      .eq('id', requestId)
      .eq('shop_id', shopId)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) throw new ApiError(404, 'not_found', 'Employment request not found.')
  }

  const projectRequests = async (
    rows: Array<Record<string, unknown>>,
    actor: { id: string; role: string },
  ) => {
    if (rows.length === 0) return []
    const shopIds = [...new Set(rows.map((row) => row.shop_id as string))]
    const barberIds = [...new Set(rows.map((row) => row.barber_id as string))]
    const [shopsResult, barbersResult, profilesResult] = await Promise.all([
      dependencies.database.from('shops').select(PUBLIC_SHOP_COLUMNS).in('id', shopIds),
      dependencies.database.from('users').select('id,full_name,avatar_url').in('id', barberIds),
      dependencies.database.from('barber_job_profiles')
        .select('barber_id,visible,bio,experience_years,specialties,portfolio_media,coarse_work_area,schedule_preference,updated_at')
        .in('barber_id', barberIds),
    ])
    for (const result of [shopsResult, barbersResult, profilesResult]) {
      if (result.error) throw fromDatabaseError(result.error)
    }
    const shops = new Map((shopsResult.data ?? []).map((shop) => [shop.id as string, shop]))
    const barbers = new Map((barbersResult.data ?? []).map((barber) => [barber.id as string, barber]))
    const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.barber_id as string, profile]))
    return rows.map((row) => {
      const barber = barbers.get(row.barber_id as string)
      if (!barber || !shops.has(row.shop_id as string)) {
        throw new ApiError(500, 'database_error', 'Employment request projection is incomplete.')
      }
      const pending = row.status === 'pending'
      return {
        ...row,
        allowed_actions: pending
          ? actor.role === 'shop_owner'
            ? ['accept', 'decline']
            : row.barber_id === actor.id ? ['withdraw'] : []
          : [],
        shop: shops.get(row.shop_id as string),
        barber: {
          id: barber.id,
          full_name: barber.full_name,
          avatar_url: barber.avatar_url,
          job_profile: profiles.get(row.barber_id as string) ?? null,
        },
      }
    })
  }

  const loadRequest = async (
    requestId: string,
    actor: { id: string; role: string },
  ) => {
    const query = dependencies.database.from('employment_requests').select(REQUEST_COLUMNS).eq('id', requestId)
    if (actor.role === 'barber') query.eq('barber_id', actor.id)
    else if (actor.role === 'shop_owner') query.eq('shop_id', await ownedShopId(actor.id))
    else throw new ApiError(403, 'forbidden', 'Employment requests require a barber or owner account.')
    const { data, error } = await query.maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) throw new ApiError(404, 'not_found', 'Employment request not found.')
    return (await projectRequests([data as unknown as Record<string, unknown>], actor))[0]
  }

  router.get(['/hiring/shops', '/employment/hiring-shops'], async (_request, response) => {
    const { data: eligible, error: eligibleError } = await dependencies.database.rpc('api_catalogue_shop_ids')
    if (eligibleError) throw fromDatabaseError(eligibleError)
    const eligibleIds = (eligible ?? []).map((row: Record<string, unknown>) => row.shop_id as string)
    if (eligibleIds.length === 0) {
      response.json({ data: [] })
      return
    }
    const { data, error } = await dependencies.database
      .from('shops')
      .select(`${PUBLIC_SHOP_COLUMNS},hiring_open_positions,hiring_note,updated_at`)
      .in('id', eligibleIds)
      .eq('is_hiring', true)
      .order('updated_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({
      data: (data ?? []).map((shop) => ({
        shop_id: shop.id,
        status: 'open',
        open_positions: shop.hiring_open_positions,
        note: shop.hiring_note,
        updated_at: shop.updated_at,
        shop: Object.fromEntries(
          Object.entries(shop).filter(([key]) => !['hiring_open_positions', 'hiring_note', 'updated_at'].includes(key)),
        ),
      })),
    })
  })

  router.get('/employment/me', async (request, response) => {
    requireRole(request, 'barber')
    const { data, error } = await dependencies.database
      .from('barber_employment')
      .select('*')
      .eq('barber_id', request.auth.profile.id)
      .eq('status', 'active')
      .is('ended_at', null)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/employment/me/shop', async (request, response) => {
    const employment = await requireActiveEmployment(dependencies, request)
    const { data, error } = await dependencies.database.from('shops').select(PUBLIC_SHOP_COLUMNS).eq('id', employment.shop_id as string).single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  // ---- Job-seeker profiles ----
  router.get('/barber/job-profile', async (request, response) => {
    requireRole(request, 'barber')
    const { data, error } = await dependencies.database
      .from('barber_job_profiles')
      .upsert({ barber_id: request.auth.profile.id }, { onConflict: 'barber_id' })
      .select('barber_id,visible,bio,experience_years,specialties,portfolio_media,coarse_work_area,schedule_preference,updated_at')
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.put('/barber/job-profile', async (request, response) => {
    requireRole(request, 'barber')
    const input = parseBody(request, updateBarberJobProfileInputSchema)
    const { data, error } = await dependencies.database
      .from('barber_job_profiles')
      .upsert({
        barber_id: request.auth.profile.id,
        ...input,
        bio: input.bio?.trim() || null,
        coarse_work_area: input.coarse_work_area?.trim() || null,
        schedule_preference: input.schedule_preference?.trim() || null,
        specialties: [...new Set(input.specialties.map((value) => value.trim()))],
        portfolio_media: [...new Set(input.portfolio_media)],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'barber_id' })
      .select('barber_id,visible,bio,experience_years,specialties,portfolio_media,coarse_work_area,schedule_preference,updated_at')
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/hiring/barbers', async (request, response) => {
    requireRole(request, 'shop_owner')
    await ownedShopId(request.auth.profile.id)
    const { data: profiles, error } = await dependencies.database
      .from('barber_job_profiles')
      .select('barber_id,visible,bio,experience_years,specialties,portfolio_media,coarse_work_area,schedule_preference,updated_at')
      .eq('visible', true)
      .order('updated_at', { ascending: false })
      .limit(100)
    if (error) throw fromDatabaseError(error)
    const barberIds = (profiles ?? []).map((profile) => profile.barber_id as string)
    if (barberIds.length === 0) {
      response.json({ data: [] })
      return
    }
    const { data: activeEmployments, error: employmentError } = await dependencies.database
      .from('barber_employment')
      .select('barber_id')
      .in('barber_id', barberIds)
      .eq('status', 'active')
      .is('ended_at', null)
    if (employmentError) throw fromDatabaseError(employmentError)
    const employedIds = new Set((activeEmployments ?? []).map((row) => row.barber_id as string))
    const { data: users, error: usersError } = await dependencies.database
      .from('users')
      .select('id,full_name,avatar_url')
      .in('id', barberIds)
      .eq('role', 'barber')
      .eq('verification_status', 'verified')
    if (usersError) throw fromDatabaseError(usersError)
    const byId = new Map((users ?? []).map((user) => [user.id as string, user]))
    response.json({
      data: (profiles ?? []).flatMap((profile) => {
        const user = byId.get(profile.barber_id as string)
        return user && !employedIds.has(profile.barber_id as string)
          ? [{ ...profile, full_name: user.full_name, avatar_url: user.avatar_url }]
          : []
      }),
    })
  })

  // ---- Converged employment requests ----
  router.get('/employment/requests', async (request, response) => {
    if (!['barber', 'shop_owner'].includes(request.auth.profile.role)) {
      throw new ApiError(403, 'forbidden', 'Employment requests require a barber or owner account.')
    }
    await dependencies.database.rpc('api_expire_employment_requests')
    const query = dependencies.database.from('employment_requests').select(REQUEST_COLUMNS)
    if (request.auth.profile.role === 'barber') query.eq('barber_id', request.auth.profile.id)
    else query.eq('shop_id', await ownedShopId(request.auth.profile.id))
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100)
    if (error) throw fromDatabaseError(error)
    response.json({
      data: await projectRequests(
        (data ?? []) as unknown as Array<Record<string, unknown>>,
        { id: request.auth.profile.id, role: request.auth.profile.role },
      ),
    })
  })

  router.get('/employment/requests/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const actor = { id: request.auth.profile.id, role: request.auth.profile.role }
    const employmentRequest = await loadRequest(id, actor)
    const { data: events, error } = await dependencies.database
      .from('employment_events')
      .select('id,request_id,employment_id,shop_id,barber_id,actor_id,event_type,reason,created_at')
      .eq('request_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
    if (error) throw fromDatabaseError(error)
    response.json({ data: { ...employmentRequest, events: events ?? [] } })
  })

  router.post('/employment/requests', async (request, response) => {
    const input = parseBody(request, createEmploymentRequestInputSchema)
    if (input.direction === 'barber_application') requireRole(request, 'barber')
    else requireRole(request, 'shop_owner')
    const { data, error } = await dependencies.database.rpc('api_create_employment_request', {
      p_actor_id: request.auth.profile.id,
      p_direction: input.direction,
      p_shop_id: input.direction === 'barber_application' ? input.shop_id : null,
      p_barber_id: input.direction === 'owner_invitation' ? input.barber_id : null,
      p_message: input.message ?? null,
      p_idempotency_key: input.idempotency_key,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({
      data: await loadRequest(data.id as string, {
        id: request.auth.profile.id,
        role: request.auth.profile.role,
      }),
    })
  })

  router.post('/employment/requests/join-code', async (request, response) => {
    requireRole(request, 'barber')
    const input = parseBody(request, createJoinCodeRequestInputSchema)
    const { data, error } = await dependencies.database.rpc('api_create_join_code_request', {
      p_barber_id: request.auth.profile.id,
      p_code: input.code,
      p_message: input.message ?? null,
      p_idempotency_key: input.idempotency_key,
    })
    if (error) throw fromDatabaseError(error)
    const result = data as { ok: boolean; code?: string; request?: { id: string }; retry_at?: string | null }
    if (!result.ok) {
      const safe = {
        invalid_code: new ApiError(404, 'invalid_code', 'Shop join code is invalid, expired, or unavailable.'),
        join_code_rate_limited: new ApiError(429, 'join_code_rate_limited', 'Too many invalid code attempts. Try again later.'),
        hiring_full: new ApiError(409, 'hiring_full', 'This shop has no remaining hiring opening.'),
        already_employed: new ApiError(409, 'already_employed', 'End the current employment before requesting another shop.'),
      }[result.code ?? 'invalid_code']
      throw safe ?? new ApiError(409, 'conflict', 'The join-code request could not be created.')
    }
    response.status(201).json({
      data: await loadRequest(result.request!.id, {
        id: request.auth.profile.id,
        role: request.auth.profile.role,
      }),
    })
  })

  router.post('/employment/requests/:id/accept', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, resolveEmploymentRequestInputSchema)
    await requireOwnedRequest(request.auth.profile.id, id)
    const { data, error } = await dependencies.database.rpc('api_resolve_employment_request', {
      p_owner_id: request.auth.profile.id,
      p_request_id: id,
      p_expected_version: input.expected_version,
      p_action: 'accept',
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    const result = data as { employment_id: string; request_id: string }
    const [{ data: employment, error: employmentError }, { data: shop, error: shopError }] = await Promise.all([
      dependencies.database.from('barber_employment').select('*').eq('id', result.employment_id).single(),
      dependencies.database.from('shops')
        .select('id,is_hiring,hiring_open_positions,hiring_note,version,updated_at')
        .eq('owner_id', request.auth.profile.id)
        .single(),
    ])
    if (employmentError) throw fromDatabaseError(employmentError)
    if (shopError) throw fromDatabaseError(shopError)
    response.json({
      data: {
        request: await loadRequest(result.request_id, { id: request.auth.profile.id, role: 'shop_owner' }),
        employment,
        hiring: ownerShopHiringFromRow({
          id: shop.id as string,
          is_hiring: shop.is_hiring as boolean,
          hiring_open_positions: shop.hiring_open_positions as number | null,
          hiring_note: shop.hiring_note as string | null,
          version: shop.version as number,
          updated_at: shop.updated_at as string,
        }),
      },
    })
  })

  router.post('/employment/requests/:id/decline', async (request, response) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, resolveEmploymentRequestInputSchema)
    await requireOwnedRequest(request.auth.profile.id, id)
    const { error } = await dependencies.database.rpc('api_resolve_employment_request', {
      p_owner_id: request.auth.profile.id,
      p_request_id: id,
      p_expected_version: input.expected_version,
      p_action: 'decline',
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({
      data: await loadRequest(id, { id: request.auth.profile.id, role: 'shop_owner' }),
    })
  })

  router.post('/employment/requests/:id/withdraw', async (request, response) => {
    requireRole(request, 'barber')
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, resolveEmploymentRequestInputSchema)
    const { error } = await dependencies.database.rpc('api_withdraw_employment_request', {
      p_barber_id: request.auth.profile.id,
      p_request_id: id,
      p_expected_version: input.expected_version,
      p_reason: input.reason ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({
      data: await loadRequest(id, { id: request.auth.profile.id, role: 'barber' }),
    })
  })

  // ---- Hashed, expiring, one-time-display join code ----
  const joinCodeSummary = async (ownerId: string) => {
    const shopId = await ownedShopId(ownerId)
    const { data, error } = await dependencies.database
      .from('shop_join_codes')
      .select('id,expires_at,usage_limit,used_count,revoked_at,version')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    if (!data) return null
    const active = data.revoked_at === null
      && Date.parse(data.expires_at as string) > Date.now()
      && Number(data.used_count) < Number(data.usage_limit)
    return {
      active,
      expires_at: data.expires_at,
      usage_limit: data.usage_limit,
      used_count: data.used_count,
      remaining_uses: Math.max(0, Number(data.usage_limit) - Number(data.used_count)),
      version: data.version,
    }
  }

  router.get('/owner/shop/join-code', async (request, response) => {
    requireRole(request, 'shop_owner')
    response.json({ data: await joinCodeSummary(request.auth.profile.id) })
  })

  router.post('/owner/shop/join-code/rotate', async (request, response) => {
    requireRole(request, 'shop_owner')
    const input = parseBody(request, rotateShopJoinCodeInputSchema)
    const { data, error } = await dependencies.database.rpc('api_rotate_shop_join_code', {
      p_owner_id: request.auth.profile.id,
      p_plaintext_code: joinCode(),
      p_command_id: input.command_id,
      p_expires_in_days: input.expires_in_days,
      p_usage_limit: input.usage_limit,
    })
    if (error) throw fromDatabaseError(error)
    const row = data as Record<string, unknown>
    response.json({
      data: {
        active: row.active,
        expires_at: row.expires_at,
        usage_limit: row.usage_limit,
        used_count: row.used_count,
        remaining_uses: Math.max(0, Number(row.usage_limit) - Number(row.used_count)),
        version: row.version,
        ...(typeof row.code === 'string' ? { code: row.code } : {}),
      },
    })
  })

  router.post('/owner/shop/join-code/revoke', async (request, response) => {
    requireRole(request, 'shop_owner')
    const input = parseBody(request, revokeShopJoinCodeInputSchema)
    const { error } = await dependencies.database.rpc('api_revoke_shop_join_code', {
      p_owner_id: request.auth.profile.id,
      p_expected_version: input.expected_version,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data: await joinCodeSummary(request.auth.profile.id) })
  })

  router.post('/employment/:id/end', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, endEmploymentInputSchema)
    const { data: employment, error: lookupError } = await dependencies.database
      .from('barber_employment')
      .select('id,shop_id')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!employment) throw new ApiError(404, 'not_found', 'Employment record not found.')
    await requireOwnedShop(dependencies, request, employment.shop_id as string)

    const { data, error } = await dependencies.database.rpc('api_end_employment', {
      p_employment_id: id,
      p_owner_id: request.auth.profile.id,
      p_reason: input.reason,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/employment/absences', async (request, response) => {
    const employment = await requireActiveEmployment(dependencies, request)
    const { data, error } = await dependencies.database
      .from('attendance_records')
      .select('id,barber_id,shop_id,date,notes')
      .eq('employment_id', employment.id as string)
      .eq('status', 'absent')
      .order('date', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: (data ?? []).map(({ notes, ...row }) => ({ ...row, reason: notes })) })
  })

  router.get('/barber/shift-change-requests', async (request, response) => {
    const employment = await requireActiveEmployment(dependencies, request)
    const { data, error } = await dependencies.database
      .from('shift_change_requests')
      .select('*')
      .eq('employment_id', employment.id as string)
      .order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  // The barber asks; the command re-derives their current employment so a body
  // can never point the request at someone else's roster.
  router.post('/barber/shift-change-requests', async (request, response) => {
    requireRole(request, 'barber')
    const input = parseBody(request, shiftChangeRequestInputSchema)
    const { data, error } = await dependencies.database.rpc('api_submit_shift_change_request', {
      p_barber_id: request.auth.profile.id,
      p_date: input.date,
      p_kind: input.kind,
      p_message: input.message,
      p_idempotency_key: input.idempotency_key,
      p_start_time: input.start_time ?? null,
      p_end_time: input.end_time ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  // Owner decision. Approving writes the resulting shift exception inside the
  // same transaction, so a decision can never be recorded without the schedule
  // change it promises.
  const resolveShiftChange = async (
    request: Parameters<Parameters<Router['post']>[1]>[0],
    response: Parameters<Parameters<Router['post']>[1]>[1],
    decision: 'approve' | 'decline',
  ) => {
    requireRole(request, 'shop_owner')
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, resolveShiftChangeRequestBodySchema)
    const { data, error } = await dependencies.database.rpc('api_resolve_shift_change_request', {
      p_owner_id: request.auth.profile.id,
      p_request_id: id,
      p_expected_version: input.expected_version,
      p_decision: decision,
      p_note: input.note ?? null,
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  }

  router.post('/owner/shift-change-requests/:id/approve', async (request, response) => {
    await resolveShiftChange(request, response, 'approve')
  })

  router.post('/owner/shift-change-requests/:id/decline', async (request, response) => {
    await resolveShiftChange(request, response, 'decline')
  })

  router.get('/shops/:id/staff', async (request, response) => {
    const { id: shopId } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, shopId)
    const { data: employments, error: employmentError } = await dependencies.database
      .from('barber_employment')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .is('ended_at', null)
    if (employmentError) throw fromDatabaseError(employmentError)
    const barberIds = (employments ?? []).map((row) => row.barber_id as string)
    if (barberIds.length === 0) return response.json({ data: [] })

    const [barberResult, ruleResult, attendanceResult, requestResult, noteResult] = await Promise.all([
      dependencies.database.from('barbers').select('*,profile:users!barbers_id_fkey(id,full_name,avatar_url)').in('id', barberIds),
      dependencies.database.from('shift_patterns').select('*').eq('shop_id', shopId).in('barber_id', barberIds),
      dependencies.database.from('attendance_records').select('*').eq('shop_id', shopId).in('barber_id', barberIds),
      dependencies.database.from('shift_change_requests').select('*').eq('shop_id', shopId).in('barber_id', barberIds),
      dependencies.database.from('staff_notes').select('*').eq('shop_id', shopId).in('barber_id', barberIds),
    ])
    for (const result of [barberResult, ruleResult, attendanceResult, requestResult, noteResult]) {
      if (result.error) throw fromDatabaseError(result.error)
    }

    response.json({
      data: (employments ?? []).map((employment) => {
        const barberId = employment.barber_id
        const attendance = (attendanceResult.data ?? []).filter((row) => row.barber_id === barberId)
        return {
          barber: (barberResult.data ?? []).find((row) => row.id === barberId),
          employment,
          rules: (ruleResult.data ?? []).filter((row) => row.barber_id === barberId),
          absences: attendance.filter((row) => row.status === 'absent').map(({ notes, ...row }) => ({ ...row, reason: notes })),
          attendance_records: attendance,
          shiftChangeRequests: (requestResult.data ?? []).filter((row) => row.barber_id === barberId),
          notes: (noteResult.data ?? []).filter((row) => row.barber_id === barberId),
        }
      }),
    })
  })

  router.post('/shops/:id/staff-notes', async (request, response) => {
    const { id: shopId } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, shopId)
    const input = parseBody(request, staffNoteInputSchema)
    const { data: employment, error: employmentError } = await dependencies.database
      .from('barber_employment')
      .select('id')
      .eq('shop_id', shopId)
      .eq('barber_id', input.barber_id)
      .eq('status', 'active')
      .maybeSingle()
    if (employmentError) throw fromDatabaseError(employmentError)
    if (!employment) throw new ApiError(404, 'not_found', 'Active staff member not found.')
    const { data, error } = await dependencies.database
      .from('staff_notes')
      .insert({ shop_id: shopId, barber_id: input.barber_id, author_id: request.auth.profile.id, body: input.body })
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.post('/shops/:id/attendance', async (request, response) => {
    const { id: shopId } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, shopId)
    const input = parseBody(request, createAttendanceRecordInputSchema)
    const { data, error } = await dependencies.database
      .from('attendance_records')
      .insert({ ...input, shop_id: shopId, recorded_by: request.auth.profile.id })
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.patch('/attendance/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, updateAttendanceRecordInputSchema)
    const { data: row, error: lookupError } = await dependencies.database.from('attendance_records').select('shop_id').eq('id', id).maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!row) throw new ApiError(404, 'not_found', 'Attendance record not found.')
    // Attendance is owner-controlled: a barber cannot edit (e.g. overturn an
    // owner-recorded "absent") their own record.
    await requireOwnedShop(dependencies, request, row.shop_id as string)
    const { data, error } = await dependencies.database.from('attendance_records').update(input).eq('id', id).select('*').single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  return router
}
