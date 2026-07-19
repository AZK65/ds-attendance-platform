import { NextRequest, NextResponse } from 'next/server'
import { CLOVER_SDK_URL, cloverConfigured } from '@/lib/clover'
import { getDepositCents } from '@/lib/pricing'

/**
 * GET /api/payment/config — public, called by the marketing site's payment step
 * to obtain the Clover public token + SDK URL. The private API token never
 * leaves the server. Cross-origin: see middleware.ts CORS allowlist.
 *
 * amountCents is the class's configured deposit (Settings → Pricing). Pass
 * ?vehicleType=truck for Class 1; defaults to car (Class 5).
 */
export async function GET(request: NextRequest) {
  if (!cloverConfigured()) {
    return NextResponse.json({ error: 'Payment provider not configured' }, { status: 503 })
  }
  const vehicleType = request.nextUrl.searchParams.get('vehicleType')
  const amountCents = await getDepositCents(vehicleType)
  return NextResponse.json({
    publicToken: process.env.CLOVER_PUBLIC_TOKEN || null,
    merchantId: process.env.CLOVER_MERCHANT_ID || null,
    sdkUrl: CLOVER_SDK_URL,
    currency: 'cad',
    amountCents,
  })
}
