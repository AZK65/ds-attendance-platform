import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const BASE_URL = 'https://api.teamup.com'

function formatTime12h(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

export async function POST() {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    // Step 1: Cancel ALL pending reminders (both car and truck)
    const cancelled = await prisma.scheduledMessage.updateMany({
      where: {
        status: 'pending',
        groupId: { in: ['in-car-reminders', 'truck-classes'] },
      },
      data: { status: 'cancelled' },
    })
    console.log(`[rebuild-reminders] Cancelled ${cancelled.count} pending reminders`)

    // Step 2: Fetch subcalendars (teachers) for name lookup
    const subCalRes = await fetch(`${BASE_URL}/${calendarKey}/subcalendars`, {
      headers: { 'Teamup-Token': apiKey },
    })
    const subCalData = await subCalRes.json()
    const subcalendars: Array<{ id: number; name: string }> = subCalData.subcalendars || []
    const teacherMap = new Map(subcalendars.map(s => [s.id, s.name]))

    // Step 3: Fetch all events from today forward (up to 3 months)
    const today = new Date()
    const formatDate = (d: Date) => d.toISOString().split('T')[0]
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 3)

    const eventsRes = await fetch(
      `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(today)}&endDate=${formatDate(endDate)}`,
      { headers: { 'Teamup-Token': apiKey } }
    )

    if (!eventsRes.ok) {
      return NextResponse.json(
        { error: `Teamup API error: ${eventsRes.status}`, cancelled: cancelled.count },
        { status: 500 }
      )
    }

    const eventsData = await eventsRes.json()
    const events: Array<{
      id: string
      title: string
      notes?: string
      start_dt: string
      end_dt: string
      subcalendar_ids: number[]
    }> = eventsData.events || []

    // Step 4: Recreate reminders for each future event
    let created = 0
    const now = new Date()

    for (const event of events) {
      const notes = (event.notes || '').replace(/<[^>]+>/g, '')
      const phoneMatch = notes.match(/Phone:\s*(\d+)/)
      const studentMatch = notes.match(/Student:\s*(.+)/)
      const isTruck = /TruckClass:\s*yes/i.test(notes)

      if (!phoneMatch) continue // No phone = can't send reminder

      const phone = phoneMatch[1]
      const studentName = studentMatch ? studentMatch[1].trim().replace(/\s*#\d+$/, '') : 'Student'
      const startDt = new Date(event.start_dt)
      const startTime = event.start_dt.slice(11, 16) // "HH:MM"
      const teacherId = event.subcalendar_ids[0]
      const teacherFullName = teacherId ? teacherMap.get(teacherId) : null
      const teacherFirst = teacherFullName ? teacherFullName.split(' ')[0] : ''
      const teacherStr = teacherFirst ? ` with ${teacherFirst}` : ''

      if (isTruck) {
        // Truck: 6 hours before
        const reminderTime = new Date(startDt.getTime() - 6 * 60 * 60 * 1000)
        if (reminderTime <= now) continue

        const classNumMatch = notes.match(/ClassNumber:\s*(\d+)/)
        const classNum = classNumMatch ? classNumMatch[1] : ''
        const isExam = /Exam:/i.test(notes)
        const examLocationMatch = notes.match(/Exam:\s*(.+)/)

        let reminderMessage: string
        if (isExam) {
          const location = examLocationMatch ? examLocationMatch[1].trim() : ''
          reminderMessage = `Reminder: You have your Truck Exam today at ${formatTime12h(startTime)}${location ? ` in ${location}` : ''}. Good luck! 🍀`
        } else {
          reminderMessage = `Reminder: You have Truck Class ${classNum} today at ${formatTime12h(startTime)}. See you there!`
        }

        await prisma.scheduledMessage.create({
          data: {
            groupId: 'truck-classes',
            message: reminderMessage,
            scheduledAt: reminderTime,
            memberPhones: JSON.stringify([phone]),
            status: 'pending',
          },
        })
        created++
      } else {
        // Car: 1 hour before
        const reminderTime = new Date(startDt.getTime() - 1 * 60 * 60 * 1000)
        if (reminderTime <= now) continue

        // Parse module from title (e.g. "Session 5 - StudentName" or "Pre-Trip - StudentName")
        const titleParts = event.title.split(' - ')
        const moduleStr = titleParts[0]?.trim() || 'class'
        const classDateISO = event.start_dt.split('T')[0]
        const endTime = event.end_dt.slice(11, 16)
        const timeStr = `from ${formatTime12h(startTime)} to ${formatTime12h(endTime)}`

        const reminderMessage = `Reminder: Hi ${studentName}, your ${moduleStr} class${teacherStr} is in 1 hour (${formatTime12h(startTime)}). See you soon!`

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
        created++
      }
    }

    console.log(`[rebuild-reminders] Created ${created} fresh reminders from ${events.length} events`)

    return NextResponse.json({
      success: true,
      cancelled: cancelled.count,
      eventsScanned: events.length,
      remindersCreated: created,
    })
  } catch (error) {
    console.error('Failed to rebuild reminders:', error)
    return NextResponse.json(
      { error: 'Failed to rebuild reminders' },
      { status: 500 }
    )
  }
}
