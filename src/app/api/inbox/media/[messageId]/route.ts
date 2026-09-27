import { NextRequest, NextResponse } from 'next/server'
import { getInboxMessageMedia } from '@/lib/whatsapp/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
}

function isAdmin(request: NextRequest): boolean {
  return request.cookies.get('auth-token')?.value === 'valid'
}

function safeFilename(value: string | undefined, mimetype: string): string {
  const fallback = `whatsapp-attachment.${EXTENSIONS[mimetype] || 'bin'}`
  return (value || fallback).replace(/[\r\n"\\/]/g, '_')
}

function parseRange(value: string | null, size: number): { start: number; end: number } | null | undefined {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match) return undefined
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[2] && match[1] ? Number(match[2]) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return undefined
  }
  return { start, end: Math.min(end, size - 1) }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { messageId } = await params
    const media = await getInboxMessageMedia(decodeURIComponent(messageId))
    const bytes = Buffer.from(media.data, 'base64')
    const filename = safeFilename(media.filename, media.mimetype)
    const download = request.nextUrl.searchParams.get('download') === '1'
    const range = parseRange(request.headers.get('range'), bytes.length)

    if (range === undefined) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${bytes.length}` },
      })
    }

    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
      'Content-Type': media.mimetype,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'X-Content-Type-Options': 'nosniff',
    })

    if (range) {
      const chunk = bytes.subarray(range.start, range.end + 1)
      headers.set('Content-Length', String(chunk.length))
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${bytes.length}`)
      return new NextResponse(chunk, { status: 206, headers })
    }

    headers.set('Content-Length', String(bytes.length))
    return new NextResponse(bytes, { headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Attachment unavailable'
    console.error('[Inbox media] Download failed:', message)
    return NextResponse.json({ error: message }, { status: 404 })
  }
}
