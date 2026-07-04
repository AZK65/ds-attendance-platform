import { NextResponse } from 'next/server'
import { getWhatsAppState, getWaEvents } from '@/lib/whatsapp/client'

// GET /api/whatsapp/diagnostics
// Recent WhatsApp lifecycle events (disconnect reasons, crashes, reconnects)
// so "why did it drop" is answerable from the browser without SSH.
export async function GET() {
  const s = getWhatsAppState()
  return NextResponse.json({
    isConnected: s.isConnected,
    isConnecting: s.isConnecting,
    hasQr: !!s.qr,
    events: getWaEvents(),
  })
}
