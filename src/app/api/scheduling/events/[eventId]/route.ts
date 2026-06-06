import { NextRequest, NextResponse } from 'next/server'
import {
  cancelInCarReminderFor,
  extractPhone,
  scheduleReminderFromEvent,
} from '@/lib/in-car-reminders'

const BASE_URL = 'https://api.teamup.com'

// Fetch a Teamup event by id so we know what the *previous* start
// date/phone were — needed to cancel the old reminder when an admin
// reschedules a class via the app's edit dialog.
async function fetchTeamupEvent(eventId: string): Promise<{
  start_dt?: string
  notes?: string
} | null> {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
    const res = await fetch(`${BASE_URL}/${calendarKey}/events/${eventId}`, {
      headers: { 'Teamup-Token': apiKey },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.event || null
  } catch { return null }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
    const { eventId } = await params
    const body = await request.json()
    const { title, startDate, endDate, subcalendarIds, notes } = body

    // Grab the pre-update event so we can cancel any stale reminder
    // keyed to its old date if the admin moved the class to a new day.
    const previous = await fetchTeamupEvent(eventId)

    const res = await fetch(`${BASE_URL}/${calendarKey}/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Teamup-Token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: eventId,
        title,
        start_dt: startDate,
        end_dt: endDate,
        subcalendar_ids: subcalendarIds,
        notes: notes || '',
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Teamup API error: ${res.status} ${text}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    // Cancel reminder on the *old* date (if it differs) then queue a
    // fresh one for the new date. scheduleReminderFromEvent itself is
    // idempotent for the new (date, phone) pair.
    try {
      if (previous) {
        const oldPhone = extractPhone(previous.notes)
        const oldDateISO = (previous.start_dt || '').split('T')[0]
        const newDateISO = (startDate || '').split('T')[0]
        if (oldPhone && oldDateISO && oldDateISO !== newDateISO) {
          await cancelInCarReminderFor({ phone: oldPhone, classDateISO: oldDateISO })
        }
      }
      await scheduleReminderFromEvent({
        startDateIso: startDate,
        notes,
        title,
        subcalendarId: Array.isArray(subcalendarIds) ? Number(subcalendarIds[0]) : undefined,
      })
    } catch (err) {
      console.error('[events PUT] reminder update failed (non-fatal):', err)
    }

    return NextResponse.json(data.event || data)
  } catch (error) {
    console.error('Failed to update event:', error)
    return NextResponse.json(
      { error: 'Failed to update event' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
    const { eventId } = await params

    // Look up the event first so we can cancel its reminder after the
    // Teamup delete succeeds. (poll-changes will eventually catch
    // direct-on-Teamup deletions; this covers the in-app delete path
    // immediately so we don't have to wait for the next poll tick.)
    const previous = await fetchTeamupEvent(eventId)

    const res = await fetch(`${BASE_URL}/${calendarKey}/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Teamup-Token': apiKey,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Teamup API error: ${res.status} ${text}` },
        { status: res.status }
      )
    }

    try {
      if (previous) {
        const phone = extractPhone(previous.notes)
        const dateISO = (previous.start_dt || '').split('T')[0]
        if (phone && dateISO) {
          await cancelInCarReminderFor({ phone, classDateISO: dateISO })
        }
      }
    } catch (err) {
      console.error('[events DELETE] reminder cancel failed (non-fatal):', err)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete event:', error)
    return NextResponse.json(
      { error: 'Failed to delete event' },
      { status: 500 }
    )
  }
}
