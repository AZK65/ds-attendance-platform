import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = 'https://api.teamup.com'

interface TeamupEvent {
  id: string
  title?: string
  notes?: string
  start_dt: string
  end_dt?: string
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '')

const parseGroupFromNotes = (notes?: string) => {
  if (!notes) return ''
  const match = stripHtml(notes).match(/Group:\s*(.+)/)
  return match?.[1]?.trim() || ''
}

const isTheoryEvent = (event: TeamupEvent) => {
  const titleMatch = event.title?.match(/^Module\s+\d+\s+-/)
  const notesMatch = event.notes && stripHtml(event.notes).toLowerCase().includes('theory class')
  return !!(titleMatch || notesMatch)
}

const getTheoryGroupName = (event: TeamupEvent) => {
  const fromNotes = parseGroupFromNotes(event.notes)
  if (fromNotes) return fromNotes
  const parts = (event.title || '').split(' - ')
  return parts[1]?.trim() || ''
}

const parseModuleNumber = (title?: string) => {
  const m = title?.match(/^Module\s+(\d+)\s+-/)
  return m ? parseInt(m[1]) : null
}

interface NextTheory {
  date: string
  endDate: string | null
  title: string
  module: number | null
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    const { groupNames } = await request.json() as { groupNames: string[] }
    if (!Array.isArray(groupNames) || groupNames.length === 0) {
      return NextResponse.json({ results: {} })
    }

    const today = new Date()
    const nowTime = today.getTime()
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 6)
    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    // Single fetch — pull every theory event in the window, then bucket
    // per-group locally instead of N round-trips to Teamup.
    const url = `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(today)}&endDate=${formatDate(endDate)}`
    const res = await fetch(url, { headers: { 'Teamup-Token': apiKey } })
    if (!res.ok) {
      return NextResponse.json({ results: {} })
    }
    const data = await res.json()
    const events: TeamupEvent[] = data.events || []

    const theoryEvents = events
      .filter(isTheoryEvent)
      .filter((ev) => new Date(ev.start_dt).getTime() >= nowTime)
      .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

    // For each group, find the earliest matching theory event
    const results: Record<string, NextTheory | null> = {}
    for (const name of groupNames) {
      const clean = name.trim().toLowerCase()
      const match = theoryEvents.find((ev) => getTheoryGroupName(ev).toLowerCase() === clean)
      if (!match) {
        results[name] = null
      } else {
        results[name] = {
          date: match.start_dt,
          endDate: match.end_dt || null,
          title: match.title || '',
          module: parseModuleNumber(match.title),
        }
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Failed to fetch groups next theory:', error)
    return NextResponse.json({ results: {} })
  }
}
