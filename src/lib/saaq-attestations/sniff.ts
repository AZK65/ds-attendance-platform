import { createHash } from 'crypto'
import path from 'path'
import { SaaqError } from './errors'

export const MAX_ATTESTATION_BYTES = 10 * 1024 * 1024

export const ATTESTATION_KINDS = ['theory', 'practical'] as const
export type AttestationKind = (typeof ATTESTATION_KINDS)[number]

/** Prisma cuid(). Anything else, including a file extension, is rejected. */
export const ATTESTATION_FILE_ID = /^c[a-z0-9]{24}$/

const STORED_PATH = /^c[a-z0-9]{24}\/c[a-z0-9]{24}\.(pdf|jpg|png|webp|heic)$/

const HEIF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'heif', 'mif1', 'msf1',
])

export interface SniffedType {
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic'
  extension: 'pdf' | 'jpg' | 'png' | 'webp' | 'heic'
}

export function attestationsRoot(): string {
  const override = process.env.SAAQ_ATTESTATIONS_DIR
  if (override) return path.resolve(override)
  return path.join(process.cwd(), 'data', 'saaq-attestations')
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Type comes from the bytes, never the browser or the file name.
 * SVG, HTML, ZIP, and Office files fail this on purpose.
 */
export function sniffAttestation(bytes: Buffer): SniffedType | null {
  if (bytes.length < 12) return null
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    return { mimeType: 'application/pdf', extension: 'pdf' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { mimeType: 'image/png', extension: 'png' }
  }
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' }
  }
  if (bytes.subarray(4, 8).toString('latin1') !== 'ftyp') return null
  const brand = bytes.subarray(8, 12).toString('latin1').toLowerCase()
  if (HEIF_BRANDS.has(brand)) return { mimeType: 'image/heic', extension: 'heic' }
  const boxSize = bytes.readUInt32BE(0)
  const limit = Math.min(bytes.length, Number.isFinite(boxSize) && boxSize > 16 ? boxSize : bytes.length)
  for (let offset = 16; offset + 4 <= limit; offset += 4) {
    const compat = bytes.subarray(offset, offset + 4).toString('latin1').toLowerCase()
    if (HEIF_BRANDS.has(compat)) return { mimeType: 'image/heic', extension: 'heic' }
  }
  return null
}

export function cleanOriginalName(name: string): string {
  const base = (name || '').split(/[/\\]/).pop() || ''
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}.\- ()+]/gu, '_')
    .replace(/^\.+/, '')
    .slice(0, 180)
    .trim()
  return cleaned || 'document'
}

export function storedRelativePath(attestationId: string, fileId: string, extension: SniffedType['extension']): string {
  if (!ATTESTATION_FILE_ID.test(attestationId) || !ATTESTATION_FILE_ID.test(fileId)) {
    throw new SaaqError(500, 'invalid_id', 'Could not store the file')
  }
  return `${attestationId}/${fileId}.${extension}`
}

export function absoluteFromStored(storedPath: string): string {
  if (!STORED_PATH.test(storedPath)) {
    throw new SaaqError(400, 'invalid_path', 'Stored path is invalid')
  }
  const root = path.resolve(attestationsRoot())
  const [attestationId, filename] = storedPath.split('/')
  const absolute = path.resolve(root, attestationId, filename)
  if (!absolute.startsWith(root + path.sep)) {
    throw new SaaqError(400, 'invalid_path', 'Stored path is invalid')
  }
  return absolute
}

/** Staff file URLs never end in an extension. Middleware skips auth for those. */
export function attestationFileUrl(studentId: string, fileId: string, download = false): string {
  if (!/^\d+$/.test(studentId) || !ATTESTATION_FILE_ID.test(fileId)) {
    throw new SaaqError(404, 'not_found', 'File not found')
  }
  const base = `/api/students/${studentId}/saaq-attestations/files/${fileId}`
  return download ? `${base}?download=1` : base
}

/** Download-all leaves attestations out. They are included only when explicitly ticked. */
export function attestationsExplicitlyRequested(includeParam: string | null | undefined): boolean {
  if (!includeParam) return false
  return includeParam.split(',').some(part => part.trim().toLowerCase() === 'attestations')
}
