import { promises as fs } from 'fs'
import path from 'path'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { PAPER_EXAM_DIR } from '@/lib/paper-exam'
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

  const wrong = Array.isArray(result.wrong) ? result.wrong : []
  const details = wrong.map(question => `Q${question}`)

  const normalized = await sharp(await fs.readFile(safePath(page.filePath)), { failOn: 'none' })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true })
  const width = normalized.info.width
  const baseHeight = normalized.info.height
  if (!width || !baseHeight) throw new Error('Could not read exam photo dimensions')

  const scale = Math.max(0.75, Math.min(2.2, width / 1200))
  const margin = Math.round(24 * scale)
  const padding = Math.round(24 * scale)
  const panelWidth = Math.min(width - margin * 2, Math.round(720 * scale))
  const titleSize = Math.round(24 * scale)
  const scoreSize = Math.round(48 * scale)
  const bodySize = Math.round(18 * scale)
  const lineHeight = Math.round(27 * scale)
  const availableTextWidth = Math.max(20, panelWidth - padding * 2)
  const approxCharacters = Math.max(22, Math.floor(availableTextWidth / (bodySize * 0.58)))
  const detailText = details.length > 0 ? details.join('  •  ') : 'None — all answers are correct.'
  const lines: string[] = []
  let remaining = detailText
  while (remaining.length > approxCharacters) {
    let splitAt = remaining.lastIndexOf('  •  ', approxCharacters)
    if (splitAt < Math.floor(approxCharacters * 0.55)) splitAt = remaining.lastIndexOf(' ', approxCharacters)
    if (splitAt <= 0) splitAt = approxCharacters
    lines.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).replace(/^\s*•?\s*/, '')
  }
  if (remaining.trim()) lines.push(remaining.trim())

  const panelHeight = Math.max(
    Math.round(178 * scale),
    padding * 2 + scoreSize + titleSize + Math.max(1, lines.length) * lineHeight,
  )
  const panelX = width - margin - panelWidth
  const panelY = margin
  const statusColor = submission.passed ? '#047857' : '#b91c1c'
  const reviewLabel = verified ? 'STAFF VERIFIED' : 'AI DRAFT — VERIFY BEFORE USE'
  const reviewColor = verified ? '#166534' : '#92400e'
  const percentage = Math.round((submission.score / submission.totalQuestions) * 100)
  const detailNodes = lines.map((line, index) => (
    `<text x="${panelX + padding}" y="${panelY + Math.round(132 * scale) + index * lineHeight}" font-size="${bodySize}" font-weight="600" font-family="Arial, Helvetica, sans-serif" fill="#0f172a">${escapeXml(line)}</text>`
  )).join('')

  const overlay = Buffer.from(`
    <svg width="${width}" height="${baseHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${panelX + Math.round(6 * scale)}" y="${panelY + Math.round(8 * scale)}" width="${panelWidth}" height="${panelHeight}" rx="${Math.round(18 * scale)}" fill="#000000" fill-opacity="0.22"/>
      <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="${Math.round(18 * scale)}" fill="#ffffff" fill-opacity="0.95" stroke="${statusColor}" stroke-width="${Math.round(4 * scale)}"/>
      <rect x="${panelX}" y="${panelY}" width="${Math.round(12 * scale)}" height="${panelHeight}" rx="${Math.round(6 * scale)}" fill="${statusColor}"/>
      <text x="${panelX + padding}" y="${panelY + Math.round(34 * scale)}" font-size="${titleSize}" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="#0f172a">${escapeXml(submission.studentName)}</text>
      <text x="${panelX + panelWidth - padding}" y="${panelY + Math.round(31 * scale)}" text-anchor="end" font-size="${Math.round(15 * scale)}" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="${reviewColor}">${reviewLabel}</text>
      <text x="${panelX + padding}" y="${panelY + Math.round(91 * scale)}" font-size="${scoreSize}" font-weight="900" font-family="Arial, Helvetica, sans-serif" fill="${statusColor}">${submission.score}/${submission.totalQuestions}</text>
      <text x="${panelX + padding + Math.round(180 * scale)}" y="${panelY + Math.round(76 * scale)}" font-size="${titleSize}" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="${statusColor}">${submission.passed ? 'PASS' : 'NOT PASSED'} · ${percentage}%</text>
      <text x="${panelX + padding}" y="${panelY + Math.round(116 * scale)}" font-size="${Math.round(15 * scale)}" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="#475569">INCORRECT QUESTIONS</text>
      ${detailNodes}
    </svg>
  `)

  const bytes = await sharp(normalized.data)
    .composite([{ input: overlay, top: 0, left: 0 }])
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
