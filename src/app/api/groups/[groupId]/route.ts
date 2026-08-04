import { NextRequest, NextResponse } from 'next/server'
import { getGroupParticipants, getGroupInfo, getWhatsAppState, getGroupLastMessage, getPendingInvites } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'
import { syncGroupMembers } from '@/lib/group-sync'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true'
  const state = getWhatsAppState()

  if (!state.isConnected) {
    // Fallback to database when not connected
    const group = await prisma.group.findUnique({
      where: { id: decodedGroupId }
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Get participants from cached GroupMember table
    const cachedMembers = await prisma.groupMember.findMany({
      where: { groupId: decodedGroupId },
      include: { contact: true },
    })

    // If no cached members, fall back to all contacts (legacy behavior)
    const participants = cachedMembers.length > 0
      ? cachedMembers.map(m => ({
          id: m.contactId,
          phone: m.phone,
          name: m.contact.name,
          pushName: m.contact.pushName,
          isAdmin: m.isAdmin,
          isSuperAdmin: m.isSuperAdmin,
        }))
      : (await prisma.contact.findMany({ orderBy: { phone: 'asc' } })).map(c => ({
          id: c.id,
          phone: c.phone,
          name: c.name,
          pushName: c.pushName,
          isAdmin: false,
          isSuperAdmin: false,
        }))

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        participantCount: group.participantCount,
        lastSynced: group.lastSynced,
      },
      participants,
      pendingInvites: await getPendingInvites(decodedGroupId),
      moduleNumber: group.moduleNumber ?? null,
      lastModuleMessageDate: group.lastMessageDate?.toISOString() ?? null,
      fromCache: true,
      isConnected: false
    })
  }

  try {
    // Check if we can use cache (synced within last 15 minutes and not force refresh).
    // Important: we previously called getGroupLastMessage on every cached hit,
    // which routes through Puppeteer/whatsapp-web.js and is the dominant
    // latency on this endpoint. Use the stored group.moduleNumber /
    // lastMessageDate columns instead — they're updated whenever the cache
    // misses or refresh=true.
    if (!forceRefresh) {
      const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)

      if (group && group.lastSynced > fifteenMinAgo) {
        const cachedMembers = await prisma.groupMember.findMany({
          where: { groupId: decodedGroupId },
          include: { contact: true },
        })

        if (cachedMembers.length > 0) {
          return NextResponse.json({
            group: {
              id: group.id,
              name: group.name,
              participantCount: group.participantCount,
              lastSynced: group.lastSynced,
            },
            participants: cachedMembers.map(m => ({
              id: m.contactId,
              phone: m.phone,
              name: m.contact.name,
              pushName: m.contact.pushName,
              isAdmin: m.isAdmin,
              isSuperAdmin: m.isSuperAdmin,
            })),
            pendingInvites: await getPendingInvites(decodedGroupId),
            moduleNumber: group.moduleNumber ?? null,
            lastModuleMessageDate: group.lastMessageDate?.toISOString() ?? null,
            fromCache: true,
            isConnected: true,
          })
        }
      }
    }

    // Fetch fresh data from WhatsApp
    const groupInfo = await getGroupInfo(decodedGroupId)
    const waParticipants = await getGroupParticipants(decodedGroupId)

    // Get module number and last message date
    const lastMessage = await getGroupLastMessage(decodedGroupId)
    const moduleNumber = lastMessage?.moduleNumber || null
    const lastModuleMessageDate = lastMessage?.timestamp || null

    // Sync to DB (group + members)
    await prisma.group.upsert({
      where: { id: decodedGroupId },
      update: {
        name: groupInfo.name,
        participantCount: waParticipants.length,
        moduleNumber: moduleNumber ?? undefined,
        lastMessageDate: lastModuleMessageDate ?? undefined,
        lastSynced: new Date()
      },
      create: {
        id: decodedGroupId,
        name: groupInfo.name,
        participantCount: waParticipants.length,
        moduleNumber: moduleNumber ?? null,
        lastMessageDate: lastModuleMessageDate ?? null,
      }
    })

    // Cache participants (names already enriched by getGroupParticipants).
    // The sync itself has its own don't-nuke-the-roster guard for LID drift.
    await syncGroupMembers(decodedGroupId, waParticipants)

    // DB fallback: if the WA fetch came back empty (typical LID-drift
    // symptom — WhatsApp doesn't return participants for this group under
    // its new identifier scheme) but we have members cached from a prior
    // successful sync, surface the cached roster to the UI. Better a
    // slightly stale roster than "0 students" on the sign-in sheet.
    let participants = waParticipants
    if (waParticipants.length === 0) {
      const cached = await prisma.groupMember.findMany({
        where: { groupId: decodedGroupId },
        include: { contact: true },
      })
      if (cached.length > 0) {
        console.warn(
          `[GET /groups/${decodedGroupId}] WA returned 0 participants; falling back to ${cached.length} cached rows.`
        )
        participants = cached.map(m => ({
          id: m.contactId,
          phone: m.phone,
          name: m.contact?.name || null,
          pushName: m.contact?.pushName || null,
          isAdmin: m.isAdmin,
          isSuperAdmin: m.isSuperAdmin,
        }))
      }
    }

    return NextResponse.json({
      group: {
        id: decodedGroupId,
        name: groupInfo.name,
        participantCount: participants.length,
        lastSynced: new Date(),
      },
      participants,
      // After syncGroupMembers/getGroupParticipants ran, joined invites are
      // already resolved, so this only returns the still-pending ones.
      pendingInvites: await getPendingInvites(decodedGroupId),
      moduleNumber,
      lastModuleMessageDate,
      fromCache: false,
      isConnected: true
    })
  } catch (error) {
    console.error('Get group error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch group' },
      { status: 500 }
    )
  }
}

// PATCH /api/groups/[groupId] — soft edits.
// Body: { action: 'archive' | 'unarchive' }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  try {
    const body = await request.json().catch(() => ({})) as { action?: string }
    if (body.action === 'archive') {
      await prisma.group.update({ where: { id: decodedGroupId }, data: { archivedAt: new Date() } })
      return NextResponse.json({ ok: true, archivedAt: new Date().toISOString() })
    }
    if (body.action === 'unarchive') {
      await prisma.group.update({ where: { id: decodedGroupId }, data: { archivedAt: null } })
      return NextResponse.json({ ok: true, archivedAt: null })
    }
    return NextResponse.json({ error: 'action must be archive or unarchive' }, { status: 400 })
  } catch (error) {
    console.error('[PATCH group]', error)
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 })
  }
}

// DELETE /api/groups/[groupId] — hard-delete the local Group record and all
// its cascaded data (members, attendance sheet, invites, bot pauses on any
// member phones). Does NOT touch the actual WhatsApp group — that stays
// intact on WA, we just stop tracking it locally. To re-track, sync groups
// again from /groups.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  try {
    // Cascades: GroupMember, AttendanceSheet (which cascades AttendanceRecord)
    // are all set up in schema.prisma. GroupInvite has no FK, so clean it
    // manually so it doesn't hang around orphaned.
    await prisma.groupInvite.deleteMany({ where: { groupId: decodedGroupId } }).catch(() => {})
    await prisma.group.delete({ where: { id: decodedGroupId } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[DELETE group]', error)
    return NextResponse.json({ error: 'Failed to delete group' }, { status: 500 })
  }
}
