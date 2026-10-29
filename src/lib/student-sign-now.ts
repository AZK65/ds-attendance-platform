/**
 * When staff can collect a student's own signature for a past Class 1
 * theory lesson. The pad itself stays empty: nothing here supplies ink
 * from another lesson.
 */

export const ALREADY_SIGNED_MESSAGE =
  'This class is already signed. The saved signature was not changed.'

export function torontoWallClock(now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  let hour = Number(get('hour'))
  if (hour === 24) hour = 0
  const minute = Number(get('minute'))
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + minute,
  }
}

/** True when this student already has a ClassSignature for the lesson. */
export function studentHasClassSignature(input: {
  eventId: string | null | undefined
  signatureEventIds: Iterable<string>
  attendanceBasis?: string | null
}): boolean {
  if (!input.eventId) return false
  if (input.attendanceBasis === 'signature') return true
  const eventId = String(input.eventId)
  for (const id of input.signatureEventIds) {
    if (String(id) === eventId) return true
  }
  return false
}

/**
 * Show "Student signs now" only after the lesson has started (including
 * after it has ended) and only when this student has no ClassSignature.
 * A missing event id cannot be posted, so the button stays hidden.
 */
export function showStudentSignsNow(input: {
  date: string
  startTime: string
  eventId: string | null | undefined
  hasClassSignature: boolean
  now?: Date
}): boolean {
  if (!input.eventId || input.hasClassSignature) return false
  const wall = torontoWallClock(input.now ?? new Date())
  if (input.date > wall.date) return false
  if (input.date < wall.date) return true
  const [hourRaw, minuteRaw] = input.startTime.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false
  return wall.minutes >= hour * 60 + minute
}
