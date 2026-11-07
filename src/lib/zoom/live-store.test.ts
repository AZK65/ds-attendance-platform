import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdtempSync, openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NextRequest } from 'next/server'

const file = path.join(mkdtempSync(path.join(tmpdir(), 'zoom-preserve-')), 'test.db')
closeSync(openSync(file, 'wx')); process.env.DATABASE_URL = `file:${file}`
let prisma: typeof import('../db').prisma
let store: typeof import('./live-store')
before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' })
  prisma = (await import('../db')).prisma
  await prisma.appPreference.create({ data: { key: 'zoom:live-state', value: JSON.stringify({ currentMeeting: {
    meetingId: 'room', meetingUUID: 'instance-1', topic: 'Theory', startTime: new Date().toISOString(), isLive: true,
    participants: [{ user_id: 'student-1', user_name: 'Amira Bennett', join_time: new Date().toISOString() }],
  }, manualOverrides: [{ groupId: 'group', overrides: [{ phone: '15145550147', zoomName: 'Amira', setBy: 'Staff', setAt: new Date().toISOString() }] }] }) } })
  store = await import('./live-store')
})
after(async () => { await store.flushLiveState(); await prisma.$disconnect() })

test('concurrent cold-start readers restore participants and manual matches before serving', async () => {
  await Promise.all([store.hydrateFromDb(), store.hydrateFromDb()])
  assert.equal(store.getCurrentState().participants.length, 1)
  assert.equal(store.getManualOverrides('group').length, 1)
  await store.flushLiveState()
})

test('an ended meeting timer cannot clear a restarted live class or its matches', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  store.handleMeetingEnded({ object: { id: 'room', uuid: 'instance-1' } })
  store.handleMeetingStarted({ object: { id: 'room', uuid: 'instance-2', topic: 'Theory continued', start_time: new Date().toISOString() } })
  t.mock.timers.tick(3 * 60 * 60 * 1000)
  assert.equal(store.getCurrentState().isLive, true)
  assert.equal(store.getCurrentState().participants.length, 1)
  assert.equal(store.getManualOverrides('group').length, 1)
  store.handleMeetingEnded({ object: { id: 'room', uuid: 'instance-1' } })
  assert.equal(store.getCurrentState().isLive, true, 'late ended event from previous instance ignored')
  const { autoSaveAttendanceOnMeetingEnd } = await import('./auto-save-attendance')
  assert.equal((await autoSaveAttendanceOnMeetingEnd({ meetingId: 'room', meetingUUID: 'instance-1' })).saved, false)
  await store.flushLiveState()
  const saved = JSON.parse((await prisma.appPreference.findUniqueOrThrow({ where: { key: 'zoom:live-state' } })).value)
  assert.equal(saved.currentMeeting.meetingUUID, 'instance-2')
  assert.equal(saved.currentMeeting.participants.length, 1)
  assert.equal(saved.manualOverrides.length, 1)
})

test('API resume without new participants persists metadata and cancels ended cleanup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  store.handleMeetingEnded({ object: { id: 'room', uuid: 'instance-2' } })
  store.hydrateFromApi({ meetingId: 'room', meetingUUID: 'instance-3', participants: [] })
  await store.flushLiveState()
  t.mock.timers.tick(3 * 60 * 60 * 1000)
  assert.equal(store.getCurrentState().isLive, true)
  const saved = JSON.parse((await prisma.appPreference.findUniqueOrThrow({ where: { key: 'zoom:live-state' } })).value)
  assert.equal(saved.currentMeeting.endedAt, undefined)
  assert.equal(saved.currentMeeting.participants.length, 1)
})

test('attendance stream serves the restored roster and closes cleanly on abort and cancel', async () => {
  const { GET } = await import('../../app/api/zoom/live-stream/route')
  const abort = new AbortController()
  const response = await GET(new NextRequest('http://school.test/api/zoom/live-stream', { signal: abort.signal }))
  const reader = response.body!.getReader()
  const frame = new TextDecoder().decode((await reader.read()).value)
  const data = JSON.parse(frame.replace(/^data: /, '').trim())
  assert.equal(data.participantCount, 1)
  assert.equal(data.isLive, true)
  abort.abort()
  assert.equal((await reader.read()).done, true)
  const second = await GET(new NextRequest('http://school.test/api/zoom/live-stream'))
  await second.body!.cancel()
  assert.equal(store.getCurrentState().participants.length, 1)
})
