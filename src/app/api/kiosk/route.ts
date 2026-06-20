import { NextResponse } from 'next/server'
import { buildKioskList } from '@/lib/kiosk-hub'

// GET /api/kiosk — list kiosks with live online status (authed).
// Used for the initial load; live updates come over /api/kiosk/events (SSE).
export async function GET() {
  try {
    return NextResponse.json({ kiosks: await buildKioskList() })
  } catch (error) {
    console.error('Error listing kiosks:', error)
    return NextResponse.json({ error: 'Failed to list kiosks' }, { status: 500 })
  }
}
