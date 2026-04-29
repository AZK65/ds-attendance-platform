import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// The Student model stores up to 15 road classes (sortie1Date..sortie15Date).
// A sortie is "completed" if the field contains a non-empty string. Remaining
// sorties are ones that are null/empty. We also cross-reference Teamup events
// and take the union — Teamup is typically the source of truth once a class
// actually happened, even if the Student row hasn't been updated.
const TOTAL_SORTIES = 15
const TEAMUP_BASE = 'https://api.teamup.com'
const TEAMUP_LOOKBACK_DAYS = 365

function isCompleted(date: string | null | undefined): boolean {
  return !!date && date.trim().length > 0
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

// Extract session/road-class numbers from a Teamup event's title + notes.
// Title conventions vary. We look for things like:
//   "Class Session 14 (In-Car)"   → 14
//   "Sortie 9"                    → 9
//   "S6 Abbas" / "6 Abbas"        → 6
//   "Road 12"                     → 12
function extractSessionNumbers(ev: TeamupEvent): number[] {
  const text = `${ev.title || ''} ${ev.notes || ''}`.toLowerCase()
  const nums = new Set<number>()
  // Only explicit keywords — being permissive here caused false positives
  // (times, dates, and phone fragments were getting picked up).
  const patterns = [
    /(?:class\s*)?session\s*#?\s*(\d{1,2})/g, // "Session 14", "Class Session 14"
    /sortie\s*#?\s*(\d{1,2})/g,
    /\bpratique\s*#?\s*(\d{1,2})/g,
    /\broad\s+class\s*#?\s*(\d{1,2})/g,
  ]
  for (const p of patterns) {
    let m: RegExpExecArray | null
    while ((m = p.exec(text)) !== null) {
      const n = parseInt(m[1], 10)
      if (n >= 1 && n <= TOTAL_SORTIES) nums.add(n)
    }
  }
  return Array.from(nums)
}

async function teamupPastClasses(
  nameLower: string,
  phoneDigits: string,
  debugOut?: { events: Array<{ title?: string; start: string; nums: number[] }> }
): Promise<{
  done: number[]
  upcoming: number[]
  doneDates: Record<number, string>
  upcomingDates: Record<number, string>
}> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (!apiKey || !calendarKey) return { done: [], upcoming: [], doneDates: {}, upcomingDates: {} }

  const today = new Date()
  const rangeStart = new Date(today)
  rangeStart.setDate(rangeStart.getDate() - TEAMUP_LOOKBACK_DAYS)
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  const queries: string[] = []
  if (phoneDigits) {
    const p = phoneDigits
    queries.push(p, p.slice(-7))
    queries.push(`(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`)
    queries.push(`${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`)
  }
  if (nameLower) queries.push(nameLower)

  const seen = new Set<string>()
  const all: TeamupEvent[] = []
  for (const q of queries) {
    try {
      const url = `${TEAMUP_BASE}/${calendarKey}/events?startDate=${formatDate(rangeStart)}&endDate=${formatDate(today)}&query=${encodeURIComponent(q)}`
      const res = await fetch(url, { headers: { 'Teamup-Token': apiKey } })
      if (!res.ok) continue
      const data = (await res.json()) as { events?: TeamupEvent[] }
      for (const ev of data.events || []) {
        if (!seen.has(ev.id)) {
          seen.add(ev.id)
          all.push(ev)
        }
      }
    } catch {
      // best-effort — ignore network errors
    }
  }

  // Confirm each match is actually this student (prevent false positives from
  // unrelated events that happened to include the query string).
  const mine = all.filter((ev) => {
    const title = (ev.title || '').toLowerCase()
    const notes = (ev.notes || '').toLowerCase()
    if (phoneDigits) {
      const d = `${title} ${notes}`.replace(/\D/g, '')
      if (d.includes(phoneDigits)) return true
    }
    if (nameLower) {
      if (title.includes(nameLower) || notes.includes(nameLower)) return true
      const parts = nameLower.split(/\s+/).filter(Boolean)
      if (parts.length >= 2 && parts.every((p) => title.includes(p) || notes.includes(p))) {
        return true
      }
    }
    return false
  })

  const done = new Set<number>()
  const upcoming = new Set<number>()
  // Track the earliest event per session number (in case of duplicates)
  const doneDates: Record<number, string> = {}
  const upcomingDates: Record<number, string> = {}
  for (const ev of mine) {
    const nums = extractSessionNumbers(ev)
    const end = new Date(ev.end_dt || ev.start_dt)
    const startIso = ev.start_dt
    if (end < today) {
      for (const n of nums) {
        done.add(n)
        if (!doneDates[n] || new Date(startIso) < new Date(doneDates[n])) {
          doneDates[n] = startIso
        }
      }
    } else {
      for (const n of nums) {
        upcoming.add(n)
        if (!upcomingDates[n] || new Date(startIso) < new Date(upcomingDates[n])) {
          upcomingDates[n] = startIso
        }
      }
    }
    if (debugOut) debugOut.events.push({ title: ev.title, start: ev.start_dt, nums })
  }
  return {
    done: Array.from(done).sort((a, b) => a - b),
    upcoming: Array.from(upcoming).sort((a, b) => a - b),
    doneDates,
    upcomingDates,
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, phone, debug } = await request.json()

    const trimmedName = typeof name === 'string' ? name.trim() : ''
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : ''

    if (trimmedName.length < 2 || trimmedPhone.replace(/\D/g, '').length < 10) {
      return NextResponse.json(
        { error: 'Please enter your full name and a valid phone number.' },
        { status: 400 }
      )
    }

    const phoneDigits = trimmedPhone.replace(/\D/g, '')
    const lastTen = phoneDigits.slice(-10)
    const lastSeven = phoneDigits.slice(-7)

    const studentFields = {
      id: true,
      name: true,
      phone: true,
      phoneAlt: true,
      module1Date: true, module2Date: true, module3Date: true,
      module4Date: true, module5Date: true, module6Date: true,
      module7Date: true, module8Date: true, module9Date: true,
      module10Date: true, module11Date: true, module12Date: true,
      sortie1Date: true, sortie2Date: true, sortie3Date: true,
      sortie4Date: true, sortie5Date: true, sortie6Date: true,
      sortie7Date: true, sortie8Date: true, sortie9Date: true,
      sortie10Date: true, sortie11Date: true, sortie12Date: true,
      sortie13Date: true, sortie14Date: true, sortie15Date: true,
    } as const

    // First pass: try the simple indexed prisma `contains` query against both
    // phone fields. This catches rows stored with digits only (no formatting).
    let candidates = await prisma.student.findMany({
      where: {
        OR: [
          { phone: { contains: lastTen } },
          { phoneAlt: { contains: lastTen } },
          { phone: { contains: lastSeven } },
          { phoneAlt: { contains: lastSeven } },
        ],
      },
      select: studentFields,
      take: 50,
    })

    // Second pass: if nothing matched (likely because the DB phone contains
    // formatting like "(514) 553-4892"), fetch a wider set and compare
    // digit-for-digit in JS. Limit to recent records so we don't scan all.
    if (candidates.length === 0) {
      const recent = await prisma.student.findMany({
        select: studentFields,
        orderBy: { updatedAt: 'desc' },
        take: 500,
      })
      candidates = recent.filter((r) => {
        const aDigits = (r.phone || '').replace(/\D/g, '')
        const bDigits = (r.phoneAlt || '').replace(/\D/g, '')
        return aDigits.endsWith(lastTen) || bDigits.endsWith(lastTen)
      })
    }

    // Normalize a name for matching:
    //  - strip any "#1234" student-number suffix used in our DB
    //  - remove accents (diacritics)
    //  - collapse whitespace, lowercase
    const normalize = (s: string) =>
      s
        .replace(/#\s*\d+/g, '') // strip "#1111" style suffixes
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // drop combining accents
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()

    const needle = normalize(trimmedName)
    const needleParts = needle.split(' ').filter(Boolean)

    const nameMatch = candidates.find((c) => {
      const hay = normalize(c.name)
      if (hay.includes(needle)) return true
      // Every word the user typed must appear somewhere in the DB name
      return needleParts.every((part) => hay.includes(part))
    })

    if (!nameMatch) {
      return NextResponse.json(
        { matched: false, message: "We couldn't find a student matching that name and phone number. Please double-check, or contact the school." },
        { status: 404 }
      )
    }

    const sortieDates: Array<string | null> = [
      nameMatch.sortie1Date, nameMatch.sortie2Date, nameMatch.sortie3Date,
      nameMatch.sortie4Date, nameMatch.sortie5Date, nameMatch.sortie6Date,
      nameMatch.sortie7Date, nameMatch.sortie8Date, nameMatch.sortie9Date,
      nameMatch.sortie10Date, nameMatch.sortie11Date, nameMatch.sortie12Date,
      nameMatch.sortie13Date, nameMatch.sortie14Date, nameMatch.sortie15Date,
    ]

    const moduleDates: Array<string | null> = [
      nameMatch.module1Date, nameMatch.module2Date, nameMatch.module3Date,
      nameMatch.module4Date, nameMatch.module5Date, nameMatch.module6Date,
      nameMatch.module7Date, nameMatch.module8Date, nameMatch.module9Date,
      nameMatch.module10Date, nameMatch.module11Date, nameMatch.module12Date,
    ]
    const theorySet = new Set<number>()
    for (let i = 0; i < 12; i++) {
      if (isCompleted(moduleDates[i])) theorySet.add(i + 1)
    }

    const completedFromDb = new Set<number>()
    for (let i = 0; i < TOTAL_SORTIES; i++) {
      if (isCompleted(sortieDates[i])) completedFromDb.add(i + 1)
    }

    // Also pull completed sessions from Teamup — for many students the Student
    // row's sortieNDate fields aren't kept current, but the calendar is.
    const debugOut = debug ? { events: [] as Array<{ title?: string; start: string; nums: number[] }> } : undefined
    const teamup = await teamupPastClasses(
      nameMatch.name.toLowerCase(),
      phoneDigits.slice(-10),
      debugOut
    )
    for (const n of teamup.done) completedFromDb.add(n)

    // If the HIGHEST completed session is N, every lower session is implicitly
    // done too (you can't be on session 14 without having done 1–13).
    if (completedFromDb.size > 0) {
      const highest = Math.max(...completedFromDb)
      for (let i = 1; i <= highest; i++) completedFromDb.add(i)

      // The curriculum (see training device diagram) links each theory module
      // to the sessions that follow it. If a student has reached session N,
      // they must have completed the theory that gated it.
      // Theory 1–5 are prerequisite for the learner's licence (required before
      // any in-car session). Theory 6+ gates: 6→S1, 7→S3, 8→S5, 9→S7, 10→S9,
      // 11→S11, 12→S14.
      for (let m = 1; m <= 5; m++) theorySet.add(m)
      const theoryGate: Record<number, number> = { 6: 1, 7: 3, 8: 5, 9: 7, 10: 9, 11: 11, 12: 14 }
      for (const [mod, gate] of Object.entries(theoryGate)) {
        if (highest >= gate) theorySet.add(Number(mod))
      }
    }

    const theoryCompleted = Array.from(theorySet).sort((a, b) => a - b)

    const upcoming = new Set(teamup.upcoming)

    const completed: number[] = []
    const scheduled: number[] = []
    const remaining: number[] = []
    for (let i = 1; i <= TOTAL_SORTIES; i++) {
      if (completedFromDb.has(i)) completed.push(i)
      else if (upcoming.has(i)) scheduled.push(i)
      else remaining.push(i)
    }

    // Strip the "#1234" suffix from the name shown back to the student
    const displayName = nameMatch.name.replace(/\s*#\s*\d+\s*$/i, '').trim()

    return NextResponse.json({
      matched: true,
      student: {
        id: nameMatch.id,
        name: displayName,
      },
      completed,
      scheduled,
      remaining,
      theoryCompleted,
      // Dates: prefer Teamup's timestamps; fall back to the Student DB sortieN/moduleN strings
      sortieDates: (() => {
        const out: Record<number, string> = {}
        for (let i = 1; i <= TOTAL_SORTIES; i++) {
          if (teamup.doneDates[i]) out[i] = teamup.doneDates[i]
          else if (isCompleted(sortieDates[i - 1])) out[i] = sortieDates[i - 1] as string
        }
        return out
      })(),
      sortieUpcomingDates: teamup.upcomingDates,
      moduleDates: (() => {
        const out: Record<number, string> = {}
        for (let i = 1; i <= 12; i++) {
          if (isCompleted(moduleDates[i - 1])) out[i] = moduleDates[i - 1] as string
        }
        return out
      })(),
      total: TOTAL_SORTIES,
      sources: {
        fromDb: Array.from(new Set(
          [...Array(TOTAL_SORTIES).keys()]
            .map(i => i + 1)
            .filter(n => isCompleted(sortieDates[n - 1]))
        )),
        fromTeamupDone: teamup.done,
        fromTeamupUpcoming: teamup.upcoming,
      },
      ...(debug ? { debug: debugOut } : {}),
    })
  } catch (error) {
    console.error('[Book Lookup] Error:', error)
    return NextResponse.json(
      { error: 'Lookup failed. Please try again.' },
      { status: 500 }
    )
  }
}
