/**
 * Class 1 booklet wording. Dates are wall-clock strings (America/Toronto
 * local times already stored as YYYY-MM-DD and HH:mm). Nothing here converts
 * a scheduled start through a timezone, so a 17:30 class stays 5:30 p.m.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatBookletDateTime(date: string, hhmm: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hourRaw, minuteRaw] = hhmm.split(':')
  const hour = Number(hourRaw)
  const minute = String(minuteRaw ?? '0').padStart(2, '0').slice(0, 2)
  if (!year || !month || !day || !Number.isFinite(hour)) return `${date} ${hhmm}`.trim()
  const period = hour >= 12 ? 'p.m.' : 'a.m.'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${MONTHS[month - 1]} ${day}, ${year}, ${hour12}:${minute} ${period}`
}

/** "2026-08-04 17:30" or "2026-08-04T17:30:00-04:00" → the wall-clock start. */
export function formatScheduledStart(value: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (!match) return value.trim()
  return formatBookletDateTime(match[1], match[2])
}

export function formatSignedAtFallback(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(value)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  const period = pick('dayPeriod').toLowerCase() === 'pm' ? 'p.m.' : 'a.m.'
  return `${pick('month')} ${pick('day')}, ${pick('year')}, ${pick('hour')}:${pick('minute')} ${period} (signed at)`
}

export function formatSignedOn(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

/** Class 1 header. "15 theory · 1 practical" — signed lessons, not one combined total. */
export function formatClass1SignedCounts(theorySigned: number, practicalSigned: number): string {
  return `${theorySigned} theory · ${practicalSigned} practical`
}

/** "Instructor: Abdul Rahman Ahmed Qazi. Instructor no.: Pending" */
export function formatBookletInstructorLine(name: string, saaqInstructorNo?: string | null): string {
  const number = saaqInstructorNo?.trim() || 'Pending'
  return `Instructor: ${name}. Instructor no.: ${number}`
}

export function instructorNumberLabel(saaqInstructorNo?: string | null): string {
  const number = saaqInstructorNo?.trim()
  return number ? `No. ${number}` : 'Pending'
}
