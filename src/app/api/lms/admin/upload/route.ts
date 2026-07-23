import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { LMS_UPLOADS_DIR } from '@/lib/lms'
import { promises as fs } from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
  'image/png', 'image/jpeg', 'image/webp',
])
const MAX_BYTES = 40 * 1024 * 1024 // 40 MB

// This route is excluded from middleware (to allow large bodies), so it must
// gate itself: admin session cookie, or a localhost/no-referer internal call
// (same rule middleware applies elsewhere).
function isAdmin(request: NextRequest): boolean {
  if (request.cookies.get('auth-token')?.value === 'valid') return true
  if (request.headers.get('x-internal') === '1' && !request.headers.get('referer')) return true
  return false
}

// POST /api/lms/admin/upload — multipart form: lessonId, file. Stores the file
// under /app/data/lms-uploads and records an LmsAttachment row.
export async function POST(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const form = await request.formData()
    const lessonId = String(form.get('lessonId') || '')
    const file = form.get('file')
    if (!lessonId || !(file instanceof File)) {
      return NextResponse.json({ error: 'lessonId and file are required' }, { status: 400 })
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type || 'unknown'}` }, { status: 415 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 40 MB)' }, { status: 413 })
    }
    const lesson = await prisma.lmsLesson.findUnique({ where: { id: lessonId } })
    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    await fs.mkdir(LMS_UPLOADS_DIR, { recursive: true })
    const ext = path.extname(file.name).slice(0, 12)
    const stored = `${randomBytes(12).toString('hex')}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(path.join(LMS_UPLOADS_DIR, stored), buffer)

    const attachment = await prisma.lmsAttachment.create({
      data: {
        lessonId,
        filename: file.name.slice(0, 200),
        mimetype: file.type,
        size: file.size,
        path: stored,
      },
      select: { id: true, filename: true, mimetype: true, size: true },
    })

    // Render PowerPoint/PDF into per-slide images for the in-app deck viewer.
    // Best-effort: no-op if LibreOffice/poppler aren't installed.
    let slides = 0
    if (file.type === 'application/pdf' || /presentation|powerpoint/.test(file.type) || /\.(pptx?|pdf)$/i.test(file.name)) {
      try {
        const { convertToSlides } = await import('@/lib/lms-convert')
        const pngs = await convertToSlides(stored, file.type)
        if (pngs.length > 0) {
          // Replace any previous render for this lesson.
          await prisma.lmsSlide.deleteMany({ where: { lessonId } })
          await prisma.$transaction(pngs.map((p, i) =>
            prisma.lmsSlide.create({ data: { lessonId, order: i, path: p } })
          ))
          slides = pngs.length
        }
      } catch (e) {
        console.error('[lms upload] slide conversion failed:', e)
      }
    }

    return NextResponse.json({ attachment, slides })
  } catch (e) {
    console.error('[lms upload] error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// DELETE /api/lms/admin/upload { attachmentId } — remove file + row.
export async function DELETE(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const id = String(body?.attachmentId || '')
  if (!id) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 })
  const att = await prisma.lmsAttachment.findUnique({ where: { id } })
  if (att) {
    await fs.unlink(path.join(LMS_UPLOADS_DIR, path.basename(att.path))).catch(() => {})
    // If this was a slide source (pptx/pdf), remove its rendered slides too.
    if (/presentation|powerpoint|pdf/.test(att.mimetype) || /\.(pptx?|pdf)$/i.test(att.filename)) {
      const slides = await prisma.lmsSlide.findMany({ where: { lessonId: att.lessonId } })
      for (const s of slides) await fs.unlink(path.join(LMS_UPLOADS_DIR, path.basename(s.path))).catch(() => {})
      await prisma.lmsSlide.deleteMany({ where: { lessonId: att.lessonId } })
    }
    await prisma.lmsAttachment.delete({ where: { id } }).catch(() => {})
  }
  return NextResponse.json({ success: true })
}
