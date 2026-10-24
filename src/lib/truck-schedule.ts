/**
 * Class 1 cohort timetable — the THEORY block only.
 *
 * The program is 125 h: 75 net hours of classroom theory (15 classes) and
 * 50 h of in-cab driving. Breaks and lunch are not counted. The net-hour
 * rules live in theory-hours.ts. This file keeps the day-editor types the
 * admin screens already import.
 *
 * Default week (template v2), America/Toronto local time:
 *   Tue 5:30–9:30 PM   3h45 net
 *   Thu 5:30–9:30 PM   3h45 net
 *   Sat 8:30 AM–5:30 PM 7h30 net
 * → 15 net hours a week, so 75 h is 15 classes over about 5 weeks.
 *
 * The 50 h of in-cab driving is booked per student afterwards and is not
 * generated here.
 */

import {
  CLASS1_THEORY_REQUIRED_NET_MINUTES,
  TEMPLATE_V2,
  buildTheorySessions,
  formatNet,
  formatTime12h as formatTheoryTime12h,
  netMinutes,
  standardBreaksFor,
  type TheoryBreak,
  type TheoryDay,
} from '@/lib/theory-hours'

export interface TruckDay {
  /** 0 = Sunday … 6 = Saturday */
  day: number
  /** "HH:MM" 24h */
  start: string
  end: string
  breaks?: TheoryBreak[]
}

export const DEFAULT_TRUCK_DAYS: TruckDay[] = TEMPLATE_V2.days.map(day => ({
  day: day.day,
  start: day.start,
  end: day.end,
  breaks: day.breaks.map(entry => ({ ...entry })),
}))

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Classroom net hours required by the Class 1 contract. Not editable. */
export const TRUCK_THEORY_TARGET_HOURS = CLASS1_THEORY_REQUIRED_NET_MINUTES / 60
/** In-cab hours — booked per student, not part of this timetable. */
export const TRUCK_PRACTICAL_HOURS = 50

export interface TruckSession {
  date: string
  start: string
  end: string
  sessionNumber: number
  /** Net hours, not the clock length. */
  hours: number
  cumulativeHours: number
  /** Always false. Classes are not shortened to force a gross total. */
  partial: boolean
}

export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? mins / 60 : 0
}

function asTheoryDay(day: TruckDay): TheoryDay {
  return {
    day: day.day,
    start: day.start,
    end: day.end,
    breaks: day.breaks && day.breaks.length > 0 ? day.breaks : standardBreaksFor(day.day, day.start, day.end),
  }
}

/**
 * Build the theory block from net hours. The 75 h requirement is fixed.
 * `targetHours` is accepted so older callers still compile, and it is not
 * used to trim a class.
 */
export function buildTruckSessions(
  startISO: string,
  days: TruckDay[],
  _targetHours: number = TRUCK_THEORY_TARGET_HOURS,
): TruckSession[] {
  const built = buildTheorySessions(startISO, days.map(asTheoryDay), CLASS1_THEORY_REQUIRED_NET_MINUTES)
  const round2 = (minutes: number) => Math.round((minutes / 60) * 100) / 100
  return built.sessions.map(session => ({
    date: session.date,
    start: session.start,
    end: session.end,
    sessionNumber: session.sessionNumber,
    hours: round2(session.netMinutes),
    cumulativeHours: round2(session.cumulativeNetMinutes),
    partial: false,
  }))
}

export interface TruckSummary {
  sessions: number
  totalHours: number
  firstDate: string | null
  lastDate: string | null
  weeks: number
}

export function summarizeTruckSessions(sessions: TruckSession[]): TruckSummary {
  const totalHours = Math.round(sessions.reduce((n, session) => n + session.hours, 0) * 100) / 100
  const firstDate = sessions[0]?.date ?? null
  const lastDate = sessions[sessions.length - 1]?.date ?? null
  let weeks = 0
  if (firstDate && lastDate) {
    const [fy, fm, fd] = firstDate.split('-').map(Number)
    const [ly, lm, ld] = lastDate.split('-').map(Number)
    const ms = Date.UTC(ly, lm - 1, ld) - Date.UTC(fy, fm - 1, fd)
    weeks = Math.round((ms / (7 * 24 * 60 * 60 * 1000)) * 10) / 10
  }
  return { sessions: sessions.length, totalHours, firstDate, lastDate, weeks }
}

/** Net classroom hours per week for a day config. */
export function weeklyHours(days: TruckDay[]): number {
  const minutes = days.reduce((sum, day) => sum + netMinutes(day.start, day.end, asTheoryDay(day).breaks), 0)
  return Math.round((minutes / 60) * 100) / 100
}

export function weeklyNetLabel(days: TruckDay[]): string {
  const minutes = days.reduce((sum, day) => sum + netMinutes(day.start, day.end, asTheoryDay(day).breaks), 0)
  return formatNet(minutes)
}

export const formatTime12h = formatTheoryTime12h

export const formatTimeRange = (start: string, end: string) =>
  `${formatTime12h(start)} to ${formatTime12h(end)}`

/** e.g. "Saturday 8:30 AM to 5:30 PM (7h30 net)" */
export function describeTruckDay(day: TruckDay): string {
  const breaks = asTheoryDay(day).breaks
  const net = netMinutes(day.start, day.end, breaks)
  return `${DAY_NAMES[day.day]} ${formatTimeRange(day.start, day.end)} (${formatNet(net)} net)`
}
