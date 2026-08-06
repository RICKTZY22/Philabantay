import { Router } from 'express'
import {
  idParamsSchema,
  notificationPreferencesInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { requireOwnedShop } from '../http/authorization'
import { fromDatabaseError } from '../http/errors'
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

  // `GET`/`POST /ratings` moved to `routes/ratings.ts` in P4-03. They used to
  // upsert `public.ratings` on the service-role client, which made them the last
  // mutation in the application that did not go through a SQL command.

  router.get('/notification-preferences', async (request, response) => {
    const { data, error } = await dependencies.database
      .from('notification_preferences')
      .select('*')
      .eq('user_id', request.auth.profile.id)
      .maybeSingle()
    if (error) throw fromDatabaseError(error)
    // An account with no stored row gets the documented defaults rather than an
    // empty object, so a first-time device renders the same thing as a saved one.
    response.json({
      data: data ?? {
        user_id: request.auth.profile.id,
        booking_reminders: true,
        chat_notifications: true,
        email_updates: false,
        nearby_alerts: false,
        nearby_radius_km: 5,
        quiet_hours_start: null,
        quiet_hours_end: null,
        language: 'en',
        text_size: 'default',
        high_contrast: false,
        reduce_motion: false,
        transactional_notices: true,
        version: 0,
        created_at: null,
        updated_at: null,
      },
    })
  })

  router.put('/notification-preferences', async (request, response) => {
    const input = parseBody(request, notificationPreferencesInputSchema)
    // Through the command, not an upsert: it version-checks, validates the quiet
    // hours pair, and forces `transactional_notices` true regardless of input.
    const { data, error } = await dependencies.database.rpc('api_set_notification_preferences', {
      p_user_id: request.auth.profile.id,
      p_expected_version: input.expected_version ?? null,
      p_booking_reminders: input.booking_reminders,
      p_chat_notifications: input.chat_notifications,
      p_email_updates: input.email_updates,
      p_nearby_alerts: input.nearby_alerts,
      p_nearby_radius_km: input.nearby_radius_km ?? 5,
      p_quiet_hours_start: input.quiet_hours_start ?? null,
      p_quiet_hours_end: input.quiet_hours_end ?? null,
      p_language: input.language ?? 'en',
      p_text_size: input.text_size ?? 'default',
      p_high_contrast: input.high_contrast ?? false,
      p_reduce_motion: input.reduce_motion ?? false,
    })
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
