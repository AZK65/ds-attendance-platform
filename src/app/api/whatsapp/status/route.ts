import { NextResponse } from 'next/server'
import { getWhatsAppState } from '@/lib/whatsapp/client'

export async function GET() {
  const state = getWhatsAppState()
  return NextResponse.json(state)
}
