/**
 * Render sample documents with fixture data (never production student records).
 *
 *   node_modules/.bin/tsx scripts/render-document-previews.ts --out /tmp/doc-previews
 *
 * The Class 1 booklet also goes through scripts/render-booklet-preview.ts --all,
 * which writes the current PDF and a legacy PDF from main.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { NextRequest } from 'next/server'
import { buildSignatureAttendancePdf, type AttendancePdfInput } from '../src/lib/signature-attendance-pdf'
import { buildMedicalDeclarationPdf } from '../src/lib/medical-pdf'
import { buildRegistrationTermsPdf } from '../src/lib/registration-terms-pdf'
import { makeRegistrationTermsSnapshot } from '../src/lib/registration-terms'
import { DEFAULT_TRUCK_CONTRACT } from '../src/lib/pricing'
import { buildSchedulingPrintHtml } from '../src/lib/scheduling-print-html'
import {
  contractEmailHtml,
  invoiceEmailHtml,
  registrationConfirmedEmailHtml,
  registrationReceivedEmailHtml,
} from '../src/lib/document-emails'
import { BRAND } from '../src/lib/brand'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const outDir = process.argv[2] || '/tmp/doc-previews'
mkdirSync(outDir, { recursive: true })

function save(name: string, bytes: Buffer | Uint8Array) {
  const file = path.join(outDir, name)
  writeFileSync(file, bytes)
  console.log(file)
}

async function booklet() {
  const fixturePath = path.join(process.cwd(), 'scripts/fixtures/vikrant-class1-booklet.json')
  execSync(`node_modules/.bin/tsx scripts/render-booklet-preview.ts ${JSON.stringify(fixturePath)} --all --out ${JSON.stringify(outDir)}`, {
    cwd: process.cwd(),
    stdio: 'inherit',
  })
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const input = fixtureToInput(fixture)
  save('class1-booklet.pdf', await buildSignatureAttendancePdf(input))
  save('class5-attendance.pdf', await buildSignatureAttendancePdf({
    studentName: 'Sample Student',
    phone: '514-555-0199',
    isTruck: false,
    signatures: [
      { eventId: 'm1', studentName: 'Sample Student', sessionLabel: 'Module 1', moduleNumber: 1, sortieNumber: null, signatureDataUrl: PNG, signedAt: new Date('2026-03-02T14:00:00-05:00') },
      { eventId: 's1', studentName: 'Sample Student', sessionLabel: 'Session 1', moduleNumber: null, sortieNumber: 1, signatureDataUrl: PNG, signedAt: new Date('2026-03-10T15:00:00-04:00') },
    ],
  }))
}

function fixtureToInput(fixture: {
  studentName: string
  phone: string
  isTruck?: boolean
  theory: NonNullable<AttendancePdfInput['theory']> & { sessions: Array<Record<string, unknown>> }
  signatures?: Array<Record<string, unknown>>
}): AttendancePdfInput {
  return {
    studentName: fixture.studentName,
    phone: fixture.phone,
    isTruck: fixture.isTruck !== false,
    theory: {
      hoursLineEn: fixture.theory.hoursLineEn,
      hoursLineFr: fixture.theory.hoursLineFr,
      instructorLineEn: fixture.theory.instructorLineEn,
      instructorLineFr: fixture.theory.instructorLineFr,
      headerInstructor: fixture.theory.headerInstructor,
      attendedCount: fixture.theory.attendedCount,
      requiredSessions: fixture.theory.requiredSessions,
      sessions: fixture.theory.sessions.map(session => ({
        sessionNumber: session.sessionNumber as number,
        date: session.date as string,
        startTime: session.startTime as string,
        endTime: session.endTime as string,
        netLabel: (session.netLabel as string) || '',
        displayEn: (session.displayEn as string) || 'Signed',
        displayFr: (session.displayFr as string) || 'Signé',
        basis: (session.basis as string) || 'signature',
        signatureDataUrl: (session.signatureDataUrl as string) || null,
        signedAt: (session.signedAt as string) || null,
        instructorName: (session.instructorName as string) || null,
        instructorNo: (session.instructorNo as string) || null,
        instructorSignatureDataUrl: (session.instructorSignatureDataUrl as string) || null,
        instructorSignedOn: (session.instructorSignedOn as string) || null,
      })),
    },
    signatures: [],
  }
}

async function invoice() {
  const { POST } = await import('../src/app/api/invoice/generate/route')
  const body = {
    schoolName: 'Qazi Driving School',
    schoolAddress: '786 Jean-Talon St W',
    schoolCity: 'Montreal',
    schoolProvince: 'QC',
    schoolPostalCode: 'H3N 1S2',
    gstNumber: '123456789 RT0001',
    qstNumber: '1234567890 TQ0001',
    studentName: 'Sample Student',
    studentAddress: '100 Example Street',
    studentCity: 'Montreal',
    studentProvince: 'QC',
    studentPostalCode: 'H2X 1Y4',
    studentPhone: '514-555-0199',
    studentEmail: 'sample.student@example.com',
    invoiceNumber: 'INV-2026-0142',
    invoiceDate: '2026-10-01',
    dueDate: '2026-10-15',
    lineItems: [
      { description: 'Class 5 driving course — Phase 2', quantity: 1, unitPrice: 150 },
      { description: 'Road class', quantity: 2, unitPrice: 42.91 },
    ],
    subtotal: 235.82,
    gstRate: 5,
    qstRate: 9.975,
    gstAmount: 11.79,
    qstAmount: 23.52,
    total: 271.13,
    taxesEnabled: true,
    notes: 'Sample invoice for layout preview. Not a real student.',
    remainingBalance: 120,
  }
  const res = await POST(new NextRequest('http://localhost/api/invoice/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  save('invoice.pdf', Buffer.from(await res.arrayBuffer()))
}

async function zoom() {
  const { POST } = await import('../src/app/api/attendance/zoom-pdf/route')
  const res = await POST(new NextRequest('http://localhost/api/attendance/zoom-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      groupName: 'Class 5 — Tuesday Theory',
      date: 'Tuesday, October 6, 2026',
      moduleNumber: 4,
      records: [
        { whatsappName: 'Sample Student', whatsappPhone: '15145550199', zoomName: 'Sample Student', duration: 5400, status: 'present' },
        { whatsappName: 'Alex Example', whatsappPhone: '15145550100', zoomName: 'Alex', duration: 0, status: 'absent' },
      ],
    }),
  }))
  save('zoom-attendance.pdf', Buffer.from(await res.arrayBuffer()))
}

async function truck() {
  const { POST } = await import('../src/app/api/scheduling/truck-schedule-pdf/route')
  const res = await POST(new NextRequest('http://localhost/api/scheduling/truck-schedule-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      studentName: 'Sample Student',
      studentPhone: '15145550199',
      classes: [
        { date: '2026-10-07', startTime: '09:00', endTime: '13:00', isExam: false, examLocation: null },
        { date: '2026-10-09', startTime: '09:00', endTime: '13:00', isExam: false, examLocation: null },
        { date: '2026-11-20', startTime: '08:00', endTime: '12:00', isExam: true, examLocation: 'Laval' },
      ],
    }),
  }))
  save('truck-schedule.pdf', Buffer.from(await res.arrayBuffer()))
}

async function medical() {
  save('medical-declaration.pdf', await buildMedicalDeclarationPdf({
    fullName: 'Sample Student',
    dateOfBirth: '2004-05-12',
    phone: '514-555-0199',
    permitNumber: 'S0000-000000-00',
    address: '100 Example Street',
    city: 'Montreal',
    province: 'QC',
    postalCode: 'H2X 1Y4',
    medical: JSON.stringify({ conditions: [], none: true, attestedAt: '2026-10-01T15:00:00.000Z' }),
    signatureImage: PNG,
  }))
}

async function terms() {
  const snapshot = makeRegistrationTermsSnapshot({
    language: 'en',
    vehicleType: 'car',
    acceptedAt: new Date('2026-10-01T15:04:00.000Z'),
  })
  save('registration-terms.pdf', await buildRegistrationTermsPdf({
    studentName: 'Sample Student',
    phone: '514-555-0199',
    email: 'sample.student@example.com',
    signatureImage: PNG,
    snapshot,
  }))
}

async function contract() {
  const { ContractPage } = await import('../src/app/api/register/contract/route')
  const React = (await import('react')).default
  const { Document, renderToBuffer } = await import('@react-pdf/renderer')
  const school = {
      name: 'Qazi Driving School',
      address: '786 Jean-Talon St W, Montreal, QC, H3N 1S2',
      phone: '514 274 6948',
      email: 'info@qazi.ca',
      saaqNumber: 'L526',
      gstNumber: '123456789 RT0001',
      qstNumber: '1234567890 TQ0001',
      truckTheoryAddress: '786 Jean-Talon St W, Montreal',
      truckRoadAddress: '786 Jean-Talon St W, Montreal',
      truckCircuitAddress: 'Closed circuit, Laval',
    }
    const data = {
      contractNumber: 'C1-2026-0142',
      contractDate: 'October 1, 2026',
      fullName: 'Sample Student',
      dob: '2004-05-12',
      permitNumber: 'S0000-000000-00',
      address: '100 Example Street, Montreal, H2X 1Y4',
      phone: '514-555-0199',
      email: 'sample.student@example.com',
      firstCourseDate: 'October 7, 2026',
      maxCompletionDate: 'April 7, 2028',
      signedAtPlace: 'Montreal, QC',
      consentSaaq: true,
      consentTransfer: true,
      consentContact: true,
      studentSignature: PNG,
      repSignature: null,
      repName: 'School Representative',
      repSignedDate: 'October 1, 2026',
    }
  const element = React.createElement(
    Document,
    null,
    React.createElement(ContractPage, { lang: 'en', data, school, pricing: DEFAULT_TRUCK_CONTRACT }),
  )
  save('service-contract.pdf', await renderToBuffer(element))
}

function emails() {
  const schoolName = 'Qazi Driving School'
  const pages: Array<[string, string]> = [
    ['invoice-email.html', invoiceEmailHtml({ studentName: 'Sample Student', invoiceNumber: 'INV-2026-0142', schoolName })],
    ['contract-email.html', contractEmailHtml('Sample Student')],
    ['registration-received-email.html', registrationReceivedEmailHtml({
      firstName: 'Sample',
      schoolName,
      fullName: 'Sample Student',
      courseNameEn: 'Class 5 (Car)',
      courseNameFr: 'Classe 5 (Auto)',
      submittedEn: 'October 1, 2026',
      submittedFr: '1 octobre 2026',
      depositDollars: '250.00',
    })],
    ['registration-confirmed-email.html', registrationConfirmedEmailHtml({
      firstName: 'Sample',
      schoolName,
      courseName: 'Class 5 (Car)',
    })],
    ['scheduling-print.html', buildSchedulingPrintHtml({
      title: 'Class schedule',
      subtitle: 'Sample Student · 514-555-0199',
      headers: ['Date', 'Time', 'Class', 'Status'],
      tableRowsHtml: `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">Oct 6, 2026</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">5:30 PM</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;">Module 4</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;color:${BRAND.green};font-weight:600;">Present</td></tr>`,
      rowCount: 1,
      logoHtml: '<img src="file:///workspace/public/qazi-logo.png" style="height:50px;object-fit:contain;" />',
      landscape: false,
      generatedLabel: 'Oct 6, 2026, 4:00 PM',
    })],
  ]
  for (const [name, html] of pages) {
    const file = path.join(outDir, name)
    const document = html.includes('<!DOCTYPE') ? html : `<!DOCTYPE html><html><body style="margin:24px;background:#fff;">${html}</body></html>`
    writeFileSync(file, document)
    console.log(file)
  }
}

async function sheets() {
  const { readFileSync: read, writeFileSync: write, rmSync } = await import('node:fs')
  function patch(rel: string, from: string, to: string, name: string) {
    const source = read(path.join(process.cwd(), rel), 'utf8').replace(from, to)
    if (source === read(path.join(process.cwd(), rel), 'utf8')) throw new Error(`Patch missed ${rel}`)
    const file = path.join(process.cwd(), 'scripts', name)
    write(file, source)
    return file
  }
  const attendanceFile = patch(
    'src/app/api/attendance/pdf/route.ts',
    `export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const groupId = searchParams.get('groupId')

  if (!groupId) {
    return NextResponse.json({ error: 'groupId is required' }, { status: 400 })
  }

  try {
    const sheet = await prisma.attendanceSheet.findUnique({
      where: { groupId },
      include: {
        records: {
          include: { contact: true },
          orderBy: { contact: { phone: 'asc' } }
        },
        group: true
      }
    })

    if (!sheet) {
      return NextResponse.json(
        { error: 'Attendance sheet not found' },
        { status: 404 }
      )
    }`,
    `export async function GET(sheet: any) {
  try {`,
    '.tmp-attendance-preview.ts',
  )
  const groupFile = patch(
    'src/app/api/groups/[groupId]/pdf/route.ts',
    `export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)

  try {
    const state = getWhatsAppState()
    if (!state.isConnected) {
      return NextResponse.json(
        { error: 'WhatsApp not connected' },
        { status: 400 }
      )
    }

    const groupInfo = await getGroupInfo(decodedGroupId)
    const allParticipants = await getGroupParticipants(decodedGroupId)
    // Filter out the group owner (isSuperAdmin)
    const participants = allParticipants.filter(p => !p.isSuperAdmin)
    const lastMessage = await getGroupLastMessage(decodedGroupId)
    const moduleNumber = lastMessage?.moduleNumber || null`,
    `export async function GET(input: { groupInfo: { name: string }; participants: any[]; moduleNumber: number | null }) {
  try {
    const groupInfo = input.groupInfo
    const participants = input.participants
    const moduleNumber = input.moduleNumber`,
    '.tmp-group-preview.ts',
  )
  try {
    const attendance = await import(pathToFileURL(attendanceFile).href) as { GET: (sheet: unknown) => Promise<Response> }
    const group = await import(pathToFileURL(groupFile).href) as { GET: (input: unknown) => Promise<Response> }
    const attendanceRes = await attendance.GET({
      group: { name: 'Tuesday Theory' },
      records: [
        { status: 'present', notes: '', contact: { name: 'Sample Student', pushName: '', phone: '15145550199' } },
        { status: 'absent', notes: 'Called in', contact: { name: 'Alex Example', pushName: '', phone: '15145550100' } },
        { status: 'excused', notes: '', contact: { name: '', pushName: 'Jordan Example', phone: '15145550101' } },
      ],
    })
    save('attendance-sheet.pdf', Buffer.from(await attendanceRes.arrayBuffer()))
    const groupRes = await group.GET({
      groupInfo: { name: 'Class 5 — Tuesday Theory' },
      moduleNumber: 4,
      participants: [
        { name: 'Sample Student', pushName: '', phone: '15145550199' },
        { name: 'Alex Example #2', pushName: '', phone: '15145550100' },
      ],
    })
    save('group-roster.pdf', Buffer.from(await groupRes.arrayBuffer()))
  } finally {
    rmSync(attendanceFile, { force: true })
    rmSync(groupFile, { force: true })
  }
}

async function main() {
  await booklet()
  await invoice()
  await zoom()
  await truck()
  await medical()
  await terms()
  await contract()
  emails()
  await sheets()
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
