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
    } = body as {
      eventId?: string
      studentPhone?: string
      studentName?: string
      signatureDataUrl?: string
      sessionLabel?: string
      moduleNumber?: number
      sortieNumber?: number
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
  return NextResponse.json({ signatures })
}
