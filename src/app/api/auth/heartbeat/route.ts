import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_COOKIE_OPTS } from '@/lib/auth-cookie'
import { clientIp, getOrCreateSession } from '@/lib/admin-session'

// POST /api/auth/heartbeat
// Called periodically by the client while an admin page is open. It keeps the
// device's "last active" fresh AND enforces remote logout: if this device's
// session row was deleted from Settings → Devices, we report valid:false and
// the client clears its cookies and returns to /login.
//
// Fail-open by design: any ambiguous/DB-error case returns valid:true so a
// transient hiccup can never mass-log-out every device.
export async function POST(request: NextRequest) {
  const authToken = request.cookies.get('auth-token')?.value
  if (authToken !== 'valid') {
    // Middleware normally blocks unauthenticated API calls; if we somehow get
    // here without the gate cookie, treat as logged out.
    return NextResponse.json({ valid: false })
  }

  const sid = request.cookies.get('sid')?.value

  try {
    if (sid) {
      const existing = await prisma.adminSession.findUnique({ where: { id: sid } })
      if (existing === null) {
        // Row was explicitly revoked from the devices list — log out.
        const res = NextResponse.json({ valid: false, reason: 'revoked' })
        res.cookies.set('auth-token', '', { ...AUTH_COOKIE_OPTS, maxAge: 0 })
        res.cookies.set('sid', '', { ...AUTH_COOKIE_OPTS, maxAge: 0 })
        return res
      }
      await prisma.adminSession.update({
        where: { id: sid },
        data: { lastSeenAt: new Date() },
      })
      return NextResponse.json({ valid: true })
    }

    // Authenticated (auth-token=valid) but no sid — a device that logged in
    // before device-tracking existed. Adopt it: reuse/create the session row
    // for this browser+IP (dedup) and set the sid cookie so it appears in the
    // list going forward without spawning duplicates.
    const newSid = await getOrCreateSession(request.headers.get('user-agent') || null, clientIp(request))
    const res = NextResponse.json({ valid: true, adopted: true })
    res.cookies.set('sid', newSid, AUTH_COOKIE_OPTS)
    return res
  } catch (e) {
    // DB error — never log the user out over an infrastructure blip.
    console.error('[auth/heartbeat] error (failing open):', e)
    return NextResponse.json({ valid: true })
  }
}
