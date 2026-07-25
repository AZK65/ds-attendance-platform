import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getDepositCents } from '@/lib/pricing'

const CLOVER_BASE = process.env.CLOVER_SANDBOX === 'true'
  ? 'https://sandbox.dev.clover.com'
  : 'https://api.clover.com'

export async function POST(request: NextRequest) {
  try {
    const { registrationId } = await request.json()
    if (!registrationId) {
      return NextResponse.json({ error: 'registrationId required' }, { status: 400 })
    }

    const registration = await prisma.studentRegistration.findUnique({
      where: { id: registrationId },
    })
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    const cloverMerchantId = process.env.CLOVER_MERCHANT_ID
    const cloverApiToken = process.env.CLOVER_API_TOKEN
    if (!cloverMerchantId || !cloverApiToken) {
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 503 })
    }

    const nameParts = (registration.fullName || 'Student').trim().split(/\s+/)
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') || firstName

    // Deposit for this class from Settings → Pricing (cents).
    const amountCents = await getDepositCents(registration.vehicleType)
    const classLabel = registration.vehicleType === 'truck' ? 'Class 1' : 'Class 5'

    const checkoutPayload = {
      customer: {
        firstName,
        lastName,
        email: registration.email || undefined,
      },
      shoppingCart: {
        lineItems: [
          {
            name: `${classLabel} Driving Course — First Payment (Registration)`,
            price: amountCents,
            unitQty: 1,
          },
        ],
      },
    }

    const res = await fetch(`${CLOVER_BASE}/invoicingcheckoutservice/v1/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cloverApiToken}`,
        'X-Clover-Merchant-Id': cloverMerchantId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(checkoutPayload),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Register Checkout] Clover error:', err)
      return NextResponse.json({ error: 'Failed to create checkout' }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({
      paymentUrl: data.href,
      checkoutSessionId: data.checkoutSessionId,
    })
  } catch (error) {
    console.error('[Register Checkout] Error:', error)
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}
