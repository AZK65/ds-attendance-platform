import { phoneDigits, phoneLast10 } from './student-match'

export interface NormalizedPhone {
  /** 11-digit NANP number, country code included. Example: 15145460150 */
  digits: string
  last10: string
  /** +1 (514) 546-0150 */
  display: string
}

export function formatNorthAmericanPhone(digits: string): string {
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (national.length !== 10) return digits ? `+${digits}` : ''
  return `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
}

/**
 * North American numbers only. Stored values vary:
 * 15145460150, 5145460150, +1 (514) 546-0150, 15145460150@c.us.
 * Returns null when the value is not a usable NANP number.
 */
export function normalizeNorthAmericanPhone(input: string | null | undefined): NormalizedPhone | null {
  if (!input) return null
  const withoutJid = input.trim().replace(/@[A-Za-z0-9.]+$/, '')
  const digits = phoneDigits(withoutJid)
  let canonical = ''
  if (digits.length === 11 && digits.startsWith('1')) canonical = digits
  else if (digits.length === 10) canonical = `1${digits}`
  else return null

  const national = canonical.slice(1)
  const area = national.slice(0, 3)
  const exchange = national.slice(3, 6)
  // NANP area codes and exchanges do not start with 0 or 1.
  if (!/^[2-9]\d{2}$/.test(area) || !/^[2-9]\d{2}$/.test(exchange)) return null

  return {
    digits: canonical,
    last10: phoneLast10(canonical),
    display: formatNorthAmericanPhone(canonical),
  }
}

export function phoneJid(digits: string): string {
  return `${digits}@c.us`
}

/** Contact ids the app may already have stored for one number. */
export function phoneContactIds(digits: string): string[] {
  const normalized = normalizeNorthAmericanPhone(digits)
  const canonical = normalized?.digits ?? digits.replace(/\D/g, '')
  const last10 = canonical.length >= 10 ? canonical.slice(-10) : canonical
  const withCountry = canonical.length === 11 && canonical.startsWith('1') ? canonical : `1${last10}`
  return [...new Set([
    `${withCountry}@c.us`,
    `${last10}@c.us`,
    `${withCountry}@s.whatsapp.net`,
    `${last10}@s.whatsapp.net`,
  ])]
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeNorthAmericanPhone(a)
  const right = normalizeNorthAmericanPhone(b)
  if (left && right) return left.last10 === right.last10
  const leftDigits = phoneLast10(a)
  const rightDigits = phoneLast10(b)
  return leftDigits.length === 10 && leftDigits === rightDigits
}
