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

function contentSecurityPolicy(configuredApiOrigin: string | null): string {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
    `connect-src 'self'${configuredApiOrigin ? ` ${configuredApiOrigin}` : ''}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ')
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
  const productionCsp = contentSecurityPolicy(apiOrigin(process.env.VITE_API_BASE_URL ?? environment.VITE_API_BASE_URL))
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
            // isama ang GSAP dito; intentionally post-paint async chunk iyon.
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
      // Vite injects an inline Fast Refresh bootstrap and uses WebSockets only
      // during development. Production preview stays on the strict policy below.
      headers: {
        ...commonSecurityHeaders,
        'Content-Security-Policy': productionCsp
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
          .replace("connect-src 'self'", "connect-src 'self' ws: wss:"),
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
