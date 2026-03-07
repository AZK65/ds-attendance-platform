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

    // Build update data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {}
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData,
    })

    return NextResponse.json({ invoice: updated })
  } catch (error) {
    console.error('Error updating payment:', error)
    return NextResponse.json(
      { error: 'Failed to update payment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
