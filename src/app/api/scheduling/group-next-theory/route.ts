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

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

    const { searchParams } = new URL(request.url)
    const groupName = searchParams.get('groupName')

    if (!groupName) {
      return NextResponse.json({ error: 'groupName is required' }, { status: 400 })
    }

    const today = new Date()
    const nowTime = today.getTime()
    const startDate = new Date(today)
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + 6)

    const formatDate = (d: Date) => d.toISOString().split('T')[0]

    const url = `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}&query=${encodeURIComponent(groupName)}`
    const res = await fetch(url, { headers: { 'Teamup-Token': apiKey } })
    if (!res.ok) {
      return NextResponse.json({ next: null })
    }

    const data = await res.json()
    const events: TeamupEvent[] = data.events || []

    const groupClean = groupName.trim().toLowerCase()

    const upcoming = events
      .filter((ev) => isTheoryEvent(ev))
      .filter((ev) => getTheoryGroupName(ev).toLowerCase() === groupClean)
      .filter((ev) => new Date(ev.start_dt).getTime() >= nowTime)
      .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())

    const next = upcoming[0]
    if (!next) return NextResponse.json({ next: null })

    return NextResponse.json({
      next: {
        date: next.start_dt,
        endDate: next.end_dt || null,
        title: next.title || '',
        module: parseModuleNumber(next.title),
      },
    })
  } catch (error) {
    console.error('Failed to fetch group next theory:', error)
    return NextResponse.json({ next: null })
  }
}
