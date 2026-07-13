import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { CompleteRoleOnboardingInput, Profile, SignInInput, SignUpInput } from '@barbershop/shared'
import { useBackend } from '../../services/backend'

interface AuthState {
  profile: Profile | null
  loading: boolean
  isBarber: boolean
  isShopOwner: boolean
  isAdmin: boolean
  signIn: (input: SignInInput) => Promise<Profile>
  signUp: (input: SignUpInput) => Promise<Profile>
  completeRoleOnboarding: (input: CompleteRoleOnboardingInput) => Promise<Profile>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Isang source of truth para sa current user, session loading, at role helpers. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useBackend()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // IMPORTANT: kailangan ang `active` guard dahil dini-double run ni
    // StrictMode ang effects sa dev. Pinipigilan nito ang stale state update.
    let active = true

    // Unang bukas ng app: ibalik muna ang existing session bago mag-render ng
    // protected route. Ito ang loading na hinihintay ng RequireAuth.
    backend.auth
      .getCurrentProfile()
      .then((p) => {
        if (active) setProfile(p)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    // Live updates ito para sabay ang header at guards after login/logout.
    const unsub = backend.auth.onAuthChange((p) => {
      if (active) setProfile(p)
    })
    return () => {
      active = false
      unsub()
    }
  }, [backend])

  // Role flags dito kinukuha para pare-pareho ang nav at route permissions.
  const value: AuthState = {
    profile,
    loading,
    isBarber: profile?.role === 'barber',
    isShopOwner: profile?.role === 'shop_owner',
    isAdmin: profile?.role === 'admin',
    signIn: (input) => backend.auth.signIn(input),
    signUp: (input) => backend.auth.signUp(input),
    completeRoleOnboarding: (input) => backend.auth.completeRoleOnboarding(input),
    signOut: () => backend.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
