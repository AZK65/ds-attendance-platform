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

function isTruckClass(notes: string): boolean {
  return /TruckClass:\s*yes/i.test(stripHtml(notes))
}

function extractModule(notes: string, title: string): number | null {
  const clean = stripHtml(notes)
  for (const text of [clean, title]) {
    const m = text.match(/Module\s*(\d+)/i) || text.match(/\bM(\d+)\b/) || text.match(/ClassNumber:\s*(\d+)/i)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n >= 1 && n <= 24) return n
    }
  }
  return null
}

/**
 * Cancel any pending ScheduledMessage that's tied to a particular event
 * (truck class by phone+date+time, or theory class by group+date).
 */
async function cancelRemindersForEvent(args: {
  startDt: string
  phone: string | null
  groupId?: string | null
}): Promise<number> {
  const { startDt, phone, groupId } = args
  const classDate = startDt.split('T')[0]
  const classTimePart = startDt.includes('T') ? startDt.split('T')[1].slice(0, 5) : null

  const pending = await prisma.scheduledMessage.findMany({ where: { status: 'pending' } })
  // Suffix-match phones — saved memberPhones can be raw digits ("15145551234")
  // while the event notes carry "(514) 555-1234" or similar. Stripping +
  // comparing the last 10 digits gives us reliable matches either way.
  const phoneSuffix = phone ? phone.replace(/\D/g, '').slice(-10) : null
  const phoneMatches = (memberPhonesJson: string): boolean => {
    if (!phoneSuffix) return false
    try {
      const phones: string[] = JSON.parse(memberPhonesJson)
      return phones.some(p => p.replace(/\D/g, '').slice(-10) === phoneSuffix)
    } catch { return false }
  }
  const toCancel = pending.filter(r => {
    // Theory: group reminder keyed by groupId + classDateISO
    if (groupId && r.groupId === groupId && r.classDateISO === classDate && r.isGroupMessage) return true
    // Truck: phone-targeted reminder, scheduledAt = classTime - 6h
    if (phone && r.groupId === 'truck-classes' && classTimePart) {
      if (!phoneMatches(r.memberPhones)) return false
      const classTime = new Date(`${classDate}T${classTimePart}:00`)
      const expectedReminder = new Date(classTime.getTime() - 6 * 60 * 60 * 1000)
      return Math.abs(r.scheduledAt.getTime() - expectedReminder.getTime()) < 2 * 60 * 1000
    }
    // In-car (road) class reminder. Created by /api/scheduling/notify with
    // groupId='in-car-reminders' and scheduledAt = classTime - 3h. We
    // match on phone + classDateISO so cancelling/moving the underlying
    // Teamup event clears the reminder properly. This was the missing
    // case that caused "Hi {student}, your Session X is in 3 hours" to
    // fire after the class had been deleted.
    if (phone && r.groupId === 'in-car-reminders' && r.classDateISO === classDate) {
      return phoneMatches(r.memberPhones)
    }
    return false
  })
  if (toCancel.length === 0) return 0
  await prisma.scheduledMessage.updateMany({
    where: { id: { in: toCancel.map(r => r.id) } },
    data: { status: 'cancelled' },
  })
  return toCancel.length
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

        // Cancel any pending scheduled reminders for this event.
        try {
          const cancelled = await cancelRemindersForEvent({
            startDt: snapshot.startDt,
            phone,
            // We don't store groupId on the snapshot, so theory-class group
            // reminders for deleted events are caught by the per-phone path
            // when phone is present (group reminders don't have phones
            // attached). Group-only theory reminders for deleted events
            // are best-effort — admin can still see them in the UI.
            groupId: null,
          })
          if (cancelled > 0) {
            console.log(`[poll-changes] Cancelled ${cancelled} reminder(s) for deleted event ${snapshot.eventId}`)
          }
        } catch (err) {
          console.error(`[poll-changes] Failed to cancel reminders:`, err)
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
          const cleanName = studentName.replace(/\s*#\d+$/, '').trim()
          const phone = extractPhone(event.notes || '')
          const truck = isTruckClass(event.notes || '')
          changes.push({ type: 'modified', eventId, studentName })

          // ── Cancel old reminders tied to the previous date/time ────
          if (timeChanged) {
            try {
              const cancelled = await cancelRemindersForEvent({
                startDt: existing.startDt,
                phone,
                groupId: null, // theory-group reminders without phone are handled by re-schedule below
              })
              if (cancelled > 0) {
                console.log(`[poll-changes] Cancelled ${cancelled} old reminder(s) for moved event ${eventId}`)
              }
            } catch (err) {
              console.error(`[poll-changes] cancel old reminders failed:`, err)
            }
          }

          // ── Schedule a fresh reminder for the new date/time ────────
          //    Truck classes: 6 hours before start, addressed to the student.
          //    Theory classes: 12 PM same-day group message (no phone in notes).
          if (timeChanged) {
            try {
              const newStart = new Date(event.start_dt)
              if (newStart > now) {
                const moduleNumber = extractModule(event.notes || '', event.title || '')
                if (truck && phone) {
                  const reminderTime = new Date(newStart.getTime() - 6 * 60 * 60 * 1000)
                  if (reminderTime > now) {
                    const timeDisplay = formatTime12h(event.start_dt)
                    const cls = moduleNumber ?? '?'
                    const message = `Reminder: You have Truck Class ${cls} today at ${timeDisplay}. See you there!`
                    await prisma.scheduledMessage.create({
                      data: {
                        groupId: 'truck-classes',
                        message,
                        scheduledAt: reminderTime,
                        memberPhones: JSON.stringify([phone]),
                        moduleNumber,
                        status: 'pending',
                      },
                    })
                  }
                } else if (!truck) {
                  // Theory class — look up the group by event title prefix match
                  // (event title pattern: "Module N - {Group Name}")
                  const titleParts = event.title.split(' - ')
                  const possibleGroupName = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : null
                  let theoryGroupId: string | null = null
                  if (possibleGroupName) {
                    const grp = await prisma.group.findFirst({ where: { name: possibleGroupName } })
                    theoryGroupId = grp?.id ?? null
                  }
                  if (theoryGroupId) {
                    const newDateIso = event.start_dt.split('T')[0]
                    const startTimePart = event.start_dt.split('T')[1]?.slice(0, 5) || '17:00'
                    const endTimePart = event.end_dt.split('T')[1]?.slice(0, 5) || '19:00'
                    const classTime = `${formatTime12h(`T${startTimePart}`)} to ${formatTime12h(`T${endTimePart}`)}`
                    const reminderTime = new Date(`${newDateIso}T12:00:00`)
                    if (reminderTime > now) {
                      // Cancel any existing pending group reminder for this group+date first
                      await prisma.scheduledMessage.updateMany({
                        where: { status: 'pending', groupId: theoryGroupId, classDateISO: newDateIso, isGroupMessage: true },
                        data: { status: 'cancelled' },
                      })
                      const cls = moduleNumber ?? '?'
                      const zoomLink = 'https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09'
                      const message = `Reminder: Your Module ${cls} class is TODAY at ${classTime}! Please make sure to put your full name when joining Zoom. Invite Link: ${zoomLink} — Password: qazi`
                      await prisma.scheduledMessage.create({
                        data: {
                          groupId: theoryGroupId,
                          message,
                          scheduledAt: reminderTime,
                          memberPhones: JSON.stringify([]),
                          moduleNumber,
                          classDateISO: newDateIso,
                          classTime,
                          isGroupMessage: true,
                          status: 'pending',
                        },
                      })
                    }
                  }
                }
              }
            } catch (err) {
              console.error(`[poll-changes] schedule new reminder failed:`, err)
            }
          }

          // ── Notify the affected student/group about the change ─────
          try {
            if (timeChanged && state.isConnected) {
              const newDateStr = formatDateDisplay(event.start_dt)
              const newTimeStr = `${formatTime12h(event.start_dt)} to ${formatTime12h(event.end_dt)}`
              if (truck && phone) {
                const msg = `Hi ${cleanName}! Your truck class has been rescheduled to ${newDateStr} from ${newTimeStr}.`
                await sendPrivateMessage(phone, msg)
                await prisma.messageLog.create({
                  data: { type: 'class-rescheduled', to: phone, toName: studentName, message: msg.slice(0, 500), status: 'sent' },
                }).catch(() => {})
              }
              // Theory-class reschedule notification is sent by the next
              // poll's group-reminder cycle; not WhatsApp-blasting groups
              // here to avoid duplicate messages.
            }
          } catch (err) {
            console.error(`[poll-changes] notify-on-modify failed:`, err)
          }

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
