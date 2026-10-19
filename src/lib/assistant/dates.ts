export const ASSISTANT_TIMEZONE = 'America/Toronto'
export const MAX_RANGE_DAYS = 31

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export type AssistantRange = {
  from: string
  to: string
  start: Date
  end: Date
}

export function isIsoDate(value: string): boolean {
  const match = DATE_RE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
}

export function addIsoDays(isoDate: string, days: number): string {
  const match = DATE_RE.exec(isoDate)
  if (!match) throw new Error('Invalid date')
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
  const year = utc.getUTCFullYear()
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const day = String(utc.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function inclusiveIsoDays(from: string, to: string): number {
  const start = DATE_RE.exec(from)
  const end = DATE_RE.exec(to)
  if (!start || !end) return NaN
  const a = Date.UTC(Number(start[1]), Number(start[2]) - 1, Number(start[3]))
  const b = Date.UTC(Number(end[1]), Number(end[2]) - 1, Number(end[3]))
  return Math.round((b - a) / 86_400_000) + 1
}

function torontoWallClock(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ASSISTANT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  let hour = pick('hour')
  if (hour === '24') hour = '00'
  return `${pick('year')}-${pick('month')}-${pick('day')}T${hour}:${pick('minute')}:${pick('second')}`
}

/**
 * UTC instant of local midnight in America/Toronto.
 * Midnight is unambiguous on both DST transition days (the change is at 02:00).
 */
export function startOfTorontoDay(isoDate: string): Date {
  if (!isIsoDate(isoDate)) throw new Error('Invalid date')
  const [year, month, day] = isoDate.split('-').map(Number)
  const candidates = [4, 5].map(utcHour => new Date(Date.UTC(year, month - 1, day, utcHour, 0, 0)))
  const matches = candidates.filter(candidate => torontoWallClock(candidate) === `${isoDate}T00:00:00`)
  if (matches.length === 0) throw new Error(`No America/Toronto midnight for ${isoDate}`)
  matches.sort((a, b) => a.getTime() - b.getTime())
  return matches[0]
}

export function torontoToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ASSISTANT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

export function parseAssistantRange(
  params: URLSearchParams,
  now = new Date(),
): { ok: true; range: AssistantRange } | { ok: false; error: string } {
  const date = params.get('date')?.trim() || ''
  const fromParam = params.get('from')?.trim() || ''
  const toParam = params.get('to')?.trim() || ''

  let from = ''
  let to = ''
  if (fromParam || toParam) {
    from = fromParam || toParam
    to = toParam || fromParam
  } else if (date) {
    from = date
    to = date
  } else {
    from = torontoToday(now)
    to = from
  }

  if (!isIsoDate(from) || !isIsoDate(to)) {
    return { ok: false, error: 'Dates must be YYYY-MM-DD.' }
  }
  if (to < from) {
    return { ok: false, error: '`to` must be on or after `from`.' }
  }
  const days = inclusiveIsoDays(from, to)
  if (days > MAX_RANGE_DAYS) {
    return { ok: false, error: `Date range cannot exceed ${MAX_RANGE_DAYS} days.` }
  }

  return {
    ok: true,
    range: {
      from,
      to,
      start: startOfTorontoDay(from),
      end: startOfTorontoDay(addIsoDays(to, 1)),
    },
  }
}
