import { describe, expect, it, vi } from 'vitest'
import { ApiBackend, DataError, type Message, type Profile } from '../src/index'

const fixturePassword = `Test!${crypto.randomUUID()}`
const primaryAccessToken = crypto.randomUUID()
const primaryRefreshToken = crypto.randomUUID()
const refreshedAccessToken = crypto.randomUUID()
const refreshedRefreshToken = crypto.randomUUID()

const profile: Profile = {
  id: crypto.randomUUID(),
  role: 'customer',
  requested_role: 'customer',
  verification_status: 'not_required',
  onboarding_completed: true,
  full_name: 'Test Customer',
  email: `customer-${crypto.randomUUID()}@example.test`,
  phone: null,
  location: null,
  avatar_url: null,
  created_at: '2026-07-17T00:00:00.000Z',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function memoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
    values,
  }
}

describe('ApiBackend', () => {
  it('persists a sign-in session, emits the profile, and authenticates later calls', async () => {
    const storage = memoryStorage()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: {
        profile,
        session: { access_token: primaryAccessToken, refresh_token: primaryRefreshToken },
      } }))
      .mockResolvedValueOnce(json({ data: [] }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1/', fetch: fetchMock, storage })
    const listener = vi.fn()
    backend.auth.onAuthChange(listener)

    await expect(backend.auth.signIn({ email: profile.email, password: fixturePassword })).resolves.toEqual(profile)
    await expect(backend.barbers.list()).resolves.toEqual([])

    expect(listener).toHaveBeenCalledWith(profile)
    expect(storage.values.get('philabantay.api.session.v1')).toContain(primaryAccessToken)
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('authorization')).toBe(`Bearer ${primaryAccessToken}`)
  })

  it('refreshes an expired access token once and retries the protected request', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: crypto.randomUUID(), refresh_token: primaryRefreshToken }),
    })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: 'not_authenticated', message: 'Expired.' } }, 401))
      .mockResolvedValueOnce(json({ data: { session: { access_token: refreshedAccessToken, refresh_token: refreshedRefreshToken } } }))
      .mockResolvedValueOnce(json({ data: [] }))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await expect(backend.barbers.list()).resolves.toEqual([])

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://api.test/api/v1/barbers',
      'http://api.test/api/v1/auth/refresh',
      'http://api.test/api/v1/barbers',
    ])
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get('authorization')).toBe(`Bearer ${refreshedAccessToken}`)
  })

  it('maps the central API error shape to DataError', async () => {
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({
      error: { code: 'forbidden', message: 'Wrong shop.' },
    }, 403))
    const backend = new ApiBackend({ baseUrl: 'http://api.test/api/v1', fetch: fetchMock, storage })

    await expect(backend.shops.list()).rejects.toMatchObject<DataError>({
      name: 'DataError',
      code: 'forbidden',
      message: 'Wrong shop.',
    })
  })

  it('delivers a sent message through the active subscription and cleans up polling', async () => {
    vi.useFakeTimers()
    const storage = memoryStorage({
      'philabantay.api.session.v1': JSON.stringify({ access_token: primaryAccessToken, refresh_token: primaryRefreshToken }),
    })
    const message: Message = {
      id: 'message-1',
      conversation_id: 'conversation-1',
      sender_id: profile.id,
      body: 'Hello',
      read_at: null,
      created_at: '2026-07-17T01:00:00.000Z',
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ data: message }, 201))
    const backend = new ApiBackend({
      baseUrl: 'http://api.test/api/v1',
      fetch: fetchMock,
      storage,
      chatPollIntervalMs: 1_000,
    })
    const listener = vi.fn()
    const unsubscribe = backend.chat.subscribe(message.conversation_id, listener)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await backend.chat.sendMessage({ conversation_id: message.conversation_id, body: message.body })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(message)

    unsubscribe()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
