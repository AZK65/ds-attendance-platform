import { NextResponse } from 'next/server'
import { getWhatsAppState } from '@/lib/whatsapp/client'
import QRCode from 'qrcode'

export async function GET() {
  const state = getWhatsAppState()

  if (!state.qr) {
    return NextResponse.json({ qrImage: null, isConnected: state.isConnected })
  }

  try {
    const qrImage = await QRCode.toDataURL(state.qr)
    return NextResponse.json({ qrImage, isConnected: false })
  } catch (error) {
    console.error('QR generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    )
  }
}
