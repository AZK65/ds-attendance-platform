import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPrivateMessage, getWhatsAppState } from '@/lib/whatsapp/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      subcalendarId,
      type,        // 'created' | 'updated' | 'deleted'
      studentName,
      module,      // e.g. "Session 5" or "Truck Class 3"
      date,        // ISO date "2026-02-20"
      startTime,   // "09:00"
      endTime,     // "10:00"
    } = body

    if (!subcalendarId || !type || !date) {
      return NextResponse.json({ error: 'subcalendarId, type, and date required' }, { status: 400 })
    }

    // Check if class is within the next 7 days
    const classDate = new Date(date + 'T12:00:00')
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    if (classDate > sevenDaysFromNow) {
      return NextResponse.json({ skipped: true, reason: 'Class is more than 7 days away' })
    }

    // Look up teacher phone
    const teacherPhone = await prisma.teacherPhone.findUnique({
      where: { subcalendarId: parseInt(subcalendarId) },
    })

    if (!teacherPhone || !teacherPhone.phone) {
      return NextResponse.json({ skipped: true, reason: 'No phone number for this teacher' })
    }

    // Check WhatsApp connection
    const state = getWhatsAppState()
    if (!state.isConnected) {
      return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 503 })
    }

    // Format date for display
    const dateDisplay = classDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })

    // Format times
    const formatTime = (t: string) => {
      if (!t) return ''
      const [h, m] = t.split(':').map(Number)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
    }

    const timeStr = startTime && endTime ? `${formatTime(startTime)} - ${formatTime(endTime)}` : ''
    const classInfo = [module, studentName].filter(Boolean).join(' with ')

    let message = ''

    switch (type) {
      case 'created':
        message = `📅 New class added to your schedule:\n${classInfo}\n${dateDisplay} ${timeStr}`
        break
      case 'updated':
        message = `✏️ Class updated on your schedule:\n${classInfo}\nNow on ${dateDisplay} ${timeStr}`
        break
      case 'deleted':
        message = `❌ Class removed from your schedule:\n${classInfo}\n${dateDisplay} ${timeStr}`
        break
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    await sendPrivateMessage(teacherPhone.phone, message)

    return NextResponse.json({ success: true, sent: true })
  } catch (error) {
    console.error('Failed to send teacher notification:', error)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
