import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/students/dismissed — list recently removed students (newest first)
export async function GET() {
  try {
    const dismissed = await prisma.dismissedStudent.findMany({ orderBy: { deletedAt: 'desc' } })
    return NextResponse.json({ dismissed })
  } catch (error) {
    console.error('Error listing dismissed students:', error)
    return NextResponse.json({ error: 'Failed to list' }, { status: 500 })
  }
}

// POST /api/students/dismissed — hide a student from Active Students (recoverable)
// Body: { studentKey, name?, phone? }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { studentKey?: string; name?: string; phone?: string }
    const studentKey = body.studentKey?.trim()
    if (!studentKey) return NextResponse.json({ error: 'studentKey required' }, { status: 400 })
    const dismissed = await prisma.dismissedStudent.upsert({
      where: { studentKey },
      create: { studentKey, name: body.name || null, phone: body.phone || null },
      update: { name: body.name || null, phone: body.phone || null, deletedAt: new Date() },
    })
    return NextResponse.json({ dismissed })
  } catch (error) {
    console.error('Error dismissing student:', error)
    return NextResponse.json({ error: 'Failed to remove' }, { status: 500 })
  }
}

// DELETE /api/students/dismissed?key=... — restore (un-hide) a student
export async function DELETE(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')?.trim()
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  try {
    await prisma.dismissedStudent.deleteMany({ where: { studentKey: key } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error restoring student:', error)
    return NextResponse.json({ error: 'Failed to restore' }, { status: 500 })
  }
}
