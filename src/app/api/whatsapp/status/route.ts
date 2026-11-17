import { NextResponse } from 'next/server'
import { getWhatsAppState } from '@/lib/whatsapp/client'

export async function GET() {
  const { qr: _qr, ...state } = getWhatsAppState()
  void _qr
  return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store, private' } })
}
