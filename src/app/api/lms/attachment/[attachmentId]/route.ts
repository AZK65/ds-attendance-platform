import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getLmsAccount, LMS_UPLOADS_DIR } from '@/lib/lms'
import { promises as fs } from 'fs'
import path from 'path'

// GET /api/lms/attachment/[attachmentId] — stream a lesson file (PDF/PPTX) to
// the logged-in student. Files live outside the web root; access is gated by
// the student session and the file's vehicleType.
export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  const { attachmentId } = await params

  const att = await prisma.lmsAttachment.findUnique({
    where: { id: attachmentId },
    include: { lesson: { include: { section: { select: { vehicleType: true } } } } },
  })
  if (!att || att.lesson.section.vehicleType !== account.vehicleType) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    // Guard against path traversal — only the stored basename is used.
    const safe = path.basename(att.path)
    const file = await fs.readFile(path.join(LMS_UPLOADS_DIR, safe))
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': att.mimetype || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${att.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File missing' }, { status: 404 })
  }
}
