import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { searchStudents, type StudentRecord } from '@/lib/external-db'
import { findBestLocalStudent } from '@/lib/local-student-lookup'
import { findStudentPaperExams } from '@/lib/paper-exam-profile'
import { filledDateCount, nameSearchVariants, namesEqual, phoneLast10 } from '@/lib/student-match'

// GET /api/students/profile?phone=15145551234&name=Ahmed
// Hybrid endpoint: matches WhatsApp contact to external MySQL DB + fetches local invoices
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const phone = searchParams.get('phone') || ''
  const name = searchParams.get('name') || searchParams.get('studentName') || ''
  const licenceNumber = searchParams.get('licenceNumber') || ''
  // Exact local-record id (e.g. cert-history Edit passes cert.studentId).
  // When present it's authoritative — skips fuzzy name/phone matching that
  // can land on a duplicate Student row with no dates/certificates.
  const studentId = searchParams.get('studentId') || ''
  const contactId = searchParams.get('contactId') || ''

  if (!phone && !name && !licenceNumber && !studentId) {
    return NextResponse.json(
      { error: 'Phone, name, licenceNumber or studentId is required' },
      { status: 400 }
    )
  }

  try {
    // Fetch from all sources in parallel
    const [dbStudent, invoices, localStudent, vehicleType] = await Promise.all([
      // 1. External MySQL: try to find student by phone, then by name
      findExternalStudent(phone, name),
      // 2. Local SQLite: find invoices for this student
      findStudentInvoices(phone, name),
      // 3. Local SQLite: find student record with certificates
      findLocalStudent(phone, name, licenceNumber, studentId),
      // 4. Car vs truck — from online registration or group membership
      findVehicleType(phone, name),
    ])

    // Fetch exam attempts for this student
    const [examAttempts, paperExams] = await Promise.all([
      findExamAttempts(phone, name),
      findStudentPaperExams({ phone, name, contactId }),
    ])

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
      vehicleType,
      localStudent: localStudent ? {
        id: localStudent.id,
        name: localStudent.name,
        licenceNumber: localStudent.licenceNumber,
        phone: localStudent.phone,
        phoneAlt: localStudent.phoneAlt,
        email: localStudent.email,
        avatarImage: localStudent.avatarImage,
        address: localStudent.address,
        apartment: localStudent.apartment,
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
      paperExams,
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

// Try to find a matching student in the external MySQL database.
// A usable phone matches only that last-10. It never falls through to a
// name, because the search itself is a substring and the first hit can be
// a different person. With no phone, only the exact full name matches.
async function findExternalStudent(phone: string, name: string): Promise<StudentRecord | null> {
  try {
    const phoneKey = phoneLast10(phone)
    if (phoneKey) {
      const results = await searchStudents(phoneKey)
      const matches = results.filter((student) => phoneLast10(student.phone_number) === phoneKey)
      if (matches.length > 1) {
        console.log(
          '[findExternalStudent] multiple phone matches',
          phoneKey,
          matches.map((student) => student.full_name).join('; '),
        )
      }
      return matches[0] || null
    }

    if (!namesEqual(name, name)) return null
    const seen = new Set<number>()
    const matches: StudentRecord[] = []
    for (const variant of nameSearchVariants(name)) {
      const results = await searchStudents(variant)
      for (const student of results) {
        if (seen.has(student.student_id) || !namesEqual(student.full_name, name)) continue
        seen.add(student.student_id)
        matches.push(student)
      }
    }
    if (matches.length > 1) {
      console.log(
        '[findExternalStudent] multiple name matches',
        name,
        matches.map((student) => student.full_name).join('; '),
      )
    }
    return matches[0] || null
  } catch (error) {
    // External DB may be unavailable — don't fail the whole request
    console.error('[Student Profile] External DB error:', error)
    return null
  }
}

// Car vs truck for a student matched by phone/name. Prefer what they picked
// at online registration; else infer from group membership (a truck group
// means a truck student); else default to car.
async function findVehicleType(phone: string, name: string): Promise<string> {
  const phoneDigits = phone.replace(/\D/g, '')
  const phoneSuffix = phoneDigits.length >= 7 ? phoneDigits.slice(-10) : ''
  const cleanName = name.replace(/\s*#\d+\s*/g, ' ').replace(/\s+/g, ' ').trim()

  if (phoneSuffix) {
    const reg = await prisma.studentRegistration.findFirst({
      where: { phoneNumber: { contains: phoneSuffix }, status: { in: ['confirmed', 'submitted'] } },
      orderBy: { createdAt: 'desc' },
      select: { vehicleType: true },
    })
    if (reg?.vehicleType) return reg.vehicleType

    const truckMember = await prisma.groupMember.findFirst({
      where: { phone: { contains: phoneSuffix }, group: { vehicleType: 'truck' } },
      select: { id: true },
    })
    if (truckMember) return 'truck'
  } else if (cleanName.length >= 2) {
    const reg = await prisma.studentRegistration.findFirst({
      where: { fullName: { contains: cleanName }, status: { in: ['confirmed', 'submitted'] } },
      orderBy: { createdAt: 'desc' },
      select: { vehicleType: true },
    })
    if (reg?.vehicleType) return reg.vehicleType
  }

  return 'car'
}

// Find local student record with certificates (from certificate generation)
async function findLocalStudent(phone: string, name: string, licenceNumber?: string | null, studentId?: string | null) {
  // 0. Exact id wins — authoritative, no fuzzy matching. This is what
  //    cert-history Edit uses so it loads the SAME record that download
  //    (regenerate by id) reads, instead of a duplicate with no dates.
  if (studentId) {
    const byId = await prisma.student.findUnique({
      where: { id: studentId },
      include: { certificates: { orderBy: { generatedAt: 'desc' } } },
    })
    if (byId) {
      console.log('[findLocalStudent] matched by id:', studentId, '→', byId.name)
      return byId
    }
  }

  // 1. Licence number is the strongest identifier — try it first and
  //    short-circuit if found. A formatted phone still resolves here when
  //    the licence is the one stored on the local row.
  const cleanLicence = (licenceNumber || '').trim()
  if (cleanLicence) {
    const byLicence = await prisma.student.findFirst({
      where: { licenceNumber: cleanLicence },
      include: { certificates: { orderBy: { generatedAt: 'desc' } } },
    })
    if (byLicence) {
      console.log('[findLocalStudent] matched by licenceNumber:', cleanLicence, '→', byLicence.name)
      return byLicence
    }
  }

  // Phone last-10 (or phoneAlt) is the only soft key once id and licence
  // missed. A shared word such as "Shah" inside "Shaheer" must not win.
  // With no usable phone, only the exact full name matches.
  if (!phoneLast10(phone) && !namesEqual(name, name)) return null

  console.log('[findLocalStudent] phone:', phone, 'name:', name)
  const result = await findBestLocalStudent({ phone, name })
  console.log('[findLocalStudent] result:', result ? `${result.name} (${result.certificates.length} certs, ${filledDateCount(result)} dates)` : 'null')
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
  const cleanName = name.replace(/\s*#\d+\s*/g, ' ').replace(/,/g, '').replace(/\s+/g, ' ').trim()
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
