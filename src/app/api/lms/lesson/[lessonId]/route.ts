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
      slides: { select: { id: true }, orderBy: { order: 'asc' } },
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
    type: lesson.lessonType,
    sectionTitle: lesson.section.title,
    contentHtml: lesson.contentHtml,
    videoUrl: lesson.videoUrl,
    attachments: lesson.attachments,
    slides: lesson.slides.map(s => s.id),
    completed: existing?.completed || false,
    notes: existing?.notes || '',
  })
}

// POST /api/lms/lesson/[lessonId]
//   { completed: boolean } — mark complete/incomplete
//   { notes: string }      — save the student's personal notes (autosave)
// Either field may be sent independently.
export async function POST(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  const { lessonId } = await params
  const body = await request.json().catch(() => ({}))

  const data: { completed?: boolean; completedAt?: Date | null; notes?: string; lastViewedAt: Date } = { lastViewedAt: new Date() }
  const create: { accountId: string; lessonId: string; completed?: boolean; completedAt?: Date | null; notes?: string } = { accountId: account.id, lessonId }

  if (typeof body?.completed === 'boolean') {
    data.completed = body.completed
    data.completedAt = body.completed ? new Date() : null
    create.completed = body.completed
    create.completedAt = body.completed ? new Date() : null
  }
  if (typeof body?.notes === 'string') {
    const notes = body.notes.slice(0, 20000)
    data.notes = notes
    create.notes = notes
  }

  await prisma.lmsProgress.upsert({
    where: { accountId_lessonId: { accountId: account.id, lessonId } },
    create,
    update: data,
  })
  if (body?.completed === true) logLmsEvent(account.id, 'lesson_complete', lessonId)
  return NextResponse.json({ success: true })
}
