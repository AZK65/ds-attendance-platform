import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  extractTheoryGroupName,
  extractTheorySequence,
  isGroupTheoryEvent,
  notifyGroupTheoryScheduleChange,
  resolveTheoryGroup,
  syncGroupTheoryReminder,
  type GroupTheoryEvent,
} from '@/lib/group-theory-schedule'

const BASE_URL = 'https://api.teamup.com'

function teamupConfig() {
  return {
    apiKey: process.env.TEAMUP_API_KEY || '',
    calendarKey: process.env.TEAMUP_CALENDAR_KEY || '',
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

async function fetchEvent(eventId: string): Promise<GroupTheoryEvent | null> {
  const { apiKey, calendarKey } = teamupConfig()
  const response = await fetch(`${BASE_URL}/${calendarKey}/events/${encodeURIComponent(eventId)}`, {
    headers: { 'Teamup-Token': apiKey },
    cache: 'no-store',
  })
  if (!response.ok) return null
  const data = await response.json() as { event?: GroupTheoryEvent }
  return data.event || null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { apiKey, calendarKey } = teamupConfig()
    if (!apiKey || !calendarKey) {
      return NextResponse.json({ error: 'Teamup is not configured' }, { status: 500 })
    }

    const { groupId } = await params
    const decodedGroupId = decodeURIComponent(groupId)
    const group = await prisma.group.findUnique({
      where: { id: decodedGroupId },
      select: { id: true, name: true, vehicleType: true },
    })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    const start = new Date()
    start.setDate(start.getDate() - 1)
    const end = new Date(start)
    end.setMonth(end.getMonth() + 18)
    const url = `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(start)}&endDate=${formatDate(end)}&query=${encodeURIComponent(group.name)}`
    const response = await fetch(url, {
      headers: { 'Teamup-Token': apiKey },
      cache: 'no-store',
    })
    if (!response.ok) {
      return NextResponse.json({ error: `Teamup API error: ${response.status}` }, { status: 502 })
    }

    const data = await response.json() as { events?: GroupTheoryEvent[] }
    const wanted = group.name.trim().replace(/\s+/g, ' ').toLowerCase()
    const events = (data.events || [])
      .filter(isGroupTheoryEvent)
      .filter(event => extractTheoryGroupName(event).trim().replace(/\s+/g, ' ').toLowerCase() === wanted)
      .filter(event => new Date(event.end_dt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())
      .map(event => ({ ...event, ...extractTheorySequence(event) }))

    const reminderRows = await prisma.scheduledMessage.findMany({
      where: { groupId: group.id, status: 'pending', isGroupMessage: true },
      select: { teamupEventId: true, classDateISO: true, classTime: true, scheduledAt: true },
    })
    const reminders = Object.fromEntries(reminderRows.map(row => [
      row.teamupEventId || `date:${row.classDateISO}`,
      row,
    ]))

    return NextResponse.json({ group, events, reminders })
  } catch (error) {
    console.error('[Group schedule GET] Error:', error)
    return NextResponse.json({ error: 'Failed to load group schedule' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { apiKey, calendarKey } = teamupConfig()
    if (!apiKey || !calendarKey) {
      return NextResponse.json({ error: 'Teamup is not configured' }, { status: 500 })
    }

    const { groupId } = await params
    const decodedGroupId = decodeURIComponent(groupId)
    const body = await request.json() as {
      eventId?: string
      date?: string
      startTime?: string
      endTime?: string
      subcalendarId?: number
      notifyGroup?: boolean
    }
    if (!body.eventId || !validDate(body.date) || !validTime(body.startTime) || !validTime(body.endTime)) {
      return NextResponse.json({ error: 'Event, date, start time, and end time are required' }, { status: 400 })
    }
    if (minutes(body.endTime) <= minutes(body.startTime)) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    }

    const group = await prisma.group.findUnique({
      where: { id: decodedGroupId },
      select: { id: true, name: true, vehicleType: true },
    })
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    if (group.vehicleType !== 'truck' && (minutes(body.startTime) < 7 * 60 || minutes(body.endTime) > 20 * 60)) {
      return NextResponse.json({ error: 'Car group classes must be between 7:00 AM and 8:00 PM' }, { status: 400 })
    }

    const previous = await fetchEvent(body.eventId)
    if (!previous || !isGroupTheoryEvent(previous)) {
      return NextResponse.json({ error: 'Group theory event not found' }, { status: 404 })
    }
    const owner = await resolveTheoryGroup(previous)
    if (!owner || owner.id !== decodedGroupId) {
      return NextResponse.json({ error: 'This Teamup event does not belong to this group' }, { status: 409 })
    }

    const startDt = `${body.date}T${body.startTime}:00`
    const endDt = `${body.date}T${body.endTime}:00`
    const subcalendarIds = Number.isInteger(body.subcalendarId)
      ? [Number(body.subcalendarId)]
      : previous.subcalendar_ids || []
    const response = await fetch(`${BASE_URL}/${calendarKey}/events/${encodeURIComponent(body.eventId)}`, {
      method: 'PUT',
      headers: {
        'Teamup-Token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: body.eventId,
        title: previous.title,
        start_dt: startDt,
        end_dt: endDt,
        subcalendar_ids: subcalendarIds,
        notes: previous.notes || '',
      }),
    })
    if (!response.ok) {
      const detail = await response.text()
      return NextResponse.json({ error: `Teamup API error: ${response.status} ${detail}` }, { status: response.status })
    }

    const responseData = await response.json() as { event?: GroupTheoryEvent }
    const updated: GroupTheoryEvent = responseData.event || {
      ...previous,
      start_dt: startDt,
      end_dt: endDt,
      subcalendar_ids: subcalendarIds,
    }
    const timeChanged = previous.start_dt !== updated.start_dt || previous.end_dt !== updated.end_dt
    const reminder = await syncGroupTheoryReminder(updated, previous.start_dt)
    let notified = false
    if (timeChanged && body.notifyGroup !== false) {
      notified = await notifyGroupTheoryScheduleChange(updated)
    }

    await prisma.teamupEventSnapshot.upsert({
      where: { eventId: String(updated.id) },
      update: {
        title: updated.title,
        startDt: updated.start_dt,
        endDt: updated.end_dt,
        notes: updated.notes || '',
        lastSeen: new Date(),
      },
      create: {
        eventId: String(updated.id),
        title: updated.title,
        startDt: updated.start_dt,
        endDt: updated.end_dt,
        notes: updated.notes || '',
      },
    })

    return NextResponse.json({ success: true, event: updated, reminder, notified })
  } catch (error) {
    console.error('[Group schedule PUT] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update group schedule' },
      { status: 500 },
    )
  }
}
