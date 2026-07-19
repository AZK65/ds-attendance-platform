import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Admin content management for the LMS. These routes sit under /api/lms/admin,
// which middleware keeps behind the admin password (NOT public like /api/lms).

// GET /api/lms/admin/content?vehicleType=car — full outline with lesson bodies
export async function GET(request: NextRequest) {
  const vehicleType = request.nextUrl.searchParams.get('vehicleType') === 'truck' ? 'truck' : 'car'
  const sections = await prisma.lmsSection.findMany({
    where: { vehicleType },
    orderBy: { order: 'asc' },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
        include: { attachments: { select: { id: true, filename: true, mimetype: true, size: true } } },
      },
    },
  })
  return NextResponse.json({ vehicleType, sections })
}

// POST — create a section or lesson.
// { kind: "section", vehicleType, title }
// { kind: "lesson", sectionId, title }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  if (body?.kind === 'section') {
    const vehicleType = body.vehicleType === 'truck' ? 'truck' : 'car'
    const max = await prisma.lmsSection.aggregate({ where: { vehicleType }, _max: { order: true } })
    const section = await prisma.lmsSection.create({
      data: { vehicleType, title: String(body.title || 'Untitled section').slice(0, 200), order: (max._max.order ?? -1) + 1 },
    })
    return NextResponse.json({ section })
  }
  if (body?.kind === 'lesson') {
    const sectionId = String(body.sectionId || '')
    if (!sectionId) return NextResponse.json({ error: 'sectionId required' }, { status: 400 })
    const max = await prisma.lmsLesson.aggregate({ where: { sectionId }, _max: { order: true } })
    const lesson = await prisma.lmsLesson.create({
      data: { sectionId, title: String(body.title || 'Untitled lesson').slice(0, 200), order: (max._max.order ?? -1) + 1 },
    })
    return NextResponse.json({ lesson })
  }
  return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
}

// PATCH — update a section or lesson.
// { kind: "section", id, title?, order? }
// { kind: "lesson", id, title?, contentHtml?, videoUrl?, order? }
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  if (body?.kind === 'section') {
    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string') data.title = body.title.slice(0, 200)
    if (typeof body.order === 'number') data.order = body.order
    await prisma.lmsSection.update({ where: { id: String(body.id) }, data })
    return NextResponse.json({ success: true })
  }
  if (body?.kind === 'lesson') {
    const data: Record<string, unknown> = {}
    if (typeof body.title === 'string') data.title = body.title.slice(0, 200)
    if (typeof body.contentHtml === 'string') data.contentHtml = body.contentHtml
    if (typeof body.videoUrl === 'string') data.videoUrl = body.videoUrl.trim() || null
    if (typeof body.order === 'number') data.order = body.order
    await prisma.lmsLesson.update({ where: { id: String(body.id) }, data })
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
}

// DELETE — remove a section (and its lessons) or a lesson.
// { kind: "section" | "lesson", id }
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (body?.kind === 'section') await prisma.lmsSection.delete({ where: { id } }).catch(() => {})
  else if (body?.kind === 'lesson') await prisma.lmsLesson.delete({ where: { id } }).catch(() => {})
  else return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
  return NextResponse.json({ success: true })
}
