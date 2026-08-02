/**
 * Class 1 (PESR) cohort timetable — the THEORY block only.
 *
 * The program is 125 h: 75 h of classroom theory followed by 50 h of in-cab
 * driving. Only the theory block is a cohort timetable — everyone sits in the
 * same room on the same days:
 *   Tue 5:30–9:30 PM   (4 h)
 *   Thu 5:30–9:30 PM   (4 h)
 *   Sat 9:00 AM–6:00 PM (9 h)
 * → 17 h/week, so 75 h lands in about 4.5 weeks.
 *
 * The 50 h of in-cab driving is booked per student afterwards (one student per
 * cab), through the existing Truck Class scheduler — it is deliberately NOT
 * generated here.
 *
 * Sessions are generated until the hour target is met rather than from a
 * session count, because 75 h is the number that actually matters (it's the
 * SAAQ contract obligation) and the class days don't have equal lengths.
 *
 * Shared by the API route that creates the events and by the two admin UIs
 * that preview them, so the dates on screen are exactly the dates created.
 */

export interface TruckDay {
  /** 0 = Sunday … 6 = Saturday */
  day: number
  /** "HH:MM" 24h */
  start: string
  end: string
}

export const DEFAULT_TRUCK_DAYS: TruckDay[] = [
  { day: 2, start: '17:30', end: '21:30' }, // Tuesday
  { day: 4, start: '17:30', end: '21:30' }, // Thursday
  { day: 6, start: '09:00', end: '18:00' }, // Saturday
]

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Classroom hours required by the Class 1 contract. */
export const TRUCK_THEORY_TARGET_HOURS = 75
/** In-cab hours — booked per student, not part of this timetable. */
export const TRUCK_PRACTICAL_HOURS = 50

/** Safety cap so a tiny/zero-length day config can't generate forever. */
const MAX_SESSIONS = 100

export interface TruckSession {
  /** ISO date, e.g. "2026-08-04" */
  date: string
  start: string
  end: string
  sessionNumber: number
  hours: number
  /** Cumulative theory hours through this session. */
  cumulativeHours: number
}

export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? mins / 60 : 0
}

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Walk forward from `startISO`, adding a class on each configured day, and
 * stop once `targetHours` of classroom time is covered. The final session is
 * included whole (we don't split a class), so the total lands on or just above
 * the target.
 */
export function buildTruckSessions(
  startISO: string,
  days: TruckDay[],
  targetHours: number = TRUCK_THEORY_TARGET_HOURS,
): TruckSession[] {
  if (!startISO || days.length === 0 || targetHours <= 0) return []

  const byDay = new Map<number, TruckDay>()
  for (const d of days) byDay.set(d.day, d)
  // A config where every day is zero-length would never reach the target.
  if ([...byDay.values()].every(d => hoursBetween(d.start, d.end) <= 0)) return []

  const [y, m, d] = startISO.split('-').map(Number)
  if (!y || !m || !d) return []
  const cursor = new Date(y, m - 1, d)

  const out: TruckSession[] = []
  let total = 0

  for (let guard = 0; guard < MAX_SESSIONS * 14 && total < targetHours && out.length < MAX_SESSIONS; guard++) {
    const cfg = byDay.get(cursor.getDay())
    if (cfg) {
      const hours = hoursBetween(cfg.start, cfg.end)
      if (hours > 0) {
        total += hours
        out.push({
          date: isoOf(cursor),
          start: cfg.start,
          end: cfg.end,
          sessionNumber: out.length + 1,
          hours,
          cumulativeHours: round1(total),
        })
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

export interface TruckSummary {
  sessions: number
  totalHours: number
  firstDate: string | null
  lastDate: string | null
  /** Whole weeks the theory block spans, for a sanity read. */
  weeks: number
}

export function summarizeTruckSessions(sessions: TruckSession[]): TruckSummary {
  const totalHours = round1(sessions.reduce((n, s) => n + s.hours, 0))
  const firstDate = sessions[0]?.date ?? null
  const lastDate = sessions[sessions.length - 1]?.date ?? null
  let weeks = 0
  if (firstDate && lastDate) {
    const [fy, fm, fd] = firstDate.split('-').map(Number)
    const [ly, lm, ld] = lastDate.split('-').map(Number)
    const ms = new Date(ly, lm - 1, ld).getTime() - new Date(fy, fm - 1, fd).getTime()
    weeks = round1(ms / (7 * 24 * 60 * 60 * 1000))
  }
  return { sessions: sessions.length, totalHours, firstDate, lastDate, weeks }
}

/** Hours of classroom time per week for a given day config. */
export function weeklyHours(days: TruckDay[]): number {
  return round1(days.reduce((n, d) => n + hoursBetween(d.start, d.end), 0))
}

/** "5:30 PM" from "17:30" — for messages and calendar copy. */
export function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export const formatTimeRange = (start: string, end: string) =>
  `${formatTime12h(start)} to ${formatTime12h(end)}`

/** e.g. "Saturday 9:00 AM to 6:00 PM (9 h)" */
export function describeTruckDay(d: TruckDay): string {
  return `${DAY_NAMES[d.day]} ${formatTimeRange(d.start, d.end)} (${round1(hoursBetween(d.start, d.end))} h)`
}
