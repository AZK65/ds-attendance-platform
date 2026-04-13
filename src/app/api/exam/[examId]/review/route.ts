import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { MODULE_5_QUESTIONS } from '@/lib/exam-questions'

// GET /api/exam/[examId]/review?attemptId=xxx — Get full exam review with answers
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params
  const attemptId = request.nextUrl.searchParams.get('attemptId')

  if (!attemptId) {
    return NextResponse.json({ error: 'attemptId required' }, { status: 400 })
  }

  try {
    const attempt = await prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: { exam: true },
    })

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
    }

    const parsed = JSON.parse(attempt.exam.questionOrder)
    const questionIndices: number[] = Array.isArray(parsed) ? parsed : parsed.questions
    const optionOrders: number[][] | null = Array.isArray(parsed) ? null : parsed.options
    const studentAnswers: Record<string, number> = JSON.parse(attempt.answers || '{}')

    const review = questionIndices.map((qIdx, i) => {
      const q = MODULE_5_QUESTIONS[qIdx]
      const optOrder = optionOrders?.[i] || [0, 1, 2, 3]
      const shuffledOptions = optOrder.map(oi => q.options[oi])
      const correctShuffledIdx = optOrder.indexOf(q.correctAnswer)
      const studentAnswer = studentAnswers[String(i)]
      const isCorrect = studentAnswer !== undefined && optOrder[studentAnswer] === q.correctAnswer

      return {
        questionNumber: i + 1,
        question: q.question,
        image: q.image || null,
        options: shuffledOptions,
        studentAnswer: studentAnswer ?? null,
        correctAnswer: correctShuffledIdx,
        isCorrect,
      }
    })

    return NextResponse.json({
      studentName: attempt.studentName,
      score: attempt.score,
      passed: attempt.passed,
      totalQuestions: questionIndices.length,
      submittedAt: attempt.submittedAt,
      timeExpired: attempt.timeExpired,
      tabSwitches: attempt.tabSwitches,
      review,
    })
  } catch (error) {
    console.error('Error fetching exam review:', error)
    return NextResponse.json({ error: 'Failed to fetch review' }, { status: 500 })
  }
}
