import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { prisma } from '@/lib/db'
import { PAPER_EXAM_DIR } from '@/lib/paper-exam'
import { gradePaperExamSubmission, saveReviewedPaperExamAnswers } from '@/lib/paper-exam-grading'
import { buildMarkedPaperExamPage } from '@/lib/paper-exam-marking'
import { paperExamResultIsVerified } from '@/lib/paper-exam-result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params
    const submission = await prisma.paperExamSubmission.findUnique({
      where: { id: decodeURIComponent(submissionId) },
      include: { session: true, pages: { orderBy: { pageNumber: 'asc' } } },
    })
    if (!submission) return NextResponse.json({ error: 'Exam submission not found' }, { status: 404 })

    const variant = request.nextUrl.searchParams.get('variant') === 'marked' ? 'marked' : 'original'
    if (variant === 'marked' && !paperExamResultIsVerified(submission.extractedAnswers)) {
      return NextResponse.json({ error: 'Confirm the AI grade before downloading the marked exam' }, { status: 409 })
    }
    const zip = new JSZip()
    for (const page of submission.pages) {
      if (variant === 'marked') {
        const marked = await buildMarkedPaperExamPage(page.id, { requireVerified: true })
        zip.file(marked.filename, marked.bytes)
      } else {
        const extension = path.extname(page.filename || '') || (page.mimetype.includes('png') ? '.png' : '.jpg')
        zip.file(`page-${page.pageNumber}${extension}`, await fs.readFile(safeStoredPath(page.filePath)))
      }
    }
    const grade = submission.score === null || submission.totalQuestions === null
      ? 'Not graded'
      : `${submission.score}/${submission.totalQuestions} (${submission.passed ? 'PASS' : 'NOT PASSED'})`
    zip.file('grade.txt', [
      `Student: ${submission.studentName}`,
      `Group: ${submission.session.groupName}`,
      `Exam: ${submission.session.title}`,
      `Grade: ${grade}`,
      `Staff verified: ${paperExamResultIsVerified(submission.extractedAnswers) ? 'Yes' : 'No'}`,
    ].join('\n'))

    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const filename = `${safePart(submission.studentName, 'student')}-${safePart(submission.session.title, 'exam')}-${variant}.zip`
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not download exam'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params
    const submission = await gradePaperExamSubmission(decodeURIComponent(submissionId))
    return NextResponse.json({ ok: true, submissionId: submission.id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not grade this exam' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const { submissionId } = await params
    const body = await request.json() as { answers?: unknown }
    const submission = await saveReviewedPaperExamAnswers(decodeURIComponent(submissionId), body.answers)
    return NextResponse.json({ ok: true, submissionId: submission.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save reviewed answers'
    return NextResponse.json({ error: message }, { status: message.includes('need review') ? 400 : 500 })
  }
}
