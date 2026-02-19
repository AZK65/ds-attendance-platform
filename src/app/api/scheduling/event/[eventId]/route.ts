import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = 'https://api.teamup.com'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    const res = await fetch(`${BASE_URL}/${calendarKey}/events/${eventId}`, {
      headers: {
        'Teamup-Token': apiKey,
      },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Teamup API error: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data.event || data)
  } catch (error) {
    console.error('Failed to fetch event:', error)
    return NextResponse.json(
      { error: 'Failed to fetch event' },
      { status: 500 }
    )
  }
}
