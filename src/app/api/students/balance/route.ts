import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { findInvoicesForStudent } from '@/lib/invoice-lookup'
import { studentBillingSummary } from '@/lib/invoice-billing'
import { parseExternalStudentId } from '@/lib/invoice-student-id'

// GET /api/students/balance?phone=15145551234
// Lightweight endpoint returning invoice balance + group link for a student.
// Invoices match by MySQL student id, then phone last-10, then exact name
// only when there is no phone. Legacy snapshots remain explicitly unreviewed.
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone') || ''
  const name = request.nextUrl.searchParams.get('name') || ''
  const externalStudentId = parseExternalStudentId(request.nextUrl.searchParams.get('externalStudentId'))

  if (!phone && !name && externalStudentId == null) {
    return NextResponse.json({ error: 'Phone or name is required' }, { status: 400 })
  }

  try {
    const invoices = await findInvoicesForStudent({ externalStudentId, phone, name })
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0)
    const billing = await studentBillingSummary({ externalStudentId, phone, name })

    // Try to resolve phone → groupId for profile linking
    let groupId: string | null = null
    let contactId: string | null = null
    if (phone) {
      const phoneDigits = phone.replace(/\D/g, '')
      // Contact IDs in WhatsApp are stored as phone@c.us
      const contact = await prisma.contact.findFirst({
        where: {
          phone: { contains: phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits },
        },
      })
      if (contact) {
        contactId = contact.id
        // Find which group this contact belongs to via attendance records
        const record = await prisma.attendanceRecord.findFirst({
          where: { contactId: contact.id },
          include: { attendanceSheet: true },
          orderBy: { date: 'desc' },
        })
        if (record?.attendanceSheet?.groupId) {
          groupId = record.attendanceSheet.groupId
        }
      }
      // Fallback: construct contactId from phone
      if (!contactId && phoneDigits) {
        contactId = `${phoneDigits}@c.us`
      }

    }

    return NextResponse.json({
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      ...billing,
      // The invoice screen must not depend on Zoom, exams, or MySQL profile
      // lookups to display local receipts. A failed request is never an empty history.
      invoices: invoices.map(row => ({ id: row.id, invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate, paidAt: row.paidAt, total: row.total,
        paymentStatus: row.paymentStatus, paymentMethod: row.paymentMethod })),
      groupId,
      contactId,
    })
  } catch (error) {
    console.error('[Student Balance] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}
