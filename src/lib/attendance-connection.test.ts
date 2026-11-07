import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAttendanceConnection, type AttendanceSource } from './attendance-connection'

test('reconnects errors and silent stalls without discarding the last attendance', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
  const sources: Array<AttendanceSource & { closed: boolean }> = []
  const states: unknown[] = [], connections: boolean[] = []
  const active = createAttendanceConnection({
    createSource: () => { const source = { onmessage: null, onerror: null, closed: false, close() { this.closed = true } }; sources.push(source); return source },
    onState: s => states.push(s), onConnection: s => connections.push(s),
  })
  const roster = { type: 'state', matched: [{ whatsappName: 'Amira' }], absent: [] }
  sources[0].onmessage!({ data: JSON.stringify(roster) })
  assert.equal(connections.at(-1), true)
  const staleCallback = sources[0].onmessage!
  sources[0].onerror!()
  assert.equal(sources[0].closed, true)
  assert.equal(connections.at(-1), false)
  assert.deepEqual(states, [roster])
  t.mock.timers.tick(1000)
  assert.equal(sources.length, 2)
  staleCallback({ data: JSON.stringify({ ...roster, matched: [] }) })
  sources[1].onmessage!({ data: '{broken' })
  assert.deepEqual(states, [roster])
  t.mock.timers.tick(80_000)
  t.mock.timers.tick(2000)
  assert.equal(sources.length, 3)
  sources[2].onmessage!({ data: JSON.stringify(roster) })
  assert.equal(connections.at(-1), true)
  active.stop()
  t.mock.timers.tick(300_000)
  assert.equal(sources.length, 3)
  assert(sources.every(s => s.closed))
})

test('manual resume replaces one stream and cancels pending retries', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
  const sources: AttendanceSource[] = []
  const active = createAttendanceConnection({
    createSource: () => { const s: AttendanceSource = { onmessage: null, onerror: null, close() {} }; sources.push(s); return s },
    onState() {}, onConnection() {},
  })
  sources[0].onerror!(); active.reconnect()
  t.mock.timers.tick(5000)
  assert.equal(sources.length, 2)
  active.stop()
})
