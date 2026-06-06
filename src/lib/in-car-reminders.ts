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
 * Schedule a 3-hour-before reminder for a non-truck class. Idempotent —
 * cancels any existing pending reminder for the same phone+classDateISO
 * before queuing a fresh one. Bails out quietly when:
 *   - the notes don't carry a phone (admin didn't pick a student)
 *   - the class is a truck class (truck reminders run on a different
 *     6-hour-before path attached to /api/scheduling/truck-classes)
 *   - the 3-h-before time is already in the past
 */
export async function scheduleReminderFromEvent(args: {
  startDateIso: string  // "YYYY-MM-DDTHH:MM:SS" possibly with TZ suffix
  notes?: string
  title?: string
  subcalendarId?: number
}) {
  const { startDateIso, notes, title, subcalendarId } = args
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
  const classDateTime = new Date(`${classDateISO}T${timePart}:00`)
  const reminderTime = new Date(classDateTime.getTime() - 3 * 60 * 60 * 1000)
  if (reminderTime <= new Date()) return

  // Cancel any existing pending reminder for this student on this date.
  await cancelInCarReminderFor({ phone, classDateISO })

  // Find the teacher name from the subcalendar if available.
  let teacherStr = ''
  if (subcalendarId) {
    try {
      const teacher = await prisma.teacherPhone.findUnique({ where: { subcalendarId } })
      if (teacher?.name) teacherStr = ` with ${teacher.name.split(' ')[0]}`
    } catch { /* non-fatal */ }
  }

  const moduleStr = title?.split(' - ')[0] || 'class'
  const cleanName = studentName.replace(/\s*#\d+\s*$/, '').trim()
  const reminderMessage = `Reminder: Hi ${cleanName}, your ${moduleStr} class${teacherStr} is in 3 hours (${formatTime12h(timePart)}). See you soon!`

  await prisma.scheduledMessage.create({
    data: {
      groupId: 'in-car-reminders',
      message: reminderMessage,
      scheduledAt: reminderTime,
      memberPhones: JSON.stringify([phone]),
      classDateISO,
      classTime: `${formatTime12h(timePart)}`,
      isGroupMessage: false,
      status: 'pending',
    },
  })
  console.log(`[in-car-reminders] Server-side reminder scheduled for ${phone} at ${reminderTime.toISOString()}`)
}
