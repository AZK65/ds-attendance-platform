import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/kiosk/heartbeat  (public — the kiosk page has no auth cookie)
// Body: { kioskId, step?, vehicleType? }
// Records the kiosk's current step/last-seen and returns any pending command,
// clearing it (at-most-once delivery — fine for reset/lock/message).
export async function POST(request: NextRequest) {
  let body: { kioskId?: string; step?: string; vehicleType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const kioskId = (body.kioskId || '').trim()
  if (!kioskId) return NextResponse.json({ error: 'kioskId required' }, { status: 400 })

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
        lastSeenAt: new Date(),
      },
      update: {
        currentStep: body.step ?? null,
        vehicleType: body.vehicleType ?? null,
        lastSeenAt: new Date(),
        ...(command ? { pendingCommand: null } : {}),
      },
    })

    return NextResponse.json({ command })
  } catch (error) {
    console.error('[kiosk/heartbeat] error:', error)
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 })
  }
}
