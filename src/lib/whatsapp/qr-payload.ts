/** Never render the fork's malformed `...,undefined` pairing payloads. */
export function isValidWhatsAppQr(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parts = value.split(',')
  return parts.length === 5 && parts.every(part => part.length > 0 && part !== 'undefined' && part !== 'null')
}
