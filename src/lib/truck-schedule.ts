/**
 * Class 1 (PESR) cohort timetable.
 *
 * The program runs 17 h/week in person, on three days with DIFFERENT hours:
 *   Tue 5:30–9:30 PM  theory      (4 h)
 *   Thu 5:30–9:30 PM  theory      (4 h)
 *   Sat 9:00 AM–6:00 PM yard+road (9 h)
 * → 125 h total (75 h theory + 50 h practical) in roughly 7–8 weeks.
 *
 * Everything is taught in person at the school; the Saturday block is the
 * whole cohort on site, with students rotating through the truck inside that
 * window. So all three days are GROUP events on the calendar.
 *
 * Shared by the API route that creates the events and by the two admin UIs
 * that preview them, so the dates on screen are exactly the dates created.
 */

export type TruckDayKind = 'theory' | 'practical'

export interface TruckDay {
  /** 0 = Sunday … 6 = Saturday */
  day: number
  /** "HH:MM" 24h */
  start: string
  end: string
  kind: TruckDayKind
}

export const DEFAULT_TRUCK_DAYS: TruckDay[] = [
  { day: 2, start: '17:30', end: '21:30', kind: 'theory' },    // Tuesday
  { day: 4, start: '17:30', end: '21:30', kind: 'theory' },    // Thursday
  { day: 6, start: '09:00', end: '18:00', kind: 'practical' }, // Saturday
]

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Program targets, from the SAAQ Class 1 contract. */
export const TRUCK_THEORY_TARGET_HOURS = 75
export const TRUCK_PRACTICAL_TARGET_HOURS = 50

export interface TruckSession {
  /** ISO date, e.g. "2026-08-04" */
  date: string
  start: string
  end: string
  kind: TruckDayKind
  /** 1-based counter WITHIN this kind, so titles read "Theory 5" / "Yard + Road 3". */
  sessionNumber: number
  hours: number
}

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? mins / 60 : 0
}

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Walk forward from `startISO` emitting one session per configured class day
 * until `count` sessions exist. Pure date math — no I/O — so the preview and
 * the real creation can never disagree.
 */
export function buildTruckSessions(startISO: string, days: TruckDay[], count: number): TruckSession[] {
  if (!startISO || days.length === 0 || count <= 0) return []

  const byDay = new Map<number, TruckDay>()
  for (const d of days) byDay.set(d.day, d)

  const [y, m, d] = startISO.split('-').map(Number)
  if (!y || !m || !d) return []
  const cursor = new Date(y, m - 1, d)

  const out: TruckSession[] = []
  const perKind: Record<TruckDayKind, number> = { theory: 0, practical: 0 }

  // Guard bounds the walk so a pathological config can't loop forever.
  for (let guard = 0; guard < count * 14 + 90 && out.length < count; guard++) {
    const cfg = byDay.get(cursor.getDay())
    if (cfg) {
      perKind[cfg.kind] += 1
      out.push({
        date: isoOf(cursor),
        start: cfg.start,
        end: cfg.end,
        kind: cfg.kind,
        sessionNumber: perKind[cfg.kind],
        hours: hoursBetween(cfg.start, cfg.end),
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

export interface TruckSummary {
  theoryHours: number
  practicalHours: number
  totalHours: number
  firstDate: string | null
  lastDate: string | null
}

export function summarizeTruckSessions(sessions: TruckSession[]): TruckSummary {
  const round = (n: number) => Math.round(n * 10) / 10
  let theory = 0
  let practical = 0
  for (const s of sessions) {
    if (s.kind === 'theory') theory += s.hours
    else practical += s.hours
  }
  return {
    theoryHours: round(theory),
    practicalHours: round(practical),
    totalHours: round(theory + practical),
    firstDate: sessions[0]?.date ?? null,
    lastDate: sessions[sessions.length - 1]?.date ?? null,
  }
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

/** Human label for a day config, e.g. "Saturday 9:00 AM to 6:00 PM (yard + road)". */
export function describeTruckDay(d: TruckDay): string {
  return `${DAY_NAMES[d.day]} ${formatTimeRange(d.start, d.end)} (${d.kind === 'theory' ? 'theory' : 'yard + road'})`
}
