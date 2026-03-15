/**
 * Backtest script: scans all ZoomAttendance records from the last 3 months
 * and prints a summary of present/absent students per theory module.
 *
 * Run on server: npx tsx scripts/backfill-theory-absences.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface MatchedRecord {
  whatsappName: string
  whatsappPhone: string
  zoomName: string
  duration: number
}

interface AbsentRecord {
  name: string
  phone: string
}

async function main() {
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  // First, check total records to debug
  const allRecords = await prisma.zoomAttendance.findMany({
    orderBy: { meetingDate: 'desc' },
  })
  console.log(`\n🔍 Total ZoomAttendance records in DB: ${allRecords.length}`)
  if (allRecords.length > 0) {
    console.log(`   Earliest: ${new Date(allRecords[allRecords.length - 1].meetingDate).toISOString()}`)
    console.log(`   Latest: ${new Date(allRecords[0].meetingDate).toISOString()}`)
    console.log(`   With moduleNumber: ${allRecords.filter(r => r.moduleNumber != null).length}`)
    console.log(`   3-month cutoff: ${threeMonthsAgo.toISOString()}`)
  }

  // Filter in JS to avoid DateTime comparison issues
  const records = allRecords.filter(r =>
    r.moduleNumber != null &&
    new Date(r.meetingDate) >= threeMonthsAgo
  )

  console.log(`\n📋 Found ${records.length} theory class records in the last 3 months\n`)

  if (records.length === 0 && allRecords.filter(r => r.moduleNumber != null).length > 0) {
    console.log(`⚠️  There are records with moduleNumber but outside the 3-month window.`)
    console.log(`   Scanning ALL records instead...\n`)
    records.push(...allRecords.filter(r => r.moduleNumber != null))
  }

  let totalPresent = 0
  let totalAbsent = 0
  const absentStudents: Map<string, { name: string; phone: string; missedModules: number[]; dates: string[] }> = new Map()

  for (const record of records) {
    const date = new Date(record.meetingDate).toLocaleDateString('en-CA')
    const module = record.moduleNumber

    let matched: MatchedRecord[] = []
    let absent: AbsentRecord[] = []

    try {
      matched = JSON.parse(record.matchedRecords)
    } catch { /* skip */ }

    try {
      if (record.absentRecords) {
        absent = JSON.parse(record.absentRecords)
      }
    } catch { /* skip */ }

    console.log(`📅 ${date} | Module ${module} | Group: ${record.groupId.slice(0, 12)}...`)
    console.log(`   ✅ Present: ${matched.length} | ❌ Absent: ${absent.length}`)

    totalPresent += matched.length
    totalAbsent += absent.length

    // Track absent students
    for (const a of absent) {
      const key = a.phone || a.name
      const existing = absentStudents.get(key)
      if (existing) {
        existing.missedModules.push(module!)
        existing.dates.push(date)
      } else {
        absentStudents.set(key, {
          name: a.name,
          phone: a.phone,
          missedModules: [module!],
          dates: [date],
        })
      }
    }
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`📊 SUMMARY`)
  console.log(`   Total theory classes: ${records.length}`)
  console.log(`   Total present records: ${totalPresent}`)
  console.log(`   Total absent records: ${totalAbsent}`)
  console.log(`   Unique absent students: ${absentStudents.size}`)

  if (absentStudents.size > 0) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`❌ STUDENTS WITH MISSED THEORY CLASSES:\n`)

    // Sort by number of missed modules (most missed first)
    const sorted = Array.from(absentStudents.entries())
      .sort((a, b) => b[1].missedModules.length - a[1].missedModules.length)

    for (const [, student] of sorted) {
      console.log(`   ${student.name} (${student.phone || 'no phone'})`)
      console.log(`     Missed ${student.missedModules.length} module(s): M${student.missedModules.join(', M')}`)
      console.log(`     Dates: ${student.dates.join(', ')}`)
      console.log()
    }
  }

  console.log(`\n✅ Done. The student-theory API now returns these absences dynamically.`)
  console.log(`   No database updates needed — absent data is read from ZoomAttendance.absentRecords in real-time.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
