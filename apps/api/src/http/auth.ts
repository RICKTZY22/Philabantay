import type { RequestHandler } from 'express'
import type { ApiDependencies } from '../lib/supabase'
import { ApiError, fromDatabaseError } from './errors'

function bearerToken(header: string | undefined): string {
  if (!header) throw new ApiError(401, 'not_authenticated', 'A bearer token is required.')
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match?.[1]) throw new ApiError(401, 'not_authenticated', 'Authorization header must use Bearer authentication.')
  return match[1]
}

export function authenticate(dependencies: ApiDependencies): RequestHandler {
  return async (request, _response, next) => {
    const token = bearerToken(request.header('authorization'))
    const claimsResult = await dependencies.auth.auth.getClaims(token)
    if (claimsResult.error || !claimsResult.data?.claims) {
      throw new ApiError(401, 'not_authenticated', 'The access token is invalid or expired.')
    }

    const subject = claimsResult.data.claims.sub
    if (typeof subject !== 'string') {
      throw new ApiError(401, 'not_authenticated', 'The access token has no valid subject.')
    }
    const aal = claimsResult.data.claims.aal === 'aal2' ? 'aal2' : 'aal1'

    // getClaims is the cryptographic identity boundary. getUser supplies the
    // current Auth contact/confirmation facts used by verification commands.
    const { data: authData, error: authError } = await dependencies.auth.auth.getUser(token)
    if (authError || !authData.user || authData.user.id !== subject) {
      throw new ApiError(401, 'not_authenticated', 'The access token is invalid or expired.')
    }

    const { data: profile, error: profileError } = await dependencies.database
      .from('users')
      .select('*')
      .eq('id', subject)
      .maybeSingle()

    if (profileError) throw fromDatabaseError(profileError)
    if (!profile) throw new ApiError(403, 'profile_missing', 'The authenticated account has no application profile.')

    request.auth = { token, user: authData.user, profile, aal }
    next()
  }
}
