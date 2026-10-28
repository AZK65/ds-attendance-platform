import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002'
}

function digits(value: string): string {
  return value.replace(/\D/g, '')
}

function last10(value: string): string {
  const cleaned = digits(value)
  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned
}

// POST /api/scheduling/instructor-signature
// Create-only. One drawing can cover every student who signed that lesson.
// A row that already exists for the same event and student returns 409 and
// nothing is written.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      eventId,
      studentPhone,
      studentPhones,
      signatureDataUrl,
      instructorId,
      addedLater,
    } = body as {
      eventId?: string
      studentPhone?: string
      studentPhones?: string[]
      signatureDataUrl?: string
      instructorId?: string
      addedLater?: boolean
    }

    const phones = [...new Set(
      (Array.isArray(studentPhones) ? studentPhones : [])
        .concat(studentPhone ? [studentPhone] : [])
        .map(phone => digits(phone))
        .filter(phone => phone.length >= 7),
    )]
    if (!eventId || !instructorId || !signatureDataUrl || phones.length === 0) {
      return NextResponse.json(
        { error: 'eventId, instructorId, signatureDataUrl, and at least one student phone are required' },
        { status: 400 },
      )
    }
    if (!signatureDataUrl.startsWith('data:image/')) {
      return NextResponse.json(
        { error: 'signatureDataUrl must be a data URL (data:image/...)' },
        { status: 400 },
      )
    }
    if (signatureDataUrl.length > 200_000) {
      return NextResponse.json(
        { error: 'Signature image is too large — please use a smaller canvas' },
        { status: 413 },
      )
    }

    const instructor = await prisma.instructor.findUnique({ where: { id: instructorId } })
    if (!instructor) {
      return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
    }
    const bookletName = instructor.bookletName?.trim() || instructor.legalName.trim()
    if (!bookletName) {
      return NextResponse.json({ error: 'Instructor full name is required before sign-off' }, { status: 400 })
    }

    const [theory, snapshot, studentSignatures] = await Promise.all([
      prisma.theorySession.findUnique({ where: { teamupEventId: eventId } }),
      prisma.teamupEventSnapshot.findUnique({ where: { eventId } }),
      prisma.classSignature.findMany({
        where: { eventId },
        select: { id: true, studentPhone: true },
      }),
    ])
    const studentByPhone = new Map(studentSignatures.map(row => [last10(row.studentPhone), row]))
    const missing = phones.filter(phone => !studentByPhone.has(last10(phone)))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Student has not signed this lesson', phones: missing },
        { status: 400 },
      )
    }

    const kind = theory ? 'theory' : 'practical'
    const lessonStartAt = theory
      ? `${theory.date} ${theory.startTime}`
      : snapshot?.startDt?.trim() || ''

    try {
      const created = await prisma.$transaction(async (tx) => {
        const existing = await tx.lessonInstructorSignature.findMany({
          where: { eventId, studentPhone: { in: phones } },
          select: { studentPhone: true },
        })
        if (existing.length > 0) {
          const conflict = new Error('already signed')
          ;(conflict as Error & { status: number }).status = 409
          throw conflict
        }
        const rows = []
        for (const phone of phones) {
          const student = studentByPhone.get(last10(phone))
          rows.push(await tx.lessonInstructorSignature.create({
            data: {
              eventId,
              studentPhone: phone,
              classSignatureId: student?.id || null,
              instructorId: instructor.id,
              bookletName,
              lessonKind: kind,
              lessonStartAt,
              signatureDataUrl,
              method: 'drawn',
              addedLater: addedLater === true,
            },
          }))
        }
        return rows
      })
      return NextResponse.json({
        success: true,
        ids: created.map(row => row.id),
        count: created.length,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'already signed') {
        return NextResponse.json({ error: 'already signed' }, { status: 409 })
      }
      if (isUniqueConflict(error)) {
        return NextResponse.json({ error: 'already signed' }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    console.error('[instructor-signature POST] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save instructor signature' },
      { status: 500 },
    )
  }
}

// GET /api/scheduling/instructor-signature?eventId= | ?phone=
// Metadata for Sign-In Mode and the student page. Images only with
// ?includeSignatures=1. suggestSubcalendarId picks the practical default.
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId') || ''
  const phone = request.nextUrl.searchParams.get('phone') || ''
  const suggestSubcalendarId = request.nextUrl.searchParams.get('suggestSubcalendarId') || ''
  if (!eventId && !phone) {
    return NextResponse.json({ error: 'eventId or phone required' }, { status: 400 })
  }

  const where: { eventId?: string; studentPhone?: { contains: string } } = {}
  if (eventId) where.eventId = eventId
  if (phone) {
    const suffix = last10(phone)
    if (suffix) where.studentPhone = { contains: suffix }
  }
  const includeSignatures = request.nextUrl.searchParams.get('includeSignatures') === '1'

  const [signatures, instructors, theory] = await Promise.all([
    prisma.lessonInstructorSignature.findMany({
      where,
      orderBy: { signedAt: 'asc' },
      select: includeSignatures
        ? undefined
        : {
          id: true,
          eventId: true,
          studentPhone: true,
          classSignatureId: true,
          instructorId: true,
          bookletName: true,
          lessonKind: true,
          lessonStartAt: true,
          addedLater: true,
          signedAt: true,
        },
    }),
    prisma.instructor.findMany({ orderBy: { displayName: 'asc' } }),
    eventId
      ? prisma.theorySession.findUnique({
        where: { teamupEventId: eventId },
        select: { instructorId: true },
      })
      : Promise.resolve(null),
  ])

  const subcalendarId = Number(suggestSubcalendarId)
  const fromCalendar = Number.isFinite(subcalendarId)
    ? instructors.find(row => row.teamupSubcalendarId === subcalendarId)
    : null
  const suggestedInstructorId = theory?.instructorId || fromCalendar?.id || null

  return NextResponse.json({ signatures, instructors, suggestedInstructorId })
}
