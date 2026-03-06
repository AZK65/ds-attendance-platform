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

    return NextResponse.json({ invoice })
  } catch (error) {
    console.error('Error saving invoice:', error)
    return NextResponse.json(
      { error: 'Failed to save invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
