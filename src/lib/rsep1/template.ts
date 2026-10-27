import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'

export const RSEP1_TEMPLATE_SHA256 = '94962684910584c897c63fe7d3aa835eb17653d75329e57a5766a3e12e12c874'
export const RSEP1_TEMPLATE_VERSION = 'rsep1-en-2025-12'
export const RSEP1_TEMPLATE_FILENAME = 'saaq-rsep-1-results-sheet-en.pdf'

export function rsep1TemplatePath() {
  return path.join(process.cwd(), 'public', 'forms', RSEP1_TEMPLATE_FILENAME)
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

let cached: Buffer | null = null

/** Load the committed original. Refuses to continue if a byte has changed. */
export function loadRsep1Template(): Buffer {
  if (cached && hashBytes(cached) === RSEP1_TEMPLATE_SHA256) return cached
  const bytes = readFileSync(rsep1TemplatePath())
  const hash = hashBytes(bytes)
  if (hash !== RSEP1_TEMPLATE_SHA256) {
    throw new Error(`RSEP-1 template changed (sha256 ${hash})`)
  }
  cached = bytes
  return bytes
}
