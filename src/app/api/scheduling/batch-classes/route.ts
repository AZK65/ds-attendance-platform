import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = 'https://api.teamup.com'

interface ClassInfo {
  lastClass: { date: string; title: string } | null
  nextClass: { date: string; title: string } | null
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    const { phones } = await request.json() as { phones: string[] }

    if (!phones || phones.length === 0) {
      return NextResponse.json({ results: {} })
    }

    const today = new Date()
    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    // Fetch all events in a wide range (3 months back, 3 months forward)
    const startDate = new Date(today)
    startDate.setMonth(startDate.getMonth() - 3)
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 3)

    const url = `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`
    const res = await fetch(url, {
      headers: { 'Teamup-Token': apiKey },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Teamup API error: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    const allEvents: Array<{ id: string; title?: string; notes?: string; start_dt: string }> = data.events || []

    // Build a map: phone -> { lastClass, nextClass }
    const results: Record<string, ClassInfo> = {}
    const nowTime = today.getTime()

    // For each phone, find matching events
    for (const phone of phones) {
      const cleanPhone = phone.replace(/\D/g, '')
      if (!cleanPhone) continue

      // Find events that mention this phone number in notes
      const matchingEvents = allEvents.filter((event) => {
        const notes = event.notes || ''
        const phoneMatch = notes.match(/Phone:\s*(\d+)/)
        if (phoneMatch) {
          return phoneMatch[1] === cleanPhone
        }
        return false
      })

      // Sort by start date
      matchingEvents.sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

      let lastClass: ClassInfo['lastClass'] = null
      let nextClass: ClassInfo['nextClass'] = null

      for (const event of matchingEvents) {
        const eventTime = new Date(event.start_dt).getTime()
        if (eventTime <= nowTime) {
          // Past or current event - keep updating to get the most recent
          lastClass = {
            date: event.start_dt,
            title: event.title || 'Class',
          }
        } else if (!nextClass) {
          // First future event
          nextClass = {
            date: event.start_dt,
            title: event.title || 'Class',
          }
        }
      }

      results[phone] = { lastClass, nextClass }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Failed to fetch batch classes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch batch classes' },
      { status: 500 }
    )
  }
}
