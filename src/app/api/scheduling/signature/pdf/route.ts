import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildSignatureAttendancePdf, type AttendanceSignatureInput, type TheoryBooklet } from '@/lib/signature-attendance-pdf'
import { getTheoryProgress } from '@/lib/theory-progress'
import { lessonNetLabel } from '@/lib/theory-hours'

function last10(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

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
  let bookletSignatures: AttendanceSignatureInput[] = signatures
  if (isTruck) {
    const eventIds = [...new Set(signatures.map(signature => signature.eventId))]
    const [instructorSigs, snapshots, instructors, memberships] = await Promise.all([
      prisma.lessonInstructorSignature.findMany({
        where: { studentPhone: { contains: phoneSuffix } },
      }),
      eventIds.length
        ? prisma.teamupEventSnapshot.findMany({ where: { eventId: { in: eventIds } } })
        : Promise.resolve([]),
      prisma.instructor.findMany(),
      prisma.groupMember.findMany({
        where: { phone: { contains: phoneSuffix }, group: { vehicleType: 'truck' } },
        select: { groupId: true },
      }),
    ])
    const instructorById = new Map(instructors.map(row => [row.id, row]))
    const snapshotByEvent = new Map(snapshots.map(row => [row.eventId, row]))
    const instructorSigByKey = new Map(
      instructorSigs
        .filter(row => last10(row.studentPhone) === phoneSuffix)
        .map(row => [`${row.eventId}:${last10(row.studentPhone)}`, row]),
    )
    const fieldsFor = (eventId: string, sessionInstructorId: string | null) => {
      const signed = instructorSigByKey.get(`${eventId}:${phoneSuffix}`)
      const instructor = signed
        ? instructorById.get(signed.instructorId)
        : sessionInstructorId
          ? instructorById.get(sessionInstructorId)
          : null
      const name = signed?.bookletName?.trim() || instructor?.bookletName?.trim() || instructor?.legalName || null
      return {
        instructorName: name,
        instructorNo: instructor?.saaqInstructorNo || null,
        instructorSignatureDataUrl: signed?.signatureDataUrl || null,
        instructorSignedOn: null,
        scheduledStart: signed?.lessonStartAt?.trim() || snapshotByEvent.get(eventId)?.startDt || null,
        netLabel: lessonNetLabel(snapshotByEvent.get(eventId)?.startDt, snapshotByEvent.get(eventId)?.endDt),
      }
    }
    bookletSignatures = signatures.map(signature => ({
      ...signature,
      ...fieldsFor(signature.eventId, null),
    }))
    for (const membership of memberships) {
      const progress = await getTheoryProgress(membership.groupId, phone).catch(() => null)
      if (!progress || progress.sessions.length === 0) continue
      const imageById = new Map(signatures.map(signature => [signature.id, signature.signatureDataUrl]))
      const header = progress.instructor
      theory = {
        hoursLineEn: progress.hoursLineEn,
        hoursLineFr: progress.hoursLineFr,
        instructorLineEn: progress.instructorLineEn,
        instructorLineFr: progress.instructorLineFr,
        headerInstructor: header
          ? {
            bookletName: header.bookletName?.trim() || header.legalName,
            saaqInstructorNo: header.saaqInstructorNo,
          }
          : null,
        attendedCount: progress.attendedCount,
        requiredSessions: progress.requiredSessions,
        sessions: progress.sessions.map(session => {
          const fields = fieldsFor(session.teamupEventId || '', session.instructorId)
          return {
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
            instructorName: fields.instructorName,
            instructorNo: fields.instructorNo,
            instructorSignatureDataUrl: fields.instructorSignatureDataUrl,
            instructorSignedOn: fields.instructorSignedOn,
          }
        }),
      }
      break
    }
  }
  const pdfBuffer = await buildSignatureAttendancePdf({
    signatures: bookletSignatures,
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
