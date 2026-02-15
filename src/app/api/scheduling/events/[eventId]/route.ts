import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = 'https://api.teamup.com'

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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete event:', error)
    return NextResponse.json(
      { error: 'Failed to delete event' },
      { status: 500 }
    )
  }
}
