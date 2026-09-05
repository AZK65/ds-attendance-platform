import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib'
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

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 10, width: PAGE_WIDTH, height: 10, color: red })
  page.drawText('QAZI DRIVING SCHOOL', { x: LEFT, y: PAGE_HEIGHT - 34, size: 8.5, font: bold, color: ink })
  page.drawText(labels.page, {
    x: PAGE_WIDTH - RIGHT - 150,
    y: PAGE_HEIGHT - 34,
    size: 7.5,
    font: regular,
    color: muted,
  })
  page.drawLine({ start: { x: LEFT, y: PAGE_HEIGHT - 43 }, end: { x: PAGE_WIDTH - RIGHT, y: PAGE_HEIGHT - 43 }, thickness: 0.6, color: line })

  const drawWrappedAt = (text: string, options: {
    x: number
    y: number
    width: number
    font?: PDFFont
    size?: number
    color?: ReturnType<typeof rgb>
    gapAfter?: number
    lineHeight?: number
  }) => {
    const font = options.font || regular
    const size = options.size || 9.2
    const lineHeight = options.lineHeight || size * 1.36
    const lines = wrapText(text, font, size, options.width)
    let nextY = options.y
    for (const textLine of lines) {
      page.drawText(textLine, { x: options.x, y: nextY, size, font, color: options.color || ink })
      nextY -= lineHeight
    }
    return nextY - (options.gapAfter ?? 7)
  }

  const compactSize = french ? 8.8 : 9
  const compactLine = french ? 10.7 : 10.9
  const columnGap = 20
  const columnWidth = (CONTENT_WIDTH - columnGap) / 2
  const drawSection = (x: number, y: number, title: string, body: string) => {
    let nextY = drawWrappedAt(title, {
      x, y, width: columnWidth, font: bold, size: 9.8, gapAfter: 3, lineHeight: 11.3,
    })
    nextY = drawWrappedAt(body, {
      x, y: nextY, width: columnWidth, size: compactSize, gapAfter: 6, lineHeight: compactLine,
    })
    return nextY
  }

  page.drawText(safeText(input.snapshot.terms.title), { x: LEFT, y: 716, size: 20, font: bold, color: ink })
  page.drawText(safeText(input.snapshot.terms.subtitle), { x: LEFT, y: 694, size: 10, font: regular, color: muted })

  const boxTop = 680
  page.drawRectangle({ x: LEFT, y: boxTop - 50, width: CONTENT_WIDTH, height: 54, color: rgb(0.96, 0.96, 0.97), borderColor: line, borderWidth: 0.6 })
  page.drawText(labels.student, { x: LEFT + 11, y: boxTop - 10, size: 7.3, font: bold, color: muted })
  page.drawText(safeText(input.studentName || '-').slice(0, 46), { x: LEFT + 11, y: boxTop - 24, size: 10.5, font: bold, color: ink })
  page.drawText(labels.contact, { x: LEFT + 270, y: boxTop - 10, size: 7.3, font: bold, color: muted })
  page.drawText(safeText([input.phone, input.email].filter(Boolean).join(' · ') || '-').slice(0, 54), { x: LEFT + 270, y: boxTop - 24, size: 8.8, font: regular, color: ink })
  page.drawText(labels.accepted, { x: LEFT + 11, y: boxTop - 41, size: 7.3, font: bold, color: muted })
  page.drawText(safeText(displayDate(input.snapshot.acceptedAt, input.snapshot.language)), { x: LEFT + 82, y: boxTop - 41, size: 8.2, font: regular, color: ink })
  page.drawText(`${labels.version} ${input.snapshot.version}`, { x: LEFT + 370, y: boxTop - 41, size: 7.3, font: bold, color: muted })

  let introY = boxTop - 66
  introY = drawWrappedAt(input.snapshot.terms.p1, {
    x: LEFT, y: introY, width: CONTENT_WIDTH, size: 9, lineHeight: 10.9, gapAfter: 4,
  })
  introY = drawWrappedAt(input.snapshot.terms.p2, {
    x: LEFT, y: introY, width: CONTENT_WIDTH, size: 9, lineHeight: 10.9, gapAfter: 4,
  })
  introY = drawWrappedAt(input.snapshot.terms.feeIntro, {
    x: LEFT, y: introY, width: CONTENT_WIDTH, font: bold, size: 9, lineHeight: 10.9, gapAfter: 9,
  })

  page.drawLine({ start: { x: LEFT, y: introY + 3 }, end: { x: PAGE_WIDTH - RIGHT, y: introY + 3 }, thickness: 0.5, color: line })
  const columnTop = introY - 8
  const rightX = LEFT + columnWidth + columnGap
  let leftY = drawSection(LEFT, columnTop, input.snapshot.terms.s1Title, input.snapshot.terms.s1)
  leftY = drawSection(LEFT, leftY, input.snapshot.terms.s2Title, input.snapshot.terms.s2)
  leftY = drawSection(LEFT, leftY, input.snapshot.terms.s3Title, input.snapshot.terms.s3a)
  for (const item of input.snapshot.terms.s3b) {
    leftY = drawWrappedAt(`- ${item}`, {
      x: LEFT + 8, y: leftY, width: columnWidth - 8, size: compactSize, gapAfter: 2, lineHeight: compactLine,
    })
  }

  let rightY = drawSection(rightX, columnTop, input.snapshot.terms.s4Title, input.snapshot.terms.s4)
  rightY = drawSection(rightX, rightY, input.snapshot.terms.s5Title, input.snapshot.terms.s5)
  rightY = drawSection(rightX, rightY, input.snapshot.terms.s6Title, input.snapshot.terms.s6)

  if (input.snapshot.truckConsents?.length) {
    rightY = drawWrappedAt(labels.consents, {
      x: rightX, y: rightY - 1, width: columnWidth, font: bold, size: 9.8, gapAfter: 4, lineHeight: 11.3,
    })
    for (const consent of input.snapshot.truckConsents) {
      const boxY = rightY - 1
      page.drawRectangle({ x: rightX, y: boxY - 7, width: 8, height: 8, borderColor: ink, borderWidth: 0.6, color: consent.accepted ? ink : rgb(1, 1, 1) })
      if (consent.accepted) page.drawText('X', { x: rightX + 1.2, y: boxY - 6.2, size: 6.2, font: bold, color: rgb(1, 1, 1) })
      rightY = drawWrappedAt(`${consent.title}. ${consent.body}`, {
        x: rightX + 13, y: rightY, width: columnWidth - 13, size: 8.1, gapAfter: 4, lineHeight: 9.7,
      })
    }
  }

  let footerY = Math.min(leftY, rightY) - 3
  page.drawLine({ start: { x: LEFT, y: footerY }, end: { x: PAGE_WIDTH - RIGHT, y: footerY }, thickness: 0.5, color: line })
  footerY -= 13
  footerY = drawWrappedAt(labels.acknowledgements, {
    x: LEFT, y: footerY, width: CONTENT_WIDTH, font: bold, size: 9.8, gapAfter: 5, lineHeight: 11.2,
  })
  for (const statement of input.snapshot.acceptanceStatements) {
    page.drawRectangle({ x: LEFT, y: footerY - 7, width: 8, height: 8, color: ink })
    page.drawText('X', { x: LEFT + 1.2, y: footerY - 6.2, size: 6.2, font: bold, color: rgb(1, 1, 1) })
    footerY = drawWrappedAt(statement, {
      x: LEFT + 13, y: footerY, width: CONTENT_WIDTH - 13, size: 8.4, gapAfter: 3, lineHeight: 9.9,
    })
  }

  let signatureDrawn = false
  if (input.signatureImage) {
    try {
      const match = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i.exec(input.signatureImage)
      if (match) {
        const bytes = Buffer.from(match[2], 'base64')
        const image = match[1].toLowerCase() === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
        const scale = Math.min(175 / image.width, 24 / image.height)
        page.drawImage(image, { x: LEFT, y: footerY - image.height * scale, width: image.width * scale, height: image.height * scale })
        footerY -= image.height * scale
        signatureDrawn = true
      }
    } catch { /* draw a signature-on-file line below */ }
  }
  page.drawLine({ start: { x: LEFT, y: footerY - 3 }, end: { x: LEFT + 240, y: footerY - 3 }, thickness: 0.6, color: ink })
  page.drawText(signatureDrawn ? labels.signature : labels.signatureOnFile, { x: LEFT, y: footerY - 14, size: 7.2, font: regular, color: muted })
  page.drawText(safeText(displayDate(input.snapshot.acceptedAt, input.snapshot.language)), { x: LEFT + 300, y: footerY, size: 8.1, font: regular, color: ink })
  page.drawLine({ start: { x: LEFT + 300, y: footerY - 3 }, end: { x: PAGE_WIDTH - RIGHT, y: footerY - 3 }, thickness: 0.6, color: ink })
  page.drawText(labels.date, { x: LEFT + 300, y: footerY - 14, size: 7.2, font: regular, color: muted })

  if (input.isLegacy) {
    drawWrappedAt(labels.legacy, {
      x: LEFT, y: footerY - 28, width: CONTENT_WIDTH, size: 6.8,
      color: muted,
      gapAfter: 0,
      lineHeight: 8.1,
    })
  }

  page.drawText('Qazi Driving School · qazidrivingschool.ca', {
    x: LEFT, y: BOTTOM - 20, size: 5.8, font: regular, color: muted,
  })

  return Buffer.from(await doc.save())
}
