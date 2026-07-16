const FORMAT = 'pbkdf2-sha256'
const ITERATIONS = 600_000
const SALT_BYTES = 16
const KEY_BYTES = 32
const encoder = new TextEncoder()

/** Fixed verifier used only to equalize unknown-account sign-in timing. */
export const DUMMY_PASSWORD_HASH = 'pbkdf2-sha256$600000$WpdrefrxJ6PrLxNVuA0sbA==$kDZZKnfPAR98KSn3ubDkSULeVUDQ7uwC1M2/LTItc2o='

export function isPasswordHash(value: string): boolean {
  return value.startsWith(`${FORMAT}$`)
}

/** Browser-only mock protection. Real authentication still belongs on the server. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const derived = await derive(password, salt, ITERATIONS)
  return [FORMAT, String(ITERATIONS), toBase64(salt), toBase64(derived)].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isPasswordHash(stored)) return constantTimeTextEqual(password, stored)
  const [format, rawIterations, rawSalt, rawExpected] = stored.split('$')
  const iterations = Number(rawIterations)
  if (
    format !== FORMAT
    || !Number.isSafeInteger(iterations)
    || iterations < 100_000
    || !rawSalt
    || !rawExpected
  ) return false

  try {
    const salt = fromBase64(rawSalt)
    const expected = fromBase64(rawExpected)
    const actual = await derive(password, salt, iterations)
    return constantTimeBytesEqual(actual, expected)
  } catch {
    return false
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    KEY_BYTES * 8,
  )
  return new Uint8Array(bits)
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return difference === 0
}

function constantTimeTextEqual(left: string, right: string): boolean {
  return constantTimeBytesEqual(encoder.encode(left), encoder.encode(right))
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
