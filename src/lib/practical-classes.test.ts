import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { CLASS1_PRACTICAL_MINUTES } from './theory-hours'
import { DEFAULT_TRUCK_CONTRACT } from './pricing'
import { buildSignatureAttendancePdf } from './signature-attendance-pdf'
import {
  SAMPLE_CANCELLED_BOOKING,
  SAMPLE_INSTRUCTOR_SIGNOFFS,
  SAMPLE_LEGACY_SIGNATURES,
  SAMPLE_ODD_BOOKING,
  SAMPLE_PROFILE_BOOKINGS,
  SAMPLE_SIGNATURE_PNG,
  SAMPLE_SIGNED_BOOKING_IDS,
  SAMPLE_THIRTEEN_BOOKINGS,
} from './practical-class-sample'
import {
  CLASS1_PRACTICAL_CLASS_COUNT,
  CLASS1_PRACTICAL_HOURS,
  CROSS_BOOKING_UNIT,
  affectedLongSignedBookings,
  bookletRowsFromClasses,
  classMarkedPresent,
  durationMinutes,
  expandPracticalClasses,
  formatPracticalContractHours,
  isPastPracticalClass,
  legacyPracticalCards,
  signatureForClass,
  splitPracticalDuration,
  summarizePractical,
} from './practical-classes'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dbDir = mkdtempSync(path.join(tmpdir(), 'practical-classes-'))
closeSync(openSync(path.join(dbDir, 'test.db'), 'w'))
process.env.DATABASE_URL = `file:${path.join(dbDir, 'test.db')}`

const OTHER_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PHONE = '5145550177'

let prisma: typeof import('./db').prisma
let signPost: (request: NextRequest) => Promise<Response>
let instructorPost: (request: NextRequest) => Promise<Response>

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function pdftotext(bytes: Buffer): string | null {
  try {
    const dir = mkdtempSync(path.join(tmpdir(), 'practical-pdf-'))
    const file = path.join(dir, 'booklet.pdf')
    writeFileSync(file, bytes)
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' })
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw error
  }
}

before(async () => {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })
  prisma = (await import('./db')).prisma
  signPost = (await import('../app/api/scheduling/signature/route')).POST
  instructorPost = (await import('../app/api/scheduling/instructor-signature/route')).POST
})

test('a practical class is 2 hours, and longer bookings split without rounding', () => {
  assert.equal(CLASS1_PRACTICAL_CLASS_COUNT, 25)
  assert.equal(CLASS1_PRACTICAL_HOURS, 50)
  assert.equal(CLASS1_PRACTICAL_MINUTES, CLASS1_PRACTICAL_HOURS * 60)
  assert.equal(DEFAULT_TRUCK_CONTRACT.practicalHours, CLASS1_PRACTICAL_HOURS)
  assert.deepEqual(splitPracticalDuration(120), { units: 1, remainderMinutes: 0, odd: false })
  assert.deepEqual(splitPracticalDuration(240), { units: 2, remainderMinutes: 0, odd: false })
  assert.deepEqual(splitPracticalDuration(360), { units: 3, remainderMinutes: 0, odd: false })
  assert.deepEqual(splitPracticalDuration(180), { units: 1, remainderMinutes: 60, odd: true })
  assert.deepEqual(splitPracticalDuration(60), { units: 0, remainderMinutes: 60, odd: true })
  assert.equal(formatPracticalContractHours(50, 'en'), '50 hours of practical training (25 classes of 2 hours)')
  assert.equal(formatPracticalContractHours(50, 'fr'), '50 heures de formation pratique (25 cours de 2 heures)')
})

test('thirteen mixed bookings become 20 classes of 2 hours, numbered in date order', () => {
  const { classes, oddBookings } = expandPracticalClasses(SAMPLE_THIRTEEN_BOOKINGS)
  assert.equal(classes.length, 20)
  assert.equal(oddBookings.length, 0)
  assert.deepEqual(classes.map(unit => unit.classNumber), Array.from({ length: 20 }, (_, index) => index + 1))
  assert.equal(classes[0].eventId, 'booking-1')
  assert.equal(classes[0].unitIndex, 0)
  assert.equal(classes[0].startTime, '09:00')
  assert.equal(classes[0].endTime, '11:00')
  assert.equal(classes[1].eventId, 'booking-1')
  assert.equal(classes[1].unitIndex, 1)
  assert.equal(classes[1].startTime, '11:00')
  assert.equal(classes[1].endTime, '13:00')
  assert.equal(classes[2].eventId, 'booking-2')
  assert.equal(classes[2].partCount, 1)
  assert.ok(classes.every(unit => unit.hours === 2))
  assert.equal(durationMinutes(SAMPLE_THIRTEEN_BOOKINGS[0].start, SAMPLE_THIRTEEN_BOOKINGS[0].end), 240)
})

test('a cancelled booking is skipped and an odd duration is flagged', () => {
  const { classes, oddBookings } = expandPracticalClasses([
    SAMPLE_CANCELLED_BOOKING,
    ...SAMPLE_THIRTEEN_BOOKINGS,
    SAMPLE_ODD_BOOKING,
  ])
  assert.equal(classes.length, 21)
  assert.ok(classes.every(unit => unit.eventId !== SAMPLE_CANCELLED_BOOKING.id))
  assert.equal(classes[0].classNumber, 1)
  assert.equal(classes[0].eventId, 'booking-1')
  assert.equal(oddBookings.length, 1)
  assert.equal(oddBookings[0].eventId, 'booking-odd')
  assert.equal(oddBookings[0].countedClasses, 1)
  assert.equal(oddBookings[0].remainderMinutes, 60)
  const oddClass = classes.find(unit => unit.eventId === 'booking-odd')
  assert.ok(oddClass)
  assert.equal(oddClass.hours, 2)
  assert.equal(oddClass.startTime, '09:00')
  assert.equal(oddClass.endTime, '11:00')
  assert.equal(expandPracticalClasses([SAMPLE_ODD_BOOKING]).trailingMinutes, 60)
})

test('one signature on a 4h booking covers both classes, by reference', () => {
  const summary = summarizePractical(SAMPLE_PROFILE_BOOKINGS, SAMPLE_LEGACY_SIGNATURES)
  assert.equal(summary.classes.length, 23)
  assert.equal(summary.signedCount, 10)
  assert.equal(summary.countedCount, 10)
  assert.equal(summary.signedHours, 20)
  assert.equal(summary.countedHours, 20)
  assert.equal(summary.programHours, 20)
  for (const eventId of SAMPLE_SIGNED_BOOKING_IDS) {
    const units = summary.classes.filter(unit => unit.eventId === eventId && !unit.spansBookings)
    assert.equal(units.length, 2)
    const first = signatureForClass(units[0], SAMPLE_LEGACY_SIGNATURES)
    const second = signatureForClass(units[1], SAMPLE_LEGACY_SIGNATURES)
    assert.equal(first?.signatureDataUrl, SAMPLE_SIGNATURE_PNG)
    assert.equal(second, first)
  }
  const legacy = legacyPracticalCards(SAMPLE_THIRTEEN_BOOKINGS, SAMPLE_SIGNED_BOOKING_IDS)
  assert.equal(legacy.length, 13)
  assert.equal(legacy.filter(card => card.signed).length, 5)
  assert.equal(legacy.filter(card => card.signed).reduce((total, card) => total + card.hours, 0), 20)
})

test('the affected-booking rule counts signed bookings of 4 hours or longer', () => {
  const affected = affectedLongSignedBookings(SAMPLE_PROFILE_BOOKINGS, [
    ...SAMPLE_SIGNED_BOOKING_IDS,
    'booking-2',
    'booking-cancelled',
    'booking-odd',
  ])
  assert.deepEqual(affected, SAMPLE_SIGNED_BOOKING_IDS)
  assert.equal(affected.length, 5)
})

test('the booklet lists past classes of 2 hours and does not copy a signature', () => {
  const now = new Date('2026-11-05T15:00:00-05:00')
  const summary = summarizePractical(SAMPLE_THIRTEEN_BOOKINGS, SAMPLE_LEGACY_SIGNATURES)
  const rows = bookletRowsFromClasses({
    classes: summary.classes,
    studentSignatures: SAMPLE_LEGACY_SIGNATURES,
    instructorSignatures: SAMPLE_INSTRUCTOR_SIGNOFFS,
    now,
  })
  assert.equal(rows.length, 20)
  assert.deepEqual(rows.map(row => row.classNumber), Array.from({ length: 20 }, (_, index) => index + 1))
  assert.ok(rows.every(row => row.netLabel === '2h00'))
  assert.equal(rows.filter(row => row.studentSignature).length, 10)
  assert.equal(rows.filter(row => row.countsTowardTotal).length, 10)
  assert.equal(rows[0].studentSignature, SAMPLE_SIGNATURE_PNG)
  assert.equal(rows[0].instructorSignature, SAMPLE_SIGNATURE_PNG)
  assert.equal(rows[1].studentSignature, rows[0].studentSignature)
  assert.equal(rows[1].instructorSignature, rows[0].instructorSignature)
  assert.match(rows[0].note || '', /covers 2 classes \/ 4h session/)
  assert.equal(rows[1].label, 'Practical class 2')
  assert.match(rows[0].when, /Sep 2, 2026, 9:00 a\.m\./)
  assert.match(rows[1].when, /Sep 2, 2026, 11:00 a\.m\./)
})

test('the Class 1 booklet keeps separate counts and does not print an instructor signed-on date', async () => {
  const summary = summarizePractical(SAMPLE_THIRTEEN_BOOKINGS, SAMPLE_LEGACY_SIGNATURES)
  const pdf = await buildSignatureAttendancePdf({
    studentName: 'Manpreet Kaur',
    phone: '514-555-0177',
    isTruck: true,
    signatures: [],
    practicalRows: bookletRowsFromClasses({
      classes: summary.classes,
      studentSignatures: SAMPLE_LEGACY_SIGNATURES,
      instructorSignatures: SAMPLE_INSTRUCTOR_SIGNOFFS,
      now: new Date('2026-11-05T15:00:00-05:00'),
    }),
    theory: {
      hoursLineEn: 'Total: 7h30 / 75 h — 1 / 15 classes.',
      hoursLineFr: 'Total : 7h30 / 75 h — 1 / 15 cours.',
      instructorLineEn: '',
      instructorLineFr: '',
      headerInstructor: { bookletName: 'Abdul Rahman Ahmed Qazi', saaqInstructorNo: null },
      attendedCount: 1,
      requiredSessions: 15,
      sessions: [{
        sessionNumber: 1,
        date: '2026-08-04',
        startTime: '17:30',
        endTime: '21:30',
        netLabel: '3h45',
        displayEn: 'Signed',
        displayFr: 'Signé',
        basis: 'signature',
        signatureDataUrl: SAMPLE_SIGNATURE_PNG,
        signedAt: '2026-08-04T21:30:00-04:00',
        instructorName: 'Abdul Rahman Ahmed Qazi',
        instructorNo: null,
        instructorSignatureDataUrl: SAMPLE_SIGNATURE_PNG,
        instructorSignedOn: 'Oct 28, 2026',
      }],
    },
  })
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  const text = pdftotext(Buffer.from(pdf))
  assert.ok(text, 'pdftotext is required to check the booklet')
  assert.match(text, /1 theory · 10 practical/)
  assert.match(text, /10 \/ 25 classes/)
  assert.match(text, /covers 2/)
  assert.match(text, /50 hours required/)
  assert.match(text, /Practical class 1/)
  assert.match(text, /Practical class 20/)
  assert.doesNotMatch(text, /Practical class 21/)
  assert.doesNotMatch(text, /Practical class 25/)
  assert.match(text, /2h00/)
  assert.doesNotMatch(text, /signed on/i)
  assert.doesNotMatch(text, /Oct 28, 2026/)
  assert.equal(text.includes('6 theory'), false)
})

function truck(id: string, start: string, end: string, subcalendarId: number | null = null) {
  return { id, title: 'Truck Class 1 (Auto) - Test', start, end, subcalendarId }
}

test('a present booking counts every class inside it, and a spanned class needs both bookings or its own signature', () => {
  const four = summarizePractical([
    truck('long', '2026-09-02T09:00:00-04:00', '2026-09-02T13:00:00-04:00'),
  ], [], ['long'])
  assert.equal(four.classes.length, 2)
  assert.equal(four.signedCount, 0)
  assert.equal(four.countedCount, 2)
  assert.equal(four.countedHours, 4)
  assert.ok(four.classes.every(unit => classMarkedPresent(unit, ['long'])))

  const pair = [
    truck('a', '2026-10-16T09:00:00-04:00', '2026-10-16T12:00:00-04:00'),
    truck('b', '2026-10-18T09:00:00-04:00', '2026-10-18T12:00:00-04:00'),
  ]
  const none = summarizePractical(pair, [])
  assert.equal(none.classes.length, 3)
  assert.equal(none.countedCount, 0)
  assert.equal(none.programHours, 0)

  const firstOnly = summarizePractical(pair, [], ['a'])
  assert.equal(firstOnly.countedCount, 1)
  assert.equal(classMarkedPresent(firstOnly.classes[0], ['a']), true)
  assert.equal(classMarkedPresent(firstOnly.classes[1], ['a']), false)
  assert.equal(classMarkedPresent(firstOnly.classes[2], ['a']), false)

  const both = summarizePractical(pair, [], ['a', 'b'])
  assert.equal(both.signedCount, 0)
  assert.equal(both.countedCount, 3)
  assert.equal(both.countedHours, 6)
  assert.equal(both.programHours, 6)
  assert.equal(classMarkedPresent(both.classes[1], ['a', 'b']), true)

  const spanSigned = summarizePractical(pair, [{
    eventId: 'b',
    unitIndex: CROSS_BOOKING_UNIT,
    signatureDataUrl: 'SPAN',
  }])
  assert.equal(spanSigned.signedCount, 1)
  assert.equal(spanSigned.countedCount, 1)
  assert.equal(classMarkedPresent(spanSigned.classes[1], []), false)

  const withPresent = summarizePractical(SAMPLE_PROFILE_BOOKINGS, SAMPLE_LEGACY_SIGNATURES, ['booking-2', 'booking-4'])
  assert.equal(withPresent.signedCount, 10)
  assert.equal(withPresent.countedCount, 12)
  assert.equal(withPresent.countedHours, 24)
  assert.equal(withPresent.programHours, 24)

  const cancelledPresent = summarizePractical(
    [SAMPLE_CANCELLED_BOOKING, ...pair],
    [],
    [SAMPLE_CANCELLED_BOOKING.id, 'a', 'b'],
  )
  assert.ok(cancelledPresent.classes.every(unit => unit.eventId !== SAMPLE_CANCELLED_BOOKING.id))
  assert.equal(cancelledPresent.countedCount, 3)

  const many = Array.from({ length: 30 }, (_, index) => truck(
    `p${index}`,
    `2026-01-${String((index % 27) + 1).padStart(2, '0')}T09:00:00-05:00`,
    `2026-01-${String((index % 27) + 1).padStart(2, '0')}T11:00:00-05:00`,
  ))
  const capped = summarizePractical(many, [], many.map(booking => booking.id))
  assert.equal(capped.countedCount, 30)
  assert.equal(capped.countedHours, 60)
  assert.equal(capped.programHours, CLASS1_PRACTICAL_HOURS)

  const odd = summarizePractical([SAMPLE_ODD_BOOKING], [], [SAMPLE_ODD_BOOKING.id])
  assert.equal(odd.classes.length, 1)
  assert.equal(odd.trailingMinutes, 60)
  assert.equal(odd.countedCount, 1)
  const hour = summarizePractical([
    truck('hour', '2026-10-06T09:00:00-04:00', '2026-10-06T10:00:00-04:00'),
  ], [], ['hour'])
  assert.equal(hour.classes.length, 0)
  assert.equal(hour.countedCount, 0)
})

test('the booklet keeps past class numbers and drops upcoming bookings', () => {
  const now = new Date('2026-11-05T15:00:00-05:00')
  const future = truck('future', '2026-12-02T09:00:00-05:00', '2026-12-02T11:00:00-05:00')
  const summary = summarizePractical(
    [...SAMPLE_THIRTEEN_BOOKINGS, future],
    SAMPLE_LEGACY_SIGNATURES,
    ['booking-2', 'booking-4'],
  )
  assert.equal(summary.classes.length, 21)
  assert.equal(summary.countedCount, 12)
  assert.equal(isPastPracticalClass(summary.classes[0], now), true)
  assert.equal(isPastPracticalClass(summary.classes[20], now), false)
  const rows = bookletRowsFromClasses({
    classes: summary.classes,
    studentSignatures: SAMPLE_LEGACY_SIGNATURES,
    instructorSignatures: SAMPLE_INSTRUCTOR_SIGNOFFS,
    presentEventIds: ['booking-2', 'booking-4'],
    now,
  })
  assert.equal(rows.length, 20)
  assert.equal(rows[0].classNumber, 1)
  assert.equal(rows[19].classNumber, 20)
  assert.equal(rows.some(row => row.classNumber > 20), false)
  assert.match(rows[0].when, /Sep 2, 2026/)
  assert.equal(rows.filter(row => row.countsTowardTotal).length, 12)
  const unsignedPresent = rows.find(row => row.classNumber === 3)
  assert.equal(unsignedPresent?.studentSignature, null)
  assert.equal(unsignedPresent?.countsTowardTotal, true)
})

function theorySessions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    sessionNumber: index + 1,
    date: `2026-08-${String((index % 27) + 1).padStart(2, '0')}`,
    startTime: '17:30',
    endTime: '21:30',
    netLabel: '3h45',
    displayEn: 'Signed',
    displayFr: 'Signé',
    basis: 'signature',
    signatureDataUrl: SAMPLE_SIGNATURE_PNG,
    signedAt: '2026-08-04T21:30:00-04:00',
    instructorName: 'Abdul Rahman Ahmed Qazi',
    instructorNo: null,
    instructorSignatureDataUrl: SAMPLE_SIGNATURE_PNG,
    instructorSignedOn: 'Oct 28, 2026',
  }))
}

test('the practical heading stays on the same page as its first rows', async () => {
  const now = new Date('2026-11-05T15:00:00-05:00')
  const summary = summarizePractical(
    [...SAMPLE_THIRTEEN_BOOKINGS, truck('future', '2026-12-02T09:00:00-05:00', '2026-12-02T11:00:00-05:00')],
    SAMPLE_LEGACY_SIGNATURES,
    ['booking-2', 'booking-4'],
  )
  const rows = bookletRowsFromClasses({
    classes: summary.classes,
    studentSignatures: SAMPLE_LEGACY_SIGNATURES,
    instructorSignatures: SAMPLE_INSTRUCTOR_SIGNOFFS,
    presentEventIds: ['booking-2', 'booking-4'],
    now,
  })
  for (const theoryCount of [8, 12, 14, 16, 18]) {
    const pdf = await buildSignatureAttendancePdf({
      studentName: 'Manpreet Kaur',
      phone: '514-555-0177',
      isTruck: true,
      signatures: [],
      practicalRows: rows,
      theory: {
        hoursLineEn: 'Total: 7h30 / 75 h — 1 / 15 classes.',
        hoursLineFr: 'Total : 7h30 / 75 h — 1 / 15 cours.',
        instructorLineEn: '',
        instructorLineFr: '',
        headerInstructor: { bookletName: 'Abdul Rahman Ahmed Qazi', saaqInstructorNo: null },
        attendedCount: 1,
        requiredSessions: 15,
        sessions: theorySessions(theoryCount),
      },
    })
    const text = pdftotext(Buffer.from(pdf))
    assert.ok(text, 'pdftotext is required to check the booklet')
    const pages = text.split('\f').filter(page => page.includes('Practical training'))
    assert.ok(pages.length >= 1, `no practical heading with ${theoryCount} theory classes`)
    for (const page of pages) {
      assert.match(page, /Practical class 1/, `heading split from its first row with ${theoryCount} theory classes`)
      assert.match(page, /Student signature/)
    }
    assert.match(text, new RegExp(`${theoryCount} theory · 12 practical`))
    assert.match(text, /12 \/ 25 classes/)
    assert.match(text, /50 hours required/)
    assert.doesNotMatch(text, /Dec 2, 2026/)
    assert.doesNotMatch(text, /Practical class 21/)
    assert.doesNotMatch(text, /signed on/i)
    assert.doesNotMatch(text, /Oct 28, 2026/)
  }
})

test('leftover hours carry into the next booking, and a final leftover is not a class', () => {
  const pair = expandPracticalClasses([
    truck('a', '2026-10-16T09:00:00-04:00', '2026-10-16T12:00:00-04:00', 1),
    truck('b', '2026-10-18T09:00:00-04:00', '2026-10-18T12:00:00-04:00', 2),
  ])
  assert.equal(pair.classes.length, 3)
  assert.equal(pair.trailingMinutes, 0)
  assert.equal(pair.oddBookings.length, 2)
  assert.equal(pair.classes[0].spansBookings, false)
  assert.equal(pair.classes[0].eventId, 'a')
  assert.equal(pair.classes[0].startTime, '09:00')
  assert.equal(pair.classes[0].endTime, '11:00')
  assert.equal(pair.classes[1].spansBookings, true)
  assert.equal(pair.classes[1].spanLabel, '1h Oct 16 + 1h Oct 18')
  assert.equal(pair.classes[1].date, '2026-10-18')
  assert.equal(pair.classes[1].startTime, '09:00')
  assert.equal(pair.classes[1].endTime, '10:00')
  assert.equal(pair.classes[1].eventId, 'b')
  assert.equal(pair.classes[1].subcalendarId, 2)
  assert.equal(pair.classes[2].spansBookings, false)
  assert.equal(pair.classes[2].startTime, '10:00')
  assert.equal(pair.classes[2].endTime, '12:00')
  const drawings = [
    { eventId: 'a', unitIndex: null, signatureDataUrl: 'FIRST' },
    { eventId: 'b', unitIndex: null, signatureDataUrl: 'SECOND' },
  ]
  assert.equal(signatureForClass(pair.classes[0], drawings)?.signatureDataUrl, 'FIRST')
  assert.equal(signatureForClass(pair.classes[1], drawings), null)
  assert.equal(signatureForClass(pair.classes[2], drawings)?.signatureDataUrl, 'SECOND')

  const chain = expandPracticalClasses([
    truck('p', '2026-10-01T09:00:00-04:00', '2026-10-01T12:00:00-04:00'),
    truck('q', '2026-10-02T09:00:00-04:00', '2026-10-02T11:00:00-04:00'),
    truck('r', '2026-10-03T09:00:00-04:00', '2026-10-03T12:00:00-04:00'),
  ])
  assert.equal(chain.classes.length, 4)
  assert.equal(chain.trailingMinutes, 0)
  assert.equal(chain.classes[1].spanLabel, '1h Oct 1 + 1h Oct 2')
  assert.equal(chain.classes[1].date, '2026-10-02')
  assert.equal(chain.classes[2].spanLabel, '1h Oct 2 + 1h Oct 3')
  assert.equal(chain.classes[2].date, '2026-10-03')
  assert.equal(chain.classes[2].eventId, 'r')
  assert.equal(chain.classes[3].eventId, 'r')
  assert.equal(chain.classes[3].startTime, '10:00')
  assert.equal(chain.classes[3].endTime, '12:00')
  assert.equal(chain.classes[3].spansBookings, false)

  const hour = expandPracticalClasses([
    truck('h1', '2026-10-04T09:00:00-04:00', '2026-10-04T10:00:00-04:00'),
    truck('h2', '2026-10-05T13:00:00-04:00', '2026-10-05T14:00:00-04:00'),
  ])
  assert.equal(hour.classes.length, 1)
  assert.equal(hour.trailingMinutes, 0)
  assert.equal(hour.classes[0].spanLabel, '1h Oct 4 + 1h Oct 5')
  assert.equal(hour.classes[0].startTime, '13:00')
  assert.equal(hour.classes[0].date, '2026-10-05')

  const alone = expandPracticalClasses([
    truck('solo', '2026-10-06T09:00:00-04:00', '2026-10-06T10:00:00-04:00'),
  ])
  assert.equal(alone.classes.length, 0)
  assert.equal(alone.trailingMinutes, 60)
  assert.equal(alone.oddBookings.length, 1)

  const partial = expandPracticalClasses([
    truck('m', '2026-10-07T09:00:00-04:00', '2026-10-07T10:30:00-04:00'),
    truck('n', '2026-10-08T09:00:00-04:00', '2026-10-08T10:30:00-04:00'),
  ])
  assert.equal(partial.classes.length, 1)
  assert.equal(partial.classes[0].spanLabel, '1h30 Oct 7 + 30m Oct 8')
  assert.equal(partial.trailingMinutes, 60)
})

test('a later 2-hour class is signed by itself and a second signature is rejected', async () => {
  await prisma.classSignature.create({
    data: {
      eventId: 'booking-1',
      studentPhone: PHONE,
      studentName: 'Manpreet Kaur',
      sessionLabel: 'Truck Class 1 (Auto)',
      signatureDataUrl: SAMPLE_SIGNATURE_PNG,
      signedAt: new Date('2026-09-02T13:05:00-04:00'),
    },
  })
  const legacyBefore = await prisma.classSignature.findUniqueOrThrow({
    where: { eventId_studentPhone: { eventId: 'booking-1', studentPhone: PHONE } },
  })

  const first = await signPost(post('http://localhost/api/scheduling/signature', {
    eventId: 'booking-1',
    studentPhone: PHONE,
    studentName: 'Manpreet Kaur',
    signatureDataUrl: OTHER_PNG,
    sessionLabel: 'Practical class 2',
    practicalUnitIndex: 1,
  }))
  assert.equal(first.status, 409)

  const legacyAfter = await prisma.classSignature.findUniqueOrThrow({
    where: { eventId_studentPhone: { eventId: 'booking-1', studentPhone: PHONE } },
  })
  assert.equal(legacyAfter.signatureDataUrl, SAMPLE_SIGNATURE_PNG)
  assert.equal(legacyAfter.signedAt.toISOString(), legacyBefore.signedAt.toISOString())
  assert.equal(await prisma.practicalClassUnitSignature.count({ where: { eventId: 'booking-1' } }), 0)

  const spanned = await signPost(post('http://localhost/api/scheduling/signature', {
    eventId: 'booking-span',
    studentPhone: PHONE,
    studentName: 'Manpreet Kaur',
    signatureDataUrl: OTHER_PNG,
    sessionLabel: 'Practical class span',
    practicalUnitIndex: CROSS_BOOKING_UNIT,
    crossBooking: true,
  }))
  assert.equal(spanned.status, 200)
  const spanAgain = await signPost(post('http://localhost/api/scheduling/signature', {
    eventId: 'booking-span',
    studentPhone: PHONE,
    studentName: 'Manpreet Kaur',
    signatureDataUrl: SAMPLE_SIGNATURE_PNG,
    practicalUnitIndex: CROSS_BOOKING_UNIT,
    crossBooking: true,
  }))
  assert.equal(spanAgain.status, 409)
  const slices = await prisma.practicalClassUnitSignature.findMany({ where: { eventId: 'booking-span' } })
  assert.equal(slices.length, 1)
  assert.equal(slices[0].unitIndex, CROSS_BOOKING_UNIT)
  assert.equal(slices[0].signatureDataUrl, OTHER_PNG)
  assert.equal(await prisma.classSignature.count({ where: { eventId: 'booking-span' } }), 0)

  const blockedFirst = await signPost(post('http://localhost/api/scheduling/signature', {
    eventId: 'booking-1',
    studentPhone: PHONE,
    studentName: 'Someone Else',
    signatureDataUrl: OTHER_PNG,
    practicalUnitIndex: 0,
  }))
  assert.equal(blockedFirst.status, 409)
  assert.equal(legacyAfter.signatureDataUrl, (await prisma.classSignature.findUniqueOrThrow({
    where: { eventId_studentPhone: { eventId: 'booking-1', studentPhone: PHONE } },
  })).signatureDataUrl)
})

test('instructor sign-off on the second class requires that class signature and cannot be repeated', async () => {
  const instructor = await prisma.instructor.create({
    data: {
      legalName: 'Abdul Rahman Ahmed Qazi',
      bookletName: 'Abdul Rahman Ahmed Qazi',
      displayName: 'Ahmed',
      saaqInstructorNo: null,
      teamupSubcalendarId: 15664319,
    },
  })
  const missing = await instructorPost(post('http://localhost/api/scheduling/instructor-signature', {
    eventId: 'booking-2',
    studentPhones: [PHONE],
    signatureDataUrl: OTHER_PNG,
    instructorId: instructor.id,
    practicalUnitIndex: CROSS_BOOKING_UNIT,
    crossBooking: true,
    addedLater: true,
  }))
  assert.equal(missing.status, 400)

  await prisma.practicalClassUnitSignature.create({
    data: {
      eventId: 'booking-2',
      studentPhone: PHONE,
      unitIndex: CROSS_BOOKING_UNIT,
      studentName: 'Manpreet Kaur',
      sessionLabel: 'Practical class',
      signatureDataUrl: OTHER_PNG,
    },
  })
  const saved = await instructorPost(post('http://localhost/api/scheduling/instructor-signature', {
    eventId: 'booking-2',
    studentPhones: [PHONE],
    signatureDataUrl: SAMPLE_SIGNATURE_PNG,
    instructorId: instructor.id,
    practicalUnitIndex: CROSS_BOOKING_UNIT,
    crossBooking: true,
    lessonStartAt: '2026-09-04 11:00',
    addedLater: true,
  }))
  assert.equal(saved.status, 200)
  const repeat = await instructorPost(post('http://localhost/api/scheduling/instructor-signature', {
    eventId: 'booking-2',
    studentPhones: [PHONE],
    signatureDataUrl: OTHER_PNG,
    instructorId: instructor.id,
    practicalUnitIndex: CROSS_BOOKING_UNIT,
    crossBooking: true,
    addedLater: true,
  }))
  assert.equal(repeat.status, 409)
  const rows = await prisma.practicalClassInstructorSignature.findMany({ where: { eventId: 'booking-2' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].signatureDataUrl, SAMPLE_SIGNATURE_PNG)
  assert.equal(rows[0].unitIndex, CROSS_BOOKING_UNIT)
  const legacyInstructor = await prisma.lessonInstructorSignature.findMany({ where: { eventId: 'booking-2' } })
  assert.equal(legacyInstructor.length, 0)
  const studentSlice = await prisma.practicalClassUnitSignature.findFirstOrThrow({
    where: { eventId: 'booking-2', unitIndex: CROSS_BOOKING_UNIT },
  })
  assert.equal(studentSlice.signatureDataUrl, OTHER_PNG)
})
