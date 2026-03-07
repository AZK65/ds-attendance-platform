import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Use sandbox if CLOVER_SANDBOX=true, otherwise production
const CLOVER_BASE = process.env.CLOVER_SANDBOX === 'true'
  ? 'https://sandbox.dev.clover.com'
  : 'https://api.clover.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceId, studentName, studentEmail, lineItems, total, invoiceNumber } = body

    // Get Clover credentials from env
    const cloverMerchantId = process.env.CLOVER_MERCHANT_ID
    const cloverApiToken = process.env.CLOVER_API_TOKEN
    if (!cloverMerchantId || !cloverApiToken) {
      return NextResponse.json(
        { error: 'Clover credentials not configured. Add CLOVER_MERCHANT_ID and CLOVER_API_TOKEN to your environment.' },
        { status: 400 }
      )
    }

    // Determine invoice data — either from DB or from request body
    let name = studentName || ''
    let email = studentEmail || ''
    let items: Array<{ description: string; quantity: number; unitPrice: number }> = []
    let invTotal = total || 0
    let invNumber = invoiceNumber || ''
    let invId = invoiceId || null

    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }

      // If already has a payment link, return it
      if (invoice.cloverPaymentUrl) {
        return NextResponse.json({
          paymentUrl: invoice.cloverPaymentUrl,
          existing: true,
        })
      }

      name = invoice.studentName
      email = invoice.studentEmail || ''
      invTotal = invoice.total
      invNumber = invoice.invoiceNumber
      invId = invoice.id

      try {
        items = JSON.parse(invoice.lineItems)
      } catch {
        items = [{ description: `Invoice ${invoice.invoiceNumber}`, quantity: 1, unitPrice: invoice.total }]
      }
    } else if (lineItems) {
      items = typeof lineItems === 'string' ? JSON.parse(lineItems) : lineItems
    }

    if (!items.length) {
      items = [{ description: `Invoice ${invNumber}`, quantity: 1, unitPrice: invTotal }]
    }

    // Split name into first/last
    const nameParts = name.trim().split(/\s+/)
    const firstName = nameParts[0] || 'Customer'
    const lastName = nameParts.slice(1).join(' ') || ''

    // Build Clover checkout payload — prices in cents
    const checkoutPayload = {
      customer: {
        firstName,
        lastName: lastName || firstName,
        email: email || undefined,
      },
      shoppingCart: {
        lineItems: items.map((item) => ({
          name: item.description || `Invoice ${invNumber}`,
          price: Math.round((item.unitPrice || 0) * 100),
          unitQty: item.quantity || 1,
        })),
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
      console.error('[Clover Payment Link] Error:', err)
      return NextResponse.json(
        { error: `Clover API error: ${err}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    const paymentUrl = data.href

    // Save the payment URL to the invoice record if we have an invoiceId
    if (invId) {
      await prisma.invoice.update({
        where: { id: invId },
        data: { cloverPaymentUrl: paymentUrl },
      })
    }

    console.log(`[Clover Payment Link] Created for invoice ${invNumber}: ${paymentUrl}`)

    return NextResponse.json({
      paymentUrl,
      checkoutSessionId: data.checkoutSessionId,
      expirationTime: data.expirationTime,
    })
  } catch (error) {
    console.error('[Clover Payment Link] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create payment link', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
