import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lookupWhatsAppNumber } from './number-check'

test('checks the normalized number without sending a message', async () => {
  const calls: string[] = []
  assert.deepEqual(await lookupWhatsAppNumber('(514) 555-1111', async phone => {
    calls.push(phone)
    return { _serialized: `${phone}@c.us` }
  }), { registered: true, jid: '15145551111@c.us' })
  assert.deepEqual(calls, ['15145551111'])
})

test('only successful negative lookups report not registered', async () => {
  assert.deepEqual(await lookupWhatsAppNumber('15145551111', async () => null), { registered: false })
})

test('errors and malformed responses are unavailable, not unregistered', async () => {
  await assert.rejects(() => lookupWhatsAppNumber('15145551111', async () => { throw new Error('disconnected') }), /could not verify/)
  await assert.rejects(() => lookupWhatsAppNumber('15145551111', async () => ({ _serialized: '' })), /could not verify/)
  await assert.rejects(() => lookupWhatsAppNumber('5145551111', async phone => {
    if (phone.startsWith('1')) throw new Error('disconnected')
    return null
  }), /could not verify/)
})

test('a stalled lookup times out without verifying the number', async () => {
  await assert.rejects(() => lookupWhatsAppNumber('15145551111', () => new Promise(() => {}), 5), /could not verify/)
})
