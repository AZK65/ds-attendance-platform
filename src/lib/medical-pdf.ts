import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { MEDICAL_CONDITIONS } from './medical'

export interface MedicalDeclarationPdfInput {
  fullName: string
  dateOfBirth?: string | Date | null
  phone?: string | null
  permitNumber?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
  postalCode?: string | null
  medical: string
  signatureImage?: string | null
}

function displayDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }

  const clean = String(value).trim()
  if (!clean) return ''
  const date = new Date(clean)
  return Number.isNaN(date.getTime()) ? clean : date.toISOString().slice(0, 10)
}

type ParsedMedical = {
  conditions?: number[]
  none?: boolean
  attestedAt?: string | null
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxChars) {
      if (current) lines.push(current)
      current = word
    } else {
      current = `${current} ${word}`.trim()
    }
  }
  if (current) lines.push(current)
  return lines
}

function splitName(fullName: string) {
  const clean = fullName.trim()
  if (clean.includes(',')) {
    const [lastName, ...firstParts] = clean.split(',').map(part => part.trim())
    return { firstName: firstParts.join(' '), lastName }
  }
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length <= 1) return { firstName: clean, lastName: '' }
  return {
    firstName: words.slice(0, -1).join(' '),
    lastName: words.at(-1) || '',
  }
}

function parseMedical(medical: string): ParsedMedical {
  try {
    const parsed = JSON.parse(medical) as ParsedMedical
    return {
      conditions: Array.isArray(parsed.conditions)
        ? parsed.conditions.filter(value => Number.isInteger(value) && value >= 0 && value < MEDICAL_CONDITIONS.length)
        : [],
      none: !!parsed.none,
      attestedAt: parsed.attestedAt || null,
    }
  } catch {
    return {}
  }
}

function formatAttestedDate(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export async function buildMedicalDeclarationPdf(input: MedicalDeclarationPdfInput): Promise<Buffer> {
  const parsed = parseMedical(input.medical)
  const checked = new Set(parsed.conditions || [])
  const noneChecked = !!parsed.none
  const { firstName, lastName } = splitName(input.fullName)

  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.06, 0.07, 0.09)
  const muted = rgb(0.4, 0.42, 0.48)
  const blue = rgb(0.12, 0.25, 0.8)

  page.drawRectangle({ x: 0, y: 762, width: 612, height: 30, color: blue })
  page.drawText('Self-Declaration of Medical Information', {
    x: 36, y: 770, size: 14, font: bold, color: rgb(1, 1, 1),
  })
  page.drawText('SAAQ form 6224A · Student record copy', {
    x: 36, y: 745, size: 9, font, color: muted,
  })

  let y = 720
  const drawField = (label: string, value: string, x: number, width: number) => {
    page.drawText(label, { x, y, size: 8, font, color: muted })
    page.drawText(value || '—', { x, y: y - 14, size: 11, font, color: ink })
    page.drawLine({ start: { x, y: y - 18 }, end: { x: x + width, y: y - 18 }, thickness: 0.5, color: muted })
  }

  drawField('LAST NAME', lastName, 36, 250)
  drawField('FIRST NAME', firstName, 300, 250)
  y -= 40
  drawField('DATE OF BIRTH', displayDate(input.dateOfBirth), 36, 190)
  drawField('PHONE', input.phone || '', 240, 190)
  drawField('PERMIT NO.', input.permitNumber || '', 444, 130)
  y -= 40
  drawField('ADDRESS', input.address || '', 36, 540)
  y -= 40
  drawField('CITY', input.city || '', 36, 190)
  drawField('PROVINCE', input.province || 'QC', 240, 80)
  drawField('POSTAL CODE', input.postalCode || '', 340, 130)
  y -= 30

  page.drawText(
    'Per the Highway Safety Code, you must inform the SAAQ of any new health problem or deterioration of your',
    { x: 36, y, size: 9, font, color: ink },
  )
  page.drawText(
    'state of health that has not yet been reported. Check any boxes that apply.',
    { x: 36, y: y - 12, size: 9, font, color: ink },
  )
  y -= 32

  const columnWidth = 270
  const rowHeight = 26
  const conditionsStartY = y
  for (let index = 0; index < MEDICAL_CONDITIONS.length; index += 1) {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = 36 + column * (columnWidth + 10)
    const conditionY = conditionsStartY - row * rowHeight
    const isChecked = checked.has(index)

    page.drawRectangle({
      x, y: conditionY - 9, width: 10, height: 10,
      borderColor: ink, borderWidth: 0.6,
      color: isChecked ? blue : rgb(1, 1, 1),
    })
    if (isChecked) {
      page.drawText('X', { x: x + 1.5, y: conditionY - 8, size: 9, font: bold, color: rgb(1, 1, 1) })
    }

    const conditionNumber = String(index + 1).padStart(2, '0')
    const lines = wrap(`${conditionNumber}. ${MEDICAL_CONDITIONS[index]}`, 64)
    lines.slice(0, 3).forEach((line, lineIndex) => {
      page.drawText(line, { x: x + 14, y: conditionY - 1 - lineIndex * 8, size: 7.2, font, color: ink })
    })
  }
  y = conditionsStartY - Math.ceil(MEDICAL_CONDITIONS.length / 2) * rowHeight - 16

  page.drawRectangle({
    x: 36, y: y - 9, width: 10, height: 10,
    borderColor: ink, borderWidth: 0.6,
    color: noneChecked ? rgb(0.18, 0.66, 0.29) : rgb(1, 1, 1),
  })
  if (noneChecked) {
    page.drawText('X', { x: 37.5, y: y - 8, size: 9, font: bold, color: rgb(1, 1, 1) })
  }
  page.drawText(
    'I do not have any of the health problems listed above and I have no new health problem to declare.',
    { x: 50, y: y - 1, size: 9, font: bold, color: ink },
  )
  y -= 32

  page.drawText('I confirm that I have indicated the situation(s) concerning me.', {
    x: 36, y, size: 10, font, color: ink,
  })
  y -= 32

  let signatureDrawn = false
  if (input.signatureImage) {
    try {
      const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(input.signatureImage)
      if (match) {
        const bytes = Buffer.from(match[2], 'base64')
        const image = match[1].toLowerCase() === 'png'
          ? await doc.embedPng(bytes)
          : await doc.embedJpg(bytes)
        const width = 200
        const height = Math.min(48, (image.height / image.width) * width)
        page.drawImage(image, { x: 36, y: y - height, width, height })
        page.drawLine({ start: { x: 36, y: y - height - 4 }, end: { x: 236, y: y - height - 4 }, thickness: 0.5, color: muted })
        page.drawText('Signature', { x: 36, y: y - height - 18, size: 8, font, color: muted })
        signatureDrawn = true
      }
    } catch {
      signatureDrawn = false
    }
  }
  if (!signatureDrawn) {
    page.drawLine({ start: { x: 36, y: y - 30 }, end: { x: 250, y: y - 30 }, thickness: 0.5, color: muted })
    page.drawText(input.signatureImage ? '[Signature on file]' : 'Signature', {
      x: 36, y: y - 44, size: 8, font, color: muted,
    })
  }

  page.drawLine({ start: { x: 320, y: y - 30 }, end: { x: 520, y: y - 30 }, thickness: 0.5, color: muted })
  page.drawText(formatAttestedDate(parsed.attestedAt), { x: 320, y: y - 24, size: 11, font, color: ink })
  page.drawText('Date (YYYY-MM-DD)', { x: 320, y: y - 44, size: 8, font, color: muted })

  page.drawText('Generated for the student record by Qazi Driving School · saaq.gouv.qc.ca', {
    x: 36, y: 30, size: 7.5, font, color: muted,
  })

  return Buffer.from(await doc.save())
}
