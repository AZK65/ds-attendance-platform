import { NextRequest, NextResponse } from 'next/server'
import { getGroupParticipants, getGroupInfo, getWhatsAppState, getGroupLastMessage } from '@/lib/whatsapp/client'
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
      moduleNumber: group.moduleNumber ?? null,
      lastModuleMessageDate: group.lastMessageDate?.toISOString() ?? null,
      fromCache: true,
      isConnected: false
    })
  }

  try {
    // Check if we can use cache (synced within last 15 minutes and not force refresh)
    if (!forceRefresh) {
      const group = await prisma.group.findUnique({ where: { id: decodedGroupId } })
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)

      if (group && group.lastSynced > fifteenMinAgo) {
        const cachedMembers = await prisma.groupMember.findMany({
          where: { groupId: decodedGroupId },
          include: { contact: true },
        })

        if (cachedMembers.length > 0) {
          // Get module number from last message (this is fast)
          const lastMessage = await getGroupLastMessage(decodedGroupId)

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
            moduleNumber: lastMessage?.moduleNumber || null,
            lastModuleMessageDate: lastMessage?.timestamp || null,
            fromCache: true,
            isConnected: true
          })
        }
      }
    }

    // Fetch fresh data from WhatsApp
    const groupInfo = await getGroupInfo(decodedGroupId)
    const participants = await getGroupParticipants(decodedGroupId)

    // Get module number and last message date
    const lastMessage = await getGroupLastMessage(decodedGroupId)
    const moduleNumber = lastMessage?.moduleNumber || null
    const lastModuleMessageDate = lastMessage?.timestamp || null

    // Sync to DB (group + members)
    await prisma.group.upsert({
      where: { id: decodedGroupId },
      update: {
        name: groupInfo.name,
        participantCount: participants.length,
        moduleNumber: moduleNumber ?? undefined,
        lastMessageDate: lastModuleMessageDate ?? undefined,
        lastSynced: new Date()
      },
      create: {
        id: decodedGroupId,
        name: groupInfo.name,
        participantCount: participants.length,
        moduleNumber: moduleNumber ?? null,
        lastMessageDate: lastModuleMessageDate ?? null,
      }
    })

    // Cache participants
    await syncGroupMembers(decodedGroupId, participants)

    // Merge in names from SQLite Contact table (may have names set by wizard that WhatsApp doesn't know)
    const enrichedParticipants = await Promise.all(
      participants.map(async (p) => {
        if (p.name) return p
        const contact = await prisma.contact.findUnique({ where: { id: p.id } })
        if (contact?.name) {
          return { ...p, name: contact.name }
        }
        return p
      })
    )

    return NextResponse.json({
      group: {
        id: decodedGroupId,
        name: groupInfo.name,
        participantCount: enrichedParticipants.length,
        lastSynced: new Date(),
      },
      participants: enrichedParticipants,
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
