import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { TOTAL_QUESTIONS, EXAM_DURATION_MINUTES } from '@/lib/exam-questions'

// GET — Live exam status for monitoring dashboard
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        attempts: {
          orderBy: { startedAt: 'asc' },
        },
      },
    })

    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    const now = Date.now()
    const durationMs = EXAM_DURATION_MINUTES * 60 * 1000

    const students = exam.attempts.map(a => {
      const answers: Record<string, number> = JSON.parse(a.answers || '{}')
      const answeredCount = Object.keys(answers).length
      const elapsed = now - new Date(a.startedAt).getTime()
      const timeRemainingSeconds = a.submittedAt ? 0 : Math.max(0, Math.floor((durationMs - elapsed) / 1000))

      return {
        id: a.id,
        name: a.studentName,
        phone: a.studentPhone,
        answeredCount,
        totalQuestions: TOTAL_QUESTIONS,
        progress: Math.round((answeredCount / TOTAL_QUESTIONS) * 100),
        timeRemainingSeconds,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        score: a.score,
        passed: a.passed,
        timeExpired: a.timeExpired,
        tabSwitches: a.tabSwitches,
        status: a.submittedAt ? (a.passed ? 'passed' : 'failed') : 'in-progress',
      }
    })

    const inProgress = students.filter(s => !s.submittedAt).length
    const completed = students.filter(s => s.submittedAt).length
    const passedCount = students.filter(s => s.passed).length
    const failedCount = students.filter(s => s.submittedAt && !s.passed).length

    return NextResponse.json({
      exam: {
        id: exam.id,
        code: exam.code,
        groupName: exam.groupName,
        active: exam.active,
        createdAt: exam.createdAt,
      },
      students,
      summary: {
        total: students.length,
        inProgress,
        completed,
        passed: passedCount,
        failed: failedCount,
      },
    })
  } catch (error) {
    console.error('Error fetching exam status:', error)
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
  }
}
