import { NextRequest, NextResponse } from 'next/server'
import { getNasarSubcalendarId } from '@/lib/teamup'
import { sendPrivateMessage, getWhatsAppState } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

const BASE_URL = 'https://api.teamup.com'

interface TruckClassInput {
  date: string       // "2026-02-20"
  startTime: string  // "09:00"
  endTime: string    // "10:00"
  isExam: boolean
  examLocation: string | null // "Laval" | "Joliette" | "Saint-Jérôme"
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
    const { studentName, studentPhone, classes } = body as {
      studentName: string
      studentPhone: string
      classes: TruckClassInput[]
    }

    if (!studentName || !studentPhone || !classes || classes.length === 0) {
      return NextResponse.json(
        { error: 'studentName, studentPhone, and classes are required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
    if (!apiKey || !calendarKey) {
      return NextResponse.json(
        { error: 'Teamup not configured' },
        { status: 500 }
      )
    }

    // Look up Nasar's subcalendar
    const nasarId = await getNasarSubcalendarId()
    if (!nasarId) {
      return NextResponse.json(
        { error: 'Could not find Nasar subcalendar' },
        { status: 500 }
      )
    }

    // Fetch existing events on Nasar's calendar to check for duplicates
    const dates = classes.map(c => c.date).sort()
    const minDate = dates[0]
    const maxDate = dates[dates.length - 1]
    let existingEvents: { title: string; start_dt: string; end_dt: string; notes?: string }[] = []

    try {
      const eventsRes = await fetch(
        `${BASE_URL}/${calendarKey}/events?startDate=${minDate}&endDate=${maxDate}&subcalendarId[]=${nasarId}`,
        { headers: { 'Teamup-Token': apiKey } }
      )
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json()
        existingEvents = eventsData.events || []
      }
    } catch {
      // If we can't fetch, continue without duplicate check
    }

    // Check for duplicates before creating
    const duplicates: string[] = []
    for (const cls of classes) {
      const clsStart = `${cls.date}T${cls.startTime}:00`
      const dup = existingEvents.find(ev => {
        const evDate = ev.start_dt.split('T')[0]
        if (evDate !== cls.date) return false
        // Check if same student name in title
        const hasStudent = ev.title.toLowerCase().includes(studentName.toLowerCase())
        // Check if same start time
        const evTime = ev.start_dt.slice(11, 16)
        const sameTime = evTime === cls.startTime
        return hasStudent && sameTime
      })
      if (dup) {
        duplicates.push(`${studentName} already has a class on ${formatDateDisplay(cls.date)} at ${formatTimeDisplay(cls.startTime)} (${dup.title})`)
      }
    }

    if (duplicates.length > 0) {
      return NextResponse.json(
        { error: 'Duplicate classes found', duplicates },
        { status: 409 }
      )
    }

    let eventsCreated = 0
    let remindersScheduled = 0
    const errors: string[] = []

    // Number regular classes (exams don't get a class number)
    let classNumber = 0

    // Create each event on Teamup
    for (const cls of classes) {
      if (!cls.isExam) classNumber++

      const title = cls.isExam
        ? `Truck Exam - ${studentName}${cls.examLocation ? ` - ${cls.examLocation}` : ''}`
        : `Truck Class ${classNumber} - ${studentName}`

      const noteLines = ['TruckClass: yes', `Student: ${studentName}`, `Phone: ${studentPhone}`]
      if (cls.isExam) {
        noteLines.push(`Exam: ${cls.examLocation || 'TBD'}`)
      } else {
        noteLines.push(`ClassNumber: ${classNumber}`)
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
            subcalendar_ids: [nasarId],
            notes: noteLines.join('\n'),
          }),
        })

        if (res.ok) {
          eventsCreated++
        } else {
          const text = await res.text()
          errors.push(`Event ${title}: ${text}`)
        }
      } catch (err) {
        errors.push(`Event ${title}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }

      // Schedule a reminder 6 hours before the class
      try {
        const classDateTime = new Date(`${cls.date}T${cls.startTime}:00`)
        const reminderTime = new Date(classDateTime.getTime() - 6 * 60 * 60 * 1000)

        // Only schedule if reminder time is in the future
        if (reminderTime > new Date()) {
          const timeDisplay = formatTimeDisplay(cls.startTime)
          let reminderMessage: string

          if (cls.isExam) {
            reminderMessage = `Reminder: You have your Truck Exam today at ${timeDisplay} EST${cls.examLocation ? ` in ${cls.examLocation}` : ''}. Good luck! 🍀`
          } else {
            reminderMessage = `Reminder: You have Truck Class ${classNumber} today at ${timeDisplay} EST. See you there!`
          }

          await prisma.scheduledMessage.create({
            data: {
              groupId: 'truck-classes',
              message: reminderMessage,
              scheduledAt: reminderTime,
              memberPhones: JSON.stringify([studentPhone]),
              status: 'pending',
            },
          })
          remindersScheduled++
        }
      } catch (err) {
        console.error('Failed to schedule reminder:', err)
      }

      // Small delay between Teamup API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    // Build and send summary WhatsApp message
    try {
      const state = getWhatsAppState()
      if (state.isConnected) {
        const regularClasses = classes.map((cls, idx) => ({ ...cls, _origIdx: idx })).filter(c => !c.isExam)
        const exams = classes.filter(c => c.isExam)

        let message = `Hi ${studentName}! Here's your truck training schedule:\n\n`

        if (regularClasses.length > 0) {
          message += `📋 Classes:\n`
          let num = 0
          for (const cls of regularClasses) {
            num++
            const dateStr = formatDateDisplay(cls.date)
            const startStr = formatTimeDisplay(cls.startTime)
            const endStr = formatTimeDisplay(cls.endTime)
            message += `${num}. ${dateStr} — ${startStr} to ${endStr} EST\n`
          }
        }

        if (exams.length > 0) {
          message += `\n🎯 Exam:\n`
          for (const exam of exams) {
            const dateStr = formatDateDisplay(exam.date)
            const startStr = formatTimeDisplay(exam.startTime)
            const endStr = formatTimeDisplay(exam.endTime)
            message += `📍 ${exam.examLocation || 'TBD'} — ${dateStr} at ${startStr} to ${endStr} EST\n`
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

    // Notify teacher (Nasar) about the new truck classes
    try {
      const state2 = getWhatsAppState()
      if (state2.isConnected) {
        const teacherPhone = await prisma.teacherPhone.findUnique({
          where: { subcalendarId: nasarId },
        })
        if (teacherPhone?.phone) {
          // Check if any class is within next 7 days
          const now = new Date()
          const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          const upcomingClasses = classes.filter(cls => {
            const classDate = new Date(cls.date + 'T12:00:00')
            return classDate <= sevenDaysFromNow
          })

          if (upcomingClasses.length > 0) {
            let teacherMsg = `📅 New truck classes added for ${studentName}:\n\n`
            let num = 0
            for (const cls of classes) {
              if (!cls.isExam) num++
              const dateStr = formatDateDisplay(cls.date)
              const timeStr = `${formatTimeDisplay(cls.startTime)} - ${formatTimeDisplay(cls.endTime)}`
              if (cls.isExam) {
                teacherMsg += `🎯 Exam: ${dateStr} ${timeStr}${cls.examLocation ? ` (${cls.examLocation})` : ''}\n`
              } else {
                teacherMsg += `${num}. ${dateStr} ${timeStr}\n`
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

    return NextResponse.json({
      success: true,
      eventsCreated,
      remindersScheduled,
      totalClasses: classes.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Failed to create truck classes:', error)
    return NextResponse.json(
      { error: 'Failed to create truck classes' },
      { status: 500 }
    )
  }
}
