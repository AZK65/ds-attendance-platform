import { NextRequest, NextResponse } from 'next/server'
import { getWhatsAppState, getGroupsWithDetails, getGroupParticipants } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'
import { syncGroupMembers } from '@/lib/group-sync'

interface ParticipantWithGroup {
  id: string
  phone: string
  name: string | null
  pushName: string | null
  groupId: string
  groupName: string
  moduleNumber: number | null
  vehicleType: string
  lastMessageDate: string | null
}

// Pending invites across all groups (invited / saved, but not joined yet),
// shaped for the students page. Applies the same group filter as members.
async function pendingInvitesWithGroups(courseOnly: boolean) {
  const invites = await prisma.groupInvite.findMany({ where: { status: 'pending' } })
  if (invites.length === 0) return []

  const groupIds = [...new Set(invites.map(i => i.groupId))]
  const groups = await prisma.group.findMany({ where: { id: { in: groupIds } } })
  const groupById = new Map(groups.map(g => [g.id, g]))

  // Enrich names from the Contact table (ids exist with/without +1 prefix)
  const contactIds = invites.flatMap(i => {
    const ids = [`${i.phone}@c.us`]
    if (i.phone.length === 11 && i.phone.startsWith('1')) ids.push(`${i.phone.slice(1)}@c.us`)
    if (i.phone.length === 10) ids.push(`1${i.phone}@c.us`)
    return ids
  })
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, pushName: true },
  })
  const nameByPhone = new Map<string, string>()
  for (const c of contacts) {
    const digits = c.id.replace('@c.us', '')
    const name = c.name || c.pushName
    if (name) {
      nameByPhone.set(digits, name)
      nameByPhone.set(digits.replace(/^1/, ''), name)
    }
  }

  return invites
    .filter(i => {
      const g = groupById.get(i.groupId)
      if (!g || !g.name || g.name === 'Status Broadcast') return false
      if (courseOnly && !g.moduleNumber && g.vehicleType !== 'truck') return false
      return true
    })
    .map(i => {
      const g = groupById.get(i.groupId)!
      return {
        phone: i.phone,
        name: i.name || nameByPhone.get(i.phone) || nameByPhone.get(i.phone.replace(/^1/, '')) || null,
        groupId: i.groupId,
        groupName: g.name,
        moduleNumber: g.moduleNumber ?? null,
        vehicleType: g.vehicleType,
        invitedAt: i.invitedAt.toISOString(),
      }
    })
}

export async function GET(request: NextRequest) {
  const courseOnly = request.nextUrl.searchParams.get('courseOnly') === 'true'
  const state = getWhatsAppState()

  // Always try cached data first (instant response)
  try {
    const cachedMembers = await prisma.groupMember.findMany({
      include: {
        contact: true,
        group: true,
      },
    })

    if (cachedMembers.length > 0) {
      const participants: ParticipantWithGroup[] = cachedMembers
        .filter(m => {
          if (!m.group.name || m.group.name === 'Status Broadcast') return false
          // Course groups = car cohorts (have a module number) OR truck
          // groups (intake-style, no modules). Keep both; drop only the
          // non-course groups when courseOnly is set.
          if (courseOnly && !m.group.moduleNumber && m.group.vehicleType !== 'truck') return false
          return true
        })
        .map(m => ({
          id: m.contactId,
          phone: m.phone,
          name: m.contact.name,
          pushName: m.contact.pushName,
          groupId: m.groupId,
          groupName: m.group.name,
          moduleNumber: m.group.moduleNumber ?? null,
          vehicleType: m.group.vehicleType,
          lastMessageDate: m.group.lastMessageDate?.toISOString() ?? null,
        }))

      // Background sync from WhatsApp (non-blocking — doesn't delay response)
      if (state.isConnected) {
        syncFromWhatsApp(courseOnly).catch(() => {})
      }

      return NextResponse.json({
        participants,
        pendingInvites: await pendingInvitesWithGroups(courseOnly),
        isConnected: state.isConnected,
        fromCache: true,
      })
    }
  } catch (error) {
    console.error('Cache read error:', error)
  }

  // No cached data — must fetch live from WhatsApp
  if (state.isConnected) {
    try {
      const participants = await fetchLiveParticipants(courseOnly)
      return NextResponse.json({
        participants,
        pendingInvites: await pendingInvitesWithGroups(courseOnly),
        isConnected: true,
        fromCache: false,
      })
    } catch (error) {
      console.error('Get all participants error:', error)
    }
  }

  // Final fallback: use attendance records
  try {
    const records = await prisma.attendanceRecord.findMany({
      select: {
        contactId: true,
        contact: { select: { id: true, phone: true, name: true, pushName: true } },
        attendanceSheet: {
          select: { group: { select: { id: true, name: true, moduleNumber: true, vehicleType: true, lastMessageDate: true } } }
        },
      },
      distinct: ['contactId'],
      orderBy: { date: 'desc' },
    })

    const participants: ParticipantWithGroup[] = records.map(r => ({
      id: r.contact.id,
      phone: r.contact.phone,
      name: r.contact.name,
      pushName: r.contact.pushName,
      groupId: r.attendanceSheet.group.id,
      groupName: r.attendanceSheet.group.name,
      moduleNumber: r.attendanceSheet.group.moduleNumber ?? null,
      vehicleType: r.attendanceSheet.group.vehicleType,
      lastMessageDate: r.attendanceSheet.group.lastMessageDate?.toISOString() ?? null,
    }))

    return NextResponse.json({ participants, isConnected: false })
  } catch (error) {
    console.error('DB fallback participants error:', error)
    return NextResponse.json({ participants: [], isConnected: state.isConnected })
  }
}

// Background sync — fetches live data from WhatsApp and updates SQLite
async function syncFromWhatsApp(courseOnly: boolean) {
  const groups = await getGroupsWithDetails()

  const validGroups = courseOnly
    ? groups.filter(g => g.name && g.name !== 'Status Broadcast' && g.moduleNumber)
    : groups.filter(g => g.name && g.name !== 'Status Broadcast')

  const BATCH_SIZE = 5
  for (let i = 0; i < validGroups.length; i += BATCH_SIZE) {
    const batch = validGroups.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(
      batch.map(async (group) => {
        const participants = await getGroupParticipants(group.id)
        await syncGroupMembers(group.id, participants).catch(() => {})
      })
    )
  }

  // Persist module numbers
  for (const group of validGroups) {
    if (group.moduleNumber) {
      prisma.group.update({
        where: { id: group.id },
        data: {
          moduleNumber: group.moduleNumber,
          lastMessageDate: group.lastMessageDate ?? undefined,
          lastMessagePreview: group.lastMessagePreview ?? undefined,
        }
      }).catch(() => {})
    }
  }
}

// Fetch live participants (used only when no cache exists)
async function fetchLiveParticipants(courseOnly: boolean): Promise<ParticipantWithGroup[]> {
  const groups = await getGroupsWithDetails()

  const validGroups = courseOnly
    ? groups.filter(g => g.name && g.name !== 'Status Broadcast' && g.moduleNumber)
    : groups.filter(g => g.name && g.name !== 'Status Broadcast')

  const BATCH_SIZE = 5
  const allParticipants: ParticipantWithGroup[] = []

  for (let i = 0; i < validGroups.length; i += BATCH_SIZE) {
    const batch = validGroups.slice(i, i + BATCH_SIZE)

    const batchResults = await Promise.allSettled(
      batch.map(async (group) => {
        const participants = await getGroupParticipants(group.id)
        syncGroupMembers(group.id, participants).catch(() => {})

        return participants.map(p => ({
          id: p.id,
          phone: p.phone,
          name: p.name || null,
          pushName: p.pushName || null,
          groupId: group.id,
          groupName: group.name!,
          moduleNumber: group.moduleNumber || null,
          // Live WhatsApp data carries no vehicleType (DB-only field); the
          // cached path fills it in correctly on the next sync.
          vehicleType: 'car',
          lastMessageDate: group.lastMessageDate ? group.lastMessageDate.toISOString() : null
        }))
      })
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        allParticipants.push(...result.value)
      }
    }
  }

  // Persist module numbers
  for (const group of validGroups) {
    if (group.moduleNumber) {
      prisma.group.update({
        where: { id: group.id },
        data: {
          moduleNumber: group.moduleNumber,
          lastMessageDate: group.lastMessageDate ?? undefined,
          lastMessagePreview: group.lastMessagePreview ?? undefined,
        }
      }).catch(() => {})
    }
  }

  return allParticipants
}
