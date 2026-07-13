const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/**
 * Accept only same-origin absolute paths for post-auth and curtain navigation.
 * Reject protocol-relative URLs, Windows-style separators, and control chars.
 */
export function safeInternalPath(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string') return fallback
  const candidate = value.trim()
  if (
    !candidate.startsWith('/')
    || candidate.startsWith('//')
    || candidate.includes('\\')
    || CONTROL_CHARACTERS.test(candidate)
  ) return fallback

  try {
    const parsed = new URL(candidate, window.location.origin)
    if (parsed.origin !== window.location.origin) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

/** Encode backend identifiers before inserting them into a route segment. */
export function routeSegment(value: string): string {
  return encodeURIComponent(value)
}
