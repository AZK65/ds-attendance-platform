import { prisma } from '@/lib/db'
import type { NextRequest } from 'next/server'

// Client IP behind Caddy's reverse proxy.
export function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip')
}

// Parse a user-agent string into a short, human-friendly device label like
// "Chrome on macOS" or "Safari on iPhone" for the devices list.
export function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device'
  let os = 'Unknown OS'
  if (/iPhone/i.test(ua)) os = 'iPhone'
  else if (/iPad/i.test(ua)) os = 'iPad'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let browser = 'browser'
  // Order matters — Edge/Chrome UAs also contain "Safari", etc.
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera'
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome'
  else if (/CriOS/i.test(ua)) browser = 'Chrome'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Safari\//i.test(ua)) browser = 'Safari'

  return `${browser} on ${os}`
}

// Get-or-create a session row for this (userAgent, ipAddress). Reusing an
// existing row instead of always inserting stops the devices list from filling
// with duplicate entries for the same browser (repeat logins, multiple tabs
// each adopting a row at once, etc.). Returns the session id to store in `sid`.
export async function getOrCreateSession(userAgent: string | null, ipAddress: string | null): Promise<string> {
  const existing = await prisma.adminSession.findFirst({
    where: { userAgent, ipAddress },
    orderBy: { lastSeenAt: 'desc' },
  })
  if (existing) {
    await prisma.adminSession.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } })
    return existing.id
  }
  const created = await prisma.adminSession.create({ data: { userAgent, ipAddress } })
  return created.id
}
