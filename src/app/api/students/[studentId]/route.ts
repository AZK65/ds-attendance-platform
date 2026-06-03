import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getStudentById } from '@/lib/external-db'

// GET /api/students/[studentId] — Get full student profile from MySQL + SQLite
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params
  const id = parseInt(studentId)

  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 })
  }

  try {
    // Fetch from MySQL
    const dbStudent = await getStudentById(id)
    if (!dbStudent) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Fetch local data (invoices, certificates, group memberships)
    const phone = dbStudent.phone_number?.replace(/\D/g, '') || ''
    const phoneSearch = phone.length > 10 ? phone.slice(-10) : phone

    const [localStudent, invoices, groupMemberships] = await Promise.all([
      // SQLite Student record (has certificates)
      phoneSearch.length >= 7
        ? prisma.student.findFirst({
            where: { OR: [{ phone: { contains: phoneSearch } }, { name: { contains: dbStudent.full_name } }] },
            include: { certificates: { orderBy: { generatedAt: 'desc' } } },
          })
        : null,
      // Invoices
      phoneSearch.length >= 7
        ? prisma.invoice.findMany({
            where: { OR: [{ studentPhone: { contains: phoneSearch } }, { studentName: { contains: dbStudent.full_name } }] },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      // Group memberships
      phoneSearch.length >= 7
        ? prisma.groupMember.findMany({
            where: { phone: { contains: phoneSearch } },
            include: {
              contact: true,
              group: { select: { id: true, name: true, moduleNumber: true } },
            },
          })
        : [],
    ])

    // Fetch exam attempts by student name or phone
    const nameParts = dbStudent.full_name.trim().split(/\s+/).filter((p: string) => p.length >= 2)
    const examNameConditions = [
      { studentName: { contains: dbStudent.full_name } },
      ...nameParts.map((part: string) => ({ studentName: { contains: part } })),
    ]
    const examPhoneConditions = phoneSearch.length >= 7
      ? [{ studentPhone: { contains: phoneSearch } }]
      : []
    const examAttempts = await prisma.examAttempt.findMany({
      where: { OR: [...examNameConditions, ...examPhoneConditions] },
      include: { exam: { select: { code: true, groupName: true } } },
      orderBy: { startedAt: 'desc' },
    })

    // Invoice summary
    const totalInvoiced = invoices.reduce((s, inv) => s + inv.total, 0)
    const totalPaid = invoices.filter(inv => inv.paymentStatus === 'paid').reduce((s, inv) => s + inv.total, 0)

    // Pull the original StudentRegistration (online registration source) so we can
    // surface the SAAQ 6224A medical declaration + signature on the profile.
    const registration = await prisma.studentRegistration.findFirst({
      where: {
        OR: [
          { externalId: id },
          ...(phoneSearch.length >= 7 ? [{ phoneNumber: { contains: phoneSearch } }] : []),
        ],
        status: { in: ['confirmed', 'submitted'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      student: dbStudent,
      registration: registration ? {
        id: registration.id,
        medical: registration.medical,
        signatureImage: registration.signatureImage,
        idImage: registration.idImage,
        submittedAt: registration.submittedAt,
        confirmedAt: registration.confirmedAt,
      } : null,
      localStudent: localStudent ? {
        id: localStudent.id,
        email: localStudent.email,
        certificates: localStudent.certificates.map(c => ({
          id: c.id,
          certificateType: c.certificateType,
          contractNumber: c.contractNumber,
          attestationNumber: c.attestationNumber,
          generatedAt: c.generatedAt,
        })),
      } : null,
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        total: inv.total,
        paymentStatus: inv.paymentStatus,
        lineItems: inv.lineItems,
      })),
      groups: groupMemberships.map(gm => ({
        groupId: gm.groupId,
        groupName: gm.group.name,
        moduleNumber: gm.group.moduleNumber,
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
        openBalance: Math.round((totalInvoiced - totalPaid) * 100) / 100,
        invoiceCount: invoices.length,
        certificateCount: localStudent?.certificates.length || 0,
        groupCount: groupMemberships.length,
      },
    })
  } catch (error) {
    console.error('Error fetching student profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch student', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PATCH /api/students/[studentId] — update fields on the local SQLite
// Student record that's linked to the MySQL student. Currently only
// supports `email`. Creates the SQLite row if it doesn't exist yet so
// admins can add an email to any DB-matched student.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params
  const id = parseInt(studentId)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 })
  }

  try {
    const body = await request.json() as { email?: string | null }
    const newEmail = typeof body.email === 'string' ? body.email.trim() : body.email
    if (newEmail === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const dbStudent = await getStudentById(id)
    if (!dbStudent) {
      return NextResponse.json({ error: 'Student not found in DB' }, { status: 404 })
    }

    const phoneDigits = (dbStudent.phone_number || '').replace(/\D/g, '')
    const phoneSearch = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits
    const licence = dbStudent.permit_number?.trim() || null

    // Find existing local Student — by licence first, then phone, then name.
    let local = null as Awaited<ReturnType<typeof prisma.student.findFirst>>
    if (licence) {
      local = await prisma.student.findFirst({ where: { licenceNumber: licence } })
    }
    if (!local && phoneSearch.length >= 7) {
      local = await prisma.student.findFirst({ where: { phone: { contains: phoneSearch } } })
    }
    if (!local && dbStudent.full_name) {
      local = await prisma.student.findFirst({ where: { name: dbStudent.full_name } })
    }

    if (local) {
      const updated = await prisma.student.update({
        where: { id: local.id },
        data: { email: newEmail || null },
      })
      return NextResponse.json({ ok: true, student: { id: updated.id, email: updated.email } })
    }

    // No local row yet — create one with just enough data so the email can
    // be stored alongside (and so future generation flows merge into the
    // same row instead of spawning a duplicate).
    const created = await prisma.student.create({
      data: {
        name: dbStudent.full_name || `Student ${id}`,
        phone: dbStudent.phone_number || null,
        licenceNumber: licence,
        email: newEmail || null,
      },
    })
    return NextResponse.json({ ok: true, student: { id: created.id, email: created.email } })
  } catch (error) {
    console.error('PATCH /api/students/[studentId] failed:', error)
    return NextResponse.json(
      { error: 'Failed to update student', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
