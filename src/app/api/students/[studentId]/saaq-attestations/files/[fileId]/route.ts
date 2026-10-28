import { NextRequest, NextResponse } from 'next/server'
import { resolveClass1 } from '@/lib/rsep1/access'
import { saaqJson } from '@/lib/saaq-attestations/errors'
import { contentDisposition, staffUnauthorized } from '@/lib/saaq-attestations/http'
import { ATTESTATION_FILE_ID } from '@/lib/saaq-attestations/sniff'
import { readAttestationBytes } from '@/lib/saaq-attestations/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string; fileId: string }> },
) {
  // Cookie is checked here on purpose. A path ending in .png/.jpg skips
  // middleware, and so does x-internal with no Referer. This route never
  // serves a file without the staff cookie, and it never accepts an id
  // that contains a dot.
  const denied = staffUnauthorized(request)
  if (denied) return denied
  try {
    const { studentId, fileId } = await params
    if (fileId !== fileId.trim() || !ATTESTATION_FILE_ID.test(fileId)) {
      return NextResponse.json({ error: 'not_found', message: 'File not found' }, { status: 404 })
    }
    const ctx = await resolveClass1(studentId)
    const file = await readAttestationBytes(ctx.externalStudentId, fileId)
    if (!SAFE_TYPES.has(file.mimeType)) {
      return NextResponse.json({ error: 'not_found', message: 'File not found' }, { status: 404 })
    }
    const download = request.nextUrl.searchParams.get('download') === '1'
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': file.mimeType,
        'Content-Length': String(file.bytes.length),
        'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', file.originalName),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return saaqJson(error)
  }
}
