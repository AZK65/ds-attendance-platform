import { prisma } from '@/lib/db'
import {
  calendarDate,
  carClassGapApplies,
  carClassGapViolation,
  carSessionNumber,
  eventBelongsToStudent,
  mergeScheduledCarClasses,
  phoneSuffix,
  studentNameFromTitle,
  stripTeamupText,
  type CalendarClass,
  type CarClassGapViolation,
} from '@/lib/car-class-gap'

const TEAMUP_BASE = 'https://api.teamup.com'
const LOOKBACK_DAYS = 730
const LOOKAHEAD_DAYS = 365

export const CAR_CLASS_GAP_UNVERIFIED =
  'Could not verify the 7-day gap between car classes. Try again.'

export class CarClassGapLookupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CarClassGapLookupError'
  }
}

export interface EnforceCarClassGapArgs {
  title?: string | null
  notes?: string | null
  module?: string | null
  startDate: string
  sortieNumber?: number | string | null
  phone?: string | null
  studentName?: string | null
  excludeEventId?: string
  previousStartDate?: string | null
  previousTitle?: string | null
  previousNotes?: string | null
}

export type CarClassGapDecision =
  | { ok: true }
  | { ok: false; status: 409 | 503; error: string; earliestDate: string | null }

function phoneFromNotes(notes?: string | null): string | null {
  const match = stripTeamupText(notes).match(/(?:^|\n)\s*Phone:\s*([^\n]+)/i)
  return match?.[1]?.trim() || null
}

function nameFromNotes(notes?: string | null): string | null {
  const match = stripTeamupText(notes).match(/(?:^|\n)\s*Student:\s*(.+?)(?:\n|$)/i)
  const name = match?.[1]?.trim()
  return name || null
}

const sortieSelect = {
  sortie1Date: true,
  sortie2Date: true,
  sortie3Date: true,
  sortie4Date: true,
  sortie5Date: true,
  sortie6Date: true,
  sortie7Date: true,
  sortie8Date: true,
  sortie9Date: true,
  sortie10Date: true,
  sortie11Date: true,
  sortie12Date: true,
  sortie13Date: true,
  sortie14Date: true,
  sortie15Date: true,
} as const

function sortieDatesOf(student: { [K in keyof typeof sortieSelect]: string | null }): Array<string | null> {
  return [
    student.sortie1Date, student.sortie2Date, student.sortie3Date,
    student.sortie4Date, student.sortie5Date, student.sortie6Date,
    student.sortie7Date, student.sortie8Date, student.sortie9Date,
    student.sortie10Date, student.sortie11Date, student.sortie12Date,
    student.sortie13Date, student.sortie14Date, student.sortie15Date,
  ]
}

async function lookupSortieDates(args: {
  phone?: string | null
  name?: string | null
}): Promise<Array<Array<string | null | undefined>>> {
  const suffix = phoneSuffix(args.phone)
  if (suffix.length >= 10) {
    const students = await prisma.student.findMany({
      where: {
        OR: [
          { phone: { contains: suffix } },
          { phoneAlt: { contains: suffix } },
        ],
      },
      select: sortieSelect,
    })
    return students.map(student => sortieDatesOf(student))
  }

  const name = (args.name || '').trim()
  if (name.length < 3) return []
  const wanted = name.toLowerCase()
  const students = await prisma.student.findMany({
    where: { name: { contains: name } },
    select: { ...sortieSelect, name: true },
  })
  return students
    .filter(student => student.name.trim().toLowerCase() === wanted)
    .map(student => sortieDatesOf(student))
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function fetchTeamupEventsForStudent(args: {
  phone?: string | null
  name?: string | null
}): Promise<CalendarClass[]> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (!apiKey || !calendarKey) {
    throw new CarClassGapLookupError('Teamup is not configured')
  }

  const today = new Date()
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - LOOKBACK_DAYS)
  const end = new Date(today)
  end.setUTCDate(end.getUTCDate() + LOOKAHEAD_DAYS)

  const queries: string[] = []
  const suffix = phoneSuffix(args.phone)
  if (suffix.length >= 7) {
    queries.push(suffix)
    if (suffix.length >= 10) queries.push(suffix.slice(-7))
  }
  const name = (args.name || '').trim()
  if (name) queries.push(name)
  if (queries.length === 0) return []

  const seen = new Set<string>()
  const found: CalendarClass[] = []
  let anyOk = false
  for (const query of queries) {
    const url = `${TEAMUP_BASE}/${calendarKey}/events?startDate=${formatDay(start)}&endDate=${formatDay(end)}&query=${encodeURIComponent(query)}`
    let response: Response
    try {
      response = await fetch(url, { headers: { 'Teamup-Token': apiKey } })
    } catch (error) {
      console.warn('[car-class-gap] Teamup search failed:', error)
      continue
    }
    if (!response.ok) continue
    anyOk = true
    const data = await response.json().catch(() => null) as { events?: Array<Record<string, unknown>> } | null
    for (const event of data?.events || []) {
      const id = event?.id != null ? String(event.id) : ''
      if (!id || seen.has(id)) continue
      const item: CalendarClass = {
        id,
        title: typeof event.title === 'string' ? event.title : '',
        notes: typeof event.notes === 'string' ? event.notes : '',
        startDate: typeof event.start_dt === 'string' ? event.start_dt : '',
      }
      if (!eventBelongsToStudent(item, { phone: args.phone, name: args.name })) continue
      seen.add(id)
      found.push(item)
    }
  }

  if (!anyOk) throw new CarClassGapLookupError('Teamup lookup failed')
  return found
}

export async function loadStudentCarClasses(args: {
  phone?: string | null
  name?: string | null
}): Promise<CalendarClass[]> {
  const events = await fetchTeamupEventsForStudent(args)
  let sortieSeries: Array<Array<string | null | undefined>> = []
  try {
    sortieSeries = await lookupSortieDates(args)
  } catch (error) {
    console.warn('[car-class-gap] student record lookup failed:', error)
  }
  return sortieSeries.reduce(
    (classes, dates) => mergeScheduledCarClasses(classes, dates),
    events,
  )
}

function dedupeClasses(lists: CalendarClass[][]): CalendarClass[] {
  const seen = new Set<string>()
  const out: CalendarClass[] = []
  for (const list of lists) {
    for (const item of list) {
      const key = item.id || `${item.startDate}|${item.title || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return out
}

function violationToDecision(violation: CarClassGapViolation | null): CarClassGapDecision {
  if (!violation) return { ok: true }
  return { ok: false, status: 409, error: violation.message, earliestDate: violation.earliestDate }
}

/**
 * Reject a create or reschedule that would put an in-car session 1–3
 * within 7 days of another car class. Does not update existing events.
 */
export async function enforceCarClassGap(args: EnforceCarClassGapArgs): Promise<CarClassGapDecision> {
  const previousSessionNumber = carSessionNumber({
    title: args.previousTitle,
    notes: args.previousNotes,
  })
  let sessionNumber = carSessionNumber({
    module: args.module,
    title: args.title,
    notes: args.notes,
    sortieNumber: args.sortieNumber,
  })
  const previousDay = calendarDate(args.previousStartDate)
  const proposedDay = calendarDate(args.startDate)
  if (sessionNumber == null && previousDay && proposedDay && previousDay !== proposedDay) {
    sessionNumber = previousSessionNumber
  }

  const violationArgs = {
    sessionNumber,
    proposedDate: args.startDate,
    previousDate: args.previousStartDate,
    previousSessionNumber,
  }
  // Session 4+, theory, and same-day edits never consult the calendar and
  // never rewrite an existing booking.
  if (!carClassGapApplies(violationArgs)) return { ok: true }

  const phone = args.phone || phoneFromNotes(args.notes)
  const name = args.studentName || nameFromNotes(args.notes) || studentNameFromTitle(args.title)
  const previousPhone = phoneFromNotes(args.previousNotes)
  const previousName = nameFromNotes(args.previousNotes) || studentNameFromTitle(args.previousTitle)
  if (!phone && !name && !previousPhone && !previousName) return { ok: true }

  try {
    const lists = [await loadStudentCarClasses({ phone, name })]
    const phoneChanged = phoneSuffix(previousPhone) && phoneSuffix(previousPhone) !== phoneSuffix(phone)
    const nameChanged = !phone && !previousPhone && previousName && previousName !== name
    if (phoneChanged || nameChanged) {
      lists.push(await loadStudentCarClasses({ phone: previousPhone, name: previousName }))
    }
    const classes = dedupeClasses(lists)
    return violationToDecision(carClassGapViolation({
      ...violationArgs,
      classes,
      excludeEventId: args.excludeEventId,
    }))
  } catch (error) {
    console.error('[car-class-gap] lookup failed:', error)
    return { ok: false, status: 503, error: CAR_CLASS_GAP_UNVERIFIED, earliestDate: null }
  }
}
