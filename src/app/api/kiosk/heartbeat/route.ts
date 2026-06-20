import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { broadcastKiosks } from '@/lib/kiosk-hub'

// POST /api/kiosk/heartbeat  (public — the kiosk page has no auth cookie)
// Body: { kioskId, step?, vehicleType? }
// With SSE, commands are pushed over the stream, so the kiosk only calls this
// when its step changes (and once on connect) to report state — not on a timer.
// We still return any pending command as a fallback for when SSE is blocked.
export async function POST(request: NextRequest) {
  let body: { kioskId?: string; step?: string; vehicleType?: string; data?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const kioskId = (body.kioskId || '').trim()
  if (!kioskId) return NextResponse.json({ error: 'kioskId required' }, { status: 400 })

  // Live form snapshot (no images — just typed values + captured flags).
  const liveData = body.data !== undefined ? JSON.stringify(body.data) : undefined

  try {
    const existing = await prisma.kiosk.findUnique({ where: { kioskId } })
    let command: { id: string; type: string; message?: string } | null = null
    if (existing?.pendingCommand) {
      try { command = JSON.parse(existing.pendingCommand) } catch { command = null }
    }

    await prisma.kiosk.upsert({
      where: { kioskId },
      create: {
        kioskId,
        currentStep: body.step ?? null,
        vehicleType: body.vehicleType ?? null,
        ...(liveData !== undefined ? { liveData } : {}),
        lastSeenAt: new Date(),
      },
      update: {
        currentStep: body.step ?? null,
        vehicleType: body.vehicleType ?? null,
        ...(liveData !== undefined ? { liveData } : {}),
        lastSeenAt: new Date(),
        ...(command ? { pendingCommand: null } : {}),
      },
    })

    broadcastKiosks().catch(() => {})
    return NextResponse.json({ command })
  } catch (error) {
    console.error('[kiosk/heartbeat] error:', error)
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 })
  }
}
