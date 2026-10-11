import { NextRequest, NextResponse } from 'next/server'
import { getNasarSubcalendarId } from '@/lib/teamup'
import { sendPrivateMessage, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

const BASE_URL = 'https://api.teamup.com'

// Simple in-memory lock to prevent concurrent class creation for the same student
const activeLocks = new Map<string, number>()
const LOCK_TTL = 30000 // 30 seconds

interface TruckClassInput {
  date: string       // "2026-02-20"
  startTime: string  // "09:00"
  endTime: string    // "10:00"
  isExam: boolean
  examLocation: string | null // "Laval" | "Joliette" | "Saint-Jérôme"
  classNumber: number | null  // Per-row class number (null for exams)
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentName, studentPhone, transmission, classes } = body as {
      studentName: string
      studentPhone: string
      transmission?: 'auto' | 'manual'
      subcalendarId?: number
      classes: TruckClassInput[]
    }

    const requestedSubcalendarId = Number(body.subcalendarId)

    if (!studentName || !studentPhone || !classes || classes.length === 0) {
      return NextResponse.json(
        { error: 'studentName, studentPhone, and classes are required' },
        { status: 400 }
      )
    }

    // Prevent concurrent class creation for the same student (race condition guard)
    const lockKey = studentPhone
    const existingLock = activeLocks.get(lockKey)
    if (existingLock && Date.now() - existingLock < LOCK_TTL) {
      return NextResponse.json(
        { error: 'Class creation already in progress for this student. Please wait.' },
        { status: 429 }
      )
    }
    activeLocks.set(lockKey, Date.now())

    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
    if (!apiKey || !calendarKey) {
      return NextResponse.json(
        { error: 'Teamup not configured' },
        { status: 500 }
      )
    }

    // Use the teacher selected in the truck wizard. Older clients did not send
    // this field, so keep Nasar as a backwards-compatible fallback.
    const teacherSubcalendarId = Number.isFinite(requestedSubcalendarId) && requestedSubcalendarId > 0
      ? requestedSubcalendarId
      : await getNasarSubcalendarId()
    if (!teacherSubcalendarId) {
      return NextResponse.json(
        { error: 'Could not find the selected truck teacher calendar' },
        { status: 500 }
      )
    }

    // If this is a normal newly-added batch (1, 2, 3...), continue from the
    // student's highest existing truck class instead of restarting at 1.
    // Explicit custom numbering is left alone.
    let normalizedClasses = classes
    try {
      const today = new Date()
      const rangeStart = new Date(today)
      rangeStart.setFullYear(rangeStart.getFullYear() - 2)
      const rangeEnd = new Date(today)
      rangeEnd.setFullYear(rangeEnd.getFullYear() + 2)
      const iso = (date: Date) => date.toISOString().split('T')[0]
      const studentEventsRes = await fetch(
        `${BASE_URL}/${calendarKey}/events?startDate=${iso(rangeStart)}&endDate=${iso(rangeEnd)}&query=${encodeURIComponent(studentPhone)}`,
        { headers: { 'Teamup-Token': apiKey } }
      )
      if (studentEventsRes.ok) {
        const studentEventsData = await studentEventsRes.json()
        const existingNumbers = (studentEventsData.events || [])
          .map((event: { notes?: string }) => {
            const notes = String(event.notes || '').replace(/<[^>]+>/g, '\n')
            if (!/TruckClass:\s*yes/i.test(notes)) return 0
            const match = notes.match(/ClassNumber:\s*(\d+)/i)
            return match ? Number(match[1]) : 0
          })
          .filter((value: number) => Number.isFinite(value) && value > 0)
        const highestExisting = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0
        const regular = classes.filter(cls => !cls.isExam)
        const usesDefaultSequence = regular.every((cls, index) => cls.classNumber === index + 1)
        if (highestExisting > 0 && usesDefaultSequence) {
          let offset = 0
          normalizedClasses = classes.map(cls => cls.isExam
            ? cls
            : { ...cls, classNumber: highestExisting + (++offset) }
          )
        }
      }
    } catch (error) {
      console.error('Failed to determine next truck class number:', error)
    }

    // Fetch existing events on the selected teacher's calendar to check for duplicates
    const dates = normalizedClasses.map(c => c.date).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]
    let existingEvents: { title: string; start_dt: string; end_dt: string; notes?: string }[] = []

    try {
      const eventsRes = await fetch(
        `${BASE_URL}/${calendarKey}/events?startDate=${minDate}&endDate=${maxDate}&subcalendarId[]=${teacherSubcalendarId}`,
        { headers: { 'Teamup-Token': apiKey } }
      )
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json()
        existingEvents = eventsData.events || []
      }
    } catch {
      // If we can't fetch, continue without duplicate check
    }

    // Check for duplicates before creating.
    //
    // Two rules:
    //   A. The selected teacher cannot be double-booked at the same date+time.
    //      regardless of which student the existing event is for.
    //   B. Same student cannot already have a class at the same date+time.
    // Rule A subsumes rule B but we keep explicit detection to produce a clearer
    // error message when it's the same student.
    const duplicates: string[] = []
    for (const cls of normalizedClasses) {
      const dup = existingEvents.find(ev => {
        const evDate = ev.start_dt.split('T')[0]
        if (evDate !== cls.date) return false
        const evTime = ev.start_dt.slice(11, 16)
        return evTime === cls.startTime
      })
      if (dup) {
        const sameStudent = dup.title.toLowerCase().includes(studentName.toLowerCase()) ||
          (dup.notes || '').includes(studentPhone)
        if (sameStudent) {
          duplicates.push(`${studentName} already has a class on ${formatDateDisplay(cls.date)} at ${formatTimeDisplay(cls.startTime)} (${dup.title})`)
        } else {
          duplicates.push(`The selected teacher already has a class on ${formatDateDisplay(cls.date)} at ${formatTimeDisplay(cls.startTime)} (${dup.title})`)
        }
      }
    }

    // Also check for duplicate time slots within the same request
    const timeSlots = new Set<string>()
    for (const cls of normalizedClasses) {
      const key = `${cls.date}-${cls.startTime}`
      if (timeSlots.has(key)) {
        duplicates.push(`Duplicate time slot: ${formatDateDisplay(cls.date)} at ${formatTimeDisplay(cls.startTime)}`)
      }
      timeSlots.add(key)
    }

    if (duplicates.length > 0) {
      activeLocks.delete(lockKey)
      return NextResponse.json(
        { error: 'Duplicate classes found', duplicates },
        { status: 409 }
      )
    }

    let eventsCreated = 0
    let remindersScheduled = 0
    const errors: string[] = []

    // Create each event on Teamup (class numbers come from each row)
    for (const cls of normalizedClasses) {
      const classNumber = cls.classNumber

      const transTag = transmission === 'auto' ? ' (Auto)' : ' (Manual)'
      const title = cls.isExam
        ? `Truck Exam${transTag} - ${studentName}${cls.examLocation ? ` - ${cls.examLocation}` : ''}`
        : `Truck Class ${classNumber ?? '?'}${transTag} - ${studentName}`

      const transmissionLabel = transmission === 'auto' ? 'Automatic' : 'Manual'
      const noteLines = ['TruckClass: yes', `Student: ${studentName}`, `Phone: ${studentPhone}`, `Transmission: ${transmissionLabel}`]
      if (cls.isExam) {
        noteLines.push(`Exam: ${cls.examLocation || 'TBD'}`)
      } else {
        noteLines.push(`ClassNumber: ${classNumber ?? '?'}`)
      }

      try {
        const res = await fetch(`${BASE_URL}/${calendarKey}/events`, {
          method: 'POST',
          headers: {
            'Teamup-Token': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            start_dt: `${cls.date}T${cls.startTime}:00`,
            end_dt: `${cls.date}T${cls.endTime}:00`,
            subcalendar_ids: [teacherSubcalendarId],
            notes: noteLines.join('\n'),
          }),
        })

        if (res.ok) {
          eventsCreated++
          const eventData = await res.json().catch(() => ({}))
          const createdEvent = eventData.event || eventData
          const teamupEventId = createdEvent?.id != null ? String(createdEvent.id) : null

          // Schedule a reminder 6 hours before the class only after Teamup
          // confirms that the calendar event exists.
          try {
            const classDateTime = new Date(`${cls.date}T${cls.startTime}:00`)
            const reminderTime = new Date(classDateTime.getTime() - 6 * 60 * 60 * 1000)

            if (reminderTime > new Date()) {
              const timeDisplay = formatTimeDisplay(cls.startTime)
              const reminderMessage = cls.isExam
                ? `Reminder: You have your Truck Exam today at ${timeDisplay}${cls.examLocation ? ` in ${cls.examLocation}` : ''}. Good luck! 🍀`
                : `Reminder: You have Truck Class ${classNumber ?? ''} today at ${timeDisplay}. See you there!`

              await prisma.scheduledMessage.create({
                data: {
                  groupId: 'truck-classes',
                  teamupEventId,
                  message: reminderMessage,
                  scheduledAt: reminderTime,
                  memberPhones: JSON.stringify([studentPhone]),
                  classDateISO: cls.date,
                  classTime: `${cls.startTime}-${cls.endTime}`,
                  status: 'pending',
                },
              })
              remindersScheduled++
            }
          } catch (err) {
            console.error('Failed to schedule reminder:', err)
          }
        } else {
          const text = await res.text()
          errors.push(`Event ${title}: ${text}`)
        }
      } catch (err) {
        errors.push(`Event ${title}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }

      // Small delay between Teamup API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    // Build and send summary WhatsApp message
    try {
      const state = getWhatsAppState()
      if (state.isConnected) {
        const regularClasses = normalizedClasses.map((cls, idx) => ({ ...cls, _origIdx: idx })).filter(c => !c.isExam)
        const exams = normalizedClasses.filter(c => c.isExam)

        const cleanName = studentName.replace(/\s*#\d+$/, '').trim()
        let message = `Hi ${cleanName}! Here's your truck training schedule:\n\n`

        if (regularClasses.length > 0) {
          message += `📋 Classes:\n`
          for (const cls of regularClasses) {
            const dateStr = formatDateDisplay(cls.date)
            const startStr = formatTimeDisplay(cls.startTime)
            const endStr = formatTimeDisplay(cls.endTime)
            message += `${cls.classNumber ?? '?'}. ${dateStr} — ${startStr} to ${endStr}\n`
          }
        }

        if (exams.length > 0) {
          message += `\n🎯 Exam:\n`
          for (const exam of exams) {
            const dateStr = formatDateDisplay(exam.date)
            const startStr = formatTimeDisplay(exam.startTime)
            const endStr = formatTimeDisplay(exam.endTime)
            message += `📍 ${exam.examLocation || 'TBD'} — ${dateStr} at ${startStr} to ${endStr}\n`
          }
        }

        message += `\nYou'll receive a reminder 6 hours before each class. Good luck! 🚛`

        await sendPrivateMessage(studentPhone, message)

        // Log the sent truck summary
        await prisma.messageLog.create({
          data: { type: 'truck-summary', to: studentPhone, toName: studentName, message: message.slice(0, 500), status: 'sent' },
        }).catch(() => {})
      }
    } catch (err) {
      console.error('Failed to send summary message:', err)
      errors.push(`Summary message: ${err instanceof Error ? err.message : 'Failed to send'}`)

      // Log the failure
      await prisma.messageLog.create({
        data: { type: 'truck-summary', to: studentPhone, toName: studentName, message: 'Failed to send truck schedule', status: 'failed', error: err instanceof Error ? err.message : 'Unknown' },
      }).catch(() => {})
    }

    // Notify the selected teacher about the new truck classes
    try {
      const state2 = getWhatsAppState()
      if (state2.isConnected) {
        const teacherPhone = await prisma.teacherPhone.findUnique({
          where: { subcalendarId: teacherSubcalendarId },
        })
        if (teacherPhone?.phone) {
          // Check if any class is within next 7 days
          const now = new Date()
          const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          const upcomingClasses = normalizedClasses.filter(cls => {
            const classDate = new Date(cls.date + 'T12:00:00')
            return classDate <= sevenDaysFromNow
          })

          if (upcomingClasses.length > 0) {
            let teacherMsg = `📅 New truck classes added for ${studentName}:\n\n`
            for (const cls of normalizedClasses) {
              const dateStr = formatDateDisplay(cls.date)
              const timeStr = `${formatTimeDisplay(cls.startTime)} - ${formatTimeDisplay(cls.endTime)}`
              if (cls.isExam) {
                teacherMsg += `🎯 Exam: ${dateStr} ${timeStr}${cls.examLocation ? ` (${cls.examLocation})` : ''}\n`
              } else {
                teacherMsg += `${cls.classNumber ?? '?'}. ${dateStr} ${timeStr}\n`
              }
            }
            await sendPrivateMessage(teacherPhone.phone, teacherMsg)

            // Log teacher notification
            await prisma.messageLog.create({
              data: { type: 'teacher-notify', to: teacherPhone.phone, toName: teacherPhone.name, message: teacherMsg.slice(0, 500), status: 'sent' },
            }).catch(() => {})
          }
        }
      }
    } catch (err) {
      console.error('Failed to notify teacher about truck classes:', err)
    }

    activeLocks.delete(lockKey)

    return NextResponse.json({
      success: true,
      eventsCreated,
      remindersScheduled,
      totalClasses: normalizedClasses.length,
      classes: normalizedClasses,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    // Lock auto-expires after TTL
    console.error('Failed to create truck classes:', error)
    return NextResponse.json(
      { error: 'Failed to create truck classes' },
      { status: 500 }
    )
  }
}
