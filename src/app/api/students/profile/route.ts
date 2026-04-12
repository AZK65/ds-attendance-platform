import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchStudents, type StudentRecord } from '@/lib/external-db'

// GET /api/students/profile?phone=15145551234&name=Ahmed
// Hybrid endpoint: matches WhatsApp contact to external MySQL DB + fetches local invoices
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const phone = searchParams.get('phone') || ''
  const name = searchParams.get('name') || searchParams.get('studentName') || ''

  if (!phone && !name) {
    return NextResponse.json(
      { error: 'Phone or name is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch from all sources in parallel
    const [dbStudent, invoices, localStudent] = await Promise.all([
      // 1. External MySQL: try to find student by phone, then by name
      findExternalStudent(phone, name),
      // 2. Local SQLite: find invoices for this student
      findStudentInvoices(phone, name),
      // 3. Local SQLite: find student record with certificates
      findLocalStudent(phone, name),
    ])

    // Fetch exam attempts for this student
    const examAttempts = await findExamAttempts(phone, name)

    // Compute invoice summary with balance
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0)
    const totalPaid = invoices
      .filter(inv => inv.paymentStatus === 'paid')
      .reduce((sum, inv) => sum + inv.total, 0)
    const lastInvoice = invoices[0] || null // Already sorted desc

    // For the open balance, use remainingBalance from the most recent invoice if available.
    // This is package-aware: it captures the full package total minus what's been invoiced,
    // so even when all current invoices are paid, it still shows what the student owes
    // for future installments. Fall back to simple unpaid total if no remainingBalance.
    const latestRemainingBalance = lastInvoice?.remainingBalance
    const simpleBalance = totalInvoiced - totalPaid
    const openBalance = (latestRemainingBalance != null && latestRemainingBalance > 0)
      ? latestRemainingBalance
      : simpleBalance

    return NextResponse.json({
      dbStudent,
      localStudent: localStudent ? {
        id: localStudent.id,
        name: localStudent.name,
        licenceNumber: localStudent.licenceNumber,
        phone: localStudent.phone,
        phoneAlt: localStudent.phoneAlt,
        address: localStudent.address,
        municipality: localStudent.municipality,
        province: localStudent.province,
        postalCode: localStudent.postalCode,
        registrationDate: localStudent.registrationDate,
        expiryDate: localStudent.expiryDate,
        module1Date: localStudent.module1Date,
        module2Date: localStudent.module2Date,
        module3Date: localStudent.module3Date,
        module4Date: localStudent.module4Date,
        module5Date: localStudent.module5Date,
        module6Date: localStudent.module6Date,
        module7Date: localStudent.module7Date,
        module8Date: localStudent.module8Date,
        module9Date: localStudent.module9Date,
        module10Date: localStudent.module10Date,
        module11Date: localStudent.module11Date,
        module12Date: localStudent.module12Date,
        sortie1Date: localStudent.sortie1Date,
        sortie2Date: localStudent.sortie2Date,
        sortie3Date: localStudent.sortie3Date,
        sortie4Date: localStudent.sortie4Date,
        sortie5Date: localStudent.sortie5Date,
        sortie6Date: localStudent.sortie6Date,
        sortie7Date: localStudent.sortie7Date,
        sortie8Date: localStudent.sortie8Date,
        sortie9Date: localStudent.sortie9Date,
        sortie10Date: localStudent.sortie10Date,
        sortie11Date: localStudent.sortie11Date,
        sortie12Date: localStudent.sortie12Date,
        sortie13Date: localStudent.sortie13Date,
        sortie14Date: localStudent.sortie14Date,
        sortie15Date: localStudent.sortie15Date,
        certificates: localStudent.certificates.map(cert => ({
          id: cert.id,
          certificateType: cert.certificateType,
          contractNumber: cert.contractNumber,
          attestationNumber: cert.attestationNumber,
          generatedAt: cert.generatedAt,
        })),
      } : null,
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
      exams: examAttempts.map(ea => ({
        id: ea.id,
        examCode: ea.exam.code,
        groupName: ea.exam.groupName,
        score: ea.score,
        passed: ea.passed,
        totalQuestions: 24,
        startedAt: ea.startedAt,
        submittedAt: ea.submittedAt,
        timeExpired: ea.timeExpired,
      })),
      summary: {
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        openBalance: Math.round(openBalance * 100) / 100,
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

// Find local student record with certificates (from certificate generation)
async function findLocalStudent(phone: string, name: string) {
  const cleanName = name.replace(/\s*#\d+$/, '').replace(/,/g, '').trim()
  const conditions = []

  if (phone) {
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length >= 7) {
      conditions.push({ phone: { contains: phoneDigits.slice(-10) } })
    }
  }

  if (cleanName && cleanName.length >= 2) {
    // Also try individual name parts for better matching (e.g. "MAVIS, OLANSEY" → search "MAVIS" and "OLANSEY")
    const nameParts = cleanName.split(/\s+/).filter(p => p.length >= 2)
    for (const part of nameParts) {
      conditions.push({ name: { contains: part } })
    }
  }

  if (conditions.length === 0) return null

  console.log('[findLocalStudent] phone:', phone, 'name:', name, 'conditions:', JSON.stringify(conditions))

  const result = await prisma.student.findFirst({
    where: { OR: conditions },
    include: {
      certificates: {
        orderBy: { generatedAt: 'desc' },
      },
    },
  })

  console.log('[findLocalStudent] result:', result ? `${result.name} (${result.certificates.length} certs)` : 'null')
  return result
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

// Find exam attempts for a student by name parts or phone
async function findExamAttempts(phone: string, name: string) {
  const cleanName = name.replace(/\s*#\d+$/, '').replace(/,/g, '').trim()
  const nameParts = cleanName.split(/\s+/).filter(p => p.length >= 2)
  const conditions: Array<{ studentName?: { contains: string }; studentPhone?: { contains: string } }> = []

  for (const part of nameParts) {
    conditions.push({ studentName: { contains: part } })
  }
  if (cleanName.length >= 2) {
    conditions.push({ studentName: { contains: cleanName } })
  }

  if (phone) {
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length >= 7) {
      conditions.push({ studentPhone: { contains: phoneDigits.slice(-10) } })
    }
  }

  if (conditions.length === 0) return []

  return prisma.examAttempt.findMany({
    where: { OR: conditions },
    include: { exam: { select: { code: true, groupName: true } } },
    orderBy: { startedAt: 'desc' },
  })
}
