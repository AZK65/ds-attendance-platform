import { NextRequest, NextResponse } from 'next/server'
import { connectWhatsApp, getWhatsAppState, resetWhatsAppState } from '@/lib/whatsapp/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    // Force reset if requested
    if (body?.force) {
      console.log('[WhatsApp] Force reset requested')
      resetWhatsAppState()
    }

    await connectWhatsApp()
    const state = getWhatsAppState()
    return NextResponse.json({ success: true, ...state })
  } catch (error) {
    console.error('Connect error:', error)
    const message = error instanceof Error ? error.message : 'Failed to connect to WhatsApp'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
