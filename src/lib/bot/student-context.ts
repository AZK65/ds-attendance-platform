import { prisma } from '@/lib/db'

const TEAMUP_BASE = 'https://api.teamup.com'
const BOOKING_BASE = 'https://qazidrivingschool.ca/book'

type TeamupEvent = {
  id: string
  title?: string
  notes?: string
  start_dt: string
  end_dt?: string
}

export interface BotStudentContext {
  studentId: string | null
  prompt: string
}

const digits = (value?: string | null) => (value || '').replace(/\D/g, '')
const lastTen = (value?: string | null) => digits(value).slice(-10)
const cleanName = (value: string) => value.replace(/\s*#\s*\d+\s*$/i, '').trim()

function phoneMatches(stored: string | null | undefined, phone: string) {
  const a = lastTen(stored)
  const b = lastTen(phone)
  return a.length >= 7 && b.length >= 7 && a === b
}

async function findStudent(phone: string) {
  const suffix = lastTen(phone)
  if (suffix.length < 7) return null

  let candidates = await prisma.student.findMany({
    where: {
      OR: [
        { phone: { contains: suffix } },
        { phoneAlt: { contains: suffix } },
        { phone: { contains: suffix.slice(-7) } },
        { phoneAlt: { contains: suffix.slice(-7) } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  // Formatted numbers may not contain a contiguous suffix, so normalize a
  // recent fallback set in JavaScript.
  if (!candidates.some(s => phoneMatches(s.phone, phone) || phoneMatches(s.phoneAlt, phone))) {
    candidates = await prisma.student.findMany({ orderBy: { updatedAt: 'desc' }, take: 1000 })
  }

  const matches = candidates.filter(s => phoneMatches(s.phone, phone) || phoneMatches(s.phoneAlt, phone))
  if (matches.length === 0) return null

  const dateFields = [
    ...Array.from({ length: 12 }, (_, i) => `module${i + 1}Date`),
    ...Array.from({ length: 15 }, (_, i) => `sortie${i + 1}Date`),
  ] as const
  const score = (student: (typeof matches)[number]) =>
    (student.licenceNumber ? 100 : 0) +
    dateFields.reduce((count, field) => count + (student[field as keyof typeof student] ? 1 : 0), 0)

  return matches.reduce((best, student) => score(student) > score(best) ? student : best, matches[0])
}

async function findGroups(phone: string) {
  const suffix = lastTen(phone)
  if (suffix.length < 7) return []
  const candidates = await prisma.groupMember.findMany({
    where: { phone: { contains: suffix.slice(-7) } },
    include: { group: true },
    take: 100,
  })
  return candidates
    .filter(member => phoneMatches(member.phone, phone))
    .map(member => member.group)
    .filter((group, index, all) => all.findIndex(item => item.id === group.id) === index)
}

async function fetchTeamup(query: string, startDate: string, endDate: string): Promise<TeamupEvent[]> {
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (!apiKey || !calendarKey || !query) return []
  const url = `${TEAMUP_BASE}/${calendarKey}/events?startDate=${startDate}&endDate=${endDate}&query=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { 'Teamup-Token': apiKey } })
  if (!response.ok) return []
  const data = await response.json() as { events?: TeamupEvent[] }
  return data.events || []
}

function eventMatchesStudent(event: TeamupEvent, phone: string, name: string, groupNames: string[]) {
  const title = event.title || ''
  const notes = event.notes || ''
  const text = `${title} ${notes}`
  const eventDigits = digits(text)
  const phoneSuffix = lastTen(phone)
  if (phoneSuffix && eventDigits.includes(phoneSuffix)) return true

  const lowerText = text.toLowerCase()
  const normalizedName = cleanName(name).toLowerCase()
  if (normalizedName && lowerText.includes(normalizedName)) return true
  const nameParts = normalizedName.split(/\s+/).filter(part => part.length >= 2)
  if (nameParts.length >= 2 && nameParts.every(part => lowerText.includes(part))) return true

  // A group name is also appended to some individual road-class titles.
  // Only let group membership match actual theory cohort events; otherwise
  // one student could see classmates' individual appointments.
  const isTheoryGroupEvent = /theory class/i.test(notes) ||
    /^module\s+\d+\s*-/i.test(title) ||
    /^class\s*1\s+theory/i.test(title)
  if (!isTheoryGroupEvent) return false

  return groupNames.some(group => {
    const normalized = group.trim().toLowerCase()
    return normalized.length > 0 && lowerText.includes(normalized)
  })
}

function formatEvent(event: TeamupEvent) {
  const start = new Date(event.start_dt)
  const end = event.end_dt ? new Date(event.end_dt) : null
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(start)
  const endTime = end
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }).format(end)
    : ''
  return `${event.title || 'Class'} — ${date}${endTime ? ` to ${endTime}` : ''}`
}

export async function buildBotStudentContext(phone: string): Promise<BotStudentContext | null> {
  const student = await findStudent(phone)
  const groups = await findGroups(phone)
  if (!student && groups.length === 0) return null

  const name = cleanName(student?.name || '')
  const groupNames = groups.map(group => group.name)
  const vehicleType = groups.some(group => group.vehicleType === 'truck') ? 'truck' : 'car'

  const now = new Date()
  const end = new Date(now)
  end.setMonth(end.getMonth() + 6)
  const dateOnly = (date: Date) => date.toISOString().split('T')[0]
  const queries = new Set<string>()
  if (lastTen(phone)) {
    queries.add(lastTen(phone))
    queries.add(lastTen(phone).slice(-7))
  }
  if (name) queries.add(name)
  groupNames.forEach(group => queries.add(group))

  const results = await Promise.all(
    Array.from(queries).map(query => fetchTeamup(query, dateOnly(now), dateOnly(end)).catch(() => []))
  )
  const eventMap = new Map<string, TeamupEvent>()
  results.flat().forEach(event => eventMap.set(event.id, event))
  const upcoming = Array.from(eventMap.values())
    .filter(event => new Date(event.start_dt).getTime() >= now.getTime())
    .filter(event => eventMatchesStudent(event, phone, name, groupNames))
    .sort((a, b) => new Date(a.start_dt).getTime() - new Date(b.start_dt).getTime())
    .slice(0, 8)

  const modulesCompleted = student
    ? Array.from({ length: 12 }, (_, i) => student[`module${i + 1}Date` as keyof typeof student]).filter(Boolean).length
    : 0
  const roadCompleted = student
    ? Array.from({ length: 15 }, (_, i) => student[`sortie${i + 1}Date` as keyof typeof student]).filter(Boolean).length
    : 0
  const bookingUrl = new URL(BOOKING_BASE)
  if (name) bookingUrl.searchParams.set('name', name)
  bookingUrl.searchParams.set('phone', lastTen(phone))

  const lines = [
    '# VERIFIED STUDENT CONTEXT (live, private to this WhatsApp sender)',
    `Matched student: ${name || 'group member'}${student ? ` (student ID ${student.id})` : ''}`,
    `Program: ${vehicleType === 'truck' ? 'Class 1 truck' : 'Class 5 car'}`,
    groupNames.length ? `Current group(s): ${groupNames.join(', ')}` : 'Current group: none found',
    student && vehicleType === 'car' ? `Recorded progress: ${modulesCompleted}/12 theory modules and ${roadCompleted}/15 road classes completed.` : '',
    upcoming.length ? `Upcoming scheduled classes:\n${upcoming.map((event, i) => `${i + 1}. ${formatEvent(event)}`).join('\n')}` : 'Upcoming scheduled classes: none found in Teamup for the next 6 months.',
    vehicleType === 'car'
      ? `Secure road-class booking page for this student: ${bookingUrl.toString()}`
      : 'Truck practical classes must currently be arranged with the school; do not send the Class 5 booking page.',
    '',
    'Use this verified context only for this sender. You may answer their next-class, upcoming-schedule, group, and progress questions directly.',
    'For Class 5 road-class booking, send the secure booking page link. Never claim a class is booked until the student completes that page.',
    'Do not expose internal student IDs, raw database wording, or another student’s information.',
  ].filter(Boolean)

  return { studentId: student?.id || null, prompt: lines.join('\n') }
}
