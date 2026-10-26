import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchStudents, createStudent } from '@/lib/external-db'
import { findBestLocalStudent } from '@/lib/local-student-lookup'
import { parseExternalStudentId, resolveExternalStudentId } from '@/lib/invoice-student-id'
import { namesEqual, phoneLast10 } from '@/lib/student-match'

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
      remainingBalance,
    } = body

    if (!invoiceNumber || !studentName) {
      return NextResponse.json(
        { error: 'Invoice number and student name are required' },
        { status: 400 }
      )
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
    const invoice = await prisma.invoice.create({
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
        remainingBalance: remainingBalance != null ? remainingBalance : null,
        externalStudentId,
      }
    })

    // Increment the next invoice number
    await prisma.invoiceSettings.upsert({
      where: { id: 'default' },
      update: {
        nextInvoiceNumber: { increment: 1 },
      },
      create: {
        id: 'default',
        nextInvoiceNumber: 2, // Start at 2 since 1 was just used
      }
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
    console.error('Error saving invoice:', error)
    return NextResponse.json(
      { error: 'Failed to save invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
