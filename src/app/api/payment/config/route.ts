import { NextResponse } from 'next/server'
import { CLOVER_SDK_URL, cloverConfigured } from '@/lib/clover'

/**
 * GET /api/payment/config — public, called by the marketing site's payment step
 * to obtain the Clover public token + SDK URL. The private API token never
 * leaves the server. Cross-origin: see middleware.ts CORS allowlist.
 */
export async function GET() {
  if (!cloverConfigured()) {
    return NextResponse.json({ error: 'Payment provider not configured' }, { status: 503 })
  }
  return NextResponse.json({
    publicToken: process.env.CLOVER_PUBLIC_TOKEN || null,
    merchantId: process.env.CLOVER_MERCHANT_ID || null,
    sdkUrl: CLOVER_SDK_URL,
    currency: 'cad',
    amountCents: 25000,
  })
}
