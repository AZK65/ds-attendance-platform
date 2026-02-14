import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPrivateMessage, getWhatsAppState } from '@/lib/whatsapp/client'

export async function POST(request: NextRequest) {
  try {
    const state = getWhatsAppState()
    if (!state.isConnected) {
      return NextResponse.json(
        { error: 'WhatsApp not connected' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { phone, studentName, module, teacherName, date, startTime, endTime } = body

    if (!phone || !studentName) {
      return NextResponse.json(
        { error: 'phone and studentName are required' },
        { status: 400 }
      )
    }

    // Build message
    const moduleStr = module || 'class'
    const dateStr = date || 'TBD'
    const timeStr = startTime && endTime ? `from ${startTime} to ${endTime}` : ''
    const teacherStr = teacherName ? ` with ${teacherName}` : ''

    const message = `Hi ${studentName}! Your ${moduleStr} class has been scheduled${teacherStr} on ${dateStr} ${timeStr}. See you there!`.trim()

    await sendPrivateMessage(phone, message)

    // Log the sent message
    await prisma.messageLog.create({
      data: { type: 'student-notify', to: phone, toName: studentName, message: message.slice(0, 500), status: 'sent' },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send scheduling notification:', error)

    // Log the failed message
    const body2 = await request.clone().json().catch(() => ({}))
    await prisma.messageLog.create({
      data: {
        type: 'student-notify',
        to: body2.phone || 'unknown',
        toName: body2.studentName || null,
        message: 'Failed to send scheduling notification',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    }).catch(() => {})

    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    )
  }
}
