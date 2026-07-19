import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveLocalStudentId } from '@/lib/lms'

// GET /api/lms/admin/activity?studentId=|phone=|name=|licence= — everything a
// student has done on the LMS: account status, lesson progress, mock-exam
// attempts (with the questions they got wrong), and a raw activity timeline.
// Powers the LMS panel on the student profile.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const studentId = await resolveLocalStudentId({
    studentId: sp.get('studentId') || undefined,
    phone: sp.get('phone') || undefined,
    name: sp.get('name') || undefined,
    licence: sp.get('licence') || undefined,
  })
  if (!studentId) return NextResponse.json({ account: null })

  const account = await prisma.lmsAccount.findUnique({ where: { studentId } })
  if (!account) return NextResponse.json({ account: null })

  const [progress, attempts, events, totalLessons] = await Promise.all([
    prisma.lmsProgress.findMany({
      where: { accountId: account.id },
      orderBy: { lastViewedAt: 'desc' },
      include: { lesson: { select: { title: true, section: { select: { title: true } } } } },
    }),
    prisma.lmsExamAttempt.findMany({
      where: { accountId: account.id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
    prisma.lmsEvent.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.lmsLesson.count({ where: { section: { vehicleType: account.vehicleType } } }),
  ])

  // Resolve wrong-answer detail for each submitted attempt.
  const allQIds = [...new Set(attempts.flatMap(a => JSON.parse(a.questions) as string[]))]
  const questions = await prisma.lmsQuestion.findMany({ where: { id: { in: allQIds } } })
  const qById = new Map(questions.map(q => [q.id, q]))

  const attemptDetail = attempts.map(a => {
    const qIds: string[] = JSON.parse(a.questions)
    const answers: Record<string, number> = JSON.parse(a.answers || '{}')
    const wrong = a.submittedAt
      ? qIds
          .map(id => qById.get(id))
          .filter((q): q is NonNullable<typeof q> => !!q)
          .filter(q => answers[q.id] !== q.correctIndex)
          .map(q => {
            const opts = JSON.parse(q.options) as string[]
            const sel = answers[q.id]
            return {
              question: q.question,
              yourAnswer: sel != null && sel >= 0 ? opts[sel] : '(no answer)',
              correctAnswer: opts[q.correctIndex],
            }
          })
      : []
    return {
      id: a.id,
      score: a.score,
      total: a.total,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      wrong,
    }
  })

  const completedCount = progress.filter(p => p.completed).length

  return NextResponse.json({
    account: {
      username: account.username,
      vehicleType: account.vehicleType,
      createdAt: account.createdAt,
      lastLoginAt: account.lastLoginAt,
    },
    summary: {
      lessonsCompleted: completedCount,
      lessonsViewed: progress.length,
      totalLessons,
      examsTaken: attempts.filter(a => a.submittedAt).length,
      bestScore: attemptDetail.filter(a => a.total).reduce((best, a) => Math.max(best, (a.score ?? 0)), 0),
    },
    progress: progress.map(p => ({
      lesson: p.lesson.title,
      section: p.lesson.section.title,
      completed: p.completed,
      lastViewedAt: p.lastViewedAt,
    })),
    attempts: attemptDetail,
    events: events.map(e => ({ type: e.type, detail: e.detail, createdAt: e.createdAt })),
  })
}
