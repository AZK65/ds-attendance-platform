import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { scheduleReminderFromEvent } from '@/lib/in-car-reminders'
import { planTruckReminder, truckSessionFromEvent } from '@/lib/truck-reminders'

const BASE_URL = 'https://api.teamup.com'

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

    // Step 2: Fetch all events from today forward (up to 3 months)
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

    // Step 3: Recreate reminders for each future event
    let created = 0
    const now = new Date()

    for (const event of events) {
      const notes = (event.notes || '').replace(/<[^>]+>/g, '')
      const phoneMatch = notes.match(/Phone:\s*(\d+)/)
      const isTruck = /TruckClass:\s*yes/i.test(notes)

      if (!phoneMatch) continue // No phone = can't send reminder

      const phone = phoneMatch[1]
      const teacherId = event.subcalendar_ids[0]

      if (isTruck) {
        const session = truckSessionFromEvent({
          notes: event.notes,
          title: event.title,
          startDt: event.start_dt,
          endDt: event.end_dt,
        })
        if (!session) continue
        const plan = planTruckReminder({
          kind: session.kind,
          date: session.date,
          startTime: session.startTime,
          endTime: session.endTime,
          classNumber: session.classNumber,
          examLocation: session.examLocation,
          now,
        })
        if (!plan.scheduledAt) continue

        await prisma.scheduledMessage.create({
          data: {
            groupId: 'truck-classes',
            teamupEventId: String(event.id),
            message: plan.message,
            scheduledAt: plan.scheduledAt,
            memberPhones: JSON.stringify([phone]),
            classDateISO: plan.classDateISO,
            classTime: plan.classTime,
            status: 'pending',
          },
        })
        created++
      } else {
        await scheduleReminderFromEvent({
          startDateIso: event.start_dt,
          endDateIso: event.end_dt,
          notes: event.notes,
          title: event.title,
          subcalendarId: teacherId,
          teamupEventId: String(event.id),
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
