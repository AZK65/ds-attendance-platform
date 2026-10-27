import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { normalizeNorthAmericanPhone } from './phone-normalize'
import type {
  PhoneChangeActor,
  RosterGateway,
  RosterStudent,
  applyPhoneChange as ApplyPhoneChange,
  listPhoneChanges as ListPhoneChanges,
  previewPhoneChange as PreviewPhoneChange,
} from './phone-change'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dbDir = mkdtempSync(path.join(tmpdir(), 'phone-change-'))
process.env.DATABASE_URL = `file:${path.join(dbDir, 'test.db')}`

let applyPhoneChange: typeof ApplyPhoneChange
let previewPhoneChange: typeof PreviewPhoneChange
let listPhoneChanges: typeof ListPhoneChanges
let prisma: typeof import('./db').prisma

const actor: PhoneChangeActor = { sessionId: 'session-1', label: 'Front desk iPad' }
const rosterRows = new Map<number, RosterStudent>()

function roster(): RosterGateway {
  return {
    async updatePhone(studentId, phoneNumber) {
      const row = rosterRows.get(studentId)
      if (!row) throw new Error('missing roster student')
      row.phone_number = phoneNumber
    },
    async findByPhone(phone) {
      const key = normalizeNorthAmericanPhone(phone)?.last10
      return [...rosterRows.values()].filter(row => normalizeNorthAmericanPhone(row.phone_number)?.last10 === key)
    },
    async getById(studentId) {
      return rosterRows.get(studentId) ?? null
    },
  }
}

before(async () => {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })
  const phoneChange = await import('./phone-change')
  applyPhoneChange = phoneChange.applyPhoneChange
  previewPhoneChange = phoneChange.previewPhoneChange
  listPhoneChanges = phoneChange.listPhoneChanges
  prisma = (await import('./db')).prisma
})

async function reset() {
  rosterRows.clear()
  await prisma.phoneChangeLog.deleteMany()
  await prisma.bookingVerification.deleteMany()
  await prisma.scheduledMessage.deleteMany()
  await prisma.classSignature.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.attendanceSheet.deleteMany()
  await prisma.groupMember.deleteMany()
  await prisma.certificate.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.rsep1ResultSheet.deleteMany()
  await prisma.studentRegistration.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.group.deleteMany()
  await prisma.student.deleteMany()
}

test('normalizes North American numbers and WhatsApp jids', () => {
  assert.equal(normalizeNorthAmericanPhone('15145460150')?.digits, '15145460150')
  assert.equal(normalizeNorthAmericanPhone('15145460150@c.us')?.digits, '15145460150')
  assert.equal(normalizeNorthAmericanPhone('15145460150@s.whatsapp.net')?.digits, '15145460150')
  assert.equal(normalizeNorthAmericanPhone('(514) 546-0150')?.digits, '15145460150')
  assert.equal(normalizeNorthAmericanPhone('514-546-0150')?.digits, '15145460150')
  assert.equal(normalizeNorthAmericanPhone('+1 514 546 0150')?.digits, '15145460150')
  assert.equal(normalizeNorthAmericanPhone('1 (514) 546-0150')?.display, '+1 (514) 546-0150')
  assert.equal(normalizeNorthAmericanPhone('12345'), null)
  assert.equal(normalizeNorthAmericanPhone(''), null)
  assert.equal(normalizeNorthAmericanPhone('447911123456'), null)
  assert.equal(normalizeNorthAmericanPhone('10005460150'), null)
  assert.equal(normalizeNorthAmericanPhone('12001234567@g.us'), null)
})

test('duplicate check names the other student and contact', async () => {
  await reset()
  rosterRows.set(1, { student_id: 1, full_name: 'Alice Example', phone_number: '15145551111' })
  rosterRows.set(2, { student_id: 2, full_name: 'Bob Example', phone_number: '(514) 555-2222' })
  await prisma.student.create({ data: { id: 'local-alice', name: 'Alice Example', phone: '15145551111' } })
  await prisma.student.create({ data: { id: 'local-bob', name: 'Bob Example', phone: '5145552222' } })
  await prisma.contact.create({ data: { id: '15145552222@c.us', phone: '15145552222', name: 'Bob Example' } })

  const preview = await previewPhoneChange({
    oldPhone: '15145551111@c.us',
    newPhone: '514-555-2222',
    externalStudentId: 1,
    localStudentId: 'local-alice',
    contactId: '15145551111@c.us',
    name: 'Alice Example',
  }, roster())

  assert.equal(preview.sameNumber, false)
  assert.equal(preview.normalized.digits, '15145552222')
  const kinds = preview.duplicates.map(item => `${item.kind}:${item.name}`).sort()
  assert.deepEqual(kinds, ['contact:Bob Example', 'roster:Bob Example', 'student:Bob Example'])
})

test('record update keeps links and signed records, and writes history', async () => {
  await reset()
  rosterRows.set(1, { student_id: 1, full_name: 'Alice Example', phone_number: '15145551111' })
  const oldPhone = '15145551111'
  const newPhone = '15145553333'
  const oldJid = `${oldPhone}@c.us`

  await prisma.student.create({ data: { id: 'local-alice', name: 'Alice Example', phone: '514-555-1111' } })
  await prisma.contact.create({ data: { id: oldJid, phone: oldPhone, name: 'Alice Example', pushName: 'Alice' } })
  await prisma.group.create({ data: { id: 'group-1@g.us', name: 'Monday Theory' } })
  await prisma.groupMember.create({
    data: { id: 'member-1', groupId: 'group-1@g.us', contactId: oldJid, phone: oldPhone },
  })
  await prisma.attendanceSheet.create({ data: { id: 'sheet-1', groupId: 'group-1@g.us', name: 'Monday' } })
  await prisma.attendanceRecord.create({
    data: { id: 'att-1', attendanceSheetId: 'sheet-1', contactId: oldJid, status: 'present' },
  })
  await prisma.certificate.create({
    data: { id: 'cert-1', studentId: 'local-alice', certificateType: 'phase1', contractNumber: '100' },
  })
  await prisma.invoice.create({
    data: {
      id: 'inv-1',
      invoiceNumber: 'INV-1',
      studentName: 'Alice Example',
      studentPhone: oldPhone,
      invoiceDate: '2026-01-01',
      lineItems: '[]',
      subtotal: 100,
      total: 100,
      externalStudentId: 1,
    },
  })
  await prisma.classSignature.create({
    data: {
      id: 'sig-1',
      eventId: 'event-1',
      studentPhone: oldPhone,
      studentName: 'Alice Example',
      signatureDataUrl: 'data:image/png;base64,abc',
    },
  })
  await prisma.studentRegistration.create({
    data: {
      id: 'reg-1',
      phoneNumber: '(514) 555-1111',
      fullName: 'Alice Example',
      signatureImage: 'data:image/png;base64,signed',
      externalId: 1,
      expiresAt: new Date('2026-12-31'),
    },
  })
  await prisma.rsep1ResultSheet.create({
    data: {
      id: 'sheet-rsep',
      externalStudentId: 1,
      values: '{"hours":12}',
      status: 'final',
      finalizedAt: new Date('2026-02-01'),
      finalizedBy: 'Staff',
    },
  })
  await prisma.bookingVerification.create({
    data: {
      id: 'verify-1',
      studentId: 'local-alice',
      phone: oldPhone,
      codeHash: 'hash',
      expiresAt: new Date('2026-12-31'),
    },
  })
  await prisma.scheduledMessage.create({
    data: {
      id: 'msg-pending',
      groupId: 'group-1@g.us',
      message: 'See you tonight',
      scheduledAt: new Date('2026-12-01'),
      memberPhones: JSON.stringify([oldPhone]),
      status: 'pending',
    },
  })
  await prisma.scheduledMessage.create({
    data: {
      id: 'msg-sent',
      groupId: 'group-1@g.us',
      message: 'Already sent',
      scheduledAt: new Date('2026-01-01'),
      memberPhones: JSON.stringify([oldPhone]),
      status: 'sent',
    },
  })

  const result = await applyPhoneChange({
    oldPhone: `${oldPhone}@c.us`,
    newPhone: '(514) 555-3333',
    externalStudentId: 1,
    localStudentId: 'local-alice',
    contactId: oldJid,
    name: 'Alice Example',
  }, actor, roster(), {
    status: 'registered',
    jid: `${newPhone}@c.us`,
    detail: 'This number is on WhatsApp.',
  })

  assert.equal(result.newPhone, newPhone)
  assert.equal(rosterRows.get(1)?.phone_number, newPhone)
  assert.equal((await prisma.student.findUnique({ where: { id: 'local-alice' } }))?.phone, newPhone)
  assert.equal((await prisma.contact.findUnique({ where: { id: oldJid } }))?.phone, oldPhone)
  assert.equal((await prisma.contact.findUnique({ where: { id: `${newPhone}@c.us` } }))?.name, 'Alice Example')
  const member = await prisma.groupMember.findUnique({ where: { id: 'member-1' } })
  assert.equal(member?.contactId, oldJid)
  assert.equal(member?.phone, oldPhone)
  assert.equal((await prisma.attendanceRecord.findUnique({ where: { id: 'att-1' } }))?.contactId, oldJid)
  assert.equal((await prisma.invoice.findUnique({ where: { id: 'inv-1' } }))?.studentPhone, oldPhone)
  assert.equal((await prisma.classSignature.findUnique({ where: { id: 'sig-1' } }))?.studentPhone, oldPhone)
  assert.equal((await prisma.studentRegistration.findUnique({ where: { id: 'reg-1' } }))?.phoneNumber, '(514) 555-1111')
  assert.equal((await prisma.studentRegistration.findUnique({ where: { id: 'reg-1' } }))?.signatureImage, 'data:image/png;base64,signed')
  const sheet = await prisma.rsep1ResultSheet.findUnique({ where: { id: 'sheet-rsep' } })
  assert.equal(sheet?.values, '{"hours":12}')
  assert.ok(sheet?.finalizedAt)
  assert.equal((await prisma.certificate.findMany({ where: { studentId: 'local-alice' } })).length, 1)
  assert.equal((await prisma.bookingVerification.findUnique({ where: { id: 'verify-1' } }))?.phone, newPhone)
  assert.equal(
    (await prisma.scheduledMessage.findUnique({ where: { id: 'msg-pending' } }))?.memberPhones,
    JSON.stringify([newPhone]),
  )
  assert.equal(
    (await prisma.scheduledMessage.findUnique({ where: { id: 'msg-sent' } }))?.memberPhones,
    JSON.stringify([oldPhone]),
  )
  assert.equal(result.groups.map(group => group.name).join(), 'Monday Theory')

  const logs = await listPhoneChanges({ externalStudentId: 1, contactId: oldJid, phone: newPhone })
  assert.equal(logs.length, 1)
  assert.equal(logs[0].oldPhone, oldPhone)
  assert.equal(logs[0].newPhone, newPhone)
  assert.equal(logs[0].actorLabel, 'Front desk iPad')
  assert.equal(logs[0].actorSessionId, 'session-1')
  assert.ok(logs[0].createdAt)
  assert.equal(logs[0].groupAction, 'none')
  assert.equal(logs[0].whatsappRegistered, true)
  const records = JSON.parse(logs[0].recordsUpdated)
  assert.ok(records.created.some((row: { id: string }) => row.id === `${newPhone}@c.us`))
  assert.ok(records.kept.some((row: { id: string }) => row.id === oldJid))
  assert.ok(records.updated.some((row: { store: string }) => row.store === 'roster'))
  assert.ok(records.updated.some((row: { store: string }) => row.store === 'student'))
  assert.ok(records.leftUntouched.includes('ClassSignature'))
  assert.ok(records.leftUntouched.includes('Rsep1ResultSheet'))
  assert.ok(records.leftUntouched.includes('Invoice'))
})

test('a failed roster write does not change the app records', async () => {
  await reset()
  rosterRows.set(1, { student_id: 1, full_name: 'Alice Example', phone_number: '15145551111' })
  await prisma.student.create({ data: { id: 'local-alice', name: 'Alice Example', phone: '15145551111' } })
  const failing: RosterGateway = {
    ...roster(),
    async updatePhone() {
      throw new Error('mysql down')
    },
  }
  await assert.rejects(
    () => applyPhoneChange({
      oldPhone: '15145551111',
      newPhone: '4385550199',
      externalStudentId: 1,
      localStudentId: 'local-alice',
      name: 'Alice Example',
    }, actor, failing),
    (error: unknown) => (error as Error).message.includes('master roster'),
  )
  assert.equal((await prisma.student.findUnique({ where: { id: 'local-alice' } }))?.phone, '15145551111')
  assert.equal(await prisma.phoneChangeLog.count(), 0)
  assert.equal(rosterRows.get(1)?.phone_number, '15145551111')
})
