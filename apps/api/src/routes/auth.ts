import { Router } from 'express'
import {
  changePasswordInputSchema,
  completeRoleOnboardingInputSchema,
  refreshSessionInputSchema,
  signInInputSchema,
  signUpInputSchema,
  updateProfileInputSchema,
} from '@barbershop/shared/schemas'
import type { ApiDependencies } from '../lib/supabase'
import { authenticate } from '../http/auth'
import { requireOperationalAccess } from '../http/authorization'
import { ApiError, fromDatabaseError } from '../http/errors'
import { parseBody } from '../http/validation'

export function createAuthRouter(dependencies: ApiDependencies): Router {
  const router = Router()

  router.post('/signup', async (request, response) => {
    const input = parseBody(request, signUpInputSchema)
    const { data, error } = await dependencies.auth.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.full_name, phone: input.phone ?? null } },
    })
    if (error || !data.user) throw new ApiError(400, 'signup_failed', error?.message ?? 'Could not create account.')

    const { data: profile, error: profileError } = await dependencies.database
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single()
    if (profileError) throw fromDatabaseError(profileError)
    response.status(201).json({ data: { profile, session: data.session } })
  })

  router.post('/signin', async (request, response) => {
    const input = parseBody(request, signInInputSchema)
    const { data, error } = await dependencies.auth.auth.signInWithPassword(input)
    if (error || !data.session) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.')

    const { data: profile, error: profileError } = await dependencies.database
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single()
    if (profileError) throw fromDatabaseError(profileError)
    response.json({ data: { profile, session: data.session } })
  })

  router.post('/refresh', async (request, response) => {
    const input = parseBody(request, refreshSessionInputSchema)
    const { data, error } = await dependencies.auth.auth.refreshSession(input)
    if (error || !data.session) throw new ApiError(401, 'not_authenticated', 'Refresh token is invalid or expired.')
    response.json({ data: { session: data.session } })
  })

  router.use(authenticate(dependencies))

  router.get('/me', (request, response) => {
    response.json({ data: request.auth.profile })
  })

  router.post('/onboarding', requireOperationalAccess, async (request, response) => {
    const input = parseBody(request, completeRoleOnboardingInputSchema)
    if (request.auth.profile.onboarding_completed) {
      throw new ApiError(409, 'already_completed', 'Role onboarding is already complete.')
    }

    if (input.role === 'customer') {
      const { data, error } = await dependencies.database
        .from('users')
        .update({
          requested_role: 'customer',
          role: 'customer',
          verification_status: 'not_required',
          onboarding_completed: true,
        })
        .eq('id', request.auth.profile.id)
        .select('*')
        .single()
      if (error) throw fromDatabaseError(error)
      response.json({ data })
      return
    }

    // Professional onboarding and creation of its initial draft must commit as
    // one transaction. A profile can never become locked without a matching
    // workspace, nor can a draft exist without the profile lock.
    const { error: beginError } = await dependencies.database.rpc(
      'api_begin_professional_verification',
      {
        p_actor_id: request.auth.profile.id,
        p_requested_role: input.role,
        p_command_id: crypto.randomUUID(),
        p_request_id: null,
      },
    )
    if (beginError) throw fromDatabaseError(beginError)

    const { data, error } = await dependencies.database
      .from('users')
      .select('*')
      .eq('id', request.auth.profile.id)
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.patch('/profile', requireOperationalAccess, async (request, response) => {
    const input = parseBody(request, updateProfileInputSchema)
    const { email, current_password: currentPassword, ...profileFields } = input
    const emailChanging = Boolean(email && email !== request.auth.profile.email)

    // Changing the login email is a sensitive account action, so it requires a
    // fresh password check — an active session alone is not enough.
    if (emailChanging) {
      if (!currentPassword) {
        throw new ApiError(400, 'validation', 'Your current password is required to change the email address.')
      }
      const { error: verifyError } = await dependencies.auth.auth.signInWithPassword({
        email: request.auth.profile.email,
        password: currentPassword,
      })
      if (verifyError) throw new ApiError(400, 'validation', 'Current password is incorrect.')

      const { error } = await dependencies.database.auth.admin.updateUserById(request.auth.profile.id, { email })
      if (error) throw new ApiError(400, 'email_update_failed', error.message)
    }

    const updates = { ...profileFields, ...(emailChanging ? { email } : {}) }
    if (Object.keys(updates).length === 0) {
      response.json({ data: request.auth.profile })
      return
    }
    const { data, error } = await dependencies.database
      .from('users')
      .update(updates)
      .eq('id', request.auth.profile.id)
      .select('*')
      .single()
    if (error) throw fromDatabaseError(error)
    response.json({ data })
  })

  router.post('/password', requireOperationalAccess, async (request, response) => {
    const input = parseBody(request, changePasswordInputSchema)
    const { error: verifyError } = await dependencies.auth.auth.signInWithPassword({
      email: request.auth.profile.email,
      password: input.current_password,
    })
    // 400 (not 401) so a mistyped current password shows an inline error
    // instead of the client treating it as an expired session and signing out.
    if (verifyError) throw new ApiError(400, 'validation', 'Current password is incorrect.')

    const { error } = await dependencies.database.auth.admin.updateUserById(request.auth.profile.id, {
      password: input.new_password,
    })
    if (error) throw new ApiError(400, 'password_update_failed', error.message)
    response.status(204).end()
  })

  router.post('/signout', async (request, response) => {
    const { error } = await dependencies.database.auth.admin.signOut(request.auth.token, 'local')
    if (error) throw new ApiError(400, 'signout_failed', error.message)
    response.status(204).end()
  })

  return router
}
