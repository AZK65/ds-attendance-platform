import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// PUT — Edit invoice details (line items, amounts, student info)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceId, lineItems, subtotal, gstAmount, qstAmount, total, notes, studentName, studentAddress, studentCity, studentProvince, studentPostalCode, studentPhone, studentEmail, dueDate } = body

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {}
    if (lineItems !== undefined) updateData.lineItems = typeof lineItems === 'string' ? lineItems : JSON.stringify(lineItems)
    if (subtotal !== undefined) updateData.subtotal = subtotal
    if (gstAmount !== undefined) updateData.gstAmount = gstAmount
    if (qstAmount !== undefined) updateData.qstAmount = qstAmount
    if (total !== undefined) updateData.total = total
    if (notes !== undefined) updateData.notes = notes
    if (studentName !== undefined) updateData.studentName = studentName
    if (studentAddress !== undefined) updateData.studentAddress = studentAddress
    if (studentCity !== undefined) updateData.studentCity = studentCity
    if (studentProvince !== undefined) updateData.studentProvince = studentProvince
    if (studentPostalCode !== undefined) updateData.studentPostalCode = studentPostalCode
    if (studentPhone !== undefined) updateData.studentPhone = studentPhone
    if (studentEmail !== undefined) updateData.studentEmail = studentEmail
    if (dueDate !== undefined) updateData.dueDate = dueDate

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData,
    })

    return NextResponse.json({ invoice: updated })
  } catch (error) {
    console.error('Error editing invoice:', error)
    return NextResponse.json({ error: 'Failed to edit invoice' }, { status: 500 })
  }
}
