/**
 * Practical bookings for a Class 1 booklet. Teamup is the calendar. Snapshots
 * fill in events the poller has seen. A signature whose event is in neither
 * place becomes one 2-hour class so the drawing is not dropped.
 */

import { prisma } from '@/lib/db'
import { loadStudentCalendarHistory } from '@/lib/student-calendar-history'
import {
  bookletRowsFromClasses,
  expandPracticalClasses,
  isTruckPracticalTitle,
  type PracticalBookingInput,
  type PracticalBookletRow,
  type UnitSignOff,
  type UnitSignature,
} from '@/lib/practical-classes'

function last10(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

function plusHours(start: string, hours: number): string {
  const date = new Date(start)
  if (Number.isNaN(date.getTime())) return start
  return new Date(date.getTime() + hours * 3_600_000).toISOString()
}

async function teamupPracticalEvents(phoneSuffix: string): Promise<PracticalBookingInput[]> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (!apiKey || !calendarKey || phoneSuffix.length < 7) return []
  const events = await loadStudentCalendarHistory({ phone: phoneSuffix })
  return events
    .filter(event => event.id && event.start_dt && event.end_dt && isTruckPracticalTitle(event.title))
    .map(event => ({
      id: String(event.id),
      title: event.title || '',
      start: event.start_dt || '',
      end: event.end_dt || '',
      notes: event.notes || '',
      subcalendarId: event.subcalendar_ids?.[0] ?? null,
    }))
}

export async function loadPracticalBookings(phone: string): Promise<PracticalBookingInput[]> {
  const phoneSuffix = last10(phone)
  const [live, snapshots] = await Promise.all([
    teamupPracticalEvents(phoneSuffix).catch(() => [] as PracticalBookingInput[]),
    phoneSuffix
      ? prisma.teamupEventSnapshot.findMany({ where: { notes: { contains: phoneSuffix } } })
      : Promise.resolve([]),
  ])
  const byId = new Map<string, PracticalBookingInput>()
  for (const snapshot of snapshots) {
    if (!isTruckPracticalTitle(snapshot.title)) continue
    byId.set(snapshot.eventId, {
      id: snapshot.eventId,
      title: snapshot.title,
      start: snapshot.startDt,
      end: snapshot.endDt,
      notes: snapshot.notes,
      subcalendarId: null,
    })
  }
  for (const event of live) byId.set(event.id, event)
  return [...byId.values()]
}

export function practicalRowsForBooklet(input: {
  bookings: PracticalBookingInput[]
  studentSignatures: UnitSignature[]
  instructorSignatures: UnitSignOff[]
  /** Used when a signed event has no booking. ISO or a date-like string. */
  fallbackStartByEvent?: Record<string, string>
  /** ClassAttendance rows with present=true. Event ids, one per booking. */
  presentEventIds?: Iterable<string>
  /** Classes that start after this instant are left off the booklet. */
  now?: Date
}): PracticalBookletRow[] {
  const known = new Set(input.bookings.map(booking => String(booking.id)))
  const synthetic: PracticalBookingInput[] = []
  for (const signature of input.studentSignatures) {
    if (known.has(String(signature.eventId))) continue
    if (synthetic.some(booking => booking.id === String(signature.eventId))) continue
    const start = input.fallbackStartByEvent?.[String(signature.eventId)] || signature.signedAt || ''
    if (!start) continue
    synthetic.push({
      id: String(signature.eventId),
      title: 'Truck Class 1',
      start,
      end: plusHours(start, 2),
    })
  }
  return bookletRowsFromClasses({
    classes: expandPracticalClasses([...input.bookings, ...synthetic]).classes,
    studentSignatures: input.studentSignatures,
    instructorSignatures: input.instructorSignatures,
    presentEventIds: input.presentEventIds,
    now: input.now,
  })
}
