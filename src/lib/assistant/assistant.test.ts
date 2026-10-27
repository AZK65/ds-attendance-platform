import assert from 'node:assert/strict'
import test from 'node:test'
import { assistantAuthDecision, tokenMatches } from './auth.ts'
import { parseAssistantRange, startOfTorontoDay, torontoToday } from './dates.ts'
import { summarizeSession } from './roster.ts'

test('Toronto midnight handles standard time, daylight time, and both transitions', () => {
  assert.equal(startOfTorontoDay('2026-01-15').toISOString(), '2026-01-15T05:00:00.000Z')
  assert.equal(startOfTorontoDay('2026-07-15').toISOString(), '2026-07-15T04:00:00.000Z')
  assert.equal(startOfTorontoDay('2026-03-08').toISOString(), '2026-03-08T05:00:00.000Z')
  assert.equal(startOfTorontoDay('2026-11-01').toISOString(), '2026-11-01T04:00:00.000Z')
  assert.equal(startOfTorontoDay('2026-03-09').toISOString(), '2026-03-09T04:00:00.000Z')
  assert.equal(startOfTorontoDay('2026-11-02').toISOString(), '2026-11-02T05:00:00.000Z')
})

test('today follows the America/Toronto calendar', () => {
  assert.equal(torontoToday(new Date('2026-01-15T04:30:00.000Z')), '2026-01-14')
  assert.equal(torontoToday(new Date('2026-01-15T05:00:00.000Z')), '2026-01-15')
  assert.equal(torontoToday(new Date('2026-07-15T03:30:00.000Z')), '2026-07-14')
  assert.equal(torontoToday(new Date('2026-07-15T04:00:00.000Z')), '2026-07-15')
})

test('date query defaults and bounds', () => {
  const now = new Date('2026-07-15T15:00:00.000Z')
  const today = parseAssistantRange(new URLSearchParams(), now)
  assert.equal(today.ok, true)
  if (today.ok) {
    assert.equal(today.range.from, '2026-07-15')
    assert.equal(today.range.to, '2026-07-15')
    assert.equal(today.range.start.toISOString(), '2026-07-15T04:00:00.000Z')
    assert.equal(today.range.end.toISOString(), '2026-07-16T04:00:00.000Z')
  }

  const dated = parseAssistantRange(new URLSearchParams('date=2026-01-15'), now)
  assert.equal(dated.ok, true)
  if (dated.ok) assert.equal(dated.range.from, '2026-01-15')

  const ranged = parseAssistantRange(new URLSearchParams('date=2026-01-01&from=2026-02-01&to=2026-02-02'), now)
  assert.equal(ranged.ok, true)
  if (ranged.ok) {
    assert.equal(ranged.range.from, '2026-02-01')
    assert.equal(ranged.range.to, '2026-02-02')
  }

  assert.equal(parseAssistantRange(new URLSearchParams('date=2026-02-31'), now).ok, false)
  assert.equal(parseAssistantRange(new URLSearchParams('from=2026-02-02&to=2026-02-01'), now).ok, false)
  assert.equal(parseAssistantRange(new URLSearchParams('from=2026-01-01&to=2026-02-01'), now).ok, false)
  assert.equal(parseAssistantRange(new URLSearchParams('from=2026-01-01&to=2026-01-31'), now).ok, true)
})

test('bearer token is compared without accepting the query string', () => {
  assert.equal(tokenMatches('school-token', 'school-token'), true)
  assert.equal(tokenMatches('school-token', 'school-token-x'), false)
  assert.equal(tokenMatches('short', 'school-token'), false)

  const enabled = { envToken: 'school-token', searchParams: new URLSearchParams() }
  assert.deepEqual(assistantAuthDecision({ ...enabled, authorization: null }), {
    ok: false,
    status: 401,
    error: 'Unauthorized',
  })
  assert.deepEqual(assistantAuthDecision({ ...enabled, authorization: 'Bearer wrong' }), {
    ok: false,
    status: 401,
    error: 'Unauthorized',
  })
  assert.deepEqual(assistantAuthDecision({ ...enabled, authorization: 'Bearer school-token' }), { ok: true })
  assert.deepEqual(assistantAuthDecision({ ...enabled, authorization: 'bearer school-token' }), { ok: true })
  assert.equal(assistantAuthDecision({ ...enabled, envToken: '   ', authorization: 'Bearer school-token' }).ok, false)
  assert.equal(
    assistantAuthDecision({ authorization: 'Bearer school-token', searchParams: new URLSearchParams(), envToken: undefined }).status,
    503,
  )
  const leaked = assistantAuthDecision({
    authorization: 'Bearer school-token',
    searchParams: new URLSearchParams('token=school-token'),
    envToken: 'school-token',
  })
  assert.equal(leaked.ok, false)
  if (!leaked.ok) assert.equal(leaked.status, 400)
  assert.equal(
    assistantAuthDecision({
      authorization: null,
      searchParams: new URLSearchParams('token=school-token'),
      envToken: '',
    }).status,
    503,
  )
  const queryOnly = assistantAuthDecision({
    authorization: null,
    searchParams: new URLSearchParams('access_token=school-token'),
    envToken: 'school-token',
  })
  assert.equal(queryOnly.ok, false)
  if (!queryOnly.ok) assert.equal(queryOnly.status, 400)
})

test('exam roster counts match Exam Mode', () => {
  const summary = summarizeSession(
    [
      { contactId: 'c1', phone: '+1 (514) 111-1111', name: 'Alice' },
      { contactId: 'c2', phone: '5142222222', name: 'Bob' },
      { contactId: 'c3', phone: '5143333333', name: 'Cara' },
    ],
    [
      {
        id: 's1',
        contactId: null,
        phone: '15141111111',
        passed: true,
        status: 'graded',
        verified: true,
      },
      {
        id: 's2',
        contactId: 'stranger',
        phone: '5149999999',
        passed: false,
        status: 'review',
        verified: false,
      },
      {
        id: 's3',
        contactId: 'c2',
        phone: '5142222222',
        passed: false,
        status: 'graded',
        verified: false,
      },
    ],
  )

  assert.equal(summary.roster, 3)
  assert.equal(summary.submitted, 2)
  assert.equal(summary.missing, 1)
  assert.deepEqual(summary.missingNames, ['Cara'])
  assert.equal(summary.passed, 1)
  assert.equal(summary.failed, 2)
  assert.equal(summary.needsReview, 2)
})
