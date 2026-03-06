import { NextRequest, NextResponse } from 'next/server'
import { checkWhatsAppNumber } from '@/lib/whatsapp/client'

// GET /api/whatsapp/check-number?phone=5141234567
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone')
  if (!phone || phone.replace(/[^0-9]/g, '').length < 10) {
    return NextResponse.json(
      { error: 'Valid phone number is required (at least 10 digits)' },
      { status: 400 }
    )
  }

  try {
    const result = await checkWhatsAppNumber(phone)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
