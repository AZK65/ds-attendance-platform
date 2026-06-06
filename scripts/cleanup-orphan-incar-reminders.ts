/**
 * One-off cleanup: cancel any pending in-car class reminders whose
 * underlying Teamup event no longer exists at the expected date+time.
 *
 * Run inside the Docker container:
 *   docker compose cp scripts/cleanup-orphan-incar-reminders.ts app:/app/scripts/
 *   docker compose exec app npx tsx scripts/cleanup-orphan-incar-reminders.ts
 *
 * Why this exists: the poll-changes endpoint used to skip in-car
 * (groupId='in-car-reminders') reminders when cancelling on event
 * deletion, so deleted in-car classes left their 3-hour-before
 * reminders queued. New code prevents future drift; this script
 * sweeps up the existing pending mess.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE_URL = 'https://api.teamup.com'

interface TeamupEvent {
  id: string
  title: string
  notes?: string
  start_dt: string
  end_dt: string
}

function stripHtml(s: string): string {
  return (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
}

function extractPhone(notes: string | undefined): string | null {
  const m = stripHtml(notes || '').match(/Phone:\s*(\d+)/)
  return m ? m[1] : null
}

function suffix(p: string | null | undefined): string {
  return (p || '').replace(/\D/g, '').slice(-10)
}

async function main() {
  const apiKey = process.env.TEAMUP_API_KEY
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY
  if (!apiKey || !calendarKey) {
    console.error('❌ TEAMUP_API_KEY and TEAMUP_CALENDAR_KEY required')
    process.exit(1)
  }

  // 1. Fetch pending in-car reminders only.
  const reminders = await prisma.scheduledMessage.findMany({
    where: { status: 'pending', groupId: 'in-car-reminders' },
    orderBy: { scheduledAt: 'asc' },
  })
  console.log(`📋 ${reminders.length} pending in-car reminder(s) to inspect`)
  if (reminders.length === 0) return

  // 2. Fetch upcoming Teamup events covering all reminder dates (+/- 1 day).
  const dates = reminders.map(r => r.classDateISO).filter(Boolean) as string[]
  if (dates.length === 0) {
    console.log('   None of them carry a classDateISO — leaving alone.')
    return
  }
  const minDate = dates.reduce((a, b) => a < b ? a : b)
  const maxDate = dates.reduce((a, b) => a > b ? a : b)
  const startBuf = new Date(minDate); startBuf.setDate(startBuf.getDate() - 1)
  const endBuf = new Date(maxDate); endBuf.setDate(endBuf.getDate() + 1)
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  const res = await fetch(
    `${BASE_URL}/${calendarKey}/events?startDate=${formatDate(startBuf)}&endDate=${formatDate(endBuf)}`,
    { headers: { 'Teamup-Token': apiKey } },
  )
  if (!res.ok) {
    console.error('❌ Teamup fetch failed:', res.status, await res.text())
    process.exit(1)
  }
  const data = await res.json() as { events?: TeamupEvent[] }
  const events = data.events || []
  console.log(`📅 Loaded ${events.length} Teamup events in the date range.`)

  // Build an index: classDate -> Set<phoneSuffix>
  const eventsByDate = new Map<string, Set<string>>()
  for (const ev of events) {
    const d = ev.start_dt.split('T')[0]
    const ph = extractPhone(ev.notes)
    const set = eventsByDate.get(d) || new Set<string>()
    if (ph) set.add(suffix(ph))
    eventsByDate.set(d, set)
  }

  // 3. For each reminder, look for a matching event by date + phone.
  const orphans: typeof reminders = []
  for (const r of reminders) {
    if (!r.classDateISO) continue
    const eventPhones = eventsByDate.get(r.classDateISO) || new Set<string>()
    let phones: string[] = []
    try { phones = JSON.parse(r.memberPhones) } catch { /* ignore */ }
    const stillMatched = phones.some(p => eventPhones.has(suffix(p)))
    if (!stillMatched) orphans.push(r)
  }

  console.log(`🧹 ${orphans.length} orphan reminder(s) — class no longer exists.`)
  for (const o of orphans) {
    const phones = (() => { try { return JSON.parse(o.memberPhones) } catch { return [] } })()
    console.log(`   ✕ ${o.classDateISO} → ${phones.join(',')} | "${o.message.slice(0, 80)}…"`)
  }

  if (orphans.length === 0) return

  await prisma.scheduledMessage.updateMany({
    where: { id: { in: orphans.map(o => o.id) } },
    data: { status: 'cancelled', error: 'Orphan: underlying Teamup class no longer exists' },
  })
  console.log(`\n✅ Cancelled ${orphans.length} orphan reminder(s).`)
}

main()
  .catch(err => { console.error('❌ Crash:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
