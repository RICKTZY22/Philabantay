import { createHash } from 'node:crypto'
import type { ApiDependencies } from './supabase'
import { ApiError } from '../http/errors'

export const VERIFICATION_EVIDENCE_BUCKET = 'verification-evidence'
export const VERIFICATION_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024
const EVIDENCE_VIEW_SECONDS = 60

export type VerificationEvidenceMime = 'image/jpeg' | 'image/png' | 'application/pdf'

export interface ValidatedEvidence {
  bytes: number
  detectedMime: VerificationEvidenceMime
  sha256Hex: string
  valid: boolean
}

function isPng(buffer: Buffer): boolean {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return false

  let offset = 8
  let sawHeader = false
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    if (length > VERIFICATION_EVIDENCE_MAX_BYTES || offset + 12 + length > buffer.length) return false
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) return false
      sawHeader = true
    }
    offset += 12 + length
    if (type === 'IEND') return length === 0 && offset === buffer.length
  }
  return false
}

function isJpeg(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return false
  // Evidence images must end at EOI. Rejecting trailing bytes closes the most
  // common JPEG/HTML and JPEG/archive polyglot construction.
  if (buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) return false

  let offset = 2
  let sawFrame = false
  let sawScan = false
  while (offset < buffer.length - 2) {
    if (buffer[offset] !== 0xff) {
      if (!sawScan) return false
      offset += 1
      continue
    }
    while (buffer[offset] === 0xff) offset += 1
    const marker = buffer[offset]
    offset += 1
    if (marker === undefined) return false
    if (marker === 0x00 || marker === 0xd0 || marker === 0xd1 || marker === 0xd2
      || marker === 0xd3 || marker === 0xd4 || marker === 0xd5 || marker === 0xd6
      || marker === 0xd7 || marker === 0x01) continue
    if (marker === 0xd9) return sawFrame && sawScan && offset === buffer.length
    if (offset + 2 > buffer.length) return false
    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return false
    if ((marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)) sawFrame = true
    if (marker === 0xda) sawScan = true
    offset += segmentLength
  }
  return sawFrame && sawScan
}

function isPdf(buffer: Buffer): boolean {
  if (buffer.length < 16 || !buffer.subarray(0, 8).toString('ascii').startsWith('%PDF-1.')) return false
  const text = buffer.toString('latin1')
  const eof = text.lastIndexOf('%%EOF')
  if (eof < 0 || eof < text.length - 1024) return false
  if (!/^\s*$/.test(text.slice(eof + 5))) return false
  return text.includes('/Type') && (text.includes('xref') || text.includes('/XRef'))
}

function detectedMime(buffer: Buffer): VerificationEvidenceMime | null {
  if (isPng(buffer)) return 'image/png'
  if (isJpeg(buffer)) return 'image/jpeg'
  if (isPdf(buffer)) return 'application/pdf'
  return null
}

export function validateEvidenceBytes(
  buffer: Buffer,
  declaredMime: string,
): ValidatedEvidence {
  if (buffer.length < 1 || buffer.length > VERIFICATION_EVIDENCE_MAX_BYTES) {
    throw new ApiError(400, 'evidence_rejected', 'Evidence must be between 1 byte and 10 MiB.')
  }
  const mime = detectedMime(buffer)
  if (!mime) {
    // The completion command records the failed validation before the route
    // returns this safe error to the applicant.
    return {
      bytes: buffer.length,
      detectedMime: declaredMime === 'image/png' || declaredMime === 'application/pdf'
        ? declaredMime
        : 'image/jpeg',
      sha256Hex: createHash('sha256').update(buffer).digest('hex'),
      valid: false,
    }
  }
  return {
    bytes: buffer.length,
    detectedMime: mime,
    sha256Hex: createHash('sha256').update(buffer).digest('hex'),
    valid: mime === declaredMime,
  }
}

export async function downloadAndValidateEvidence(
  dependencies: ApiDependencies,
  storagePath: string,
  declaredMime: string,
): Promise<ValidatedEvidence> {
  const { data, error } = await dependencies.database.storage
    .from(VERIFICATION_EVIDENCE_BUCKET)
    .download(storagePath)
  if (error || !data) {
    throw new ApiError(409, 'evidence_processing', 'The uploaded evidence object is not available yet.')
  }
  const buffer = Buffer.from(await data.arrayBuffer())
  return validateEvidenceBytes(buffer, declaredMime)
}

export async function issueEvidenceUploadGrant(
  dependencies: ApiDependencies,
  storagePath: string,
): Promise<{ uploadUrl: string; token: string }> {
  const { data, error } = await dependencies.database.storage
    .from(VERIFICATION_EVIDENCE_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })
  if (error || !data) {
    throw new ApiError(503, 'evidence_processing', 'An evidence upload grant could not be created.')
  }
  return { uploadUrl: data.signedUrl, token: data.token }
}

export async function issueEvidenceView(
  dependencies: ApiDependencies,
  storagePath: string,
): Promise<{ url: string; expiresAt: string }> {
  const { data, error } = await dependencies.database.storage
    .from(VERIFICATION_EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, EVIDENCE_VIEW_SECONDS)
  if (error || !data) {
    throw new ApiError(503, 'evidence_processing', 'The evidence view could not be created.')
  }
  return {
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + EVIDENCE_VIEW_SECONDS * 1000).toISOString(),
  }
}

export async function removeEvidenceObject(
  dependencies: ApiDependencies,
  storagePath: string | null | undefined,
): Promise<void> {
  if (!storagePath) return
  const { error } = await dependencies.database.storage
    .from(VERIFICATION_EVIDENCE_BUCKET)
    .remove([storagePath])
  if (error) {
    throw new ApiError(503, 'evidence_processing', 'Evidence metadata changed, but object cleanup must be retried.')
  }
}
