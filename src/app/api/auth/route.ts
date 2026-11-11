import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { adminSessionSecret, applySessionCookies, clearSessionCookies } from '@/lib/admin-token'
import { resolveStaffSession } from '@/lib/admin-auth'
import { clientIp, getOrCreateSession } from '@/lib/admin-session'

// GET /api/auth — lightweight check for whether the current request has
// a valid admin session cookie. The cookie is httpOnly so the client JS
// can't read it directly; this endpoint exists so public pages (like
// /register) can decide whether to show admin-only affordances.
export async function GET(request: NextRequest) {
  const session = await resolveStaffSession(request)
  const response = NextResponse.json({ authed: !!session })
  if (session) applySessionCookies(response, session.sid)
  return response
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    const correctPassword = process.env.AUTH_PASSWORD

    // Wrong password (only checked when a password is configured)
    if (correctPassword && password !== correctPassword) {
      return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
    }

    if (!adminSessionSecret()) {
      console.error('[auth] No ADMIN_SESSION_SECRET or AUTH_PASSWORD is configured')
      return NextResponse.json({ error: 'Sign-in is not configured' }, { status: 500 })
    }

    // Record this login as a device session so it shows up in Settings →
    // Devices and can be logged out remotely. Reuses an existing row for the
    // same browser+IP (no duplicate entries). Login does not succeed without
    // a row: a cookie that is not tied to a session cannot be revoked.
    let sid: string
    try {
      sid = await getOrCreateSession(request.headers.get('user-agent') || null, clientIp(request))
    } catch (e) {
      console.error('[auth] Failed to create session row:', e)
      return NextResponse.json({ error: 'Could not start a session' }, { status: 500 })
    }

    const response = NextResponse.json({ success: true })
    if (!applySessionCookies(response, sid)) {
      return NextResponse.json({ error: 'Sign-in is not configured' }, { status: 500 })
    }
    return response
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true })

  // Delete this device's session row so it disappears from the device list
  // and the next request is rejected.
  const sid = request.cookies.get('sid')?.value
  if (sid) {
    try {
      await prisma.adminSession.delete({ where: { id: sid } })
    } catch {
      // Already gone — fine
    }
  }

  clearSessionCookies(response)
  return response
}
