import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  carClassGapApplies,
  carClassGapErrorText,
  carClassGapViolation,
  carSessionNumber,
  earlyCarClassGapBeforeMessage,
  earlyCarClassGapMessage,
  eventBelongsToStudent,
  isCountableCarClass,
  isExtraHoursClass,
  mergeScheduledCarClasses,
  suggestionButtonLabel,
  type CalendarClass,
} from './car-class-gap'

function carClass(date: string, extras: Partial<CalendarClass> = {}): CalendarClass {
  return {
    id: extras.id || `class-${date}`,
    title: extras.title || 'Session 1 - Jane Doe',
    notes: extras.notes || 'Student: Jane Doe\nPhone: 15145551212',
    startDate: extras.startDate || `${date}T09:00:00`,
    ...extras,
  }
}

const JANE = { phone: '(514) 555-1212', name: 'Jane Doe' }

test('extra hours bypass the gap before and after nearby classes, including rescheduling', () => {
  const classes = [carClass('2026-03-01'), carClass('2026-03-04')]
  for (const sessionNumber of [1, 2, 3]) {
    const args = { sessionNumber, proposedDate: '2026-03-02', classes }
    assert(carClassGapViolation(args))
    assert.equal(carClassGapApplies({ ...args, isExtraHours: true }), false)
    assert.equal(carClassGapViolation({ ...args, isExtraHours: true }), null)
    assert.equal(carClassGapViolation({ ...args, isExtraHours: true, previousDate: '2026-02-20', previousSessionNumber: sessionNumber }), null)
    assert(carClassGapViolation({ ...args, isExtraHours: false }))
  }
})

test('extra-hour metadata survives plain and HTML Teamup notes without guessing from a title', () => {
  assert.equal(isExtraHoursClass('Student: Amira\nExtraHours: yes\nPaid: no'), true)
  assert.equal(isExtraHoursClass('<p>Student: Amira</p><p>ExtraHours: yes</p><p>Paid: yes</p>'), true)
  assert.equal(isExtraHoursClass('<div>Phone: 15145550147</div><div>ExtraHours: yes</div>'), true)
  for (const notes of [undefined, '', 'ExtraHours: no', 'ExtraHours: yesterday', 'Student wants extra hours']) {
    assert.equal(isExtraHoursClass(notes), false)
  }
})

test('server exempts extra hours even with an early-session title or reschedule fallback', async () => {
  const { enforceCarClassGap } = await import('./car-class-gap-enforce')
  const apiKey = process.env.TEAMUP_API_KEY
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY
  delete process.env.TEAMUP_API_KEY
  delete process.env.TEAMUP_CALENDAR_KEY
  try {
    const args = { title: 'Session 2 - Amira Bennett', notes: 'Phone: 15145550147\nExtraHours: yes', startDate: '2026-03-02T09:00:00' }
    assert.deepEqual(await enforceCarClassGap(args), { ok: true })
    assert.deepEqual(await enforceCarClassGap({ ...args, title: 'Driving practice', previousTitle: 'Session 1 - Amira Bennett', previousStartDate: '2026-02-20T09:00:00' }), { ok: true })
    // Removing the explicit flag restores regular-course enforcement.
    const regular = await enforceCarClassGap({ ...args, notes: 'Phone: 15145550147\nExtraHours: no' })
    assert.equal(regular.ok, false)
    if (!regular.ok) assert.equal(regular.status, 503)
  } finally {
    if (apiKey === undefined) delete process.env.TEAMUP_API_KEY; else process.env.TEAMUP_API_KEY = apiKey
    if (calendarKey === undefined) delete process.env.TEAMUP_CALENDAR_KEY; else process.env.TEAMUP_CALENDAR_KEY = calendarKey
  }
})

test('session 1–3 within 7 days of the previous car class is blocked', () => {
  const classes = [carClass('2026-03-01')]
  for (const session of [1, 2, 3]) {
    const violation = carClassGapViolation({
      sessionNumber: session,
      proposedDate: '2026-03-07',
      classes,
    })
    assert.ok(violation)
    assert.equal(
      violation.message,
      'Modules 1–3 need at least 7 days between car classes. The earliest date for this student is March 8, 2026.',
    )
    assert.equal(violation.earliestDate, '2026-03-08')
    assert.equal(violation.message, earlyCarClassGapMessage('2026-03-08'))
  }
})

test('exactly 7 days after the previous car class is allowed', () => {
  const violation = carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-08',
    classes: [carClass('2026-03-01')],
  })
  assert.equal(violation, null)
})

test('exactly 7 days before the next car class is allowed', () => {
  const violation = carClassGapViolation({
    sessionNumber: 1,
    proposedDate: '2026-03-01',
    classes: [carClass('2026-03-08', { id: 'future', title: 'Session 4 - Jane Doe' })],
  })
  assert.equal(violation, null)
})

test('fewer than 7 days before the next car class is blocked', () => {
  const violation = carClassGapViolation({
    sessionNumber: 3,
    proposedDate: '2026-03-02',
    classes: [carClass('2026-03-08', { title: 'Session 5 - Jane Doe' })],
  })
  assert.ok(violation)
  assert.equal(violation.earliestDate, null)
  assert.equal(violation.message, earlyCarClassGapBeforeMessage('2026-03-08'))
})

test('the same calendar day is inside the gap', () => {
  const violation = carClassGapViolation({
    sessionNumber: 1,
    proposedDate: '2026-04-01T15:00:00',
    classes: [carClass('2026-04-01', { startDate: '2026-04-01T09:00:00' })],
  })
  assert.ok(violation)
  assert.equal(violation.earliestDate, '2026-04-08')
})

test('sessions 4 and later are unaffected', () => {
  const classes = [carClass('2026-03-01'), carClass('2026-03-02', { id: 'next', title: 'Session 9 - Jane Doe' })]
  for (const session of [4, 5, 10, 15]) {
    assert.equal(carClassGapApplies({ sessionNumber: session, proposedDate: '2026-03-02' }), false)
    assert.equal(carClassGapApplies({
      sessionNumber: session,
      proposedDate: '2026-03-02',
      previousDate: '2026-03-20',
      previousSessionNumber: session,
    }), false)
    assert.equal(carClassGapViolation({
      sessionNumber: session,
      proposedDate: '2026-03-02',
      classes,
      previousDate: '2026-03-20',
      previousSessionNumber: session,
    }), null)
  }
})

test('theory classes are not car classes and are not subject to the gap', () => {
  const theory = carClass('2026-03-06', {
    id: 'theory',
    title: 'Module 3 - March Group',
    notes: 'Theory class\nModule: 3\nGroup: March Group',
  })
  const truck = carClass('2026-03-06', {
    id: 'truck',
    title: 'Truck Class 2 (Auto) - Jane Doe',
    notes: 'TruckClass: yes\nStudent: Jane Doe\nPhone: 15145551212',
  })
  assert.equal(isCountableCarClass(theory), false)
  assert.equal(isCountableCarClass(truck), false)
  assert.equal(carSessionNumber({ title: 'Module 2 - March Group', notes: 'Theory class\nModule: 2' }), null)
  assert.equal(carSessionNumber({ module: 'M2' }), null)
  assert.equal(carSessionNumber({ module: '2' }), null)
  assert.equal(carClassGapViolation({
    sessionNumber: 1,
    proposedDate: '2026-03-07',
    classes: [theory, truck],
  }), null)
  assert.equal(carClassGapViolation({
    sessionNumber: carSessionNumber({ title: 'Module 1 - March Group', notes: 'Theory class' }),
    proposedDate: '2026-03-02',
    classes: [carClass('2026-03-01')],
  }), null)
})

test('cancelled classes are ignored', () => {
  const cancelled = [
    carClass('2026-03-06', { id: 'c1', title: 'CANCELLED Session 1 - Jane Doe' }),
    carClass('2026-03-05', { id: 'c2', title: 'Session 2 - Jane Doe', notes: 'Student: Jane Doe\nPhone: 15145551212\nStatus: canceled' }),
    carClass('2026-03-04', { id: 'c3', cancelled: true }),
  ]
  const kept = carClass('2026-02-20', { id: 'kept', title: 'Session 1 - Jane Doe' })
  const snapshot = JSON.parse(JSON.stringify([kept, ...cancelled]))
  const violation = carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-07',
    classes: [kept, ...cancelled],
  })
  assert.equal(violation, null)
  assert.deepEqual([kept, ...cancelled], snapshot)
})

test('a cancelled Teamup session does not come back from the student record', () => {
  const events = [
    carClass('2026-03-06', { title: 'CANCELLED - Session 1 - Jane Doe' }),
  ]
  const merged = mergeScheduledCarClasses(events, ['2026-03-06', null, '2026-02-01'])
  const violation = carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-08',
    classes: merged,
  })
  assert.equal(violation, null)
  const fromRecordOnly = mergeScheduledCarClasses([], [null, null, '2026-03-01'])
  const blocked = carClassGapViolation({
    sessionNumber: 1,
    proposedDate: '2026-03-05',
    classes: fromRecordOnly,
  })
  assert.ok(blocked)
  assert.equal(blocked.earliestDate, '2026-03-08')
})

test('rescheduling a session 1–3 class excludes itself and still enforces the gap', () => {
  const moving = carClass('2026-03-01', { id: 'moving', title: 'Session 2 - Jane Doe' })
  const other = carClass('2026-03-10', { id: 'other', title: 'Session 4 - Jane Doe' })
  const classes = [moving, other]

  assert.equal(carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-03',
    classes,
    excludeEventId: 'moving',
    previousDate: moving.startDate,
    previousSessionNumber: 2,
  }), null)

  const tooClose = carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-04',
    classes,
    excludeEventId: 'moving',
    previousDate: moving.startDate,
    previousSessionNumber: 2,
  })
  assert.ok(tooClose)
  assert.equal(tooClose.message, earlyCarClassGapBeforeMessage('2026-03-10'))

  assert.equal(carClassGapApplies({
    sessionNumber: 2,
    proposedDate: '2026-03-01T11:00:00',
    previousDate: '2026-03-01T09:00:00',
    previousSessionNumber: 2,
  }), false)

  assert.equal(carClassGapApplies({
    sessionNumber: 2,
    proposedDate: '2026-03-01',
    previousDate: '2026-03-01T09:00:00',
    previousSessionNumber: 5,
  }), true)

  assert.equal(carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-03',
    previousDate: '2026-03-03T09:00:00',
    previousSessionNumber: 2,
    excludeEventId: 'self',
    classes: [
      carClass('2026-03-01'),
      carClass('2026-03-03', { id: 'self', title: 'Session 2 - Jane Doe' }),
    ],
  }), null)
})

test('existing classes closer than 7 days are reported and not rewritten', () => {
  const existing = [
    carClass('2026-03-01', { id: 'a', title: 'Session 1 - Jane Doe' }),
    carClass('2026-03-03', { id: 'b', title: 'Session 2 - Jane Doe' }),
  ]
  const before = JSON.parse(JSON.stringify(existing))
  const violation = carClassGapViolation({
    sessionNumber: 3,
    proposedDate: '2026-03-04',
    classes: existing,
  })
  assert.ok(violation)
  assert.equal(violation.earliestDate, '2026-03-10')
  assert.deepEqual(existing, before)
  assert.equal(existing[0].startDate, '2026-03-01T09:00:00')
  assert.equal(existing[1].startDate, '2026-03-03T09:00:00')
})

test('another student and a different phone do not count', () => {
  const events = [
    carClass('2026-03-01', { id: 'jane', title: 'Session 1 - Jane Doe', notes: 'Student: Jane Doe\nPhone: 15145551212' }),
    carClass('2026-03-02', { id: 'other', title: 'Session 1 - Sam Rivera', notes: 'Student: Sam Rivera\nPhone: 15145550000' }),
  ]
  const jane = events.filter(event => eventBelongsToStudent(event, JANE))
  assert.deepEqual(jane.map(event => event.id), ['jane'])
  const violation = carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-06',
    classes: jane,
  })
  assert.ok(violation)
  assert.equal(carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-03',
    classes: events.filter(event => eventBelongsToStudent(event, { phone: '5145550000', name: 'Sam Rivera' })),
  })?.earliestDate, '2026-03-09')
})

test('suggests the same time on the earliest day that clears both neighboring car classes', () => {
  const previous = carClass('2026-03-01')
  const next = carClass('2026-03-10', { id: 'next', title: 'Session 4 - Jane Doe' })
  const violation = carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-06',
    time: '14:00',
    classes: [previous, next],
  })
  assert.ok(violation?.suggestion)
  assert.equal(violation.suggestion.date, '2026-03-17')
  assert.equal(violation.suggestion.time, '14:00')
  assert.equal(violation.suggestion.adjustedForInstructor, false)
  assert.equal(violation.suggestion.label, 'Use Tue, Mar 17 at 2:00 PM instead')
  assert.equal(violation.suggestion.label, suggestionButtonLabel('2026-03-17', '14:00'))
  assert.equal(carClassGapViolation({
    sessionNumber: 2,
    proposedDate: violation.suggestion.date,
    time: '14:00',
    classes: [previous, next],
  }), null)
  assert.equal(
    carClassGapErrorText(violation),
    'Modules 1–3 need at least 7 days between car classes. The earliest date for this student is March 8, 2026. This date is also fewer than 7 days before the car class on March 10, 2026. Suggested: Tue, Mar 17 at 2:00 PM.',
  )
})

test('a plain too-early booking suggests 7 days after the previous class at the same time', () => {
  const violation = carClassGapViolation({
    sessionNumber: 1,
    proposedDate: '2026-03-06T14:00:00',
    classes: [carClass('2026-03-01')],
  })
  assert.ok(violation?.suggestion)
  assert.equal(violation.suggestion.date, '2026-03-08')
  assert.equal(violation.suggestion.time, '14:00')
  assert.equal(violation.suggestion.label, 'Use Sun, Mar 8 at 2:00 PM instead')
  assert.equal(carClassGapViolation({
    sessionNumber: 1,
    proposedDate: '2026-03-08',
    time: '14:00',
    classes: [carClass('2026-03-01')],
  }), null)
})

test('skips a gap-valid day when the instructor is already booked at that time', () => {
  const classes = [carClass('2026-03-01')]
  const violation = carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-06',
    time: '14:00',
    classes,
    isBusy: (date) => date === '2026-03-08',
  })
  assert.ok(violation?.suggestion)
  assert.equal(violation.suggestion.date, '2026-03-09')
  assert.equal(violation.suggestion.time, '14:00')
  assert.equal(violation.suggestion.adjustedForInstructor, true)
  assert.equal(violation.suggestion.label, 'Use Mon, Mar 9 at 2:00 PM instead')
  assert.equal(carClassGapViolation({
    sessionNumber: 2,
    proposedDate: '2026-03-09',
    time: '14:00',
    classes,
  }), null)
})

test('says so when no same-time day in range is free', () => {
  const violation = carClassGapViolation({
    sessionNumber: 3,
    proposedDate: '2026-03-06',
    time: '14:00',
    classes: [carClass('2026-03-01')],
    horizonDays: 4,
    isBusy: () => true,
  })
  assert.ok(violation)
  assert.equal(violation.suggestion, null)
  assert.match(violation.noSuggestion || '', /No free day at 2:00 PM in the next 4 days/)
  assert.match(violation.noSuggestion || '', /instructor's calendar/)
})

test('a date that is only too close to a later class suggests the next valid day, not an earlier one', () => {
  const violation = carClassGapViolation({
    sessionNumber: 1,
    proposedDate: '2026-03-04',
    time: '09:30',
    classes: [carClass('2026-03-10', { title: 'Session 5 - Jane Doe' })],
  })
  assert.ok(violation?.suggestion)
  assert.equal(violation.suggestion.date, '2026-03-17')
  assert.equal(violation.suggestion.time, '09:30')
  assert.equal(violation.suggestion.label, 'Use Tue, Mar 17 at 9:30 AM instead')
})

test('titles from the scheduler and the student portal parse as car sessions', () => {
  assert.equal(carSessionNumber({ module: 'S1' }), 1)
  assert.equal(carSessionNumber({ module: 'S3' }), 3)
  assert.equal(carSessionNumber({ module: 'S4' }), 4)
  assert.equal(carSessionNumber({ title: 'Session 2 - Jane Doe' }), 2)
  assert.equal(carSessionNumber({ title: 'Sortie 3 — Jane Doe — ⏳ PENDING', notes: 'Road Class: #3' }), 3)
  assert.equal(carSessionNumber({ title: 'Class Session 1 (In-Car) - Jane' }), 1)
  assert.equal(carSessionNumber({ sortieNumber: '2' }), 2)
})
