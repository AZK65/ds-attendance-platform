/**
 * One-shot script: walks every ZoomAttendance record whose moduleNumber is
 * null, looks at Teamup events on the same date, and copies the module
 * number from the closest matching Teamup event.
 *
 * Why: when the Zoom meeting topic doesn't include "Module N", the original
 * save path stored null. The Teamup theory event for that same time slot
 * usually does have the module label — this recovers it.
 *
 * Run inside the Docker container:
 *   docker compose cp scripts/backfill-zoom-module-numbers.ts app:/app/scripts/
 *   docker compose exec app npx tsx scripts/backfill-zoom-module-numbers.ts
 *
 * Requires: TEAMUP_API_KEY, TEAMUP_CALENDAR_KEY in env.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE_URL = 'https://api.teamup.com'

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
}

function extractModuleNumber(text: string): number | null {
  const patterns = [/module\s*(\d+)/i, /\bM(\d+)\b/, /\bmod\s*(\d+)/i]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n >= 1 && n <= 24) return n
    }
  }
  return null
}

async function lookupModuleNumberForDate(meetingDate: Date): Promise<number | null> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (!apiKey || !calendarKey) return null

  const formatDate = (d: Date) => d.toISOString().split('T')[0]
  const start = new Date(meetingDate); start.setDate(start.getDate() - 1)
  const end = new Date(meetingDate); end.setDate(end.getDate() + 1)

  const res = await fetch(
    `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(start)}&endDate=${formatDate(end)}`,
    { headers: { 'Teamup-Token': apiKey } }
  )
  if (!res.ok) return null
  const data = await res.json() as { events?: Array<{ title?: string; notes?: string; start_dt: string }> }
  const events = data.events || []

  const targetMs = meetingDate.getTime()
  let best: { num: number; diff: number } | null = null
  for (const ev of events) {
    const evMs = new Date(ev.start_dt).getTime()
    if (Number.isNaN(evMs)) continue
    const diff = Math.abs(evMs - targetMs)
    if (diff > 12 * 60 * 60 * 1000) continue
    const text = `${ev.title || ''} ${stripHtml(ev.notes || '')}`
    const num = extractModuleNumber(text)
    if (num !== null && (!best || diff < best.diff)) {
      best = { num, diff }
    }
  }
  return best?.num ?? null
}

async function main() {
  console.log('\n🔄 BACKFILL ZOOM MODULE NUMBERS')
  console.log('═'.repeat(60))

  if (!process.env.TEAMUP_API_KEY || !process.env.TEAMUP_CALENDAR_KEY) {
    console.error('❌ TEAMUP_API_KEY and TEAMUP_CALENDAR_KEY are required.')
    process.exit(1)
  }

  // ── PASS 1: Teamup lookup ────────────────────────────────────────────────
  const records = await prisma.zoomAttendance.findMany({
    where: { moduleNumber: null },
    orderBy: { meetingDate: 'desc' },
  })

  console.log(`\n📋 Pass 1 — Teamup lookup: ${records.length} records with null moduleNumber`)

  let teamupUpdated = 0
  let teamupMisses = 0

  for (const rec of records) {
    const date = rec.meetingDate.toLocaleDateString('en-CA')
    const num = await lookupModuleNumberForDate(rec.meetingDate)

    if (num) {
      await prisma.zoomAttendance.update({
        where: { id: rec.id },
        data: { moduleNumber: num },
      })
      console.log(`   ✅ ${date} | ${rec.groupId} → Module ${num} (Teamup)`)
      teamupUpdated++
    } else {
      teamupMisses++
    }

    await new Promise(r => setTimeout(r, 250)) // friendly to Teamup
  }

  // ── PASS 2: chronological auto-count per group ───────────────────────────
  // For groups whose records still have null module numbers, walk the
  // records in date order and assign 1, 2, 3, ... based on position.
  // Skip a record's slot if it ALREADY has a module number — that means
  // the count picks up from there (e.g. record 1 manually set to 3,
  // record 2 will be assigned 4).
  const remaining = await prisma.zoomAttendance.findMany({
    where: { moduleNumber: null },
    orderBy: { meetingDate: 'asc' },
  })

  console.log(`\n📋 Pass 2 — chronological count: ${remaining.length} records still null`)

  // Group by groupId
  const byGroup = new Map<string, typeof remaining>()
  for (const r of remaining) {
    const arr = byGroup.get(r.groupId) || []
    arr.push(r)
    byGroup.set(r.groupId, arr)
  }

  let countUpdated = 0

  for (const [groupId, nullRecords] of byGroup) {
    // Pull EVERY record for this group (with or without module) so we know
    // the true chronological position of each session.
    const allForGroup = await prisma.zoomAttendance.findMany({
      where: { groupId },
      orderBy: { meetingDate: 'asc' },
    })

    // Walk the group's full timeline. The Nth session (1-indexed by date)
    // is Module N. If a session already has a moduleNumber, skip — keep
    // existing data, but its position still counts.
    for (let i = 0; i < allForGroup.length; i++) {
      const rec = allForGroup[i]
      if (rec.moduleNumber !== null) continue
      const positionalModule = i + 1
      // Cap at 12 — phase 1 is 5 modules, full course is 12. Anything
      // beyond is probably wrong, leave null so admin notices.
      if (positionalModule > 12) continue

      await prisma.zoomAttendance.update({
        where: { id: rec.id },
        data: { moduleNumber: positionalModule },
      })
      const date = rec.meetingDate.toLocaleDateString('en-CA')
      console.log(`   ✅ ${date} | ${groupId} → Module ${positionalModule} (position #${i + 1} of ${allForGroup.length})`)
      countUpdated++
    }
    // unused but suppresses lint warning
    void nullRecords
  }

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`📊 BACKFILL COMPLETE`)
  console.log(`   Pass 1 — Teamup matches: ${teamupUpdated}`)
  console.log(`   Pass 1 — Teamup misses: ${teamupMisses}`)
  console.log(`   Pass 2 — chronological assignments: ${countUpdated}`)

  const stillNull = await prisma.zoomAttendance.count({ where: { moduleNumber: null } })
  console.log(`   Still null after both passes: ${stillNull}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
