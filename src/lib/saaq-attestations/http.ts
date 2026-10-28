import { NextResponse, type NextRequest } from 'next/server'
import { clientIp } from '@/lib/admin-session'
import { actorFrom } from '@/lib/rsep1/access'
import type { AttestationActor } from './store'

/** Defence in depth. Middleware can be skipped by the extension rule or x-internal. */
export function staffUnauthorized(request: NextRequest): NextResponse | null {
  if (request.cookies.get('auth-token')?.value !== 'valid') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function actorFromRequest(request: NextRequest): Promise<AttestationActor> {
  const actor = await actorFrom(request)
  return { sessionId: actor.sessionId, ipAddress: clientIp(request) }
}

export function contentDisposition(mode: 'inline' | 'attachment', filename: string) {
  const cleaned = filename.replace(/[\r\n"]/g, '_').slice(0, 180) || 'document'
  const ascii = cleaned.replace(/[^\x20-\x7E]/g, '_')
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`
}
