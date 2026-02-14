import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = 'https://api.teamup.com'

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const subcalendarId = searchParams.get('subcalendarId')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      )
    }

    let url = `${BASE_URL}/${calendarKey}/events?startDate=${startDate}&endDate=${endDate}`
    if (subcalendarId) {
      url += `&subcalendarId[]=${subcalendarId}`
    }

    const res = await fetch(url, {
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

    const data = await res.json()
    return NextResponse.json(data.events || [])
  } catch (error) {
    console.error('Failed to fetch events:', error)
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    const body = await request.json()
    const { title, startDate, endDate, subcalendarIds, notes } = body

    if (!title || !startDate || !endDate || !subcalendarIds?.length) {
      return NextResponse.json(
        { error: 'title, startDate, endDate, and subcalendarIds are required' },
        { status: 400 }
      )
    }

    const res = await fetch(`${BASE_URL}/${calendarKey}/events`, {
      method: 'POST',
      headers: {
        'Teamup-Token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
    console.error('Failed to create event:', error)
    return NextResponse.json(
      { error: 'Failed to create event' },
      { status: 500 }
    )
  }
}
