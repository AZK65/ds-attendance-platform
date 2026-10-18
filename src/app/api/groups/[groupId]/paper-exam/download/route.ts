import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import JSZip from 'jszip'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { PAPER_EXAM_DIR } from '@/lib/paper-exam'
import { buildMarkedPaperExamPage } from '@/lib/paper-exam-marking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

function safePart(value: string | null | undefined, fallback: string) {
  return (value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback
}

function safeStoredPath(filePath: string) {
  const root = path.resolve(PAPER_EXAM_DIR)
  const resolved = path.resolve(filePath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Invalid exam page path')
  return resolved
}

async function originalPageAsJpegs(filePath: string, mimetype: string) {
  const sourcePath = safeStoredPath(filePath)
  if (mimetype.startsWith('image/')) {
    const bytes = await sharp(await fs.readFile(sourcePath), { failOn: 'none' })
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer()
    return [bytes]
  }
  if (mimetype !== 'application/pdf') return []

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'qazi-paper-exam-'))
  try {
    const outputPrefix = path.join(tempDirectory, 'page')
    await execFileAsync('pdftoppm', ['-jpeg', '-r', '160', sourcePath, outputPrefix], { timeout: 60_000 })
    const files = (await fs.readdir(tempDirectory)).filter(file => file.endsWith('.jpg')).sort()
    return await Promise.all(files.map(file => fs.readFile(path.join(tempDirectory, file))))
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {})
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const { groupId } = await params
    const decodedGroupId = decodeURIComponent(groupId)
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

    const session = await prisma.paperExamSession.findFirst({
      where: { id: sessionId, groupId: decodedGroupId },
      include: {
        submissions: {
          include: { pages: { orderBy: { pageNumber: 'asc' } } },
          orderBy: { studentName: 'asc' },
        },
      },
    })
    if (!session) return NextResponse.json({ error: 'Exam session not found' }, { status: 404 })

    const zip = new JSZip()

    for (const submission of session.submissions) {
      const gradePart = submission.score === null || submission.totalQuestions === null
        ? 'not-graded'
        : `${submission.score}-of-${submission.totalQuestions}-${submission.passed ? 'pass' : 'not-passed'}`
      const baseName = `${safePart(submission.studentName, 'student')}-${safePart(session.title, 'exam')}-${gradePart}`
      for (const page of submission.pages) {
        if (page.mimetype.startsWith('image/') && submission.score !== null && submission.totalQuestions !== null) {
          const marked = await buildMarkedPaperExamPage(page.id)
          zip.file(`${baseName}-page-${page.pageNumber}.jpg`, marked.bytes)
        } else {
          const jpegPages = await originalPageAsJpegs(page.filePath, page.mimetype)
          jpegPages.forEach((bytes, index) => {
            const suffix = jpegPages.length > 1 ? `-${index + 1}` : ''
            zip.file(`${baseName}-page-${page.pageNumber}${suffix}.jpg`, bytes)
          })
        }
      }
    }

    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const filename = `${safePart(session.groupName, 'group')}-${safePart(session.title, 'exam')}-all-exams.zip`
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[PaperExam download all] Failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not download all exams' }, { status: 500 })
  }
}
