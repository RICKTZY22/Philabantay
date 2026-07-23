import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import {
  createAttendanceRecordInputSchema,
  endEmploymentInputSchema,
  idParamsSchema,
  joinShopInputSchema,
  resolveBarberApplicationInputSchema,
  resolveShiftChangeRequestInputSchema,
  shiftChangeRequestInputSchema,
  staffNoteInputSchema,
  updateAttendanceRecordInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireActiveEmployment, requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams } from '../http/validation'
import { PUBLIC_SHOP_COLUMNS } from './public-catalog'

function joinCode(): string {
  return `PB${randomBytes(4).toString('hex').toUpperCase()}`
}

export function createEmploymentRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/employment/hiring-shops', async (_request, response) => {
    const { data, error } = await dependencies.database
      .from('hiring_listings')
      .select(`shop_id,role_title,employment_type,requirements,open_positions,accepting_applications,updated_at,shop:shops(${PUBLIC_SHOP_COLUMNS})`)
      .eq('accepting_applications', true)
      .gt('open_positions', 0)
      .order('updated_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
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

  router.get('/employment/applications', async (request, response) => {
    requireRole(request, 'barber')
    const { data, error } = await dependencies.database
      .from('barber_applications')
      .select('*')
      .eq('barber_id', request.auth.profile.id)
      .order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/shops/:id/applications', async (request, response) => {
    requireRole(request, 'barber')
    const { id } = parseParams(request, idParamsSchema)
    const { data: listing, error: listingError } = await dependencies.database
      .from('hiring_listings')
      .select('accepting_applications,open_positions')
      .eq('shop_id', id)
      .maybeSingle()
    if (listingError) throw fromDatabaseError(listingError)
    if (!listing?.accepting_applications || Number(listing.open_positions) < 1) {
      throw new ApiError(409, 'not_hiring', 'This shop is not accepting applications.')
    }
    const { data, error } = await dependencies.database.rpc('api_create_barber_application', {
      p_barber_id: request.auth.profile.id,
      p_shop_id: id,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.patch('/applications/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, resolveBarberApplicationInputSchema)
    const { data: application, error: lookupError } = await dependencies.database.from('barber_applications').select('*').eq('id', id).maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!application) throw new ApiError(404, 'not_found', 'Application not found.')
    await requireOwnedShop(dependencies, request, application.shop_id as string)
    if (application.status !== 'pending') throw new ApiError(409, 'already_resolved', 'Application is already resolved.')

    const { data, error } = await dependencies.database.rpc('api_resolve_barber_application', {
      p_application_id: id,
      p_status: input.status,
      p_hired_at: new Date().toISOString().slice(0, 10),
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/employment/join', async (request, response) => {
    requireRole(request, 'barber')
    const input = parseBody(request, joinShopInputSchema)
    const { data: employment, error } = await dependencies.database.rpc('api_join_shop_by_code', {
      p_barber_id: request.auth.profile.id,
      p_code: input.code,
    })
    if (error) throw fromDatabaseError(error)
    const { data: shop, error: shopError } = await dependencies.database
      .from('shops')
      .select(PUBLIC_SHOP_COLUMNS)
      .eq('id', employment.shop_id as string)
      .single()
    if (shopError) throw fromDatabaseError(shopError)
    response.status(201).json({ data: shop })
  })

  router.get('/shops/:id/join-code', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, id)
    const { data, error } = await dependencies.database.from('shop_join_codes').select('code').eq('shop_id', id).maybeSingle()
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ? { shop_id: id, code: data.code } : null })
  })

  router.post('/shops/:id/join-code/rotate', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, id)
    const code = joinCode()
    const { data, error } = await dependencies.database
      .from('shop_join_codes')
      .upsert({ shop_id: id, code, rotated_at: new Date().toISOString() })
      .select('code')
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data: { shop_id: id, code: data.code } })
  })

  router.post('/employment/:id/approve', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { data: employment, error: lookupError } = await dependencies.database.from('barber_employment').select('*').eq('id', id).maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!employment) throw new ApiError(404, 'not_found', 'Employment record not found.')
    await requireOwnedShop(dependencies, request, employment.shop_id as string)
    if (employment.status !== 'applied') throw new ApiError(409, 'invalid_status', 'Only applied employment can be approved.')
    const { data, error } = await dependencies.database.rpc('api_approve_employment', {
      p_employment_id: id,
      p_hired_at: new Date().toISOString().slice(0, 10),
    })
    if (error) throw fromDatabaseError(error)
    response.json({ data })
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

  router.get('/shift-change-requests', async (request, response) => {
    const employment = await requireActiveEmployment(dependencies, request)
    const { data, error } = await dependencies.database
      .from('shift_change_requests')
      .select('*')
      .eq('employment_id', employment.id as string)
      .order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/shift-change-requests', async (request, response) => {
    const input = parseBody(request, shiftChangeRequestInputSchema)
    const employment = await requireActiveEmployment(dependencies, request)
    const { data, error } = await dependencies.database.rpc('api_create_shift_change_request', {
      p_employment_id: employment.id as string,
      p_date: input.date,
      p_message: input.message,
    })
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.patch('/shift-change-requests/:id', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const input = parseBody(request, resolveShiftChangeRequestInputSchema)
    const { data: row, error: lookupError } = await dependencies.database.from('shift_change_requests').select('*').eq('id', id).maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    if (!row) throw new ApiError(404, 'not_found', 'Shift change request not found.')
    await requireOwnedShop(dependencies, request, row.shop_id as string)
    if (row.status !== 'pending') throw new ApiError(409, 'already_resolved', 'Shift request is already resolved.')
    const { data, error } = await dependencies.database.from('shift_change_requests').update({ status: input.status }).eq('id', id).select('*').single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
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
