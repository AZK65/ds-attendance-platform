import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST — Create a credit note (refund) for an invoice
export async function POST(request: NextRequest) {
  try {
    const { invoiceId, reason } = await request.json()

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    const original = await prisma.invoice.findUnique({ where: { id: invoiceId } })
    if (!original) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Get next invoice number
    let settings = await prisma.invoiceSettings.findUnique({ where: { id: 'default' } })
    if (!settings) {
      settings = await prisma.invoiceSettings.create({ data: { id: 'default' } })
    }
    const creditNoteNumber = `CR-${original.invoiceNumber}`

    // Parse original line items and negate them
    let originalItems: Array<{ description: string; quantity: number; unitPrice: number }> = []
    try {
      originalItems = JSON.parse(original.lineItems)
    } catch { /* skip */ }

    const creditItems = originalItems.map(item => ({
      description: `CREDIT: ${item.description}`,
      quantity: item.quantity,
      unitPrice: -Math.abs(item.unitPrice),
    }))

    const creditNote = await prisma.invoice.create({
      data: {
        invoiceNumber: creditNoteNumber,
        studentName: original.studentName,
        studentAddress: original.studentAddress,
        studentCity: original.studentCity,
        studentProvince: original.studentProvince,
        studentPostalCode: original.studentPostalCode,
        studentPhone: original.studentPhone,
        studentEmail: original.studentEmail,
        invoiceDate: new Date().toISOString().split('T')[0],
        lineItems: JSON.stringify(creditItems),
        subtotal: -Math.abs(original.subtotal),
        gstAmount: -Math.abs(original.gstAmount),
        qstAmount: -Math.abs(original.qstAmount),
        total: -Math.abs(original.total),
        notes: `Credit note for Invoice ${original.invoiceNumber}${reason ? ` — Reason: ${reason}` : ''}`,
        paymentStatus: 'refunded',
        paymentMethod: original.paymentMethod,
      },
    })

    // Mark original as refunded
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { paymentStatus: 'refunded' },
    })

    return NextResponse.json({ creditNote })
  } catch (error) {
    console.error('Error creating credit note:', error)
    return NextResponse.json({ error: 'Failed to create credit note' }, { status: 500 })
  }
}
