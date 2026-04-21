import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const BASE_URL = 'https://api.teamup.com'

// Business hours: 11 AM – 7 PM, closed Fridays
const OPEN_HOUR = 11
const CLOSE_HOUR = 19 // exclusive — last slot starts at 18:00
const SLOT_MINUTES = 60
const LOOKBACK_DAYS = 365 // how far back to search for previous teacher / classes
const LOOKAHEAD_DAYS = 60 // availability window

// Curriculum rules. Theory modules 1–5 must be done before any in-car session
// (Phase 1 prerequisite). Each theory module 6–12 gates a small group of
// in-car sessions, and road classes within the same group must be booked at
// least a week apart.
const SORTIE_GROUPS: Record<number, number[]> = {
  6: [1, 2],
  7: [3, 4],
  8: [5, 6],
  9: [7, 8],
  10: [9, 10],
  11: [11, 12, 13],
  12: [14],
  // Sortie 15 (Summary) is standalone
}
const PHASE1_WAIT_WEEKS = 6
const SAME_GROUP_MIN_DAYS = 7

function groupForSortie(n: number): number[] | null {
  for (const sorties of Object.values(SORTIE_GROUPS)) {
    if (sorties.includes(n)) return sorties
  }
  return null
}

type TeamupEvent = {
  id: string
  title?: string
  notes?: string
  start_dt: string
  end_dt: string
  subcalendar_id?: number
  subcalendar_ids?: number[]
}

type Subcalendar = { id: number; name: string; color?: number; active?: boolean }

const formatDate = (d: Date) => d.toISOString().split('T')[0]

async function teamupFetch(path: string): Promise<Response> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  return fetch(`${BASE_URL}/${calendarKey}${path}`, {
    headers: { 'Teamup-Token': apiKey },
  })
}

// Returns true if the event clearly belongs to this specific student.
// We DO NOT require a "sortie/road" keyword — real titles vary a lot
// ("6 Abbas", "Muhammad M.", etc.). Instead we trust a strong identity match
// (phone digits or full name) and rely on "past + single subcalendar" as the
// signal for a road class with a specific teacher.
function isStudentEvent(ev: TeamupEvent, phoneDigits: string, nameLower: string) {
  const title = (ev.title || '').toLowerCase()
  const notes = (ev.notes || '').toLowerCase()

  if (phoneDigits) {
    const titleDigits = title.replace(/\D/g, '')
    const notesDigits = notes.replace(/\D/g, '')
    if (titleDigits.includes(phoneDigits) || notesDigits.includes(phoneDigits)) return true
  }

  if (nameLower) {
    // Full substring match is strongest
    if (title.includes(nameLower) || notes.includes(nameLower)) return true
    // Fallback: every word the caller typed must appear somewhere in title+notes
    const parts = nameLower.split(/\s+/).filter(Boolean)
    if (parts.length >= 2 && parts.every((p) => title.includes(p) || notes.includes(p))) {
      return true
    }
  }

  return false
}

// A "teacher event" is a 1:1 road class — exactly one subcalendar attached.
// Multi-subcalendar events tend to be group/theory classes we want to ignore
// when picking the previous road-class teacher.
function teacherSubcalendarId(ev: TeamupEvent): number | null {
  if (ev.subcalendar_id) return ev.subcalendar_id
  if (ev.subcalendar_ids && ev.subcalendar_ids.length === 1) return ev.subcalendar_ids[0]
  return null
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.TEAMUP_API_KEY || ''
    const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
    if (!apiKey || !calendarKey) {
      return NextResponse.json(
        { error: 'Teamup is not configured.' },
        { status: 503 }
      )
    }

    const { studentId, studentName, phone, sortieNumber } = await request.json()
    if (!studentName && !phone) {
      return NextResponse.json({ error: 'studentName or phone is required' }, { status: 400 })
    }

    const phoneDigits = typeof phone === 'string' ? phone.replace(/\D/g, '').slice(-10) : ''
    const nameLower = typeof studentName === 'string' ? studentName.trim().toLowerCase() : ''

    // 1) Find the student's past road-class events to determine previous teacher
    const today = new Date()
    const rangeStart = new Date(today)
    rangeStart.setDate(rangeStart.getDate() - LOOKBACK_DAYS)
    const rangeEnd = new Date(today)
    rangeEnd.setDate(rangeEnd.getDate() + LOOKAHEAD_DAYS)

    // Teamup's query param does a substring search across titles/notes, but the
    // note format might store the phone with or without country code, dashes,
    // or formatting. Search with several variants to maximise hits.
    const queries: string[] = []
    if (phoneDigits) {
      const p = phoneDigits
      queries.push(p)                                                // 5145534892
      queries.push(p.slice(-7))                                      // 5534892
      queries.push(`(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`) // (514) 553-4892
      queries.push(`${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`)   // 514-553-4892
    }
    if (nameLower) queries.push(nameLower)

    const seen = new Set<string>()
    const allEvents: TeamupEvent[] = []
    for (const q of queries) {
      const url = `/events?startDate=${formatDate(rangeStart)}&endDate=${formatDate(rangeEnd)}&query=${encodeURIComponent(q)}`
      const res = await teamupFetch(url)
      if (!res.ok) continue
      const data = (await res.json()) as { events?: TeamupEvent[] }
      for (const ev of data.events || []) {
        if (!seen.has(ev.id)) {
          seen.add(ev.id)
          allEvents.push(ev)
        }
      }
    }

    const studentEvents = allEvents
      .filter((ev) => isStudentEvent(ev, phoneDigits, nameLower))
      .filter((ev) => new Date(ev.start_dt) < today)
      .sort((a, b) => new Date(b.start_dt).getTime() - new Date(a.start_dt).getTime())

    // Prefer the most recent past event with exactly one subcalendar (a road
    // class with a specific teacher). Fall back to the most recent any-type
    // event if no 1:1 event exists.
    const previous =
      studentEvents.find((ev) => teacherSubcalendarId(ev) !== null) ?? studentEvents[0]
    const previousTeacherId = previous ? teacherSubcalendarId(previous) : null

    if (!previousTeacherId) {
      return NextResponse.json({
        teacher: null,
        slots: [],
        reason: 'no-previous-teacher',
        message:
          "We couldn't find a previous road class on record for this student. Please contact the school so we can assign a teacher.",
      })
    }

    // 2) Load subcalendar metadata to get the teacher's name
    let teacherName = 'your teacher'
    try {
      const subRes = await teamupFetch('/subcalendars')
      if (subRes.ok) {
        const subData = (await subRes.json()) as { subcalendars?: Subcalendar[] }
        const sc = subData.subcalendars?.find((s) => s.id === previousTeacherId)
        if (sc?.name) teacherName = sc.name
      }
    } catch {
      /* non-fatal */
    }

    // 3) Fetch teacher's booked events in the look-ahead window
    const availStart = new Date()
    availStart.setHours(0, 0, 0, 0)
    const availEnd = new Date(availStart)
    availEnd.setDate(availEnd.getDate() + LOOKAHEAD_DAYS)

    const teacherEventsRes = await teamupFetch(
      `/events?startDate=${formatDate(availStart)}&endDate=${formatDate(availEnd)}&subcalendarId[]=${previousTeacherId}`
    )
    const teacherEventsData = teacherEventsRes.ok
      ? ((await teacherEventsRes.json()) as { events?: TeamupEvent[] })
      : { events: [] }
    const booked = (teacherEventsData.events || []).map((ev) => ({
      start: new Date(ev.start_dt).getTime(),
      end: new Date(ev.end_dt).getTime(),
    }))

    // 4) Apply curriculum pacing rules to determine the earliest allowed time.
    //    • After Phase 1 (theory 5) the student must wait 6 weeks before
    //      In-Car Session 1 can be booked.
    //    • Two in-car sessions from the same theory group must be at least
    //      a week apart.
    let earliestAllowed = new Date(Date.now() + 3 * 60 * 60 * 1000) // default: 3h lead
    let earliestReason: 'phase1-wait' | 'same-week' | null = null

    if (sortieNumber && studentId) {
      try {
        const dbStudent = await prisma.student.findUnique({
          where: { id: studentId as string },
          select: {
            module5Date: true,
            sortie1Date: true, sortie2Date: true, sortie3Date: true,
            sortie4Date: true, sortie5Date: true, sortie6Date: true,
            sortie7Date: true, sortie8Date: true, sortie9Date: true,
            sortie10Date: true, sortie11Date: true, sortie12Date: true,
            sortie13Date: true, sortie14Date: true, sortie15Date: true,
          },
        })

        // Same-theory-group rule: must be at least SAME_GROUP_MIN_DAYS days
        // after the most recent road class in the same group.
        const group = groupForSortie(Number(sortieNumber))
        if (group) {
          const siblingDates: Date[] = []
          const allPastStudentEvents = allEvents.filter((ev) =>
            isStudentEvent(ev, phoneDigits, nameLower)
          )
          for (const ev of allPastStudentEvents) {
            const nums = (ev.title || '').match(/session\s*#?\s*(\d{1,2})/i)
            const n = nums ? parseInt(nums[1], 10) : NaN
            if (Number.isFinite(n) && group.includes(n) && n !== Number(sortieNumber)) {
              siblingDates.push(new Date(ev.start_dt))
            }
          }
          // Also consider Student-DB sortie dates (legacy data)
          const dbSortieDates: Array<string | null | undefined> = [
            dbStudent?.sortie1Date, dbStudent?.sortie2Date, dbStudent?.sortie3Date,
            dbStudent?.sortie4Date, dbStudent?.sortie5Date, dbStudent?.sortie6Date,
            dbStudent?.sortie7Date, dbStudent?.sortie8Date, dbStudent?.sortie9Date,
            dbStudent?.sortie10Date, dbStudent?.sortie11Date, dbStudent?.sortie12Date,
            dbStudent?.sortie13Date, dbStudent?.sortie14Date, dbStudent?.sortie15Date,
          ]
          for (const n of group) {
            if (n === Number(sortieNumber)) continue
            const d = dbSortieDates[n - 1]
            if (d && d.trim()) {
              const parsed = new Date(d)
              if (!isNaN(parsed.getTime())) siblingDates.push(parsed)
            }
          }

          if (siblingDates.length > 0) {
            const mostRecent = new Date(Math.max(...siblingDates.map((d) => d.getTime())))
            const gated = new Date(mostRecent.getTime() + SAME_GROUP_MIN_DAYS * 86_400_000)
            if (gated > earliestAllowed) {
              earliestAllowed = gated
              earliestReason = 'same-week'
            }
          }
        }

        // Phase 1 wait: In-Car 1 can't be booked until 6 weeks after theory 5.
        if (Number(sortieNumber) === 1 && dbStudent?.module5Date) {
          const m5 = new Date(dbStudent.module5Date)
          if (!isNaN(m5.getTime())) {
            const gated = new Date(m5.getTime() + PHASE1_WAIT_WEEKS * 7 * 86_400_000)
            if (gated > earliestAllowed) {
              earliestAllowed = gated
              earliestReason = 'phase1-wait'
            }
          }
        }
      } catch (e) {
        console.warn('[Book Availability] Rule lookup failed:', e)
      }
    }

    // 5) Generate candidate hourly slots during business hours, skip Fridays,
    //    skip any slot that overlaps a booked event, skip past times, and skip
    //    slots starting earlier than earliestAllowed.
    const minLead = earliestAllowed
    const slots: { start: string; end: string }[] = []

    for (let day = new Date(availStart); day < availEnd; day.setDate(day.getDate() + 1)) {
      const dow = day.getDay() // 0=Sun…6=Sat
      if (dow === 5) continue // Friday closed

      for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour += SLOT_MINUTES / 60) {
        const slotStart = new Date(day)
        slotStart.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0)
        const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000)

        if (slotStart < minLead) continue

        const overlaps = booked.some(
          (b) => slotStart.getTime() < b.end && slotEnd.getTime() > b.start
        )
        if (overlaps) continue

        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        })
      }
    }

    return NextResponse.json({
      teacher: { id: previousTeacherId, name: teacherName },
      previousClass: previous
        ? {
            id: previous.id,
            title: previous.title,
            start: previous.start_dt,
          }
        : null,
      slots: slots.slice(0, 200), // cap the payload
      earliestAllowed: earliestAllowed.toISOString(),
      earliestReason,
    })
  } catch (error) {
    console.error('[Book Availability] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load availability', details: error instanceof Error ? error.message : 'unknown' },
      { status: 500 }
    )
  }
}
