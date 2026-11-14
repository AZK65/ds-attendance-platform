import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { activeInvoiceWhere, deletedInvoiceWhere } from '@/lib/invoice-deleted'

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get('search')?.trim() || ''
    const from = request.nextUrl.searchParams.get('from') || ''
    const to = request.nextUrl.searchParams.get('to') || ''

    const deletedOnly = request.nextUrl.searchParams.get('deleted') === '1'
    // Build where clause. Deleted invoices stay out of the normal list.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = deletedOnly ? { ...deletedInvoiceWhere } : { ...activeInvoiceWhere }

    if (search) {
      where.OR = [
        { studentName: { contains: search } },
        { invoiceNumber: { contains: search } },
      ]
    }

    if (from || to) {
      where.invoiceDate = {}
      if (from) where.invoiceDate.gte = from
      if (to) where.invoiceDate.lte = to
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: deletedOnly ? { deletedAt: 'desc' } : { createdAt: 'desc' },
    })

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    )
  }
}
