import type { User } from '@supabase/supabase-js'
import type { Profile } from '@barbershop/shared'

declare global {
  namespace Express {
    interface Request {
      auth: {
        token: string
        user: User
        profile: Profile
        /** Authenticator Assurance Level from the cryptographically verified JWT. */
        aal: 'aal1' | 'aal2'
      }
    }
  }
}

export {}
