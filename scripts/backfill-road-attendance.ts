/**
 * Road class attendance report: pulls past Teamup road class events from
 * the last 3 months, cross-references with ClassAttendance records,
 * and prints a summary of who was present vs absent.
 *
 * No record in ClassAttendance = student was absent (auto absent).
 * Record with present=true = student was present.
 *
 * Run on server:
 *   docker compose cp scripts/backfill-road-attendance.ts app:/app/scripts/
 *   docker compose exec app npx tsx scripts/backfill-road-attendance.ts
 *
 * Requires: TEAMUP_API_KEY, TEAMUP_CALENDAR_KEY in env
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
  subcalendar_ids: number[]
}

function stripHtml(text: string): string {
  return (text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim()
}

function isTruckClass(event: TeamupEvent): boolean {
  return /TruckClass:\s*yes/i.test(stripHtml(event.notes || ''))
}

function extractStudentInfo(event: TeamupEvent): { name: string; phone: string } | null {
  const notes = stripHtml(event.notes || '')
  const nameMatch = notes.match(/Student:\s*(.+?)(?:\n|$)/)
  const phoneMatch = notes.match(/Phone:\s*(\d+)/)
  if (nameMatch) {
    return {
      name: nameMatch[1].trim(),
      phone: phoneMatch ? phoneMatch[1] : '',
    }
  }
  return null
}

function isExam(event: TeamupEvent): boolean {
  const notes = stripHtml(event.notes || '')
  return /TruckClass:\s*yes/i.test(notes) && /Exam:\s*.+/i.test(notes)
}

function extractClassNumber(event: TeamupEvent): string {
  const notes = stripHtml(event.notes || '')
  const match = notes.match(/ClassNumber:\s*(\d+)/)
  return match ? match[1] : '?'
}

async function getNasarSubcalendarId(): Promise<number | null> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (!apiKey || !calendarKey) return null

  const res = await fetch(`${BASE_URL}/${calendarKey}/subcalendars`, {
    headers: { 'Teamup-Token': apiKey },
  })
  if (!res.ok) return null

  const data = await res.json()
  const subcalendars = data.subcalendars || []
  const nasar = subcalendars.find(
    (s: { name: string; active: boolean }) =>
      s.active && s.name.toLowerCase().includes('nasar')
  )
  return nasar ? nasar.id : null
}

async function fetchTeamupEvents(
  startDate: string,
  endDate: string,
  subcalendarId: number
): Promise<TeamupEvent[]> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''

  const url = `${BASE_URL}/${calendarKey}/events?startDate=${startDate}&endDate=${endDate}&subcalendarId[]=${subcalendarId}`
  const res = await fetch(url, {
    headers: { 'Teamup-Token': apiKey },
  })

  if (!res.ok) {
    console.error(`Failed to fetch events: ${res.status} ${await res.text()}`)
    return []
  }

  const data = await res.json()
  return data.events || []
}

async function main() {
  console.log('\n📊 ROAD CLASS ATTENDANCE REPORT (Last 3 Months)')
  console.log('═'.repeat(60))
  console.log('ℹ️  No ClassAttendance record = ABSENT (auto absent)')
  console.log('ℹ️  ClassAttendance present=true = PRESENT')

  const apiKey = process.env.TEAMUP_API_KEY
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY

  if (!apiKey || !calendarKey) {
    console.error('❌ TEAMUP_API_KEY and TEAMUP_CALENDAR_KEY are required')
    return
  }

  // 1. Find Nasar's subcalendar (road classes)
  console.log('\n🔍 Looking up Nasar subcalendar...')
  const nasarId = await getNasarSubcalendarId()
  if (!nasarId) {
    console.error('❌ Could not find Nasar subcalendar')
    return
  }
  console.log(`   Found subcalendar ID: ${nasarId}`)

  // 2. Calculate date range (last 3 months)
  const now = new Date()
  const threeMonthsAgo = new Date(now)
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  const startDate = threeMonthsAgo.toISOString().split('T')[0]
  const endDate = now.toISOString().split('T')[0]

  console.log(`\n📅 Fetching events from ${startDate} to ${endDate}...`)

  // 3. Fetch all events from Nasar's subcalendar
  const allEvents = await fetchTeamupEvents(startDate, endDate, nasarId)
  console.log(`   Found ${allEvents.length} total events on Nasar's calendar`)

  // 4. Filter to truck class events only
  const truckEvents = allEvents.filter(e => isTruckClass(e))
  console.log(`   ${truckEvents.length} are truck/road class events`)

  // 5. Filter to past events only
  const pastEvents = truckEvents.filter(e => new Date(e.start_dt) < now)
  console.log(`   ${pastEvents.length} are in the past`)

  if (pastEvents.length === 0) {
    console.log('\n❌ No past road class events found.')
    return
  }

  // 6. Check ClassAttendance records for all events
  const eventIds = pastEvents.map(e => String(e.id))
  const attendanceRecords = await prisma.classAttendance.findMany({
    where: { eventId: { in: eventIds } },
  })
  const presentSet = new Set(
    attendanceRecords.filter(r => r.present).map(r => r.eventId)
  )

  // 7. Build student attendance data
  interface StudentAttendance {
    name: string
    phone: string
    classes: Array<{
      date: string
      classNumber: string
      eventId: string
      present: boolean
      isExam: boolean
    }>
  }

  const studentMap = new Map<string, StudentAttendance>()

  for (const event of pastEvents) {
    const student = extractStudentInfo(event)
    if (!student) continue

    const key = student.phone || student.name
    if (!studentMap.has(key)) {
      studentMap.set(key, {
        name: student.name,
        phone: student.phone,
        classes: [],
      })
    }

    studentMap.get(key)!.classes.push({
      date: new Date(event.start_dt).toLocaleDateString('en-CA'),
      classNumber: extractClassNumber(event),
      eventId: String(event.id),
      present: presentSet.has(String(event.id)),
      isExam: isExam(event),
    })
  }

  // Sort classes by date for each student
  for (const student of studentMap.values()) {
    student.classes.sort((a, b) => a.date.localeCompare(b.date))
  }

  // 8. Print per-student report
  const sortedStudents = Array.from(studentMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  let totalPresent = 0
  let totalAbsent = 0
  const studentsWithAbsences: string[] = []

  console.log(`\n${'═'.repeat(60)}`)
  console.log('📋 PER-STUDENT BREAKDOWN')
  console.log(`${'═'.repeat(60)}`)

  for (const student of sortedStudents) {
    const present = student.classes.filter(c => c.present).length
    const absent = student.classes.filter(c => !c.present).length
    totalPresent += present
    totalAbsent += absent

    const hasAbsences = absent > 0
    const icon = hasAbsences ? '🔴' : '🟢'

    console.log(`\n${icon} ${student.name} (${student.phone || 'no phone'})`)
    console.log(`   Present: ${present}/${student.classes.length} | Absent: ${absent}`)

    if (hasAbsences) {
      studentsWithAbsences.push(student.name)
    }

    for (const cls of student.classes) {
      const statusIcon = cls.present ? '✅' : '❌'
      const label = cls.isExam ? 'EXAM' : `Class ${cls.classNumber}`
      console.log(`   ${statusIcon} ${cls.date} — ${label}`)
    }
  }

  // 9. Summary
  console.log(`\n${'═'.repeat(60)}`)
  console.log('📊 SUMMARY')
  console.log(`${'═'.repeat(60)}`)
  console.log(`   Total students: ${sortedStudents.length}`)
  console.log(`   Total road class events: ${pastEvents.length}`)
  console.log(`   Total present: ${totalPresent}`)
  console.log(`   Total absent: ${totalAbsent}`)
  console.log(`   Attendance rate: ${pastEvents.length > 0 ? ((totalPresent / (totalPresent + totalAbsent)) * 100).toFixed(1) : 0}%`)

  if (studentsWithAbsences.length > 0) {
    console.log(`\n🔴 Students with absences (${studentsWithAbsences.length}):`)
    for (const name of studentsWithAbsences) {
      console.log(`   - ${name}`)
    }
  }

  // 10. Also show ClassAttendance record count
  const totalRecords = await prisma.classAttendance.count()
  console.log(`\n   Total ClassAttendance records in DB: ${totalRecords}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
