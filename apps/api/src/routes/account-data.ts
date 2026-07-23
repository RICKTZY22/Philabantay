import { Router } from 'express'
import {
  idParamsSchema,
  notificationPreferencesInputSchema,
  rateAppointmentInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireOwnedShop, requireRole } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody, parseParams } from '../http/validation'

export function createAccountDataRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.get('/favorites/shops', async (request, response) => {
    const { data, error } = await dependencies.database.from('favorite_shops').select('shop_id').eq('user_id', request.auth.profile.id)
    if (error) throw fromDatabaseError(error)
    response.json({ data: (data ?? []).map((row) => row.shop_id) })
  })

  router.post('/favorites/shops/:id/toggle', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { data: existing, error: lookupError } = await dependencies.database
      .from('favorite_shops')
      .select('shop_id')
      .eq('user_id', request.auth.profile.id)
      .eq('shop_id', id)
      .maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    const mutation = existing
      ? dependencies.database.from('favorite_shops').delete().eq('user_id', request.auth.profile.id).eq('shop_id', id)
      : dependencies.database.from('favorite_shops').insert({ user_id: request.auth.profile.id, shop_id: id })
    const { error } = await mutation
    if (error) throw fromDatabaseError(error)
    const { data: updated, error: updatedError } = await dependencies.database.from('favorite_shops').select('shop_id').eq('user_id', request.auth.profile.id)
    if (updatedError) throw fromDatabaseError(updatedError)
    response.json({ data: (updated ?? []).map((row) => row.shop_id) })
  })

  router.get('/favorites/barbers', async (request, response) => {
    const { data, error } = await dependencies.database.from('favorite_barbers').select('barber_id').eq('user_id', request.auth.profile.id)
    if (error) throw fromDatabaseError(error)
    response.json({ data: (data ?? []).map((row) => row.barber_id) })
  })

  router.post('/favorites/barbers/:id/toggle', async (request, response) => {
    const { id } = parseParams(request, idParamsSchema)
    const { data: existing, error: lookupError } = await dependencies.database
      .from('favorite_barbers')
      .select('barber_id')
      .eq('user_id', request.auth.profile.id)
      .eq('barber_id', id)
      .maybeSingle()
    if (lookupError) throw fromDatabaseError(lookupError)
    const mutation = existing
      ? dependencies.database.from('favorite_barbers').delete().eq('user_id', request.auth.profile.id).eq('barber_id', id)
      : dependencies.database.from('favorite_barbers').insert({ user_id: request.auth.profile.id, barber_id: id })
    const { error } = await mutation
    if (error) throw fromDatabaseError(error)
    const { data: updated, error: updatedError } = await dependencies.database.from('favorite_barbers').select('barber_id').eq('user_id', request.auth.profile.id)
    if (updatedError) throw fromDatabaseError(updatedError)
    response.json({ data: (updated ?? []).map((row) => row.barber_id) })
  })

  router.get('/ratings', async (request, response) => {
    requireRole(request, 'customer')
    const { data, error } = await dependencies.database.from('ratings').select('*').eq('customer_id', request.auth.profile.id).order('created_at', { ascending: false })
    if (error) throw fromDatabaseError(error)
    response.json({ data: data ?? [] })
  })

  router.post('/ratings', async (request, response) => {
    requireRole(request, 'customer')
    const input = parseBody(request, rateAppointmentInputSchema)
    const { data: appointment, error: appointmentError } = await dependencies.database
      .from('appointments')
      .select('customer_id,barber_id,shop_id,status')
      .eq('id', input.appointment_id)
      .maybeSingle()
    if (appointmentError) throw fromDatabaseError(appointmentError)
    if (!appointment) throw new ApiError(404, 'not_found', 'Appointment not found.')
    if (appointment.customer_id !== request.auth.profile.id) throw new ApiError(403, 'forbidden', 'You can only rate your own appointment.')
    if (appointment.status !== 'completed') throw new ApiError(400, 'validation', 'Only completed appointments can be rated.')
    const { data, error } = await dependencies.database
      .from('ratings')
      .upsert({
        ...input,
        customer_id: request.auth.profile.id,
        barber_id: appointment.barber_id,
        shop_id: appointment.shop_id,
        comment: input.comment ?? null,
      }, { onConflict: 'appointment_id' })
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  router.get('/notification-preferences', async (request, response) => {
    const { data, error } = await dependencies.database
      .from('notification_preferences')
      .select('booking_reminders,chat_notifications,email_updates,nearby_alerts')
      .eq('user_id', request.auth.profile.id)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    response.json({
      data: data ?? { booking_reminders: true, chat_notifications: true, email_updates: false, nearby_alerts: false },
    })
  })

  router.put('/notification-preferences', async (request, response) => {
    const input = parseBody(request, notificationPreferencesInputSchema)
    const { data, error } = await dependencies.database
      .from('notification_preferences')
      .upsert({ user_id: request.auth.profile.id, ...input })
      .select('booking_reminders,chat_notifications,email_updates,nearby_alerts')
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.get('/shops/:id/barbers/performance', async (request, response) => {
    const { id: shopId } = parseParams(request, idParamsSchema)
    await requireOwnedShop(dependencies, request, shopId)
    const { data: employments, error: employmentError } = await dependencies.database
      .from('barber_employment')
      .select('barber_id')
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .is('ended_at', null)
    if (employmentError) throw fromDatabaseError(employmentError)
    const barberIds = (employments ?? []).map((row) => row.barber_id as string)
    if (barberIds.length === 0) return response.json({ data: [] })
    const [{ data: barbers, error: barberError }, { data: appointments, error: appointmentError }] = await Promise.all([
      dependencies.database.from('barbers').select('id,rating,rating_count,profile:users!barbers_id_fkey(id,full_name,avatar_url)').in('id', barberIds),
      dependencies.database.from('appointments').select('barber_id,status').eq('shop_id', shopId).in('barber_id', barberIds),
    ])
    if (barberError) throw fromDatabaseError(barberError)
    if (appointmentError) throw fromDatabaseError(appointmentError)
    response.json({
      data: (barbers ?? []).map((barber) => {
        const rows = (appointments ?? []).filter((appointment) => appointment.barber_id === barber.id)
        const completed = rows.filter((appointment) => appointment.status === 'completed').length
        const customerNoShows = rows.filter((appointment) => appointment.status === 'customer_no_show').length
        const decidedVisitCount = completed + customerNoShows
        return {
          ...barber,
          completed_cuts: completed,
          // Customer absence is an operational signal, not a barber-fault
          // metric. Keep that attribution explicit in the response contract.
          customer_no_show_count: customerNoShows,
          customer_no_show_rate: decidedVisitCount === 0 ? 0 : customerNoShows / decidedVisitCount,
        }
      }),
    })
  })

  return router
}
