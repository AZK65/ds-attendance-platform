import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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
        const phoneDigits = (studentPhone || '').replace(/\D/g, '')
        let existing = null

        // Try to find by phone first
        if (phoneDigits.length >= 7) {
          existing = await prisma.student.findFirst({
            where: { phone: { contains: phoneDigits.slice(-10) } },
          })
        }

        // Fallback: try by name
        if (!existing) {
          existing = await prisma.student.findFirst({
            where: { name: studentName },
          })
        }

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
