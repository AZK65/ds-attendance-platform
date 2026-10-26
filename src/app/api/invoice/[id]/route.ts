import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { remainingBalanceUpdateAfterDelete } from '@/lib/invoice-match'
import { resolveExternalStudentId } from '@/lib/invoice-student-id'

// PATCH /api/invoice/[id]
// Currently supports updating remainingBalance only. Used to correct stale
// values left by the old "package + previous balance" double-counting bug.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()
    const data: Record<string, unknown> = {}
    if (body.remainingBalance === null || typeof body.remainingBalance === 'number') {
      data.remainingBalance = body.remainingBalance
    }
    // Attaching an email to an existing invoice — used when admin saved
    // an email on the student profile after the invoice was already made.
    if (typeof body.studentEmail === 'string' || body.studentEmail === null) {
      data.studentEmail = typeof body.studentEmail === 'string'
        ? body.studentEmail.trim() || null
        : null
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No supported fields' }, { status: 400 })
    }
    const existing = await prisma.invoice.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    // Stamp the MySQL student id the first time this invoice is saved, when
    // the phone or exact name identifies one student. A failed lookup leaves
    // a blank id blank.
    if (existing.externalStudentId == null) {
      const externalStudentId = await resolveExternalStudentId({
        phone: existing.studentPhone,
        name: existing.studentName,
      })
      if (externalStudentId != null) data.externalStudentId = externalStudentId
    }
    const updated = await prisma.invoice.update({ where: { id }, data })
    return NextResponse.json({ invoice: updated })
  } catch (error) {
    console.error('Invoice PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update invoice' },
      { status: 500 },
    )
  }
}

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

    // Recalculate remainingBalance on the newest remaining invoice for this
    // same student. Another student's invoice is never rewritten, including
    // when their name merely contains this student's name.
    const remainingInvoices = await prisma.invoice.findMany({
      select: {
        id: true,
        externalStudentId: true,
        studentPhone: true,
        studentName: true,
        total: true,
        remainingBalance: true,
        createdAt: true,
      },
    })
    const update = remainingBalanceUpdateAfterDelete(invoice, remainingInvoices)
    if (update) {
      await prisma.invoice.update({
        where: { id: update.id },
        data: { remainingBalance: update.remainingBalance },
      })
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
