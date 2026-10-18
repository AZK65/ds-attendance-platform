import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { PAPER_EXAM_DIR } from '@/lib/paper-exam'
import { buildMarkedPaperExamPage } from '@/lib/paper-exam-marking'
import { parseStoredPaperExamResult, paperExamResultIsVerified } from '@/lib/paper-exam-result'
import { paperExamRecheckReason } from '@/lib/paper-exam-roster'

export type PaperExamDownloadVariant = 'original' | 'marked'

interface DownloadPage {
  id: string
  pageNumber: number
  mimetype: string
  filename: string | null
  filePath: string
}

export interface PaperExamDownloadSubmission {
  studentName: string
  phone: string
  status: string
  score: number | null
  totalQuestions: number | null
  passed: boolean | null
  confidence: number | null
  error: string | null
  extractedAnswers: string | null
  receivedAt: Date
  session: { title: string; groupName: string; passingScore: number | null }
  pages: DownloadPage[]
}

export interface PaperExamSummaryRow {
  name: string
  phone: string
  roster: 'Student' | 'Unmatched photo'
  status: string
  grade: string
  result: string
  verified: 'Yes' | 'No'
  recheck: 'Yes' | 'No'
  recheckReason: string
  pages: number
  received: string
  file: string
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792

function safePart(value: string | null | undefined, fallback: string) {
  return (value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback
}

function pdfText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeStoredPath(filePath: string) {
  const root = path.resolve(PAPER_EXAM_DIR)
  const resolved = path.resolve(filePath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Invalid exam page path')
  return resolved
}

export function formatExamPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return phone ? `+${phone.replace(/\D/g, '')}` : 'Unknown number'
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export function formatExamTimestamp(value: Date) {
  return value.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function paperExamGradeText(input: {
  score: number | null
  totalQuestions: number | null
  passed: boolean | null
}) {
  if (input.score === null || input.totalQuestions === null) return 'Not graded'
  const percentage = input.totalQuestions > 0 ? Math.round((input.score / input.totalQuestions) * 100) : 0
  const result = input.passed === true ? 'PASS' : input.passed === false ? 'NOT PASSED' : 'UNCONFIRMED'
  return `${input.score}/${input.totalQuestions} (${percentage}%) ${result}`
}

export function paperExamDownloadFilename(input: {
  studentName: string
  examTitle: string
  score: number | null
  totalQuestions: number | null
  passed: boolean | null
  recheck: boolean
}) {
  const name = safePart(input.studentName, 'student')
  const exam = safePart(input.examTitle, 'exam')
  if (input.recheck && (input.score === null || input.totalQuestions === null)) return `${name}-${exam}-RECHECK.pdf`
  if (input.score === null || input.totalQuestions === null) return `${name}-${exam}-overview.pdf`
  const result = input.recheck
    ? 'RECHECK'
    : input.passed === true
      ? 'PASS'
      : input.passed === false
        ? 'NOT-PASSED'
        : 'UNCONFIRMED'
  return `${name}-${exam}-${input.score}-${input.totalQuestions}-${result}.pdf`
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = pdfText(text).split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

function questionList(values: number[]) {
  return [...values].sort((a, b) => a - b).map(question => `Q${question}`).join(', ') || 'None'
}

async function embedPhoto(doc: PDFDocument, bytes: Buffer, mimetype: string) {
  const type = mimetype.toLowerCase()
  if (type.includes('png')) {
    const png = await sharp(bytes, { failOn: 'none' }).rotate().png().toBuffer()
    return doc.embedPng(png)
  }
  const jpeg = await sharp(bytes, { failOn: 'none' }).rotate().jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer()
  return doc.embedJpg(jpeg)
}

function drawFooter(page: PDFPage, font: PDFFont, text: string) {
  page.drawText(pdfText(text).slice(0, 110), {
    x: 36,
    y: 18,
    size: 8,
    font,
    color: rgb(0.35, 0.38, 0.42),
  })
}

export async function buildStudentExamPdf(
  submission: PaperExamDownloadSubmission,
  variant: PaperExamDownloadVariant,
) {
  const result = parseStoredPaperExamResult(submission.extractedAnswers)
  const verified = paperExamResultIsVerified(submission.extractedAnswers)
  if (variant === 'marked' && !verified) {
    throw new Error('Staff must confirm the AI grade before downloading the marked exam')
  }
  const uncertain = Array.isArray(result.uncertain) ? result.uncertain.filter(value => Number.isInteger(value)) : []
  const wrong = Array.isArray(result.wrong) ? result.wrong.filter(value => Number.isInteger(value)) : []
  const recheckReason = paperExamRecheckReason({
    status: submission.status,
    verified,
    uncertain,
    error: submission.error,
  })
  const grade = paperExamGradeText(submission)
  const filename = paperExamDownloadFilename({
    studentName: submission.studentName,
    examTitle: submission.session.title,
    score: submission.score,
    totalQuestions: submission.totalQuestions,
    passed: submission.passed,
    recheck: Boolean(recheckReason),
  })

  const doc = await PDFDocument.create()
  doc.setTitle(pdfText(`${submission.studentName} ${submission.session.title}`))
  doc.setAuthor('Qazi Driving School')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const ink = rgb(0.06, 0.09, 0.12)
  const muted = rgb(0.35, 0.39, 0.44)

  page.drawRectangle({ x: 0, y: 742, width: PAGE_WIDTH, height: 50, color: rgb(0.06, 0.09, 0.16) })
  page.drawText('Exam overview', { x: 36, y: 768, size: 18, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Qazi Driving School', { x: 36, y: 752, size: 9, font, color: rgb(0.8, 0.84, 0.9) })

  let y = 716
  const drawLine = (label: string, value: string) => {
    page.drawText(label, { x: 36, y, size: 9, font, color: muted })
    const lines = wrapText(value || '—', bold, 12, 360)
    lines.forEach((line, index) => {
      page.drawText(line, { x: 170, y: y - index * 15, size: 12, font: bold, color: ink })
    })
    y -= Math.max(22, lines.length * 15 + 8)
  }

  drawLine('Student', submission.studentName)
  drawLine('Phone', formatExamPhone(submission.phone))
  drawLine('Group', submission.session.groupName)
  drawLine('Exam', submission.session.title)
  drawLine('Received', formatExamTimestamp(submission.receivedAt))
  drawLine('Grade', grade)
  if (submission.session.passingScore && submission.totalQuestions) {
    drawLine('Pass mark', `${submission.session.passingScore}/${submission.totalQuestions}`)
  }
  drawLine('Result', submission.passed === true ? 'Passed' : submission.passed === false ? 'Not passed' : 'Not confirmed')
  drawLine('Staff verified', verified ? 'Yes' : 'No')
  drawLine('Incorrect', questionList(wrong))
  drawLine('Unclear answers', uncertain.length > 0 ? questionList(uncertain) : 'None')

  y -= 6
  if (recheckReason) {
    const lines = wrapText(`Re-check: ${recheckReason}`, bold, 11, 520)
    const boxHeight = lines.length * 14 + 16
    page.drawRectangle({ x: 36, y: y - boxHeight + 12, width: 540, height: boxHeight, color: rgb(1, 0.97, 0.9), borderColor: rgb(0.85, 0.55, 0.1), borderWidth: 1 })
    lines.forEach((line, index) => {
      page.drawText(line, { x: 48, y: y - index * 14, size: 11, font: bold, color: rgb(0.45, 0.25, 0.05) })
    })
    y -= boxHeight + 8
  }

  const photoNote = variant === 'marked'
    ? 'The exam photo on the following page includes the grade overlay.'
    : 'The following page is the original exam photo. A grade overlay is added after staff verification.'
  const pageWord = submission.pages.length === 1 ? 'page' : 'pages'
  const attached = submission.pages.length === 0
    ? 'No exam photo was saved for this student.'
    : `${submission.pages.length} exam ${pageWord} follow. ${submission.pages.length === 1 ? photoNote : 'Each exam photo follows this overview.'}`
  for (const line of wrapText(attached, font, 10, 540)) {
    page.drawText(line, { x: 36, y, size: 10, font, color: muted })
    y -= 14
  }
  if (submission.confidence !== null && !verified) {
    page.drawText(pdfText(`AI confidence ${Math.round(submission.confidence * 100)}%.`), {
      x: 36, y: y - 2, size: 10, font, color: muted,
    })
  }
  page.drawText(pdfText(grade), { x: 330, y: 762, size: 10, font: bold, color: rgb(1, 1, 1) })
  drawFooter(page, font, `${submission.studentName} · ${submission.session.title} · overview`)

  const notes: string[] = []
  for (const examPage of submission.pages) {
    try {
      if (variant === 'marked' && examPage.mimetype.startsWith('image/')) {
        try {
          const marked = await buildMarkedPaperExamPage(examPage.id, { requireVerified: true })
          const image = await doc.embedJpg(marked.bytes)
          const sheet = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
          const maxWidth = PAGE_WIDTH - 72
          const maxHeight = PAGE_HEIGHT - 72
          const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
          const width = image.width * scale
          const height = image.height * scale
          sheet.drawImage(image, {
            x: (PAGE_WIDTH - width) / 2,
            y: 40 + (maxHeight - height) / 2,
            width,
            height,
          })
          drawFooter(sheet, font, `${submission.studentName} · page ${examPage.pageNumber} · ${grade}`)
          continue
        } catch (error) {
          const message = error instanceof Error ? error.message : 'could not be marked'
          notes.push(`Page ${examPage.pageNumber} could not be marked (${message}). The original photo is included instead.`)
        }
      }

      const bytes = await fs.readFile(safeStoredPath(examPage.filePath))
      if (examPage.mimetype === 'application/pdf' || examPage.filename?.toLowerCase().endsWith('.pdf')) {
        const source = await PDFDocument.load(bytes)
        const copied = await doc.copyPages(source, source.getPageIndices())
        copied.forEach(copiedPage => doc.addPage(copiedPage))
        continue
      }
      if (!examPage.mimetype.startsWith('image/')) {
        notes.push(`Page ${examPage.pageNumber} is ${examPage.mimetype || 'an unsupported file'} and was left out of this PDF.`)
        continue
      }
      const image = await embedPhoto(doc, bytes, examPage.mimetype)
      const sheet = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      const margin = 36
      const maxWidth = PAGE_WIDTH - margin * 2
      const maxHeight = PAGE_HEIGHT - 72
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height)
      const width = image.width * scale
      const height = image.height * scale
      sheet.drawImage(image, {
        x: (PAGE_WIDTH - width) / 2,
        y: 40 + (maxHeight - height) / 2,
        width,
        height,
      })
      drawFooter(sheet, font, `${submission.studentName} · page ${examPage.pageNumber} · ${grade}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'could not be read'
      notes.push(`Page ${examPage.pageNumber} could not be included (${message}).`)
    }
  }

  if (notes.length > 0) {
    const notePage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    notePage.drawText('Pages that need a re-check', { x: 36, y: 740, size: 16, font: bold, color: ink })
    let noteY = 710
    for (const note of notes) {
      for (const line of wrapText(note, font, 11, 540)) {
        notePage.drawText(line, { x: 36, y: noteY, size: 11, font, color: ink })
        noteY -= 16
      }
      noteY -= 8
    }
  }

  const bytes = Buffer.from(await doc.save())
  return { bytes, filename, grade, recheckReason, verified }
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value)
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${guarded.replaceAll('"', '""')}"`
}

export function buildGradesCsv(rows: PaperExamSummaryRow[]) {
  const header = ['Student', 'Phone', 'Roster', 'Status', 'Grade', 'Result', 'Verified', 'Needs re-check', 'Re-check reason', 'Pages', 'Received', 'File']
  const lines = [
    header.map(csvCell).join(','),
    ...rows.map(row => [
      row.name,
      row.phone,
      row.roster,
      row.status,
      row.grade,
      row.result,
      row.verified,
      row.recheck,
      row.recheckReason,
      row.pages,
      row.received,
      row.file,
    ].map(csvCell).join(',')),
  ]
  return `${lines.join('\n')}\n`
}

export function buildRecheckSummary(input: {
  groupName: string
  examTitle: string
  generatedAt: Date
  missing: Array<{ name: string; phone: string }>
  recheck: Array<{ name: string; phone: string; reason: string; grade: string }>
  unverified: Array<{ name: string; phone: string; grade: string }>
  unmatched: Array<{ name: string; phone: string; pages: number }>
}) {
  const section = (title: string, lines: string[]) => [
    title,
    ...(lines.length > 0 ? lines : ['- None']),
    '',
  ]
  return [
    'Paper exam download',
    `Group: ${input.groupName}`,
    `Exam: ${input.examTitle}`,
    `Generated: ${formatExamTimestamp(input.generatedAt)}`,
    '',
    'Each student PDF starts with an overview (name, phone, grade, incorrect questions) and then the exam photo.',
    'grades.csv is the full mark list, including students with no exam.',
    'Group admins and the school WhatsApp number (514-274-6948) are not counted as missing students.',
    '',
    ...section(
      `MISSING — no matched exam (${input.missing.length})`,
      input.missing.map(student => `- ${student.name} — ${formatExamPhone(student.phone)}`),
    ),
    'Re-check this list before using the grades. A photo under UNMATCHED may belong to someone listed here.',
    '',
    ...section(
      `NEEDS RE-CHECK (${input.recheck.length})`,
      input.recheck.map(student => `- ${student.name} — ${formatExamPhone(student.phone)} — ${student.grade} — ${student.reason}`),
    ),
    ...section(
      `AI GRADE NOT STAFF-VERIFIED (${input.unverified.length})`,
      input.unverified.map(student => `- ${student.name} — ${formatExamPhone(student.phone)} — ${student.grade}`),
    ),
    ...section(
      `UNMATCHED PHOTOS (${input.unmatched.length})`,
      input.unmatched.map(student => `- ${student.name} — ${formatExamPhone(student.phone)} — ${student.pages} page(s)`),
    ),
  ].join('\n')
}
