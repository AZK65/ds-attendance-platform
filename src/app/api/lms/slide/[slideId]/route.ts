import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { LMS_UPLOADS_DIR } from '@/lib/lms'
import { promises as fs } from 'fs'
import path from 'path'

// GET /api/lms/slide/[slideId] — a rendered slide PNG, addressed by its
// unguessable id. Public (no session) so it loads fast in the deck viewer;
// slide images are just rendered course material.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slideId: string }> }) {
  const { slideId } = await params
  const slide = await prisma.lmsSlide.findUnique({ where: { id: slideId } })
  if (!slide) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const file = await fs.readFile(path.join(LMS_UPLOADS_DIR, path.basename(slide.path)))
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File missing' }, { status: 404 })
  }
}
