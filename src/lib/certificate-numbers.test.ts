import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import {
  certificateConflictMessage,
  certificateFailureMessage,
  certificateNumbersEqual,
  keepStoredCertificateNumber,
  normalizeCertificateNumber,
  numberAlreadyIssued,
} from './certificate-numbers'
import type { RosterLookup } from './certificate-assignment'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dbDir = mkdtempSync(path.join(tmpdir(), 'certificate-numbers-'))
process.env.DATABASE_URL = `file:${path.join(dbDir, 'test.db')}`

let prisma: typeof import('./db').prisma
let saveCertificateStudent: typeof import('./certificate-assignment').saveCertificateStudent
let updateCertificateNumbers: typeof import('./certificate-assignment').updateCertificateNumbers
let dedupePost: (request: NextRequest) => Promise<Response>

const noRoster: RosterLookup = async () => []

before(async () => {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })
  prisma = (await import('./db')).prisma
  const assignment = await import('./certificate-assignment')
  saveCertificateStudent = assignment.saveCertificateStudent
  updateCertificateNumbers = assignment.updateCertificateNumbers
  dedupePost = (await import('../app/api/students/dedupe-local/route')).POST
})

async function reset() {
  await prisma.certificate.deleteMany()
  await prisma.student.deleteMany()
}

test('certificate numbers compare by digits, ignoring spaces and leading zeros', () => {
  assert.equal(normalizeCertificateNumber('7 5 3'), '753')
  assert.equal(normalizeCertificateNumber('00753'), '753')
  assert.equal(normalizeCertificateNumber('5  2  1  8  1  4  0'), '5218140')
  assert.equal(normalizeCertificateNumber('0'), '')
  assert.equal(normalizeCertificateNumber(null), '')
  assert.equal(certificateNumbersEqual('7 5 3', '00753'), true)
  assert.equal(certificateNumbersEqual('753', '754'), false)
  assert.equal(keepStoredCertificateNumber('7 5 3', '753'), '7 5 3')
  assert.equal(keepStoredCertificateNumber('7 5 3', '754'), '754')
})

test('a contract does not collide with the same digits stored as a barcode', () => {
  const message = certificateConflictMessage({
    subject: { name: 'Sara Khan', phone: '4385550199' },
    contractNumber: '753',
    attestationNumber: '100',
    localNamesakes: 0,
    holders: [{
      person: { name: 'Ahmed Khan', phone: '5145550101' },
      contractNumber: '100',
      attestationNumber: '753',
    }],
  })
  assert.equal(message, null)
  assert.equal(numberAlreadyIssued({
    contractNumber: '753',
    attestationNumber: '100',
    certificates: [],
    roster: [{ contract_number: 753, user_defined_contract_number: 100 }],
  }), false)
  assert.equal(numberAlreadyIssued({
    contractNumber: '753',
    attestationNumber: '800',
    certificates: [{ contractNumber: '7 5 3', attestationNumber: null }],
    roster: [],
  }), true)
  assert.equal(numberAlreadyIssued({
    contractNumber: '800',
    attestationNumber: '5218140',
    certificates: [],
    roster: [{ contract_number: 5218140, user_defined_contract_number: 100 }],
  }), true)
  assert.equal(numberAlreadyIssued({
    contractNumber: '0',
    attestationNumber: '000',
    certificates: [],
    roster: [{ contract_number: 0, user_defined_contract_number: 0 }],
  }), false)
})

test('bulk certificate failures keep the per-student reason', () => {
  const reason = 'Barcode 5218140 is already assigned to Sara Khan.'
  assert.equal(certificateFailureMessage(new Error(reason)), reason)
  assert.equal(certificateFailureMessage(reason), reason)
  assert.equal(certificateFailureMessage('   '), 'PDF generation failed')
  assert.equal(certificateFailureMessage(new Error('  ')), 'PDF generation failed')
  const page = readFileSync(path.join(root, 'src/app/certificate/page.tsx'), 'utf8')
  assert.match(page, /certificateFailureMessage\(err\)/)
  assert.match(page, /certificateFailureMessage\(bs\.ocrError\)/)
  assert.doesNotMatch(page, /ocrError: 'PDF generation failed'/)
})

test('roster numbers are refused when they belong to someone else, and kept for the same student', async () => {
  await reset()
  const stolen = await saveCertificateStudent({
    name: 'Sara Khan',
    phone: '5145550102',
    address: '9 Sara Road',
    contractNumber: '753',
    attestationNumber: '5218140',
    certificateType: 'full',
  }, {
    lookupRoster: async () => [{
      full_name: 'Ahmed Khan',
      phone_number: '5145550101',
      contract_number: 5218140,
      user_defined_contract_number: 753,
    }],
  })
  if (stolen.ok) assert.fail('expected a roster conflict')
  assert.equal(stolen.status, 409)
  assert.equal(
    stolen.error,
    'Barcode 5218140 is already assigned to Ahmed Khan. Contract 753 is already assigned to Ahmed Khan.',
  )
  assert.equal(await prisma.student.count(), 0)

  const returning = await saveCertificateStudent({
    name: 'Khan, Ahmed',
    phone: '(514) 555-0101',
    contractNumber: '100',
    attestationNumber: '5000001',
    certificateType: 'full',
  }, {
    lookupRoster: async () => [{
      full_name: 'Ahmed Khan',
      phone_number: '5145550101',
      contract_number: 5000001,
      user_defined_contract_number: 100,
    }],
  })
  if (!returning.ok) assert.fail(returning.error)
  assert.equal(returning.certificate.contractNumber, '100')
  assert.equal(returning.certificate.attestationNumber, '5000001')
  assert.equal(await prisma.certificate.count(), 1)
})

test('a sibling who shares a phone cannot take numbers or overwrite the other record', async () => {
  await reset()
  const ahmed = await prisma.student.create({
    data: { name: 'Ahmed Khan', phone: '5145550101', address: '1 Ahmed Street' },
  })
  await prisma.certificate.create({
    data: {
      studentId: ahmed.id,
      certificateType: 'full',
      contractNumber: '753',
      attestationNumber: '5218140',
    },
  })

  const stolen = await saveCertificateStudent({
    name: 'Sara Khan',
    phone: '514-555-0101',
    address: '9 Sara Road',
    localStudentId: ahmed.id,
    contractNumber: '753',
    attestationNumber: '5  2  1  8  1  4  0',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (stolen.ok) assert.fail('expected a sibling conflict')
  assert.equal(stolen.status, 409)
  assert.match(stolen.error, /Barcode 5218140 is already assigned to Ahmed Khan/)
  const unchanged = await prisma.student.findUniqueOrThrow({ where: { id: ahmed.id } })
  assert.equal(unchanged.name, 'Ahmed Khan')
  assert.equal(unchanged.address, '1 Ahmed Street')
  assert.equal(await prisma.student.count(), 1)

  const fresh = await saveCertificateStudent({
    name: 'Sara Khan',
    phone: '5145550101',
    address: '9 Sara Road',
    localStudentId: ahmed.id,
    contractNumber: '9002',
    attestationNumber: '5219002',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (!fresh.ok) assert.fail(fresh.error)
  assert.notEqual(fresh.student.id, ahmed.id)
  const ahmedAfter = await prisma.student.findUniqueOrThrow({ where: { id: ahmed.id } })
  assert.equal(ahmedAfter.name, 'Ahmed Khan')
  assert.equal(ahmedAfter.address, '1 Ahmed Street')
  assert.equal(fresh.certificate.attestationNumber, '5219002')
  assert.equal(fresh.student.name, 'Sara Khan')
})

test('spaced contract numbers conflict, and phase 1 then full keeps the stored text', async () => {
  await reset()
  const ahmed = await prisma.student.create({
    data: { name: 'Ahmed Khan', phone: '5145550101' },
  })
  const cert = await prisma.certificate.create({
    data: {
      studentId: ahmed.id,
      certificateType: 'phase1',
      contractNumber: '7 5 3',
      attestationNumber: '5218140',
    },
  })

  const other = await saveCertificateStudent({
    name: 'Sara Khan',
    phone: '4385550199',
    contractNumber: '753',
    attestationNumber: '6000001',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (other.ok) assert.fail('expected a spaced-number conflict')
  assert.equal(other.status, 409)
  assert.equal(other.error, 'Contract 753 is already assigned to Ahmed Khan.')
  assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: cert.id } })).contractNumber, '7 5 3')

  const reprint = await saveCertificateStudent({
    name: 'Khan, Ahmed',
    phone: '5145550101',
    contractNumber: '00753',
    attestationNumber: '5218140',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (!reprint.ok) assert.fail(reprint.error)
  assert.equal(reprint.certificate.id, cert.id)
  assert.equal(reprint.certificate.certificateType, 'full')
  assert.equal(reprint.certificate.contractNumber, '7 5 3')
  assert.equal(reprint.certificate.attestationNumber, '5218140')
  assert.equal(await prisma.certificate.count(), 1)
  assert.equal(await prisma.student.count(), 1)
})

test('a known cross-student duplicate does not block the owner from reprinting', async () => {
  await reset()
  const ahmed = await prisma.student.create({ data: { name: 'Ahmed Khan', phone: '5145550101' } })
  const other = await prisma.student.create({ data: { name: 'Someone Else', phone: '4385552222' } })
  await prisma.certificate.create({
    data: { studentId: ahmed.id, certificateType: 'full', contractNumber: '7 5 3', attestationNumber: '5218140' },
  })
  const duplicate = await prisma.certificate.create({
    data: { studentId: other.id, certificateType: 'full', contractNumber: '753', attestationNumber: '5218140' },
  })
  const result = await saveCertificateStudent({
    name: 'Ahmed Khan',
    phone: '5145550101',
    contractNumber: '753',
    attestationNumber: '5218140',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (!result.ok) assert.fail(result.error)
  assert.equal(result.student.id, ahmed.id)
  assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: duplicate.id } })).studentId, other.id)
  assert.equal((await prisma.certificate.findFirstOrThrow({ where: { studentId: ahmed.id } })).contractNumber, '7 5 3')
})

test('phone-less students with the same name stay separate when their licences differ or several rows exist', async () => {
  await reset()
  const first = await prisma.student.create({
    data: { name: 'Ali Hassan', licenceNumber: 'P-100', address: '12 Main' },
  })
  await prisma.certificate.create({
    data: { studentId: first.id, certificateType: 'full', contractNumber: '410', attestationNumber: '5210001' },
  })
  const differentLicence = await saveCertificateStudent({
    name: 'Hassan, Ali',
    phone: '',
    licenceNumber: 'P-200',
    address: 'Other address',
    localStudentId: first.id,
    contractNumber: '410',
    attestationNumber: '5210001',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (differentLicence.ok) assert.fail('expected a licence conflict')
  assert.match(differentLicence.error, /Barcode 5210001 is already assigned to Ali Hassan/)
  const row = await prisma.student.findUniqueOrThrow({ where: { id: first.id } })
  assert.equal(row.licenceNumber, 'P-100')
  assert.equal(row.address, '12 Main')

  await reset()
  const only = await prisma.student.create({ data: { name: 'Ali Hassan', address: '12 Main' } })
  await prisma.certificate.create({
    data: { studentId: only.id, certificateType: 'phase1', contractNumber: '411', attestationNumber: '5210002' },
  })
  const reprint = await saveCertificateStudent({
    name: 'Ali Hassan',
    phone: '',
    address: '12 Main',
    contractNumber: '411',
    attestationNumber: '5210002',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (!reprint.ok) assert.fail(reprint.error)
  assert.equal(reprint.student.id, only.id)
  assert.equal(reprint.certificate.certificateType, 'full')

  const twin = await prisma.student.create({ data: { name: 'Hassan, Ali', address: '99 Other' } })
  const taken = await saveCertificateStudent({
    name: 'Ali Hassan',
    phone: '',
    localStudentId: twin.id,
    contractNumber: '411',
    attestationNumber: '5210002',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (taken.ok) assert.fail('expected ambiguous namesakes to be refused')
  assert.match(taken.error, /Barcode 5210002 is already assigned to Ali Hassan/)
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: only.id } })).address, '12 Main')

  const created = await saveCertificateStudent({
    name: 'Ali Hassan',
    phone: '',
    localStudentId: only.id,
    address: 'Should not replace',
    contractNumber: '900',
    attestationNumber: '5219999',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (!created.ok) assert.fail(created.error)
  assert.notEqual(created.student.id, only.id)
  assert.notEqual(created.student.id, twin.id)
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: only.id } })).address, '12 Main')
})

test('the same name and phone can still reprint when the licence number changed', async () => {
  await reset()
  const ahmed = await prisma.student.create({
    data: { name: 'Ahmed Khan', phone: '5145550101', licenceNumber: 'OLD-1' },
  })
  await prisma.certificate.create({
    data: { studentId: ahmed.id, certificateType: 'phase1', contractNumber: '753', attestationNumber: '5218140' },
  })
  const result = await saveCertificateStudent({
    name: 'Ahmed Khan',
    phone: '5145550101',
    licenceNumber: 'NEW-2',
    contractNumber: '753',
    attestationNumber: '5218140',
    certificateType: 'full',
  }, { lookupRoster: noRoster })
  if (!result.ok) assert.fail(result.error)
  assert.equal(result.student.id, ahmed.id)
  assert.equal(result.student.licenceNumber, 'NEW-2')
  assert.equal(result.certificate.certificateType, 'full')
})

test('a roster outage saves nothing', async () => {
  await reset()
  const result = await saveCertificateStudent({
    name: 'Sara Khan',
    phone: '5145550102',
    contractNumber: '753',
    attestationNumber: '5218140',
  }, {
    lookupRoster: async () => {
      throw new Error('mysql down')
    },
  })
  if (result.ok) assert.fail('expected the roster check to fail closed')
  assert.equal(result.status, 503)
  assert.match(result.error, /school roster/)
  assert.equal(await prisma.student.count(), 0)
})

test('history edits refuse another student and do not restyle a stored number', async () => {
  await reset()
  const ahmed = await prisma.student.create({ data: { name: 'Ahmed Khan', phone: '5145550101' } })
  const sara = await prisma.student.create({ data: { name: 'Sara Khan', phone: '4385550199' } })
  const ahmedCert = await prisma.certificate.create({
    data: { studentId: ahmed.id, certificateType: 'full', contractNumber: '7 5 3', attestationNumber: '5218140' },
  })
  const saraCert = await prisma.certificate.create({
    data: { studentId: sara.id, certificateType: 'full', contractNumber: '800', attestationNumber: '5218000' },
  })
  const conflict = await updateCertificateNumbers({
    certificateId: saraCert.id,
    contractNumber: '753',
  }, { lookupRoster: noRoster })
  if (conflict.ok) assert.fail('expected a history conflict')
  assert.equal(conflict.status, 409)
  assert.match(conflict.error, /Contract 753 is already assigned to Ahmed Khan/)
  assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: saraCert.id } })).contractNumber, '800')

  const same = await updateCertificateNumbers({
    certificateId: ahmedCert.id,
    contractNumber: '00753',
  }, { lookupRoster: noRoster })
  if (!same.ok) assert.fail(same.error)
  assert.equal(same.certificate.contractNumber, '7 5 3')
})

test('dedupe merges a repeated name and does not merge siblings on the same phone', async () => {
  await reset()
  const ahmed = await prisma.student.create({ data: { name: 'Ahmed Khan', phone: '5145550101' } })
  const duplicate = await prisma.student.create({ data: { name: 'Khan, Ahmed', phone: '1-514-555-0101' } })
  const cert = await prisma.certificate.create({
    data: { studentId: duplicate.id, certificateType: 'full', contractNumber: '1', attestationNumber: '2' },
  })
  const sara = await prisma.student.create({ data: { name: 'Sara Khan', phone: '(514) 555-0101' } })
  const saraCert = await prisma.certificate.create({
    data: { studentId: sara.id, certificateType: 'full', contractNumber: '3', attestationNumber: '4' },
  })

  const response = await dedupePost(new NextRequest('http://localhost/api/students/dedupe-local'))
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.rowsRemoved, 1)
  assert.equal(await prisma.student.count(), 2)
  assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: cert.id } })).studentId, duplicate.id)
  assert.equal(await prisma.student.findUnique({ where: { id: ahmed.id } }), null)
  assert.equal((await prisma.certificate.findUniqueOrThrow({ where: { id: saraCert.id } })).studentId, sara.id)
  const skipped = payload.skippedDifferentNames.flatMap((group: { students: { id: string }[] }) => group.students)
  assert.equal(skipped.some((student: { id: string }) => student.id === sara.id), true)
})
