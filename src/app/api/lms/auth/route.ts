import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  LMS_COOKIE, LMS_COOKIE_OPTS, verifyPassword, hashPassword, hashResetCode,
  createLmsSession, getLmsAccount, logLmsEvent,
} from '@/lib/lms'

// GET /api/lms/auth — who am I? (student session)
export async function GET(request: NextRequest) {
  const account = await getLmsAccount(request)
  if (!account) return NextResponse.json({ authed: false })
  return NextResponse.json({
    authed: true,
    username: account.username,
    name: account.student.name,
    vehicleType: account.vehicleType,
  })
}

// POST /api/lms/auth — login / logout / password reset.
// { action: "login", username, password }
// { action: "logout" }
// { action: "reset-request", username }   → sends 6-digit code via WhatsApp
// { action: "reset-confirm", username, code, newPassword }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body?.action as string

    if (action === 'logout') {
      const sid = request.cookies.get(LMS_COOKIE)?.value
      if (sid) await prisma.lmsSessionToken.delete({ where: { id: sid } }).catch(() => {})
      const res = NextResponse.json({ success: true })
      res.cookies.set(LMS_COOKIE, '', { ...LMS_COOKIE_OPTS, maxAge: 0 })
      return res
    }

    const rawUsername = String(body?.username || '').trim().toLowerCase()
    if (!rawUsername) return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    // Forgive a missing domain part.
    const username = rawUsername.includes('@') ? rawUsername : `${rawUsername}@qazidrivingschool.ca`
    const account = await prisma.lmsAccount.findUnique({
      where: { username },
      include: { student: { select: { name: true, phone: true } } },
    })

    if (action === 'login') {
      const password = String(body?.password || '')
      if (!account || !verifyPassword(password, account.passwordHash, account.passwordSalt)) {
        return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 })
      }
      const sid = await createLmsSession(account.id, request.headers.get('user-agent'))
      await prisma.lmsAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } })
      logLmsEvent(account.id, 'login')
      const res = NextResponse.json({
        success: true,
        name: account.student.name,
        vehicleType: account.vehicleType,
      })
      res.cookies.set(LMS_COOKIE, sid, LMS_COOKIE_OPTS)
      return res
    }

    if (action === 'reset-request') {
      // Always answer success so usernames can't be probed.
      if (account?.student.phone) {
        const code = String(Math.floor(100000 + Math.random() * 900000))
        await prisma.lmsAccount.update({
          where: { id: account.id },
          data: { resetCode: hashResetCode(code), resetExpires: new Date(Date.now() + 10 * 60_000) },
        })
        logLmsEvent(account.id, 'reset_request')
        try {
          const { sendPrivateMessage } = await import('@/lib/whatsapp/client')
          await sendPrivateMessage(
            account.student.phone,
            `Your Qazi Study password reset code is: *${code}*\n\nIt expires in 10 minutes. If you didn't request this, ignore this message.`
          )
        } catch (e) {
          console.error('[lms reset] WhatsApp send failed:', e)
          return NextResponse.json({ error: 'Could not send the code right now — please try again later or contact the school.' }, { status: 503 })
        }
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'reset-confirm') {
      const code = String(body?.code || '').replace(/\D/g, '')
      const newPassword = String(body?.newPassword || '')
      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      if (
        !account || !account.resetCode || !account.resetExpires ||
        account.resetExpires < new Date() || account.resetCode !== hashResetCode(code)
      ) {
        return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 })
      }
      const { hash, salt } = hashPassword(newPassword)
      await prisma.lmsAccount.update({
        where: { id: account.id },
        data: { passwordHash: hash, passwordSalt: salt, resetCode: null, resetExpires: null },
      })
      logLmsEvent(account.id, 'password_reset')
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('[lms auth] error:', e)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
