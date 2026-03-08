import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchStudents, type StudentRecord } from '@/lib/external-db'

// GET /api/students/profile?phone=15145551234&name=Ahmed
// Hybrid endpoint: matches WhatsApp contact to external MySQL DB + fetches local invoices
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const phone = searchParams.get('phone') || ''
  const name = searchParams.get('name') || ''

  if (!phone && !name) {
    return NextResponse.json(
      { error: 'Phone or name is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch from both sources in parallel
    const [dbStudent, invoices] = await Promise.all([
      // 1. External MySQL: try to find student by phone, then by name
      findExternalStudent(phone, name),
      // 2. Local SQLite: find invoices for this student
      findStudentInvoices(phone, name),
    ])

    // Compute invoice summary with balance
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0)
    const totalPaid = invoices
      .filter(inv => inv.paymentStatus === 'paid')
      .reduce((sum, inv) => sum + inv.total, 0)
    const lastInvoice = invoices[0] || null // Already sorted desc

    return NextResponse.json({
      dbStudent,
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        studentName: inv.studentName,
        lineItems: inv.lineItems,
        subtotal: inv.subtotal,
        gstAmount: inv.gstAmount,
        qstAmount: inv.qstAmount,
        total: inv.total,
        notes: inv.notes,
        paymentStatus: inv.paymentStatus,
        paymentMethod: inv.paymentMethod,
        createdAt: inv.createdAt,
      })),
      summary: {
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        openBalance: Math.round((totalInvoiced - totalPaid) * 100) / 100,
        invoiceCount: invoices.length,
        lastInvoiceDate: lastInvoice?.invoiceDate || null,
      },
    })
  } catch (error) {
    console.error('[Student Profile] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch student profile', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Try to find a matching student in the external MySQL database
async function findExternalStudent(phone: string, name: string): Promise<StudentRecord | null> {
  try {
    // Strip #number suffix from WhatsApp names (e.g. "Naseer Jasba #1114" → "Naseer Jasba")
    const cleanName = name.replace(/\s*#\d+$/, '').trim()

    // Try phone first (most reliable match)
    if (phone) {
      // Strip common prefixes/formatting — search with last 10 digits
      const phoneDigits = phone.replace(/\D/g, '')
      const searchPhone = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits

      if (searchPhone.length >= 7) {
        const results = await searchStudents(searchPhone)
        if (results.length > 0) {
          // Find the best match — phone number should contain our search digits
          const match = results.find(r => {
            const dbPhone = (r.phone_number || '').replace(/\D/g, '')
            return dbPhone.includes(searchPhone) || searchPhone.includes(dbPhone.slice(-10))
          })
          if (match) return match
          // If no exact phone match, just return first result since it matched the search
          return results[0]
        }
      }
    }

    // Fallback: try name (cleaned of #number suffix)
    if (cleanName && cleanName.length >= 2) {
      const results = await searchStudents(cleanName)
      if (results.length > 0) {
        // Try to find an exact-ish name match (case insensitive)
        const nameLower = cleanName.toLowerCase()
        const exactMatch = results.find(r =>
          r.full_name.toLowerCase() === nameLower ||
          r.full_name.toLowerCase().includes(nameLower) ||
          nameLower.includes(r.full_name.toLowerCase())
        )
        return exactMatch || null // Only return if name is a good match
      }
    }

    return null
  } catch (error) {
    // External DB may be unavailable — don't fail the whole request
    console.error('[Student Profile] External DB error:', error)
    return null
  }
}

// Find invoices for a student by phone or name
async function findStudentInvoices(phone: string, name: string) {
  const conditions = []
  const cleanName = name.replace(/\s*#\d+$/, '').trim()

  if (phone) {
    // Match phone digits — strip formatting for comparison
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length >= 7) {
      conditions.push({ studentPhone: { contains: phoneDigits.slice(-10) } })
    }
  }

  if (cleanName && cleanName.length >= 2) {
    conditions.push({ studentName: { contains: cleanName } })
  }

  if (conditions.length === 0) return []

  return prisma.invoice.findMany({
    where: { OR: conditions },
    orderBy: { invoiceDate: 'desc' },
  })
}
