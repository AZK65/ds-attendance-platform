/**
 * Render a Class 1 attendance booklet from a JSON fixture. No database.
 *
 *   npx tsx scripts/render-booklet-preview.ts scripts/fixtures/vikrant-class1-booklet.json --out /tmp/booklets
 *   npx tsx scripts/render-booklet-preview.ts path/to/real-export.json --out /tmp/booklets
 *   npx tsx scripts/render-booklet-preview.ts fixture.json --samples --out /tmp/booklets
 *   npx tsx scripts/render-booklet-preview.ts fixture.json --legacy --out /tmp/booklets
 *   npx tsx scripts/render-booklet-preview.ts fixture.json --all --out /tmp/booklets
 *
 * --samples applies fixture.samples (instructor drawings, one added later, one practical row).
 * --legacy renders with main's booklet code, for a before/after comparison.
 * --all writes the plain after PDF, the samples after PDF, and the legacy before PDF.
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildSignatureAttendancePdf, type AttendancePdfInput, type AttendanceSignatureInput } from '../src/lib/signature-attendance-pdf'

interface FixtureSession {
  sessionNumber: number
  date: string
  startTime: string
  endTime: string
  eventId?: string
  netLabel?: string
  displayEn?: string
  displayFr?: string
  basis?: string
  signatureDataUrl?: string | null
  signedAt?: string | null
  instructorName?: string | null
  instructorNo?: string | null
  instructorSignatureDataUrl?: string | null
  instructorSignedOn?: string | null
}

interface FixtureSignature {
  eventId: string
  studentName?: string
  sessionLabel?: string | null
  moduleNumber?: number | null
  sortieNumber?: number | null
  signatureDataUrl: string
  signedAt: string
  scheduledStart?: string | null
  instructorName?: string | null
  instructorNo?: string | null
  instructorSignatureDataUrl?: string | null
  instructorSignedOn?: string | null
}

interface Fixture {
  studentName: string
  phone: string
  isTruck?: boolean
  theory?: {
    hoursLineEn: string
    hoursLineFr: string
    instructorLineEn: string
    instructorLineFr: string
    headerInstructor?: { bookletName: string; saaqInstructorNo?: string | null } | null
    attendedCount: number
    requiredSessions: number
    sessions: FixtureSession[]
  } | null
  signatures?: FixtureSignature[]
  samples?: {
    instructorSignatureDataUrl?: string
    instructorSignatures?: Array<{ sessionNumber: number; addedLater?: boolean; signedOn?: string }>
    practical?: FixtureSignature
  }
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

function toSignature(row: FixtureSignature, studentName: string): AttendanceSignatureInput {
  return {
    eventId: row.eventId,
    studentName: row.studentName || studentName,
    sessionLabel: row.sessionLabel ?? null,
    moduleNumber: row.moduleNumber ?? null,
    sortieNumber: row.sortieNumber ?? null,
    signatureDataUrl: row.signatureDataUrl,
    signedAt: new Date(row.signedAt),
    scheduledStart: row.scheduledStart ?? null,
    instructorName: row.instructorName ?? null,
    instructorNo: row.instructorNo ?? null,
    instructorSignatureDataUrl: row.instructorSignatureDataUrl ?? null,
    instructorSignedOn: row.instructorSignedOn ?? null,
  }
}

function materialize(fixture: Fixture, samples: boolean): AttendancePdfInput {
  const theory = fixture.theory
    ? {
      ...fixture.theory,
      sessions: fixture.theory.sessions.map(session => ({ ...session })),
    }
    : null
  const signatures: FixtureSignature[] = (fixture.signatures || []).map(row => ({ ...row }))

  if (samples && fixture.samples && theory) {
    for (const sample of fixture.samples.instructorSignatures || []) {
      const session = theory.sessions.find(row => row.sessionNumber === sample.sessionNumber)
      if (!session) continue
      session.instructorSignatureDataUrl = fixture.samples.instructorSignatureDataUrl || session.instructorSignatureDataUrl || null
      session.instructorSignedOn = sample.addedLater ? (sample.signedOn || null) : null
    }
    if (fixture.samples.practical) signatures.push({ ...fixture.samples.practical })
  }

  if (theory) {
    for (const session of theory.sessions) {
      if (!session.signatureDataUrl || !session.eventId || !session.signedAt) continue
      if (signatures.some(row => row.eventId === session.eventId)) continue
      signatures.push({
        eventId: session.eventId,
        studentName: fixture.studentName,
        sessionLabel: `Class 1 Theory ${session.sessionNumber}`,
        signatureDataUrl: session.signatureDataUrl,
        signedAt: session.signedAt,
        scheduledStart: `${session.date} ${session.startTime}`,
        instructorName: session.instructorName,
        instructorNo: session.instructorNo,
        instructorSignatureDataUrl: session.instructorSignatureDataUrl,
        instructorSignedOn: session.instructorSignedOn,
      })
    }
  }

  return {
    studentName: fixture.studentName,
    phone: fixture.phone,
    isTruck: fixture.isTruck !== false,
    theory: theory
      ? {
        hoursLineEn: theory.hoursLineEn,
        hoursLineFr: theory.hoursLineFr,
        instructorLineEn: theory.instructorLineEn,
        instructorLineFr: theory.instructorLineFr,
        headerInstructor: theory.headerInstructor,
        attendedCount: theory.attendedCount,
        requiredSessions: theory.requiredSessions,
        sessions: theory.sessions.map(session => ({
          sessionNumber: session.sessionNumber,
          date: session.date,
          startTime: session.startTime,
          endTime: session.endTime,
          netLabel: session.netLabel || '',
          displayEn: session.displayEn || 'Signed',
          displayFr: session.displayFr || 'Signé',
          basis: session.basis || (session.signatureDataUrl ? 'signature' : ''),
          signatureDataUrl: session.signatureDataUrl || null,
          signedAt: session.signedAt || null,
          instructorName: session.instructorName ?? null,
          instructorNo: session.instructorNo ?? null,
          instructorSignatureDataUrl: session.instructorSignatureDataUrl ?? null,
          instructorSignedOn: session.instructorSignedOn ?? null,
        })),
      }
      : null,
    signatures: signatures.map(row => toSignature(row, fixture.studentName)),
  }
}

async function legacyRenderer(root: string) {
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
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--') && process.argv[process.argv.indexOf(arg) - 1]?.startsWith('--') !== true)
  const fixturePath = path.resolve(positional[0] || path.join(root, 'scripts/fixtures/vikrant-class1-booklet.json'))
  const outDir = path.resolve(argValue('--out') || path.join(root, 'tmp/booklet-preview'))
  const all = process.argv.includes('--all')
  const samples = all || process.argv.includes('--samples')
  const legacy = all || process.argv.includes('--legacy')
  const plain = all || !process.argv.includes('--samples') && !process.argv.includes('--legacy') || process.argv.includes('--plain')
  mkdirSync(outDir, { recursive: true })
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture
  const stem = path.basename(fixturePath, '.json')

  if (plain || (!samples && !legacy)) {
    const pdf = await buildSignatureAttendancePdf(materialize(fixture, false))
    const file = path.join(outDir, `${stem}-after.pdf`)
    writeFileSync(file, pdf)
    console.log(file)
  }
  if (process.argv.includes('--samples') || all) {
    const pdf = await buildSignatureAttendancePdf(materialize(fixture, true))
    const file = path.join(outDir, `${stem}-after-with-signatures.pdf`)
    writeFileSync(file, pdf)
    console.log(file)
  }
  if (legacy) {
    const legacyPdf = await legacyRenderer(root)
    try {
      const pdf = await legacyPdf.render(materialize(fixture, false))
      const file = path.join(outDir, `${stem}-before.pdf`)
      writeFileSync(file, pdf)
      console.log(file)
    } finally {
      legacyPdf.cleanup()
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
