import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { restoreInvoice } from '@/lib/invoice-deleted'

// POST /api/invoice/[id]/restore — clear soft delete. Amounts and the invoice number stay.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const result = await restoreInvoice(prisma, id)
    if (result === 'missing') {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (result === 'active') {
      return NextResponse.json({ error: 'This invoice is not deleted.' }, { status: 409 })
    }
    const invoice = await prisma.invoice.findUnique({ where: { id } })
    return NextResponse.json({ success: true, invoice })
  } catch (error) {
    console.error('Error restoring invoice:', error)
    return NextResponse.json(
      { error: 'Failed to restore invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
