/** Shared fallback para pare-pareho ang itsura ng auth at lazy-page waiting. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="screen-loading">{label}</div>
}
