export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="screen-loading">{label}</div>
}
