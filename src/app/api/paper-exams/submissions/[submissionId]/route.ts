import { NextRequest, NextResponse } from 'next/server'
import { gradePaperExamSubmission, saveReviewedPaperExamAnswers } from '@/lib/paper-exam-grading'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
