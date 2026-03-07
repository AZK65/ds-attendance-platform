import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Use sandbox if CLOVER_SANDBOX=true, otherwise production
const CLOVER_BASE = process.env.CLOVER_SANDBOX === 'true'
  ? 'https://sandbox.dev.clover.com'
  : 'https://api.clover.com'

function getCloverCredentials() {
  const merchantId = process.env.CLOVER_MERCHANT_ID
  const apiToken = process.env.CLOVER_API_TOKEN
  if (!merchantId || !apiToken) return null
  return { merchantId, apiToken }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceId, cloverOrderId } = body

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    // Get the invoice
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // If cloverOrderId provided, confirm the match
    if (cloverOrderId) {
      const updated = await prisma.invoice.update({
        where: { id: invoiceId },
        data: { cloverOrderId },
      })
      return NextResponse.json({ success: true, invoice: updated })
    }

    // Otherwise, auto-match: fetch Clover orders around the invoice date
    const creds = getCloverCredentials()
    if (!creds) {
      return NextResponse.json(
        { error: 'Clover credentials not configured' },
        { status: 400 }
      )
    }

    // Search ±3 days from invoice date
    const invoiceDate = new Date(invoice.invoiceDate)
    const fromDate = new Date(invoiceDate)
    fromDate.setDate(fromDate.getDate() - 3)
    const toDate = new Date(invoiceDate)
    toDate.setDate(toDate.getDate() + 3)

    const fromMs = fromDate.setHours(0, 0, 0, 0)
    const toMs = toDate.setHours(23, 59, 59, 999)

    const url = `${CLOVER_BASE}/v3/merchants/${creds.merchantId}/orders?expand=lineItems&limit=100&filter=createdTime>=${fromMs}&filter=createdTime<=${toMs}&orderBy=createdTime+DESC`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Clover Match] Orders fetch error:', err)
      return NextResponse.json({ error: 'Failed to fetch Clover orders for matching' }, { status: res.status })
    }

    const data = await res.json()
    const orders = data.elements || []

    // Score each order
    const invoiceTotal = invoice.total
    const matches = orders
      .map((order: { id: string; total: number; createdTime: number; state: string; lineItems?: { elements?: Array<{ name: string; price: number; unitQty: number }> } }) => {
        const orderTotal = (order.total || 0) / 100
        const diff = Math.abs(orderTotal - invoiceTotal)

        let score: 'exact' | 'close' | 'partial' | 'weak'
        if (diff < 0.01) {
          score = 'exact'
        } else if (diff <= 1.0) {
          score = 'close'
        } else if (diff <= 5.0) {
          score = 'partial'
        } else {
          score = 'weak'
        }

        return {
          orderId: order.id,
          total: orderTotal,
          date: new Date(order.createdTime).toISOString().split('T')[0],
          createdTime: order.createdTime,
          state: order.state,
          score,
          diff,
          lineItems: (order.lineItems?.elements || []).map((li: { name: string; price: number; unitQty: number }) => ({
            name: li.name,
            price: (li.price || 0) / 100,
            quantity: li.unitQty || 1,
          })),
        }
      })
      // Sort: exact > close > partial > weak, then by diff ascending
      .sort((a: { score: string; diff: number }, b: { score: string; diff: number }) => {
        const scoreOrder = { exact: 0, close: 1, partial: 2, weak: 3 }
        const aScore = scoreOrder[a.score as keyof typeof scoreOrder]
        const bScore = scoreOrder[b.score as keyof typeof scoreOrder]
        if (aScore !== bScore) return aScore - bScore
        return a.diff - b.diff
      })
      .slice(0, 5) // Top 5 matches

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        studentName: invoice.studentName,
        total: invoice.total,
        invoiceDate: invoice.invoiceDate,
      },
      matches,
    })
  } catch (error) {
    console.error('[Clover Match] Error:', error)
    return NextResponse.json(
      { error: 'Failed to match invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
