import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { ApiBackend, type DataBackend } from '@barbershop/shared'
import { createMockBackend } from './mock/MockBackend'

const BackendContext = createContext<DataBackend | null>(null)

/**
 * Switchboard ng data layer. `VITE_DATA_BACKEND` selects the local mock or the
 * Express-backed adapter without changing individual pages.
 *
 * IMPORTANT - HUWAG MAG-IMPORT NG MOCK DIRETSO SA MGA PAGE:
 * `DataBackend` contract ang dapat kausap ng UI para plug-and-play ang Supabase.
 */
function createBackend(): DataBackend {
  const kind = import.meta.env.VITE_DATA_BACKEND ?? 'mock'
  switch (kind) {
    case 'api':
    case 'supabase':
      if (!import.meta.env.VITE_API_BASE_URL) {
        throw new Error('VITE_API_BASE_URL is required when VITE_DATA_BACKEND uses the Express API.')
      }
      return new ApiBackend({ baseUrl: import.meta.env.VITE_API_BASE_URL })
    case 'mock':
      return createMockBackend()
    default:
      throw new Error(`Unsupported data backend: ${kind}`)
  }
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
