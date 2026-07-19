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

// POST /api/lms/admin/upload — multipart form: lessonId, file. Stores the file
// under /app/data/lms-uploads and records an LmsAttachment row.
export async function POST(request: NextRequest) {
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
    return NextResponse.json({ attachment })
  } catch (e) {
    console.error('[lms upload] error:', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// DELETE /api/lms/admin/upload { attachmentId } — remove file + row.
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id = String(body?.attachmentId || '')
  if (!id) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 })
  const att = await prisma.lmsAttachment.findUnique({ where: { id } })
  if (att) {
    await fs.unlink(path.join(LMS_UPLOADS_DIR, path.basename(att.path))).catch(() => {})
    await prisma.lmsAttachment.delete({ where: { id } }).catch(() => {})
  }
  return NextResponse.json({ success: true })
}
