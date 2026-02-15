import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = 'https://api.teamup.com'

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    const { searchParams } = new URL(request.url)
    const studentName = searchParams.get('studentName')
    const phone = searchParams.get('phone')

    if (!studentName && !phone) {
      return NextResponse.json(
        { error: 'studentName or phone is required' },
        { status: 400 }
      )
    }

    // Search events using Teamup search API with student name as query
    // Use a wide date range to get all past and future events
    const today = new Date()
    const startDate = new Date(today)
    startDate.setMonth(startDate.getMonth() - 6) // 6 months back
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 3) // 3 months forward

    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    let url = `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`
    if (studentName) {
      url += `&query=${encodeURIComponent(studentName)}`
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
    let events = data.events || []

    // Filter by phone in notes if provided (more precise match)
    if (phone) {
      events = events.filter((event: { notes?: string; title?: string }) => {
        const notes = event.notes || ''
        const phoneMatch = notes.match(/Phone:\s*(\d+)/)
        if (phoneMatch) {
          return phoneMatch[1] === phone
        }
        // If no phone in notes but studentName matches in title, still include
        if (studentName && event.title?.includes(studentName)) {
          return true
        }
        return false
      })
    }

    // Sort by date - upcoming first, then past
    events.sort((a: { start_dt: string }, b: { start_dt: string }) => {
      return new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime()
    })

    return NextResponse.json(events)
  } catch (error) {
    console.error('Failed to fetch student events:', error)
    return NextResponse.json(
      { error: 'Failed to fetch student events' },
      { status: 500 }
    )
  }
}
