import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createRegistrationInvoice } from '@/lib/registration-invoice'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit'

const CLOVER_BASE = process.env.CLOVER_SANDBOX === 'true'
  ? 'https://sandbox.dev.clover.com'
  : 'https://api.clover.com'

type CloverLineItem = { name?: string }
type CloverPayment = {
  id?: string
  amount?: number
  result?: string
  cardTransaction?: { card?: { last4?: string; cardType?: string } }
}
type CloverOrder = {
  id?: string
  total?: number
  state?: string
  lineItems?: { elements?: CloverLineItem[] }
  payments?: { elements?: CloverPayment[] }
}

/**
 * Public return verifier for Clover Hosted Checkout.
 *
 * A success redirect is not proof of payment. This endpoint uses the random
 * token stored on the registration, then independently finds the paid Clover
 * order by its unique registration marker, exact amount and successful payment.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(`checkout-verify:${clientIp(request)}`, 30, 60 * 60 * 1000)
  if (!limit.ok) return tooManyRequests(limit.retryAfter)

  try {
    const body = await request.json().catch(() => ({})) as {
      registrationId?: string
      returnToken?: string
    }
    if (!body.registrationId || !body.returnToken) {
      return NextResponse.json({ error: 'Invalid payment return' }, { status: 400 })
    }

    const registration = await prisma.studentRegistration.findFirst({
      where: { id: body.registrationId, paymentReturnToken: body.returnToken },
    })
    if (!registration) {
      return NextResponse.json({ error: 'Payment return not found' }, { status: 404 })
    }
    if (registration.paymentStatus === 'captured') {
      return NextResponse.json({ success: true, status: 'captured', alreadyVerified: true })
    }
    if (registration.paymentStatus !== 'checkout_pending' || !registration.paymentCheckoutCreatedAt) {
      return NextResponse.json({ error: 'No checkout is waiting for verification' }, { status: 409 })
    }

    const merchantId = process.env.CLOVER_MERCHANT_ID
    const apiToken = process.env.CLOVER_API_TOKEN
    if (!merchantId || !apiToken) {
      return NextResponse.json({ error: 'Payment provider not configured' }, { status: 503 })
    }

    const fromMs = registration.paymentCheckoutCreatedAt.getTime() - 5 * 60 * 1000
    const url = `${CLOVER_BASE}/v3/merchants/${merchantId}/orders?expand=lineItems,payments&limit=100&orderBy=createdTime+DESC&filter=createdTime>=${fromMs}`
    const cloverResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!cloverResponse.ok) {
      const error = await cloverResponse.text()
      console.error('[Register Checkout Verify] Clover orders error:', cloverResponse.status, error)
      return NextResponse.json({ error: 'Could not verify payment yet' }, { status: 502 })
    }

    const data = await cloverResponse.json() as { elements?: CloverOrder[] }
    const marker = `Registration ${registration.id}`
    const expectedAmount = registration.paymentAmount || 0
    let paidOrder: CloverOrder | undefined
    let paidPayment: CloverPayment | undefined

    for (const order of data.elements || []) {
      const hasMarker = (order.lineItems?.elements || []).some(item => item.name?.includes(marker))
      const payment = (order.payments?.elements || []).find(item =>
        item.result === 'SUCCESS' && Number(item.amount || 0) >= expectedAmount
      )
      if (hasMarker && order.state === 'locked' && Number(order.total || 0) === expectedAmount && payment) {
        paidOrder = order
        paidPayment = payment
        break
      }
    }

    // Clover can redirect a fraction of a second before the paid order is
    // visible through its merchant API. The browser retries this 202 response.
    if (!paidOrder || !paidPayment) {
      return NextResponse.json({ success: false, pending: true }, { status: 202 })
    }

    const updated = await prisma.studentRegistration.update({
      where: { id: registration.id },
      data: {
        paymentStatus: 'captured',
        paymentChargeId: paidPayment.id || paidOrder.id || null,
        paymentCapturedAt: new Date(),
        paymentLast4: paidPayment.cardTransaction?.card?.last4 || null,
        paymentBrand: paidPayment.cardTransaction?.card?.cardType || null,
        paymentError: null,
      },
    })

    let invoiceId: string | undefined
    try {
      const invoice = await createRegistrationInvoice({
        registration: updated,
        paymentMethod: 'card',
        paymentStatus: 'paid',
      })
      invoiceId = invoice.invoiceId
      if (invoice.invoiceId && paidOrder.id) {
        await prisma.invoice.update({
          where: { id: invoice.invoiceId },
          data: { cloverOrderId: paidOrder.id, cloverPaid: true },
        })
      }
    } catch (error) {
      // Payment verification is authoritative even if invoice creation needs
      // an admin retry; never tell the student a successful payment failed.
      console.error('[Register Checkout Verify] Auto-invoice failed:', error)
    }

    return NextResponse.json({ success: true, status: 'captured', invoiceId })
  } catch (error) {
    console.error('[Register Checkout Verify] Error:', error)
    return NextResponse.json({ error: 'Could not verify payment' }, { status: 500 })
  }
}
