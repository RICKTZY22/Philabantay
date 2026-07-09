import { initials } from '../lib/format'

const BLOBS = ['var(--blue)', '#f8cad6', 'var(--green)', 'var(--purple)', 'var(--orange)', 'var(--yellow)']

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  // Deterministic colour from the name so a person keeps the same blob.
  const idx = name.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % BLOBS.length
  return (
    <span
      className="avatar-blob"
      style={{ width: size, height: size, fontSize: size * 0.4, background: BLOBS[idx] }}
    >
      {initials(name)}
    </span>
  )
}
