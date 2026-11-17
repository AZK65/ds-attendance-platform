import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppState, requestWhatsAppConnection } from '@/lib/whatsapp/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    if (body?.wipe) {
      return NextResponse.json({ error: 'Session deletion is disabled here. Use reconnect or restore a saved session.' }, { status: 400 })
    }
    const action = body?.action || (body?.force ? 'reconnect' : 'connect')
    if (!['connect', 'refresh', 'reconnect', 'restore'].includes(action)) return NextResponse.json({ error: 'Unknown connection action' }, { status: 400 })
    requestWhatsAppConnection(action)
    const { qr: _qr, ...state } = getWhatsAppState()
    void _qr
    return NextResponse.json({ success: true, ...state }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Connect error:', error)
    const message = error instanceof Error ? error.message : 'Failed to connect to WhatsApp'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
