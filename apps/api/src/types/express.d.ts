import type { User } from '@supabase/supabase-js'
import type { Profile } from '@barbershop/shared'

declare global {
  namespace Express {
    interface Request {
      auth: {
        token: string
        user: User
        profile: Profile
      }
    }
  }
}

export {}
