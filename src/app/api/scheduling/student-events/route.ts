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

    // Use a wide date range to get all past and future events
    const today = new Date()
    const startDate = new Date(today)
    startDate.setMonth(startDate.getMonth() - 6) // 6 months back
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 3) // 3 months forward

    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    // Strategy: if we have a phone number, search by phone (more reliable)
    // Also search by name as a fallback to catch events without phone in notes
    const allEvents: Array<{ id: string; title?: string; notes?: string; start_dt: string; end_dt: string; subcalendar_ids: number[] }> = []
    const seenIds = new Set<string>()

    // Search by phone number if provided (catches events regardless of name typos)
    if (phone) {
      const phoneUrl = `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}&query=${encodeURIComponent(phone)}`
      const phoneRes = await fetch(phoneUrl, {
        headers: { 'Teamup-Token': apiKey },
      })
      if (phoneRes.ok) {
        const phoneData = await phoneRes.json()
        for (const ev of (phoneData.events || [])) {
          if (!seenIds.has(ev.id)) {
            seenIds.add(ev.id)
            allEvents.push(ev)
          }
        }
      }
    }

    // Also search by name to catch events that might not have phone in notes
    if (studentName) {
      const nameUrl = `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}&query=${encodeURIComponent(studentName)}`
      const nameRes = await fetch(nameUrl, {
        headers: { 'Teamup-Token': apiKey },
      })
      if (nameRes.ok) {
        const nameData = await nameRes.json()
        for (const ev of (nameData.events || [])) {
          if (!seenIds.has(ev.id)) {
            seenIds.add(ev.id)
            allEvents.push(ev)
          }
        }
      }
    }

    // Now filter to only events that actually belong to this student
    // Match by phone in notes (most reliable) or by name in title/notes
    let events = allEvents.filter((event) => {
      const notes = event.notes || ''
      const title = event.title || ''

      // Check phone match in notes (most reliable)
      const phoneInNotes = notes.match(/Phone:\s*(\d+)/)
      if (phoneInNotes && phone) {
        return phoneInNotes[1] === phone
      }

      // Check student name match in notes (contains match, not exact)
      const studentInNotes = notes.match(/Student:\s*(.+?)(?:<|$)/)
      if (studentInNotes && studentName) {
        const noteNameClean = studentInNotes[1].trim().toLowerCase()
        const searchNameClean = studentName.trim().toLowerCase()
        // Match if either contains the other (handles "DAYA" matching "DAYA NAND")
        if (noteNameClean.includes(searchNameClean) || searchNameClean.includes(noteNameClean)) {
          return true
        }
      }

      // Check name in title
      if (studentName && title.toLowerCase().includes(studentName.trim().toLowerCase())) {
        return true
      }

      return false
    })

    // Sort by date ascending
    events.sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

    return NextResponse.json(events)
  } catch (error) {
    console.error('Failed to fetch student events:', error)
    return NextResponse.json(
      { error: 'Failed to fetch student events' },
      { status: 500 }
    )
  }
}
