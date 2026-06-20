import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/kiosk — list kiosks with live online status (authed)
export async function GET() {
  try {
    const kiosks = await prisma.kiosk.findMany({ orderBy: { name: 'asc' } })
    const now = Date.now()
    return NextResponse.json({
      kiosks: kiosks.map(k => ({
        id: k.id,
        kioskId: k.kioskId,
        name: k.name,
        currentStep: k.currentStep,
        vehicleType: k.vehicleType,
        lastSeenAt: k.lastSeenAt,
        // Heartbeat is every 5s; treat >20s without one as offline.
        online: now - new Date(k.lastSeenAt).getTime() < 20_000,
        hasPendingCommand: !!k.pendingCommand,
      })),
    })
  } catch (error) {
    console.error('Error listing kiosks:', error)
    return NextResponse.json({ error: 'Failed to list kiosks' }, { status: 500 })
  }
}
