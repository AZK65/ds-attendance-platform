import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPrivateMessage, getWhatsAppState } from '@/lib/whatsapp/client'

const BASE_URL = 'https://api.teamup.com'

interface TeamupEvent {
  id: string
  title: string
  notes?: string
  start_dt: string
  end_dt: string
  subcalendar_ids: number[]
}

function stripHtml(text: string): string {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim()
}

function extractPhone(notes: string): string | null {
  const clean = stripHtml(notes)
  const match = clean.match(/Phone:\s*(\d+)/)
  return match ? match[1] : null
}

function extractStudentName(notes: string): string | null {
  const clean = stripHtml(notes)
  const match = clean.match(/Student:\s*(.+?)(?:\n|$)/)
  return match ? match[1].trim() : null
}

function formatTime12h(isoTime: string): string {
  const timePart = isoTime.includes('T') ? isoTime.split('T')[1] : isoTime
  const [h, m] = timePart.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDateDisplay(isoDate: string): string {
  const datePart = isoDate.includes('T') ? isoDate.split('T')[0] : isoDate
  const [year, month, day] = datePart.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// POST /api/scheduling/poll-changes
// Polls Teamup for event changes and sends student notifications
export async function POST() {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

  if (!apiKey || !calendarKey) {
    return NextResponse.json({ error: 'Teamup not configured' }, { status: 500 })
  }

  try {
    // Fetch events from yesterday (to catch today's events that may have passed) to 3 months forward
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const startDate = yesterday.toISOString().split('T')[0]
    const threeMonths = new Date(now)
    threeMonths.setMonth(threeMonths.getMonth() + 3)
    const endDate = threeMonths.toISOString().split('T')[0]

    const url = `${BASE_URL}/${calendarKey}/events?startDate=${startDate}&endDate=${endDate}`
    const res = await fetch(url, {
      headers: { 'Teamup-Token': apiKey },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Teamup API error: ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    const liveEvents: TeamupEvent[] = data.events || []
    const liveEventIds = new Set(liveEvents.map(e => String(e.id)))

    // Get all existing snapshots
    const snapshots = await prisma.teamupEventSnapshot.findMany()
    const snapshotMap = new Map(snapshots.map(s => [s.eventId, s]))

    const changes: { type: string; eventId: string; studentName?: string }[] = []
    const state = getWhatsAppState()

    // 1. Detect DELETED events (snapshot exists but not in live events)
    for (const snapshot of snapshots) {
      if (!liveEventIds.has(snapshot.eventId)) {
        // Only treat as cancelled if the event is in the future
        // Past events disappearing from the API is normal, not a cancellation
        const eventTime = new Date(snapshot.startDt)
        if (eventTime < now) {
          // Past event — just clean up the snapshot, don't notify
          await prisma.teamupEventSnapshot.delete({ where: { eventId: snapshot.eventId } }).catch(() => {})
          continue
        }

        const phone = extractPhone(snapshot.notes)
        const studentName = extractStudentName(snapshot.notes) || 'Student'
        const cleanName = studentName.replace(/\s*#\d+$/, '').trim()
        const dateStr = formatDateDisplay(snapshot.startDt)
        const timeStr = `from ${formatTime12h(snapshot.startDt)} to ${formatTime12h(snapshot.endDt)}`

        changes.push({ type: 'deleted', eventId: snapshot.eventId, studentName })

        // Cancel any pending scheduled reminders for this student/date
        if (phone) {
          try {
            // Find pending reminders that contain this phone number
            const pendingReminders = await prisma.scheduledMessage.findMany({
              where: { status: 'pending' },
            })
            const toCancel = pendingReminders.filter(r => {
              try {
                const phones: string[] = JSON.parse(r.memberPhones)
                return phones.includes(phone)
              } catch { return false }
            })
            // Match by class date/time
            const classDate = snapshot.startDt.split('T')[0]
            const classTimePart = snapshot.startDt.includes('T') ? snapshot.startDt.split('T')[1].slice(0, 5) : null
            const matched = toCancel.filter(r => {
              // Theory class reminders have classDateISO
              if (r.classDateISO === classDate) return true
              // Truck class reminders: scheduledAt + 6h = class time
              if (r.groupId === 'truck-classes' && classTimePart) {
                const classTime = new Date(`${classDate}T${classTimePart}:00`)
                const expectedReminder = new Date(classTime.getTime() - 6 * 60 * 60 * 1000)
                return Math.abs(r.scheduledAt.getTime() - expectedReminder.getTime()) < 2 * 60 * 1000
              }
              return false
            })
            if (matched.length > 0) {
              await prisma.scheduledMessage.updateMany({
                where: { id: { in: matched.map(m => m.id) } },
                data: { status: 'cancelled' },
              })
              console.log(`[poll-changes] Cancelled ${matched.length} reminder(s) for deleted event ${snapshot.eventId}`)
            }
          } catch (err) {
            console.error(`[poll-changes] Failed to cancel reminders:`, err)
          }
        }

        if (phone && state.isConnected) {
          const message = `Hi ${cleanName}! Your class on ${dateStr} ${timeStr} has been cancelled. We'll reach out to reschedule.`
          try {
            await sendPrivateMessage(phone, message)
            await prisma.messageLog.create({
              data: { type: 'class-cancelled', to: phone, toName: studentName, message: message.slice(0, 500), status: 'sent' },
            }).catch(() => {})
            console.log(`[poll-changes] Sent cancel notification to ${phone} for event ${snapshot.eventId}`)
          } catch (err) {
            console.error(`[poll-changes] Failed to notify ${phone}:`, err)
          }
        }

        // Remove the snapshot
        await prisma.teamupEventSnapshot.delete({ where: { eventId: snapshot.eventId } })
      }
    }

    // 2. Process live events — detect MODIFIED or NEW
    for (const event of liveEvents) {
      const eventId = String(event.id)
      const existing = snapshotMap.get(eventId)

      if (existing) {
        // Check if event was modified (time or title changed)
        const timeChanged = existing.startDt !== event.start_dt || existing.endDt !== event.end_dt
        const titleChanged = existing.title !== event.title

        if (timeChanged || titleChanged) {
          const studentName = extractStudentName(event.notes || '') || 'Student'
          changes.push({ type: 'modified', eventId, studentName })

          // Don't send notification here — the UI already sends one when editing a class.
          // This poller just keeps the snapshot in sync.

          // Update the snapshot
          await prisma.teamupEventSnapshot.update({
            where: { eventId },
            data: {
              title: event.title,
              startDt: event.start_dt,
              endDt: event.end_dt,
              notes: event.notes || '',
              lastSeen: new Date(),
            },
          })
        } else {
          // No change — just update lastSeen
          await prisma.teamupEventSnapshot.update({
            where: { eventId },
            data: { lastSeen: new Date() },
          })
        }
      } else {
        // New event — save snapshot (no notification, creation is handled elsewhere)
        await prisma.teamupEventSnapshot.create({
          data: {
            eventId,
            title: event.title,
            startDt: event.start_dt,
            endDt: event.end_dt,
            notes: event.notes || '',
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      liveEvents: liveEvents.length,
      snapshots: snapshots.length,
      changes,
    })
  } catch (error) {
    console.error('[poll-changes] Error:', error)
    return NextResponse.json(
      { error: 'Failed to poll changes' },
      { status: 500 }
    )
  }
}
