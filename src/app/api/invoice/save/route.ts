import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchStudents, createStudent } from '@/lib/external-db'
import { findBestLocalStudent } from '@/lib/local-student-lookup'
import { parseExternalStudentId, resolveExternalStudentId } from '@/lib/invoice-student-id'
import { namesEqual, phoneLast10 } from '@/lib/student-match'
import { BillingReviewRequired, prepareInvoiceBilling } from '@/lib/invoice-billing'
import { resolveStaffSession } from '@/lib/admin-auth'

// POST - save invoice record and increment invoice number
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      invoiceNumber,
      studentName,
      studentAddress,
      studentCity,
      studentProvince,
      studentPostalCode,
      studentPhone,
      studentEmail,
      invoiceDate,
      dueDate,
      lineItems,
      subtotal,
      gstAmount,
      qstAmount,
      total,
      notes,
      paymentMethod,
      paymentStatus,
    } = body

    if (!invoiceNumber || !studentName) {
      return NextResponse.json(
        { error: 'Invoice number and student name are required' },
        { status: 400 }
      )
    }
    if (![total, subtotal, gstAmount, qstAmount].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
      || total <= 0 || (paymentStatus && !['paid', 'unpaid'].includes(paymentStatus))
      || (body.billingMode && !['installment', 'new-charge', 'new-course'].includes(body.billingMode))
      || Math.abs(Math.round(total * 100) - Math.round((subtotal + gstAmount + qstAmount) * 100)) > 1) {
      return NextResponse.json({ error: 'Invoice amounts or payment status are invalid. Check subtotal, taxes, and total.' }, { status: 400 })
    }
    let history: { chargesCents: number; fingerprint: string; confirmed: boolean; staffSessionId: string; staffName: string } | undefined
    if (body.history) {
      const h = body.history
      if (body.billingMode !== 'installment' || h.confirmed !== true || !Number.isSafeInteger(h.chargesCents) || h.chargesCents < 0 || h.chargesCents > 2147483647 || typeof h.fingerprint !== 'string') {
        return NextResponse.json({ error: 'Confirm the full agreed historical charges before applying this payment.' }, { status: 400 })
      }
      const origin = request.headers.get('origin')
      try {
        if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== (request.headers.get('host') || request.nextUrl.host))) throw new Error('origin')
      } catch { return NextResponse.json({ error: 'Open this invoice on the school platform.' }, { status: 403 }) }
      const session = await resolveStaffSession(request)
      if (!session) return NextResponse.json({ error: 'Reload or sign in before confirming the historical total.' }, { status: 401 })
      history = { chargesCents: h.chargesCents, fingerprint: h.fingerprint, confirmed: true, staffSessionId: session.sid, staffName: session.label || 'Staff invoice confirmation' }
    }

    // MySQL student id, when we can tell who this is. A caller-supplied id
    // wins. Otherwise the phone last-10 must match one student. Creating a
    // missing MySQL student (the previous save behavior) supplies the id too.
    let externalStudentId = parseExternalStudentId(body.externalStudentId)
    if (externalStudentId == null && studentPhone && phoneLast10(studentPhone)) {
      try {
        const phoneKey = phoneLast10(studentPhone)
        const existing = await searchStudents(phoneKey)
        const matches = existing.filter((student) => phoneLast10(student.phone_number) === phoneKey)
        if (matches.length === 1) {
          externalStudentId = matches[0].student_id
        } else if (matches.length > 1) {
          const named = matches.filter((student) => namesEqual(student.full_name, studentName))
          if (named.length === 1) externalStudentId = named[0].student_id
        } else {
          const created = await createStudent({
            full_name: studentName,
            phone_number: studentPhone || '',
            permit_number: '',
            full_address: studentAddress || '',
            city: studentCity || '',
            postal_code: studentPostalCode || '',
            dob: '',
            email: studentEmail || '',
          })
          externalStudentId = created.insertId
          console.log(`[Invoice Save] Auto-created student "${studentName}" in external MySQL DB`)
        }
      } catch (externalDbError) {
        console.error('External DB student sync error (non-fatal):', externalDbError)
      }
    } else if (externalStudentId == null) {
      externalStudentId = await resolveExternalStudentId({ name: studentName })
    }

    // Save the invoice record
    const invoice = await prisma.$transaction(async tx => {
      const billing = await prepareInvoiceBilling(tx, { externalStudentId, phone: studentPhone, name: studentName }, {
        mode: body.billingMode || 'new-charge', total, courseTotal: body.courseTotal, history,
      })
      const saved = await tx.invoice.create({
      data: {
        invoiceNumber,
        studentName,
        studentAddress: studentAddress || null,
        studentCity: studentCity || null,
        studentProvince: studentProvince || null,
        studentPostalCode: studentPostalCode || null,
        studentPhone: studentPhone || null,
        studentEmail: studentEmail || null,
        invoiceDate,
        dueDate: dueDate || null,
        lineItems: typeof lineItems === 'string' ? lineItems : JSON.stringify(lineItems),
        subtotal: subtotal || 0,
        gstAmount: gstAmount || 0,
        qstAmount: qstAmount || 0,
        total: total || 0,
        notes: notes || null,
        paymentMethod: paymentMethod || null,
        paymentStatus: paymentStatus || 'unpaid',
        // For a receipt entered as already paid, honor its selected date
        // (including historical receipts). Noon UTC preserves the Montréal day.
        paidAt: paymentStatus === 'paid'
          ? new Date(`${invoiceDate}T12:00:00.000Z`)
          : null,
        remainingBalance: null,
        ...billing,
        externalStudentId,
      }
      })

    // Increment the next invoice number
      await tx.invoiceSettings.upsert({
      where: { id: 'default' },
      update: {
        nextInvoiceNumber: { increment: 1 },
      },
      create: {
        id: 'default',
        nextInvoiceNumber: 2, // Start at 2 since 1 was just used
      }
      })
      return saved
    })

    // Auto-save student to local Student table for future autocomplete
    // This ensures every invoiced student appears in future searches
    try {
      if (studentName) {
        const existing = await findBestLocalStudent({ phone: studentPhone, name: studentName })

        if (existing) {
          // Update any empty fields on existing student
          await prisma.student.update({
            where: { id: existing.id },
            data: {
              phone: existing.phone || studentPhone || null,
              address: existing.address || studentAddress || null,
              municipality: existing.municipality || studentCity || null,
              province: existing.province || studentProvince || null,
              postalCode: existing.postalCode || studentPostalCode || null,
            },
          })
        } else {
          // Create a new student record
          await prisma.student.create({
            data: {
              name: studentName,
              phone: studentPhone || null,
              address: studentAddress || null,
              municipality: studentCity || null,
              province: studentProvince || 'QC',
              postalCode: studentPostalCode || null,
            },
          })
        }
      }
    } catch (studentError) {
      // Don't fail the invoice save if student save fails
      console.error('Auto-save student error (non-fatal):', studentError)
    }

    return NextResponse.json({ invoice })
  } catch (error) {
    if (error instanceof BillingReviewRequired) return NextResponse.json({ error: error.message }, { status: 409 })
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'This invoice number already exists. Reopen the saved invoice instead of creating another payment.' }, { status: 409 })
    }
    console.error('Error saving invoice:', error)
    return NextResponse.json(
      { error: 'Failed to save invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
