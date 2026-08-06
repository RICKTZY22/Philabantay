/**
 * Refuse to build a non-local bundle while `public/_headers` still carries the
 * local-only CSP.
 *
 * `vite.config.ts` derives dev and preview policies from `VITE_API_BASE_URL`, so
 * both work locally and this static file never fails beforehand. Shipped
 * unchanged to a host where the API and Supabase are on other origins, every API
 * call and every signed shop photo is CSP-blocked in production with no prior
 * warning. The file has documented that risk at length for a while; a comment
 * cannot fail a pipeline, so this does.
 *
 * Local builds are unaffected: the check only fires when the configured API base
 * is not localhost.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const headersPath = resolve(here, '../public/_headers')

const apiBase = (process.env.VITE_API_BASE_URL ?? '').trim()
const storageOrigin = (process.env.VITE_STORAGE_ORIGIN ?? '').trim()

function isLocal(value) {
  if (!value) return true
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
  } catch {
    // An unparseable value is somebody's mistake, not a reason to pass.
    return false
  }
}

if (isLocal(apiBase) && isLocal(storageOrigin)) {
  process.exit(0)
}

const headers = readFileSync(headersPath, 'utf8')
const policyLine = headers
  .split(/\r?\n/)
  .find((line) => line.includes('Content-Security-Policy:'))

if (!policyLine) {
  console.error('check-csp: no Content-Security-Policy line found in public/_headers.')
  process.exit(1)
}

const connectSrc = /connect-src([^;]*)/.exec(policyLine)?.[1]?.trim() ?? ''
const missing = []
if (!isLocal(apiBase) && !connectSrc.includes(new URL(apiBase).origin)) missing.push(new URL(apiBase).origin)
if (!isLocal(storageOrigin) && !connectSrc.includes(new URL(storageOrigin).origin)) missing.push(new URL(storageOrigin).origin)

if (missing.length > 0) {
  console.error(
    'check-csp: public/_headers still carries the local-only Content-Security-Policy.\n'
    + `  connect-src is: ${connectSrc || "(empty)"}\n`
    + `  missing origin(s): ${missing.join(', ')}\n`
    + '  Every API call and signed photo would be CSP-blocked in production.\n'
    + '  Add the exact HTTPS (and WSS, if used) origins to apps/web/public/_headers.',
  )
  process.exit(1)
}
