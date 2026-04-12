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

    // Fetch group members to show who hasn't started
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId: exam.groupId },
      include: { contact: true },
    })
    // Filter out the admin/owner
    const studentMembers = groupMembers.filter(m => {
      const phone = m.phone
      // Skip the school's own number
      return !m.contact.name?.toLowerCase().includes('qazi driving') && phone !== '15142746948'
    })

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

    // Find group members who haven't started the exam
    const startedNames = new Set(exam.attempts.map(a => a.studentName.toLowerCase()))
    const startedPhones = new Set(exam.attempts.map(a => a.studentPhone).filter(Boolean))
    const notStarted = studentMembers
      .filter(m => {
        const name = (m.contact.name || m.contact.pushName || '').toLowerCase()
        return !startedNames.has(name) && !startedPhones.has(m.phone)
      })
      .map(m => ({
        name: m.contact.name || m.contact.pushName || m.phone,
        phone: m.phone,
      }))

    return NextResponse.json({
      exam: {
        id: exam.id,
        code: exam.code,
        groupName: exam.groupName,
        active: exam.active,
        createdAt: exam.createdAt,
      },
      students,
      notStarted,
      groupTotal: studentMembers.length,
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
