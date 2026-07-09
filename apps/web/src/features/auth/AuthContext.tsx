import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Profile, SignInInput, SignUpInput } from '@barbershop/shared'
import { useBackend } from '../../services/backend'

interface AuthState {
  profile: Profile | null
  loading: boolean
  isBarber: boolean
  isAdmin: boolean
  signIn: (input: SignInInput) => Promise<Profile>
  signUp: (input: SignUpInput) => Promise<Profile>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useBackend()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    backend.auth
      .getCurrentProfile()
      .then((p) => {
        if (active) setProfile(p)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    const unsub = backend.auth.onAuthChange((p) => {
      if (active) setProfile(p)
    })
    return () => {
      active = false
      unsub()
    }
  }, [backend])

  const value: AuthState = {
    profile,
    loading,
    isBarber: profile?.role === 'barber',
    isAdmin: profile?.role === 'admin',
    signIn: (input) => backend.auth.signIn(input),
    signUp: (input) => backend.auth.signUp(input),
    signOut: () => backend.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
