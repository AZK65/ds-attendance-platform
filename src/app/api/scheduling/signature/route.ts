import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { signInTheoryLabel } from '@/lib/theory-hours'

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002'
}

// POST /api/scheduling/signature
// Body: { eventId, studentPhone, studentName, signatureDataUrl,
//         sessionLabel?, moduleNumber?, sortieNumber? }
//
// Creates a per-(event, student) signature. A second signature for the same
// student and lesson is rejected. Also marks the corresponding ClassAttendance
// row as present so the rest of the app sees the student as having attended.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      eventId,
      studentPhone,
      studentName,
      signatureDataUrl,
      sessionLabel,
      moduleNumber,
      sortieNumber,
      practicalUnitIndex,
    } = body as {
      eventId?: string
      studentPhone?: string
      studentName?: string
      signatureDataUrl?: string
      sessionLabel?: string
      moduleNumber?: number
      sortieNumber?: number
      practicalUnitIndex?: number | null
    }

    if (!eventId || !studentPhone || !studentName || !signatureDataUrl) {
      return NextResponse.json(
        { error: 'eventId, studentPhone, studentName, and signatureDataUrl are required' },
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

    const cleanedPhone = studentPhone.replace(/\D/g, '')
    const unitIndex = practicalUnitIndex == null ? null : Number(practicalUnitIndex)
    if (unitIndex != null && (!Number.isInteger(unitIndex) || unitIndex < 0 || unitIndex > 60)) {
      return NextResponse.json({ error: 'practicalUnitIndex is not a class in this booking' }, { status: 400 })
    }

    // A later 2-hour slice of a practical booking. The drawing in the body
    // is the only ink stored. Nothing is read from another class or from
    // the booking-level ClassSignature, and that row is not updated.
    if (unitIndex != null && unitIndex > 0) {
      const existing = await prisma.practicalClassUnitSignature.findUnique({
        where: {
          eventId_studentPhone_unitIndex: { eventId, studentPhone: cleanedPhone, unitIndex },
        },
        select: { id: true },
      })
      if (existing) {
        return NextResponse.json({ error: 'already signed' }, { status: 409 })
      }
      try {
        const created = await prisma.practicalClassUnitSignature.create({
          data: {
            eventId,
            studentPhone: cleanedPhone,
            unitIndex,
            studentName,
            sessionLabel: sessionLabel || null,
            signatureDataUrl,
          },
        })
        return NextResponse.json({ success: true, id: created.id, signedAt: created.signedAt, unitIndex })
      } catch (error) {
        if (isUniqueConflict(error)) {
          return NextResponse.json({ error: 'already signed' }, { status: 409 })
        }
        throw error
      }
    }

    let resolvedLabel = sessionLabel || null
    try {
      const theory = await prisma.theorySession.findUnique({ where: { teamupEventId: eventId } })
      if (theory) {
        const group = await prisma.group.findUnique({
          where: { id: theory.groupId },
          select: { name: true },
        })
        if (group?.name) resolvedLabel = signInTheoryLabel(theory.sessionNumber, group.name)
      }
    } catch {
      // Theory tables are not available. Keep the label the client sent.
    }

    const already = await prisma.classSignature.findUnique({
      where: { eventId_studentPhone: { eventId, studentPhone: cleanedPhone } },
      select: { id: true },
    })
    if (already) {
      return NextResponse.json({ error: 'already signed' }, { status: 409 })
    }

    let signature
    try {
      signature = await prisma.classSignature.create({
        data: {
          eventId,
          studentPhone: cleanedPhone,
          studentName,
          sessionLabel: resolvedLabel,
          moduleNumber: moduleNumber ?? null,
          sortieNumber: sortieNumber ?? null,
          signatureDataUrl,
        },
      })
    } catch (error) {
      if (isUniqueConflict(error)) {
        return NextResponse.json({ error: 'already signed' }, { status: 409 })
      }
      throw error
    }

    try {
      const theory = await prisma.theorySession.findUnique({ where: { teamupEventId: eventId } })
      if (theory) {
        await prisma.theoryAttendance.upsert({
          where: { sessionId_studentPhone: { sessionId: theory.id, studentPhone: cleanedPhone } },
          create: {
            sessionId: theory.id,
            studentPhone: cleanedPhone,
            status: 'present',
            basis: 'signature',
            signatureId: signature.id,
          },
          update: {
            status: 'present',
            basis: 'signature',
            signatureId: signature.id,
          },
        })
      }
    } catch (err) {
      console.warn('[signature] theory attendance not recorded:', err)
    }

    // Auto-mark attendance present (best-effort)
    try {
      await prisma.classAttendance.upsert({
        where: { eventId },
        create: { eventId, present: true },
        update: { present: true, updatedAt: new Date() },
      })
    } catch (err) {
      console.warn('[signature] failed to upsert ClassAttendance:', err)
    }

    return NextResponse.json({ success: true, id: signature.id, signedAt: signature.signedAt })
  } catch (error) {
    console.error('[signature POST] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save signature' },
      { status: 500 },
    )
  }
}

// GET /api/scheduling/signature?eventId=... | ?phone=... | ?since=<ISO>
// Returns saved signatures for a class, a student, or signed since a given
// timestamp (used by Sign-In Mode to know which today-events have been signed).
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId') || ''
  const phone = request.nextUrl.searchParams.get('phone') || ''
  const since = request.nextUrl.searchParams.get('since') || ''

  if (!eventId && !phone && !since) {
    return NextResponse.json({ error: 'eventId, phone, or since required' }, { status: 400 })
  }

  const where: {
    eventId?: string
    studentPhone?: { contains: string }
    signedAt?: { gte: Date }
  } = {}
  if (eventId) where.eventId = eventId
  if (phone) {
    const digits = phone.replace(/\D/g, '')
    where.studentPhone = { contains: digits.length >= 10 ? digits.slice(-10) : digits }
  }
  if (since) {
    const d = new Date(since)
    if (!isNaN(d.getTime())) where.signedAt = { gte: d }
  }

  // For listings (since-only or phone-only) we don't need the giant
  // base64 image — return metadata so the iPad's "signed?" lookup is
  // small and fast. Per-class fetches with eventId still get the full
  // payload because the PDF route needs it. Phone queries can opt into
  // signature data via ?includeSignatures=1 (student profile timeline).
  const includeSignatures = request.nextUrl.searchParams.get('includeSignatures') === '1'
  const includeData = !!eventId || includeSignatures
  const unitIndexRaw = request.nextUrl.searchParams.get('unitIndex')
  const unitIndex = unitIndexRaw == null || unitIndexRaw === '' ? null : Number(unitIndexRaw)
  if (unitIndex != null && (!Number.isInteger(unitIndex) || unitIndex < 0)) {
    return NextResponse.json({ error: 'unitIndex is invalid' }, { status: 400 })
  }

  const phoneSuffix = phone
    ? (phone.replace(/\D/g, '').length >= 10 ? phone.replace(/\D/g, '').slice(-10) : phone.replace(/\D/g, ''))
    : ''

  // A later slice of a practical booking lives in its own table. Unit 0
  // stays on ClassSignature, so an event lookup without unitIndex is unchanged.
  if (unitIndex != null && unitIndex > 0) {
    const unitWhere: { eventId?: string; unitIndex: number; studentPhone?: { contains: string } } = { unitIndex }
    if (eventId) unitWhere.eventId = eventId
    if (phoneSuffix) unitWhere.studentPhone = { contains: phoneSuffix }
    const unitRows = await prisma.practicalClassUnitSignature.findMany({
      where: unitWhere,
      orderBy: { signedAt: 'desc' },
    })
    return NextResponse.json({
      signatures: unitRows.map(row => ({
        id: row.id,
        eventId: row.eventId,
        studentPhone: row.studentPhone,
        studentName: row.studentName,
        sessionLabel: row.sessionLabel,
        moduleNumber: null,
        sortieNumber: null,
        signedAt: row.signedAt,
        unitIndex: row.unitIndex,
        ...(includeData ? { signatureDataUrl: row.signatureDataUrl } : {}),
      })),
    })
  }

  const signatures = await prisma.classSignature.findMany({
    where,
    orderBy: { signedAt: 'desc' },
    select: includeData
      ? undefined
      : {
          id: true,
          eventId: true,
          studentPhone: true,
          studentName: true,
          sessionLabel: true,
          moduleNumber: true,
          sortieNumber: true,
          signedAt: true,
        },
  })

  const withUnit = signatures.map(row => ({ ...row, unitIndex: null as number | null }))
  if (eventId || !phoneSuffix) {
    return NextResponse.json({ signatures: withUnit })
  }

  const laterSlices = await prisma.practicalClassUnitSignature.findMany({
    where: { studentPhone: { contains: phoneSuffix } },
    orderBy: { signedAt: 'desc' },
  })
  const extra = laterSlices.map(row => ({
    id: row.id,
    eventId: row.eventId,
    studentPhone: row.studentPhone,
    studentName: row.studentName,
    sessionLabel: row.sessionLabel,
    moduleNumber: null as number | null,
    sortieNumber: null as number | null,
    signedAt: row.signedAt,
    unitIndex: row.unitIndex,
    ...(includeData ? { signatureDataUrl: row.signatureDataUrl } : {}),
  }))
  return NextResponse.json({ signatures: [...withUnit, ...extra] })
}
