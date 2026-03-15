import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Cancel pending reminders for a student's specific class (by phone + classDateISO + optional startTime)
// Used when editing or deleting a class to prevent stale reminders
// If startTime is provided, only cancels the reminder for that specific class time
// If startTime is omitted, cancels ALL reminders for that student on that date (used for delete)
export async function POST(request: NextRequest) {
  try {
    const { phone, classDateISO, startTime } = await request.json()

    if (!phone || !classDateISO) {
      return NextResponse.json(
        { error: 'phone and classDateISO are required' },
        { status: 400 }
      )
    }

    // Find pending reminders that match this phone and class date
    const pendingReminders = await prisma.scheduledMessage.findMany({
      where: {
        status: 'pending',
        classDateISO,
      },
    })

    // Filter by phone in memberPhones JSON + optionally by specific class time
    const toCancel = pendingReminders.filter(r => {
      try {
        const phones: string[] = JSON.parse(r.memberPhones)
        if (!phones.includes(phone)) return false

        // If startTime is provided, only cancel the reminder for that specific class
        // Reminders are scheduled 3 hours before the class, so scheduledAt = classTime - 3hr
        if (startTime) {
          const classDateTime = new Date(`${classDateISO}T${startTime}:00`)
          const expectedReminderTime = new Date(classDateTime.getTime() - 3 * 60 * 60 * 1000)
          // Allow 2-minute tolerance for timing differences
          const diff = Math.abs(r.scheduledAt.getTime() - expectedReminderTime.getTime())
          return diff < 2 * 60 * 1000
        }

        return true // No startTime filter — cancel all for this date
      } catch {
        return false
      }
    })

    // Also check truck-class reminders that don't have classDateISO but match by scheduledAt date
    // Truck reminders are scheduled 6hrs before, so check if the reminder's target class is on classDateISO
    const truckReminders = await prisma.scheduledMessage.findMany({
      where: {
        status: 'pending',
        groupId: 'truck-classes',
        classDateISO: null,
      },
    })

    const classDayStart = new Date(classDateISO + 'T00:00:00')
    const classDayEnd = new Date(classDateISO + 'T23:59:59')

    const truckToCancel = truckReminders.filter(r => {
      try {
        const phones: string[] = JSON.parse(r.memberPhones)
        if (!phones.includes(phone)) return false
        // The reminder is 6 hours before, so the class time is scheduledAt + 6 hours
        const classTime = new Date(r.scheduledAt.getTime() + 6 * 60 * 60 * 1000)

        // If startTime is provided, match to within 2 minutes of the specific class time
        if (startTime) {
          const expectedClassTime = new Date(`${classDateISO}T${startTime}:00`)
          const diff = Math.abs(classTime.getTime() - expectedClassTime.getTime())
          return diff < 2 * 60 * 1000
        }

        return classTime >= classDayStart && classTime <= classDayEnd
      } catch {
        return false
      }
    })

    const allToCancel = [...toCancel, ...truckToCancel]

    if (allToCancel.length === 0) {
      return NextResponse.json({ cancelled: 0 })
    }

    // Cancel them
    const result = await prisma.scheduledMessage.updateMany({
      where: {
        id: { in: allToCancel.map(r => r.id) },
      },
      data: {
        status: 'cancelled',
      },
    })

    console.log(`[cancel-reminder] Cancelled ${result.count} reminders for ${phone} on ${classDateISO}${startTime ? ` at ${startTime}` : ' (all)'}`)

    return NextResponse.json({ cancelled: result.count })
  } catch (error) {
    console.error('Failed to cancel reminders:', error)
    return NextResponse.json(
      { error: 'Failed to cancel reminders' },
      { status: 500 }
    )
  }
}
