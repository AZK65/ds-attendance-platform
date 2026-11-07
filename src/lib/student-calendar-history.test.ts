import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarEventBelongsToStudent, loadStudentCalendarHistory, STUDENT_HISTORY_START, type StudentCalendarEvent } from './student-calendar-history'
import { recordedClassStatus, preferJourneyAttempt } from './journey-attendance'

const event: StudentCalendarEvent = { id: 'may-2', title: 'Session 5 - Amira Bennett #1117 - Qazi Theory 1117',
  start_dt: '2026-05-02T16:00:00-04:00', end_dt: '2026-05-02T17:00:00-04:00', subcalendar_ids: [1],
  notes: '<p>Student: Amira Bennett #1117<br>Phone: +1 (514) 555-0147<br>Group: Qazi Theory 1117</p>' }

test('history normalizes phones, follows renamed students, and rejects a different explicit phone', () => {
  assert(calendarEventBelongsToStudent(event, { phone: '5145550147', studentName: 'Amira Hasbia' }))
  assert(!calendarEventBelongsToStudent(event, { phone: '5145559999', studentName: 'Amira Bennett' }))
  assert(!calendarEventBelongsToStudent(event, { phone: '5145559999', groupName: 'Qazi Theory 1117' }))
  assert(calendarEventBelongsToStudent({ ...event, notes: 'Student: Bennett, Amira' }, { studentName: 'Amira Bennett' }))
  assert(!calendarEventBelongsToStudent({ ...event, notes: 'Student: Amira Bennett' }, { studentName: 'Amira' }))
  assert(calendarEventBelongsToStudent({ ...event, title: 'Module 9 - Qazi Theory 1117', notes: '' }, { groupName: 'Qazi Theory 1117' }))
})

test('May 2 remains visible after six months, search results deduplicate and failures are not empty history', async () => {
  const oldFetch = global.fetch, oldKey = process.env.TEAMUP_API_KEY, oldCalendar = process.env.TEAMUP_CALENDAR_KEY
  process.env.TEAMUP_API_KEY = 'test'; process.env.TEAMUP_CALENDAR_KEY = 'test-calendar'
  try {
    const urls: URL[] = []
    global.fetch = async input => { urls.push(new URL(String(input))); return Response.json({ events: [event] }) }
    const found = await loadStudentCalendarHistory({ phone: '15145550147', studentName: 'Amira Bennett' }, new Date('2026-11-07T17:00:00Z'))
    assert.equal(found.length, 1)
    assert.equal(found[0].start_dt.slice(0, 10), '2026-05-02')
    assert(urls.every(url => url.searchParams.get('startDate') === STUDENT_HISTORY_START))
    global.fetch = async () => new Response('unavailable', { status: 503 })
    await assert.rejects(loadStudentCalendarHistory({ phone: '15145550147' }), /unavailable/)
    global.fetch = async () => Response.json({ timestamp: 1 })
    await assert.rejects(loadStudentCalendarHistory({ phone: '15145550147' }), /incomplete/)
  } finally {
    global.fetch = oldFetch
    if (oldKey === undefined) delete process.env.TEAMUP_API_KEY; else process.env.TEAMUP_API_KEY = oldKey
    if (oldCalendar === undefined) delete process.env.TEAMUP_CALENDAR_KEY; else process.env.TEAMUP_CALENDAR_KEY = oldCalendar
  }
})

test('past booking alone is unconfirmed and a later real completion wins over an absent attempt', () => {
  const when = new Date('2026-05-02'), now = new Date('2026-11-07')
  assert.equal(recordedClassStatus(when, undefined, now), 'unverified')
  assert.equal(recordedClassStatus(when, false, now), 'absent')
  assert.equal(recordedClassStatus(when, true, now), 'present')
  assert.equal(recordedClassStatus(new Date('2026-12-01'), undefined, now), 'scheduled')
  const absent = { when, status: 'absent' as const }, present = { when: new Date('2026-05-09'), status: 'present' as const }
  assert.equal(preferJourneyAttempt(absent, present), present)
  assert.equal(preferJourneyAttempt(present, absent), present)
})
