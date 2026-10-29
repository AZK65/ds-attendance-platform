import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { describeDevice } from '@/lib/admin-session'

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002'
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(parsed)) return undefined
  return parsed
}

async function actorLabel(request: NextRequest): Promise<string | null> {
  const sid = request.cookies.get('sid')?.value
  if (!sid) return null
  const session = await prisma.adminSession.findUnique({ where: { id: sid } })
  if (!session) return sid
  return session.label?.trim() || describeDevice(session.userAgent)
}

async function logChange(args: {
  instructorId: string
  kind: 'name' | 'number'
  before: unknown
  after: unknown
  approvedBy: string | null
}) {
  await prisma.theoryCorrection.create({
    data: {
      entityType: 'Instructor',
      entityId: args.instructorId,
      kind: args.kind,
      beforeJson: JSON.stringify(args.before),
      afterJson: JSON.stringify(args.after),
      reason: 'Settings > Instructors',
      approvedBy: args.approvedBy,
      internalOnly: true,
    },
  })
}

export async function GET() {
  const instructors = await prisma.instructor.findMany({ orderBy: { displayName: 'asc' } })
  return NextResponse.json({ instructors })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const bookletName = clean(body.bookletName)
    const displayName = clean(body.displayName)
    const saaqInstructorNo = clean(body.saaqInstructorNo)
    const teamupSubcalendarId = optionalNumber(body.teamupSubcalendarId)
    if (!bookletName || !displayName) {
      return NextResponse.json({ error: 'Full name and display name are required' }, { status: 400 })
    }
    if (body.teamupSubcalendarId !== undefined && body.teamupSubcalendarId !== null && body.teamupSubcalendarId !== '' && teamupSubcalendarId === undefined) {
      return NextResponse.json({ error: 'Teamup sub-calendar must be a whole number' }, { status: 400 })
    }
    try {
      const instructor = await prisma.instructor.create({
        data: {
          legalName: bookletName,
          bookletName,
          displayName,
          saaqInstructorNo: saaqInstructorNo || null,
          teamupSubcalendarId: teamupSubcalendarId ?? null,
        },
      })
      return NextResponse.json({ instructor })
    } catch (error) {
      if (isUniqueConflict(error)) {
        return NextResponse.json({ error: 'That Teamup sub-calendar is already assigned' }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    console.error('[instructors POST]', error)
    return NextResponse.json({ error: 'Failed to add instructor' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id = clean(body.id)
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const existing = await prisma.instructor.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })

    const data: {
      legalName?: string
      bookletName?: string
      displayName?: string
      saaqInstructorNo?: string | null
      teamupSubcalendarId?: number | null
    } = {}

    if (body.bookletName !== undefined) {
      const bookletName = clean(body.bookletName)
      if (!bookletName) return NextResponse.json({ error: 'Full name cannot be empty' }, { status: 400 })
      data.bookletName = bookletName
      data.legalName = bookletName
    }
    if (body.displayName !== undefined) {
      const displayName = clean(body.displayName)
      if (!displayName) return NextResponse.json({ error: 'Display name cannot be empty' }, { status: 400 })
      data.displayName = displayName
    }
    if (body.saaqInstructorNo !== undefined) {
      data.saaqInstructorNo = clean(body.saaqInstructorNo) || null
    }
    if (body.teamupSubcalendarId !== undefined) {
      const teamupSubcalendarId = optionalNumber(body.teamupSubcalendarId)
      if (body.teamupSubcalendarId !== null && body.teamupSubcalendarId !== '' && teamupSubcalendarId === undefined) {
        return NextResponse.json({ error: 'Teamup sub-calendar must be a whole number' }, { status: 400 })
      }
      data.teamupSubcalendarId = teamupSubcalendarId ?? null
    }

    let instructor
    try {
      instructor = await prisma.instructor.update({ where: { id }, data })
    } catch (error) {
      if (isUniqueConflict(error)) {
        return NextResponse.json({ error: 'That Teamup sub-calendar is already assigned' }, { status: 409 })
      }
      throw error
    }

    const approvedBy = await actorLabel(request)
    const nameBefore = {
      bookletName: existing.bookletName,
      legalName: existing.legalName,
      displayName: existing.displayName,
    }
    const nameAfter = {
      bookletName: instructor.bookletName,
      legalName: instructor.legalName,
      displayName: instructor.displayName,
    }
    if (JSON.stringify(nameBefore) !== JSON.stringify(nameAfter)) {
      await logChange({ instructorId: id, kind: 'name', before: nameBefore, after: nameAfter, approvedBy })
    }
    if ((existing.saaqInstructorNo || null) !== (instructor.saaqInstructorNo || null)) {
      await logChange({
        instructorId: id,
        kind: 'number',
        before: { saaqInstructorNo: existing.saaqInstructorNo },
        after: { saaqInstructorNo: instructor.saaqInstructorNo },
        approvedBy,
      })
    }

    return NextResponse.json({ instructor })
  } catch (error) {
    console.error('[instructors PATCH]', error)
    return NextResponse.json({ error: 'Failed to update instructor' }, { status: 500 })
  }
}
