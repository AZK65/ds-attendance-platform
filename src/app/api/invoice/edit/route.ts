import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseExternalStudentId, resolveExternalStudentId } from '@/lib/invoice-student-id'
import { phoneLast10 } from '@/lib/student-match'
import { cents } from '@/lib/invoice-ledger'

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

    const amounts = [subtotal ?? invoice.subtotal, gstAmount ?? invoice.gstAmount, qstAmount ?? invoice.qstAmount, total ?? invoice.total]
    if (amounts.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      || amounts[3] <= 0 || Math.abs(cents(amounts[0]) + cents(amounts[1]) + cents(amounts[2]) - cents(amounts[3])) > 1) {
      return NextResponse.json({ error: 'Use valid amounts; subtotal plus taxes must equal the invoice total.' }, { status: 400 })
    }

    const moneyChanged = (total !== undefined && total !== invoice.total) || (subtotal !== undefined && subtotal !== invoice.subtotal)
      || (gstAmount !== undefined && gstAmount !== invoice.gstAmount) || (qstAmount !== undefined && qstAmount !== invoice.qstAmount)
      || (lineItems !== undefined && (typeof lineItems === 'string' ? lineItems : JSON.stringify(lineItems)) !== invoice.lineItems)
    if (moneyChanged && (invoice.paymentStatus !== 'unpaid' || invoice.cloverOrderId || !invoice.billingAccountId)) {
      return NextResponse.json({ error: 'Only reviewed, unpaid invoices without a Clover order can have their amounts changed.' }, { status: 409 })
    }
    if (invoice.billingAccountId && ((studentPhone !== undefined && phoneLast10(studentPhone) !== phoneLast10(invoice.studentPhone)) || (body.externalStudentId !== undefined && parseExternalStudentId(body.externalStudentId) !== invoice.externalStudentId))) {
      return NextResponse.json({ error: 'Moving an invoice to another student requires account reconciliation.' }, { status: 409 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {}
    if (lineItems !== undefined) updateData.lineItems = typeof lineItems === 'string' ? lineItems : JSON.stringify(lineItems)
    if (subtotal !== undefined) updateData.subtotal = subtotal
    if (gstAmount !== undefined) updateData.gstAmount = gstAmount
    if (qstAmount !== undefined) updateData.qstAmount = qstAmount
    if (total !== undefined) updateData.total = total
    // An installment never adds a new charge. A standalone service follows its
    // edited price; a full-course charge must be adjusted through reconciliation.
    if (total !== undefined) {
      if (!(total > 0)) return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 })
      if (invoice.billingMode === 'new-course' && cents(total) !== cents(invoice.total)) return NextResponse.json({ error: 'Course charge changes require reconciliation.' }, { status: 409 })
      if (invoice.billingMode !== 'new-course' && invoice.chargeCents === cents(invoice.total)) updateData.chargeCents = cents(total)
      else if (invoice.chargeCents !== 0 && cents(total) !== cents(invoice.total)) return NextResponse.json({ error: 'Review the course charge before changing this invoice amount.' }, { status: 409 })
    }
    if (notes !== undefined) updateData.notes = notes
    if (studentName !== undefined) updateData.studentName = studentName
    if (studentAddress !== undefined) updateData.studentAddress = studentAddress
    if (studentCity !== undefined) updateData.studentCity = studentCity
    if (studentProvince !== undefined) updateData.studentProvince = studentProvince
    if (studentPostalCode !== undefined) updateData.studentPostalCode = studentPostalCode
    if (studentPhone !== undefined) updateData.studentPhone = studentPhone
    if (studentEmail !== undefined) updateData.studentEmail = studentEmail
    if (dueDate !== undefined) updateData.dueDate = dueDate

    const explicitId = parseExternalStudentId(body.externalStudentId)
    const identityTouched = studentName !== undefined || studentPhone !== undefined || body.externalStudentId !== undefined
    if (explicitId != null) {
      updateData.externalStudentId = explicitId
    } else if (!invoice.billingAccountId && (identityTouched || invoice.externalStudentId == null)) {
      const nextPhone = studentPhone !== undefined ? studentPhone : invoice.studentPhone
      const nextName = studentName !== undefined ? studentName : invoice.studentName
      const resolved = await resolveExternalStudentId({ phone: nextPhone, name: nextName })
      const phoneChanged = studentPhone !== undefined && phoneLast10(studentPhone) !== phoneLast10(invoice.studentPhone)
      if (resolved != null) updateData.externalStudentId = resolved
      else if (phoneChanged) updateData.externalStudentId = null
    }

    const changed = await prisma.invoice.updateMany({
      where: { id: invoiceId, paymentStatus: invoice.paymentStatus, updatedAt: invoice.updatedAt },
      data: updateData,
    })
    if (!changed.count) return NextResponse.json({ error: 'Invoice changed; refresh before editing.' }, { status: 409 })
    const updated = await prisma.invoice.findUnique({ where: { id: invoiceId } })

    return NextResponse.json({ invoice: updated })
  } catch (error) {
    console.error('Error editing invoice:', error)
    return NextResponse.json({ error: 'Failed to edit invoice' }, { status: 500 })
  }
}
