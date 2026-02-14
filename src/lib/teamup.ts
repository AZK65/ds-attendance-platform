const BASE_URL = 'https://api.teamup.com'

let cachedFayyazSubcalendarId: number | null = null

/**
 * Parse a time range string like "5 pm to 7 pm" into { start: "17:00", end: "19:00" }
 */
export function parseTimeRange(timeStr: string): { start: string; end: string } | null {
  // Match patterns like "5 pm", "5:30 pm", "10 am"
  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi
  const matches = [...timeStr.matchAll(timePattern)]

  if (matches.length < 2) return null

  const parse = (m: RegExpMatchArray) => {
    let hour = parseInt(m[1])
    const minute = m[2] ? parseInt(m[2]) : 0
    const period = m[3].toLowerCase()
    if (period === 'pm' && hour !== 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  }

  return { start: parse(matches[0]), end: parse(matches[1]) }
}

/**
 * Find Fayyaz's subcalendar ID by name match
 */
async function getFayyazSubcalendarId(): Promise<number | null> {
  if (cachedFayyazSubcalendarId !== null) return cachedFayyazSubcalendarId

  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (!apiKey || !calendarKey) return null

  try {
    const res = await fetch(`${BASE_URL}/${calendarKey}/subcalendars`, {
      headers: { 'Teamup-Token': apiKey },
    })
    if (!res.ok) return null

    const data = await res.json()
    const subcalendars = data.subcalendars || []
    const fayyaz = subcalendars.find(
      (s: { name: string; active: boolean }) =>
        s.active && s.name.toLowerCase().includes('fayyaz')
    )

    if (fayyaz) {
      cachedFayyazSubcalendarId = fayyaz.id
      return fayyaz.id
    }
    return null
  } catch (error) {
    console.error('Failed to fetch subcalendars for Fayyaz lookup:', error)
    return null
  }
}

/**
 * Create a 2-hour theory class event on Fayyaz's Teamup calendar
 */
export async function createTheoryEvent({
  classDate,
  classTime,
  moduleNumber,
  groupName,
}: {
  classDate: string      // ISO date like "2026-02-20"
  classTime: string      // Time range like "5 pm to 7 pm"
  moduleNumber: number
  groupName: string
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (!apiKey || !calendarKey) {
    return { success: false, error: 'Teamup not configured' }
  }

  const subcalendarId = await getFayyazSubcalendarId()
  if (!subcalendarId) {
    return { success: false, error: 'Could not find Fayyaz subcalendar' }
  }

  // Parse time range
  const times = parseTimeRange(classTime)
  let startTime: string
  let endTime: string

  if (times) {
    startTime = times.start
    endTime = times.end
  } else {
    // Fallback: 5pm to 7pm
    startTime = '17:00'
    endTime = '19:00'
  }

  const title = `Module ${moduleNumber} - ${groupName}`

  try {
    const res = await fetch(`${BASE_URL}/${calendarKey}/events`, {
      method: 'POST',
      headers: {
        'Teamup-Token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        start_dt: `${classDate}T${startTime}:00`,
        end_dt: `${classDate}T${endTime}:00`,
        subcalendar_ids: [subcalendarId],
        notes: `Theory class\nModule: ${moduleNumber}\nGroup: ${groupName}`,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Teamup event creation failed:', text)
      return { success: false, error: `Teamup API error: ${res.status}` }
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to create theory event:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
