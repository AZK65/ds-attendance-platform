import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { LMS_UPLOADS_DIR, getLmsAccount } from '@/lib/lms'
import { promises as fs } from 'fs'
import path from 'path'

// GET /api/lms/slide/[slideId] — a rendered slide PNG. Gated behind the
// student session (not public) so slides can't be pulled by URL or shared.
// The <img> tag sends the session cookie same-origin, so it still loads for
// logged-in students of the right course.
export async function GET(request: NextRequest, { params }: { params: Promise<{ slideId: string }> }) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  const { slideId } = await params

  const slide = await prisma.lmsSlide.findUnique({
    where: { id: slideId },
    include: { lesson: { include: { section: { select: { vehicleType: true } } } } },
  })
  if (!slide || slide.lesson.section.vehicleType !== account.vehicleType) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const file = await fs.readFile(path.join(LMS_UPLOADS_DIR, path.basename(slide.path)))
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/png',
        // Private, no shared caching, and discourage download tooling.
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File missing' }, { status: 404 })
  }
}
