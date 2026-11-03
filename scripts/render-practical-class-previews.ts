/**
 * Before/after Class 1 booklet pages for the practical-class change.
 * Uses the fake Manpreet Kaur sample. No production data.
 *
 *   npx tsx scripts/render-practical-class-previews.ts --out /opt/cursor/artifacts/practical-classes
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildSignatureAttendancePdf, type AttendancePdfInput } from '../src/lib/signature-attendance-pdf'
import {
  SAMPLE_INSTRUCTOR_SIGNOFFS,
  SAMPLE_LEGACY_SIGNATURES,
  SAMPLE_SIGNATURE_PNG,
  SAMPLE_STUDENT_NAME,
  SAMPLE_STUDENT_PHONE,
  SAMPLE_THIRTEEN_BOOKINGS,
} from '../src/lib/practical-class-sample'
import { bookletRowsFromClasses, summarizePractical } from '../src/lib/practical-classes'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

const theory = {
  hoursLineEn: 'Total: 7h30 / 75 h — 1 / 15 classes.',
  hoursLineFr: 'Total : 7h30 / 75 h — 1 / 15 cours.',
  instructorLineEn: '',
  instructorLineFr: '',
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
    signatureDataUrl: SAMPLE_SIGNATURE_PNG,
    signedAt: '2026-08-04T21:30:00-04:00',
    instructorName: 'Abdul Rahman Ahmed Qazi',
    instructorNo: null,
    instructorSignatureDataUrl: SAMPLE_SIGNATURE_PNG,
    instructorSignedOn: 'Oct 28, 2026',
  }],
}

function legacySignatures(): AttendancePdfInput['signatures'] {
  return SAMPLE_THIRTEEN_BOOKINGS
    .filter(booking => SAMPLE_LEGACY_SIGNATURES.some(signature => signature.eventId === booking.id))
    .map(booking => {
      const number = booking.title.match(/Truck Class\s+(\d+)/i)?.[1] || ''
      const signed = SAMPLE_LEGACY_SIGNATURES.find(signature => signature.eventId === booking.id)
      const instructor = SAMPLE_INSTRUCTOR_SIGNOFFS.find(signature => signature.eventId === booking.id)
      return {
        eventId: booking.id,
        studentName: SAMPLE_STUDENT_NAME,
        sessionLabel: `Truck Class ${number} (Auto)`,
        moduleNumber: null,
        sortieNumber: Number(number),
        signatureDataUrl: signed?.signatureDataUrl || SAMPLE_SIGNATURE_PNG,
        signedAt: new Date('2026-09-02T17:05:00Z'),
        scheduledStart: booking.start,
        netLabel: '4h00',
        instructorName: instructor ? 'Abdul Rahman Ahmed Qazi' : null,
        instructorNo: null,
        instructorSignatureDataUrl: instructor?.signatureDataUrl || null,
        instructorSignedOn: instructor ? 'Oct 28, 2026' : null,
      }
    })
}

async function legacyRenderer() {
  const dir = mkdtempSync(path.join(root, 'scripts/.preview-tmp-'))
  const file = path.join(dir, 'legacy-signature-attendance-pdf.ts')
  const source = execSync('git show main:src/lib/signature-attendance-pdf.ts', { cwd: root, encoding: 'utf8' })
  writeFileSync(file, source)
  const loaded = await import(pathToFileURL(file).href) as {
    buildSignatureAttendancePdf: typeof buildSignatureAttendancePdf
  }
  return {
    render: loaded.buildSignatureAttendancePdf,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

async function main() {
  const outDir = path.resolve(argValue('--out') || path.join(root, 'tmp/practical-class-previews'))
  mkdirSync(outDir, { recursive: true })
  const summary = summarizePractical(SAMPLE_THIRTEEN_BOOKINGS, SAMPLE_LEGACY_SIGNATURES)
  const afterInput: AttendancePdfInput = {
    studentName: SAMPLE_STUDENT_NAME,
    phone: SAMPLE_STUDENT_PHONE,
    isTruck: true,
    signatures: legacySignatures(),
    theory,
    practicalRows: bookletRowsFromClasses({
      classes: summary.classes,
      studentSignatures: SAMPLE_LEGACY_SIGNATURES,
      instructorSignatures: SAMPLE_INSTRUCTOR_SIGNOFFS,
    }),
  }
  const after = await buildSignatureAttendancePdf(afterInput)
  const afterFile = path.join(outDir, 'booklet-after.pdf')
  writeFileSync(afterFile, after)
  console.log(afterFile)

  const legacy = await legacyRenderer()
  try {
    const before = await legacy.render({
      studentName: SAMPLE_STUDENT_NAME,
      phone: SAMPLE_STUDENT_PHONE,
      isTruck: true,
      signatures: legacySignatures(),
      theory,
    })
    const beforeFile = path.join(outDir, 'booklet-before.pdf')
    writeFileSync(beforeFile, before)
    console.log(beforeFile)
  } finally {
    legacy.cleanup()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
