import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { ApiBackend, type DataBackend } from '@barbershop/shared'

const BackendContext = createContext<DataBackend | null>(null)

/**
 * Data layer for the whole app. The only backend is the Express + Supabase
 * ApiBackend; the old localStorage mock has been retired. Pages must talk to the
 * `DataBackend` contract, never to a concrete backend, so the seam stays clean.
 */
function createBackend(): DataBackend {
  const kind = import.meta.env.VITE_DATA_BACKEND ?? 'api'
  if (kind !== 'api' && kind !== 'supabase') {
    throw new Error(`Unsupported data backend: ${kind}. Only the Express API backend is supported.`)
  }
  if (!import.meta.env.VITE_API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is required to reach the Express API.')
  }
  return new ApiBackend({ baseUrl: import.meta.env.VITE_API_BASE_URL })
}

export function BackendProvider({ children }: { children: ReactNode }) {
  // Isang backend instance lang buong app; huwag gumawa ulit kada render.
  const backend = useMemo(() => createBackend(), [])
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}

export function useBackend(): DataBackend {
  const ctx = useContext(BackendContext)
  if (!ctx) throw new Error('useBackend must be used within a BackendProvider')
  return ctx
}
