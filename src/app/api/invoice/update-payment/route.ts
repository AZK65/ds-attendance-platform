import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceId, paymentMethod, paymentStatus } = body

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (paymentStatus !== undefined && !['paid', 'unpaid'].includes(paymentStatus)) {
      return NextResponse.json({ error: 'Use the refund workflow for refunds.' }, { status: 400 })
    }
    if (invoice.paymentStatus === 'refunded' || invoice.creditForInvoiceId) {
      return NextResponse.json({ error: 'A refunded invoice cannot be marked paid again.' }, { status: 409 })
    }
    if (invoice.cloverPaid && paymentStatus === 'unpaid') {
      return NextResponse.json({ error: 'A confirmed Clover payment cannot be reset to unpaid.' }, { status: 409 })
    }

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {}
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus
    // Keep an existing receipt date when staff update the payment method.
    // Historical paid invoices have no receipt timestamp; do not date them today.
    if (paymentStatus === 'paid' && invoice.paymentStatus !== 'paid') {
      updateData.paidAt = new Date()
    } else if (paymentStatus === 'unpaid') {
      updateData.paidAt = null
    }

    const changed = await prisma.invoice.updateMany({
      where: { id: invoiceId, paymentStatus: invoice.paymentStatus, updatedAt: invoice.updatedAt },
      data: updateData,
    })
    if (!changed.count) return NextResponse.json({ error: 'Invoice changed; refresh before updating payment.' }, { status: 409 })
    const updated = await prisma.invoice.findUnique({ where: { id: invoiceId } })

    return NextResponse.json({ invoice: updated })
  } catch (error) {
    console.error('Error updating payment:', error)
    return NextResponse.json(
      { error: 'Failed to update payment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
