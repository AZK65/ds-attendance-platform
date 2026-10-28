import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { SaaqError } from './errors'
import {
  ATTESTATION_FILE_ID,
  MAX_ATTESTATION_BYTES,
  attestationFileUrl,
  attestationsExplicitlyRequested,
  sniffAttestation,
} from './sniff'
import { assertUploadBytes, parseReceivedOn } from './validate'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const dbDir = mkdtempSync(path.join(tmpdir(), 'saaq-db-'))
const fileDir = mkdtempSync(path.join(tmpdir(), 'saaq-files-'))
process.env.DATABASE_URL = `file:${path.join(dbDir, 'test.db')}`
process.env.SAAQ_ATTESTATIONS_DIR = fileDir

const actor = { sessionId: 'sess-secret-not-shown', ipAddress: '203.0.113.44' }
const otherActor = { sessionId: null, ipAddress: null }

function jpeg(text: string) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from(text.padEnd(16, ' ')),
    Buffer.from([0xff, 0xd9]),
  ])
}

function png() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  ])
}

function webp() {
  const bytes = Buffer.alloc(16)
  bytes.write('RIFF', 0, 'latin1')
  bytes.writeUInt32LE(8, 4)
  bytes.write('WEBP', 8, 'latin1')
  return bytes
}

function heic() {
  const bytes = Buffer.alloc(24)
  bytes.writeUInt32BE(24, 0)
  bytes.write('ftyp', 4, 'latin1')
  bytes.write('heic', 8, 'latin1')
  return bytes
}

async function samplePdf(label: string) {
  const doc = await PDFDocument.create()
  const page = doc.addPage()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText(label, { x: 50, y: 700, size: 18, font })
  return Buffer.from(await doc.save())
}

function diskFiles() {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else found.push(full)
    }
  }
  try { walk(fileDir) } catch { /* empty */ }
  return found
}

let store: typeof import('./store')
let prisma: typeof import('../db').prisma

before(async () => {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })
  store = await import('./store')
  prisma = (await import('../db')).prisma
})

test('file type comes from the bytes, and staff URLs have no extension', () => {
  assert.equal(sniffAttestation(Buffer.from('%PDF-1.7\nhello'))?.extension, 'pdf')
  assert.equal(sniffAttestation(jpeg('photo'))?.mimeType, 'image/jpeg')
  assert.equal(sniffAttestation(png())?.extension, 'png')
  assert.equal(sniffAttestation(webp())?.extension, 'webp')
  assert.equal(sniffAttestation(heic())?.extension, 'heic')
  assert.equal(sniffAttestation(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null)
  assert.equal(sniffAttestation(Buffer.from('<!DOCTYPE html><html></html>')), null)
  assert.equal(sniffAttestation(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)])), null)
  assert.equal(sniffAttestation(Buffer.alloc(0)), null)
  assert.throws(() => assertUploadBytes(Buffer.alloc(0)), (error: unknown) => (error as SaaqError).code === 'empty_file')
  assert.throws(
    () => assertUploadBytes(Buffer.alloc(MAX_ATTESTATION_BYTES + 1)),
    (error: unknown) => (error as SaaqError).code === 'file_too_large',
  )
  assert.throws(() => parseReceivedOn('2026-13-01'), (error: unknown) => (error as SaaqError).code === 'invalid_date')
  assert.throws(() => parseReceivedOn('2099-01-01'), (error: unknown) => (error as SaaqError).code === 'future_date')

  assert.equal(attestationsExplicitlyRequested(null), false)
  assert.equal(attestationsExplicitlyRequested(''), false)
  assert.equal(attestationsExplicitlyRequested('contract,results'), false)
  assert.equal(attestationsExplicitlyRequested('attestations'), true)
  assert.equal(attestationsExplicitlyRequested('contract, ATTESTATIONS'), true)

  const fileId = `c${'a'.repeat(24)}`
  assert.equal(ATTESTATION_FILE_ID.test(fileId), true)
  const viewUrl = attestationFileUrl('900001', fileId)
  const downloadUrl = attestationFileUrl('900001', fileId, true)
  assert.equal(viewUrl, `/api/students/900001/saaq-attestations/files/${fileId}`)
  assert.equal(downloadUrl.endsWith('.png') || downloadUrl.endsWith('.jpg') || downloadUrl.endsWith('.pdf'), false)
  assert.equal(/\/[^/]+\.(png|jpe?g|webp|gif|svg|ico|pdf|heic)$/i.test(viewUrl), false)
  assert.throws(() => attestationFileUrl('900001', `${fileId}.png`))
})

test('upload stores the original bytes, hides session and IP, and stays on that student', async () => {
  const bytes = await samplePdf('Theory attestation sample')
  const view = await store.uploadAttestation({
    externalStudentId: 910001,
    kind: 'theory',
    bytes,
    originalName: '../sneaky name.PNG',
    receivedOn: '2026-10-01',
    actor,
  })
  assert.equal(view.slots.theory.status, 'received')
  assert.equal(view.slots.practical.status, 'not_received')
  assert.equal(view.slots.theory.receivedOn, '2026-10-01')
  assert.equal(view.slots.theory.current?.originalName, 'sneaky name.PNG')
  assert.equal(view.slots.theory.history.length, 0)
  const dumped = JSON.stringify(view)
  assert.equal(dumped.includes(actor.sessionId!), false)
  assert.equal(dumped.includes(actor.ipAddress!), false)
  assert.equal(dumped.includes('uploadedBy'), false)
  assert.equal(dumped.includes('staffName'), false)

  const row = await prisma.saaqAttestationFile.findFirstOrThrow({
    where: { attestation: { externalStudentId: 910001, kind: 'theory' } },
  })
  assert.equal(row.uploadedBySession, actor.sessionId)
  assert.equal(row.uploadedByIp, actor.ipAddress)
  assert.equal(row.storedPath?.endsWith('.pdf'), true)
  assert.equal(row.storedPath?.includes('..'), false)
  const stored = readFileSync(path.join(fileDir, row.storedPath!))
  assert.deepEqual(stored, bytes)
  assert.equal(statSync(path.join(fileDir, row.storedPath!)).size, bytes.length)

  const other = await store.getAttestations(910002)
  assert.equal(other.slots.theory.status, 'not_received')
  assert.equal(other.slots.theory.current, null)

  const read = await store.readAttestationBytes(910001, row.id)
  assert.deepEqual(read.bytes, bytes)
  await assert.rejects(
    () => store.readAttestationBytes(910002, row.id),
    (error: unknown) => (error as SaaqError).code === 'not_found',
  )
  assert.equal(attestationFileUrl('910001', row.id).includes(row.originalName), false)
})

test('replace keeps the old file, and deleting the current file does not restore it', async () => {
  const first = jpeg('version-one-photo')
  const second = jpeg('version-two-photo')
  await store.uploadAttestation({
    externalStudentId: 910003,
    kind: 'practical',
    bytes: first,
    originalName: 'first.jpg',
    receivedOn: '2026-10-02',
    actor,
  })
  await assert.rejects(
    () => store.uploadAttestation({
      externalStudentId: 910003,
      kind: 'practical',
      bytes: second,
      originalName: 'second.jpg',
      receivedOn: '2026-10-03',
      reason: '   ',
      actor,
    }),
    (error: unknown) => (error as SaaqError).code === 'reason_required',
  )
  const replaced = await store.uploadAttestation({
    externalStudentId: 910003,
    kind: 'practical',
    bytes: second,
    originalName: 'second.jpg',
    receivedOn: '2026-10-03',
    reason: 'Clearer scan',
    actor: otherActor,
  })
  assert.equal(replaced.slots.practical.status, 'received')
  assert.equal(replaced.slots.practical.receivedOn, '2026-10-03')
  assert.equal(replaced.slots.practical.current?.originalName, 'second.jpg')
  assert.equal(replaced.slots.practical.history.length, 1)
  const previous = replaced.slots.practical.history[0]
  assert.equal(previous.action, 'replaced')
  assert.equal(previous.originalName, 'first.jpg')
  assert.equal(previous.available, true)
  assert.equal(previous.replaceReason, 'Clearer scan')
  const previousBytes = await store.readAttestationBytes(910003, previous.id)
  assert.deepEqual(previousBytes.bytes, first)
  const currentBytes = await store.readAttestationBytes(910003, replaced.slots.practical.current!.id)
  assert.deepEqual(currentBytes.bytes, second)

  const dated = await store.editReceivedOn({
    externalStudentId: 910003,
    kind: 'practical',
    receivedOn: '2026-10-04',
    reason: 'School received it the next day',
    actor,
  })
  assert.equal(dated.slots.practical.receivedOn, '2026-10-04')
  assert.equal(dated.slots.practical.dateChanges[0].before, '2026-10-03')
  assert.equal(dated.slots.practical.dateChanges[0].after, '2026-10-04')
  assert.equal(dated.slots.practical.dateChanges[0].reason, 'School received it the next day')
  assert.equal(JSON.stringify(dated).includes(actor.sessionId!), false)

  const removed = await store.deleteAttestationFile({
    externalStudentId: 910003,
    fileId: replaced.slots.practical.current!.id,
    reason: 'Uploaded to the wrong student',
    actor,
  })
  assert.equal(removed.slots.practical.status, 'not_received')
  assert.equal(removed.slots.practical.receivedOn, null)
  assert.equal(removed.slots.practical.current, null)
  const kept = removed.slots.practical.history.find(item => item.id === previous.id)
  const gone = removed.slots.practical.history.find(item => item.originalName === 'second.jpg')
  assert.equal(kept?.available, true)
  assert.equal(gone?.action, 'removed')
  assert.equal(gone?.available, false)
  assert.equal(gone?.deletedReason, 'Uploaded to the wrong student')
  assert.equal(gone?.sha256.length, 64)
  const attestation = await prisma.saaqAttestation.findUniqueOrThrow({
    where: { externalStudentId_kind: { externalStudentId: 910003, kind: 'practical' } },
  })
  assert.equal(attestation.currentFileId, null)
  assert.notEqual(attestation.currentFileId, previous.id)
  const deletedRow = await prisma.saaqAttestationFile.findUniqueOrThrow({ where: { id: gone!.id } })
  assert.equal(deletedRow.storedPath, null)
  assert.equal(deletedRow.deletedBySession, actor.sessionId)
  assert.equal(deletedRow.sha256, gone!.sha256)
  assert.equal(diskFiles().some(file => file.endsWith(`${gone!.id}.jpg`)), false)
  assert.deepEqual((await store.readAttestationBytes(910003, previous.id)).bytes, first)
  await assert.rejects(
    () => store.readAttestationBytes(910003, gone!.id),
    (error: unknown) => (error as SaaqError).code === 'not_found',
  )

  const bundle = await store.currentAttestationFiles(910003)
  assert.equal(bundle.length, 0)
})

test('a broken PDF is refused and an image is stored without re-encoding', async () => {
  const before = diskFiles().length
  await assert.rejects(
    () => store.uploadAttestation({
      externalStudentId: 910004,
      kind: 'theory',
      bytes: Buffer.from('%PDF-1.4\nnot a real pdf document'),
      originalName: 'fake.pdf',
      receivedOn: '2026-10-01',
      actor: otherActor,
    }),
    (error: unknown) => (error as SaaqError).code === 'invalid_pdf',
  )
  assert.equal(diskFiles().length, before)
  const picture = png()
  const saved = await store.uploadAttestation({
    externalStudentId: 910004,
    kind: 'theory',
    bytes: picture,
    originalName: 'scan.png',
    receivedOn: '2026-10-05',
    actor: otherActor,
  })
  assert.equal(saved.slots.theory.current?.mimeType, 'image/png')
  const row = await prisma.saaqAttestationFile.findFirstOrThrow({
    where: { id: saved.slots.theory.current!.id },
  })
  assert.deepEqual(readFileSync(path.join(fileDir, row.storedPath!)), picture)
  const zipFiles = await store.currentAttestationFiles(910004)
  assert.equal(zipFiles.length, 1)
  assert.equal(zipFiles[0].filename, 'SAAQ Attestations/theory-attestation.png')
  assert.deepEqual(zipFiles[0].bytes, picture)
})
