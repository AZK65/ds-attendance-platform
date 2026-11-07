export type JourneyStatus = 'present' | 'absent' | 'scheduled' | 'unverified'

export function recordedClassStatus(start: Date, present: boolean | undefined, now = new Date()): JourneyStatus {
  if (start >= now) return 'scheduled'
  return present === true ? 'present' : present === false ? 'absent' : 'unverified'
}

/** Prefer a real completion over a failed/missing attempt, then the earliest date. */
export function preferJourneyAttempt<T extends { when: Date; status: JourneyStatus }>(current: T | undefined, next: T): T {
  if (!current) return next
  if (current.status === 'present' && next.status !== 'present') return current
  if (next.status === 'present' && current.status !== 'present') return next
  return next.when < current.when ? next : current
}
