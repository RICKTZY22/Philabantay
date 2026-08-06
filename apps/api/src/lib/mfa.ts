import { readConfig } from '../config'
import { ApiError } from '../http/errors'

/**
 * TOTP factor management against GoTrue's REST surface.
 *
 * These calls are made with the caller's own access token rather than the
 * service role, so a user can only ever act on their own factors, and they are
 * stateless: no shared Supabase client is mutated per request.
 *
 * This exists because every `/admin` route is mounted behind `requireAal2` while
 * the product had no way to reach AAL2 at all. Sign-in never offered a
 * challenge, and nothing could enrol a factor, so no admin surface was reachable
 * in a browser by anyone.
 */

export interface TotpFactor {
  id: string
  friendly_name: string | null
  status: 'verified' | 'unverified'
  created_at: string
}

export interface EnrolledFactor {
  factor_id: string
  /** Shown once so the operator can type it into an authenticator app. */
  secret: string
  /** `otpauth://` URI for a QR code. */
  uri: string
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  expires_at?: number
}

function endpoint(path: string): string {
  const { supabaseUrl } = readConfig(process.env)
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1${path}`
}

async function call<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const { supabasePublishableKey } = readConfig(process.env)
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!response.ok) {
    // GoTrue reports a wrong code as a 4xx with its own message. Surfacing that
    // verbatim would leak provider wording into the product, so the two cases a
    // user can actually act on get their own codes.
    const message = typeof body.msg === 'string' ? body.msg : typeof body.error_description === 'string' ? body.error_description : ''
    if (response.status === 400 || response.status === 422) {
      throw new ApiError(400, 'mfa_code_invalid', /expired/i.test(message)
        ? 'That code has expired. Open your authenticator app and try the current one.'
        : 'That code is not right. Check your authenticator app and try again.')
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(401, 'not_authenticated', 'Your session expired before the code was checked. Sign in again.')
    }
    throw new ApiError(502, 'mfa_unavailable', 'The authentication service did not respond as expected.')
  }
  return body as T
}

/**
 * Factors hang off the user record. `GET /factors` is POST-only in GoTrue and
 * answers 405, which is worth stating because the obvious guess is wrong.
 */
export async function listFactors(accessToken: string): Promise<TotpFactor[]> {
  const body = await call<{ factors?: Array<TotpFactor & { factor_type?: string }> }>('/user', accessToken)
  return (body.factors ?? [])
    .filter((factor) => factor.factor_type === undefined || factor.factor_type === 'totp')
    .map((factor) => ({
      id: factor.id,
      friendly_name: factor.friendly_name ?? null,
      status: factor.status,
      created_at: factor.created_at,
    }))
}

export async function enrolFactor(accessToken: string, friendlyName: string): Promise<EnrolledFactor> {
  const body = await call<{ id: string; totp?: { secret?: string; uri?: string } }>('/factors', accessToken, {
    method: 'POST',
    body: JSON.stringify({ factor_type: 'totp', friendly_name: friendlyName }),
  })
  if (!body.totp?.secret || !body.totp.uri) {
    throw new ApiError(502, 'mfa_unavailable', 'The authentication service did not return an enrolment secret.')
  }
  return { factor_id: body.id, secret: body.totp.secret, uri: body.totp.uri }
}

/**
 * Challenge and verify in one step. The challenge id is an implementation
 * detail of the exchange, so the browser never has to hold or replay it.
 */
export async function verifyFactor(accessToken: string, factorId: string, code: string): Promise<AuthSession> {
  const challenge = await call<{ id: string }>(`/factors/${encodeURIComponent(factorId)}/challenge`, accessToken, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  const verified = await call<AuthSession>(`/factors/${encodeURIComponent(factorId)}/verify`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ challenge_id: challenge.id, code }),
  })
  if (!verified.access_token || !verified.refresh_token) {
    throw new ApiError(502, 'mfa_unavailable', 'The authentication service did not return a session.')
  }
  return verified
}

export async function removeFactor(accessToken: string, factorId: string): Promise<void> {
  await call<unknown>(`/factors/${encodeURIComponent(factorId)}`, accessToken, { method: 'DELETE' })
}
