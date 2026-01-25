import { NextRequest, NextResponse } from 'next/server'
import { getGroupParticipants, getGroupInfo, getWhatsAppState, getGroupLastMessage } from '@/lib/whatsapp/client'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params
  const decodedGroupId = decodeURIComponent(groupId)
  const state = getWhatsAppState()

  if (!state.isConnected) {
    // Fallback to database when not connected
    const group = await prisma.group.findUnique({
      where: { id: decodedGroupId }
    })

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Get participants from database
    const contacts = await prisma.contact.findMany({
      orderBy: { phone: 'asc' }
    })

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        participantCount: group.participantCount
      },
      participants: contacts.map(c => ({
        id: c.id,
        phone: c.phone,
        name: c.name,
        pushName: c.pushName,
        isAdmin: false,
        isSuperAdmin: false
      })),
      moduleNumber: null,
      fromCache: true,
      isConnected: false
    })
  }

  try {
    // Get group info and participants from WhatsApp
    const groupInfo = await getGroupInfo(decodedGroupId)
    const participants = await getGroupParticipants(decodedGroupId)

    // Get module number and last message date from last module message
    const lastMessage = await getGroupLastMessage(decodedGroupId)
    const moduleNumber = lastMessage?.moduleNumber || null
    const lastModuleMessageDate = lastMessage?.timestamp || null

    // Update group in database
    await prisma.group.upsert({
      where: { id: decodedGroupId },
      update: {
        name: groupInfo.name,
        participantCount: participants.length,
        lastSynced: new Date()
      },
      create: {
        id: decodedGroupId,
        name: groupInfo.name,
        participantCount: participants.length
      }
    })

    return NextResponse.json({
      group: {
        id: decodedGroupId,
        name: groupInfo.name,
        participantCount: participants.length
      },
      participants,
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
