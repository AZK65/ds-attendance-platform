import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { PAPER_EXAM_DIR } from '@/lib/paper-exam'
import { parsePaperExamAnswerMap } from '@/lib/paper-exam-answer-keys'
import { paperExamResultIsVerified, parseStoredPaperExamResult } from '@/lib/paper-exam-result'

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function safePath(filePath: string) {
  const root = path.resolve(PAPER_EXAM_DIR)
  const resolved = path.resolve(filePath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid exam page path')
  }
  return resolved
}

function safeFilename(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'paper-exam'
}

export async function buildMarkedPaperExamPage(pageId: string, options?: { requireVerified?: boolean }) {
  const page = await prisma.paperExamPage.findUnique({
    where: { id: pageId },
    include: { submission: { include: { session: true } } },
  })
  if (!page) throw new Error('Exam page not found')
  if (!page.mimetype.startsWith('image/')) throw new Error('Only exam photos can be marked')

  const submission = page.submission
  if (submission.score === null || submission.totalQuestions === null || submission.passed === null) {
    throw new Error('This exam has not been graded yet')
  }
  const result = parseStoredPaperExamResult(submission.extractedAnswers)
  const verified = paperExamResultIsVerified(submission.extractedAnswers)
  if (options?.requireVerified && !verified) {
    throw new Error('Staff must confirm the AI grade before downloading the marked exam')
  }

  const answerKey = parsePaperExamAnswerMap(submission.session.answerKey)
  const answers = result.answers || {}
  const wrong = Array.isArray(result.wrong) ? result.wrong : []
  const uncertain = Array.isArray(result.uncertain) ? result.uncertain : []
  const wrongDetails = wrong.map(question => {
    const student = answers[String(question)] || 'blank'
    const correct = answerKey[String(question)] || '?'
    return `Q${question}: ${student} → ${correct}`
  })
  const unclearDetails = uncertain
    .filter(question => !wrong.includes(question))
    .map(question => `Q${question}: unclear`)
  const details = [...wrongDetails, ...unclearDetails]

  const normalized = await sharp(await fs.readFile(safePath(page.filePath)), { failOn: 'none' })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true })
  const width = normalized.info.width
  const baseHeight = normalized.info.height
  if (!width || !baseHeight) throw new Error('Could not read exam photo dimensions')

  const scale = Math.max(0.75, Math.min(2.2, width / 1200))
  const padding = Math.round(34 * scale)
  const titleSize = Math.round(30 * scale)
  const scoreSize = Math.round(54 * scale)
  const bodySize = Math.round(20 * scale)
  const lineHeight = Math.round(30 * scale)
  const availableTextWidth = Math.max(20, width - padding * 2)
  const approxCharacters = Math.max(22, Math.floor(availableTextWidth / (bodySize * 0.58)))
  const detailText = details.length > 0 ? details.join('   •   ') : 'No incorrect answers'
  const lines: string[] = []
  let remaining = detailText
  while (remaining.length > approxCharacters) {
    let splitAt = remaining.lastIndexOf('   •   ', approxCharacters)
    if (splitAt < Math.floor(approxCharacters * 0.55)) splitAt = remaining.lastIndexOf(' ', approxCharacters)
    if (splitAt <= 0) splitAt = approxCharacters
    lines.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).replace(/^\s*•?\s*/, '')
  }
  if (remaining.trim()) lines.push(remaining.trim())

  const bannerHeight = Math.max(Math.round(190 * scale), padding * 2 + scoreSize + titleSize + Math.max(1, lines.length) * lineHeight)
  const statusColor = submission.passed ? '#047857' : '#b91c1c'
  const statusBg = submission.passed ? '#ecfdf5' : '#fef2f2'
  const reviewLabel = verified ? 'STAFF VERIFIED' : 'AI DRAFT — VERIFY BEFORE USE'
  const reviewColor = verified ? '#166534' : '#92400e'
  const percentage = Math.round((submission.score / submission.totalQuestions) * 100)
  const detailNodes = lines.map((line, index) => (
    `<text x="${padding}" y="${Math.round(145 * scale) + index * lineHeight}" font-size="${bodySize}" font-family="Arial, Helvetica, sans-serif" fill="#334155">${escapeXml(line)}</text>`
  )).join('')

  const overlay = Buffer.from(`
    <svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect width="${Math.round(12 * scale)}" height="100%" fill="${statusColor}"/>
      <text x="${padding}" y="${Math.round(43 * scale)}" font-size="${titleSize}" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#0f172a">${escapeXml(submission.studentName)}</text>
      <text x="${width - padding}" y="${Math.round(38 * scale)}" text-anchor="end" font-size="${bodySize}" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${reviewColor}">${reviewLabel}</text>
      <rect x="${padding}" y="${Math.round(60 * scale)}" width="${Math.round(250 * scale)}" height="${Math.round(64 * scale)}" rx="${Math.round(12 * scale)}" fill="${statusBg}"/>
      <text x="${padding + Math.round(18 * scale)}" y="${Math.round(106 * scale)}" font-size="${scoreSize}" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="${statusColor}">${submission.score}/${submission.totalQuestions}</text>
      <text x="${padding + Math.round(270 * scale)}" y="${Math.round(91 * scale)}" font-size="${titleSize}" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${statusColor}">${submission.passed ? 'PASS' : 'NOT PASSED'} · ${percentage}%</text>
      ${detailNodes}
    </svg>
  `)

  const bytes = await sharp(normalized.data)
    .extend({ bottom: bannerHeight, background: '#ffffff' })
    .composite([{ input: overlay, top: baseHeight, left: 0 }])
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer()

  return {
    bytes,
    contentType: 'image/jpeg',
    filename: `${safeFilename(submission.studentName)}-${safeFilename(submission.session.title)}-page-${page.pageNumber}-marked.jpg`,
    verified,
  }
}
