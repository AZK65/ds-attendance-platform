/**
 * Class 1 practical classes are 2 hours. The program is 25 classes (50 h).
 *
 * Bookings are walked in date order. A 4 hour booking is two classes. A
 * remainder is not rounded away: it carries forward and combines with the
 * next booking. 3h then 3h is three classes, and the middle class is the
 * last hour of the first booking plus the first hour of the second. A
 * leftover with no later booking is flagged and is not a class. Odd lengths
 * are not supposed to happen, so each one keeps a warning.
 *
 * Signatures
 * ----------
 * One student drawing and one instructor sign-off on a booking cover every
 * 2-hour class that sits wholly inside that same booking. The drawing is
 * read by reference. It is not copied into another row, and it never covers
 * a different booking. Signing any class of the booking signs the booking.
 * The iPad already stores one ClassSignature per booking, so that flow is
 * unchanged.
 *
 * A class that uses hours from two bookings is not covered by either
 * booking's signature. It is dated, and it may be signed, on the booking
 * where it finishes. Its own row lives in PracticalClassUnitSignature
 * (unit 1000). Existing ClassSignature and LessonInstructorSignature rows
 * are never updated or deleted.
 *
 * Counted total
 * -------------
 * "N / 25 classes" and the matching hours count a 2-hour class when that
 * class is signed, or when its booking is marked present on the existing
 * per-booking ClassAttendance row. A present booking counts every 2-hour
 * class that sits wholly inside it. Cancelled bookings are dropped before
 * classes are built, so a present mark on a cancelled booking adds nothing.
 *
 * A class that takes hours from more than one booking counts when it is
 * signed, or when every booking that contributes hours is marked present.
 * Two bookings is the usual case: both must be present. One present
 * booking does not cover the other half. A booking-level signature still
 * does not sign that class; only its own cross-booking signature does.
 * The class is one lesson, so half an attendance mark is not the lesson.
 *
 * That counted total is what the student profile shows, and what the
 * 125-hour program bar uses (capped at 50 practical hours). The booklet
 * uses the same rule for the classes it lists. It lists only classes
 * whose start has already passed, still numbered in date order.
 *
 * Two records stay on a different rule, on purpose:
 * - SAAQ practical attestations are uploaded files (kind "practical").
 *   They are not recomputed from bookings or from this count.
 * - The Class 1 contract prints the contracted program (50 hours,
 *   25 classes), not this student's completed count.
 */

import { isCancelledClass } from '@/lib/car-class-gap'
import { formatBookletDateTime } from '@/lib/booklet-format'

export const PRACTICAL_CLASS_MINUTES = 120
export const CLASS1_PRACTICAL_CLASS_HOURS = 2
export const CLASS1_PRACTICAL_CLASS_COUNT = 25
export const CLASS1_PRACTICAL_HOURS = CLASS1_PRACTICAL_CLASS_COUNT * CLASS1_PRACTICAL_CLASS_HOURS
/** Stored only for a class that spans two bookings. Never a whole-booking signature. */
export const CROSS_BOOKING_UNIT = 1000

export interface PracticalBookingInput {
  id: string
  title: string
  start: string
  end: string
  notes?: string | null
  cancelled?: boolean
  subcalendarId?: number | null
}

export interface ClassSegment {
  eventId: string
  minutes: number
  /** America/Toronto calendar day, YYYY-MM-DD. */
  date: string
  startTime: string
  endTime: string
  subcalendarId: number | null
}

export interface PracticalClassUnit {
  classNumber: number
  /**
   * Wholly inside one booking: that booking.
   * Spans bookings: the booking where the class finishes. The signature
   * for a spanned class is stored on this event, and only for that class.
   */
  eventId: string
  unitIndex: number
  partIndex: number
  partCount: number
  bookingMinutes: number
  remainderMinutes: number
  odd: boolean
  /** True when the class uses hours from more than one booking. */
  spansBookings: boolean
  segments: ClassSegment[]
  /** "1h Oct 16 + 1h Oct 18". Null when the class is inside one booking. */
  spanLabel: string | null
  start: string
  end: string
  /** America/Toronto calendar day of the official start. YYYY-MM-DD. */
  date: string
  /** America/Toronto start, HH:mm. For a spanned class, the finishing booking. */
  startTime: string
  /** America/Toronto end, HH:mm. */
  endTime: string
  subcalendarId: number | null
  hours: 2
}

export interface OddPracticalBooking {
  eventId: string
  title: string
  start: string
  date: string
  durationMinutes: number
  countedClasses: number
  remainderMinutes: number
}

export interface UnitSignature {
  eventId: string
  /**
   * null is a legacy ClassSignature or LessonInstructorSignature.
   * It belongs to unit 0 only and is never copied forward.
   */
  unitIndex: number | null
  signatureDataUrl?: string | null
  signedAt?: string | null
  id?: string
}

export interface UnitSignOff extends UnitSignature {
  name?: string | null
  number?: string | null
}

export interface PracticalBookletRow {
  classNumber: number
  label: string
  when: string
  studentSignature: string | null
  instructorName: string | null
  instructorNo: string | null
  instructorSignature: string | null
  netLabel: string | null
  note: string | null
  /**
   * Counted in "N / 25". True when the class is signed or marked present.
   * Older rows omit it and count only when a signature is attached.
   */
  countsTowardTotal?: boolean
}

export function durationMinutes(start: string, end: string): number {
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return Math.round((b - a) / 60_000)
}

/** floor(duration / 2h). A non-zero remainder is odd and is not a class. */
export function splitPracticalDuration(minutes: number): {
  units: number
  remainderMinutes: number
  odd: boolean
} {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { units: 0, remainderMinutes: 0, odd: false }
  }
  const whole = Math.floor(minutes)
  const units = Math.floor(whole / PRACTICAL_CLASS_MINUTES)
  const remainderMinutes = whole % PRACTICAL_CLASS_MINUTES
  return { units, remainderMinutes, odd: remainderMinutes !== 0 }
}

export function isTruckPracticalTitle(title: string | null | undefined): boolean {
  return /^Truck Class\s+\d+/i.test((title || '').trim())
}

export function isCountablePracticalBooking(booking: PracticalBookingInput): boolean {
  if (!isTruckPracticalTitle(booking.title)) return false
  if (booking.cancelled) return false
  if (isCancelledClass(booking.title, booking.notes)) return false
  return true
}

function torontoParts(instant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
  let hour = get('hour')
  if (hour === '24') hour = '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}`,
  }
}

export function formatDurationHours(minutes: number): string {
  if (minutes <= 0) return '0h'
  if (minutes % 60 === 0) return `${minutes / 60}h`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours}h${String(rest).padStart(2, '0')}`
}

function friendlyDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[month - 1]} ${day}, ${year}`
}

export function oddBookingMessage(booking: OddPracticalBooking): string {
  const when = friendlyDate(booking.date)
  const length = formatDurationHours(booking.durationMinutes)
  return `A ${length} booking on ${when} is not a standard Class 1 length. Practical classes are 2 hours, and odd lengths are not supposed to happen.`
}

export function trailingLeftoverMessage(minutes: number): string {
  return `${formatSpanAmount(minutes)} is left over after the last booking and is not counted as a class.`
}

function shortMonthDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[month - 1]} ${day}`
}

export function formatSpanAmount(minutes: number): string {
  if (minutes <= 0) return '0m'
  if (minutes < 60) return `${minutes}m`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours}h${String(rest).padStart(2, '0')}`
}

export function formatSpanLabel(segments: Array<Pick<ClassSegment, 'minutes' | 'date'>>): string {
  return segments.map(segment => `${formatSpanAmount(segment.minutes)} ${shortMonthDay(segment.date)}`).join(' + ')
}

export function practicalClassKey(unit: Pick<PracticalClassUnit, 'eventId' | 'unitIndex' | 'spansBookings'>): string {
  return unit.spansBookings ? `${unit.eventId}:cross` : `${unit.eventId}:${unit.unitIndex}`
}

export function classCoverageNote(unit: Pick<PracticalClassUnit, 'spansBookings' | 'spanLabel' | 'partCount' | 'bookingMinutes'>): string | null {
  if (unit.spansBookings) return unit.spanLabel
  if (unit.partCount > 1) {
    return `covers ${unit.partCount} classes / ${formatDurationHours(unit.bookingMinutes)} session`
  }
  return null
}

export function bookingPartLabel(unit: Pick<PracticalClassUnit, 'partIndex' | 'partCount' | 'bookingMinutes'>): string | null {
  if (unit.partCount <= 1) return null
  return `${unit.partIndex} of ${unit.partCount} from a ${formatDurationHours(unit.bookingMinutes)} booking`
}

function segmentFrom(booking: PracticalBookingInput, offsetMinutes: number, lengthMinutes: number): ClassSegment & { startIso: string; endIso: string } {
  const startMs = new Date(booking.start).getTime() + offsetMinutes * 60_000
  const endMs = startMs + lengthMinutes * 60_000
  const startParts = torontoParts(new Date(startMs))
  const endParts = torontoParts(new Date(endMs))
  return {
    eventId: String(booking.id),
    minutes: lengthMinutes,
    date: startParts.date,
    startTime: startParts.time,
    endTime: endParts.time,
    subcalendarId: booking.subcalendarId ?? null,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  }
}

export function expandPracticalClasses(bookings: PracticalBookingInput[]): {
  classes: PracticalClassUnit[]
  oddBookings: OddPracticalBooking[]
  /** Minutes still unmatched after the last booking. Not a class. */
  trailingMinutes: number
} {
  const ordered = bookings
    .filter(isCountablePracticalBooking)
    .slice()
    .sort((a, b) => {
      const delta = new Date(a.start).getTime() - new Date(b.start).getTime()
      if (delta !== 0) return delta
      return String(a.id).localeCompare(String(b.id))
    })

  const classes: PracticalClassUnit[] = []
  const oddBookings: OddPracticalBooking[] = []
  const wholeIndex = new Map<string, number>()
  let classNumber = 0
  let carry: Array<ClassSegment & { startIso: string; endIso: string }> = []
  const carryMinutes = () => carry.reduce((total, segment) => total + segment.minutes, 0)

  const pushClass = (segments: Array<ClassSegment & { startIso: string; endIso: string }>, bookingMinutes: number, spans: boolean) => {
    const official = spans ? segments[segments.length - 1] : segments[0]
    const eventId = official.eventId
    const unitIndex = spans ? CROSS_BOOKING_UNIT : (wholeIndex.get(eventId) || 0)
    if (!spans) wholeIndex.set(eventId, unitIndex + 1)
    classNumber += 1
    classes.push({
      classNumber,
      eventId,
      unitIndex,
      partIndex: spans ? 1 : unitIndex + 1,
      partCount: 1,
      bookingMinutes,
      remainderMinutes: 0,
      odd: false,
      spansBookings: spans,
      segments: segments.map(({ startIso: _start, endIso: _end, ...segment }) => segment),
      spanLabel: spans ? formatSpanLabel(segments) : null,
      start: official.startIso,
      end: official.endIso,
      date: official.date,
      startTime: official.startTime,
      endTime: official.endTime,
      subcalendarId: official.subcalendarId,
      hours: 2,
    })
  }

  for (const booking of ordered) {
    const total = durationMinutes(booking.start, booking.end)
    if (total <= 0) continue
    const startMs = new Date(booking.start).getTime()
    if (total % PRACTICAL_CLASS_MINUTES !== 0) {
      oddBookings.push({
        eventId: String(booking.id),
        title: booking.title,
        start: booking.start,
        date: torontoParts(new Date(startMs)).date,
        durationMinutes: total,
        countedClasses: 0,
        remainderMinutes: total % PRACTICAL_CLASS_MINUTES,
      })
    }
    let offset = 0
    let available = total
    while (available > 0) {
      const pending = carryMinutes()
      if (pending > 0) {
        const need = PRACTICAL_CLASS_MINUTES - pending
        if (available >= need) {
          const piece = segmentFrom(booking, offset, need)
          pushClass([...carry, piece], total, true)
          carry = []
          offset += need
          available -= need
        } else {
          carry.push(segmentFrom(booking, offset, available))
          available = 0
        }
      } else if (available >= PRACTICAL_CLASS_MINUTES) {
        pushClass([segmentFrom(booking, offset, PRACTICAL_CLASS_MINUTES)], total, false)
        offset += PRACTICAL_CLASS_MINUTES
        available -= PRACTICAL_CLASS_MINUTES
      } else {
        carry.push(segmentFrom(booking, offset, available))
        available = 0
      }
    }
  }

  const wholeCount = new Map<string, number>()
  for (const unit of classes) {
    if (unit.spansBookings) continue
    wholeCount.set(unit.eventId, (wholeCount.get(unit.eventId) || 0) + 1)
  }
  for (const unit of classes) {
    if (unit.spansBookings) continue
    unit.partCount = wholeCount.get(unit.eventId) || 1
  }
  for (const odd of oddBookings) {
    odd.countedClasses = classes.filter(unit => !unit.spansBookings && unit.eventId === odd.eventId).length
  }

  return { classes, oddBookings, trailingMinutes: carryMinutes() }
}

/**
 * The drawing that covers this class, or null.
 * A booking-level signature (no unit) covers every class wholly inside
 * that booking. A spanned class uses only its own cross-booking row.
 */
export function signatureForClass<T extends UnitSignature>(
  unit: { eventId: string; unitIndex: number; spansBookings?: boolean },
  signatures: T[],
): T | null {
  const rows = signatures.filter(signature => String(signature.eventId) === String(unit.eventId))
  if (unit.spansBookings) {
    return rows.find(signature => signature.unitIndex === CROSS_BOOKING_UNIT) || null
  }
  return rows.find(signature => signature.unitIndex == null || signature.unitIndex === 0) || null
}

/** Bookings that supply this class. A spanned class lists every one of them. */
export function classBookingIds(unit: Pick<PracticalClassUnit, 'eventId' | 'spansBookings' | 'segments'>): string[] {
  if (unit.spansBookings && unit.segments.length > 0) {
    return [...new Set(unit.segments.map(segment => String(segment.eventId)))]
  }
  return [String(unit.eventId)]
}

function presentIdSet(presentEventIds: Iterable<string>): Set<string> {
  return presentEventIds instanceof Set
    ? presentEventIds
    : new Set(Array.from(presentEventIds, id => String(id)))
}

/**
 * True when every booking that supplies this class is marked present.
 * A class inside one booking needs that booking. A class that spans
 * bookings needs all of them — both, in the usual two-booking case.
 */
export function classMarkedPresent(
  unit: Pick<PracticalClassUnit, 'eventId' | 'spansBookings' | 'segments'>,
  presentEventIds: Iterable<string>,
): boolean {
  const present = presentIdSet(presentEventIds)
  const ids = classBookingIds(unit)
  return ids.length > 0 && ids.every(id => present.has(id))
}

/** Signed, or marked present under classMarkedPresent. Counted once either way. */
export function classCountsTowardTotal(
  unit: Pick<PracticalClassUnit, 'eventId' | 'unitIndex' | 'spansBookings' | 'segments'>,
  signatures: UnitSignature[],
  presentEventIds: Iterable<string> = [],
): boolean {
  return Boolean(signatureForClass(unit, signatures)) || classMarkedPresent(unit, presentEventIds)
}

/** A class has started. Upcoming bookings stay off the booklet. */
export function isPastPracticalClass(unit: Pick<PracticalClassUnit, 'start'>, now: Date = new Date()): boolean {
  const start = new Date(unit.start).getTime()
  return Number.isFinite(start) && start <= now.getTime()
}

export function affectedLongSignedBookings(
  bookings: PracticalBookingInput[],
  legacySignedEventIds: Iterable<string>,
): string[] {
  const signed = new Set(Array.from(legacySignedEventIds, id => String(id)))
  return bookings
    .filter(isCountablePracticalBooking)
    .filter(booking => signed.has(String(booking.id)))
    .filter(booking => durationMinutes(booking.start, booking.end) >= PRACTICAL_CLASS_MINUTES * 2)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map(booking => String(booking.id))
}

export interface PracticalSummary {
  classes: PracticalClassUnit[]
  oddBookings: OddPracticalBooking[]
  trailingMinutes: number
  signedCount: number
  /** Signed or marked present. This is the N in "N / 25 classes". */
  countedCount: number
  scheduledCount: number
  /** Signed classes × 2. Not capped. */
  signedHours: number
  /** Counted classes × 2. Not capped. */
  countedHours: number
  /** Counted hours used in the 125-hour program bar. Never above 50. */
  programHours: number
}

export function summarizePractical(
  bookings: PracticalBookingInput[],
  signatures: UnitSignature[],
  presentEventIds: Iterable<string> = [],
): PracticalSummary {
  const { classes, oddBookings, trailingMinutes } = expandPracticalClasses(bookings)
  const present = presentIdSet(presentEventIds)
  const signedCount = classes.filter(unit => signatureForClass(unit, signatures)).length
  const countedCount = classes.filter(unit => classCountsTowardTotal(unit, signatures, present)).length
  const signedHours = signedCount * CLASS1_PRACTICAL_CLASS_HOURS
  const countedHours = countedCount * CLASS1_PRACTICAL_CLASS_HOURS
  return {
    classes,
    oddBookings,
    trailingMinutes,
    signedCount,
    countedCount,
    scheduledCount: classes.length,
    signedHours,
    countedHours,
    programHours: Math.min(CLASS1_PRACTICAL_HOURS, countedHours),
  }
}

export function classTimingStatus(
  unit: Pick<PracticalClassUnit, 'start'>,
  signature: UnitSignature | null,
  now: Date = new Date(),
): 'signed' | 'scheduled' | 'unsigned' {
  if (signature?.signatureDataUrl || signature?.signedAt || signature?.id) return 'signed'
  if (new Date(unit.start).getTime() > now.getTime()) return 'scheduled'
  return 'unsigned'
}

export function bookletRowsFromClasses(input: {
  classes: PracticalClassUnit[]
  studentSignatures: UnitSignature[]
  instructorSignatures?: UnitSignOff[]
  /** Classes that start after this instant are upcoming and are omitted. */
  now?: Date
  presentEventIds?: Iterable<string>
}): PracticalBookletRow[] {
  const now = input.now ?? new Date()
  const present = input.presentEventIds || []
  return input.classes
    .filter(unit => isPastPracticalClass(unit, now))
    .slice()
    .sort((a, b) => a.classNumber - b.classNumber)
    .map(unit => {
      const student = signatureForClass(unit, input.studentSignatures)
      const instructor = signatureForClass(unit, input.instructorSignatures || [])
      return {
        classNumber: unit.classNumber,
        label: `Practical class ${unit.classNumber}`,
        when: formatBookletDateTime(unit.date, unit.startTime),
        studentSignature: student?.signatureDataUrl || null,
        instructorName: instructor?.name || null,
        instructorNo: instructor?.number ?? null,
        instructorSignature: instructor?.signatureDataUrl || null,
        netLabel: '2h00',
        note: classCoverageNote(unit),
        countsTowardTotal: classCountsTowardTotal(unit, input.studentSignatures, present),
      }
    })
}

export interface SignedLabelRow {
  eventId: string
  sessionLabel: string | null
  sortieNumber: number | null
  signatureDataUrl: string | null
  signedAt: Date | string
  scheduledStart?: string | null
  instructorName?: string | null
  instructorNo?: string | null
  instructorSignatureDataUrl?: string | null
  practicalUnitIndex?: number | null
}

function isPracticalLabel(row: SignedLabelRow): boolean {
  const label = row.sessionLabel || ''
  if (/^Class 1 Theory\s+\d+/i.test(label)) return false
  if (/^(?:Truck|Practical) Class\s+\d+/i.test(label)) return true
  return row.sortieNumber != null
}

/**
 * Booklet rows when the booking list is not available. Each saved practical
 * signature is one 2-hour class, in time order. Blank rows are not added
 * for classes that have not happened. A signature is still never copied
 * onto a second row.
 */
export function bookletRowsFromSignedLabels(rows: SignedLabelRow[]): PracticalBookletRow[] {
  const practical = rows.filter(isPracticalLabel).slice().sort((a, b) => {
    const aKey = a.scheduledStart || (a.signedAt instanceof Date ? a.signedAt.toISOString() : String(a.signedAt))
    const bKey = b.scheduledStart || (b.signedAt instanceof Date ? b.signedAt.toISOString() : String(b.signedAt))
    const byTime = aKey.localeCompare(bKey)
    if (byTime !== 0) return byTime
    return (a.practicalUnitIndex ?? 0) - (b.practicalUnitIndex ?? 0)
  })
  return practical.map((row, index) => {
    const classNumber = index + 1
    const when = row.scheduledStart?.trim()
      ? formatBookletDateTime(
        row.scheduledStart.trim().slice(0, 10),
        (row.scheduledStart.trim().match(/(\d{2}:\d{2})/) || [])[1] || '00:00',
      )
      : ''
    return {
      classNumber,
      label: `Practical class ${classNumber}`,
      when,
      studentSignature: row.signatureDataUrl,
      instructorName: row.instructorName || null,
      instructorNo: row.instructorNo ?? null,
      instructorSignature: row.instructorSignatureDataUrl || null,
      netLabel: '2h00',
      note: null,
      countsTowardTotal: true,
    }
  })
}

/** Contract sentence. 50 hours stays 50 hours, and states the 25 classes of 2 hours. */
export function formatPracticalContractHours(hours: number, lang: 'en' | 'fr'): string {
  const classes = Number.isInteger(hours) && hours > 0 && hours % CLASS1_PRACTICAL_CLASS_HOURS === 0
    ? hours / CLASS1_PRACTICAL_CLASS_HOURS
    : null
  if (lang === 'fr') {
    if (!classes) return `${hours} heures de formation pratique`
    return `${hours} heures de formation pratique (${classes} cours de ${CLASS1_PRACTICAL_CLASS_HOURS} heures)`
  }
  if (!classes) return `${hours} hours of practical training`
  const noun = classes === 1 ? 'class' : 'classes'
  return `${hours} hours of practical training (${classes} ${noun} of ${CLASS1_PRACTICAL_CLASS_HOURS} hours)`
}

/** The old profile: one card per booking, hours equal to the booking, title number kept. */
export function legacyPracticalCards(
  bookings: PracticalBookingInput[],
  legacySignedEventIds: Iterable<string>,
): Array<{ eventId: string; number: number | null; label: string; hours: number; signed: boolean; date: string }> {
  const signed = new Set(Array.from(legacySignedEventIds, id => String(id)))
  return bookings
    .filter(booking => isTruckPracticalTitle(booking.title))
    .filter(booking => !booking.cancelled && !isCancelledClass(booking.title, booking.notes))
    .slice()
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map(booking => {
      const match = booking.title.match(/^Truck Class\s+(\d+)/i)
      const number = match ? Number(match[1]) : null
      const minutes = durationMinutes(booking.start, booking.end)
      return {
        eventId: String(booking.id),
        number,
        label: number ? `Practical class ${number}` : 'Practical class',
        hours: Math.round((minutes / 60) * 10) / 10,
        signed: signed.has(String(booking.id)),
        date: torontoParts(new Date(booking.start)).date,
      }
    })
}
