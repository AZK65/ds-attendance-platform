import { NextRequest, NextResponse } from 'next/server'
import { setManualOverride, removeManualOverride, hydrateFromDb, flushLiveState } from '@/lib/zoom/live-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { groupId, phone, zoomName, action, setBy } = body as {
      groupId: string
      phone: string
      zoomName?: string
      action: 'add' | 'remove'
      setBy?: string
    }

    if (!groupId || !phone || !action) {
      return NextResponse.json(
        { error: 'groupId, phone, and action are required' },
        { status: 400 }
      )
    }

    await hydrateFromDb()
    if (action === 'add') {
      setManualOverride(groupId, phone, zoomName || '(Manual)', setBy || 'unknown')
    } else if (action === 'remove') {
      removeManualOverride(groupId, phone)
    } else {
      return NextResponse.json(
        { error: 'action must be "add" or "remove"' },
        { status: 400 }
      )
    }

    await flushLiveState()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Live Override] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process override' },
      { status: 500 }
    )
  }
}
