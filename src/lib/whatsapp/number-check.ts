type NumberLookup = (phone: string) => Promise<{ _serialized: string } | null>

/** A lookup failure is not evidence that a number is unregistered. */
export async function lookupWhatsAppNumber(phone: string, lookup: NumberLookup, timeoutMs = 10_000): Promise<{ registered: boolean; jid?: string }> {
  const cleaned = phone.replace(/[^0-9]/g, '')
  const candidates = cleaned.length === 10 ? [`1${cleaned}`, cleaned] : [cleaned]
  let failed = false
  for (const candidate of candidates) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        lookup(candidate),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('WhatsApp number check timed out')), timeoutMs)
        }),
      ])
      if (result) {
        if (!result._serialized) throw new Error('Invalid WhatsApp lookup result')
        return { registered: true, jid: result._serialized }
      }
    } catch {
      failed = true
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  if (failed) throw new Error('WhatsApp could not verify this number. Please try again.')
  return { registered: false }
}
