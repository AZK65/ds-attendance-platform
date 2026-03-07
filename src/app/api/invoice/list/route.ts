import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get('search')?.trim() || ''
    const from = request.nextUrl.searchParams.get('from') || ''
    const to = request.nextUrl.searchParams.get('to') || ''

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}

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
      orderBy: { createdAt: 'desc' },
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
