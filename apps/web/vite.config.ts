import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function apiOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * One CSP builder for both servers, keyed by directive rather than assembled
 * from strings. The previous shape derived the dev policy by exact-string
 * `.replace()` over the production policy, which failed silently the moment
 * the production directive was edited without the override: dev then lost
 * `'unsafe-inline'`, Vite's inline preamble was refused, and the app was a
 * blank page with no console error that the browser happily cached
 * (see D-032). Directives are merged by NAME here, so an override can never
 * quietly stop matching.
 */
function contentSecurityPolicy(
  configuredConnectOrigins: Array<string | null>,
  configuredImageOrigins: Array<string | null>,
  overrides: Record<string, string> = {},
): string {
  const connectOrigins = [...new Set(configuredConnectOrigins.filter((origin): origin is string => Boolean(origin)))]
  const imageOrigins = [...new Set(configuredImageOrigins.filter((origin): origin is string => Boolean(origin)))]
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'base-uri': "'none'",
    'object-src': "'none'",
    'frame-ancestors': "'none'",
    'form-action': "'self'",
    // No 'wasm-unsafe-eval': Rive was the only thing compiling WebAssembly and
    // it was deleted on 2026-08-01. Nothing in the app evaluates strings as
    // code either, so script-src stays at bare 'self'.
    'script-src': "'self'",
    'script-src-attr': "'none'",
    'style-src': "'self'",
    'style-src-attr': "'unsafe-inline'",
    'font-src': "'self'",
    'img-src': `'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org${imageOrigins.length > 0 ? ` ${imageOrigins.join(' ')}` : ''}`,
    'connect-src': `'self'${connectOrigins.length > 0 ? ` ${connectOrigins.join(' ')}` : ''}`,
    'worker-src': "'self' blob:",
    'manifest-src': "'self'",
  }
  for (const [name, extra] of Object.entries(overrides)) {
    if (!(name in directives)) throw new Error(`CSP override targets unknown directive: ${name}`)
    directives[name] = `${directives[name]} ${extra}`
  }
  return Object.entries(directives).map(([name, value]) => `${name} ${value}`).join('; ')
}

const commonSecurityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const storageOrigin = apiOrigin(process.env.VITE_STORAGE_ORIGIN ?? environment.VITE_STORAGE_ORIGIN)
  const cspOrigins: [Array<string | null>, Array<string | null>] = [
    [apiOrigin(process.env.VITE_API_BASE_URL ?? environment.VITE_API_BASE_URL), storageOrigin],
    [storageOrigin],
  ]
  const productionCsp = contentSecurityPolicy(...cspOrigins)
  // Vite injects an inline Fast Refresh bootstrap and uses WebSockets only
  // during development. Production preview stays on the strict policy.
  const developmentCsp = contentSecurityPolicy(...cspOrigins, {
    'script-src': "'unsafe-inline'",
    'style-src': "'unsafe-inline'",
    'connect-src': 'ws: wss:',
  })
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const path = id.replace(/\\/g, '/')
            const stableReactPackages = [
              '/node_modules/react/',
              '/node_modules/react-dom/',
              '/node_modules/react-router/',
              '/node_modules/react-router-dom/',
              '/node_modules/scheduler/',
            ]
            // React/router lang ang pinaghihiwalay para stable ang cache. Huwag
            // isama ang Rive dito; intentionally post-paint async chunk iyon.
            if (stableReactPackages.some((segment) => path.includes(segment))) {
              return 'react-vendor'
            }
            return undefined
          }
        },
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      headers: {
        ...commonSecurityHeaders,
        'Content-Security-Policy': developmentCsp,
        // Never let a browser cache a dev document. During the D-032 incident a
        // momentarily-broken CSP was cached WITH the page, so the app stayed
        // blank through a config fix, a dep-cache purge, and three restarts.
        'Cache-Control': 'no-store',
      },
    },
    preview: {
      headers: {
        ...commonSecurityHeaders,
        'Content-Security-Policy': productionCsp,
      },
    },
  }
})
