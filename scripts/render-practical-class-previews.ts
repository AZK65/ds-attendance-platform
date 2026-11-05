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
  SAMPLE_FUTURE_BOOKING,
  SAMPLE_INSTRUCTOR_SIGNOFFS,
  SAMPLE_LEGACY_SIGNATURES,
  SAMPLE_NOW,
  SAMPLE_PRESENT_EVENT_IDS,
  SAMPLE_SIGNATURE_PNG,
  SAMPLE_STUDENT_NAME,
  SAMPLE_STUDENT_PHONE,
  SAMPLE_PROFILE_BOOKINGS,
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

function theorySessions(count: number): NonNullable<AttendancePdfInput['theory']>['sessions'] {
  return Array.from({ length: count }, (_, index) => ({
    sessionNumber: index + 1,
    date: `2026-08-${String((index % 27) + 1).padStart(2, '0')}`,
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
  }))
}

async function writeBooklet(outDir: string, name: string, input: AttendancePdfInput) {
  const pdf = await buildSignatureAttendancePdf(input)
  const file = path.join(outDir, name)
  writeFileSync(file, pdf)
  console.log(file)
  return file
}

async function main() {
  const outDir = path.resolve(argValue('--out') || path.join(root, 'tmp/practical-class-previews'))
  mkdirSync(outDir, { recursive: true })
  const bookings = [...SAMPLE_PROFILE_BOOKINGS, SAMPLE_FUTURE_BOOKING]
  const summary = summarizePractical(bookings, SAMPLE_LEGACY_SIGNATURES, SAMPLE_PRESENT_EVENT_IDS)
  console.log(JSON.stringify({
    classes: summary.classes.length,
    signed: summary.signedCount,
    counted: summary.countedCount,
    countedHours: summary.countedHours,
    programHours: summary.programHours,
  }))
  const practicalRows = bookletRowsFromClasses({
    classes: summary.classes,
    studentSignatures: SAMPLE_LEGACY_SIGNATURES,
    instructorSignatures: SAMPLE_INSTRUCTOR_SIGNOFFS,
    presentEventIds: SAMPLE_PRESENT_EVENT_IDS,
    now: SAMPLE_NOW,
  })
  console.log(`booklet rows ${practicalRows.length}, credited ${practicalRows.filter(row => row.countsTowardTotal).length}`)
  const afterInput: AttendancePdfInput = {
    studentName: SAMPLE_STUDENT_NAME,
    phone: SAMPLE_STUDENT_PHONE,
    isTruck: true,
    signatures: legacySignatures(),
    theory,
    practicalRows,
  }
  const afterFile = await writeBooklet(outDir, 'booklet-after.pdf', afterInput)
  const pushed = await writeBooklet(outDir, 'booklet-heading-with-rows.pdf', {
    ...afterInput,
    signatures: [],
    theory: theory ? { ...theory, attendedCount: 16, sessions: theorySessions(16) } : theory,
  })
  for (const file of [afterFile, pushed]) {
    const prefix = path.join(outDir, path.basename(file, '.pdf'))
    execSync(`pdftoppm -png -r 140 ${JSON.stringify(file)} ${JSON.stringify(prefix)}`, { stdio: 'inherit' })
  }

  try {
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
  } catch (error) {
    console.warn('Skipped the main-branch booklet render:', error instanceof Error ? error.message : error)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
