import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildSignatureAttendancePdf, type TheoryBooklet } from '@/lib/signature-attendance-pdf'
import { getTheoryProgress } from '@/lib/theory-progress'

// GET /api/scheduling/signature/pdf?phone=...
// Produces a vehicle-aware attendance booklet. Class 5 keeps the SAAQ
// phase layout; Class 1 is split into its 75 h theory and 50 h practical
// blocks so truck students never receive a car curriculum document.
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone') || ''
  if (!phone) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 })
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits
  if (phoneSuffix.length < 7) {
    return NextResponse.json({ error: 'phone too short' }, { status: 400 })
  }

  const [signatures, truckRegistration, truckMembership] = await Promise.all([
    prisma.classSignature.findMany({
      where: { studentPhone: { contains: phoneSuffix } },
      orderBy: { signedAt: 'asc' },
    }),
    prisma.studentRegistration.findFirst({
      where: {
        phoneNumber: { contains: phoneSuffix },
        vehicleType: 'truck',
        status: { in: ['confirmed', 'submitted'] },
      },
      select: { id: true },
    }),
    prisma.groupMember.findFirst({
      where: {
        phone: { contains: phoneSuffix },
        group: { vehicleType: 'truck' },
      },
      select: { id: true },
    }),
  ])

  const isTruck = Boolean(
    truckRegistration ||
    truckMembership ||
    signatures.some(signature => /^Class 1|^Truck (?:Class|Exam)/i.test(signature.sessionLabel || ''))
  )
  const studentName = signatures[0]?.studentName || ''
  let theory: TheoryBooklet | null = null
  if (isTruck) {
    const memberships = await prisma.groupMember.findMany({
      where: { phone: { contains: phoneSuffix }, group: { vehicleType: 'truck' } },
      select: { groupId: true },
    })
    for (const membership of memberships) {
      const progress = await getTheoryProgress(membership.groupId, phone).catch(() => null)
      if (!progress || progress.sessions.length === 0) continue
      const imageById = new Map(signatures.map(signature => [signature.id, signature.signatureDataUrl]))
      theory = {
        hoursLineEn: progress.hoursLineEn,
        hoursLineFr: progress.hoursLineFr,
        instructorLineEn: progress.instructorLineEn,
        instructorLineFr: progress.instructorLineFr,
        attendedCount: progress.attendedCount,
        requiredSessions: progress.requiredSessions,
        sessions: progress.sessions.map(session => ({
          sessionNumber: session.sessionNumber,
          date: session.date,
          startTime: session.startTime,
          endTime: session.endTime,
          netLabel: session.netLabel,
          displayEn: session.attendance?.displayEn || 'Scheduled',
          displayFr: session.attendance?.displayFr || 'À venir',
          basis: session.attendance?.basis || '',
          signatureDataUrl: session.attendance?.signatureId ? imageById.get(session.attendance.signatureId) || null : null,
          signedAt: session.attendance?.signedAt || null,
        })),
      }
      break
    }
  }
  const pdfBuffer = await buildSignatureAttendancePdf({
    signatures,
    studentName,
    phone,
    isTruck,
    theory,
  })

  const safeName = studentName.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-')
  const prefix = isTruck ? 'class-1-attendance' : 'attendance'
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${prefix}-${safeName}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
