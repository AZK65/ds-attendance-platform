import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  migratePendingTruckReminders,
  planQueuedTruckReminderMigration,
  planTruckReminder,
  torontoWallTimeToUtc,
  truckReminderFallsOnTorontoDate,
  truckReminderMatchesSession,
  truckSessionFromEvent,
  truckTrainingScheduleReminderLine,
  type QueuedTruckReminderRow,
  type TruckReminderQueueStore,
} from './truck-reminders'

const CLASS_TOMORROW = 'Reminder: You have Truck Class 4 tomorrow at 8:00 AM. See you there!'
const CLASS_TODAY = 'Reminder: You have Truck Class 4 today at 8:00 AM. See you there!'
const EXAM_TOMORROW = 'Reminder: You have your Truck Exam tomorrow at 9:30 AM in Saint-Jérôme. Good luck! 🍀'
const EXAM_TODAY = 'Reminder: You have your Truck Exam today at 9:30 AM in Laval. Good luck! 🍀'

function row(overrides: Partial<QueuedTruckReminderRow> = {}): QueuedTruckReminderRow {
  return {
    id: 'msg-1',
    groupId: 'truck-classes',
    status: 'pending',
    message: 'Reminder: You have Truck Class 4 today at 8:00 AM. See you there!',
    scheduledAt: new Date('2026-11-25T07:00:00.000Z'),
    classDateISO: '2026-11-25',
    classTime: '08:00-10:00',
    moduleNumber: 4,
    teamupEventId: null,
    ...overrides,
  }
}

test('Toronto wall time converts in standard time and daylight time', () => {
  assert.equal(torontoWallTimeToUtc('2026-01-15', '08:00')?.toISOString(), '2026-01-15T13:00:00.000Z')
  assert.equal(torontoWallTimeToUtc('2026-07-15', '08:00')?.toISOString(), '2026-07-15T12:00:00.000Z')
  assert.equal(torontoWallTimeToUtc('2026-11-24', '08:00')?.toISOString(), '2026-11-24T13:00:00.000Z')
  assert.equal(torontoWallTimeToUtc('2026-03-08', '08:00')?.toISOString(), '2026-03-08T12:00:00.000Z')
  assert.equal(torontoWallTimeToUtc('2026-11-01', '23:30')?.toISOString(), '2026-11-02T04:30:00.000Z')
})

test('a truck class reminder is 24 hours before the start and says tomorrow', () => {
  const plan = planTruckReminder({
    kind: 'class',
    date: '2026-11-24',
    startTime: '08:00',
    endTime: '10:00',
    classNumber: 4,
    now: new Date('2026-11-20T15:00:00.000Z'),
  })
  assert.equal(plan.send, 'scheduled')
  assert.equal(plan.scheduledAt?.toISOString(), '2026-11-23T13:00:00.000Z')
  assert.equal(plan.message, CLASS_TOMORROW)
  assert.equal(plan.classDateISO, '2026-11-24')
  assert.equal(plan.classTime, '08:00-10:00')
  const sixHoursBefore = new Date('2026-11-24T07:00:00.000Z')
  assert.notEqual(plan.scheduledAt?.toISOString(), sixHoursBefore.toISOString())
})

test('a truck exam reminder is 24 hours before and keeps the location', () => {
  const plan = planTruckReminder({
    kind: 'exam',
    date: '2026-11-24',
    startTime: '09:30',
    endTime: '11:30',
    examLocation: 'Saint-Jérôme',
    now: new Date('2026-11-20T15:00:00.000Z'),
  })
  assert.equal(plan.send, 'scheduled')
  assert.equal(plan.scheduledAt?.toISOString(), '2026-11-23T14:30:00.000Z')
  assert.equal(plan.message, EXAM_TOMORROW)
  assert.doesNotMatch(plan.message, /today/)
})

test('an exam with no location does not invent one', () => {
  const plan = planTruckReminder({
    kind: 'exam',
    date: '2026-11-24',
    startTime: '09:30',
    examLocation: null,
    now: new Date('2026-11-20T15:00:00.000Z'),
  })
  assert.equal(
    plan.message,
    'Reminder: You have your Truck Exam tomorrow at 9:30 AM. Good luck! 🍀',
  )
})

test('spring-forward lead is 24 real hours, and the class time stays 8:00 AM', () => {
  const plan = planTruckReminder({
    kind: 'class',
    date: '2026-03-08',
    startTime: '08:00',
    endTime: '10:00',
    classNumber: 1,
    now: new Date('2026-03-01T15:00:00.000Z'),
  })
  assert.equal(plan.scheduledAt?.toISOString(), '2026-03-07T12:00:00.000Z')
  assert.equal(plan.message, 'Reminder: You have Truck Class 1 tomorrow at 8:00 AM. See you there!')
})

test('a 24-hour lead that stays on the same Toronto date says today', () => {
  const plan = planTruckReminder({
    kind: 'class',
    date: '2026-11-01',
    startTime: '23:30',
    endTime: '23:45',
    classNumber: 1,
    now: new Date('2026-10-30T15:00:00.000Z'),
  })
  const start = torontoWallTimeToUtc('2026-11-01', '23:30')
  assert.ok(start)
  assert.equal(plan.send, 'scheduled')
  assert.equal(plan.scheduledAt?.toISOString(), new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString())
  assert.match(plan.message, / today at 11:30 PM/)
  assert.doesNotMatch(plan.message, /tomorrow/)
})

test('a same-day booking inside the 24-hour window sends now and says today', () => {
  const now = new Date('2026-11-23T16:00:00.000Z')
  const plan = planTruckReminder({
    kind: 'class',
    date: '2026-11-23',
    startTime: '16:00',
    endTime: '18:00',
    classNumber: 2,
    now,
  })
  assert.equal(plan.send, 'immediate')
  assert.equal(plan.scheduledAt?.toISOString(), now.toISOString())
  assert.equal(plan.message, 'Reminder: You have Truck Class 2 today at 4:00 PM. See you there!')
  assert.doesNotMatch(plan.message, /tomorrow/)
})

test('a last-minute booking for the next Toronto day still says tomorrow', () => {
  const now = new Date('2026-11-23T16:00:00.000Z')
  const plan = planTruckReminder({
    kind: 'class',
    date: '2026-11-24',
    startTime: '08:00',
    endTime: '10:00',
    classNumber: 5,
    now,
  })
  assert.equal(plan.send, 'immediate')
  assert.equal(plan.scheduledAt?.toISOString(), now.toISOString())
  assert.equal(plan.message, 'Reminder: You have Truck Class 5 tomorrow at 8:00 AM. See you there!')
})

test('a same-day exam booked inside the window says today and keeps the location', () => {
  const now = new Date('2026-11-23T16:00:00.000Z')
  const plan = planTruckReminder({
    kind: 'exam',
    date: '2026-11-23',
    startTime: '16:00',
    endTime: '18:00',
    examLocation: 'Laval',
    now,
  })
  assert.equal(plan.send, 'immediate')
  assert.equal(plan.scheduledAt?.toISOString(), now.toISOString())
  assert.equal(plan.message, 'Reminder: You have your Truck Exam today at 4:00 PM in Laval. Good luck! 🍀')
  assert.doesNotMatch(plan.message, /tomorrow/)
})

test('a session that has already started is not reminded', () => {
  const plan = planTruckReminder({
    kind: 'exam',
    date: '2026-11-23',
    startTime: '08:00',
    examLocation: 'Joliette',
    now: new Date('2026-11-23T14:00:00.000Z'),
  })
  assert.equal(plan.send, 'skipped')
  assert.equal(plan.scheduledAt, null)
  assert.equal(plan.message, '')
})

test('the schedule summary promises 24 hours for classes and exams', () => {
  assert.equal(
    truckTrainingScheduleReminderLine({ classes: 3, exams: 0 }),
    `\nYou'll receive a reminder 24 hours before each class. Good luck! 🚛`,
  )
  assert.equal(
    truckTrainingScheduleReminderLine({ classes: 0, exams: 1 }),
    `\nYou'll receive a reminder 24 hours before the exam. Good luck! 🚛`,
  )
  assert.equal(
    truckTrainingScheduleReminderLine({ classes: 2, exams: 1 }),
    `\nYou'll receive a reminder 24 hours before each class and 24 hours before the exam. Good luck! 🚛`,
  )
  assert.equal(
    truckTrainingScheduleReminderLine({ classes: 1, exams: 2 }),
    `\nYou'll receive a reminder 24 hours before each class and 24 hours before each exam. Good luck! 🚛`,
  )
  assert.match(truckTrainingScheduleReminderLine({ classes: 2, exams: 1 }), /24 hours/)
  assert.doesNotMatch(truckTrainingScheduleReminderLine({ classes: 2, exams: 1 }), /6 hours/)
})

test('event notes distinguish a truck exam from a practical class', () => {
  const exam = truckSessionFromEvent({
    notes: 'TruckClass: yes<br>Student: Amina<br>Phone: 15145550100<br>Exam: Saint-Jérôme',
    title: 'Truck Exam (Auto) - Amina - Saint-Jérôme',
    startDt: '2026-11-24T09:30:00',
    endDt: '2026-11-24T11:30:00',
  })
  assert.equal(exam?.kind, 'exam')
  assert.equal(exam?.examLocation, 'Saint-Jérôme')
  assert.equal(exam?.classNumber, null)
  assert.equal(exam?.startTime, '09:30')
  assert.equal(exam?.date, '2026-11-24')

  const practical = truckSessionFromEvent({
    notes: 'TruckClass: yes\nClassNumber: 7\nPhone: 15145550100',
    title: 'Truck Class 7 (Manual) - Amina',
    startDt: '2026-11-24T08:00:00',
    endDt: '2026-11-24T10:00:00',
  })
  assert.equal(practical?.kind, 'class')
  assert.equal(practical?.classNumber, '7')
  assert.equal(practical?.examLocation, null)
})

test('queued class and exam reminders move from 6 hours to 24 hours', () => {
  const now = new Date('2026-11-20T15:00:00.000Z')
  const practical = planQueuedTruckReminderMigration(row({
    id: 'class',
    message: 'Reminder: You have Truck Class 4 today at 8:00 AM. See you there!',
    scheduledAt: new Date('2026-11-25T07:00:00.000Z'),
    classDateISO: '2026-11-25',
    classTime: '08:00-10:00',
  }), now)
  assert.equal(practical.action, 'update')
  if (practical.action !== 'update') return
  assert.equal(practical.scheduledAt.toISOString(), '2026-11-24T13:00:00.000Z')
  assert.equal(practical.message, 'Reminder: You have Truck Class 4 tomorrow at 8:00 AM. See you there!')
  assert.equal(practical.classTime, '08:00-10:00')

  const exam = planQueuedTruckReminderMigration(row({
    id: 'exam',
    message: 'Reminder: You have your Truck Exam today at 9:30 AM in Saint-Jérôme. Good luck! 🍀',
    scheduledAt: new Date('2026-11-25T08:30:00.000Z'),
    classDateISO: '2026-11-25',
    classTime: '09:30-11:30',
    moduleNumber: null,
  }), now)
  assert.equal(exam.action, 'update')
  if (exam.action !== 'update') return
  assert.equal(exam.scheduledAt.toISOString(), '2026-11-24T14:30:00.000Z')
  assert.equal(exam.message, EXAM_TOMORROW)
  assert.equal(exam.classTime, '09:30-11:30')
})

test('a legacy row without a stored class date is inferred from the 6-hour lead', () => {
  const now = new Date('2026-11-20T15:00:00.000Z')
  const decision = planQueuedTruckReminderMigration(row({
    classDateISO: null,
    classTime: null,
    message: 'Reminder: You have Truck Class 4 today at 8:00 AM. See you there!',
    scheduledAt: new Date('2026-11-25T07:00:00.000Z'),
  }), now)
  assert.equal(decision.action, 'update')
  if (decision.action !== 'update') return
  assert.equal(decision.scheduledAt.toISOString(), '2026-11-24T13:00:00.000Z')
  assert.equal(decision.classDateISO, '2026-11-25')
  assert.equal(decision.classTime, '08:00-08:00')
  assert.equal(decision.message, 'Reminder: You have Truck Class 4 tomorrow at 8:00 AM. See you there!')
})

test('inside the 24-hour window, a future 6-hour slot is sent on deploy', () => {
  const now = new Date('2026-11-23T22:00:00.000Z')
  const tomorrowClass = planQueuedTruckReminderMigration(row({
    message: CLASS_TODAY,
    scheduledAt: new Date('2026-11-24T07:00:00.000Z'),
    classDateISO: '2026-11-24',
    classTime: '08:00-10:00',
  }), now)
  assert.equal(tomorrowClass.action, 'update')
  if (tomorrowClass.action !== 'update') return
  assert.equal(tomorrowClass.scheduledAt.toISOString(), now.toISOString())
  assert.equal(tomorrowClass.message, CLASS_TOMORROW)

  const sameDay = planQueuedTruckReminderMigration(row({
    id: 'same-day',
    message: 'Reminder: You have your Truck Exam today at 9:00 PM in Laval. Good luck! 🍀',
    scheduledAt: new Date('2026-11-23T20:00:00.000Z'),
    classDateISO: '2026-11-23',
    classTime: '21:00-22:00',
    moduleNumber: null,
  }), new Date('2026-11-23T16:00:00.000Z'))
  assert.equal(sameDay.action, 'update')
  if (sameDay.action !== 'update') return
  assert.equal(sameDay.scheduledAt.toISOString(), '2026-11-23T16:00:00.000Z')
  assert.equal(sameDay.message, 'Reminder: You have your Truck Exam today at 9:00 PM in Laval. Good luck! 🍀')
  assert.doesNotMatch(sameDay.message, /tomorrow/)
})

test('a reminder already due inside the send window keeps its timestamp', () => {
  const now = new Date('2026-11-23T16:00:00.000Z')
  const scheduledAt = new Date('2026-11-23T15:00:00.000Z')
  const decision = planQueuedTruckReminderMigration(row({
    message: 'Reminder: You have Truck Class 4 today at 4:00 PM. See you there!',
    scheduledAt,
    classDateISO: '2026-11-23',
    classTime: '16:00-18:00',
  }), now)
  assert.equal(decision.action, 'unchanged')
})

test('a reminder the sender would expire is pulled forward if the session has not started', () => {
  const now = new Date('2026-11-23T16:00:00.000Z')
  const decision = planQueuedTruckReminderMigration(row({
    message: 'Reminder: You have Truck Class 4 today at 4:00 PM. See you there!',
    scheduledAt: new Date('2026-11-23T10:00:00.000Z'),
    classDateISO: '2026-11-23',
    classTime: '16:00-18:00',
  }), now)
  assert.equal(decision.action, 'update')
  if (decision.action !== 'update') return
  assert.equal(decision.scheduledAt.toISOString(), now.toISOString())
  assert.match(decision.message, / today at 4:00 PM/)
})

test('a queued reminder for a session that already started is cancelled', () => {
  const decision = planQueuedTruckReminderMigration(row({
    message: EXAM_TODAY,
    scheduledAt: new Date('2026-11-23T08:30:00.000Z'),
    classDateISO: '2026-11-23',
    classTime: '09:30-11:30',
    moduleNumber: null,
  }), new Date('2026-11-23T15:00:00.000Z'))
  assert.deepEqual(decision, { action: 'cancel', reason: 'Truck class or exam has already started' })
})

test('migration is idempotent and ignores other reminder types', () => {
  const now = new Date('2026-11-20T15:00:00.000Z')
  const current = row({
    message: CLASS_TOMORROW,
    scheduledAt: new Date('2026-11-24T13:00:00.000Z'),
    classDateISO: '2026-11-25',
    classTime: '08:00-10:00',
  })
  assert.equal(planQueuedTruckReminderMigration(current, now).action, 'unchanged')

  const moved = planQueuedTruckReminderMigration(row(), now)
  assert.equal(moved.action, 'update')
  if (moved.action !== 'update') return
  const again = planQueuedTruckReminderMigration(row({
    message: moved.message,
    scheduledAt: moved.scheduledAt,
    classDateISO: moved.classDateISO,
    classTime: moved.classTime,
  }), now)
  assert.equal(again.action, 'unchanged')

  assert.equal(planQueuedTruckReminderMigration(row({
    groupId: 'in-car-reminders',
    message: 'Reminder: Hi Sam, your in-car class is in 3 hours (8:00 AM to 10:00 AM). See you soon!',
  }), now).action, 'unchanged')
  assert.equal(planQueuedTruckReminderMigration(row({ status: 'sent' }), now).action, 'unchanged')
  assert.equal(planQueuedTruckReminderMigration(row({
    message: 'Custom note from the office.',
    classDateISO: null,
    classTime: null,
  }), now).action, 'unchanged')
})

test('cancellation matches 24-hour and legacy 6-hour truck reminders, not the 3-hour in-car lead', () => {
  const startDt = '2026-11-24T08:00:00'
  assert.equal(truckReminderMatchesSession({
    scheduledAt: new Date('2026-11-23T13:00:00.000Z'),
    startDt,
  }), true)
  assert.equal(truckReminderMatchesSession({
    scheduledAt: new Date('2026-11-24T07:00:00.000Z'),
    startDt,
  }), true)
  assert.equal(truckReminderMatchesSession({
    scheduledAt: new Date('2026-11-24T10:00:00.000Z'),
    startDt,
  }), false)
  assert.equal(truckReminderMatchesSession({
    scheduledAt: new Date('2026-11-23T16:00:00.000Z'),
    classDateISO: '2026-11-24',
    classTime: '08:00-10:00',
    startDt,
  }), true)
  assert.equal(truckReminderMatchesSession({
    scheduledAt: new Date('2026-11-23T16:00:00.000Z'),
    classDateISO: '2026-11-24',
    classTime: '13:00-15:00',
    startDt,
  }), false)
  assert.equal(truckReminderMatchesSession({
    scheduledAt: new Date('2026-11-23T16:00:00.000Z'),
    teamupEventId: 'evt-9',
    eventId: 'evt-9',
    startDt: '2026-11-30T08:00:00',
  }), true)
  assert.equal(truckReminderFallsOnTorontoDate(new Date('2026-11-25T07:00:00.000Z'), '2026-11-25'), true)
  assert.equal(truckReminderFallsOnTorontoDate(new Date('2026-11-24T13:00:00.000Z'), '2026-11-25'), true)
  assert.equal(truckReminderFallsOnTorontoDate(new Date('2026-11-24T13:00:00.000Z'), '2026-11-20'), false)
})

test('the queue hook writes each pending truck reminder once', async () => {
  const now = new Date('2026-11-23T15:00:00.000Z')
  const practical = row({ id: 'class' })
  const exam = row({
    id: 'exam',
    message: 'Reminder: You have your Truck Exam today at 9:30 AM in Laval. Good luck! 🍀',
    scheduledAt: new Date('2026-11-25T08:30:00.000Z'),
    classDateISO: '2026-11-25',
    classTime: '09:30-11:00',
    moduleNumber: null,
  })
  const started = row({
    id: 'started',
    message: EXAM_TODAY,
    scheduledAt: new Date('2026-11-23T08:30:00.000Z'),
    classDateISO: '2026-11-23',
    classTime: '09:30-11:30',
    moduleNumber: null,
  })
  const rows = [practical, exam, started]
  const updates: string[] = []
  const cancellations: string[] = []
  const store: TruckReminderQueueStore = {
    async findPendingTruckReminders() {
      return rows.filter(entry => entry.status === 'pending' && entry.groupId === 'truck-classes')
    },
    async updatePending(id, data) {
      const current = rows.find(entry => entry.id === id && entry.status === 'pending')
      if (!current) return { count: 0 }
      current.scheduledAt = data.scheduledAt
      current.message = data.message
      current.classDateISO = data.classDateISO
      current.classTime = data.classTime
      updates.push(id)
      return { count: 1 }
    },
    async cancelPending(id, reason) {
      const current = rows.find(entry => entry.id === id && entry.status === 'pending')
      if (!current) return { count: 0 }
      current.status = 'cancelled'
      current.message = `${current.message} (${reason})`
      cancellations.push(id)
      return { count: 1 }
    },
  }

  const first = await migratePendingTruckReminders(now, store)
  assert.deepEqual(first, { updated: 2, cancelled: 1, unchanged: 0 })
  assert.deepEqual(updates, ['class', 'exam'])
  assert.deepEqual(cancellations, ['started'])
  assert.equal(practical.scheduledAt.toISOString(), '2026-11-24T13:00:00.000Z')
  assert.equal(practical.message, CLASS_TOMORROW)
  assert.equal(exam.message, 'Reminder: You have your Truck Exam tomorrow at 9:30 AM in Laval. Good luck! 🍀')
  assert.equal(exam.scheduledAt.toISOString(), '2026-11-24T14:30:00.000Z')
  assert.equal(started.status, 'cancelled')

  updates.length = 0
  cancellations.length = 0
  const second = await migratePendingTruckReminders(now, store)
  assert.deepEqual(second, { updated: 0, cancelled: 0, unchanged: 2 })
  assert.deepEqual(updates, [])
  assert.deepEqual(cancellations, [])
})
