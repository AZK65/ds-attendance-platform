import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const BASE_URL = 'https://api.teamup.com'

// GET /api/scheduling/group-today?groupId=<id>
//
// For truck cohorts (Group.vehicleType === 'truck'), returns:
//   {
//     event: { id, title, start_dt, end_dt } | null,   // today's Teamup theory event for this group, if any
//     signatures: [{ studentPhone, studentName, signedAt }],  // signatures already captured against that event
//     members: [{ phone, name }],                       // roster from the WA group
//     signedInLastHours: [{ studentPhone, studentName, signedAt, eventId }],  // fallback: everyone who signed in the last 12h
//                                                       // for this group even if we can't resolve today's event
//   }
//
// The `signedInLastHours` fallback exists because event matching is fuzzy —
// if today's Teamup event's title doesn't cleanly map to the WA group name,
// we can still surface "these students physically signed today" so the roster
// isn't blank.

interface TeamupEvent {
  id: string
  title?: string
  notes?: string
  start_dt: string
  end_dt?: string
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '')

const parseGroupFromNotes = (notes?: string): string => {
  if (!notes) return ''
  const match = stripHtml(notes).match(/Group:\s*(.+)/)
  return match?.[1]?.trim() || ''
}

const eventGroupName = (ev: TeamupEvent): string => {
  const fromNotes = parseGroupFromNotes(ev.notes)
  if (fromNotes) return fromNotes
  // "Module 4 - Cohort A" → "Cohort A"; "Class 1 Truck - Batch Nov" → "Batch Nov"
  const parts = (ev.title || '').split(' - ')
  return parts[1]?.trim() || parts[0]?.trim() || ''
}

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get('groupId') || ''
  if (!groupId) return NextResponse.json({ error: 'groupId required' }, { status: 400 })

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { contact: { select: { name: true, pushName: true } } },
      },
    },
  })
  if (!group) return NextResponse.json({ error: 'group not found' }, { status: 404 })

  const members = group.members.map(m => ({
    phone: m.phone.replace(/\D/g, ''),
    name: m.contact?.name || m.contact?.pushName || m.phone,
  }))

  // Today's window (local Montreal — server is TZ=America/Montreal per compose).
  const now = new Date()
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000)
  const todayIso = now.toISOString().split('T')[0]

  // 1) Try to resolve today's Teamup event for this group.
  let event: { id: string; title: string; start_dt: string; end_dt: string | null } | null = null
  const apiKey = process.env.TEAMUP_API_KEY || ''
  const calendarKey = process.env.TEAMUP_CALENDAR_KEY || ''
  if (apiKey && calendarKey) {
    try {
      const url = `${BASE_URL}/${calendarKey}/events?startDate=${todayIso}&endDate=${todayIso}`
      const res = await fetch(url, { headers: { 'Teamup-Token': apiKey } })
      if (res.ok) {
        const data = await res.json()
        const events: TeamupEvent[] = data.events || []
        const groupNameLower = group.name.trim().toLowerCase()
        // Match either by exact group-name field in notes / title suffix,
        // or by title containing the group name (loose fallback).
        const match =
          events.find(ev => eventGroupName(ev).toLowerCase() === groupNameLower) ||
          events.find(ev => (ev.title || '').toLowerCase().includes(groupNameLower))
        if (match) {
          event = { id: String(match.id), title: match.title || '', start_dt: match.start_dt, end_dt: match.end_dt || null }
        }
      }
    } catch (err) {
      console.warn('[group-today] Teamup lookup failed:', err)
      // Non-fatal — we still return signatures + roster.
    }
  }

  // 2) Signatures for that event, if resolved.
  const eventSignatures = event
    ? await prisma.classSignature.findMany({
        where: { eventId: event.id },
        orderBy: { signedAt: 'desc' },
        select: { studentPhone: true, studentName: true, signedAt: true },
      })
    : []

  // 3) Fallback: any signature by ANY member phone in the last 12 h, so the
  //    roster isn't blank when event-title matching fails or when the event
  //    hasn't been created in Teamup for a walk-in class.
  const memberPhoneSuffixes = new Set(members.map(m => m.phone.slice(-10)))
  const recent = await prisma.classSignature.findMany({
    where: { signedAt: { gte: twelveHoursAgo } },
    orderBy: { signedAt: 'desc' },
    select: { studentPhone: true, studentName: true, signedAt: true, eventId: true },
  })
  const signedInLastHours = recent.filter(s =>
    memberPhoneSuffixes.has(s.studentPhone.replace(/\D/g, '').slice(-10))
  )

  return NextResponse.json({
    group: { id: group.id, name: group.name, vehicleType: group.vehicleType },
    event,
    signatures: eventSignatures,
    signedInLastHours,
    members,
  })
}
