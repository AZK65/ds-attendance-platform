import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { getDepositCents } from '@/lib/pricing'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'

const CLOVER_BASE = process.env.CLOVER_SANDBOX === 'true'
  ? 'https://sandbox.dev.clover.com'
  : 'https://api.clover.com'

export async function POST(request: NextRequest) {
  // Creates a real Clover hosted-checkout session per call — keep it capped.
  const ip = clientIp(request)
  const limit = rateLimit(`checkout:${ip}`, 10, 60 * 60 * 1000)
  if (!limit.ok) return tooManyRequests(limit.retryAfter)

  try {
    const { registrationId, restart = false, channel } = await request.json() as {
      registrationId?: string
      restart?: boolean
      channel?: 'marketing'
    }
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
    const verifiedMarketingReturn = channel === 'marketing'
    if (verifiedMarketingReturn && registration.paymentStatus === 'captured') {
      return NextResponse.json({ error: 'Payment already completed' }, { status: 409 })
    }

    // A Hosted Checkout session is valid for 15 minutes. Reuse it while it is
    // active so retries and double-clicks cannot create several live payment
    // pages for the same registration.
    const checkoutAge = registration.paymentCheckoutCreatedAt
      ? Date.now() - registration.paymentCheckoutCreatedAt.getTime()
      : Number.POSITIVE_INFINITY
    if (
      verifiedMarketingReturn
      && !restart
      && registration.paymentStatus === 'checkout_pending'
      && registration.paymentCheckoutUrl
      && registration.paymentReturnToken
      && checkoutAge < 14 * 60 * 1000
    ) {
      return NextResponse.json({
        paymentUrl: registration.paymentCheckoutUrl,
        checkoutSessionId: registration.paymentCheckoutSessionId,
        existing: true,
      })
    }

    const nameParts = (registration.fullName || 'Student').trim().split(/\s+/)
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') || firstName

    // Deposit for this class from Settings → Pricing (cents).
    const amountCents = await getDepositCents(registration.vehicleType)
    const classLabel = registration.vehicleType === 'truck' ? 'Class 1' : 'Class 5'
    const returnToken = randomBytes(24).toString('hex')
    const returnBase = process.env.MARKETING_SITE_URL || 'https://qazidriving.ca'
    const returnParams = new URLSearchParams({ registration: registration.id, token: returnToken })
    const registrationMarker = `Registration ${registration.id}`

    const checkoutPayload = {
      customer: {
        firstName,
        lastName,
        email: registration.email || undefined,
      },
      ...(verifiedMarketingReturn ? {
        redirectUrls: {
          success: `${returnBase}/inscription?payment=success&${returnParams}`,
          failure: `${returnBase}/inscription?payment=failure&${returnParams}`,
        },
      } : {}),
      shoppingCart: {
        lineItems: [
          {
            // The unique marker is later matched against the paid Clover order.
            // A redirect alone is never accepted as proof of payment.
            name: `${classLabel} First Payment — ${registrationMarker}`,
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
        'User-Agent': 'QaziDrivingSchool/1.0 (online-registration)',
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
    if (verifiedMarketingReturn) {
      const checkoutCreatedAt = new Date()
      await prisma.studentRegistration.update({
        where: { id: registration.id },
        data: {
          paymentStatus: 'checkout_pending',
          paymentAmount: amountCents,
          paymentCheckoutSessionId: data.checkoutSessionId || null,
          paymentCheckoutUrl: data.href || null,
          paymentCheckoutCreatedAt: checkoutCreatedAt,
          paymentReturnToken: returnToken,
          paymentError: null,
        },
      })
    }
    return NextResponse.json({
      paymentUrl: data.href,
      checkoutSessionId: data.checkoutSessionId,
    })
  } catch (error) {
    console.error('[Register Checkout] Error:', error)
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
  }
}
