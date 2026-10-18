import { promises as fs } from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { PAPER_EXAM_DIR } from '@/lib/paper-exam'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params
    const page = await prisma.paperExamPage.findUnique({ where: { id: pageId } })
    if (!page) return NextResponse.json({ error: 'Exam page not found' }, { status: 404 })

    const root = path.resolve(PAPER_EXAM_DIR)
    const filePath = path.resolve(page.filePath)
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      return NextResponse.json({ error: 'Invalid exam page path' }, { status: 400 })
    }

    const bytes = await fs.readFile(filePath)
    const download = request.nextUrl.searchParams.get('download') === '1'
    const filename = (page.filename || `exam-page-${page.pageNumber}`).replace(/[\r\n"\\/]/g, '_')
    return new NextResponse(bytes, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': page.mimetype,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[PaperExam page] Read failed:', error)
    return NextResponse.json({ error: 'Exam page is unavailable' }, { status: 404 })
  }
}

