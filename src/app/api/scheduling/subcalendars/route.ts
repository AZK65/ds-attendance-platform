import { NextResponse } from 'next/server'

const BASE_URL = 'https://api.teamup.com'

export async function GET() {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    if (!apiKey || !calendarKey) {
      return NextResponse.json(
        { error: 'TEAMUP_API_KEY or TEAMUP_CALENDAR_KEY not configured' },
        { status: 500 }
      )
    }

    const res = await fetch(`${BASE_URL}/${calendarKey}/subcalendars`, {
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
    return NextResponse.json(data.subcalendars || [])
  } catch (error) {
    console.error('Failed to fetch subcalendars:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcalendars' },
      { status: 500 }
    )
  }
}
