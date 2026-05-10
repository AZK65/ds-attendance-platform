import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/db'

// GET /api/scheduling/signature/pdf?phone=...
// Renders a SAAQ-style attendance booklet PDF for a single student. One row
// per signed session, grouped by phase (Phase 1 / 2 / 3 / 4) — same layout
// the paper booklet follows.
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get('phone') || ''
  if (!phone) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 })
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const phoneSuffix = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits
  if (phoneSuffix.length < 7) {
    return NextResponse.json({ error: 'phone too short' }, { status: 400 })
  }

  const signatures = await prisma.classSignature.findMany({
    where: { studentPhone: { contains: phoneSuffix } },
    orderBy: { signedAt: 'asc' },
  })

  // Render an empty booklet rather than 404'ing when no signatures yet —
  // useful for previewing the layout before students start signing in.
  // Bucket by phase, mirroring SAAQ rules:
  //   Phase 1 — modules 1-5
  //   Phase 2 — module 6 + sortie 1-2 (or M7 + S3-4)
  //   Phase 3 — modules 8-10 + sortie 5-10
  //   Phase 4 — modules 11-12 + sortie 11-15
  type Row = { kind: 'module' | 'sortie' | 'other'; n: number | null; label: string; date: string; signature: string }
  const rows: Row[] = signatures.map(s => ({
    kind: s.moduleNumber != null ? 'module' : s.sortieNumber != null ? 'sortie' : 'other',
    n: s.moduleNumber ?? s.sortieNumber ?? null,
    label: s.sessionLabel || (s.moduleNumber != null ? `M${s.moduleNumber}` : s.sortieNumber != null ? `Session ${s.sortieNumber}` : 'Class'),
    date: new Date(s.signedAt).toLocaleDateString('en-CA'),
    signature: s.signatureDataUrl,
  }))

  const studentName = signatures[0]?.studentName || ''

  function phaseOf(r: Row): 1 | 2 | 3 | 4 {
    if (r.kind === 'module' && r.n != null) {
      if (r.n <= 5) return 1
      if (r.n <= 7) return 2
      if (r.n <= 10) return 3
      return 4
    }
    if (r.kind === 'sortie' && r.n != null) {
      if (r.n <= 2) return 2
      if (r.n <= 10) return 3
      return 4
    }
    return 1
  }

  const phaseRows: Record<1 | 2 | 3 | 4, Row[]> = { 1: [], 2: [], 3: [], 4: [] }
  for (const r of rows) phaseRows[phaseOf(r)].push(r)

  const styles = StyleSheet.create({
    page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: '#222' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
    title: { fontSize: 14, fontWeight: 'bold' },
    subtitle: { fontSize: 9, color: '#555', marginTop: 2 },
    phaseTitle: { fontSize: 11, fontWeight: 'bold', marginTop: 10, marginBottom: 4, color: '#1d4ed8' },
    table: { borderTopWidth: 1, borderColor: '#999' },
    headerCell: { padding: 6, fontWeight: 'bold', fontSize: 9, backgroundColor: '#f3f4f6' },
    row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb', minHeight: 38, alignItems: 'center' },
    cellLabel: { width: 90, padding: 6 },
    cellDate: { width: 90, padding: 6 },
    cellSig: { flex: 1, padding: 4 },
    sigImage: { height: 30 },
    empty: { color: '#9ca3af', fontStyle: 'italic', fontSize: 9 },
  })

  const Phase = ({ n, items }: { n: 1 | 2 | 3 | 4; items: Row[] }) =>
    React.createElement(View, null,
      React.createElement(Text, { style: styles.phaseTitle }, `PHASE ${n}`),
      React.createElement(View, { style: styles.table },
        React.createElement(View, { style: styles.row },
          React.createElement(Text, { style: [styles.cellLabel, styles.headerCell] }, 'Module / Sortie'),
          React.createElement(Text, { style: [styles.cellDate, styles.headerCell] }, 'Date'),
          React.createElement(Text, { style: [styles.cellSig, styles.headerCell] }, 'Signature'),
        ),
        items.length === 0
          ? React.createElement(View, { style: styles.row },
              React.createElement(Text, { style: styles.cellLabel }, '—'),
              React.createElement(Text, { style: styles.cellDate }, '—'),
              React.createElement(Text, { style: [styles.cellSig, styles.empty] }, 'No sessions signed'),
            )
          : items.map((r, i) =>
              React.createElement(View, { key: i, style: styles.row },
                React.createElement(Text, { style: styles.cellLabel }, r.label),
                React.createElement(Text, { style: styles.cellDate }, r.date),
                React.createElement(Image, { src: r.signature, style: styles.sigImage }),
              ),
            ),
      ),
    )

  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'LETTER', style: styles.page },
      React.createElement(View, { style: styles.headerRow },
        React.createElement(View, null,
          React.createElement(Text, { style: styles.title }, 'Driver Education — Attendance Sheet'),
          React.createElement(Text, { style: styles.subtitle }, `Student: ${studentName}    ·    Phone: ${phone}`),
          React.createElement(Text, { style: styles.subtitle }, `Generated ${new Date().toLocaleString('en-CA')}    ·    ${signatures.length} sessions`),
        ),
      ),
      React.createElement(Phase, { n: 1, items: phaseRows[1] }),
      React.createElement(Phase, { n: 2, items: phaseRows[2] }),
      React.createElement(Phase, { n: 3, items: phaseRows[3] }),
      React.createElement(Phase, { n: 4, items: phaseRows[4] }),
    ),
  )

  const pdfBuffer = await renderToBuffer(doc)
  const safeName = studentName.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/-+/g, '-')
  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="attendance-${safeName}.pdf"`,
    },
  })
}
