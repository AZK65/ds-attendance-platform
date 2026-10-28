import { isFutureYmd, isValidYmd } from '@/lib/rsep1/values'
import { SaaqError } from './errors'
import { type AttestationKind, MAX_ATTESTATION_BYTES, sniffAttestation, type SniffedType } from './sniff'

export function parseKind(value: unknown): AttestationKind {
  if (value === 'theory' || value === 'practical') return value
  throw new SaaqError(400, 'invalid_kind', 'Choose the theory or practical attestation')
}

export function parseReason(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new SaaqError(400, 'reason_required', 'A reason is required')
  if (text.length > 500) throw new SaaqError(400, 'reason_too_long', 'Reason must be 500 characters or fewer')
  return text
}

export function parseReceivedOn(value: unknown, now = new Date()): string {
  if (typeof value !== 'string' || !isValidYmd(value)) {
    throw new SaaqError(400, 'invalid_date', 'Date received must be a real day, written YYYY-MM-DD')
  }
  if (isFutureYmd(value, now)) {
    throw new SaaqError(400, 'future_date', 'Date received cannot be in the future')
  }
  return value
}

export function assertUploadBytes(bytes: Buffer): SniffedType {
  if (bytes.length === 0) throw new SaaqError(400, 'empty_file', 'The file is empty')
  if (bytes.length > MAX_ATTESTATION_BYTES) {
    throw new SaaqError(400, 'file_too_large', 'File must be 10 MB or smaller')
  }
  const sniffed = sniffAttestation(bytes)
  if (!sniffed) {
    throw new SaaqError(400, 'unsupported_file', 'Upload a PDF, JPG, PNG, WebP, or HEIC file')
  }
  return sniffed
}

export function emptySlot(kind: AttestationKind) {
  return {
    kind,
    status: 'not_received' as const,
    receivedOn: null as string | null,
    current: null,
    history: [] as FileHistoryItem[],
    dateChanges: [] as DateChange[],
  }
}

export interface FileHistoryItem {
  id: string
  version: number
  originalName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  uploadedAt: string
  action: 'uploaded' | 'replaced' | 'removed'
  actionAt: string
  replaceReason: string | null
  deletedReason: string | null
  available: boolean
}

export interface DateChange {
  at: string
  before: string | null
  after: string | null
  reason: string
}
