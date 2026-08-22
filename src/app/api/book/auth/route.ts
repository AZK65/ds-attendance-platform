import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import {
  findBookingStudent,
  issueBookingCode,
  phoneDigits,
  verifyBookingCode,
} from '@/lib/booking-auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '')
    const name = String(body?.name || '').trim()
    const phone = String(body?.phone || '').trim()

    if (action === 'request-code') {
      const student = await findBookingStudent(name, phone)
      if (!student) {
        // Do not reveal whether a name/phone combination exists in the school
        // database. The dummy id makes the following verify step fail normally.
        return NextResponse.json({
          success: true,
          studentId: `unknown_${randomBytes(12).toString('hex')}`,
        })
      }

      const destination = [student.phone, student.phoneAlt]
        .find((candidate) => phoneDigits(candidate || '') === phoneDigits(phone)) || phone
      let code: string
      try {
        code = await issueBookingCode(student.id, destination)
      } catch (error) {
        if (error instanceof Error && error.name === 'RateLimitError') {
          return NextResponse.json({ error: error.message }, { status: 429 })
        }
        throw error
      }

      try {
        const { sendPrivateMessage } = await import('@/lib/whatsapp/client')
        await sendPrivateMessage(
          destination,
          `Your Qazi road-class booking code is: *${code}*\n\nIt expires in 10 minutes. Do not share this code with anyone.`
        )
      } catch (error) {
        console.error('[Book Auth] WhatsApp send failed:', error)
        await prisma.bookingVerification.delete({ where: { studentId: student.id } }).catch(() => {})
        return NextResponse.json(
          { error: 'We could not send the WhatsApp code right now. Please try again shortly.' },
          { status: 503 }
        )
      }

      return NextResponse.json({ success: true, studentId: student.id })
    }

    if (action === 'verify-code') {
      const studentId = String(body?.studentId || '')
      const code = String(body?.code || '').replace(/\D/g, '')
      if (!studentId || code.length !== 6) {
        return NextResponse.json({ error: 'Enter the six-digit code.' }, { status: 400 })
      }
      const token = await verifyBookingCode(studentId, code)
      if (!token) {
        return NextResponse.json({ error: 'That code is invalid or expired.' }, { status: 401 })
      }
      return NextResponse.json({ success: true, token })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    console.error('[Book Auth] Error:', error)
    return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 500 })
  }
}
