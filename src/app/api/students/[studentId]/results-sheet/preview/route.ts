import { NextRequest, NextResponse } from 'next/server'
import { resolveClass1 } from '@/lib/rsep1/access'
import { renderPdfPagePng } from '@/lib/rsep1/fill'
import { rsep1Json } from '@/lib/rsep1/respond'
import { pdfForStudent } from '@/lib/rsep1/store'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params
    const ctx = await resolveClass1(studentId)
    const page = request.nextUrl.searchParams.get('page') === '2' ? 2 : 1
    const { bytes } = await pdfForStudent(ctx, false)
    const png = await renderPdfPagePng(bytes, page)
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return rsep1Json(error)
  }
}
