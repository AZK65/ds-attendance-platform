/**
 * Class 1 theory net hours. One pure module so the generator, the import,
 * the bot, and the reports all subtract the same breaks.
 *
 * Wall times are America/Toronto local HH:mm. Dates are YYYY-MM-DD. This
 * file never converts them to instants, so the DST change on 2026-11-01
 * cannot shift a class onto the wrong calendar day.
 *
 * Net = (end − start) − break minutes. Approximate templates contribute
 * only their durations; exact templates clip each break to the class window
 * and merge overlaps. The result is never negative.
 */

export const CLASS1_THEORY_CODE = 'CLASS1_THEORY'
export const CLASS1_THEORY_REQUIRED_NET_MINUTES = 4500
export const CLASS1_THEORY_REQUIRED_SESSIONS = 15
export const CLASS1_PRACTICAL_MINUTES = 50 * 60
export const WEEKNIGHT_NET_MINUTES = 225
export const SATURDAY_NET_MINUTES = 450

export const AHMED_INSTRUCTOR = {
  legalName: 'Abdul Rahman Ahmed Qazi',
  /** Printed as-is on the Class 1 booklet. One full name, not family/first. */
  bookletName: 'Abdul Rahman Ahmed Qazi',
  displayName: 'Ahmed',
  /** Null until SAAQ issues a number. Never invent one. */
  saaqInstructorNo: null as string | null,
  teamupSubcalendarId: 15664319,
}

export type BreakKind = 'break' | 'lunch'

export interface TheoryBreak {
  minutes: number
  kind: BreakKind
  /** Exact local start. Ignored when `approximate` is true. */
  start?: string
  /** Exact local end. Ignored when `approximate` is true. */
  end?: string
  /** Display-only position for historical templates. */
  approxStart?: string
  approximate?: boolean
}

export interface TheoryDay {
  /** 0 = Sunday … 6 = Saturday */
  day: number
  start: string
  end: string
  breaks: TheoryBreak[]
}

export interface TheoryTemplate {
  version: number
  effectiveFrom: string
  approximateBreakTimes: boolean
  note: string
  days: TheoryDay[]
}

export interface TheoryProgramShape {
  code: string
  requiredNetMinutes: number
  requiredSessions: number
}

export const CLASS1_THEORY_PROGRAM: TheoryProgramShape = {
  code: CLASS1_THEORY_CODE,
  requiredNetMinutes: CLASS1_THEORY_REQUIRED_NET_MINUTES,
  requiredSessions: CLASS1_THEORY_REQUIRED_SESSIONS,
}

const weeknightBreakV1: TheoryBreak = {
  minutes: 15,
  kind: 'break',
  approxStart: '19:15',
  approximate: true,
}

const saturdayBreaksV1: TheoryBreak[] = [
  { minutes: 15, kind: 'break', approxStart: '11:00', approximate: true },
  { minutes: 60, kind: 'lunch', approxStart: '13:00', approximate: true },
  { minutes: 15, kind: 'break', approxStart: '16:00', approximate: true },
]

const weeknightBreakV2: TheoryBreak = {
  minutes: 15,
  kind: 'break',
  start: '19:15',
  end: '19:30',
  approximate: false,
}

const saturdayBreaksV2: TheoryBreak[] = [
  { minutes: 15, kind: 'break', start: '10:30', end: '10:45', approximate: false },
  { minutes: 60, kind: 'lunch', start: '12:30', end: '13:30', approximate: false },
  { minutes: 15, kind: 'break', start: '15:30', end: '15:45', approximate: false },
]

/** Historical cohort template. Break positions are approximate; durations are fixed. */
export const TEMPLATE_V1: TheoryTemplate = {
  version: 1,
  effectiveFrom: '2026-01-01',
  approximateBreakTimes: true,
  note: 'Historical Class 1 theory. Saturday 09:00–18:00. Break positions are approximate.',
  days: [
    { day: 2, start: '17:30', end: '21:30', breaks: [weeknightBreakV1] },
    { day: 4, start: '17:30', end: '21:30', breaks: [weeknightBreakV1] },
    { day: 6, start: '09:00', end: '18:00', breaks: saturdayBreaksV1 },
  ],
}

/** Default for new cohorts. Saturday 08:30–17:30 with exact break times. */
export const TEMPLATE_V2: TheoryTemplate = {
  version: 2,
  effectiveFrom: '2026-10-24',
  approximateBreakTimes: false,
  note: 'Current Class 1 theory. Saturday 08:30–17:30. Break times are exact.',
  days: [
    { day: 2, start: '17:30', end: '21:30', breaks: [weeknightBreakV2] },
    { day: 4, start: '17:30', end: '21:30', breaks: [weeknightBreakV2] },
    { day: 6, start: '08:30', end: '17:30', breaks: saturdayBreaksV2 },
  ],
}

export function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

export function formatHhmm(total: number): string {
  const mins = ((Math.round(total) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function addMinutes(hhmm: string, minutes: number): string {
  return formatHhmm(parseMinutes(hhmm) + minutes)
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Array<[number, number]> = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (!last || interval[0] > last[1]) merged.push([interval[0], interval[1]])
    else last[1] = Math.max(last[1], interval[1])
  }
  return merged
}

/**
 * Net teaching minutes inside [start, end). Overlapping exact breaks are
 * merged. Approximate breaks contribute only `minutes`, clipped so the
 * total deduction cannot exceed the window.
 */
export function netMinutes(start: string, end: string, breaks: TheoryBreak[]): number {
  const windowStart = parseMinutes(start)
  const windowEnd = parseMinutes(end)
  const gross = Math.max(0, windowEnd - windowStart)
  if (gross === 0 || breaks.length === 0) return gross

  const intervals: Array<[number, number]> = []
  let durationOnly = 0
  for (const entry of breaks) {
    const duration = Math.max(0, entry.minutes || 0)
    const breakStart = entry.start
    const breakEnd = entry.end
    const positioned = entry.approximate !== true && !!breakStart && !!breakEnd
    if (!positioned) {
      durationOnly += duration
      continue
    }
    const clipStart = Math.max(windowStart, parseMinutes(breakStart))
    const clipEnd = Math.min(windowEnd, parseMinutes(breakEnd))
    if (clipEnd > clipStart) intervals.push([clipStart, clipEnd])
  }
  const fromIntervals = mergeIntervals(intervals).reduce((sum, [s, e]) => sum + (e - s), 0)
  const deducted = Math.min(gross, fromIntervals + durationOnly)
  return gross - deducted
}

export function grossMinutes(start: string, end: string): number {
  return Math.max(0, parseMinutes(end) - parseMinutes(start))
}

/** 225 → "3h45", 450 → "7h30", 4500 → "75h00". */
export function formatNet(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rem = m % 60
  return `${h}h${String(rem).padStart(2, '0')}`
}

/** 225 → "3 h 45". Used in French copy. */
export function formatNetFr(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rem = m % 60
  return `${h} h ${String(rem).padStart(2, '0')}`
}

/** Whole hours as "75 h"; anything else as 22h30 / "22 h 30". */
export function formatReportAmount(minutes: number, lang: 'en' | 'fr'): string {
  const m = Math.max(0, Math.round(minutes))
  if (m % 60 === 0) return `${m / 60} h`
  return lang === 'fr' ? formatNetFr(m) : formatNet(m)
}

export function formatTime12h(hhmm: string): string {
  const [h, minute] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

export function formatClockFr(hhmm: string): string {
  const [h, minute] = hhmm.split(':').map(Number)
  return `${h} h ${String(minute).padStart(2, '0')}`
}

export function breaksForDay(template: TheoryTemplate, day: number): TheoryBreak[] {
  return template.days.find(entry => entry.day === day)?.breaks.map(entry => ({ ...entry })) ?? []
}

/**
 * Breaks to store when staff edit a day away from a template.
 * Exact template breaks are kept when the clock times still match.
 * Otherwise the standard durations travel with the class (15 min on a
 * short day, 15 + 60 + 15 on a long day) and only the durations count.
 */
export function standardBreaksFor(day: number, start: string, end: string): TheoryBreak[] {
  for (const template of [TEMPLATE_V2, TEMPLATE_V1]) {
    const match = template.days.find(entry => entry.day === day && entry.start === start && entry.end === end)
    if (match) return match.breaks.map(entry => ({ ...entry }))
  }
  const gross = grossMinutes(start, end)
  if (gross <= 0) return []
  if (gross <= 5 * 60) return [{ minutes: 15, kind: 'break', approximate: true }]
  return [
    { minutes: 15, kind: 'break', approximate: true },
    { minutes: 60, kind: 'lunch', approximate: true },
    { minutes: 15, kind: 'break', approximate: true },
  ]
}

export function parseBreaksJson(value: string | null | undefined): TheoryBreak[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as TheoryBreak[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(entry => entry && typeof entry.minutes === 'number' && (entry.kind === 'break' || entry.kind === 'lunch'))
  } catch {
    return []
  }
}

function breakWindow(entry: TheoryBreak): { start: string; end: string } | null {
  if (entry.start && entry.end) return { start: entry.start, end: entry.end }
  if (entry.approxStart) return { start: entry.approxStart, end: addMinutes(entry.approxStart, entry.minutes) }
  return null
}

export function formatBreaksLabel(breaks: TheoryBreak[], approximate = false): string {
  if (breaks.length === 0) return approximate ? 'none (approx.)' : 'none'
  const parts = breaks.map(entry => {
    const window = breakWindow(entry)
    const span = window ? `${window.start}–${window.end}` : `${entry.minutes} min`
    const kind = entry.kind === 'lunch' ? 'lunch' : 'break'
    return `${span} ${kind}`
  })
  return approximate ? `${parts.join(', ')} (approx.)` : parts.join(', ')
}

export interface BuiltTheorySession {
  date: string
  start: string
  end: string
  day: number
  sessionNumber: number
  breaks: TheoryBreak[]
  netMinutes: number
  cumulativeNetMinutes: number
}

export interface BuiltTheorySchedule {
  sessions: BuiltTheorySession[]
  totalNetMinutes: number
  warning: string | null
}

const MAX_SESSIONS = 40

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const cursor = new Date(Date.UTC(y, m - 1, d))
  cursor.setUTCDate(cursor.getUTCDate() + days)
  return cursor.toISOString().slice(0, 10)
}

function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * Walk forward from startISO and add each template day in full.
 * Stops once the cumulative net reaches the requirement. A class that
 * would pass the requirement is kept whole and reported as a warning.
 * Nothing is trimmed.
 */
export function buildTheorySessions(
  startISO: string,
  days: TheoryDay[],
  requiredNetMinutes: number = CLASS1_THEORY_REQUIRED_NET_MINUTES,
): BuiltTheorySchedule {
  if (!startISO || days.length === 0 || requiredNetMinutes <= 0) {
    return { sessions: [], totalNetMinutes: 0, warning: null }
  }
  const byDay = new Map<number, TheoryDay>()
  for (const day of days) byDay.set(day.day, day)
  if ([...byDay.values()].every(day => netMinutes(day.start, day.end, day.breaks) <= 0)) {
    return { sessions: [], totalNetMinutes: 0, warning: 'Every class day has 0 net minutes.' }
  }

  const sessions: BuiltTheorySession[] = []
  let total = 0
  let cursor = startISO
  for (let guard = 0; guard < MAX_SESSIONS * 14 && total < requiredNetMinutes && sessions.length < MAX_SESSIONS; guard++) {
    const day = byDay.get(isoWeekday(cursor))
    if (day) {
      const net = netMinutes(day.start, day.end, day.breaks)
      if (net > 0) {
        total += net
        sessions.push({
          date: cursor,
          start: day.start,
          end: day.end,
          day: day.day,
          sessionNumber: sessions.length + 1,
          breaks: day.breaks.map(entry => ({ ...entry })),
          netMinutes: net,
          cumulativeNetMinutes: total,
        })
      }
    }
    cursor = isoAddDays(cursor, 1)
  }

  let warning: string | null = null
  if (total > requiredNetMinutes) {
    warning = `Schedule is ${formatNet(total)} net, over the ${formatNet(requiredNetMinutes)} requirement. The last class was not shortened.`
  } else if (total < requiredNetMinutes) {
    warning = `Schedule is ${formatNet(total)} net across ${sessions.length} classes, short of ${formatNet(requiredNetMinutes)}.`
  }
  return { sessions, totalNetMinutes: total, warning }
}

export function torontoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export type TheoryAttendanceCode = 'signed' | 'pending' | 'scheduled' | 'absent' | 'excused'

export function theoryAttendanceDisplay(input: {
  status?: string | null
  basis?: string | null
  confirmedBy?: string | null
  confirmedAt?: string | null
}): {
  code: TheoryAttendanceCode
  en: string
  fr: string
  staffNote: string | null
} {
  if (input.status === 'absent') {
    return { code: 'absent', en: 'Absent', fr: 'Absent(e)', staffNote: null }
  }
  if (input.status === 'excused') {
    return { code: 'excused', en: 'Excused', fr: 'Excusé(e)', staffNote: null }
  }
  if (input.status === 'present' && input.basis === 'admin_confirmed') {
    const who = (input.confirmedBy || 'Ars').replace(/\s*\(administration\)\s*/gi, ' ').replace(/\s+/g, ' ').trim() || 'Ars'
    const when = input.confirmedAt || '2026-10-24'
    return {
      code: 'pending',
      en: 'Attended — signature pending',
      fr: 'Présent(e) — signature en attente',
      staffNote: `Attendance confirmed by administration (${who}, ${when}) — per-lesson signature system not yet in service.`,
    }
  }
  if (input.status === 'present' && input.basis === 'signature') {
    return { code: 'signed', en: 'Signed', fr: 'Signé', staffNote: null }
  }
  return { code: 'scheduled', en: 'Scheduled', fr: 'À venir', staffNote: null }
}

export function theoryClassLabel(sessionNumber: number, requiredSessions = CLASS1_THEORY_REQUIRED_SESSIONS): string {
  return `Theory class ${sessionNumber} of ${requiredSessions}`
}

export function signInTheoryLabel(sessionNumber: number, groupName: string): string {
  return `Class 1 Theory ${sessionNumber} - ${groupName}`
}

export function formatReportHoursLine(args: {
  attendedNetMinutes: number
  attendedCount: number
  requiredNetMinutes?: number
  requiredSessions?: number
  weeknightNetMinutes?: number
  saturdayNetMinutes?: number
  lang: 'en' | 'fr'
}): string {
  const requiredNet = args.requiredNetMinutes ?? CLASS1_THEORY_REQUIRED_NET_MINUTES
  const requiredSessions = args.requiredSessions ?? CLASS1_THEORY_REQUIRED_SESSIONS
  if (args.lang === 'fr') {
    return `Total : ${formatReportAmount(args.attendedNetMinutes, 'fr')} / ${formatReportAmount(requiredNet, 'fr')} — ${args.attendedCount} / ${requiredSessions} cours.`
  }
  return `Total: ${formatReportAmount(args.attendedNetMinutes, 'en')} / ${formatReportAmount(requiredNet, 'en')} — ${args.attendedCount} / ${requiredSessions} classes.`
}

export function formatInstructorLine(
  instructor: { legalName: string; bookletName?: string | null; saaqInstructorNo?: string | null },
  lang: 'en' | 'fr',
): string {
  const name = instructor.bookletName?.trim() || instructor.legalName
  const number = instructor.saaqInstructorNo?.trim() || ''
  if (lang === 'fr') {
    const no = number || 'en attente (non encore attribué)'
    return `Formateur : ${name} — No de formateur SAAQ : ${no}`
  }
  const no = number || 'Pending'
  return `Instructor: ${name}. Instructor no.: ${no}`
}

const EN_DAY: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

const FR_DAY: Record<number, string> = {
  0: 'dimanche',
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
}

function weeklyNet(template: TheoryTemplate): number {
  return template.days.reduce((sum, day) => sum + netMinutes(day.start, day.end, day.breaks), 0)
}

/**
 * Class 1 schedule the WhatsApp bot may quote. Class clock times, the
 * number of classes, the rough length in weeks, and that practical is
 * booked separately. Breaks, lunch, and net-hour totals stay out of this
 * text. The v2 seed is the fallback when the database is empty.
 */
export function formatTheoryScheduleForBot(
  program: TheoryProgramShape = CLASS1_THEORY_PROGRAM,
  template: TheoryTemplate = TEMPLATE_V2,
): { en: string; fr: string } {
  const sessions = program.requiredSessions
  const practicalHours = CLASS1_PRACTICAL_MINUTES / 60
  const perWeek = weeklyNet(template)
  const weeks = perWeek > 0 ? Math.round(program.requiredNetMinutes / perWeek) : 0
  const weeknightDays = template.days.filter(day => day.day === 2 || day.day === 4)
  const saturday = template.days.find(day => day.day === 6)
  const sameWeeknights = weeknightDays.length === 2
    && weeknightDays[0].start === weeknightDays[1].start
    && weeknightDays[0].end === weeknightDays[1].end

  const enLines = [`- ${sessions} theory classes, in person at the school.`]
  const frLines = [`- ${sessions} cours de théorie, en personne à l'école.`]

  if (sameWeeknights) {
    const day = weeknightDays[0]
    enLines.push(`  - Tuesday and Thursday, ${formatTime12h(day.start)}–${formatTime12h(day.end)}.`)
    frLines.push(`  - Mardi et jeudi, de ${formatClockFr(day.start)} à ${formatClockFr(day.end)}.`)
  } else {
    for (const day of weeknightDays) {
      enLines.push(`  - ${EN_DAY[day.day]}, ${formatTime12h(day.start)}–${formatTime12h(day.end)}.`)
      const frName = FR_DAY[day.day]
      frLines.push(`  - ${frName.charAt(0).toUpperCase()}${frName.slice(1)}, de ${formatClockFr(day.start)} à ${formatClockFr(day.end)}.`)
    }
  }

  if (saturday) {
    enLines.push(`  - Saturday, ${formatTime12h(saturday.start)}–${formatTime12h(saturday.end)}.`)
    frLines.push(`  - Samedi, de ${formatClockFr(saturday.start)} à ${formatClockFr(saturday.end)}.`)
  }

  enLines.push(`- About ${weeks} weeks.`)
  frLines.push(`- Environ ${weeks} semaines.`)
  enLines.push(`- The ${practicalHours}-hour practical part is scheduled separately.`)
  frLines.push(`- La partie pratique de ${practicalHours} heures est planifiée séparément.`)
  enLines.push(`- If the verified student context lists the student's own class times, quote those first; they take priority over this standard schedule.`)

  return { en: enLines.join('\n'), fr: frLines.join('\n') }
}

export interface HoraireRow {
  sessionNumber: number
  date: string
  startTime: string
  endTime: string
  netMinutes: number
  lineEn: string
  lineFr: string
}

/** Lines a future 4-horaire annex would print. Does not write a SAAQ file. */
export function formatHoraireRows(sessions: Array<{
  sessionNumber: number
  date: string
  startTime: string
  endTime: string
  netMinutes: number
}>, requiredSessions = CLASS1_THEORY_REQUIRED_SESSIONS): HoraireRow[] {
  return sessions.map(session => ({
    sessionNumber: session.sessionNumber,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    netMinutes: session.netMinutes,
    lineEn: `Class ${session.sessionNumber} of ${requiredSessions} — ${session.date} ${session.startTime}–${session.endTime} — ${formatNet(session.netMinutes)} net`,
    lineFr: `Cours ${session.sessionNumber} / ${requiredSessions} — ${session.date} ${session.startTime}–${session.endTime} — ${formatNetFr(session.netMinutes)} nettes`,
  }))
}
