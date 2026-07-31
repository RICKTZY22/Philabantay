import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import type { ApiDependencies } from './lib/supabase'
import { authenticate } from './http/auth'
import { requireAal2, requireOperationalAccess } from './http/authorization'
import { errorHandler, notFoundHandler } from './http/errors'
import { createAccountDataRouter } from './routes/account-data'
import { createAuthRouter } from './routes/auth'
import { createAvailabilityRouter } from './routes/availability'
import { createBookingsRouter } from './routes/bookings'
import { createCatalogRouter } from './routes/catalog'
import { createChatRouter } from './routes/chat'
import { createEmploymentRouter } from './routes/employment'
import { createPublicCatalogRouter } from './routes/public-catalog'
import { createVerificationRouter } from './routes/verification'
import { createAdminVerificationRouter } from './routes/admin-verification'
import { createSupportRouter } from './routes/support'
import { createQualificationsRouter } from './routes/qualifications'

export interface CreateAppOptions {
  webOrigin: string | string[]
}

export function createApp(dependencies: ApiDependencies, options: CreateAppOptions): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: options.webOrigin, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] }))
  app.use(express.json({ limit: '64kb' }))

  // Rate limiting keys on the client IP. Behind a reverse proxy in production,
  // set `app.set('trust proxy', 1)` (or the proxy hop count) so the real client
  // IP is used instead of the proxy's, and never a permissive `true`.
  const rateLimitMessage = (message: string) => ({ error: { code: 'rate_limited', message } })
  const generalLimiter = rateLimit({
    windowMs: 60_000,
    // The Docker-backed role matrix intentionally drives many authenticated
    // actors through one loopback IP. Production keeps the real abuse ceiling.
    limit: process.env.NODE_ENV === 'test' ? 1_000 : 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: rateLimitMessage('Too many requests. Please slow down and try again shortly.'),
  })
  // Only failed attempts count, so real sign-ins are never throttled while
  // credential guessing and signup email-probing are.
  const credentialLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: rateLimitMessage('Too many attempts. Please wait a few minutes and try again.'),
  })
  const catalogueLimiter = rateLimit({
    windowMs: 60_000,
    limit: 90,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: rateLimitMessage('Too many catalogue requests. Please slow down and try again shortly.'),
  })
  const slotLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: rateLimitMessage('Too many availability requests. Please slow down and try again shortly.'),
  })

  app.get('/health', (_request, response) => {
    response.json({ data: { status: 'ok' } })
  })

  const api = express.Router()
  api.use(generalLimiter)
  api.use('/auth/signin', credentialLimiter)
  api.use('/auth/signup', credentialLimiter)
  api.use('/auth', createAuthRouter(dependencies))
  // Anonymous discovery is a deliberately narrow, response-validated surface.
  // All mutations and private reads remain below both authentication guards.
  api.use('/catalog/availability/slots', slotLimiter)
  api.use('/catalog', catalogueLimiter, createPublicCatalogRouter(dependencies))
  api.use(authenticate(dependencies))
  // Locked professionals need the verification workspace and a narrow Help
  // path. Everything else remains behind the global operational lock.
  api.use('/verification', createVerificationRouter(dependencies))
  api.use('/support', createSupportRouter(dependencies))
  api.use(requireOperationalAccess)
  api.use('/admin', requireAal2, createAdminVerificationRouter(dependencies))
  api.use(createCatalogRouter(dependencies))
  // Same ceiling as the anonymous slot route, and for the same reason. Since
  // P2-07 these two ask the claim gate about every candidate on the grid, so one
  // request can cost dozens of gate evaluations per provider. Being signed in
  // does not make that cheaper, and the general 120/min limiter would let one
  // account amplify a single click into thousands of them.
  api.use('/availability', slotLimiter)
  api.use('/bookings/quote', slotLimiter)
  api.use(createAvailabilityRouter(dependencies))
  api.use(createBookingsRouter(dependencies))
  api.use(createChatRouter(dependencies))
  api.use(createEmploymentRouter(dependencies))
  api.use(createQualificationsRouter(dependencies))
  api.use(createAccountDataRouter(dependencies))

  app.use('/api/v1', api)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
