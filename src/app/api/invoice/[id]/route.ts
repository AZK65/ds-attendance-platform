import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const invoice = await prisma.invoice.findUnique({
      where: { id },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Also fetch school info + invoice settings for PDF regeneration
    let invoiceSettings = await prisma.invoiceSettings.findUnique({
      where: { id: 'default' },
    })
    if (!invoiceSettings) {
      invoiceSettings = await prisma.invoiceSettings.create({
        data: { id: 'default' },
      })
    }

    let schoolInfo = await prisma.certificateSettings.findUnique({
      where: { id: 'default' },
    })
    if (!schoolInfo) {
      schoolInfo = await prisma.certificateSettings.create({
        data: { id: 'default' },
      })
    }

    return NextResponse.json({
      invoice,
      settings: {
        ...invoiceSettings,
        schoolName: schoolInfo.schoolName,
        schoolAddress: schoolInfo.schoolAddress,
        schoolCity: schoolInfo.schoolCity,
        schoolProvince: schoolInfo.schoolProvince,
        schoolPostalCode: schoolInfo.schoolPostalCode,
        gstNumber: invoiceSettings.gstNumber,
        qstNumber: invoiceSettings.qstNumber,
        defaultGstRate: invoiceSettings.defaultGstRate,
        defaultQstRate: invoiceSettings.defaultQstRate,
        taxesEnabled: invoiceSettings.taxesEnabled,
        cloverConfigured: !!(process.env.CLOVER_MERCHANT_ID && process.env.CLOVER_API_TOKEN),
      },
    })
  } catch (error) {
    console.error('Error fetching invoice:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const invoice = await prisma.invoice.findUnique({ where: { id } })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    await prisma.invoice.delete({ where: { id } })

    // Recalculate remainingBalance on remaining invoices for this student
    // so PDFs reflect the updated balance after deletion
    const conditions = []
    if (invoice.studentPhone) {
      const phoneDigits = invoice.studentPhone.replace(/\D/g, '')
      if (phoneDigits.length >= 7) {
        conditions.push({ studentPhone: { contains: phoneDigits.slice(-10) } })
      }
    }
    if (invoice.studentName) {
      conditions.push({ studentName: { contains: invoice.studentName } })
    }

    if (conditions.length > 0) {
      const remainingInvoices = await prisma.invoice.findMany({
        where: { OR: conditions },
        orderBy: { createdAt: 'asc' },
      })

      // Recalculate: find the latest invoice that has a remainingBalance,
      // then adjust all subsequent invoices
      if (remainingInvoices.length > 0) {
        // Recalculate the last invoice's remaining balance by adding back the deleted invoice's total
        const lastInvoice = remainingInvoices[remainingInvoices.length - 1]
        if (lastInvoice.remainingBalance != null) {
          const newBalance = lastInvoice.remainingBalance + invoice.total
          await prisma.invoice.update({
            where: { id: lastInvoice.id },
            data: { remainingBalance: Math.round(newBalance * 100) / 100 },
          })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting invoice:', error)
    return NextResponse.json(
      { error: 'Failed to delete invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
