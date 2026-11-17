import { NextResponse } from 'next/server'
import { getWhatsAppState, getWhatsAppQrCode } from '@/lib/whatsapp/client'
import QRCode from 'qrcode'

export async function GET() {
  const qr = await getWhatsAppQrCode()
  const state = getWhatsAppState()
  const headers = { 'Cache-Control': 'no-store, private' }

  if (!qr) {
    return NextResponse.json({ qrImage: null, isConnected: state.isConnected, generatedAt: null }, { headers })
  }

  try {
    const qrImage = await QRCode.toDataURL(qr, { width: 320, margin: 4, errorCorrectionLevel: 'M' })
    return NextResponse.json({ qrImage, isConnected: false, generatedAt: state.qrGeneratedAt }, { headers })
  } catch (error) {
    console.error('QR generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    )
  }
}
