import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getLmsAccount, logLmsEvent } from '@/lib/lms'

// GET /api/lms/lesson/[lessonId] — full lesson content + records a view.
export async function GET(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  const { lessonId } = await params

  const lesson = await prisma.lmsLesson.findUnique({
    where: { id: lessonId },
    include: {
      section: { select: { title: true, vehicleType: true } },
      attachments: { select: { id: true, filename: true, mimetype: true, size: true } },
    },
  })
  if (!lesson || lesson.section.vehicleType !== account.vehicleType) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  // Record the view (first + last) — progress row is the source of truth.
  const existing = await prisma.lmsProgress.findUnique({
    where: { accountId_lessonId: { accountId: account.id, lessonId } },
  })
  if (existing) {
    await prisma.lmsProgress.update({ where: { id: existing.id }, data: { lastViewedAt: new Date() } })
  } else {
    await prisma.lmsProgress.create({ data: { accountId: account.id, lessonId } })
  }
  logLmsEvent(account.id, 'lesson_view', lesson.title)

  return NextResponse.json({
    id: lesson.id,
    title: lesson.title,
    sectionTitle: lesson.section.title,
    contentHtml: lesson.contentHtml,
    videoUrl: lesson.videoUrl,
    attachments: lesson.attachments,
    completed: existing?.completed || false,
  })
}

// POST /api/lms/lesson/[lessonId] { completed: true } — mark complete/incomplete
export async function POST(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))
  const completed = !!body?.completed

  await prisma.lmsProgress.upsert({
    where: { accountId_lessonId: { accountId: account.id, lessonId } },
    create: { accountId: account.id, lessonId, completed, completedAt: completed ? new Date() : null },
    update: { completed, completedAt: completed ? new Date() : null, lastViewedAt: new Date() },
  })
  if (completed) logLmsEvent(account.id, 'lesson_complete', lessonId)
  return NextResponse.json({ success: true })
}
