import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/leads/import
// Body: { csv: string }
// Imports historical leads from a Google Ads "Download leads" CSV export.
// Maps name/email/phone columns by header; everything else becomes notes.
// Dedupes by the Google "Lead ID" column when present.

// Minimal RFC-4180-ish CSV parser (handles quotes, escaped "" and newlines).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/^﻿/, '') // strip BOM

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(v => v.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some(v => v.trim() !== '')) rows.push(row)
  }
  return rows
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function findIndex(headers: string[], matchers: ((h: string) => boolean)[]): number {
  for (const m of matchers) {
    const idx = headers.findIndex(h => m(norm(h)))
    if (idx !== -1) return idx
  }
  return -1
}

export async function POST(request: NextRequest) {
  let csv: string
  try {
    const body = await request.json() as { csv?: string }
    csv = body.csv || ''
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (!csv.trim()) return NextResponse.json({ error: 'Empty file' }, { status: 400 })

  const rows = parseCsv(csv)
  if (rows.length < 2) {
    return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 })
  }

  const headers = rows[0]
  const nameIdx = findIndex(headers, [h => h === 'fullname', h => h === 'name', h => h.includes('name')])
  const emailIdx = findIndex(headers, [h => h.includes('email')])
  const phoneIdx = findIndex(headers, [h => h.includes('phone'), h => h.includes('mobile')])
  const leadIdIdx = findIndex(headers, [h => h === 'leadid', h => h.includes('leadid')])
  const dateIdx = findIndex(headers, [h => h.includes('submit'), h => h.includes('date'), h => h.includes('time')])
  const reservedIdx = new Set([nameIdx, emailIdx, phoneIdx, leadIdIdx, dateIdx].filter(i => i !== -1))

  let imported = 0, updated = 0, skipped = 0
  const errors: string[] = []

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : '')

    const name = get(nameIdx) || null
    const email = get(emailIdx) || null
    const phone = get(phoneIdx) || null
    if (!name && !email && !phone) { skipped++; continue }

    // Extra columns (custom questions, etc.) become notes.
    const notes = headers
      .map((h, i) => (!reservedIdx.has(i) ? `${h}: ${get(i)}` : ''))
      .filter((line, i) => line && get(i) !== '' && !line.endsWith(': '))
      .join('\n') || null

    const rawDate = get(dateIdx)
    const parsedDate = rawDate ? new Date(rawDate) : null
    const createdAt = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : undefined

    const leadId = get(leadIdIdx) || null
    const data = {
      name, email, phone, notes,
      source: 'google_ads_import',
      ...(createdAt ? { createdAt } : {}),
    }

    try {
      if (leadId) {
        const existing = await prisma.lead.findUnique({ where: { leadId } })
        if (existing) { updated++; continue } // already have it — leave as-is
        await prisma.lead.create({ data: { ...data, leadId } })
        imported++
      } else {
        // No lead id — avoid re-import dupes by matching phone or email.
        const dupe = await prisma.lead.findFirst({
          where: { OR: [phone ? { phone } : {}, email ? { email } : {}].filter(o => Object.keys(o).length) },
        })
        if (dupe) { skipped++; continue }
        await prisma.lead.create({ data })
        imported++
      }
    } catch (e) {
      errors.push(`Row ${r + 1}: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  return NextResponse.json({
    imported,
    updated,
    skipped,
    total: rows.length - 1,
    errors: errors.slice(0, 5),
  })
}
