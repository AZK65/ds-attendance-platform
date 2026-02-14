import { NextRequest, NextResponse } from 'next/server'
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send scheduling notification:', error)
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    )
  }
}
