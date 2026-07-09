import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { DataBackend } from '@barbershop/shared'
import { createMockBackend } from './mock/MockBackend'

const BackendContext = createContext<DataBackend | null>(null)

/**
 * Chooses the data layer. Phase 1 always uses the mock. Phase 2 will add a
 * `createSupabaseBackend()` branch here keyed on VITE_DATA_BACKEND — no other
 * file in the app needs to change.
 */
function createBackend(): DataBackend {
  const kind = import.meta.env.VITE_DATA_BACKEND ?? 'mock'
  switch (kind) {
    case 'supabase':
      // TODO(Phase 2): return createSupabaseBackend()
      console.warn('[backend] supabase backend not implemented yet — using mock')
      return createMockBackend()
    case 'mock':
    default:
      return createMockBackend()
  }
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => createBackend(), [])
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}

export function useBackend(): DataBackend {
  const ctx = useContext(BackendContext)
  if (!ctx) throw new Error('useBackend must be used within a BackendProvider')
  return ctx
}
