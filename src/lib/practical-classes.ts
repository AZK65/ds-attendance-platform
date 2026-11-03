/**
 * Class 1 practical classes are 2 hours. The program is 25 classes (50 h).
 *
 * A Teamup booking that runs longer is several classes: floor(minutes / 120).
 * A 4 hour booking is 2 classes. A 6 hour booking is 3. A remainder (a 3 hour
 * booking leaves 1 hour) is flagged in the profile and the booklet. It is
 * not rounded into another class and it is not dropped silently.
 *
 * Carry-over for signatures that already exist
 * --------------------------------------------
 * ClassSignature is one drawing per booking per student. It has no unit.
 * That drawing attaches to the first 2-hour class of the booking only.
 * It is never copied onto a later class, never updated, and never deleted.
 * The later classes stay unsigned until the student signs that class.
 * The same rule applies to a LessonInstructorSignature on the booking:
 * it signs off the first class only.
 *
 * This is a decision for Ars. The alternative (copying the drawing onto
 * every class inside the booking) would put a signature on a class the
 * student did not sign.
 *
 * How many signed bookings of 4 hours or longer this affects cannot be
 * read from the schema. ClassSignature stores no start, no end, and no
 * duration. Those live on the Teamup event. affectedLongSignedBookings
 * is the rule; it needs the bookings and the signed event ids together.
 *
 * SAAQ practical attestations are uploaded files (kind "practical").
 * They are not recomputed from bookings. The contracted practical total
 * stays 50 hours, which is these 25 classes. The 125-hour program bar
 * caps practical credit at 50 hours.
 */

import { isCancelledClass } from '@/lib/car-class-gap'
import { formatBookletDateTime } from '@/lib/booklet-format'

export const PRACTICAL_CLASS_MINUTES = 120
export const CLASS1_PRACTICAL_CLASS_HOURS = 2
export const CLASS1_PRACTICAL_CLASS_COUNT = 25
export const CLASS1_PRACTICAL_HOURS = CLASS1_PRACTICAL_CLASS_COUNT * CLASS1_PRACTICAL_CLASS_HOURS

export interface PracticalBookingInput {
  id: string
  title: string
  start: string
  end: string
  notes?: string | null
  cancelled?: boolean
  subcalendarId?: number | null
}

export interface PracticalClassUnit {
  classNumber: number
  eventId: string
  unitIndex: number
  partIndex: number
  partCount: number
  bookingMinutes: number
  remainderMinutes: number
  odd: boolean
  start: string
  end: string
  /** America/Toronto calendar day, YYYY-MM-DD. */
  date: string
  /** America/Toronto start, HH:mm. */
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
  const leftover = formatDurationHours(booking.remainderMinutes)
  if (booking.countedClasses === 0) {
    return `A ${length} booking on ${when} is not a class. A practical class is 2 hours, and this leftover is flagged rather than rounded.`
  }
  const noun = booking.countedClasses === 1 ? 'class' : 'classes'
  return `A ${length} booking on ${when} counts as ${booking.countedClasses} ${noun} of 2 hours. ${leftover} is left over and is not a class.`
}

export function bookingPartLabel(unit: Pick<PracticalClassUnit, 'partIndex' | 'partCount' | 'bookingMinutes'>): string | null {
  if (unit.partCount <= 1) return null
  return `${unit.partIndex} of ${unit.partCount} from a ${formatDurationHours(unit.bookingMinutes)} booking`
}

export function expandPracticalClasses(bookings: PracticalBookingInput[]): {
  classes: PracticalClassUnit[]
  oddBookings: OddPracticalBooking[]
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
  let classNumber = 0

  for (const booking of ordered) {
    const minutes = durationMinutes(booking.start, booking.end)
    const split = splitPracticalDuration(minutes)
    const startMs = new Date(booking.start).getTime()
    if (split.odd) {
      oddBookings.push({
        eventId: String(booking.id),
        title: booking.title,
        start: booking.start,
        date: torontoParts(new Date(startMs)).date,
        durationMinutes: minutes,
        countedClasses: split.units,
        remainderMinutes: split.remainderMinutes,
      })
    }
    for (let unitIndex = 0; unitIndex < split.units; unitIndex += 1) {
      const sliceStart = new Date(startMs + unitIndex * PRACTICAL_CLASS_MINUTES * 60_000)
      const sliceEnd = new Date(sliceStart.getTime() + PRACTICAL_CLASS_MINUTES * 60_000)
      const startParts = torontoParts(sliceStart)
      const endParts = torontoParts(sliceEnd)
      classNumber += 1
      classes.push({
        classNumber,
        eventId: String(booking.id),
        unitIndex,
        partIndex: unitIndex + 1,
        partCount: split.units,
        bookingMinutes: minutes,
        remainderMinutes: split.remainderMinutes,
        odd: split.odd,
        start: sliceStart.toISOString(),
        end: sliceEnd.toISOString(),
        date: startParts.date,
        startTime: startParts.time,
        endTime: endParts.time,
        subcalendarId: booking.subcalendarId ?? null,
        hours: 2,
      })
    }
  }

  return { classes, oddBookings }
}

/**
 * The drawing for this 2-hour class, or null.
 * A legacy signature (unitIndex null) is the first class only.
 */
export function signatureForClass<T extends UnitSignature>(
  unit: { eventId: string; unitIndex: number },
  signatures: T[],
): T | null {
  const rows = signatures.filter(signature => String(signature.eventId) === String(unit.eventId))
  const explicit = rows.find(signature => signature.unitIndex === unit.unitIndex) || null
  if (unit.unitIndex !== 0) return explicit
  const legacy = rows.find(signature => signature.unitIndex == null) || null
  return legacy || explicit
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
  signedCount: number
  scheduledCount: number
  /** Signed classes × 2. Not capped. */
  signedHours: number
  /** Signed hours used in the 125-hour program bar. Never above 50. */
  programHours: number
}

export function summarizePractical(
  bookings: PracticalBookingInput[],
  signatures: UnitSignature[],
): PracticalSummary {
  const { classes, oddBookings } = expandPracticalClasses(bookings)
  const signedCount = classes.filter(unit => signatureForClass(unit, signatures)).length
  const signedHours = signedCount * CLASS1_PRACTICAL_CLASS_HOURS
  return {
    classes,
    oddBookings,
    signedCount,
    scheduledCount: classes.length,
    signedHours,
    programHours: Math.min(CLASS1_PRACTICAL_HOURS, signedHours),
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

function emptyBookletRow(classNumber: number): PracticalBookletRow {
  return {
    classNumber,
    label: `Practical class ${classNumber}`,
    when: '',
    studentSignature: null,
    instructorName: null,
    instructorNo: null,
    instructorSignature: null,
    netLabel: '2h00',
    note: null,
  }
}

export function bookletRowsFromClasses(input: {
  classes: PracticalClassUnit[]
  studentSignatures: UnitSignature[]
  instructorSignatures?: UnitSignOff[]
  target?: number
}): PracticalBookletRow[] {
  const target = input.target ?? CLASS1_PRACTICAL_CLASS_COUNT
  const byNumber = new Map(input.classes.map(unit => [unit.classNumber, unit]))
  const highest = input.classes.reduce((max, unit) => Math.max(max, unit.classNumber), 0)
  const count = Math.max(target, highest)
  const rows: PracticalBookletRow[] = []
  for (let classNumber = 1; classNumber <= count; classNumber += 1) {
    const unit = byNumber.get(classNumber)
    if (!unit) {
      rows.push(emptyBookletRow(classNumber))
      continue
    }
    const student = signatureForClass(unit, input.studentSignatures)
    const instructor = signatureForClass(unit, input.instructorSignatures || [])
    const leftover = unit.odd && unit.unitIndex === unit.partCount - 1
      ? `${formatDurationHours(unit.remainderMinutes)} left over from a ${formatDurationHours(unit.bookingMinutes)} booking`
      : null
    rows.push({
      classNumber,
      label: `Practical class ${classNumber}`,
      when: formatBookletDateTime(unit.date, unit.startTime),
      studentSignature: student?.signatureDataUrl || null,
      instructorName: instructor?.name || null,
      instructorNo: instructor?.number ?? null,
      instructorSignature: instructor?.signatureDataUrl || null,
      netLabel: '2h00',
      note: leftover,
    })
  }
  return rows
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
 * signature is one 2-hour class, in time order. Empty rows fill the grid
 * out to 25. A signature is still never copied onto a second row.
 */
export function bookletRowsFromSignedLabels(rows: SignedLabelRow[], target = CLASS1_PRACTICAL_CLASS_COUNT): PracticalBookletRow[] {
  const practical = rows.filter(isPracticalLabel).slice().sort((a, b) => {
    const aKey = a.scheduledStart || (a.signedAt instanceof Date ? a.signedAt.toISOString() : String(a.signedAt))
    const bKey = b.scheduledStart || (b.signedAt instanceof Date ? b.signedAt.toISOString() : String(b.signedAt))
    const byTime = aKey.localeCompare(bKey)
    if (byTime !== 0) return byTime
    return (a.practicalUnitIndex ?? 0) - (b.practicalUnitIndex ?? 0)
  })
  const placed = new Map<number, PracticalBookletRow>()
  practical.forEach((row, index) => {
    const classNumber = index + 1
    const when = row.scheduledStart?.trim()
      ? formatBookletDateTime(
        row.scheduledStart.trim().slice(0, 10),
        (row.scheduledStart.trim().match(/(\d{2}:\d{2})/) || [])[1] || '00:00',
      )
      : ''
    placed.set(classNumber, {
      classNumber,
      label: `Practical class ${classNumber}`,
      when,
      studentSignature: row.signatureDataUrl,
      instructorName: row.instructorName || null,
      instructorNo: row.instructorNo ?? null,
      instructorSignature: row.instructorSignatureDataUrl || null,
      netLabel: '2h00',
      note: null,
    })
  })
  const count = Math.max(target, placed.size)
  const out: PracticalBookletRow[] = []
  for (let classNumber = 1; classNumber <= count; classNumber += 1) {
    out.push(placed.get(classNumber) || emptyBookletRow(classNumber))
  }
  return out
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
