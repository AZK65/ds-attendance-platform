import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { applySessionCookies, clearSessionCookies } from '@/lib/admin-token'
import { resolveStaffSession } from '@/lib/admin-auth'

// POST /api/auth/heartbeat
// Called periodically by the client while an admin page is open. It keeps the
// device's "last active" fresh AND enforces remote logout: if this device's
// session row was deleted from Settings → Devices, we report valid:false and
// the client clears its cookies and returns to /login.
//
// A signed, unexpired token fails open on a database error inside
// resolveStaffSession, so a transient hiccup cannot mass-log-out every device.
// The old literal cookie with no session id is not adopted here: that cookie
// can be forged, so those browsers sign in again.
export async function POST(request: NextRequest) {
  const session = await resolveStaffSession(request)
  if (!session) {
    const res = NextResponse.json({ valid: false, reason: 'revoked' })
    if (request.cookies.get('auth-token') || request.cookies.get('sid')) {
      clearSessionCookies(res)
    }
    return res
  }

  try {
    await prisma.adminSession.update({
      where: { id: session.sid },
      data: { lastSeenAt: new Date() },
    })
  } catch (e) {
    // DB error — never log the user out over an infrastructure blip.
    console.error('[auth/heartbeat] error (failing open):', e)
    return NextResponse.json({ valid: true })
  }

  const res = NextResponse.json({ valid: true, upgraded: session.legacy })
  applySessionCookies(res, session.sid)
  return res
}
