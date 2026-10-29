// The Class 1 contract date and the student signature date are the Montréal
// calendar day the student signed. That timestamp is StudentRegistration
// submittedAt, then termsAcceptedAt. Today is used only when the contract is
// unsigned and neither timestamp is stored. This does not write anything.

const MONTREAL = 'America/Toronto'

export interface Class1SigningRecord {
  signatureImage?: string | null
  submittedAt?: Date | string | null
  termsAcceptedAt?: Date | string | null
}

export function class1StudentSignedAt(record: Class1SigningRecord, now: Date = new Date()): Date | null {
  const stored = coerceDate(record.submittedAt) ?? coerceDate(record.termsAcceptedAt)
  if (stored) return stored
  // A signature without a timestamp does not establish when it was signed.
  if (record.signatureImage) return null
  return now
}

/** Long date in America/Toronto, e.g. "3 août 2026" or "August 3, 2026". */
export function formatContractDate(value: Date | null, lang: 'en' | 'fr'): string {
  if (!value) return ''
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-US', {
    timeZone: MONTREAL,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(value)
}

function coerceDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}
