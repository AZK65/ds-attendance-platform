import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { NextRequest } from 'next/server'
import { isValidWhatsAppQr } from './qr-payload'

const state = {
  client: null as unknown,
  qr: 'synthetic-old-qr' as string | null,
  isConnected: false, isConnecting: true,
  groupsCache: [], lastGroupSync: 0, lastQrAt: Date.now(),
  command: null as Promise<void> | null, lastCommandAt: 0,
  authenticatedAt: undefined as number | undefined,
  intentionalDisconnect: false,
}
let client: typeof import('./client')
let connectRoute: typeof import('../../app/api/whatsapp/connect/route')
let statusRoute: typeof import('../../app/api/whatsapp/status/route')
let qrRoute: typeof import('../../app/api/whatsapp/qr/route')
before(async () => {
  Object.assign(globalThis, { whatsappState: state })
  client = await import('./client')
  connectRoute = await import('../../app/api/whatsapp/connect/route')
  statusRoute = await import('../../app/api/whatsapp/status/route')
  qrRoute = await import('../../app/api/whatsapp/qr/route')
})

test('new QR action invokes the browser and simultaneous requests coalesce', async () => {
  let calls = 0
  state.client = { pupPage: { evaluate: async (code: string) => {
    calls++
    assert.match(code, /refreshQR/)
    await new Promise(resolve => setTimeout(resolve, 5))
    state.qr = 'synthetic-new-qr'
    state.lastQrAt += 1
    return true
  } } }
  client.requestWhatsAppConnection('refresh')
  client.requestWhatsAppConnection('refresh')
  await state.command
  assert.equal(calls, 1)
  assert.equal(state.qr, 'synthetic-new-qr')
})
test('refresh does not interrupt a recently authenticated phone', async () => {
  state.lastCommandAt = 0
  state.authenticatedAt = Date.now()
  state.client = { pupPage: { evaluate: () => { throw new Error('Must not run') } } }
  client.requestWhatsAppConnection('refresh')
  assert.equal(state.command, null)
  state.authenticatedAt = undefined
})
test('ordinary status responses do not expose raw pairing secrets and are not cached', async () => {
  state.client = { pupPage: { evaluate: async () => 'ref,noise,identity,secret,1' } }
  const response = await statusRoute.GET()
  assert.equal('qr' in await response.json(), false)
  assert.match(response.headers.get('cache-control')!, /no-store/)
  const qrResponse = await qrRoute.GET()
  assert.match((await qrResponse.json()).qrImage, /^data:image\/png;base64,/)
  assert.match(qrResponse.headers.get('cache-control')!, /no-store/)
})

test('malformed fork QR is rejected and the native page QR is used', async () => {
  assert.equal(isValidWhatsAppQr('ref,noise,identity,secret,undefined'), false)
  assert.equal(isValidWhatsAppQr('ref,noise,identity,secret,'), false)
  assert.equal(isValidWhatsAppQr('ref,noise,identity,secret,1'), true)
  state.qr = 'ref,noise,identity,secret,undefined'
  state.client = { pupPage: { evaluate: async () => 'native,noise,identity,secret,1' } }
  assert.equal(await client.getWhatsAppQrCode(), 'native,noise,identity,secret,1')
  state.client = { pupPage: { evaluate: async () => 'invalid,undefined' } }
  assert.equal(await client.getWhatsAppQrCode(), null)
})
test('session wipe and unknown recovery commands are rejected', async () => {
  for (const body of [{ wipe: true }, { action: 'erase' }]) {
    const response = await connectRoute.POST(new NextRequest('http://localhost/api/whatsapp/connect', { method: 'POST', body: JSON.stringify(body) }))
    assert.equal(response.status, 400)
  }
})
test('connected client does not get replaced by a delayed refresh request', () => {
  state.isConnected = true
  state.lastCommandAt = 0
  client.requestWhatsAppConnection('refresh')
  assert.equal(state.command, null)
})
