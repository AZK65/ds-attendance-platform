import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET — fetch attendance for a list of event IDs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const eventIds = searchParams.get('eventIds')

    if (!eventIds) {
      return NextResponse.json({ error: 'eventIds required' }, { status: 400 })
    }

    const ids = eventIds.split(',').filter(Boolean)
    const records = await prisma.classAttendance.findMany({
      where: { eventId: { in: ids } },
    })

    // Return as a map { eventId: true/false }
    const map: Record<string, boolean> = {}
    for (const r of records) {
      map[r.eventId] = r.present
    }

    return NextResponse.json(map)
  } catch (error) {
    console.error('Failed to fetch attendance:', error)
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 })
  }
}

// POST — toggle attendance for an event
export async function POST(request: NextRequest) {
  try {
    const { eventId, present } = await request.json()

    if (!eventId || typeof present !== 'boolean') {
      return NextResponse.json({ error: 'eventId and present (boolean) required' }, { status: 400 })
    }

    if (present) {
      // Upsert — mark as present
      await prisma.classAttendance.upsert({
        where: { eventId },
        create: { eventId, present: true },
        update: { present: true },
      })
    } else {
      // Delete — remove attendance record (absent = no record)
      await prisma.classAttendance.deleteMany({
        where: { eventId },
      })
    }

    return NextResponse.json({ success: true, eventId, present })
  } catch (error) {
    console.error('Failed to update attendance:', error)
    return NextResponse.json({ error: 'Failed to update attendance' }, { status: 500 })
  }
}
