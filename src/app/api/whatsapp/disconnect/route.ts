import { NextResponse } from 'next/server'
import { disconnectWhatsApp } from '@/lib/whatsapp/client'

export async function POST() {
  try {
    await disconnectWhatsApp()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Disconnect error:', error)
    return NextResponse.json(
      { error: 'Failed to disconnect from WhatsApp' },
      { status: 500 }
    )
  }
}
