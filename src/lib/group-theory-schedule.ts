import { prisma } from '@/lib/db'
import { getWhatsAppState, sendMessageToGroup } from '@/lib/whatsapp/client'

export interface GroupTheoryEvent {
  id: string
  title: string
  notes?: string
  start_dt: string
  end_dt: string
  subcalendar_ids?: number[]
}

const ZOOM_LINK = 'https://us02web.zoom.us/j/4171672829?pwd=ZTlHSEdmTGRYV1QraU5MaThqaC9Rdz09'

export function stripTeamupHtml(value: string): string {
  return (value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .trim()
}

export function isGroupTheoryEvent(event: Pick<GroupTheoryEvent, 'title' | 'notes'>): boolean {
  const notes = stripTeamupHtml(event.notes || '')
  return /(?:^|\n)Theory class(?:\n|$)/i.test(notes) && /(?:^|\n)Group:\s*.+/i.test(notes)
}

export function extractTheoryGroupName(event: Pick<GroupTheoryEvent, 'title' | 'notes'>): string {
  const notes = stripTeamupHtml(event.notes || '')
  const fromNotes = notes.match(/(?:^|\n)Group:\s*(.+?)(?:\n|$)/i)?.[1]?.trim()
  if (fromNotes) return fromNotes

  const pieces = (event.title || '').split(' - ')
  return pieces.length > 1 ? pieces.slice(1).join(' - ').trim() : ''
}

export function extractTheorySequence(event: Pick<GroupTheoryEvent, 'title' | 'notes'>): {
  moduleNumber: number | null
  sessionNumber: number | null
  totalSessions: number | null
  isTruck: boolean
} {
  const notes = stripTeamupHtml(event.notes || '')
  const moduleMatch = notes.match(/(?:^|\n)Module:\s*(\d+)/i) || event.title.match(/^Module\s+(\d+)/i)
  const sessionMatch = notes.match(/(?:^|\n)Session:\s*(\d+)\s+of\s+(\d+)/i)
    || event.title.match(/^Class 1 Theory\s+(\d+)\/(\d+)/i)
  const truck = /Class 1\s*\(Truck\)/i.test(notes) || /^Class 1 Theory/i.test(event.title)
  return {
    moduleNumber: moduleMatch ? Number(moduleMatch[1]) : null,
    sessionNumber: sessionMatch ? Number(sessionMatch[1]) : null,
    totalSessions: sessionMatch ? Number(sessionMatch[2]) : null,
    isTruck: truck,
  }
}

function normalizeGroupName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export async function resolveTheoryGroup(event: Pick<GroupTheoryEvent, 'title' | 'notes'>) {
  if (!isGroupTheoryEvent(event)) return null
  const groupName = extractTheoryGroupName(event)
  if (!groupName) return null
  const wanted = normalizeGroupName(groupName)
  const groups = await prisma.group.findMany({
    select: { id: true, name: true, vehicleType: true },
  })
  return groups.find(group => normalizeGroupName(group.name) === wanted) || null
}

function formatTime12h(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/Toronto',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/Toronto',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function eventDate(iso: string): string {
  return iso.slice(0, 10)
}

function eventLocalMinutes(iso: string): number {
  const time = iso.slice(11, 16)
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function offsetSuffix(iso: string): string {
  return iso.match(/(?:Z|[+-]\d{2}:\d{2})$/)?.[0] || ''
}

function reminderTimeFor(event: GroupTheoryEvent): Date {
  const start = new Date(event.start_dt)
  if (eventLocalMinutes(event.start_dt) < 11 * 60) {
    return new Date(start.getTime() - 2 * 60 * 60 * 1000)
  }
  return new Date(`${eventDate(event.start_dt)}T12:00:00${offsetSuffix(event.start_dt)}`)
}

function reminderCopy(event: GroupTheoryEvent): { message: string; classTime: string; moduleNumber: number | null } {
  const sequence = extractTheorySequence(event)
  const classTime = `${formatTime12h(event.start_dt)} to ${formatTime12h(event.end_dt)}`
  if (sequence.isTruck) {
    const count = sequence.sessionNumber && sequence.totalSessions
      ? ` (${sequence.sessionNumber} of ${sequence.totalSessions})`
      : ''
    return {
      message: `Reminder: Your Class 1 theory class${count} is TODAY, ${classTime}, in person at the school. See you there!`,
      classTime,
      moduleNumber: null,
    }
  }
  const moduleLabel = sequence.moduleNumber ? `Module ${sequence.moduleNumber}` : 'theory'
  return {
    message: `Reminder: Your ${moduleLabel} class is TODAY at ${classTime}! Please make sure to put your full name when joining Zoom. Invite Link: ${ZOOM_LINK} — Password: qazi`,
    classTime,
    moduleNumber: sequence.moduleNumber,
  }
}

export async function cancelGroupTheoryReminders(args: {
  eventId: string
  groupId: string
  dates?: string[]
}): Promise<number> {
  const candidates = await prisma.scheduledMessage.findMany({
    where: {
      status: 'pending',
      isGroupMessage: true,
      groupId: args.groupId,
    },
    select: { id: true, teamupEventId: true, classDateISO: true },
  })
  const dates = new Set((args.dates || []).filter(Boolean))
  const ids = candidates
    .filter(message => message.teamupEventId === args.eventId || (!!message.classDateISO && dates.has(message.classDateISO)))
    .map(message => message.id)
  if (ids.length === 0) return 0
  const result = await prisma.scheduledMessage.updateMany({
    where: { id: { in: ids } },
    data: { status: 'cancelled' },
  })
  return result.count
}

export async function syncGroupTheoryReminder(
  event: GroupTheoryEvent,
  previousStartDt?: string | null,
): Promise<{ matched: boolean; groupId?: string; cancelled: number; scheduled: boolean }> {
  const group = await resolveTheoryGroup(event)
  if (!group) return { matched: false, cancelled: 0, scheduled: false }

  const dates = [eventDate(event.start_dt)]
  if (previousStartDt) dates.push(eventDate(previousStartDt))
  const cancelled = await cancelGroupTheoryReminders({ eventId: String(event.id), groupId: group.id, dates })

  const startsAt = new Date(event.start_dt)
  const reminderAt = reminderTimeFor(event)
  if (startsAt <= new Date() || reminderAt <= new Date()) {
    return { matched: true, groupId: group.id, cancelled, scheduled: false }
  }

  const copy = reminderCopy(event)
  await prisma.scheduledMessage.create({
    data: {
      groupId: group.id,
      teamupEventId: String(event.id),
      message: copy.message,
      scheduledAt: reminderAt,
      memberPhones: JSON.stringify([]),
      moduleNumber: copy.moduleNumber,
      classDateISO: eventDate(event.start_dt),
      classTime: copy.classTime,
      isGroupMessage: true,
      status: 'pending',
    },
  })
  return { matched: true, groupId: group.id, cancelled, scheduled: true }
}

export async function notifyGroupTheoryScheduleChange(event: GroupTheoryEvent): Promise<boolean> {
  const group = await resolveTheoryGroup(event)
  if (!group || !getWhatsAppState().isConnected) return false
  const sequence = extractTheorySequence(event)
  const date = formatDateLong(event.start_dt)
  const time = `${formatTime12h(event.start_dt)} to ${formatTime12h(event.end_dt)}`
  const label = sequence.isTruck
    ? `Class 1 theory${sequence.sessionNumber ? ` session ${sequence.sessionNumber}` : ' class'}`
    : sequence.moduleNumber ? `Module ${sequence.moduleNumber}` : 'theory class'
  const location = sequence.isTruck ? ' It is in person at the school.' : ''
  const message = `Schedule update: Your ${label} has been moved to ${date}, ${time}.${location}`
  await sendMessageToGroup(group.id, message)
  await prisma.messageLog.create({
    data: {
      type: 'class-rescheduled',
      to: group.id,
      toName: group.name,
      message: message.slice(0, 500),
      status: 'sent',
    },
  }).catch(() => {})
  return true
}
