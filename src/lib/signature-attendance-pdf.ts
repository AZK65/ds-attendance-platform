import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

export interface AttendanceSignatureInput {
  eventId: string
  studentName: string
  sessionLabel: string | null
  moduleNumber: number | null
  sortieNumber: number | null
  signatureDataUrl: string
  signedAt: Date
}

interface AttendancePdfInput {
  signatures: AttendanceSignatureInput[]
  studentName: string
  phone: string
  isTruck: boolean
}

type CarRow = {
  kind: 'module' | 'sortie' | 'other'
  n: number | null
  label: string
  date: string
  signature: string
}

type TruckRow = {
  number: number | null
  label: string
  date: string
  signature: string
}

const dateText = (value: Date) => value.toLocaleDateString('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 34, paddingHorizontal: 36, fontFamily: 'Helvetica', fontSize: 9, color: '#181818' },
  topRule: { height: 6, backgroundColor: '#dc2626', marginHorizontal: -36, marginTop: -34, marginBottom: 22 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  eyebrow: { fontSize: 7, color: '#dc2626', letterSpacing: 1.2, marginBottom: 4 },
  title: { fontSize: 17, fontWeight: 'bold' },
  subtitle: { fontSize: 8.5, color: '#666666', marginTop: 4 },
  totalBlock: { alignItems: 'flex-end' },
  totalNumber: { fontSize: 17, fontWeight: 'bold' },
  totalLabel: { fontSize: 7.5, color: '#666666', marginTop: 2 },
  metricRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metric: { flex: 1, padding: 10, backgroundColor: '#f4f4f5', borderRadius: 5 },
  metricLabel: { fontSize: 7, color: '#666666', letterSpacing: 0.7, marginBottom: 3 },
  metricValue: { fontSize: 12, fontWeight: 'bold' },
  section: { marginTop: 7, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  sectionTitle: { fontSize: 11, fontWeight: 'bold' },
  sectionMeta: { fontSize: 8, color: '#666666' },
  table: { borderTopWidth: 1, borderColor: '#a1a1aa' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e4e4e7', minHeight: 31, alignItems: 'center' },
  headerRowTable: { backgroundColor: '#f4f4f5', minHeight: 26 },
  headerCell: { fontWeight: 'bold', fontSize: 8, color: '#52525b' },
  cellLabel: { width: 150, paddingVertical: 5, paddingHorizontal: 7 },
  cellDate: { width: 100, paddingVertical: 5, paddingHorizontal: 7 },
  cellSig: { flex: 1, paddingVertical: 3, paddingHorizontal: 7 },
  sigImage: { height: 23, maxWidth: 150, objectFit: 'contain', objectPosition: 'left center' },
  empty: { padding: 14, color: '#71717a', backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e4e4e7', borderStyle: 'dashed', borderRadius: 5 },
  phaseTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 9, marginBottom: 4, color: '#1d4ed8' },
  footer: { position: 'absolute', left: 36, right: 36, bottom: 18, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: '#71717a' },
})

const TableHeader = () => React.createElement(View, { style: [styles.row, styles.headerRowTable], fixed: true },
  React.createElement(Text, { style: [styles.cellLabel, styles.headerCell] }, 'Class'),
  React.createElement(Text, { style: [styles.cellDate, styles.headerCell] }, 'Date'),
  React.createElement(Text, { style: [styles.cellSig, styles.headerCell] }, 'Student signature'),
)

const SignatureTable = ({ rows }: { rows: TruckRow[] }) => React.createElement(View, { style: styles.table },
  React.createElement(TableHeader),
  ...rows.map((row, index) => React.createElement(View, { key: `${row.label}-${index}`, style: styles.row, wrap: false },
    React.createElement(Text, { style: styles.cellLabel }, row.label),
    React.createElement(Text, { style: styles.cellDate }, row.date),
    React.createElement(View, { style: styles.cellSig },
      React.createElement(Image, { src: row.signature, style: styles.sigImage }),
    ),
  )),
)

function truckRows(signatures: AttendanceSignatureInput[]) {
  const theory: TruckRow[] = []
  const practical: TruckRow[] = []
  const other: TruckRow[] = []

  for (const signature of signatures) {
    const label = signature.sessionLabel || 'Class 1 training'
    const theoryMatch = label.match(/^Class 1 Theory\s+(\d+)/i)
    const practicalMatch = label.match(/^(?:Truck|Practical) Class\s+(\d+)/i)
    const row = {
      number: theoryMatch ? Number(theoryMatch[1]) : practicalMatch ? Number(practicalMatch[1]) : null,
      label: theoryMatch
        ? `Theory class ${theoryMatch[1]}`
        : practicalMatch
          ? `Practical class ${practicalMatch[1]}`
          : label,
      date: dateText(signature.signedAt),
      signature: signature.signatureDataUrl,
    }
    if (theoryMatch) theory.push(row)
    else if (practicalMatch || signature.sortieNumber != null) practical.push(row)
    else other.push(row)
  }

  const byNumberThenDate = (a: TruckRow, b: TruckRow) =>
    (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || a.date.localeCompare(b.date)
  theory.sort(byNumberThenDate)
  practical.sort(byNumberThenDate)
  other.sort(byNumberThenDate)
  return { theory, practical, other }
}

const TruckDocument = ({ signatures, studentName, phone }: Omit<AttendancePdfInput, 'isTruck'>) => {
  const rows = truckRows(signatures)
  return React.createElement(Document, null,
    React.createElement(Page, { size: 'LETTER', style: styles.page, wrap: true },
      React.createElement(View, { style: styles.topRule, fixed: true }),
      React.createElement(View, { style: styles.headerRow },
        React.createElement(View, null,
          React.createElement(Text, { style: styles.eyebrow }, 'QAZI DRIVING SCHOOL'),
          React.createElement(Text, { style: styles.title }, 'Class 1 attendance record'),
          React.createElement(Text, { style: styles.subtitle }, `Student: ${studentName}   Phone: ${phone}`),
        ),
        React.createElement(View, { style: styles.totalBlock },
          React.createElement(Text, { style: styles.totalNumber }, `${signatures.length}`),
          React.createElement(Text, { style: styles.totalLabel }, 'SIGNED CLASSES'),
        ),
      ),
      React.createElement(View, { style: styles.metricRow },
        React.createElement(View, { style: styles.metric },
          React.createElement(Text, { style: styles.metricLabel }, 'THEORY PROGRAM'),
          React.createElement(Text, { style: styles.metricValue }, '75 hours'),
        ),
        React.createElement(View, { style: styles.metric },
          React.createElement(Text, { style: styles.metricLabel }, 'PRACTICAL PROGRAM'),
          React.createElement(Text, { style: styles.metricValue }, '50 hours'),
        ),
        React.createElement(View, { style: styles.metric },
          React.createElement(Text, { style: styles.metricLabel }, 'TOTAL PROGRAM'),
          React.createElement(Text, { style: styles.metricValue }, '125 hours'),
        ),
      ),
      React.createElement(View, { style: styles.section },
        React.createElement(View, { style: styles.sectionHeader },
          React.createElement(Text, { style: styles.sectionTitle }, 'Theory training'),
          React.createElement(Text, { style: styles.sectionMeta }, `${rows.theory.length} classes signed - 75 hours required`),
        ),
        rows.theory.length
          ? React.createElement(SignatureTable, { rows: rows.theory })
          : React.createElement(Text, { style: styles.empty }, 'No theory signatures recorded.'),
      ),
      React.createElement(View, { style: styles.section },
        React.createElement(View, { style: styles.sectionHeader },
          React.createElement(Text, { style: styles.sectionTitle }, 'Practical training'),
          React.createElement(Text, { style: styles.sectionMeta }, `${rows.practical.length} classes signed - 50 hours required`),
        ),
        rows.practical.length
          ? React.createElement(SignatureTable, { rows: rows.practical })
          : React.createElement(Text, { style: styles.empty }, 'No practical signatures recorded yet.'),
      ),
      rows.other.length > 0 && React.createElement(View, { style: styles.section },
        React.createElement(View, { style: styles.sectionHeader },
          React.createElement(Text, { style: styles.sectionTitle }, 'Other Class 1 records'),
          React.createElement(Text, { style: styles.sectionMeta }, `${rows.other.length} signed`),
        ),
        React.createElement(SignatureTable, { rows: rows.other }),
      ),
      React.createElement(View, { style: styles.footer, fixed: true },
        React.createElement(Text, null, 'Qazi Driving School - Class 1 student record'),
        React.createElement(Text, { render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}` }),
      ),
    ),
  )
}

function carPhase(row: CarRow): 1 | 2 | 3 | 4 {
  if (row.kind === 'module' && row.n != null) {
    if (row.n <= 5) return 1
    if (row.n <= 7) return 2
    if (row.n <= 10) return 3
    return 4
  }
  if (row.kind === 'sortie' && row.n != null) {
    if (row.n <= 2) return 2
    if (row.n <= 10) return 3
    return 4
  }
  return 1
}

const CarDocument = ({ signatures, studentName, phone }: Omit<AttendancePdfInput, 'isTruck'>) => {
  const rows: CarRow[] = signatures.map(signature => ({
    kind: signature.moduleNumber != null ? 'module' : signature.sortieNumber != null ? 'sortie' : 'other',
    n: signature.moduleNumber ?? signature.sortieNumber ?? null,
    label: signature.sessionLabel || (signature.moduleNumber != null ? `M${signature.moduleNumber}` : signature.sortieNumber != null ? `Session ${signature.sortieNumber}` : 'Class'),
    date: dateText(signature.signedAt),
    signature: signature.signatureDataUrl,
  }))
  const phaseRows: Record<1 | 2 | 3 | 4, CarRow[]> = { 1: [], 2: [], 3: [], 4: [] }
  for (const row of rows) phaseRows[carPhase(row)].push(row)

  const Phase = ({ number, items }: { number: 1 | 2 | 3 | 4; items: CarRow[] }) => React.createElement(View, null,
    React.createElement(Text, { style: styles.phaseTitle }, `PHASE ${number}`),
    React.createElement(View, { style: styles.table },
      React.createElement(TableHeader),
      items.length === 0
        ? React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.cellLabel }, '-'),
            React.createElement(Text, { style: styles.cellDate }, '-'),
            React.createElement(Text, { style: [styles.cellSig, styles.empty] }, 'No sessions signed'),
          )
        : items.map((row, index) => React.createElement(View, { key: index, style: styles.row, wrap: false },
            React.createElement(Text, { style: styles.cellLabel }, row.label),
            React.createElement(Text, { style: styles.cellDate }, row.date),
            React.createElement(Image, { src: row.signature, style: styles.sigImage }),
          )),
    ),
  )

  return React.createElement(Document, null,
    React.createElement(Page, { size: 'LETTER', style: styles.page },
      React.createElement(View, { style: styles.headerRow },
        React.createElement(View, null,
          React.createElement(Text, { style: styles.title }, 'Driver Education - Attendance Sheet'),
          React.createElement(Text, { style: styles.subtitle }, `Student: ${studentName}   Phone: ${phone}`),
          React.createElement(Text, { style: styles.subtitle }, `${signatures.length} signed sessions`),
        ),
      ),
      React.createElement(Phase, { number: 1, items: phaseRows[1] }),
      React.createElement(Phase, { number: 2, items: phaseRows[2] }),
      React.createElement(Phase, { number: 3, items: phaseRows[3] }),
      React.createElement(Phase, { number: 4, items: phaseRows[4] }),
    ),
  )
}

export async function buildSignatureAttendancePdf(input: AttendancePdfInput) {
  const document = input.isTruck
    ? TruckDocument(input)
    : CarDocument(input)
  return renderToBuffer(document)
}
