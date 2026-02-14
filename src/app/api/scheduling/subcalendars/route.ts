import { NextResponse } from 'next/server'

const TEAMUP_API_KEY = process.env.TEAMUP_API_KEY || ''
const TEAMUP_CALENDAR_KEY = process.env.TEAMUP_CALENDAR_KEY || ''
const BASE_URL = 'https://api.teamup.com'

export async function GET() {
  try {
    const res = await fetch(`${BASE_URL}/${TEAMUP_CALENDAR_KEY}/subcalendars`, {
      headers: {
        'Teamup-Token': TEAMUP_API_KEY,
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
