import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { DataBackend } from '@barbershop/shared'
import { createMockBackend } from './mock/MockBackend'

const BackendContext = createContext<DataBackend | null>(null)

/**
 * Switchboard ng data layer. Mock muna ngayon; dito lang ikakabit ang Supabase
 * adapter later gamit ang VITE_DATA_BACKEND para walang page na kailangang
 * baguhin isa-isa.
 *
 * IMPORTANT - HUWAG MAG-IMPORT NG MOCK DIRETSO SA MGA PAGE:
 * `DataBackend` contract ang dapat kausap ng UI para plug-and-play ang Supabase.
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
  // Isang backend instance lang buong app; huwag gumawa ulit kada render.
  const backend = useMemo(() => createBackend(), [])
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}

export function useBackend(): DataBackend {
  const ctx = useContext(BackendContext)
  if (!ctx) throw new Error('useBackend must be used within a BackendProvider')
  return ctx
}
