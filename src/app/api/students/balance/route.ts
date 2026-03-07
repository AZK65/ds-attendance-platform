import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/students/balance?phone=15145551234
// Lightweight endpoint returning invoice balance + group link for a student
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone') || ''
  const name = request.nextUrl.searchParams.get('name') || ''

  if (!phone && !name) {
    return NextResponse.json({ error: 'Phone or name is required' }, { status: 400 })
  }

  try {
    // Fetch invoices for balance calculation
    const conditions = []

    if (phone) {
      const phoneDigits = phone.replace(/\D/g, '')
      if (phoneDigits.length >= 7) {
        conditions.push({ studentPhone: { contains: phoneDigits.slice(-10) } })
      }
    }

    if (name && name.length >= 2) {
      conditions.push({ studentName: { contains: name } })
    }

    let totalInvoiced = 0
    let totalPaid = 0

    if (conditions.length > 0) {
      const invoices = await prisma.invoice.findMany({
        where: { OR: conditions },
        select: { total: true, paymentStatus: true },
      })

      totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0)
      totalPaid = invoices
        .filter(inv => inv.paymentStatus === 'paid')
        .reduce((sum, inv) => sum + inv.total, 0)
    }

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
      totalPaid: Math.round(totalPaid * 100) / 100,
      openBalance: Math.round((totalInvoiced - totalPaid) * 100) / 100,
      groupId,
      contactId,
    })
  } catch (error) {
    console.error('[Student Balance] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}
