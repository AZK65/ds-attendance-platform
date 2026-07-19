import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getLmsAccount } from '@/lib/lms'

// GET /api/lms/content — the logged-in student's course outline:
// sections → lessons (titles only) for their vehicleType, plus their
// per-lesson progress and mock-exam availability.
export async function GET(request: NextRequest) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const [sections, progress, questionCount, attempts] = await Promise.all([
    prisma.lmsSection.findMany({
      where: { vehicleType: account.vehicleType },
      orderBy: { order: 'asc' },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
          select: { id: true, title: true, videoUrl: true, _count: { select: { attachments: true } } },
        },
      },
    }),
    prisma.lmsProgress.findMany({ where: { accountId: account.id } }),
    prisma.lmsQuestion.count({ where: { vehicleType: account.vehicleType } }),
    prisma.lmsExamAttempt.findMany({
      where: { accountId: account.id, submittedAt: { not: null } },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { id: true, score: true, total: true, submittedAt: true },
    }),
  ])

  const progressByLesson = new Map(progress.map(p => [p.lessonId, p]))

  return NextResponse.json({
    name: account.student.name,
    vehicleType: account.vehicleType,
    sections: sections.map(s => ({
      id: s.id,
      title: s.title,
      lessons: s.lessons.map(l => ({
        id: l.id,
        title: l.title,
        hasVideo: !!l.videoUrl,
        attachmentCount: l._count.attachments,
        completed: progressByLesson.get(l.id)?.completed || false,
        viewed: progressByLesson.has(l.id),
      })),
    })),
    examAvailable: questionCount > 0,
    recentAttempts: attempts,
  })
}
