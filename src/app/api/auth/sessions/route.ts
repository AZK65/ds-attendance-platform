import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_COOKIE_OPTS } from '@/lib/auth-cookie'
import { describeDevice } from '@/lib/admin-session'

// Devices are keyed by (userAgent + IP): the same browser on the same network
// is one device, no matter how many session rows exist for it (repeat logins,
// multi-tab adoption, etc.).
function deviceKey(userAgent: string | null, ip: string | null): string {
  return `${userAgent ?? ''}|${ip ?? ''}`
}

// GET /api/auth/sessions — list logged-in devices, collapsed by device+IP so
// the same browser never appears more than once.
export async function GET(request: NextRequest) {
  const currentSid = request.cookies.get('sid')?.value || null
  try {
    const sessions = await prisma.adminSession.findMany({
      orderBy: { lastSeenAt: 'desc' },
    })

    // Group rows into one entry per device.
    const groups = new Map<string, {
      ids: string[]
      userAgent: string | null
      ipAddress: string | null
      label: string | null
      firstSignedIn: Date
      lastSeenAt: Date
      current: boolean
    }>()

    for (const s of sessions) {
      const key = deviceKey(s.userAgent, s.ipAddress)
      const g = groups.get(key)
      if (!g) {
        groups.set(key, {
          ids: [s.id],
          userAgent: s.userAgent,
          ipAddress: s.ipAddress,
          label: s.label,
          firstSignedIn: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          current: s.id === currentSid,
        })
      } else {
        g.ids.push(s.id)
        g.label = g.label || s.label
        if (s.createdAt < g.firstSignedIn) g.firstSignedIn = s.createdAt
        if (s.lastSeenAt > g.lastSeenAt) g.lastSeenAt = s.lastSeenAt
        if (s.id === currentSid) g.current = true
      }
    }

    // Sort: this device first, then most-recently-active.
    const devices = [...groups.values()]
      .map(g => ({
        // The current sid (if in this group) is the id we act on, so revoking
        // the current device clears the right cookie; else the newest row.
        id: g.current && currentSid ? currentSid : g.ids[0],
        ids: g.ids,
        sessionCount: g.ids.length,
        label: g.label,
        device: describeDevice(g.userAgent),
        ipAddress: g.ipAddress,
        createdAt: g.firstSignedIn,
        lastSeenAt: g.lastSeenAt,
        current: g.current,
      }))
      .sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
      })

    return NextResponse.json({ sessions: devices })
  } catch (e) {
    console.error('[auth/sessions] list error:', e)
    return NextResponse.json({ sessions: [] })
  }
}

// DELETE /api/auth/sessions — revoke device(s). Operates on whole devices, so
// removing one clears every duplicate session row for that browser+IP.
//   { id: "<sessionId>" }  → log out that device (all its rows)
//   { others: true }       → log out every device except this one
export async function DELETE(request: NextRequest) {
  const currentSid = request.cookies.get('sid')?.value || null
  try {
    const body = await request.json().catch(() => ({}))

    if (body?.others) {
      // Keep only the current device's rows (match its userAgent+IP so its
      // duplicate rows survive too), remove everything else.
      const me = currentSid
        ? await prisma.adminSession.findUnique({ where: { id: currentSid } })
        : null
      if (me) {
        await prisma.adminSession.deleteMany({
          where: { NOT: { userAgent: me.userAgent, ipAddress: me.ipAddress } },
        })
      } else {
        await prisma.adminSession.deleteMany({ where: currentSid ? { id: { not: currentSid } } : {} })
      }
      return NextResponse.json({ success: true })
    }

    const id = body?.id
    if (!id) {
      return NextResponse.json({ error: 'id or others is required' }, { status: 400 })
    }

    // Delete every row for the same device (userAgent+IP) as the given id.
    const target = await prisma.adminSession.findUnique({ where: { id } })
    let removedCurrent = id === currentSid
    if (target) {
      const del = await prisma.adminSession.deleteMany({
        where: { userAgent: target.userAgent, ipAddress: target.ipAddress },
      })
      // Was the current device part of this group?
      if (currentSid) {
        const stillHere = await prisma.adminSession.findUnique({ where: { id: currentSid } })
        if (!stillHere) removedCurrent = true
      }
      void del
    } else {
      await prisma.adminSession.delete({ where: { id } }).catch(() => {})
    }

    const res = NextResponse.json({ success: true })
    // If we logged out the device we're currently on, clear its cookies so
    // this browser returns to /login immediately.
    if (removedCurrent) {
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
