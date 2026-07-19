/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_BACKEND?: 'mock' | 'api' | 'supabase'
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
