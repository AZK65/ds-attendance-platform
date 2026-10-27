import { NextRequest, NextResponse } from 'next/server'
import { resolveClass1 } from '@/lib/rsep1/access'
import { rsep1Json } from '@/lib/rsep1/respond'
import { pdfForStudent } from '@/lib/rsep1/store'
import { resultsFilename } from '@/lib/rsep1/values'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params
    const ctx = await resolveClass1(studentId)
    const flatten = request.nextUrl.searchParams.get('final') === '1'
    const inline = request.nextUrl.searchParams.get('inline') === '1'
    const { view, bytes } = await pdfForStudent(ctx, flatten)
    const filename = resultsFilename(view.values.studentName, view.values.date)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return rsep1Json(error)
  }
}
