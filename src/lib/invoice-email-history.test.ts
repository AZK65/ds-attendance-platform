import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdtempSync, openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NextRequest } from 'next/server'

const databaseFile = path.join(mkdtempSync(path.join(tmpdir(), 'invoice-email-test-')), 'test.db')
closeSync(openSync(databaseFile, 'wx'))
process.env.DATABASE_URL = `file:${databaseFile}`
let prisma: typeof import('./db').prisma
let send: typeof import('../app/api/invoice/send-email/route').POST
let history: typeof import('../app/api/invoice/[id]/emails/route').GET
const originalFetch = global.fetch
const originalKey = process.env.RESEND_API_KEY
let sends = 0
let provider: () => Promise<Response> = async () => Response.json({ id: 'provider-test' })
before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' })
  prisma = (await import('./db')).prisma
  send = (await import('../app/api/invoice/send-email/route')).POST
  history = (await import('../app/api/invoice/[id]/emails/route')).GET
  process.env.RESEND_API_KEY = 'test-only'
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails')
    assert.match((init?.headers as Record<string, string>)['Idempotency-Key'], /^invoice-email\//)
    sends++
    return provider()
  }
  await prisma.invoiceSettings.create({ data: { id: 'default', senderEmail: 'school@example.com' } })
  for (const id of ['one', 'two']) await prisma.invoice.create({ data: { id, invoiceNumber: `TEST-${id}`, studentName: 'Test Student', invoiceDate: '2026-11-13', lineItems: '[]', subtotal: 150, total: 150 } })
})
after(async () => {
  global.fetch = originalFetch
  if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey
  await prisma?.$disconnect()
})
const request = (extra = {}) => new NextRequest('http://localhost/api/invoice/send-email', { method: 'POST', body: JSON.stringify({ invoiceId: 'one', invoiceNumber: 'TEST-one', to: 'student@example.com', pdfBase64: 'cGRm', ...extra }) })
const read = async (id = 'one') => (await history(new Request('http://localhost'), { params: Promise.resolve({ id }) })).json()

test('successful sends persist recipient, time and provider ID without storing the PDF', async () => {
  assert.equal((await send(request())).status, 200)
  const { attempts } = await read()
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].status, 'sent')
  assert.equal(attempts[0].recipient, 'student@example.com')
  assert.equal(attempts[0].providerId, 'provider-test')
  assert.ok(attempts[0].sentAt)
  assert.equal(JSON.stringify(attempts).includes('cGRm'), false)
  assert.equal((await read('two')).attempts.length, 0)
})
test('resends make separate history entries and invoice-number fallback works', async () => {
  assert.equal((await send(request({ invoiceId: null }))).status, 200)
  assert.equal((await read()).attempts.length, 2)
})
test('provider rejection and missing configuration are recorded as failures', async () => {
  provider = async () => Response.json({ message: 'Sender domain is not verified.' }, { status: 403 })
  assert.equal((await send(request())).status, 500)
  const rejected = (await read()).attempts.find((a: { error: string }) => a.error === 'Sender domain is not verified.')
  assert.equal(rejected.status, 'failed')
  delete process.env.RESEND_API_KEY
  const before = sends
  await send(request())
  assert.equal(sends, before)
  assert.ok((await read()).attempts.some((a: { status: string; error: string }) => a.status === 'failed' && a.error.includes('not configured')))
  process.env.RESEND_API_KEY = 'test-only'
})
test('network and server errors have an unknown outcome, not a false failed/sent status', async () => {
  for (const response of [async (): Promise<Response> => { throw new Error('network interrupted') }, async () => new Response('', { status: 503 })]) {
    provider = response
    const result = await send(request())
    assert.match((await result.json()).error, /Check before sending again/)
  }
  assert.equal((await read()).attempts.filter((a: { status: string }) => a.status === 'unknown').length, 2)
})
test('invalid recipient and mismatched invoice never send or create a misleading log', async () => {
  const before = sends
  const count = await prisma.invoiceEmailAttempt.count()
  assert.equal((await send(request({ to: 'bad' }))).status, 400)
  assert.equal((await send(request({ invoiceNumber: 'TEST-two' }))).status, 400)
  assert.equal(sends, before)
  assert.equal(await prisma.invoiceEmailAttempt.count(), count)
})
test('accepted emails are not marked failed when updating history fails', async () => {
  provider = async () => Response.json({ id: 'accepted-id' })
  const update = prisma.invoiceEmailAttempt.update
  prisma.invoiceEmailAttempt.update = () => { throw new Error('simulated database outage') }
  try {
    const response = await send(request())
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.success, true)
    assert.match(body.warning, /history/)
  } finally { prisma.invoiceEmailAttempt.update = update }
})
test('stale attempts show unknown and historical receipts use only recorded facts', async () => {
  await prisma.invoiceEmailAttempt.create({ data: { invoiceId: 'two', recipient: 'other@example.com', attemptedAt: new Date('2026-01-01') } })
  await prisma.onlinePaymentInvoiceEmail.create({ data: { invoiceId: 'two', sentAt: new Date('2026-02-01') } })
  const { attempts } = await read('two')
  assert.equal(attempts.find((a: { id: string }) => a.id === 'legacy-receipt').recipient, '')
  assert.ok(attempts.some((a: { status: string }) => a.status === 'unknown'))
  assert.equal((await history(new Request('http://localhost'), { params: Promise.resolve({ id: 'missing' }) })).status, 404)
})

test('a failed initial history write does not send an unlogged email', async () => {
  const create = prisma.invoiceEmailAttempt.create
  const before = sends
  prisma.invoiceEmailAttempt.create = () => { throw new Error('simulated database outage') }
  try {
    const response = await send(request())
    assert.equal(response.status, 500)
    assert.equal(sends, before)
    assert.match((await response.json()).error, /could not be started/)
  } finally { prisma.invoiceEmailAttempt.create = create }
})
