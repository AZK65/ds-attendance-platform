import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { mkdtempSync, openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NextRequest } from 'next/server'
import { profileFields, validateProfileFields, type StudentProfileFields } from './student-profile-fields'
import type { StudentRecord, editStudentProfile } from './external-db'

const file = path.join(mkdtempSync(path.join(tmpdir(), 'qazi-profile-test-')), 'test.db')
closeSync(openSync(file, 'wx')); process.env.DATABASE_URL = `file:${file}`
let prisma: typeof import('./db').prisma
let service: typeof import('./student-profile-edit')
let route: typeof import('../app/api/students/[studentId]/edit/route')
let attendance: typeof import('../app/api/scheduling/attendance/route')
const student: StudentRecord = { student_id: 42, full_name: 'Amira Bennett', phone_number: '15145550147', permit_number: 'A123',
  full_address: '12 Cedar Road', city: 'Montreal', postal_code: 'H3N1S2', email: '', dob: '2000-04-09', status: 'new', contract_number: 2100, user_defined_contract_number: null }
const fields = () => profileFields(student as unknown as Record<string, unknown>)
before(async () => {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' })
  prisma = (await import('./db')).prisma; service = await import('./student-profile-edit')
  route = await import('../app/api/students/[studentId]/edit/route')
  attendance = await import('../app/api/scheduling/attendance/route')
})
after(async () => { await prisma?.$disconnect() })

test('profile validates all fields without accepting attendance, phone or financial edits', () => {
  assert.equal(validateProfileFields({ ...fields(), email: ' amira@example.com ' }).email, 'amira@example.com')
  assert.equal(validateProfileFields({ ...fields(), apartment: ' Suite 205 ' }).apartment, 'Suite 205')
  assert.throws(() => validateProfileFields({ ...fields(), apartment: 'x'.repeat(256) }))
  for (const patch of [{ full_name: '' }, { email: 'invalid' }, { dob: '2026-02-30' }, { dob: '2000-04-09extra' },
    { user_defined_contract_number: 2.5 }, { phone_number: '15145559999' }, { sortie5Date: '2026-05-02' }, { balance: 0 }]) {
    assert.throws(() => validateProfileFields({ ...fields(), ...patch }))
  }
  assert.equal(profileFields({ ...student, dob: new Date('2000-04-09T00:00:00Z') }).dob, '2000-04-09')
})

test('profile write requires sign in, same origin and a staff session', async () => {
  const ctx = { params: Promise.resolve({ studentId: '42' }) }
  const request = (headers = {}) => new NextRequest('https://school.test/api/students/42/edit', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ fields: fields(), revision: 'x' }) })
  assert.equal((await route.PATCH(request(), ctx)).status, 401)
  assert.equal((await route.PATCH(request({ cookie: 'auth-token=valid', origin: 'https://bad.test' }), ctx)).status, 403)
  assert.equal((await route.PATCH(request({ cookie: 'auth-token=valid' }), ctx)).status, 401)
})

test('saving mirrors core details, audits changes and preserves class dates and phone', async () => {
  const local = await prisma.student.create({ data: { name: student.full_name, phone: student.phone_number, licenceNumber: 'A123', apartment: 'Apt 4', sortie5Date: '2026-05-02' } })
  assert.equal((await service.loadEditableProfile(42, async () => student))?.fields.apartment, 'Apt 4')
  let saved: StudentProfileFields | null = null
  const roster: typeof editStudentProfile = async (_id, operation) => operation(student, async next => { saved = next })
  const next = { ...fields(), full_name: 'Amira Ali Bennett', email: 'amira@example.com', full_address: '18 Cedar Road', apartment: 'Suite 205', user_defined_contract_number: 4321 }
  const revision = service.profileRevision(student, local)
  await service.saveEditableProfile(42, next, revision, 'Synthetic staff', roster)
  assert.deepEqual(saved, next)
  const updated = await prisma.student.findUniqueOrThrow({ where: { id: local.id } })
  assert.equal(updated.email, next.email); assert.equal(updated.name, next.full_name)
  assert.equal(updated.apartment, 'Suite 205')
  assert.equal((await service.loadEditableProfile(42, async () => student))?.fields.apartment, 'Suite 205')
  assert.equal(updated.sortie5Date, '2026-05-02'); assert.equal(updated.phone, student.phone_number)
  assert.equal(await prisma.appPreference.count({ where: { key: { startsWith: 'student-profile-edit:42:' } } }), 1)
  await assert.rejects(service.saveEditableProfile(42, next, revision, 'Staff', roster), /Profile changed/)
  const fail: typeof editStudentProfile = async (_id, operation) => operation(student, async () => { throw new Error('Roster unavailable') })
  await assert.rejects(service.saveEditableProfile(42, { ...next, email: 'wrong@example.com' }, service.profileRevision(student, updated), 'Staff', fail), /Roster unavailable/)
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: local.id } })).email, next.email)
  assert.equal(await prisma.appPreference.count({ where: { key: { startsWith: 'student-profile-edit:42:' } } }), 1)
  await service.saveEditableProfile(42, { ...next, apartment: '' }, service.profileRevision(student, updated), 'Staff', roster)
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: local.id } })).apartment, null)
})

test('marking a class absent saves false instead of erasing its attendance', async () => {
  const req = new NextRequest('http://localhost/api/scheduling/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: 'synthetic-class', present: false }) })
  assert.equal((await attendance.POST(req)).status, 200)
  assert.equal((await prisma.classAttendance.findUniqueOrThrow({ where: { eventId: 'synthetic-class' } })).present, false)
})
