import { NextRequest, NextResponse } from 'next/server'
import { connectWhatsApp, getWhatsAppState, resetWhatsAppState, hardResetWhatsApp } from '@/lib/whatsapp/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    // Wipe = factory reset: kills Chromium and deletes the saved session +
    // web cache, then reconnects fresh (QR re-scan required). This is the
    // no-SSH fix for a corrupted/incompatible Chrome profile that loops
    // "QR -> connecting -> disconnected" forever.
    if (body?.wipe) {
      console.log('[WhatsApp] Hard reset requested — wiping session, QR re-scan needed')
      await hardResetWhatsApp()
    } else if (body?.force) {
      // Force reset if requested
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
