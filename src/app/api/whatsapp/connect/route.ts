import { NextResponse } from 'next/server'
import { connectWhatsApp, getWhatsAppState } from '@/lib/whatsapp/client'

export async function POST() {
  try {
    await connectWhatsApp()
    const state = getWhatsAppState()
    return NextResponse.json({ success: true, ...state })
  } catch (error) {
    console.error('Connect error:', error)
    return NextResponse.json(
      { error: 'Failed to connect to WhatsApp' },
      { status: 500 }
    )
  }
}
