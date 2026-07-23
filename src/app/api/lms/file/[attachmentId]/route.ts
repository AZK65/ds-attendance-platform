import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { LMS_UPLOADS_DIR } from '@/lib/lms'
import { promises as fs } from 'fs'
import path from 'path'

// GET /api/lms/file/[attachmentId] — PUBLIC file bytes, addressed by the
// attachment's unguessable cuid. Unlike /api/lms/attachment/[id] (session-
// gated), this has no auth so third-party document viewers (Microsoft Office
// Online, Google Docs) can fetch a PowerPoint/PDF to render it in-browser.
// Course material only; the id is effectively unguessable.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params
  const att = await prisma.lmsAttachment.findUnique({ where: { id: attachmentId } })
  if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const safe = path.basename(att.path)
    const file = await fs.readFile(path.join(LMS_UPLOADS_DIR, safe))
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': att.mimetype || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${att.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File missing' }, { status: 404 })
  }
}
