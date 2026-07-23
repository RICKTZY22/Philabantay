import { Router } from 'express'
import { createBugReportInputSchema } from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { fromDatabaseError } from '../http/errors'
import { parseBody } from '../http/validation'

/** Narrow Help surface intentionally available to verification-locked users. */
export function createSupportRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.post('/bug-reports', async (request, response) => {
    const input = parseBody(request, createBugReportInputSchema)
    const { data, error } = await dependencies.database
      .from('bug_reports')
      .insert({ ...input, page_url: input.page_url ?? null, user_id: request.auth.profile.id })
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.status(201).json({ data })
  })

  return router
}

