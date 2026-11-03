import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { BRAND, logoHeightForWidth } from './brand'

export const LOGO_FILE = path.join(process.cwd(), 'public', 'qazi-logo.png')
export const EMAIL_LOGO_CONTENT_ID = 'qazi-logo'

export function readLogoBytes(): Buffer {
  return fs.readFileSync(LOGO_FILE)
}

export function logoDataUrl(): string | null {
  try {
    if (!fs.existsSync(LOGO_FILE)) return null
    return `data:image/png;base64,${readLogoBytes().toString('base64')}`
  } catch {
    return null
  }
}

export function emailLogoAttachment() {
  return {
    filename: 'qazi-logo.png',
    content: readLogoBytes().toString('base64'),
    content_id: EMAIL_LOGO_CONTENT_ID,
  }
}

type PdfDoc = InstanceType<typeof PDFDocument>

function drawStripe(doc: PdfDoc, height = 6) {
  const width = doc.page.width
  const third = width / 3
  doc.save()
  doc.rect(0, 0, third, height).fill(BRAND.blue)
  doc.rect(third, 0, third, height).fill(BRAND.red)
  doc.rect(third * 2, 0, width - third * 2, height).fill(BRAND.green)
  doc.restore()
}

/** Repeat the colour bar on pages after the first. Call before any addPage. */
export function usePdfKitChrome(doc: PdfDoc) {
  doc.on('pageAdded', () => drawStripe(doc))
}

/** First-page wordmark. Leaves the cursor under the logo and the fill colour on ink. */
export function drawPdfKitLetterhead(doc: PdfDoc, logoWidth = 150) {
  drawStripe(doc)
  const logoHeight = logoHeightForWidth(logoWidth)
  const x = (doc.page.width - logoWidth) / 2
  const y = 16
  if (fs.existsSync(LOGO_FILE)) {
    doc.image(LOGO_FILE, x, y, { width: logoWidth })
    doc.y = y + logoHeight + 10
  } else {
    doc.y = 36
  }
  doc.fillColor(BRAND.ink)
}
