/**
 * Seven-day gap for the first three in-car sessions.
 *
 * Qazi staff call the early practical lessons "modules 1–3". In this
 * codebase those are in-car sessions / sorties 1, 2 and 3 (scheduling
 * values S1–S3, titles "Session N" or "Sortie N"). They are not theory
 * modules M1–M12. In-car sessions 4–15 are the classes "from module 4
 * onward" and are not subject to this gap. Theory and truck classes are
 * not car classes, and neither are events marked cancelled.
 *
 * Already-booked classes that sit closer than 7 days are left alone.
 * The check runs only when a session 1–3 car class is created, moved to
 * a different calendar day, or relabeled into sessions 1–3. A same-day
 * edit (time, notes, teacher, phone) does not rewrite that class or any
 * other class.
 */

export const CAR_CLASS_GAP_DAYS = 7

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export interface CalendarClass {
  id?: string
  title?: string
  notes?: string
  startDate: string
  cancelled?: boolean
}

export interface CarClassGapViolation {
  message: string
  /** YYYY-MM-DD when the block is "too soon after" a car class. */
  earliestDate: string | null
}

export function formatGapDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  const name = MONTHS[(month || 1) - 1] || ''
  return `${name} ${day}, ${year}`
}

/** Canonical scheduling copy when the picked day is too soon after a car class. */
export function earlyCarClassGapMessage(earliestDate: string): string {
  return `Modules 1–3 need at least 7 days between car classes. The earliest date for this student is ${formatGapDate(earliestDate)}.`
}

export function earlyCarClassGapBeforeMessage(nextDate: string): string {
  return `Modules 1–3 need at least 7 days between car classes. This date is fewer than 7 days before the car class on ${formatGapDate(nextDate)}.`
}

export function stripTeamupText(value: string | null | undefined): string {
  return (value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
}

export function calendarDate(value: string | null | undefined): string | null {
  if (!value) return null
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function calendarDaysBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth, fromDay] = fromDate.split('-').map(Number)
  const [toYear, toMonth, toDay] = toDate.split('-').map(Number)
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay)
  return Math.round((toUtc - fromUtc) / 86_400_000)
}

export function phoneSuffix(value: string | null | undefined): string {
  const digits = (value || '').replace(/\D/g, '')
  if (digits.length < 7) return ''
  return digits.length >= 10 ? digits.slice(-10) : digits
}

export function isEarlyCarSession(sessionNumber: number | null | undefined): boolean {
  return typeof sessionNumber === 'number' && sessionNumber >= 1 && sessionNumber <= 3
}

function boundedSession(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > 15) return null
  return value
}

/**
 * In-car session number for a booking. Theory module values ("3", "M3",
 * "Module 3") return null so theory scheduling is skipped.
 */
export function carSessionNumber(input: {
  module?: string | null
  title?: string | null
  notes?: string | null
  sortieNumber?: number | string | null
}): number | null {
  const rawSortie = input.sortieNumber
  const sortie = typeof rawSortie === 'string' && rawSortie.trim() ? Number(rawSortie) : rawSortie
  if (typeof sortie === 'number' && Number.isFinite(sortie)) {
    const bounded = boundedSession(sortie)
    if (bounded) return bounded
  }

  const moduleValue = (input.module || '').trim()
  if (moduleValue) {
    const sessionModule = moduleValue.match(/^S(\d{1,2})$/i) || moduleValue.match(/^Session\s+(\d{1,2})$/i)
    if (sessionModule) return boundedSession(Number(sessionModule[1]))
    if (/^(?:M|Module\s*)\d{1,2}$/i.test(moduleValue) || /^\d{1,2}$/.test(moduleValue)) return null
  }

  const text = stripTeamupText(`${input.title || ''}\n${input.notes || ''}`)
  const patterns = [
    /(?:class\s*)?session\s*#?\s*(\d{1,2})/i,
    /sortie\s*#?\s*(\d{1,2})/i,
    /\bpratique\s*#?\s*(\d{1,2})/i,
    /\broad\s+class\s*#?\s*(\d{1,2})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return boundedSession(Number(match[1]))
  }
  return null
}

export function isCancelledClass(title?: string | null, notes?: string | null): boolean {
  const text = stripTeamupText(`${title || ''}\n${notes || ''}`)
  return /\bcancell?ed\b/i.test(text) || /\bcancellation\b/i.test(text)
}

export function isTheoryClass(title?: string | null, notes?: string | null): boolean {
  const cleanTitle = (title || '').trim()
  const cleanNotes = stripTeamupText(notes)
  if (/(?:^|\n)\s*Theory class(?:\s|\n|$)/i.test(cleanNotes)) return true
  if (/^Module\s+\d+/i.test(cleanTitle)) return true
  if (/^M\d{1,2}\b/.test(cleanTitle)) return true
  if (/^Class 1 Theory/i.test(cleanTitle)) return true
  return false
}

export function isTruckClass(title?: string | null, notes?: string | null): boolean {
  const text = stripTeamupText(`${title || ''}\n${notes || ''}`)
  if (/TruckClass:\s*yes/i.test(text)) return true
  if (/^Truck Class\b/i.test((title || '').trim())) return true
  return false
}

/** A scheduled car / in-car class that counts toward the gap. */
export function isCountableCarClass(event: {
  title?: string | null
  notes?: string | null
  cancelled?: boolean
}): boolean {
  if (event.cancelled) return false
  if (isCancelledClass(event.title, event.notes)) return false
  if (isTruckClass(event.title, event.notes)) return false
  if (isTheoryClass(event.title, event.notes)) return false
  return true
}

export function carClassGapApplies(args: {
  sessionNumber: number | null
  proposedDate: string
  previousDate?: string | null
  previousSessionNumber?: number | null
}): boolean {
  if (!isEarlyCarSession(args.sessionNumber)) return false
  const proposed = calendarDate(args.proposedDate)
  if (!proposed) return false
  const previous = calendarDate(args.previousDate)
  if (previous && previous === proposed) {
    // Same calendar day as the class already on the books. Leave it in
    // place, even when it already violates the gap.
    if (args.previousSessionNumber == null) return false
    if (args.previousSessionNumber === args.sessionNumber) return false
  }
  return true
}

function studentNameFromNotes(notes?: string | null): string {
  const match = stripTeamupText(notes).match(/(?:^|\n)\s*Student:\s*(.+?)(?:\n|$)/i)
  return match?.[1]?.trim().toLowerCase() || ''
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function eventBelongsToStudent(
  event: { title?: string | null; notes?: string | null },
  student: { phone?: string | null; name?: string | null },
): boolean {
  const notes = stripTeamupText(event.notes)
  const title = event.title || ''
  const wantedPhone = phoneSuffix(student.phone)
  const phoneLine = notes.match(/(?:^|\n)\s*Phone:\s*([^\n]+)/i)
  const eventPhone = phoneSuffix(phoneLine?.[1] || '')

  if (eventPhone && wantedPhone) return eventPhone === wantedPhone
  if (eventPhone && !wantedPhone) return false

  const wantedName = normalizeName(student.name)
  if (!wantedName) return false
  const noteName = studentNameFromNotes(notes)
  if (noteName && (noteName === wantedName || noteName.includes(wantedName) || wantedName.includes(noteName))) {
    return true
  }
  return title.toLowerCase().includes(wantedName)
}

export function studentNameFromTitle(title?: string | null): string | null {
  if (!title) return null
  const parts = title.split(/\s[-–—]\s/).map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  if (!/^(?:session|sortie)\s+\d+$/i.test(parts[0]) && !/^S\d{1,2}$/i.test(parts[0])) return null
  const name = parts[1].replace(/⏳/g, '').replace(/pending/ig, '').trim()
  if (!name || /^\d+$/.test(name)) return null
  return name
}

/**
 * Student.sortieNDate rows fill in road classes that are not on the
 * calendar. A Teamup event for that session wins, including a cancelled
 * one, so a cancelled lesson does not come back through the student row.
 */
export function mergeScheduledCarClasses(
  events: CalendarClass[],
  sortieDates: Array<string | null | undefined> | null | undefined,
): CalendarClass[] {
  const seenSessions = new Set<number>()
  for (const event of events) {
    const session = carSessionNumber({ title: event.title, notes: event.notes })
    if (session) seenSessions.add(session)
  }
  const extra: CalendarClass[] = []
  ;(sortieDates || []).forEach((value, index) => {
    const session = index + 1
    if (session > 15 || seenSessions.has(session)) return
    const date = calendarDate(value)
    if (!date) return
    extra.push({
      id: `db-sortie-${session}`,
      title: `Sortie ${session}`,
      notes: '',
      startDate: date,
    })
  })
  return extra.length ? [...events, ...extra] : events
}

export function carClassGapViolation(args: {
  sessionNumber: number | null
  proposedDate: string
  classes: CalendarClass[]
  excludeEventId?: string
  previousDate?: string | null
  previousSessionNumber?: number | null
}): CarClassGapViolation | null {
  if (!carClassGapApplies(args)) return null
  const proposed = calendarDate(args.proposedDate)
  if (!proposed) return null

  let previousConflict: string | null = null
  let nextConflict: string | null = null

  for (const event of args.classes) {
    if (args.excludeEventId && event.id && event.id === args.excludeEventId) continue
    if (!isCountableCarClass(event)) continue
    const date = calendarDate(event.startDate)
    if (!date) continue
    const delta = calendarDaysBetween(date, proposed)
    if (delta >= 0 && delta < CAR_CLASS_GAP_DAYS) {
      if (!previousConflict || date > previousConflict) previousConflict = date
    } else if (delta < 0 && -delta < CAR_CLASS_GAP_DAYS) {
      if (!nextConflict || date < nextConflict) nextConflict = date
    }
  }

  if (!previousConflict && !nextConflict) return null

  if (previousConflict) {
    const earliestDate = addCalendarDays(previousConflict, CAR_CLASS_GAP_DAYS)
    let message = earlyCarClassGapMessage(earliestDate)
    if (nextConflict) {
      message += ` This date is also fewer than 7 days before the car class on ${formatGapDate(nextConflict)}.`
    }
    return { message, earliestDate }
  }

  return {
    message: earlyCarClassGapBeforeMessage(nextConflict as string),
    earliestDate: null,
  }
}
