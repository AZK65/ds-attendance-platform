import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPrivateMessage, getWhatsAppState } from '@/lib/whatsapp/client'

export async function POST(request: NextRequest) {
  let phone = 'unknown'
  let studentName = ''

  try {
    const state = getWhatsAppState()
    if (!state.isConnected) {
      console.log('[notify] WhatsApp not connected, cannot send scheduling notification')
      return NextResponse.json(
        { error: 'WhatsApp not connected' },
        { status: 503 }
      )
    }

    const body = await request.json()
    phone = body.phone || 'unknown'
    studentName = body.studentName || ''
    const { module, teacherName, date, startTime, endTime } = body

    if (!phone || phone === 'unknown' || !studentName) {
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

    console.log(`[notify] Sending class notification to ${phone} (${studentName})`)
    await sendPrivateMessage(phone, message)
    console.log(`[notify] Class notification sent to ${phone}`)

    // Log the sent message
    await prisma.messageLog.create({
      data: { type: 'class-scheduled', to: phone, toName: studentName, message: message.slice(0, 500), status: 'sent' },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[notify] Failed to send scheduling notification to ${phone}:`, errMsg)

    // Log the failed message
    await prisma.messageLog.create({
      data: {
        type: 'class-scheduled',
        to: phone,
        toName: studentName || null,
        message: 'Failed to send scheduling notification',
        status: 'failed',
        error: errMsg,
      },
    }).catch(() => {})

    return NextResponse.json(
      { error: `Failed to send notification: ${errMsg}` },
      { status: 500 }
    )
  }
}
