import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { gradePaperExamSubmission, saveReviewedPaperExamAnswers } from '@/lib/paper-exam-grading'
import { buildStudentExamPdf } from '@/lib/paper-exam-download'
import { notifyPaperExamResult } from '@/lib/paper-exam-notification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    // One PDF, not a zip: page 1 is the grade overview and the following pages are the exam photos.
    const pdf = await buildStudentExamPdf(submission, variant)
    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.bytes.length),
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not download exam'
    const status = message.includes('confirm the AI grade') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
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
    const notification = await notifyPaperExamResult(submission.id)
    return NextResponse.json({ ok: true, submissionId: submission.id, notification })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save reviewed answers'
    const status = message.includes('need review') ? 400 : message.startsWith('Grade saved,') ? 502 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
