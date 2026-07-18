import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_COOKIE_OPTS } from '@/lib/auth-cookie'

// Parse a user-agent string into a short, human-friendly device label like
// "Chrome on macOS" or "Safari on iPhone" for the devices list.
function describeDevice(ua: string | null): string {
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

// GET /api/auth/sessions — list logged-in devices, newest activity first
export async function GET(request: NextRequest) {
  const currentSid = request.cookies.get('sid')?.value || null
  try {
    const sessions = await prisma.adminSession.findMany({
      orderBy: { lastSeenAt: 'desc' },
    })
    return NextResponse.json({
      sessions: sessions.map(s => ({
        id: s.id,
        label: s.label,
        device: describeDevice(s.userAgent),
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: s.id === currentSid,
      })),
    })
  } catch (e) {
    console.error('[auth/sessions] list error:', e)
    return NextResponse.json({ sessions: [] })
  }
}

// DELETE /api/auth/sessions — revoke device(s)
//   { id: "<sessionId>" }  → log out that device
//   { others: true }       → log out every device except this one
export async function DELETE(request: NextRequest) {
  const currentSid = request.cookies.get('sid')?.value || null
  try {
    const body = await request.json().catch(() => ({}))

    if (body?.others) {
      await prisma.adminSession.deleteMany({
        where: currentSid ? { id: { not: currentSid } } : {},
      })
      return NextResponse.json({ success: true })
    }

    const id = body?.id
    if (!id) {
      return NextResponse.json({ error: 'id or others is required' }, { status: 400 })
    }

    await prisma.adminSession.delete({ where: { id } }).catch(() => {})

    const res = NextResponse.json({ success: true })
    // If an admin logged out the device they're currently on, clear its cookies
    // so this browser returns to /login immediately.
    if (id === currentSid) {
      res.cookies.set('auth-token', '', { ...AUTH_COOKIE_OPTS, maxAge: 0 })
      res.cookies.set('sid', '', { ...AUTH_COOKIE_OPTS, maxAge: 0 })
    }
    return res
  } catch (e) {
    console.error('[auth/sessions] revoke error:', e)
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 })
  }
}

// PATCH /api/auth/sessions — rename a device { id, label }
export async function PATCH(request: NextRequest) {
  try {
    const { id, label } = await request.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await prisma.adminSession.update({
      where: { id },
      data: { label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 60) : null },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[auth/sessions] rename error:', e)
    return NextResponse.json({ error: 'Failed to rename device' }, { status: 500 })
  }
}
