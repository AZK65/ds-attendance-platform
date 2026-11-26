// Compare Class 5 contract and attestation (barcode) numbers without rewriting
// the text already stored on a certificate. Historical rows keep their spacing.

import {
  namesEqual,
  studentIdentityKind,
  type StudentIdentity,
} from '@/lib/student-match'

/**
 * Digits only, with leading zeros removed. "7 5 3", "753", and "00753" all
 * become "753". An empty result (including "0") is not a real number.
 * Letters are ignored so a display prefix cannot hide the same digits.
 */
export function normalizeCertificateNumber(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\D/g, '').replace(/^0+/, '')
}

export function certificateNumbersEqual(a: unknown, b: unknown): boolean {
  const left = normalizeCertificateNumber(a)
  const right = normalizeCertificateNumber(b)
  return left.length > 0 && left === right
}

/**
 * Keep the stored spelling when the incoming value is the same number.
 * A genuinely different number is stored as given. Null clears the field.
 */
export function keepStoredCertificateNumber(
  existing: string | null | undefined,
  incoming: string | null,
): string | null {
  if (incoming == null || normalizeCertificateNumber(incoming) === '') return incoming
  if (certificateNumbersEqual(existing, incoming)) return existing ?? incoming
  return incoming
}

export type CertificatePerson = StudentIdentity

export interface CertificateHolder {
  person: CertificatePerson
  contractNumber?: unknown
  attestationNumber?: unknown
}

export function countLocalNamesakes(rows: readonly { name?: string | null }[], name: string | null | undefined): number {
  if (!namesEqual(name, name)) return 0
  return rows.filter((row) => namesEqual(row.name, name)).length
}

/**
 * A holder of this number is this student when the licence matches, or the
 * full name and a phone match. The exact full name alone counts only when
 * one local row has that name. Several phone-less people with the same name
 * are not treated as one student, so they cannot take each other's numbers.
 */
export function holderBelongsToSubject(
  person: CertificatePerson,
  subject: CertificatePerson,
  localNamesakes: number,
): boolean {
  const kind = studentIdentityKind(person, subject)
  if (kind === 'licence' || kind === 'phone') return true
  return kind === 'name' && localNamesakes <= 1
}

/**
 * The local row may be updated only when it is this student. A shared phone
 * with a different name (a sibling) is never updated. Several phone-less rows
 * with the same full name are not updated either; the save creates a new row
 * instead of picking one of them.
 */
export function mayOverwriteLocalStudent(
  record: CertificatePerson,
  subject: CertificatePerson,
  localNamesakes: number,
): boolean {
  return holderBelongsToSubject(record, subject, localNamesakes)
}

function holdersFor(
  holders: readonly CertificateHolder[],
  field: 'contract' | 'barcode',
  normalized: string,
): CertificateHolder[] {
  return holders.filter((holder) => {
    const value = field === 'contract' ? holder.contractNumber : holder.attestationNumber
    return certificateNumbersEqual(value, normalized)
  })
}

/**
 * Null when these numbers are free, or already belong to this student
 * (a reprint, phase 1 then the full certificate, or an older number that
 * is already theirs — including a known duplicate that also sits on someone
 * else). Otherwise a sentence naming the number and the other student.
 */
export function certificateConflictMessage(input: {
  subject: CertificatePerson
  contractNumber?: unknown
  attestationNumber?: unknown
  holders: readonly CertificateHolder[]
  localNamesakes: number
}): string | null {
  const parts: string[] = []
  const checks: Array<{ field: 'barcode' | 'contract'; normalized: string }> = [
    { field: 'barcode', normalized: normalizeCertificateNumber(input.attestationNumber) },
    { field: 'contract', normalized: normalizeCertificateNumber(input.contractNumber) },
  ]
  for (const check of checks) {
    if (!check.normalized) continue
    const holders = holdersFor(
      input.holders,
      check.field === 'barcode' ? 'barcode' : 'contract',
      check.normalized,
    )
    if (holders.length === 0) continue
    const owned = holders.some((holder) => holderBelongsToSubject(holder.person, input.subject, input.localNamesakes))
    if (owned) continue
    const ownerName = (holders[0].person.name || '').trim() || 'another student'
    parts.push(
      check.field === 'barcode'
        ? `Barcode ${check.normalized} is already assigned to ${ownerName}.`
        : `Contract ${check.normalized} is already assigned to ${ownerName}.`,
    )
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/** A fresh stock number is taken when any certificate or roster row already uses it. */
export function numberAlreadyIssued(input: {
  contractNumber?: unknown
  attestationNumber?: unknown
  certificates: readonly { contractNumber?: unknown; attestationNumber?: unknown }[]
  roster: readonly { contract_number?: unknown; user_defined_contract_number?: unknown }[]
}): boolean {
  const contract = normalizeCertificateNumber(input.contractNumber)
  const barcode = normalizeCertificateNumber(input.attestationNumber)
  const contractTaken = (value: string) => input.certificates.some((row) => certificateNumbersEqual(row.contractNumber, value))
    || input.roster.some((row) => certificateNumbersEqual(row.user_defined_contract_number, value))
  const barcodeTaken = (value: string) => input.certificates.some((row) => certificateNumbersEqual(row.attestationNumber, value))
    || input.roster.some((row) => certificateNumbersEqual(row.contract_number, value))
  return (contract !== '' && contractTaken(contract)) || (barcode !== '' && barcodeTaken(barcode))
}

/** Per-student text for a failed certificate. A 409 reason is shown as-is. */
export function certificateFailureMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'PDF generation failed'
}
