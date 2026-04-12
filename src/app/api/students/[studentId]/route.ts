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

    return NextResponse.json({
      student: dbStudent,
      localStudent: localStudent ? {
        id: localStudent.id,
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
