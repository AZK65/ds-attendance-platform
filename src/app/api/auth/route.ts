import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_COOKIE_OPTS } from '@/lib/auth-cookie'
import { clientIp, getOrCreateSession } from '@/lib/admin-session'

// GET /api/auth — lightweight check for whether the current request has
// a valid admin session cookie. The cookie is httpOnly so the client JS
// can't read it directly; this endpoint exists so public pages (like
// /register) can decide whether to show admin-only affordances.
export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value
  return NextResponse.json({ authed: token === 'valid' })
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    const correctPassword = process.env.AUTH_PASSWORD

    // Wrong password (only checked when a password is configured)
    if (correctPassword && password !== correctPassword) {
      return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set('auth-token', 'valid', AUTH_COOKIE_OPTS)

    // Record this login as a device session so it shows up in Settings →
    // Devices and can be logged out remotely. Reuses an existing row for the
    // same browser+IP (no duplicate entries). Best-effort — never block login
    // if the session row can't be written.
    try {
      const sid = await getOrCreateSession(request.headers.get('user-agent') || null, clientIp(request))
      response.cookies.set('sid', sid, AUTH_COOKIE_OPTS)
    } catch (e) {
      console.error('[auth] Failed to create session row:', e)
    }

    return response
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true })

  // Delete this device's session row so it disappears from the device list
  const sid = request.cookies.get('sid')?.value
  if (sid) {
    try {
      await prisma.adminSession.delete({ where: { id: sid } })
    } catch {
      // Already gone — fine
    }
  }

  response.cookies.set('auth-token', '', { ...AUTH_COOKIE_OPTS, maxAge: 0 })
  response.cookies.set('sid', '', { ...AUTH_COOKIE_OPTS, maxAge: 0 })
  return response
}
