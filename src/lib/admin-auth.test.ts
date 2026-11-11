import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'
import { NextRequest } from 'next/server'
import { signAdminToken, verifyAdminToken } from './admin-token'

const databaseFile = path.join(mkdtempSync(path.join(tmpdir(), 'qazi-admin-auth-')), 'test.db')
closeSync(openSync(databaseFile, 'wx'))
process.env.DATABASE_URL = `file:${databaseFile}`
process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret'
process.env.INTERNAL_AUTH_SECRET = 'test-internal-secret-value'
process.env.AUTH_PASSWORD = 'test-password'

let prisma: typeof import('./db').prisma
let middleware: typeof import('../middleware').middleware
let middlewareConfig: typeof import('../middleware').config
let authRoute: typeof import('../app/api/auth/route')
let uploadRoute: typeof import('../app/api/lms/admin/upload/route')

before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], {
    env: process.env,
    stdio: 'pipe',
  })
  prisma = (await import('./db')).prisma
  const gate = await import('../middleware')
  middleware = gate.middleware
  middlewareConfig = gate.config
  authRoute = await import('../app/api/auth/route')
  uploadRoute = await import('../app/api/lms/admin/upload/route')
})

function request(pathname: string, headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest(`https://qazidrivingschool.ca${pathname}`, { method, headers })
}

async function sessionCookie(sid: string) {
  await prisma.adminSession.create({ data: { id: sid, label: sid } })
  const token = signAdminToken(sid)
  assert.ok(token)
  return `auth-token=${token}; sid=${sid}`
}

test('matcher still excludes the large-body routes', () => {
  assert.match(middlewareConfig.matcher[0], /api\/lms\/admin\/upload/)
  assert.match(middlewareConfig.matcher[0], /api\/inbox\/media/)
})

test('forged auth-token=valid or a random sid is rejected', async () => {
  const page = await middleware(request('/students', { cookie: 'auth-token=valid' }))
  assert.equal(page.status, 307)
  assert.match(page.headers.get('location') || '', /\/login$/)

  const api = await middleware(request('/api/students', { cookie: 'auth-token=valid' }))
  assert.equal(api.status, 401)
  assert.equal((await api.json()).error, 'Unauthorized')

  const randomSid = await middleware(request('/api/invoices', { cookie: 'auth-token=valid; sid=not-a-real-session' }))
  assert.equal(randomSid.status, 401)

  const tampered = signAdminToken('nobody')
  assert.ok(tampered)
  assert.equal(verifyAdminToken(tampered + 'x'), null)
  assert.equal(verifyAdminToken('valid'), null)
  assert.equal(verifyAdminToken(tampered, Date.now() + 366 * 24 * 60 * 60 * 1000), null)

  const heartbeat = await import('../app/api/auth/heartbeat/route')
  const beforeCount = await prisma.adminSession.count()
  const beat = await heartbeat.POST(request('/api/auth/heartbeat', { cookie: 'auth-token=valid' }, 'POST'))
  assert.equal((await beat.json()).valid, false)
  assert.equal(await prisma.adminSession.count(), beforeCount)
})

test('a real session is accepted, refreshed, and survives the legacy cookie', async () => {
  const cookie = await sessionCookie('sess-valid')
  const page = await middleware(request('/students', { cookie }))
  assert.equal(page.status, 200)
  const refreshed = page.cookies.get('auth-token')?.value || ''
  assert.match(refreshed, /^v1\.sess-valid\.\d+\./)
  assert.equal(page.cookies.get('sid')?.value, 'sess-valid')
  assert.notEqual(refreshed, 'valid')

  await prisma.adminSession.create({ data: { id: 'sess-legacy' } })
  const legacy = await middleware(request('/api/students', { cookie: 'auth-token=valid; sid=sess-legacy' }))
  assert.equal(legacy.status, 200)
  assert.match(legacy.cookies.get('auth-token')?.value || '', /^v1\.sess-legacy\./)

  const authed = await authRoute.GET(request('/api/auth', { cookie: 'auth-token=valid; sid=sess-legacy' }))
  assert.equal((await authed.json()).authed, true)
  const anonymous = await authRoute.GET(request('/api/auth', { cookie: 'auth-token=valid' }))
  assert.equal((await anonymous.json()).authed, false)
})

test('logout and device revoke end access', async () => {
  const cookie = await sessionCookie('sess-revoked')
  const token = cookie.split(';')[0].slice('auth-token='.length)
  await prisma.adminSession.delete({ where: { id: 'sess-revoked' } })
  const revoked = await middleware(request('/api/students', { cookie }))
  assert.equal(revoked.status, 401)
  assert.equal(verifyAdminToken(token)?.sid, 'sess-revoked')

  const login = await authRoute.POST(new NextRequest('https://qazidrivingschool.ca/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'test-password' }),
  }))
  assert.equal(login.status, 200)
  const sid = login.cookies.get('sid')?.value
  const signed = login.cookies.get('auth-token')?.value
  assert.ok(sid)
  assert.match(signed || '', new RegExp(`^v1\\.${sid}\\.`))
  assert.notEqual(signed, 'valid')
  const loggedIn = `auth-token=${signed}; sid=${sid}`
  assert.equal((await middleware(request('/students', { cookie: loggedIn }))).status, 200)

  const logout = await authRoute.DELETE(request('/api/auth', { cookie: loggedIn }))
  assert.equal(logout.status, 200)
  assert.equal(await prisma.adminSession.findUnique({ where: { id: sid } }), null)
  assert.equal((await middleware(request('/api/settings', { cookie: loggedIn }))).status, 401)

  const wrong = await authRoute.POST(new NextRequest('https://qazidrivingschool.ca/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'nope' }),
  }))
  assert.equal(wrong.status, 401)
})

test('spoofed x-internal is rejected and the shared secret is accepted', async () => {
  const spoofed = await middleware(request('/api/scheduled-messages/process', {
    'x-internal': '1',
    host: 'localhost:3000',
  }, 'POST'))
  assert.equal(spoofed.status, 401)

  const wrongSecret = await middleware(request('/api/whatsapp/connect', {
    'x-internal-secret': 'not-the-real-secret',
    'x-internal': '1',
  }, 'POST'))
  assert.equal(wrongSecret.status, 401)

  const allowed = await middleware(request('/api/scheduled-messages/process', {
    'x-internal-secret': 'test-internal-secret-value',
  }, 'POST'))
  assert.equal(allowed.status, 200)
})

test('excluded upload route checks the session itself', async () => {
  const forged = await uploadRoute.POST(new NextRequest('http://localhost/api/lms/admin/upload', {
    method: 'POST',
    headers: { cookie: 'auth-token=valid', 'x-internal': '1' },
  }))
  assert.equal(forged.status, 401)

  const cookie = await sessionCookie('sess-upload')
  const form = new FormData()
  const accepted = await uploadRoute.POST(new NextRequest('http://localhost/api/lms/admin/upload', {
    method: 'POST',
    headers: { cookie },
    body: form,
  }))
  assert.equal(accepted.status, 400)

  await prisma.adminSession.delete({ where: { id: 'sess-upload' } })
  const revoked = await uploadRoute.POST(new NextRequest('http://localhost/api/lms/admin/upload', {
    method: 'POST',
    headers: { cookie },
  }))
  assert.equal(revoked.status, 401)

  const internal = await uploadRoute.POST(new NextRequest('http://localhost/api/lms/admin/upload', {
    method: 'POST',
    headers: { 'x-internal-secret': 'test-internal-secret-value' },
    body: new FormData(),
  }))
  assert.equal(internal.status, 400)
})

test('a signed token for a different sid is rejected', async () => {
  const cookie = await sessionCookie('sess-a')
  const other = signAdminToken('sess-b')
  await prisma.adminSession.create({ data: { id: 'sess-b' } })
  const mixed = await middleware(request('/api/students', { cookie: `auth-token=${other}; sid=sess-a` }))
  assert.equal(mixed.status, 401)
  assert.match(cookie, /sess-a/)
})

test('public paths, study host, and registration CORS stay open', async () => {
  assert.equal((await middleware(request('/login'))).status, 200)
  assert.equal((await middleware(request('/api/auth'))).status, 200)
  assert.equal((await middleware(request('/qazi-logo.png', { cookie: 'auth-token=valid' }))).status, 200)

  const studyAdmin = await middleware(new NextRequest('https://study.qazidrivingschool.ca/api/lms/admin/content', {
    headers: { host: 'study.qazidrivingschool.ca' },
  }))
  assert.equal(studyAdmin.status, 404)

  const studyPage = await middleware(new NextRequest('https://study.qazidrivingschool.ca/lesson/1', {
    headers: { host: 'study.qazidrivingschool.ca' },
  }))
  assert.match(studyPage.headers.get('x-middleware-rewrite') || '', /\/study\/lesson\/1$/)

  const book = await middleware(request('/book'))
  assert.equal(book.status, 308)
  assert.equal(book.headers.get('location'), 'https://qazidriving.ca/book')

  const preflight = await middleware(new NextRequest('https://qazidrivingschool.ca/api/register', {
    method: 'OPTIONS',
    headers: { origin: 'https://qazidriving.ca', host: 'qazidrivingschool.ca' },
  }))
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://qazidriving.ca')

  const lms = await middleware(request('/api/lms/lessons'))
  assert.equal(lms.status, 200)
})
