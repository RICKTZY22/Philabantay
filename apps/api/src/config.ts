import { z } from 'zod'

const rawEnvironmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // Comma-separated allowlist so the exact browser origin(s) are matched. The
  // web app is served on port 5174 and reachable as both localhost and 127.0.0.1.
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5174,http://127.0.0.1:5174'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export interface ApiConfig {
  supabaseUrl: string
  supabasePublishableKey: string
  supabaseServiceRoleKey: string
  port: number
  webOrigin: string[]
  nodeEnv: 'development' | 'test' | 'production'
}

export function readConfig(environment: NodeJS.ProcessEnv): ApiConfig {
  const parsed = rawEnvironmentSchema.parse(environment)
  const publishableKey = parsed.SUPABASE_PUBLISHABLE_KEY ?? parsed.SUPABASE_ANON_KEY
  const serviceRoleKey = parsed.SUPABASE_SERVICE_ROLE_KEY ?? parsed.SUPABASE_SECRET_KEY

  if (!publishableKey) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_ANON_KEY) is required.')
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) is required.')
  }

  const webOrigin = parsed.WEB_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  if (webOrigin.length === 0) throw new Error('WEB_ORIGIN must list at least one origin.')
  for (const origin of webOrigin) {
    try {
      new URL(origin)
    } catch {
      throw new Error(`WEB_ORIGIN contains an invalid URL: ${origin}`)
    }
  }

  return {
    supabaseUrl: parsed.SUPABASE_URL,
    supabasePublishableKey: publishableKey,
    supabaseServiceRoleKey: serviceRoleKey,
    port: parsed.API_PORT,
    webOrigin,
    nodeEnv: parsed.NODE_ENV,
  }
}
