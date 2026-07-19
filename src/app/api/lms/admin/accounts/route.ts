import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureAccount, resolveLocalStudentId, resolveOrCreateLocalStudentId } from '@/lib/lms'

const STUDY_URL = 'https://study.qazidriving.ca'

// GET /api/lms/admin/accounts?studentId=|phone=|name=|licence= — account status
// for a student (profile panel). Resolves to the local Student. No hash.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const localId = await resolveLocalStudentId({
    studentId: sp.get('studentId') || undefined,
    phone: sp.get('phone') || undefined,
    name: sp.get('name') || undefined,
    licence: sp.get('licence') || undefined,
  })
  if (!localId) return NextResponse.json({ account: null })
  const account = await prisma.lmsAccount.findUnique({
    where: { studentId: localId },
    select: { id: true, username: true, vehicleType: true, createdAt: true, lastLoginAt: true },
  })
  return NextResponse.json({ account })
}

// POST — create/reset accounts.
// { action: "create", studentId }            → make (or return) one account
// { action: "reset", studentId }             → new random password
// { action: "send", studentId }              → WhatsApp the credentials
// { action: "generate-all" }                 → create accounts for all students
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const action = body?.action as string

  if (action === 'generate-all') {
    const students = await prisma.student.findMany({
      where: { lmsAccount: null },
      select: { id: true },
    })
    let created = 0
    for (const s of students) {
      try { await ensureAccount(s.id); created++ } catch { /* skip */ }
    }
    return NextResponse.json({ success: true, created, alreadyHad: undefined })
  }

  // Resolve (or create) the local Student from whatever the profile passes.
  const studentId = await resolveOrCreateLocalStudentId({
    studentId: body?.studentId,
    phone: body?.phone,
    name: body?.name,
    licence: body?.licence,
  }).catch(() => '')
  if (!studentId) return NextResponse.json({ error: 'Could not resolve student' }, { status: 400 })

  if (action === 'create' || action === 'reset') {
    const { account, password, created } = await ensureAccount(studentId, { resetPassword: action === 'reset' })
    // password is null when action==create and the account already existed.
    return NextResponse.json({ username: account.username, password, created })
  }

  if (action === 'send') {
    // Reset to a fresh password so we have plaintext to send.
    const { account, password } = await ensureAccount(studentId, { resetPassword: true })
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { phone: true, name: true } })
    if (!student?.phone) return NextResponse.json({ error: 'Student has no phone number' }, { status: 400 })
    try {
      const { sendPrivateMessage } = await import('@/lib/whatsapp/client')
      await sendPrivateMessage(
        student.phone,
        `📚 *Qazi Driving School — Study Portal*\n\nHi ${student.name}, your online course login:\n\n🌐 ${STUDY_URL}\n👤 Username: ${account.username}\n🔑 Password: ${password}\n\nKeep this safe. You can reset your password from the login page anytime.`
      )
      return NextResponse.json({ success: true, username: account.username })
    } catch (e) {
      console.error('[lms send credentials] failed:', e)
      return NextResponse.json({ error: 'WhatsApp send failed — is WhatsApp connected?', username: account.username, password }, { status: 503 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
