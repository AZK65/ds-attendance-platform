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
    const { module, teacherName, date, classDateISO, startTime, endTime, reminderOnly } = body

    if (!phone || phone === 'unknown' || !studentName) {
      return NextResponse.json(
        { error: 'phone and studentName are required' },
        { status: 400 }
      )
    }

    // Build message — strip #number suffix from student name (e.g. "Sahar Tasleem #1115" → "Sahar Tasleem")
    const cleanName = studentName.replace(/\s*#\d+$/, '').trim()
    const moduleStr = module || 'class'
    const dateStr = date || 'TBD'
    const teacherStr = teacherName ? ` with ${teacherName}` : ''

    // Convert 24h time (e.g. "09:00") to 12h format
    const formatTime12h = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
    }
    const timeStr = startTime && endTime ? `from ${formatTime12h(startTime)} to ${formatTime12h(endTime)}` : ''

    const message = `Hi ${cleanName}! Your ${moduleStr} class has been scheduled${teacherStr} on ${dateStr} ${timeStr}. See you there!`.trim()

    // Only send the instant WhatsApp message if not reminderOnly (edit/reschedule only needs the reminder)
    if (!reminderOnly) {
      console.log(`[notify] Sending class notification to ${phone} (${studentName})`)
      await sendPrivateMessage(phone, message)
      console.log(`[notify] Class notification sent to ${phone}`)

      // Log the sent message
      await prisma.messageLog.create({
        data: { type: 'class-scheduled', to: phone, toName: studentName, message: message.slice(0, 500), status: 'sent' },
      }).catch(() => {})
    }

    // Schedule a 1-hour-before reminder
    let reminderScheduled = false
    if (classDateISO && startTime) {
      try {
        const classDateTime = new Date(`${classDateISO}T${startTime}:00`)
        const reminderTime = new Date(classDateTime.getTime() - 1 * 60 * 60 * 1000) // 1 hour before

        if (reminderTime > new Date()) {
          const reminderMessage = `Reminder: Hi ${cleanName}, your ${moduleStr} class${teacherStr} is in 1 hour (${formatTime12h(startTime)}). See you soon!`

          await prisma.scheduledMessage.create({
            data: {
              groupId: 'in-car-reminders',
              message: reminderMessage,
              scheduledAt: reminderTime,
              memberPhones: JSON.stringify([phone]),
              classDateISO,
              classTime: timeStr,
              isGroupMessage: false,
              status: 'pending',
            },
          })
          reminderScheduled = true
          console.log(`[notify] Scheduled 1hr reminder for ${phone} at ${reminderTime.toISOString()}`)
        }
      } catch (reminderErr) {
        console.error('[notify] Failed to schedule reminder:', reminderErr)
      }
    }

    return NextResponse.json({ success: true, reminderScheduled })
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
