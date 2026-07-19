import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ApiConfig } from '../config'

export interface ApiDependencies {
  /** Publishable-key client used only to verify/sign in user sessions. */
  auth: SupabaseClient
  /** Isolated service-role client used only after Express authorization. */
  database: SupabaseClient
}

const serverAuthOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const

export function createSupabaseDependencies(config: ApiConfig): ApiDependencies {
  return {
    auth: createClient(config.supabaseUrl, config.supabasePublishableKey, serverAuthOptions),
    database: createClient(config.supabaseUrl, config.supabaseServiceRoleKey, serverAuthOptions),
  }
}
