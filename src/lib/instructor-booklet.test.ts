import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { formatBookletDateTime, formatBookletInstructorLine, formatClass1SignedCounts, formatScheduledStart } from './booklet-format'
import { buildSignatureAttendancePdf, countClass1SignedLessons } from './signature-attendance-pdf'
import { AHMED_INSTRUCTOR, TEMPLATE_V1, TEMPLATE_V2, breaksForDay, formatNet, lessonNetLabel, netMinutes } from './theory-hours'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dbDir = mkdtempSync(path.join(tmpdir(), 'instructor-booklet-'))
process.env.DATABASE_URL = `file:${path.join(dbDir, 'test.db')}`

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let prisma: typeof import('./db').prisma
let signPost: (request: NextRequest) => Promise<Response>
let instructorPost: (request: NextRequest) => Promise<Response>
let ensureTheoryProgram: typeof import('./theory-seed').ensureTheoryProgram

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

before(async () => {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })
  prisma = (await import('./db')).prisma
  signPost = (await import('../app/api/scheduling/signature/route')).POST
  instructorPost = (await import('../app/api/scheduling/instructor-signature/route')).POST
  ensureTheoryProgram = (await import('./theory-seed')).ensureTheoryProgram
})

test('booklet date is the scheduled start, and a missing number prints Pending', () => {
  assert.equal(formatBookletDateTime('2026-08-04', '17:30'), 'Aug 4, 2026, 5:30 p.m.')
  assert.equal(formatBookletDateTime('2026-08-15', '09:00'), 'Aug 15, 2026, 9:00 a.m.')
  assert.equal(formatScheduledStart('2026-09-12T09:00:00-04:00'), 'Sep 12, 2026, 9:00 a.m.')
  assert.equal(
    formatBookletInstructorLine('Abdul Rahman Ahmed Qazi', null),
    'Instructor: Abdul Rahman Ahmed Qazi. Instructor no.: Pending',
  )
  assert.equal(
    formatBookletInstructorLine('Abdul Rahman Ahmed Qazi', '12345'),
    'Instructor: Abdul Rahman Ahmed Qazi. Instructor no.: 12345',
  )
})

test('formatNet is the booklet net length: breaks and lunch are excluded', () => {
  assert.equal(formatNet(225), '3h45')
  assert.equal(formatNet(450), '7h30')
  assert.equal(formatNet(netMinutes('17:30', '21:30', breaksForDay(TEMPLATE_V1, 2))), '3h45')
  assert.equal(formatNet(netMinutes('17:30', '21:30', breaksForDay(TEMPLATE_V2, 2))), '3h45')
  assert.equal(formatNet(netMinutes('09:00', '18:00', breaksForDay(TEMPLATE_V1, 6))), '7h30')
  assert.equal(formatNet(netMinutes('08:30', '17:30', breaksForDay(TEMPLATE_V2, 6))), '7h30')
  assert.equal(lessonNetLabel('09:00', '11:00'), '2h00')
  assert.equal(lessonNetLabel('2026-09-12T09:00:00', '2026-09-12T11:00:00'), '2h00')
  assert.equal(lessonNetLabel('09:00', null), null)
  assert.equal(lessonNetLabel(null, '11:00'), null)
})

test('Class 1 header counts signed theory and practical separately, and does not print an added-later date', () => {
  assert.equal(formatClass1SignedCounts(15, 1), '15 theory · 1 practical')
  assert.equal(formatClass1SignedCounts(15, 0), '15 theory · 0 practical')
  const withProgram = countClass1SignedLessons({
    theory: {
      sessions: [
        { basis: 'signature', signatureDataUrl: PNG },
        { basis: 'admin_confirmed', signatureDataUrl: null },
      ],
    },
    signatures: [
      {
        eventId: 'theory-1',
        studentName: 'Vikrant Thakur',
        sessionLabel: 'Class 1 Theory 1',
        moduleNumber: null,
        sortieNumber: null,
        signatureDataUrl: PNG,
        signedAt: new Date('2026-08-04T21:30:00-04:00'),
        instructorSignedOn: 'Oct 28, 2026',
      },
      {
        eventId: 'practical-1',
        studentName: 'Vikrant Thakur',
        sessionLabel: 'Truck Class 1 (Auto)',
        moduleNumber: null,
        sortieNumber: 1,
        signatureDataUrl: PNG,
        signedAt: new Date('2026-09-12T11:05:00-04:00'),
        instructorSignedOn: 'Oct 28, 2026',
      },
    ],
  })
  assert.deepEqual(withProgram, { theory: 1, practical: 1 })
  const fromSignatures = countClass1SignedLessons({
    theory: null,
    signatures: withProgram && [
      {
        eventId: 'theory-2',
        studentName: 'Vikrant Thakur',
        sessionLabel: 'Class 1 Theory 2',
        moduleNumber: null,
        sortieNumber: null,
        signatureDataUrl: PNG,
        signedAt: new Date('2026-08-06T21:30:00-04:00'),
      },
      {
        eventId: 'practical-2',
        studentName: 'Vikrant Thakur',
        sessionLabel: 'Practical Class 2',
        moduleNumber: null,
        sortieNumber: null,
        signatureDataUrl: PNG,
        signedAt: new Date('2026-09-13T09:00:00-04:00'),
      },
    ],
  })
  assert.deepEqual(fromSignatures, { theory: 1, practical: 1 })
})

test('Class 1 booklet PDF renders', async () => {
  const pdf = await buildSignatureAttendancePdf({
    studentName: 'Vikrant Thakur',
    phone: '514-555-0142',
    isTruck: true,
    signatures: [{
      eventId: 'practical-1',
      studentName: 'Vikrant Thakur',
      sessionLabel: 'Truck Class 1 (Auto)',
      moduleNumber: null,
      sortieNumber: 1,
      signatureDataUrl: PNG,
      signedAt: new Date('2026-09-12T11:05:00-04:00'),
      scheduledStart: '2026-09-12 09:00',
      instructorName: 'Abdul Rahman Ahmed Qazi',
      instructorNo: null,
      instructorSignatureDataUrl: PNG,
      instructorSignedOn: 'Oct 28, 2026',
    }],
    theory: {
      hoursLineEn: 'Total: 75 h / 75 h — 15 / 15 classes.',
      hoursLineFr: 'Total : 75 h / 75 h — 15 / 15 cours.',
      instructorLineEn: 'Instructor: Abdul Rahman Ahmed Qazi — SAAQ instructor no.: pending (not yet issued)',
      instructorLineFr: 'Formateur : Abdul Rahman Ahmed Qazi — No de formateur SAAQ : en attente (non encore attribué)',
      headerInstructor: { bookletName: 'Abdul Rahman Ahmed Qazi', saaqInstructorNo: null },
      attendedCount: 1,
      requiredSessions: 15,
      sessions: [{
        sessionNumber: 1,
        date: '2026-08-04',
        startTime: '17:30',
        endTime: '21:30',
        netLabel: '3h45',
        displayEn: 'Signed',
        displayFr: 'Signé',
        basis: 'signature',
        signatureDataUrl: PNG,
        signedAt: '2026-08-04T21:30:00-04:00',
        instructorName: 'Abdul Rahman Ahmed Qazi',
        instructorNo: null,
        instructorSignatureDataUrl: null,
        instructorSignedOn: null,
      }],
    },
  })
  assert.ok(pdf.subarray(0, 5).toString() === '%PDF-')
  const doc = await PDFDocument.load(pdf)
  assert.ok(doc.getPageCount() >= 1)
  const page = doc.getPage(0)
  assert.equal(page.getWidth(), 612)
  assert.equal(page.getHeight(), 792)
})

test('a second student signature for the same lesson is rejected', async () => {
  const body = {
    eventId: 'event-student',
    studentPhone: '5145550142',
    studentName: 'Vikrant Thakur',
    signatureDataUrl: PNG,
    sessionLabel: 'Class 1 Theory 1 - Qazi Truck #001',
  }
  const first = await signPost(post('http://localhost/api/scheduling/signature', body))
  assert.equal(first.status, 200)
  const second = await signPost(post('http://localhost/api/scheduling/signature', {
    ...body,
    signatureDataUrl: PNG + 'x',
  }))
  assert.equal(second.status, 409)
  const payload = await second.json()
  assert.equal(payload.error, 'already signed')
  const rows = await prisma.classSignature.findMany({ where: { eventId: 'event-student' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].signatureDataUrl, PNG)
})

test('a second instructor signature for the same lesson is rejected', async () => {
  const instructor = await prisma.instructor.create({
    data: {
      legalName: 'Abdul Rahman Ahmed Qazi',
      bookletName: 'Abdul Rahman Ahmed Qazi',
      displayName: 'Ahmed',
      saaqInstructorNo: null,
      teamupSubcalendarId: 15664319,
    },
  })
  await prisma.classSignature.create({
    data: {
      eventId: 'event-instructor',
      studentPhone: '5145550142',
      studentName: 'Vikrant Thakur',
      sessionLabel: 'Truck Class 1 (Auto)',
      signatureDataUrl: PNG,
    },
  })
  await prisma.classSignature.create({
    data: {
      eventId: 'event-instructor',
      studentPhone: '5145550199',
      studentName: 'Other Student',
      sessionLabel: 'Truck Class 1 (Auto)',
      signatureDataUrl: PNG,
    },
  })
  const body = {
    eventId: 'event-instructor',
    studentPhones: ['5145550142', '5145550199'],
    signatureDataUrl: PNG,
    instructorId: instructor.id,
    addedLater: false,
  }
  const first = await instructorPost(post('http://localhost/api/scheduling/instructor-signature', body))
  assert.equal(first.status, 200)
  const again = await instructorPost(post('http://localhost/api/scheduling/instructor-signature', {
    ...body,
    studentPhones: ['5145550142'],
    signatureDataUrl: PNG + 'y',
  }))
  assert.equal(again.status, 409)
  assert.equal((await again.json()).error, 'already signed')
  const rows = await prisma.lessonInstructorSignature.findMany({ where: { eventId: 'event-instructor' } })
  assert.equal(rows.length, 2)
  assert.ok(rows.every(row => row.signatureDataUrl === PNG))
  assert.ok(rows.every(row => row.bookletName === 'Abdul Rahman Ahmed Qazi'))
  assert.equal(rows[0].addedLater, false)
})

test('saving an instructor name or number writes a correction log row', async () => {
  const instructor = await prisma.instructor.create({
    data: {
      legalName: 'Old Name',
      bookletName: 'Old Name',
      displayName: 'Old',
      saaqInstructorNo: null,
      teamupSubcalendarId: 424242,
    },
  })
  const patch = (await import('../app/api/settings/instructors/route')).PATCH
  const response = await patch(post('http://localhost/api/settings/instructors', {
    id: instructor.id,
    bookletName: 'New Full Name',
    displayName: 'New',
    saaqInstructorNo: '55421',
    teamupSubcalendarId: 424242,
  }))
  assert.equal(response.status, 200)
  const logs = await prisma.theoryCorrection.findMany({
    where: { entityType: 'Instructor', entityId: instructor.id },
    orderBy: { kind: 'asc' },
  })
  const kinds = logs.map(row => row.kind).sort()
  assert.deepEqual(kinds, ['name', 'number'])
  const numberLog = logs.find(row => row.kind === 'number')
  assert.equal(JSON.parse(numberLog?.beforeJson || '{}').saaqInstructorNo, null)
  assert.equal(JSON.parse(numberLog?.afterJson || '{}').saaqInstructorNo, '55421')
  const saved = await prisma.instructor.findUnique({ where: { id: instructor.id } })
  assert.equal(saved?.bookletName, 'New Full Name')
  assert.equal(saved?.legalName, 'New Full Name')
  assert.equal(saved?.saaqInstructorNo, '55421')
})

test('seed fills an empty instructor name and does not overwrite names or the SAAQ number', async () => {
  await prisma.lessonInstructorSignature.deleteMany()
  await prisma.instructor.deleteMany()
  const created = await ensureTheoryProgram()
  assert.equal(created.instructor.bookletName, AHMED_INSTRUCTOR.bookletName)
  assert.equal(created.instructor.legalName, AHMED_INSTRUCTOR.legalName)
  assert.equal(created.instructor.displayName, AHMED_INSTRUCTOR.displayName)
  assert.equal(created.instructor.saaqInstructorNo, null)

  await prisma.instructor.update({
    where: { id: created.instructor.id },
    data: {
      legalName: 'Custom Legal',
      displayName: 'Custom',
      bookletName: 'Custom Booklet Name',
      saaqInstructorNo: 'SAAQ-999',
    },
  })
  const kept = await ensureTheoryProgram()
  assert.equal(kept.instructor.legalName, 'Custom Legal')
  assert.equal(kept.instructor.displayName, 'Custom')
  assert.equal(kept.instructor.bookletName, 'Custom Booklet Name')
  assert.equal(kept.instructor.saaqInstructorNo, 'SAAQ-999')

  await prisma.instructor.update({
    where: { id: created.instructor.id },
    data: { bookletName: null, legalName: '', displayName: 'Still Custom' },
  })
  const filled = await ensureTheoryProgram()
  assert.equal(filled.instructor.bookletName, AHMED_INSTRUCTOR.bookletName)
  assert.equal(filled.instructor.legalName, AHMED_INSTRUCTOR.legalName)
  assert.equal(filled.instructor.displayName, 'Still Custom')
  assert.equal(filled.instructor.saaqInstructorNo, 'SAAQ-999')
})
