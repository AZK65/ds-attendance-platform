import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NextRequest } from 'next/server'
import { formatBookletDateTime } from './booklet-format'
import {
  ALREADY_SIGNED_MESSAGE,
  showStudentSignsNow,
  studentHasClassSignature,
} from './student-sign-now'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dbDir = mkdtempSync(path.join(tmpdir(), 'student-sign-now-'))
process.env.DATABASE_URL = `file:${path.join(dbDir, 'test.db')}`

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const OTHER_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const NOW = new Date('2026-10-29T16:00:00-04:00')
const PHONE = '5145550102'

let prisma: typeof import('./db').prisma
let signPost: (request: NextRequest) => Promise<Response>
let pdfGet: (request: NextRequest) => Promise<Response>
let getTheoryProgress: typeof import('./theory-progress').getTheoryProgress
let ensureTheoryProgram: typeof import('./theory-seed').ensureTheoryProgram

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1')
  const pieces: string[] = []
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g
  let match: RegExpExecArray | null
  while ((match = streamRe.exec(raw))) {
    const body = Buffer.from(match[1], 'latin1')
    let text = ''
    try {
      text = inflateSync(body).toString('latin1')
    } catch {
      text = body.toString('latin1')
    }
    const decoded = text.replace(/<([0-9A-Fa-f]+)>/g, (_full, hex: string) => {
      let out = ''
      for (let i = 0; i + 1 < hex.length; i += 2) {
        const code = Number.parseInt(hex.slice(i, i + 2), 16)
        out += code >= 32 && code < 127 ? String.fromCharCode(code) : ''
      }
      return out
    })
    pieces.push(decoded)
  }
  return pieces.join('\n')
}

before(async () => {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  })
  prisma = (await import('./db')).prisma
  signPost = (await import('../app/api/scheduling/signature/route')).POST
  pdfGet = (await import('../app/api/scheduling/signature/pdf/route')).GET
  getTheoryProgress = (await import('./theory-progress')).getTheoryProgress
  ensureTheoryProgram = (await import('./theory-seed')).ensureTheoryProgram
})

test('Student signs now is shown for a past unsigned lesson, hidden when signed, and hidden in the future', () => {
  const past = {
    date: '2026-10-24',
    startTime: '08:30',
    eventId: '2186752004',
    now: NOW,
  }
  assert.equal(showStudentSignsNow({ ...past, hasClassSignature: false }), true)
  assert.equal(showStudentSignsNow({ ...past, hasClassSignature: true }), false)
  assert.equal(showStudentSignsNow({
    date: '2026-11-14',
    startTime: '08:30',
    eventId: 'future-event',
    hasClassSignature: false,
    now: NOW,
  }), false)
  assert.equal(showStudentSignsNow({
    date: '2026-10-29',
    startTime: '17:30',
    eventId: 'later-today',
    hasClassSignature: false,
    now: NOW,
  }), false)
  assert.equal(showStudentSignsNow({
    date: '2026-10-29',
    startTime: '08:30',
    eventId: 'started-today',
    hasClassSignature: false,
    now: NOW,
  }), true)
  assert.equal(showStudentSignsNow({
    date: '2026-10-24',
    startTime: '08:30',
    eventId: null,
    hasClassSignature: false,
    now: NOW,
  }), false)
  assert.equal(studentHasClassSignature({
    eventId: '2186752004',
    signatureEventIds: ['other-lesson'],
    attendanceBasis: 'admin_confirmed',
  }), false)
  assert.equal(studentHasClassSignature({
    eventId: '2186752004',
    signatureEventIds: ['2186752004'],
    attendanceBasis: '',
  }), true)
  assert.equal(studentHasClassSignature({
    eventId: '2186752004',
    signatureEventIds: [],
    attendanceBasis: 'signature',
  }), true)
  assert.match(ALREADY_SIGNED_MESSAGE, /already signed/i)
  assert.notEqual(ALREADY_SIGNED_MESSAGE, 'already signed')
})

test('signing a past lesson with no attendance creates the signature and attendance, keeps the session scheduled, and the booklet prints the class date', async () => {
  const seeded = await ensureTheoryProgram()
  const groupId = 'fixture-truck-class6'
  await prisma.group.create({
    data: { id: groupId, name: 'Fixture Truck #002', vehicleType: 'truck' },
  })
  await prisma.contact.create({
    data: { id: 'fixture-contact-class6', phone: PHONE, name: 'Fixture Student' },
  })
  await prisma.groupMember.create({
    data: { groupId, contactId: 'fixture-contact-class6', phone: PHONE },
  })
  await prisma.theorySession.create({
    data: {
      groupId,
      programId: seeded.program.id,
      templateVersionId: seeded.templateV2.id,
      sessionNumber: 6,
      teamupEventId: '2186752004',
      date: '2026-10-24',
      startTime: '08:30',
      endTime: '17:30',
      breaksJson: '[]',
      netMinutes: 450,
      status: 'scheduled',
      source: 'manual',
      instructorId: seeded.instructor.id,
    },
  })
  await prisma.theorySession.create({
    data: {
      groupId,
      programId: seeded.program.id,
      templateVersionId: seeded.templateV2.id,
      sessionNumber: 9,
      teamupEventId: 'fixture-future-9',
      date: '2026-11-14',
      startTime: '08:30',
      endTime: '17:30',
      breaksJson: '[]',
      netMinutes: 450,
      status: 'scheduled',
      source: 'manual',
    },
  })
  await prisma.classSignature.create({
    data: {
      eventId: 'other-lesson',
      studentPhone: PHONE,
      studentName: 'Fixture Student',
      sessionLabel: 'Class 1 Theory 1 - Fixture Truck #002',
      signatureDataUrl: OTHER_PNG,
      signedAt: new Date('2026-10-13T21:30:00-04:00'),
    },
  })

  const before = await getTheoryProgress(groupId, PHONE)
  const class6 = before.sessions.find(session => session.sessionNumber === 6)
  const future = before.sessions.find(session => session.sessionNumber === 9)
  assert.ok(class6)
  assert.equal(class6.attendance?.basis, '')
  assert.equal(class6.status, 'scheduled')
  assert.equal(showStudentSignsNow({
    date: class6.date,
    startTime: class6.startTime,
    eventId: class6.teamupEventId,
    hasClassSignature: studentHasClassSignature({
      eventId: class6.teamupEventId,
      signatureEventIds: ['other-lesson'],
      attendanceBasis: class6.attendance?.basis,
    }),
    now: NOW,
  }), true)
  assert.equal(showStudentSignsNow({
    date: future!.date,
    startTime: future!.startTime,
    eventId: future!.teamupEventId,
    hasClassSignature: false,
    now: NOW,
  }), false)

  const started = Date.now()
  const first = await signPost(post('http://localhost/api/scheduling/signature', {
    eventId: '2186752004',
    studentPhone: PHONE,
    studentName: 'Fixture Student',
    signatureDataUrl: PNG,
    sessionLabel: 'Theory class 6 of 15',
  }))
  assert.equal(first.status, 200)

  const saved = await prisma.classSignature.findUnique({
    where: { eventId_studentPhone: { eventId: '2186752004', studentPhone: PHONE } },
  })
  assert.ok(saved)
  assert.equal(saved.signatureDataUrl, PNG)
  assert.ok(saved.signedAt.getTime() >= started - 5_000)
  assert.ok(saved.signedAt.getTime() < started + 120_000)
  assert.notEqual(saved.signedAt.toISOString().slice(0, 10), '2026-10-24')

  const session = await prisma.theorySession.findUnique({ where: { teamupEventId: '2186752004' } })
  assert.equal(session?.status, 'scheduled')
  const futureSession = await prisma.theorySession.findUnique({ where: { teamupEventId: 'fixture-future-9' } })
  assert.equal(futureSession?.status, 'scheduled')

  const attendance = await prisma.theoryAttendance.findMany({ where: { sessionId: session!.id } })
  assert.equal(attendance.length, 1)
  assert.equal(attendance[0].status, 'present')
  assert.equal(attendance[0].basis, 'signature')
  assert.equal(attendance[0].signatureId, saved.id)
  const classAttendance = await prisma.classAttendance.findUnique({ where: { eventId: '2186752004' } })
  assert.equal(classAttendance?.present, true)

  const progress = await getTheoryProgress(groupId, PHONE)
  const signed = progress.sessions.find(row => row.sessionNumber === 6)
  assert.equal(signed?.attendance?.status, 'present')
  assert.equal(signed?.attendance?.basis, 'signature')
  assert.equal(signed?.attendance?.signatureId, saved.id)
  assert.equal(progress.attendedCount, 1)
  assert.equal(formatBookletDateTime(signed!.date, signed!.startTime), 'Oct 24, 2026, 8:30 a.m.')
  assert.equal(showStudentSignsNow({
    date: signed!.date,
    startTime: signed!.startTime,
    eventId: signed!.teamupEventId,
    hasClassSignature: studentHasClassSignature({
      eventId: signed!.teamupEventId,
      signatureEventIds: ['2186752004', 'other-lesson'],
      attendanceBasis: signed!.attendance?.basis,
    }),
    now: NOW,
  }), false)

  const pdfRes = await pdfGet(new NextRequest(`http://localhost/api/scheduling/signature/pdf?phone=${PHONE}`))
  assert.equal(pdfRes.status, 200)
  const text = pdfText(new Uint8Array(await pdfRes.arrayBuffer())).replace(/[^\x20-\x7e\n]/g, '')
  assert.match(text, /Oct 24, 2026, 8:30 a\.m/)
  assert.match(text, /7h30 \/ 75 h/)
  assert.match(text, /1 \/ 15 classes/)
  assert.doesNotMatch(text, /signed at/i)
  assert.doesNotMatch(text, /Oct 29, 2026/)

  const second = await signPost(post('http://localhost/api/scheduling/signature', {
    eventId: '2186752004',
    studentPhone: PHONE,
    studentName: 'Fixture Student',
    signatureDataUrl: OTHER_PNG,
    sessionLabel: 'Theory class 6 of 15',
  }))
  assert.equal(second.status, 409)
  assert.equal((await second.json()).error, 'already signed')
  const kept = await prisma.classSignature.findMany({ where: { eventId: '2186752004' } })
  assert.equal(kept.length, 1)
  assert.equal(kept[0].signatureDataUrl, PNG)
  assert.equal(kept[0].signedAt.getTime(), saved.signedAt.getTime())
  const stillOne = await prisma.theoryAttendance.findMany({ where: { sessionId: session!.id } })
  assert.equal(stillOne.length, 1)
  assert.equal(stillOne[0].signatureId, saved.id)
})

test('a repeat signature is rejected with 409 and the first drawing is kept', async () => {
  const body = {
    eventId: 'event-repeat',
    studentPhone: '5145550199',
    studentName: 'Fixture Student',
    signatureDataUrl: PNG,
  }
  const first = await signPost(post('http://localhost/api/scheduling/signature', body))
  assert.equal(first.status, 200)
  const second = await signPost(post('http://localhost/api/scheduling/signature', {
    ...body,
    signatureDataUrl: OTHER_PNG,
    studentName: 'Someone Else',
  }))
  assert.equal(second.status, 409)
  assert.equal((await second.json()).error, 'already signed')
  const rows = await prisma.classSignature.findMany({ where: { eventId: 'event-repeat' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].signatureDataUrl, PNG)
  assert.equal(rows[0].studentName, 'Fixture Student')
})

test('signing an admin-confirmed lesson stores a new drawing and does not copy another lesson', async () => {
  const seeded = await ensureTheoryProgram()
  const groupId = 'fixture-truck-class2'
  const phone = '5145550202'
  await prisma.group.create({
    data: { id: groupId, name: 'Fixture Truck #002', vehicleType: 'truck' },
  })
  await prisma.contact.create({
    data: { id: 'fixture-contact-class2', phone, name: 'Fixture Student' },
  })
  await prisma.groupMember.create({
    data: { groupId, contactId: 'fixture-contact-class2', phone },
  })
  const session = await prisma.theorySession.create({
    data: {
      groupId,
      programId: seeded.program.id,
      templateVersionId: seeded.templateV2.id,
      sessionNumber: 2,
      teamupEventId: '2186751998',
      date: '2026-10-15',
      startTime: '17:30',
      endTime: '21:30',
      breaksJson: '[]',
      netMinutes: 225,
      status: 'held',
      source: 'manual',
      instructorId: seeded.instructor.id,
    },
  })
  await prisma.theoryAttendance.create({
    data: {
      sessionId: session.id,
      studentPhone: phone,
      status: 'present',
      basis: 'admin_confirmed',
      confirmedBy: 'Ars (administration)',
      confirmedAt: '2026-10-24',
    },
  })
  await prisma.classSignature.create({
    data: {
      eventId: '2186751997',
      studentPhone: phone,
      studentName: 'Fixture Student',
      signatureDataUrl: OTHER_PNG,
    },
  })

  const response = await signPost(post('http://localhost/api/scheduling/signature', {
    eventId: '2186751998',
    studentPhone: phone,
    studentName: 'Fixture Student',
    signatureDataUrl: PNG,
  }))
  assert.equal(response.status, 200)
  const drawn = await prisma.classSignature.findUnique({
    where: { eventId_studentPhone: { eventId: '2186751998', studentPhone: phone } },
  })
  assert.equal(drawn?.signatureDataUrl, PNG)
  const copied = await prisma.classSignature.findUnique({
    where: { eventId_studentPhone: { eventId: '2186751997', studentPhone: phone } },
  })
  assert.equal(copied?.signatureDataUrl, OTHER_PNG)
  const attendance = await prisma.theoryAttendance.findUnique({
    where: { sessionId_studentPhone: { sessionId: session.id, studentPhone: phone } },
  })
  assert.equal(attendance?.basis, 'signature')
  assert.equal(attendance?.signatureId, drawn?.id)
  assert.equal(attendance?.confirmedBy, 'Ars (administration)')
  const held = await prisma.theorySession.findUnique({ where: { id: session.id } })
  assert.equal(held?.status, 'held')
  const progress = await getTheoryProgress(groupId, phone)
  assert.equal(progress.sessions.find(row => row.sessionNumber === 2)?.attendance?.basis, 'signature')
  assert.equal(formatBookletDateTime('2026-10-15', '17:30'), 'Oct 15, 2026, 5:30 p.m.')
})
