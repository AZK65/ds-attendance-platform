/**
 * Server-side scheduling of 3-hour-before reminders for in-car classes.
 *
 * Why this is server-side: the New Class dialog used to call
 * /api/scheduling/notify only when its `studentPhone` form field was
 * populated. When the field was empty (as it was for Lakshmi Devi's
 * June 6 11 AM class) the reminder silently never queued, even though
 * the notes carried "Phone: …". Parsing the notes the server just
 * persisted closes that gap — any in-car class with a phone in notes
 * will always get a reminder, regardless of client form state.
 *
 * Used by:
 *   - POST /api/scheduling/events      (create)
 *   - PUT  /api/scheduling/events/[id] (update — cancels old + queues new)
 *   - DELETE /api/scheduling/events/[id] (cancel)
 */
import { prisma } from '@/lib/db'

export function stripHtml(s: string): string {
  return (s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
}

export function extractPhone(notes: string | undefined): string | null {
  const m = stripHtml(notes || '').match(/Phone:\s*(\d+)/)
  return m ? m[1] : null
}

export function extractStudentName(notes: string | undefined): string | null {
  const m = stripHtml(notes || '').match(/Student:\s*(.+?)(?:\n|$)/)
  return m ? m[1].trim() : null
}

export function isTruck(notes: string | undefined): boolean {
  return /TruckClass:\s*yes/i.test(stripHtml(notes || ''))
}

export function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function minutesFrom24h(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesFrom12h(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hours = Number(match[1]) % 12
  const minutes = Number(match[2])
  if (match[3].toUpperCase() === 'PM') hours += 12
  return hours * 60 + minutes
}

function reminderRange(classTime: string | null): { start: number; end: number } | null {
  if (!classTime) return null
  const range = classTime.match(/(?:from\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM))\s+to\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i)
  if (range) {
    const start = minutesFrom12h(range[1])
    const end = minutesFrom12h(range[2])
    return start === null || end === null ? null : { start, end }
  }
  const single = minutesFrom12h(classTime)
  return single === null ? null : { start: single, end: single }
}

function suffix10(p: string): string {
  return p.replace(/\D/g, '').slice(-10)
}

/**
 * Cancel any pending in-car reminder matching a (phone, classDate)
 * pair. Used both when an event is deleted and as the first step of
 * rescheduling on update — keeps the queue idempotent.
 */
export async function cancelInCarReminderFor(args: {
  phone: string
  classDateISO: string
}) {
  const { phone, classDateISO } = args
  const phoneSuffix = suffix10(phone)
  const existing = await prisma.scheduledMessage.findMany({
    where: {
      status: 'pending',
      classDateISO,
      isGroupMessage: false,
      groupId: 'in-car-reminders',
    },
  })
  const toCancel = existing.filter(r => {
    try {
      const arr: string[] = JSON.parse(r.memberPhones)
      return arr.some(p => suffix10(p) === phoneSuffix)
    } catch { return false }
  })
  if (toCancel.length > 0) {
    await prisma.scheduledMessage.updateMany({
      where: { id: { in: toCancel.map(r => r.id) } },
      data: { status: 'cancelled' },
    })
  }
  return toCancel.length
}

/**
 * Schedule a 3-hour-before reminder for a non-truck class. Idempotent and
 * combines touching sessions for the same student into one class window.
 * Bails out quietly when:
 *   - the notes don't carry a phone (admin didn't pick a student)
 *   - the class is a truck class (truck reminders run on a different
 *     6-hour-before path attached to /api/scheduling/truck-classes)
 *   - the 3-h-before time is already in the past
 */
export async function scheduleReminderFromEvent(args: {
  startDateIso: string  // "YYYY-MM-DDTHH:MM:SS" possibly with TZ suffix
  endDateIso?: string
  notes?: string
  title?: string
  subcalendarId?: number
  teamupEventId?: string
  teacherName?: string
}) {
  const { startDateIso, endDateIso, notes, title, subcalendarId, teamupEventId, teacherName } = args
  if (!notes) return
  if (isTruck(notes)) return
  const phone = extractPhone(notes)
  if (!phone) return
  const studentName = extractStudentName(notes) || 'Student'

  // startDateIso looks like "2026-06-06T11:00:00" or with -04:00 etc.
  // Use the local interpretation — Teamup events are stored in their
  // calendar's tz which we treat as the school's local tz.
  const classDateISO = startDateIso.split('T')[0]
  const timePart = startDateIso.includes('T') ? startDateIso.split('T')[1].slice(0, 5) : '00:00'
  const endTimePart = endDateIso?.includes('T') ? endDateIso.split('T')[1].slice(0, 5) : timePart
  let mergedStart = minutesFrom24h(timePart)
  let mergedEnd = minutesFrom24h(endTimePart)
  if (mergedEnd < mergedStart) mergedEnd = mergedStart

  // A two-hour booking is commonly represented in Teamup as two adjacent
  // one-hour sessions (for example Session 14 from 11–12 and Session 15 from
  // 12–1). Treat touching/overlapping sessions for the same student as one
  // reminder window. Previously the second session cancelled the first one,
  // which is why an 11–1 booking was announced as only 12–1.
  const pending = await prisma.scheduledMessage.findMany({
    where: {
      status: 'pending',
      classDateISO,
      groupId: 'in-car-reminders',
      isGroupMessage: false,
    },
  })
  const phoneSuffix = suffix10(phone)
  const sameStudent = pending.filter(row => {
    try {
      const phones: string[] = JSON.parse(row.memberPhones)
      return phones.some(value => suffix10(value) === phoneSuffix)
    } catch {
      return false
    }
  })

  const mergedRows: typeof sameStudent = []
  let changed = true
  while (changed) {
    changed = false
    for (const row of sameStudent) {
      if (mergedRows.some(existing => existing.id === row.id)) continue
      const range = reminderRange(row.classTime)
      if (!range) continue
      if (range.start <= mergedEnd && range.end >= mergedStart) {
        mergedRows.push(row)
        mergedStart = Math.min(mergedStart, range.start)
        mergedEnd = Math.max(mergedEnd, range.end)
        changed = true
      }
    }
  }

  const to24h = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
  const mergedStartTime = to24h(mergedStart)
  const mergedEndTime = to24h(mergedEnd)
  const classDateTime = new Date(`${classDateISO}T${mergedStartTime}:00`)
  const reminderTime = new Date(classDateTime.getTime() - 3 * 60 * 60 * 1000)
  if (reminderTime <= new Date()) return

  if (mergedRows.length > 0) {
    await prisma.scheduledMessage.updateMany({
      where: { id: { in: mergedRows.map(row => row.id) } },
      data: { status: 'cancelled' },
    })
  }

  // Find the teacher name from the subcalendar if available.
  let teacherStr = teacherName ? ` with ${teacherName.split(' ')[0]}` : ''
  if (!teacherStr && subcalendarId) {
    try {
      const teacher = await prisma.teacherPhone.findUnique({ where: { subcalendarId } })
      if (teacher?.name) teacherStr = ` with ${teacher.name.split(' ')[0]}`
    } catch { /* non-fatal */ }
  }

  const isCombinedWindow = mergedRows.some(row => {
    const range = reminderRange(row.classTime)
    return range && (range.start !== minutesFrom24h(timePart) || range.end !== minutesFrom24h(endTimePart))
  })
  const moduleStr = isCombinedWindow ? 'in-car' : (title?.split(' - ')[0] || 'in-car')
  const cleanName = studentName.replace(/\s*#\d+\s*$/, '').trim()
  const timeRange = mergedEnd > mergedStart
    ? `${formatTime12h(mergedStartTime)} to ${formatTime12h(mergedEndTime)}`
    : formatTime12h(mergedStartTime)
  const reminderMessage = `Reminder: Hi ${cleanName}, your ${moduleStr} class${teacherStr} is in 3 hours (${timeRange}). See you soon!`

  await prisma.scheduledMessage.create({
    data: {
      groupId: 'in-car-reminders',
      teamupEventId: mergedRows.length === 0 ? teamupEventId : null,
      message: reminderMessage,
      scheduledAt: reminderTime,
      memberPhones: JSON.stringify([phone]),
      classDateISO,
      classTime: `from ${formatTime12h(mergedStartTime)} to ${formatTime12h(mergedEndTime)}`,
      isGroupMessage: false,
      status: 'pending',
    },
  })
  console.log(`[in-car-reminders] Reminder scheduled for ${phone}: ${timeRange} at ${reminderTime.toISOString()}`)
}
