import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { claimNextCertificateNumbers as ClaimNextCertificateNumbers } from './certificate-numbers'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dbDir = mkdtempSync(path.join(tmpdir(), 'certificate-numbers-'))
process.env.DATABASE_URL = `file:${path.join(dbDir, 'test.db')}`

const CURRENT_START = 5228685
const CURRENT_END = 5228689
const PENDING_START = 5255340
const PENDING_END = 5255539
const GAP_START = 5228690
const GAP_END = 5255339
const EXHAUSTED_ERROR = 'Attestation number range exhausted. Please update settings with a new range.'

let claimNextCertificateNumbers: typeof ClaimNextCertificateNumbers
let prisma: typeof import('./db').prisma
let pendingKey: string

function inGap(value: number) {
  return value >= GAP_START && value <= GAP_END
}

before(async () => {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })
  const numbers = await import('./certificate-numbers')
  claimNextCertificateNumbers = numbers.claimNextCertificateNumbers
  pendingKey = numbers.SAAQ_PENDING_ATTESTATION_RANGE_KEY
  prisma = (await import('./db')).prisma
})

async function seed(options: {
  nextAttestationNumber: number
  attestationNumberEnd: number
  nextContractNumber?: number
  pending?: { start: number; end: number; count?: number } | string | null
}) {
  await prisma.certificate.deleteMany()
  await prisma.student.deleteMany()
  await prisma.certificateSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      nextContractNumber: options.nextContractNumber ?? 8000,
      nextAttestationNumber: options.nextAttestationNumber,
      attestationNumberEnd: options.attestationNumberEnd,
    },
    update: {
      nextContractNumber: options.nextContractNumber ?? 8000,
      nextAttestationNumber: options.nextAttestationNumber,
      attestationNumberEnd: options.attestationNumberEnd,
    },
  })
  await prisma.appPreference.deleteMany({ where: { key: pendingKey } })
  if (options.pending != null) {
    const value = typeof options.pending === 'string'
      ? options.pending
      : JSON.stringify(options.pending)
    await prisma.appPreference.create({ data: { key: pendingKey, value } })
  }
}

test('uses the current attestation stock before jumping to the pending SAAQ range', async () => {
  await seed({
    nextAttestationNumber: CURRENT_START,
    attestationNumberEnd: CURRENT_END,
    nextContractNumber: 8000,
    pending: { start: PENDING_START, end: PENDING_END, count: 200 },
  })

  const issued: number[] = []
  for (let i = 0; i < 5; i++) {
    const claim = await claimNextCertificateNumbers()
    assert.equal(claim.ok, true)
    if (!claim.ok) return
    assert.equal(claim.attestationNumber, CURRENT_START + i)
    assert.equal(claim.contractNumber, 8000 + i)
    assert.equal(claim.schoolNumber, 'L526')
    assert.equal(inGap(claim.attestationNumber), false)
    issued.push(claim.attestationNumber)
  }
  assert.deepEqual(issued, [5228685, 5228686, 5228687, 5228688, 5228689])

  let settings = await prisma.certificateSettings.findUniqueOrThrow({ where: { id: 'default' } })
  assert.equal(settings.nextAttestationNumber, GAP_START)
  assert.equal(settings.attestationNumberEnd, CURRENT_END)
  assert.ok(await prisma.appPreference.findUnique({ where: { key: pendingKey } }))

  const jumped = await claimNextCertificateNumbers()
  assert.equal(jumped.ok, true)
  if (!jumped.ok) return
  assert.equal(jumped.attestationNumber, PENDING_START)
  assert.equal(jumped.contractNumber, 8005)
  assert.equal(inGap(jumped.attestationNumber), false)

  settings = await prisma.certificateSettings.findUniqueOrThrow({ where: { id: 'default' } })
  assert.equal(settings.nextAttestationNumber, PENDING_START + 1)
  assert.equal(settings.attestationNumberEnd, PENDING_END)
  assert.equal(await prisma.appPreference.findUnique({ where: { key: pendingKey } }), null)

  const follow = await claimNextCertificateNumbers()
  assert.equal(follow.ok, true)
  if (!follow.ok) return
  assert.equal(follow.attestationNumber, PENDING_START + 1)
  assert.equal(inGap(follow.attestationNumber), false)

  for (const number of [...issued, jumped.attestationNumber, follow.attestationNumber]) {
    assert.equal(number >= GAP_START && number <= GAP_END, false)
  }
})

test('activates a pending range when the current stock is already exhausted', async () => {
  await seed({
    nextAttestationNumber: GAP_START,
    attestationNumberEnd: CURRENT_END,
    nextContractNumber: 8100,
    pending: { start: PENDING_START, end: PENDING_END, count: 200 },
  })

  const claim = await claimNextCertificateNumbers()
  assert.equal(claim.ok, true)
  if (!claim.ok) return
  assert.equal(claim.attestationNumber, PENDING_START)
  assert.equal(claim.contractNumber, 8100)
  assert.equal(inGap(claim.attestationNumber), false)

  const settings = await prisma.certificateSettings.findUniqueOrThrow({ where: { id: 'default' } })
  assert.equal(settings.nextAttestationNumber, 5255341)
  assert.equal(settings.attestationNumberEnd, PENDING_END)
  assert.equal(await prisma.appPreference.findUnique({ where: { key: pendingKey } }), null)
})

test('skips a pending start that was already issued and still does not enter the gap', async () => {
  await seed({
    nextAttestationNumber: GAP_START,
    attestationNumberEnd: CURRENT_END,
    nextContractNumber: 8200,
    pending: { start: PENDING_START, end: PENDING_END, count: 200 },
  })
  const student = await prisma.student.create({ data: { name: 'Already issued' } })
  await prisma.certificate.create({
    data: {
      studentId: student.id,
      certificateType: 'attestation',
      contractNumber: '1',
      attestationNumber: String(PENDING_START),
    },
  })

  const claim = await claimNextCertificateNumbers()
  assert.equal(claim.ok, true)
  if (!claim.ok) return
  assert.equal(claim.attestationNumber, PENDING_START + 1)
  assert.equal(inGap(claim.attestationNumber), false)

  const settings = await prisma.certificateSettings.findUniqueOrThrow({ where: { id: 'default' } })
  assert.equal(settings.nextAttestationNumber, PENDING_START + 2)
  assert.equal(settings.attestationNumberEnd, PENDING_END)
})

test('refuses to invent attestation numbers when stock is exhausted and no pending range is stored', async () => {
  await seed({
    nextAttestationNumber: GAP_START,
    attestationNumberEnd: CURRENT_END,
    nextContractNumber: 42,
    pending: null,
  })

  const claim = await claimNextCertificateNumbers()
  assert.deepEqual(claim, { ok: false, status: 400, error: EXHAUSTED_ERROR })

  const settings = await prisma.certificateSettings.findUniqueOrThrow({ where: { id: 'default' } })
  assert.equal(settings.nextAttestationNumber, GAP_START)
  assert.equal(settings.attestationNumberEnd, CURRENT_END)
  assert.equal(settings.nextContractNumber, 42)
})

test('refuses an unusable pending range instead of walking into the gap', async () => {
  await seed({
    nextAttestationNumber: GAP_START,
    attestationNumberEnd: CURRENT_END,
    nextContractNumber: 43,
    pending: '{',
  })
  let claim = await claimNextCertificateNumbers()
  assert.deepEqual(claim, { ok: false, status: 400, error: EXHAUSTED_ERROR })

  await seed({
    nextAttestationNumber: GAP_START,
    attestationNumberEnd: CURRENT_END,
    nextContractNumber: 43,
    pending: { start: CURRENT_START, end: PENDING_END, count: PENDING_END - CURRENT_START + 1 },
  })
  claim = await claimNextCertificateNumbers()
  assert.deepEqual(claim, { ok: false, status: 400, error: EXHAUSTED_ERROR })

  const settings = await prisma.certificateSettings.findUniqueOrThrow({ where: { id: 'default' } })
  assert.equal(settings.nextAttestationNumber, GAP_START)
  assert.equal(settings.attestationNumberEnd, CURRENT_END)
  assert.equal(settings.nextContractNumber, 43)
  assert.ok(await prisma.appPreference.findUnique({ where: { key: pendingKey } }))
})
