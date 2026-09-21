import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPrivateMessage, getWhatsAppState } from '@/lib/whatsapp/client'
import { scheduleReminderFromEvent } from '@/lib/in-car-reminders'

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
    const { module, teacherName, date, classDateISO, startTime, endTime, reminderOnly, isEdit, isCancelled } = body

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

    const message = isCancelled
      ? `Hi ${cleanName}! Your ${moduleStr} class on ${dateStr} ${timeStr} has been cancelled. We'll reach out to reschedule.`.trim()
      : isEdit
      ? `Hi ${cleanName}! Your ${moduleStr} class has been updated${teacherStr}. It is now on ${dateStr} ${timeStr}. See you there!`.trim()
      : `Hi ${cleanName}! Your ${moduleStr} class has been scheduled${teacherStr} on ${dateStr} ${timeStr}. See you there!`.trim()

    // Only send the instant WhatsApp message if not reminderOnly.
    const msgType = isCancelled ? 'class-cancelled' : isEdit ? 'class-edited' : 'class-scheduled'
    if (!reminderOnly) {
      console.log(`[notify] Sending ${msgType} notification to ${phone} (${studentName})`)
      await sendPrivateMessage(phone, message)
      console.log(`[notify] ${msgType} notification sent to ${phone}`)

      // Log the sent message
      await prisma.messageLog.create({
        data: { type: msgType, to: phone, toName: studentName, message: message.slice(0, 500), status: 'sent' },
      }).catch(() => {})
    }

    // Don't schedule a reminder for cancelled classes
    if (isCancelled) {
      return NextResponse.json({ success: true, reminderScheduled: false })
    }

    // Schedule the 3-hour-before reminder through the same server-side
    // combiner used by Teamup event creation. Adjacent one-hour sessions are
    // kept as one continuous window (11–12 + 12–1 becomes 11–1).
    let reminderScheduled = false
    if (classDateISO && startTime && endTime) {
      try {
        await scheduleReminderFromEvent({
          startDateIso: `${classDateISO}T${startTime}:00`,
          endDateIso: `${classDateISO}T${endTime}:00`,
          notes: `Student: ${studentName}\nPhone: ${phone}`,
          title: moduleStr,
          teacherName,
        })
        reminderScheduled = true
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
