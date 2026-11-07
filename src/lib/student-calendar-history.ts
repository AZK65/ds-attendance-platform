import { namesEqual, phoneLast10 } from '@/lib/student-match'

export interface StudentCalendarEvent {
  id: string
  title: string
  notes?: string
  start_dt: string
  end_dt: string
  subcalendar_ids: number[]
}

// Fixed, before this platform's calendar history (2026), not a six-month window.
// Teamup rejects arbitrarily old dates such as 2000; 2020 is accepted by this calendar.
export const STUDENT_HISTORY_START = '2020-01-01'

export function calendarEventBelongsToStudent(event: StudentCalendarEvent, identity: {
  phone?: string; studentName?: string; groupName?: string
}): boolean {
  const notes = (event.notes || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')
  const recordedPhone = notes.match(/Phone:\s*([+\d ().-]+)/i)?.[1]
  const phone = phoneLast10(identity.phone)
  // An explicit different phone must never be overridden by a shared name.
  if (recordedPhone && phone) return phoneLast10(recordedPhone) === phone
  const recordedName = notes.match(/Student:\s*([^\n]+)/i)?.[1]
  if (recordedName && identity.studentName && namesEqual(recordedName, identity.studentName)) return true
  const titleName = event.title.split(/\s+-\s+/)[1]
  if (!recordedPhone && identity.studentName && namesEqual(titleName, identity.studentName)) return true
  const group = identity.groupName?.trim().toLowerCase()
  return !!group && !recordedPhone && (`${event.title}\n${notes}`).toLowerCase().includes(group)
}

export async function loadStudentCalendarHistory(identity: {
  phone?: string; studentName?: string; groupName?: string
}, now = new Date()): Promise<StudentCalendarEvent[]> {
  const apiKey = process.env.TEAMUP_API_KEY
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY
  if (!apiKey || !calendarKey) throw new Error('Calendar connection is not configured')
  const end = new Date(now)
  end.setUTCMonth(end.getUTCMonth() + 3)
  const queries = new Set<string>()
  const phone = phoneLast10(identity.phone)
  if (phone) queries.add(phone)
  if (identity.studentName?.trim()) queries.add(identity.studentName.trim())
  // Teamup search treats # specially; match group names locally instead.
  if (identity.groupName?.trim()) queries.add('')
  const found = new Map<string, StudentCalendarEvent>()
  for (const query of queries) {
    const url = new URL(`https://api.teamup.com/${calendarKey}/events`)
    url.searchParams.set('startDate', STUDENT_HISTORY_START)
    url.searchParams.set('endDate', end.toISOString().slice(0, 10))
    if (query) url.searchParams.set('query', query)
    const response = await fetch(url, {
      headers: { 'Teamup-Token': apiKey }, next: { revalidate: 60 },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`Calendar history unavailable (${response.status})`)
    const data = await response.json() as { events?: StudentCalendarEvent[] }
    if (!Array.isArray(data.events)) throw new Error('Calendar returned an incomplete history')
    for (const event of data.events) {
      if (calendarEventBelongsToStudent(event, identity)) found.set(String(event.id), { ...event, id: String(event.id) })
    }
  }
  return [...found.values()].sort((a, b) => a.start_dt.localeCompare(b.start_dt))
}
