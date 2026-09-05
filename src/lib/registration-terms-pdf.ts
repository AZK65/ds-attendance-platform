import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { RegistrationTermsSnapshot } from './registration-terms'

export interface RegistrationTermsPdfInput {
  studentName: string
  phone?: string | null
  email?: string | null
  signatureImage?: string | null
  snapshot: RegistrationTermsSnapshot
  isLegacy?: boolean
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const LEFT = 46
const RIGHT = 46
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT
const BOTTOM = 46

function safeText(value: string) {
  return value
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const paragraphs = safeText(text).split('\n')
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate
      } else {
        if (line) lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    if (!words.length) lines.push('')
  }
  return lines
}

function displayDate(value: string, language: 'en' | 'fr') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export async function buildRegistrationTermsPdf(input: RegistrationTermsPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.055, 0.06, 0.075)
  const muted = rgb(0.39, 0.41, 0.46)
  const line = rgb(0.83, 0.84, 0.87)
  const red = rgb(0.88, 0.12, 0.14)
  const french = input.snapshot.language === 'fr'
  const labels = french
    ? {
        page: 'CONDITIONS D’INSCRIPTION', student: 'ÉLÈVE', contact: 'TÉLÉPHONE / COURRIEL',
        accepted: 'ACCEPTÉ LE', version: 'VERSION', consents: 'Consentements SAAQ - Classe 1',
        acknowledgements: 'Reconnaissances consignées', signature: 'Signature de l’élève',
        signatureOnFile: 'Signature de l’élève au dossier', date: 'Date d’acceptation',
        legacy: "Inscription antérieure : l’inscription complétée confirme l’acceptation, mais le texte original n’était pas conservé. Cette copie utilise les conditions actuellement conservées par le système d’inscription.",
      }
    : {
        page: 'REGISTRATION TERMS', student: 'STUDENT', contact: 'PHONE / EMAIL',
        accepted: 'ACCEPTED', version: 'VERSION', consents: 'Class 1 SAAQ consents',
        acknowledgements: 'Recorded acknowledgements', signature: 'Student signature',
        signatureOnFile: 'Student signature on file', date: 'Acceptance date',
        legacy: 'Legacy registration: the completed registration proves acceptance, but the original terms snapshot was not retained. This copy uses the terms currently retained by the registration system.',
      }

  let page!: PDFPage
  let y = 0
  let pageNumber = 0

  const addPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    pageNumber += 1
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 10, width: PAGE_WIDTH, height: 10, color: red })
    page.drawText('QAZI DRIVING SCHOOL', { x: LEFT, y: PAGE_HEIGHT - 34, size: 8.5, font: bold, color: ink })
    page.drawText(`${labels.page} · ${french ? 'PAGE' : 'PAGE'} ${pageNumber}`, {
      x: PAGE_WIDTH - RIGHT - 150,
      y: PAGE_HEIGHT - 34,
      size: 7.5,
      font: regular,
      color: muted,
    })
    page.drawLine({ start: { x: LEFT, y: PAGE_HEIGHT - 43 }, end: { x: PAGE_WIDTH - RIGHT, y: PAGE_HEIGHT - 43 }, thickness: 0.6, color: line })
    y = PAGE_HEIGHT - 66
  }

  const ensure = (height: number) => {
    if (y - height < BOTTOM) addPage()
  }

  const drawWrapped = (text: string, options: {
    font?: PDFFont
    size?: number
    color?: ReturnType<typeof rgb>
    indent?: number
    gapAfter?: number
    lineHeight?: number
  } = {}) => {
    const font = options.font || regular
    const size = options.size || 9.2
    const indent = options.indent || 0
    const lineHeight = options.lineHeight || size * 1.36
    const lines = wrapText(text, font, size, CONTENT_WIDTH - indent)
    for (const textLine of lines) {
      ensure(lineHeight)
      page.drawText(textLine, { x: LEFT + indent, y, size, font, color: options.color || ink })
      y -= lineHeight
    }
    y -= options.gapAfter ?? 7
  }

  const drawSection = (title: string, body: string) => {
    ensure(42)
    drawWrapped(title, { font: bold, size: 10.2, gapAfter: 4, lineHeight: 13 })
    drawWrapped(body, { size: 9.2, gapAfter: 10, lineHeight: 12.5 })
  }

  addPage()
  drawWrapped(input.snapshot.terms.title, { font: bold, size: 20, gapAfter: 4, lineHeight: 24 })
  drawWrapped(input.snapshot.terms.subtitle, { size: 10, color: muted, gapAfter: 16, lineHeight: 13 })

  ensure(90)
  page.drawRectangle({ x: LEFT, y: y - 64, width: CONTENT_WIDTH, height: 72, color: rgb(0.96, 0.96, 0.97), borderColor: line, borderWidth: 0.6 })
  page.drawText(labels.student, { x: LEFT + 12, y: y - 11, size: 7.5, font: bold, color: muted })
  page.drawText(safeText(input.studentName || '—'), { x: LEFT + 12, y: y - 26, size: 11.5, font: bold, color: ink })
  page.drawText(labels.contact, { x: LEFT + 270, y: y - 11, size: 7.5, font: bold, color: muted })
  page.drawText(safeText([input.phone, input.email].filter(Boolean).join(' · ') || '—'), { x: LEFT + 270, y: y - 26, size: 9.5, font: regular, color: ink })
  page.drawText(labels.accepted, { x: LEFT + 12, y: y - 45, size: 7.5, font: bold, color: muted })
  page.drawText(safeText(displayDate(input.snapshot.acceptedAt, input.snapshot.language)), { x: LEFT + 80, y: y - 45, size: 8.8, font: regular, color: ink })
  page.drawText(`${labels.version} ${input.snapshot.version}`, { x: LEFT + 350, y: y - 45, size: 7.5, font: bold, color: muted })
  y -= 84

  drawWrapped(input.snapshot.terms.p1, { gapAfter: 9 })
  drawWrapped(input.snapshot.terms.p2, { gapAfter: 9 })
  drawWrapped(input.snapshot.terms.feeIntro, { font: bold, gapAfter: 13 })
  drawSection(input.snapshot.terms.s1Title, input.snapshot.terms.s1)
  drawSection(input.snapshot.terms.s2Title, input.snapshot.terms.s2)
  drawSection(input.snapshot.terms.s3Title, input.snapshot.terms.s3a)
  for (const item of input.snapshot.terms.s3b) {
    drawWrapped(`- ${item}`, { indent: 12, size: 9, gapAfter: 3, lineHeight: 12 })
  }
  y -= 7
  drawSection(input.snapshot.terms.s4Title, input.snapshot.terms.s4)
  drawSection(input.snapshot.terms.s5Title, input.snapshot.terms.s5)
  drawSection(input.snapshot.terms.s6Title, input.snapshot.terms.s6)

  if (input.snapshot.truckConsents?.length) {
    ensure(60)
    drawWrapped(labels.consents, { font: bold, size: 13, gapAfter: 9, lineHeight: 16 })
    for (const consent of input.snapshot.truckConsents) {
      ensure(46)
      const boxY = y - 1
      page.drawRectangle({ x: LEFT, y: boxY - 8, width: 10, height: 10, borderColor: ink, borderWidth: 0.7, color: consent.accepted ? ink : rgb(1, 1, 1) })
      if (consent.accepted) page.drawText('X', { x: LEFT + 1.5, y: boxY - 7, size: 8, font: bold, color: rgb(1, 1, 1) })
      drawWrapped(`${consent.title}. ${consent.body}`, { indent: 18, size: 8.8, gapAfter: 9, lineHeight: 11.8 })
    }
  }

  ensure(125)
  drawWrapped(labels.acknowledgements, { font: bold, size: 13, gapAfter: 9, lineHeight: 16 })
  for (const statement of input.snapshot.acceptanceStatements) {
    ensure(30)
    page.drawRectangle({ x: LEFT, y: y - 8, width: 10, height: 10, color: ink })
    page.drawText('X', { x: LEFT + 1.5, y: y - 7, size: 8, font: bold, color: rgb(1, 1, 1) })
    drawWrapped(statement, { indent: 18, size: 9, gapAfter: 7, lineHeight: 12 })
  }

  let signatureDrawn = false
  if (input.signatureImage) {
    try {
      const match = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i.exec(input.signatureImage)
      if (match) {
        const bytes = Buffer.from(match[2], 'base64')
        const image = match[1].toLowerCase() === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
        const scale = Math.min(210 / image.width, 48 / image.height)
        page.drawImage(image, { x: LEFT, y: y - image.height * scale, width: image.width * scale, height: image.height * scale })
        y -= image.height * scale
        signatureDrawn = true
      }
    } catch { /* draw a signature-on-file line below */ }
  }
  page.drawLine({ start: { x: LEFT, y: y - 5 }, end: { x: LEFT + 240, y: y - 5 }, thickness: 0.7, color: ink })
  page.drawText(signatureDrawn ? labels.signature : labels.signatureOnFile, { x: LEFT, y: y - 18, size: 7.5, font: regular, color: muted })
  page.drawText(safeText(displayDate(input.snapshot.acceptedAt, input.snapshot.language)), { x: LEFT + 300, y: y - 2, size: 9, font: regular, color: ink })
  page.drawLine({ start: { x: LEFT + 300, y: y - 5 }, end: { x: PAGE_WIDTH - RIGHT, y: y - 5 }, thickness: 0.7, color: ink })
  page.drawText(labels.date, { x: LEFT + 300, y: y - 18, size: 7.5, font: regular, color: muted })

  if (input.isLegacy) {
    ensure(38)
    y -= 35
    drawWrapped(labels.legacy, {
      size: 7.5,
      color: muted,
      gapAfter: 0,
      lineHeight: 10,
    })
  }

  return Buffer.from(await doc.save())
}
