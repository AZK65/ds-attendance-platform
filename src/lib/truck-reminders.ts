/**
 * WhatsApp reminders for truck practical classes and truck exams.
 *
 * Both go out once, 24 hours before the session start. Start times are
 * America/Toronto wall-clock times (the school calendar). The lead is 24
 * real hours, so a daylight-saving change can move the clock time by an hour.
 *
 * Booked inside that window: if the session has not started, queue the
 * reminder at `now` so the sender delivers it on the next cycle. Say
 * "tomorrow" only when the session falls on the next Toronto calendar day
 * relative to that send time. Same-day sessions say "today".
 *
 * If the session has already started, do not queue a reminder.
 *
 * Pending rows already stored at the old 6-hour lead are moved by
 * `migratePendingTruckReminders`, which runs once on server startup before
 * the sender. In-car (3-hour), theory, and payment reminders are not read.
 */

export const TORONTO_TIME_ZONE = 'America/Toronto'
export const TRUCK_REMINDER_GROUP_ID = 'truck-classes'
export const TRUCK_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000
export const TRUCK_LEGACY_REMINDER_LEAD_MS = 6 * 60 * 60 * 1000
/** Same 2-minute slack the calendar poller uses when matching a reminder. */
export const TRUCK_REMINDER_MATCH_TOLERANCE_MS = 2 * 60 * 1000
/**
 * The scheduled-message sender expires anything more than 2 hours overdue.
 * Keep this aligned with src/app/api/scheduled-messages/process/route.ts.
 */
export const TRUCK_REMINDER_SEND_WINDOW_MS = 2 * 60 * 60 * 1000

export type TruckReminderKind = 'class' | 'exam'
export type TruckReminderSend = 'scheduled' | 'immediate' | 'skipped'

export type TruckReminderPlan = {
  send: TruckReminderSend
  scheduledAt: Date | null
  message: string
  classDateISO: string
  classTime: string
}

export type TruckSession = {
  kind: TruckReminderKind
  date: string
  startTime: string
  endTime: string
  classNumber: string | null
  examLocation: string | null
}

type TorontoParts = {
  date: string
  time: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find(entry => entry.type === type)?.value || ''
}

export function torontoDateAndTime(instant: Date): TorontoParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TORONTO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  let hour = Number(part(parts, 'hour'))
  if (hour === 24) hour = 0
  const minute = Number(part(parts, 'minute'))
  const second = Number(part(parts, 'second'))
  const year = Number(part(parts, 'year'))
  const month = Number(part(parts, 'month'))
  const day = Number(part(parts, 'day'))
  return {
    date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
  }
}

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
}

export function normalizeHHMM(value: string | null | undefined): string | null {
  if (!value) return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

/** Interpret a school wall-clock time as an absolute instant. */
export function torontoWallTimeToUtc(dateISO: string, timeHHMM: string): Date | null {
  const time = normalizeHHMM(timeHHMM)
  if (!isIsoDate(dateISO) || !time) return null
  const [year, month, day] = dateISO.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  let instant = desiredUtc
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = torontoDateAndTime(new Date(instant))
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    const diff = desiredUtc - asUtc
    if (diff === 0) break
    instant += diff
  }
  const resolved = new Date(instant)
  const parts = torontoDateAndTime(resolved)
  if (parts.date !== dateISO || parts.time !== time) return null
  return resolved
}

function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day + days))
  const y = utc.getUTCFullYear()
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatTruckTime(timeHHMM: string): string {
  const time = normalizeHHMM(timeHHMM)
  if (!time) return timeHHMM
  const [hourRaw, minute] = time.split(':').map(Number)
  const ampm = hourRaw >= 12 ? 'PM' : 'AM'
  const hour12 = hourRaw === 0 ? 12 : hourRaw > 12 ? hourRaw - 12 : hourRaw
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`
}

/**
 * Day word for the moment the reminder is sent, not the moment it was booked.
 * "tomorrow" is only the next America/Toronto calendar date.
 */
export function truckReminderDayWord(sendAt: Date, classDateISO: string): 'today' | 'tomorrow' | null {
  const sendDate = torontoDateAndTime(sendAt).date
  if (sendDate === classDateISO) return 'today'
  if (addCalendarDays(sendDate, 1) === classDateISO) return 'tomorrow'
  return null
}

function whenPhrase(sendAt: Date, classDateISO: string): string {
  const word = truckReminderDayWord(sendAt, classDateISO)
  if (word) return word
  const [year, month, day] = classDateISO.split('-').map(Number)
  const label = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return `on ${label}`
}

function classNumberToken(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!/^\d+$/.test(text)) return null
  return text
}

function examPlace(location: string | null | undefined): string {
  const text = (location || '').trim()
  if (!text || /^tbd$/i.test(text)) return ''
  return ` in ${text}`
}

export function buildTruckReminderMessage(input: {
  kind: TruckReminderKind
  classNumber?: string | number | null
  examLocation?: string | null
  startTime: string
  sendAt: Date
  classDateISO: string
}): string {
  const when = whenPhrase(input.sendAt, input.classDateISO)
  const time = formatTruckTime(input.startTime)
  if (input.kind === 'exam') {
    return `Reminder: You have your Truck Exam ${when} at ${time}${examPlace(input.examLocation)}. Good luck! 🍀`
  }
  const number = classNumberToken(input.classNumber)
  const label = number ? `Truck Class ${number}` : 'Truck Class'
  return `Reminder: You have ${label} ${when} at ${time}. See you there!`
}

export function truckTrainingScheduleReminderSentence(counts: { classes: number; exams: number }): string {
  const classes = counts.classes > 0
  const exams = counts.exams > 0
  if (classes && exams) {
    const examWord = counts.exams === 1 ? 'the exam' : 'each exam'
    return `You'll receive a reminder 24 hours before each class and 24 hours before ${examWord}.`
  }
  if (exams) {
    return counts.exams === 1
      ? `You'll receive a reminder 24 hours before the exam.`
      : `You'll receive a reminder 24 hours before each exam.`
  }
  return `You'll receive a reminder 24 hours before each class.`
}

/** Closing line of the truck training schedule WhatsApp, including the line break. */
export function truckTrainingScheduleReminderLine(counts: { classes: number; exams: number }): string {
  return `\n${truckTrainingScheduleReminderSentence(counts)} Good luck! 🚛`
}

function classTimeValue(startTime: string, endTime: string | null | undefined): string {
  const start = normalizeHHMM(startTime) || startTime
  const end = normalizeHHMM(endTime || '') || start
  return `${start}-${end}`
}

export function planTruckReminder(input: {
  kind: TruckReminderKind
  date: string
  startTime: string
  endTime?: string | null
  classNumber?: string | number | null
  examLocation?: string | null
  now?: Date
}): TruckReminderPlan {
  const now = input.now ?? new Date()
  const startTime = normalizeHHMM(input.startTime)
  const classTime = classTimeValue(input.startTime, input.endTime)
  const empty: TruckReminderPlan = {
    send: 'skipped',
    scheduledAt: null,
    message: '',
    classDateISO: input.date,
    classTime,
  }
  if (!startTime || !isIsoDate(input.date)) return empty
  const start = torontoWallTimeToUtc(input.date, startTime)
  if (!start || start.getTime() <= now.getTime()) return empty
  const target = new Date(start.getTime() - TRUCK_REMINDER_LEAD_MS)
  const immediate = target.getTime() <= now.getTime()
  const scheduledAt = immediate ? now : target
  return {
    send: immediate ? 'immediate' : 'scheduled',
    scheduledAt,
    message: buildTruckReminderMessage({
      kind: input.kind,
      classNumber: input.classNumber,
      examLocation: input.examLocation,
      startTime,
      sendAt: scheduledAt,
      classDateISO: input.date,
    }),
    classDateISO: input.date,
    classTime,
  }
}

function plainText(value: string | null | undefined): string {
  return (value || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
}

export function truckSessionFromEvent(input: {
  notes?: string | null
  title?: string | null
  startDt: string
  endDt?: string | null
}): TruckSession | null {
  const notes = plainText(input.notes)
  const title = plainText(input.title)
  const date = input.startDt.slice(0, 10)
  const startTime = normalizeHHMM(input.startDt.slice(11, 16))
  const endTime = normalizeHHMM(input.endDt?.slice(11, 16) || '') || startTime
  if (!isIsoDate(date) || !startTime || !endTime) return null
  const examLocation = notes.match(/Exam:\s*([^\n]+)/i)?.[1]?.trim() || null
  const isExam = /Exam:/i.test(notes) || /^Truck Exam\b/i.test(title.trim())
  const classNumber = notes.match(/ClassNumber:\s*(\d+)/i)?.[1]
    || title.match(/Truck Class\s+(\d+)/i)?.[1]
    || null
  return {
    kind: isExam ? 'exam' : 'class',
    date,
    startTime,
    endTime,
    classNumber: isExam ? null : classNumber,
    examLocation: isExam ? examLocation : null,
  }
}

/**
 * True when a pending truck reminder belongs to this session start.
 * Matches the stored start, the 24-hour lead, or a legacy 6-hour lead that
 * the startup migration has not rewritten yet. An immediate (inside-window)
 * reminder matches on the stored date and start, not on the lead.
 */
export function truckReminderMatchesSession(args: {
  scheduledAt: Date
  classDateISO?: string | null
  classTime?: string | null
  teamupEventId?: string | null
  eventId?: string | null
  startDt: string
}): boolean {
  if (args.eventId && args.teamupEventId && args.teamupEventId === args.eventId) return true
  const date = args.startDt.slice(0, 10)
  const startTime = normalizeHHMM(args.startDt.slice(11, 16))
  if (!startTime || !isIsoDate(date)) return false
  const storedStart = normalizeHHMM(args.classTime || '')
  if (args.classDateISO === date && storedStart === startTime) return true
  const start = torontoWallTimeToUtc(date, startTime)
  if (!start) return false
  const distance = (lead: number) => Math.abs(args.scheduledAt.getTime() - (start.getTime() - lead))
  return distance(TRUCK_REMINDER_LEAD_MS) < TRUCK_REMINDER_MATCH_TOLERANCE_MS
    || distance(TRUCK_LEGACY_REMINDER_LEAD_MS) < TRUCK_REMINDER_MATCH_TOLERANCE_MS
}

/** Legacy rows with no class date: the class falls on this Toronto day if either lead points there. */
export function truckReminderFallsOnTorontoDate(scheduledAt: Date, classDateISO: string): boolean {
  if (!isIsoDate(classDateISO)) return false
  return [TRUCK_LEGACY_REMINDER_LEAD_MS, TRUCK_REMINDER_LEAD_MS].some(lead => {
    return torontoDateAndTime(new Date(scheduledAt.getTime() + lead)).date === classDateISO
  })
}

export type QueuedTruckReminderRow = {
  id: string
  groupId: string
  status: string
  message: string
  scheduledAt: Date
  classDateISO: string | null
  classTime: string | null
  moduleNumber?: number | null
  teamupEventId?: string | null
}

export type TruckReminderMigrationDecision =
  | { action: 'unchanged' }
  | { action: 'cancel'; reason: string }
  | {
      action: 'update'
      scheduledAt: Date
      message: string
      classDateISO: string
      classTime: string
    }

type ResolvedSession = {
  kind: TruckReminderKind
  date: string
  startTime: string
  endTime: string | null
  classNumber: string | null
  examLocation: string | null
}

function displayTimeToHHMM(message: string): string | null {
  const match = message.match(/\bat\s+(\d{1,2}:\d{2}\s*[AP]M)\b/i)
  if (!match) return null
  const time = match[1].trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i)
  if (!time) return null
  let hour = Number(time[1]) % 12
  if (time[3].toUpperCase() === 'PM') hour += 12
  return `${String(hour).padStart(2, '0')}:${time[2]}`
}

function parseExamLocation(message: string): string | null {
  const match = message.match(/\bat\s+\d{1,2}:\d{2}\s*[AP]M\s+in\s+(.+?)\s*\.\s*Good luck/i)
  if (!match) return null
  const text = match[1].trim()
  if (!text || /^tbd$/i.test(text)) return null
  return text
}

function parseStoredRange(classTime: string | null | undefined): { start: string; end: string | null } | null {
  if (!classTime) return null
  const range = classTime.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/)
  if (range) {
    const start = normalizeHHMM(range[1])
    const end = normalizeHHMM(range[2])
    if (start && end) return { start, end }
  }
  const start = normalizeHHMM(classTime)
  return start ? { start, end: null } : null
}

function rememberClassTime(existing: string | null | undefined, start: string, end: string | null): string {
  const stored = parseStoredRange(existing)
  if (existing && stored?.start === start) return existing
  return classTimeValue(start, end)
}

function resolveQueuedSession(row: QueuedTruckReminderRow): ResolvedSession | null {
  const message = row.message || ''
  const kind: TruckReminderKind | null = /Truck Exam/i.test(message)
    ? 'exam'
    : /Truck Class/i.test(message)
      ? 'class'
      : null
  if (!kind) return null
  const classNumber = kind === 'class'
    ? (message.match(/Truck Class\s+(\d+)/i)?.[1] ?? (row.moduleNumber != null ? String(row.moduleNumber) : null))
    : null
  const examLocation = kind === 'exam' ? parseExamLocation(message) : null
  const messageTime = displayTimeToHHMM(message)

  if (isIsoDate(row.classDateISO)) {
    const range = parseStoredRange(row.classTime)
    const startTime = range?.start || messageTime
    if (startTime) {
      return {
        kind,
        date: row.classDateISO,
        startTime,
        endTime: range?.end ?? null,
        classNumber,
        examLocation,
      }
    }
  }

  if (!messageTime) return null
  const scheduledAt = new Date(row.scheduledAt)
  for (const lead of [TRUCK_LEGACY_REMINDER_LEAD_MS, TRUCK_REMINDER_LEAD_MS]) {
    const inferred = torontoDateAndTime(new Date(scheduledAt.getTime() + lead))
    if (inferred.time === messageTime) {
      return {
        kind,
        date: inferred.date,
        startTime: inferred.time,
        endTime: null,
        classNumber,
        examLocation,
      }
    }
  }
  return null
}

/**
 * Decide what to do with one queued truck reminder.
 *
 * - 24-hour mark still ahead: move `scheduledAt` to that instant and refresh wording.
 * - Inside the window, session not started:
 *   - old send time still in the future, or more than 2 hours overdue
 *     (the sender would expire it): set `scheduledAt` to `now` so it sends on deploy.
 *   - already due within the last 2 hours: leave the timestamp alone so a second
 *     pass does not keep pushing it later. Wording is still refreshed.
 * - Session already started: cancel. Do not send.
 * - Not a pending truck reminder, or the session cannot be read safely: leave it.
 */
export function planQueuedTruckReminderMigration(
  row: QueuedTruckReminderRow,
  now: Date,
): TruckReminderMigrationDecision {
  if (row.groupId !== TRUCK_REMINDER_GROUP_ID || row.status !== 'pending') return { action: 'unchanged' }
  const session = resolveQueuedSession(row)
  if (!session) return { action: 'unchanged' }
  const plan = planTruckReminder({
    kind: session.kind,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    classNumber: session.classNumber,
    examLocation: session.examLocation,
    now,
  })
  if (plan.send === 'skipped' || !plan.scheduledAt) {
    return { action: 'cancel', reason: 'Truck class or exam has already started' }
  }
  let scheduledAt = plan.scheduledAt
  if (plan.send === 'immediate') {
    const ageMs = now.getTime() - new Date(row.scheduledAt).getTime()
    if (ageMs >= 0 && ageMs <= TRUCK_REMINDER_SEND_WINDOW_MS) {
      scheduledAt = new Date(row.scheduledAt)
    }
  }
  const classTime = rememberClassTime(row.classTime, session.startTime, session.endTime)
  const sameTime = Math.abs(new Date(row.scheduledAt).getTime() - scheduledAt.getTime()) < 1000
  if (
    sameTime
    && row.message === plan.message
    && row.classDateISO === plan.classDateISO
    && row.classTime === classTime
  ) {
    return { action: 'unchanged' }
  }
  return {
    action: 'update',
    scheduledAt,
    message: plan.message,
    classDateISO: plan.classDateISO,
    classTime,
  }
}

export type TruckReminderQueueStore = {
  findPendingTruckReminders: () => Promise<QueuedTruckReminderRow[]>
  updatePending: (id: string, data: {
    scheduledAt: Date
    message: string
    classDateISO: string
    classTime: string
  }) => Promise<{ count: number }>
  cancelPending: (id: string, reason: string) => Promise<{ count: number }>
}

export type TruckReminderMigrationResult = {
  updated: number
  cancelled: number
  unchanged: number
}

async function prismaQueueStore(): Promise<TruckReminderQueueStore> {
  const { prisma } = await import('@/lib/db')
  return {
    async findPendingTruckReminders() {
      return prisma.scheduledMessage.findMany({
        where: { groupId: TRUCK_REMINDER_GROUP_ID, status: 'pending' },
      })
    },
    async updatePending(id, data) {
      return prisma.scheduledMessage.updateMany({
        where: { id, status: 'pending' },
        data: { ...data, error: null },
      })
    },
    async cancelPending(id, reason) {
      return prisma.scheduledMessage.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'cancelled', error: reason },
      })
    },
  }
}

let migrationInFlight: Promise<TruckReminderMigrationResult> | null = null

/**
 * Idempotent startup/deploy hook. Safe to run on every boot: a row that is
 * already at the 24-hour time with the current wording is left alone.
 * Does not send WhatsApp messages. The sender picks up anything now due.
 */
export function migratePendingTruckReminders(
  now = new Date(),
  store?: TruckReminderQueueStore,
): Promise<TruckReminderMigrationResult> {
  if (!store && migrationInFlight) return migrationInFlight
  const run = applyTruckReminderMigration(now, store).finally(() => {
    if (!store) migrationInFlight = null
  })
  if (!store) migrationInFlight = run
  return run
}

async function applyTruckReminderMigration(
  now: Date,
  store?: TruckReminderQueueStore,
): Promise<TruckReminderMigrationResult> {
  const queue = store ?? await prismaQueueStore()
  const rows = await queue.findPendingTruckReminders()
  const result: TruckReminderMigrationResult = { updated: 0, cancelled: 0, unchanged: 0 }
  for (const row of rows) {
    const decision = planQueuedTruckReminderMigration(row, now)
    if (decision.action === 'unchanged') {
      result.unchanged++
      continue
    }
    if (decision.action === 'cancel') {
      const written = await queue.cancelPending(row.id, decision.reason)
      if (written.count > 0) {
        result.cancelled++
        console.log(`[truck-reminders] cancelled ${row.id}: ${decision.reason}`)
      } else {
        result.unchanged++
      }
      continue
    }
    const written = await queue.updatePending(row.id, {
      scheduledAt: decision.scheduledAt,
      message: decision.message,
      classDateISO: decision.classDateISO,
      classTime: decision.classTime,
    })
    if (written.count > 0) {
      result.updated++
      console.log(`[truck-reminders] moved ${row.id} to ${decision.scheduledAt.toISOString()}`)
    } else {
      result.unchanged++
    }
  }
  console.log(`[truck-reminders] Pending truck queue: ${result.updated} moved, ${result.cancelled} cancelled, ${result.unchanged} already current`)
  return result
}
