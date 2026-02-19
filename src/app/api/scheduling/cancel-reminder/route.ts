import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Cancel pending reminders for a student's class (by phone + classDateISO)
// Used when editing or deleting a class to prevent stale reminders
export async function POST(request: NextRequest) {
  try {
    const { phone, classDateISO } = await request.json()

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

    // Filter by phone in memberPhones JSON
    const toCancel = pendingReminders.filter(r => {
      try {
        const phones: string[] = JSON.parse(r.memberPhones)
        return phones.includes(phone)
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

    console.log(`[cancel-reminder] Cancelled ${result.count} reminders for ${phone} on ${classDateISO}`)

    return NextResponse.json({ cancelled: result.count })
  } catch (error) {
    console.error('Failed to cancel reminders:', error)
    return NextResponse.json(
      { error: 'Failed to cancel reminders' },
      { status: 500 }
    )
  }
}
